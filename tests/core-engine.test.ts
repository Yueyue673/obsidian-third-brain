import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { analyzeSource, buildIndex, emptyFacets, searchFragments, prepareSource, vocabularyOf } from '../src/core';
import type { Fragment, IndexState, ModelPort, ModelRequest, RunOptions, RunProgress } from '../src/core';

const NOW = '2026-01-02T03:04:05.000Z', LATER = '2026-01-03T03:04:05.000Z';
function source(path: string,raw: string) { return prepareSource(path,raw,createHash('sha256').update(raw).digest('hex'),createHash('sha256').update(path).digest('hex')); }
const options = (previous: IndexState | null = null): RunOptions => ({ mode:'local-excerpts',cloudConsent:false,signature:'fixture-generation-v1',previous,now:NOW });
function extraction(text: string, changes: Record<string,unknown> = {}) { return { version:1,decision:'extract',fragments:[{ title:'Selected exact excerpt',summary:text,kind:'excerpt',topics:[],concepts:[],mechanisms:[],atmosphere:[],quotes:[text],conditions:[],caveats:[],...changes }] }; }
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }

async function fixtureFragments(): Promise<Fragment[]> {
  const notes = [
    source('synthetic/start.md','---\ntopics: [任务启动]\nmechanisms: [减少摩擦]\n---\n把第一步缩小，降低开始任务的摩擦。'),
    source('synthetic/practice.md','---\ntopics: [learning]\nconcepts: [retrieval]\nmechanisms: [feedback loop]\n---\nSpaced retrieval practice reveals what needs another attempt.'),
    source('synthetic/irrigation.md','---\ntopics: [garden]\nmechanisms: [feedback loop]\n---\nIrrigation sensors adjust moisture thresholds after each measurement.'),
    source('synthetic/music.md','---\natmosphere: [calm]\n---\nA quiet melody accompanies a still evening.'),
  ];
  const state = await buildIndex(notes,options()); return Object.values(state.fragments);
}

describe('source-grounded lexical and separate facet retrieval', () => {
  it('retrieves a vague Chinese idea through bigrams without requiring tags', async () => {
    const fragments = await fixtureFragments(), results = searchFragments(fragments,'怎么让任务更容易开始',{ breadth:'low' });
    expect(results[0].fragment.evidence[0].relativePath).toBe('synthetic/start.md'); expect(results[0].reasons.some(reason => reason.kind === 'content')).toBe(true);
    expect(results.every(result => result.score > 0)).toBe(true); expect(results[0].reasons.flatMap(reason => reason.quotes)).toContain(results[0].fragment.summary);
  });
  it('retrieves English words with TF-IDF without scores based on filenames', async () => {
    const fragments = await fixtureFragments();
    expect(searchFragments(fragments,'retrieval practice',{ breadth:'low' })[0].fragment.evidence[0].relativePath).toBe('synthetic/practice.md');
    expect(searchFragments(fragments,'irrigation sensors',{ breadth:'low' })[0].fragment.evidence[0].relativePath).toBe('synthetic/irrigation.md');
    expect(searchFragments(fragments,'start.md',{ breadth:'high' })).toEqual([]);
  });
  it.each(['','  ','???','the and of to','我想知道这个事情','unrelated astrophysical quasar','不存在的量子香蕉'])('does not fill results with no-signal or unrelated junk: %j', async query => {
    expect(searchFragments(await fixtureFragments(),query,{ breadth:'high',limit:100 })).toEqual([]);
  });
  it('keeps topic/concept/facet channels independently explainable', async () => {
    const fragments = await fixtureFragments();
    const topic = searchFragments(fragments,'',{ breadth:'low',facets:{ topics:['learning'] } });
    expect(topic).toHaveLength(1); expect(topic[0].reasons.map(reason => reason.kind)).toEqual(['topic']);
    const concept = searchFragments(fragments,'',{ breadth:'low',facets:{ concepts:['retrieval'] } });
    expect(concept).toHaveLength(1); expect(concept[0].reasons.map(reason => reason.kind)).toEqual(['concept']);
    const mechanism = searchFragments(fragments,'',{ breadth:'medium',facets:{ mechanisms:['feedback loop'] } });
    expect(mechanism).toHaveLength(2); expect(mechanism.every(item => item.reasons.some(reason => reason.kind === 'mechanism'))).toBe(true);
  });
  it('breadth widens candidate scope but never removes evidence or uncertainty', async () => {
    const fragments = await fixtureFragments(), facets = { topics:['learning'],mechanisms:['feedback loop'] };
    const low = searchFragments(fragments,'',{ breadth:'low',facets }), medium = searchFragments(fragments,'',{ breadth:'medium',facets }), high = searchFragments(fragments,'',{ breadth:'high',facets });
    expect(low).toHaveLength(1); expect(medium).toHaveLength(1); expect(high).toHaveLength(2);
    const analogy = high.find(item => item.fragment.evidence[0].relativePath.endsWith('irrigation.md'))!;
    expect(analogy.reasons[0].kind).toBe('analogy'); expect(analogy.reasons[0].caveat).toMatch(/not a verified causal/); expect(analogy.reasons[0].quotes).toContain(analogy.fragment.summary);
    for (const result of [...low,...medium,...high]) expect(result.fragment.evidence.length).toBeGreaterThan(0);
  });
  it('atmosphere is a declared-facet hint at high breadth, not a fabricated mechanism', async () => {
    const fragments = await fixtureFragments();
    expect(searchFragments(fragments,'',{ breadth:'low',facets:{ atmosphere:['calm'] } })).toEqual([]);
    const results = searchFragments(fragments,'',{ breadth:'high',facets:{ atmosphere:['calm'] } });
    expect(results).toHaveLength(1); expect(results[0].reasons[0].kind).toBe('atmosphere'); expect(results[0].reasons[0].caveat).toMatch(/not evidence/);
  });
  it('handles bounded limits and deterministic ranking', async () => {
    const fragments = await fixtureFragments(), opts = { breadth:'high' as const,facets:{ mechanisms:['feedback loop'] },limit:1 };
    expect(searchFragments(fragments,'',opts)).toHaveLength(1); expect(searchFragments(fragments,'',opts)).toEqual(searchFragments([...fragments].reverse(),'',opts));
    expect(searchFragments(fragments,'practice',{ breadth:'high',limit:0 })).toEqual([]);
    expect(() => searchFragments(fragments,'practice',{ breadth:'high',limit:-1 })).toThrow();
    expect(() => searchFragments(fragments,'practice',{ breadth:'high',limit:201 })).toThrow();
  });
  it('excludes current source evidence but retains cross-source support when available', async () => {
    const raw = 'Deliberate practice makes retrieval opportunities visible.';
    const state = await buildIndex([source('synthetic/a.md',raw),source('synthetic/b.md',raw)],options()), fragments = Object.values(state.fragments);
    const result = searchFragments(fragments,'retrieval',{ breadth:'high',excludeSource:'synthetic/a.md' });
    expect(result).toHaveLength(1); expect(result[0].fragment.evidence).toHaveLength(1); expect(result[0].fragment.evidence[0].relativePath).toBe('synthetic/b.md');
    expect(searchFragments([fragments[0]],'retrieval',{ breadth:'high',excludeSource:fragments[0].evidence[0].sourceId })[0].fragment.evidence).toHaveLength(1);
    expect(fragments[0].evidence).toHaveLength(2);
    const single = (await analyzeSource(source('synthetic/single.md',raw),{ mode:'local-excerpts',cloudConsent:false })).fragments;
    expect(searchFragments(single,'retrieval',{ breadth:'high',excludeSource:'synthetic/single.md' })).toEqual([]);
    expect(searchFragments([{ ...single[0],evidence:[] }],'retrieval',{ breadth:'high' })).toEqual([]);
  });
});

describe('incremental complete-revision staging', () => {
  it('keys source records by exact canonical path, deduplicates across sources and unions all provenance', async () => {
    const raw = 'An identical useful excerpt keeps every independent source.';
    const a = source('synthetic/a.md',`---\ntopics: [public-topic]\n---\n# Same title\n${raw}`), b = source('synthetic/b.md',`---\nprivacy: private\ntopics: [private-topic]\n---\n# Different title\n${raw}`);
    const state = await buildIndex([a,b],options()), fragments = Object.values(state.fragments);
    expect(Object.keys(state.sources)).toEqual(['synthetic/a.md','synthetic/b.md']); expect(fragments).toHaveLength(1); expect(fragments[0].evidence).toHaveLength(2);
    expect(fragments[0].privacy).toBe('private'); expect(fragments[0].facets.topics).toEqual(['private-topic','public-topic']);
    expect(state.sources[a.path].fragmentIds).toEqual(state.sources[b.path].fragmentIds); expect(vocabularyOf(fragments,true)).toEqual(emptyFacets());
  });
  it('same title with a distinct idea remains a separate fragment', async () => {
    const state = await buildIndex([source('synthetic/a.md','# Same title\nDeliberate practice helps retrieval.'),source('synthetic/b.md','# Same title\nGarden irrigation adjusts water thresholds.')],options());
    expect(Object.values(state.fragments)).toHaveLength(2);
  });
  it('skips the model for same hash plus generation signature and preserves timestamps', async () => {
    const request = vi.fn(async (input: ModelRequest) => extraction(input.text)), snapshot = source('synthetic/ai.md','A grounded procedural observation.'), base: RunOptions = { ...options(),mode:'cloud-model',cloudConsent:true,model:{ request } };
    const first = await buildIndex([snapshot],base); expect(request).toHaveBeenCalledOnce(); request.mockClear();
    const second = await buildIndex([snapshot],{ ...base,previous:freeze(first),now:LATER });
    expect(request).not.toHaveBeenCalled(); expect(second).toEqual(first); expect(second.updatedAt).toBe(NOW);
  });
  it('changes generation for explicit signature or mode, but not vocabulary hints', async () => {
    const request = vi.fn(async (input: ModelRequest) => extraction(input.text)), snapshot = source('synthetic/ai.md','A grounded procedural observation.'), base: RunOptions = { ...options(),mode:'local-model',model:{ request } };
    const first = await buildIndex([snapshot],base); request.mockClear();
    await buildIndex([snapshot],{ ...base,previous:first,signature:'fixture-v2' }); expect(request).toHaveBeenCalledOnce(); request.mockClear();
    // Learned vocabulary grows during indexing. Treating hints as generation
    // config re-requested unchanged originals; explicit signature is the re-edit control.
    const hinted = await buildIndex([snapshot],{ ...base,previous:first,vocabulary:{ ...emptyFacets(),topics:['practice'] } }); expect(request).not.toHaveBeenCalled(); expect(hinted).toEqual(first);
    await buildIndex([snapshot],{ ...base,previous:first,mode:'cloud-model',cloudConsent:true }); expect(request).toHaveBeenCalledOnce();
  });
  it('edits replace old fragments and deletions remove unsupported candidates', async () => {
    const a = source('synthetic/a.md','Old alpha knowledge remains until a complete replacement.'), b = source('synthetic/b.md','Independent beta practice remains available.');
    const previous = freeze(await buildIndex([a,b],options())), before = JSON.stringify(previous);
    const edited = source(a.path,'New gamma evidence replaces the retired alpha paragraph.');
    const next = await buildIndex([edited],{ ...options(previous),now:LATER });
    expect(Object.keys(next.sources)).toEqual([a.path]); expect(Object.values(next.fragments)).toHaveLength(1);
    expect(JSON.stringify(next)).not.toContain('Old alpha'); expect(JSON.stringify(next)).not.toContain(b.path);
    expect(searchFragments(Object.values(next.fragments),'beta practice',{ breadth:'high' })).toEqual([]); expect(JSON.stringify(previous)).toBe(before);
  });
  it('deleting one duplicate retains the other source, removes stale facets and recomputes privacy', async () => {
    const a = source('synthetic/a.md','---\ntopics: [public-topic]\n---\nIdentical material preserves source context.'), b = source('synthetic/b.md','---\nprivacy: private\ntopics: [retired-private-topic]\n---\nIdentical material preserves source context.');
    const first = await buildIndex([a,b],options()), next = await buildIndex([a],options(freeze(first))), fragments = Object.values(next.fragments);
    expect(fragments).toHaveLength(1); expect(fragments[0].evidence).toHaveLength(1); expect(fragments[0].privacy).toBe('normal'); expect(fragments[0].facets.topics).toEqual(['public-topic']);
    expect(vocabularyOf(fragments,true).topics).toEqual(['public-topic']); expect(JSON.stringify(next)).not.toContain('retired-private-topic');
  });
  it('source rename is explicit replacement, never inferred from ambiguous hashes', async () => {
    const raw = 'Identical useful text has independent path ownership.', a = source('synthetic/a.md',raw), b = source('synthetic/b.md',raw);
    const first = await buildIndex([a,b],options()), c = source('synthetic/c.md',raw), next = await buildIndex([b,c],options(first));
    expect(Object.keys(next.sources)).toEqual([b.path,c.path]); expect(Object.values(next.fragments)[0].evidence.map(item => item.relativePath).sort()).toEqual([b.path,c.path]);
  });
  it('honestly indexes empty, insufficient, protected and sensitive source statuses', async () => {
    const request = vi.fn(async (input: ModelRequest) => extraction(input.text));
    const notes = [source('synthetic/empty.md',''),source('synthetic/sparse.md','TODO'),source('synthetic/private.md','---\nprivacy: private\n---\nLocal knowledge.'),source('synthetic/secret.md','password: synthetic-unit-test-secret'),source('synthetic/public.md','A usable public observation.')];
    const state = await buildIndex(notes,{ ...options(),mode:'cloud-model',cloudConsent:true,model:{ request } });
    expect(Object.values(state.sources).map(record => record.status).sort()).toEqual(['empty','indexed','insufficient-context','local-only','sensitive'].sort()); expect(request).toHaveBeenCalledOnce();
    const second = await buildIndex(notes,{ ...options(state),mode:'cloud-model',cloudConsent:true,model:{ request } }); expect(second).toEqual(state); expect(request).toHaveBeenCalledOnce();
  });
  it('excludes prior public vocabulary when its source becomes local/private before cloud calls', async () => {
    const old = source('synthetic/policy.md','---\ntopics: [newly-private-topic]\n---\nOld public text.'), publicNote = source('synthetic/public.md','A useful public observation.');
    const first = await buildIndex([old,publicNote],options()), protectedNote = source(old.path,'---\nprivacy: private\ntopics: [newly-private-topic]\n---\nPrivate text now stays local.'), requests: ModelRequest[] = [];
    const model: ModelPort = { request:async input => { requests.push(input); return extraction(input.text); } };
    const next = await buildIndex([protectedNote,publicNote],{ ...options(first),mode:'cloud-model',cloudConsent:true,model,vocabulary:vocabularyOf(Object.values(first.fragments),true) });
    expect(requests).toHaveLength(1); expect(JSON.stringify(requests)).not.toContain('newly-private-topic'); expect(next.sources[old.path].status).toBe('local-only');
  });
  it('reacts to a changed declared privacy policy even when raw hash is unchanged', async () => {
    const publicNote = source('synthetic/a.md','A meaningful public observation.'), privatePolicy = { ...publicNote,privacy:'private' as const }, request = vi.fn(async (input: ModelRequest) => extraction(input.text));
    const base = { ...options(),mode:'cloud-model' as const,cloudConsent:true,model:{ request } };
    const protectedIndex = await buildIndex([privatePolicy],base); expect(request).not.toHaveBeenCalled();
    const publicIndex = await buildIndex([publicNote],{ ...base,previous:protectedIndex }); expect(publicIndex.sources[publicNote.path].status).toBe('indexed'); expect(request).toHaveBeenCalledOnce();
    request.mockClear(); const protectedAgain = await buildIndex([privatePolicy],{ ...base,previous:publicIndex }); expect(protectedAgain.sources[publicNote.path].status).toBe('local-only'); expect(Object.keys(protectedAgain.fragments)).toEqual([]); expect(request).not.toHaveBeenCalled();
  });
  it('fails atomically on a late invalid model result, preserving the prior complete index', async () => {
    const old = source('synthetic/a.md','The previous complete source remains valid.'), previous = freeze(await buildIndex([old],options())), before = JSON.stringify(previous);
    const edited = source(old.path,'A first valid changed paragraph.\n\nA later paragraph fails strict validation.'); let count = 0;
    const model: ModelPort = { request:async input => { count++; return extraction(input.text,count === 2 ? { sourcePath:'../../bad.md' } : {}); } };
    await expect(buildIndex([edited],{ ...options(previous),mode:'local-model',model })).rejects.toThrow(); expect(count).toBe(2); expect(JSON.stringify(previous)).toBe(before);
  });
  it('fails atomically on model/network failure rather than returning an error-status partial state', async () => {
    const snapshot = source('synthetic/a.md','A useful previous observation.'), previous = freeze(await buildIndex([snapshot],options())), before = JSON.stringify(previous);
    await expect(buildIndex([snapshot],{ ...options(previous),mode:'local-model',model:{ request:async () => { throw new Error('Synthetic port failure'); } } })).rejects.toThrow('Synthetic port failure'); expect(JSON.stringify(previous)).toBe(before);
  });
  it('requires unique canonical paths and opaque source IDs before model calls', async () => {
    const a = source('synthetic/a.md','A useful observation.'), request = vi.fn(async (input: ModelRequest) => extraction(input.text));
    await expect(buildIndex([a,a],{ ...options(),mode:'local-model',model:{ request } })).rejects.toThrow(/Duplicate/);
    const b = { ...source('synthetic/b.md','Another useful observation.'),id:a.id };
    await expect(buildIndex([a,b],{ ...options(),mode:'local-model',model:{ request } })).rejects.toThrow(/Duplicate/); expect(request).not.toHaveBeenCalled();
  });
  it.each(['version','extra-field','missing-fragment','inconsistent-provenance','changed-body','bad-offset','incomplete-status'])('fails closed on damaged previous state: %s', async defect => {
    const snapshot = source('synthetic/a.md','An exact previous observation.'), previous = await buildIndex([snapshot],options()), damaged = JSON.parse(JSON.stringify(previous)) as IndexState, id = Object.keys(damaged.fragments)[0];
    if (defect === 'version') (damaged as { version:number }).version=999;
    if (defect === 'extra-field') (damaged.sources[snapshot.path] as unknown as Record<string,unknown>).extra=true;
    if (defect === 'missing-fragment') delete damaged.fragments[id];
    if (defect === 'inconsistent-provenance') damaged.fragments[id].evidence[0].sourceHash='other-hash';
    if (defect === 'changed-body') damaged.fragments[id].summary='A forged entirely different body.';
    if (defect === 'bad-offset') damaged.fragments[id].evidence[0].end++;
    if (defect === 'incomplete-status') damaged.sources[snapshot.path].status='error';
    await expect(buildIndex([snapshot],options(damaged))).rejects.toThrow();
  });
  it('checks exact cached quotes against current immutable snapshots before reuse', async () => {
    const snapshot = source('synthetic/a.md','An exact previous observation.'), previous = await buildIndex([snapshot],options());
    const damaged = JSON.parse(JSON.stringify(previous)) as IndexState, id = Object.keys(damaged.fragments)[0], evidence = damaged.fragments[id].evidence[0];
    evidence.quote='An invented replacement excerpt.'; evidence.end=evidence.start+evidence.quote.length;
    await expect(buildIndex([snapshot],options(damaged))).rejects.toThrow(/Cached quotation/);
  });
  it('empty/deleted source sets produce a complete honest empty index', async () => {
    const empty = await buildIndex([],options()); expect(Object.keys(empty.sources)).toEqual([]); expect(Object.keys(empty.fragments)).toEqual([]);
    const old = await buildIndex([source('synthetic/old.md','A previous useful observation.')],options()), removed = await buildIndex([],options(old));
    expect(Object.keys(removed.sources)).toEqual([]); expect(Object.keys(removed.fragments)).toEqual([]);
  });
  it('reports actual completion counts, including skipped unchanged sources', async () => {
    const notes = [source('synthetic/a.md','A useful observation.'),source('synthetic/b.md','A second useful observation.')], first = await buildIndex(notes,options()), progress: RunProgress[] = [];
    await buildIndex(notes,{ ...options(first),onProgress:event => progress.push(event) });
    expect(progress[0]).toEqual({ completed:0,total:2,phase:'reading' }); expect(progress.at(-1)).toEqual({ completed:2,total:2,phase:'done' });
    expect(progress.filter(event => event.phase === 'processing').map(event => event.completed)).toEqual([0,1,2]);
  });
  it('cancellation after a staged source rejects everything and preserves previous state', async () => {
    const controller = new AbortController(), notes = [source('synthetic/a.md','One real reusable excerpt.'),source('synthetic/b.md','Another real reusable excerpt.')], previous = freeze(await buildIndex(notes,options())), before = JSON.stringify(previous), progress: RunProgress[] = [];
    await expect(buildIndex(notes,{ ...options(previous),signal:controller.signal,onProgress:event => { progress.push(event); if (event.phase === 'processing' && event.completed === 1) controller.abort(); } })).rejects.toMatchObject({ name:'AbortError' });
    expect(progress.at(-1)?.phase).toBe('cancelled'); expect(progress.some(event => event.phase === 'done')).toBe(false); expect(JSON.stringify(previous)).toBe(before);
  });
  it('cooperatively permits host cancellation during a large local-only extraction', async () => {
    const controller = new AbortController(), raw = Array.from({ length:180 },(_,i) => `Independent useful section number ${i}.`).join('\n\n');
    const task = analyzeSource(source('synthetic/long.md',raw),{ mode:'local-excerpts',cloudConsent:false,signal:controller.signal });
    setTimeout(() => controller.abort(),0); await expect(task).rejects.toMatchObject({ name:'AbortError' });
  });
  it('cancellation stops an in-flight port and drops late complete revisions', async () => {
    const controller = new AbortController(), snapshot = source('synthetic/ai.md','A useful new observation.'), previous = freeze(await buildIndex([snapshot],options())), before = JSON.stringify(previous); let finish!: (value:unknown) => void, start!: () => void;
    const active = new Promise<void>(resolve => { start=resolve; });
    const task = buildIndex([snapshot],{ ...options(previous),mode:'local-model',signal:controller.signal,model:{ request:() => { start(); return new Promise(resolve => { finish=resolve; }); } } });
    await active; controller.abort(); await expect(task).rejects.toMatchObject({ name:'AbortError' }); finish(extraction(snapshot.text)); await Promise.resolve(); expect(JSON.stringify(previous)).toBe(before);
  });
});
