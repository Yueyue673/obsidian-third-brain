// SPDX-License-Identifier: MIT
// All sources, questions and outputs are synthetic. These deterministic model
// ports verify the core's contract, not a live provider's semantic quality.
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { analyzeSource, buildIndex, emptyFacets, interpretQuery, prepareSource, searchFragments, vocabularyOf } from '../src/core';
import { lexicalTokens } from '../src/core/retrieval';
import type { Facets, Fragment, IndexState, ModelPort, ModelRequest, RunOptions, SourceSnapshot } from '../src/core';

const NOW = '2026-01-02T03:04:05.000Z', LATER = '2026-01-03T03:04:05.000Z';
function source(path: string, text: string): SourceSnapshot {
  return prepareSource(path,text,createHash('sha256').update(text).digest('hex'),createHash('sha256').update(path).digest('hex'));
}
function candidate(quote: string, changes: Record<string,unknown> = {}) {
  return { title:'Synthetic grounded idea',summary:quote,kind:'idea',...emptyFacets(),quotes:[quote],conditions:[],caveats:[],...changes };
}
function extraction(quote: string, changes: Record<string,unknown> = {}) {
  return { version:1,decision:'extract',fragments:[candidate(quote,changes)] };
}
function run(model: ModelPort, previous: IndexState | null = null): RunOptions {
  return { mode:'cloud-model',cloudConsent:true,signature:'synthetic-editor-v1',model,previous,now:NOW };
}
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) frozen(child); }
  return value;
}
function fragmentAt(state: IndexState, path: string): Fragment {
  return state.fragments[state.sources[path].fragmentIds[0]];
}

const REHEARSAL = 'After each rehearsal I listened to the recording, noticed the rushed passage, and slowed that section on the next attempt.';
const GARDEN = 'The moisture gauge showed dry soil, so the controller opened the valve; its next reading determined whether watering continued.';
const PAINTING = 'Amber light over the empty harbor made the painted horizon look quiet.';
const TIMER = 'A wall clock starts the sprinkler every morning for twelve minutes whether the soil is wet or dry.';
const ARCHIVE = 'The greenhouse monitor records temperature once daily for an archive; its readings never alter the preset heating schedule.';
const MECHANISM = 'error-guided adjustment'; // A discovered label, not a built-in alias or literal source phrase.
const IDEA = '做几轮后怎样才能越来越接近想要的状态，而不是一直照旧？';
const notes = [
  source('synthetic/a-rehearsal.md',REHEARSAL),
  source('synthetic/b-garden.md',GARDEN),
  source('synthetic/c-painting.md',PAINTING),
  source('synthetic/d-timer.md',TIMER),
  source('synthetic/e-archive.md',ARCHIVE),
];
function editorial(input: ModelRequest): unknown {
  if (input.task === 'interpret') return { version:1,...emptyFacets(),mechanisms:[MECHANISM] };
  if (input.text === REHEARSAL) return extraction(REHEARSAL,{ title:'Recording-guided rehearsal',summary:'Listening back guides the pace of the next rehearsal.',kind:'method',topics:['learning'],concepts:['error correction'],mechanisms:['feedback loops',MECHANISM] });
  if (input.text === GARDEN) return extraction(GARDEN,{ title:'Sensor-guided watering',summary:'Moisture measurements guide when to continue or stop watering.',kind:'method',topics:['gardening'],concepts:['adaptive regulation'],mechanisms:['反馈回路','ERROR-GUIDED ADJUSTMENT'] });
  if (input.text === PAINTING) return extraction(PAINTING,{ title:'Harbor painting',summary:'Amber light gives the painted harbor a quiet mood.',topics:['painting'],atmosphere:['quiet'] });
  if (input.text === TIMER) return extraction(TIMER,{ title:'Fixed irrigation timing',summary:'Clock-driven watering runs regardless of soil condition.',topics:['gardening'],mechanisms:['open-loop scheduling'] });
  if (input.text === ARCHIVE) return extraction(ARCHIVE,{ title:'Temperature archive',summary:'Temperature is logged without changing the heating schedule.',topics:['gardening'],concepts:['passive monitoring'] });
  throw new Error('Unexpected synthetic input');
}

describe('untagged AI-editor activation value slice', () => {
  it('discovers cross-domain concepts/mechanisms, edits short summaries, and retrieves a vague idea with no shared words', async () => {
    const before = JSON.stringify(notes), requests: ModelRequest[] = [];
    const model: ModelPort = { request:async input => { requests.push(input); return editorial(input); } };
    const state = await buildIndex(notes,run(model)), fragments = Object.values(state.fragments);
    expect(JSON.stringify(notes)).toBe(before);
    expect(requests[0].vocabulary).toEqual(emptyFacets());
    expect(requests.find(input => input.text === GARDEN)!.vocabulary.mechanisms).toContain(MECHANISM);
    expect(requests.find(input => input.text === GARDEN)!.vocabulary.mechanisms).toContain('反馈循环');
    for (const fragment of fragments) {
      expect(fragment.mode).toBe('ai'); expect(fragment.caveats.join(' ')).toMatch(/editorial interpretations, not verified facts/);
      expect(fragment.evidence.every(evidence => evidence.relativePath.startsWith('synthetic/'))).toBe(true);
      for (const evidence of fragment.evidence) {
        const snapshot = notes.find(note => note.path === evidence.relativePath)!;
        expect(snapshot.text.slice(evidence.start,evidence.end)).toBe(evidence.quote);
        expect(evidence.sourceHash).toBe(snapshot.hash); expect(evidence.sourceId).toBe(snapshot.id);
      }
      expect(fragment.evidence.every(evidence => !evidence.quote.includes(fragment.summary))).toBe(true);
      const tokens = new Set(lexicalTokens(`${fragment.title}\n${fragment.summary}`));
      expect(lexicalTokens(IDEA).some(token => tokens.has(token))).toBe(false);
    }
    const dictionary = vocabularyOf(fragments,true);
    expect(dictionary.mechanisms).toEqual([MECHANISM,'open-loop scheduling','反馈循环']);
    expect(dictionary.concepts).toContain('error correction');
    expect(searchFragments(fragments,IDEA,{ breadth:'high' })).toEqual([]);
    const facets = await interpretQuery(IDEA,model,dictionary);
    expect(requests.at(-1)!.task).toBe('interpret'); expect(facets.mechanisms).toEqual([MECHANISM]);
    expect(searchFragments(fragments,IDEA,{ breadth:'low',facets })).toEqual([]);
    for (const breadth of ['medium','high'] as const) {
      const results = searchFragments(fragments,IDEA,{ breadth,facets });
      expect(results.map(result => result.fragment.evidence[0].relativePath).sort()).toEqual([notes[0].path,notes[1].path]);
      expect(results.every(result => result.reasons.every(reason => reason.kind === 'mechanism'))).toBe(true);
      for (const result of results) for (const reason of result.reasons) {
        expect(reason.label).toContain(MECHANISM); expect(reason.quotes).toContain(result.fragment.evidence[0].quote);
        expect(reason.caveat).toMatch(/not a verified causal relationship/);
      }
    }
    const broad = searchFragments(fragments,IDEA,{ breadth:'high',facets:{ topics:['learning'],mechanisms:[MECHANISM] } });
    const analogy = broad.find(result => result.fragment.evidence[0].relativePath === notes[1].path)!;
    expect(analogy.reasons[0].kind).toBe('analogy'); expect(analogy.reasons[0].quotes).toEqual([GARDEN]);
    // Same gardening domain, a repeated timer, and passive measurements are
    // negative controls: no corrective loop is inferred just to fill top-K.
    expect(broad).toHaveLength(2);
    const unrelated = '遥远星系中的超新星残骸';
    const abstention = await interpretQuery(unrelated,{ request:async () => ({ version:1,...emptyFacets() }) },dictionary);
    expect(searchFragments(fragments,unrelated,{ breadth:'high',facets:abstention })).toEqual([]);
    for (const request of requests) expect(Object.keys(request).sort()).toEqual(['task','text','vocabulary']);
    expect(JSON.stringify(requests)).not.toContain('synthetic/');
  });

  it('reuses canonical aliases and learns vocabulary between blocks without modifying caller hints', async () => {
    const raw = `${REHEARSAL}\n\n${GARDEN}`, seed: Facets = { ...emptyFacets(),concepts:['Error Correction'],mechanisms:['Feedback Loop'] };
    frozen(seed); const before = JSON.stringify(seed), requests: ModelRequest[] = [];
    const model: ModelPort = { request:async input => { requests.push(input); return editorial(input); } };
    const result = await analyzeSource(source('synthetic/blocks.md',raw),run(model, null));
    expect(requests).toHaveLength(2); expect(requests[0].vocabulary).toEqual(emptyFacets());
    expect(requests[1].vocabulary.concepts).toContain('error correction'); expect(requests[1].vocabulary.mechanisms).toContain(MECHANISM);
    const seeded = await analyzeSource(source('synthetic/seeded.md',REHEARSAL),{ ...run(model),vocabulary:seed });
    expect(seeded.fragments[0].facets.concepts).toEqual(['error correction']);
    expect(seeded.fragments[0].facets.mechanisms).toEqual([MECHANISM,'反馈循环']);
    expect(vocabularyOf(result.fragments).mechanisms).toEqual([MECHANISM,'反馈循环']); expect(JSON.stringify(seed)).toBe(before);
  });

  it('retains discovered facets and timestamps without re-calling unchanged sources when the dictionary grows', async () => {
    const request = vi.fn(async (input: ModelRequest) => editorial(input)), model = { request };
    const first = frozen(await buildIndex([notes[0]],run(model))); expect(request).toHaveBeenCalledOnce(); request.mockClear();
    // New source sorts before the cached one; its request still gets the current
    // proven-public dictionary even when the adapter does not supply vocabulary.
    const earlier = source('synthetic/0-new-garden.md',GARDEN);
    const next = await buildIndex([earlier,notes[0]],{ ...run(model,first),now:LATER });
    expect(request).toHaveBeenCalledOnce(); expect(request.mock.calls[0][0].vocabulary.concepts).toContain('error correction');
    expect(fragmentAt(next,notes[0].path)).toEqual(fragmentAt(first,notes[0].path)); request.mockClear();
    const unchanged = await buildIndex([earlier,notes[0]],{ ...run(model,frozen(next)),vocabulary:vocabularyOf(Object.values(next.fragments),true),now:'2026-01-04T03:04:05.000Z' });
    expect(request).not.toHaveBeenCalled(); expect(unchanged).toEqual(next);
    // A full request dictionary may omit cached inferred names. Its cap is not
    // a reason to drop those labels or re-edit a source already in the index.
    const fullHints: Facets = { ...emptyFacets(),concepts:Array.from({ length:256 },(_,i) => `synthetic-seed-${i}`),mechanisms:Array.from({ length:256 },(_,i) => `synthetic-mechanism-${i}`) };
    const bounded = await buildIndex([earlier,notes[0]],{ ...run(model,next),vocabulary:fullHints,now:LATER });
    expect(request).not.toHaveBeenCalled(); expect(bounded).toEqual(next);
    const expanded = await buildIndex([earlier,...notes],{ ...run(model,next),vocabulary:fullHints,now:LATER });
    expect(request).toHaveBeenCalledTimes(notes.length - 1);
    for (const [input] of request.mock.calls) for (const values of Object.values(input.vocabulary)) expect(values.length).toBeLessThanOrEqual(256);
    expect(fragmentAt(expanded,notes[0].path).facets.mechanisms).toContain(MECHANISM);
  });

  it('keeps zero-model lexical/frontmatter mode honest instead of pretending to discover mechanisms', async () => {
    const request = vi.fn(async (input: ModelRequest) => editorial(input));
    const state = await buildIndex(notes,{ ...run({ request }),mode:'local-excerpts',cloudConsent:false });
    expect(request).not.toHaveBeenCalled();
    for (const fragment of Object.values(state.fragments)) {
      expect(fragment.mode).toBe('local'); expect(fragment.facets).toEqual(emptyFacets());
      expect(fragment.summary).toBe(fragment.evidence[0].quote); expect(fragment.caveats.join(' ')).toMatch(/lexical baseline/);
    }
    expect(searchFragments(Object.values(state.fragments),IDEA,{ breadth:'high' })).toEqual([]);
  });
});

describe('editorial discoveries still fail closed on unsafe or unsupported model output', () => {
  it.each(['excerpt','quote'])('keeps long exact %s summaries backwards compatible', async kind => {
    const raw = 'Synthetic exact text preserves the complete original quotation. '.repeat(80);
    const model: ModelPort = { request:async input => extraction(input.text,{ kind }) };
    const result = await analyzeSource(source('synthetic/literal.md',raw),run(model));
    expect(result.fragments[0].summary.length).toBeGreaterThan(800);
    expect(result.fragments[0].summary).toBe(result.fragments[0].evidence[0].quote);
    expect(result.fragments[0].kind).toBe(kind);
    const evidence = result.fragments[0].evidence[0]; expect(raw.slice(evidence.start,evidence.end)).toBe(evidence.quote);
  });

  it.each(['excerpt','quote'])('separates an edited %s summary from its literal evidence without changing the v1 kind', async kind => {
    const summary = 'Listening back guides the pace of the next rehearsal.';
    const model: ModelPort = { request:async () => extraction(REHEARSAL,{ summary,kind }) };
    const result = await analyzeSource(notes[0],run(model)), fragment = result.fragments[0];
    expect(fragment.kind).toBe(kind); expect(fragment.summary).toBe(summary); expect(fragment.evidence[0].quote).toBe(REHEARSAL);
    expect(REHEARSAL).not.toContain(summary); expect(fragment.mode).toBe('ai'); expect(fragment.caveats.join(' ')).toMatch(/not verified facts/);
  });

  it('retains exact source conditions/caveats alongside an edited interpretation', async () => {
    const raw = 'When the soil is dry, the gauge opens the valve. It can misread a loose sensor.';
    const conditions = ['When the soil is dry'], caveats = ['It can misread a loose sensor.'];
    const model: ModelPort = { request:async () => extraction(raw,{ summary:'Dry-soil readings trigger watering; a loose sensor may distort the measurement.',conditions,caveats,mechanisms:['feedback loops'] }) };
    const result = await analyzeSource(source('synthetic/conditioned.md',raw),run(model)), fragment = result.fragments[0];
    expect(fragment.conditions).toEqual(conditions); expect(fragment.caveats).toContain(caveats[0]);
    expect(fragment.caveats.join(' ')).toMatch(/not verified facts/); expect(fragment.evidence[0].quote).toBe(raw);
  });

  it.each([
    'synthetic/path.md','../synthetic.md','C:\\SyntheticVault\\note.md','https://example.invalid',
    '[[synthetic]]','[click](javascript:synthetic())','`synthetic()`','<script>synthetic()</script>',
    'synthetic\nlabel','synthetic\rlabel','synthetic\u0000label','synthetic\u202elabel','[REDACTED]',
    'password: synthetic-fixture-only','synthetic.person@example.invalid','x'.repeat(121),
    'synthetic／path.md','synthetic：value','synthetic;command','synthetic | command',
  ])('rejects unsafe new labels without silently dropping them: %j', async label => {
    const model: ModelPort = { request:async () => extraction(REHEARSAL,{ concepts:[label] }) };
    await expect(analyzeSource(notes[0],run(model))).rejects.toThrow();
  });

  it.each([
    { concepts:Array.from({ length:7 },(_,i) => `synthetic-concept-${i}`) },
    { summary:'Edited interpretation. '.repeat(50) },

    { summary:'Listening back changes practice.',quotes:[] },
    { summary:'Listening back changes practice.',quotes:['rehearsal'] },
    { summary:'Listening back changes practice.',quotes:[GARDEN] },
    { summary:'Listening back changes practice.',quotes:[REHEARSAL],conditions:['Only when the weather is cold.'] },
    { summary:'Listening back changes practice.',quotes:[REHEARSAL],caveats:['The source proves universal success.'] },
    { summary:'Contact synthetic.person@example.invalid for practice.' },
    { summary:'password: synthetic-fixture-only' },
    { summary:'[[synthetic/forged.md]] explains practice.' },
    { summary:'Listening back changes practice.',sourcePath:'synthetic/forged.md' },
    { summary:'Listening back changes practice.',confidence:1 },
    { mechanisms:['error-guided adjustment'],facets:{ mechanisms:['another'] } },
  ])('rejects malformed, unbounded or unsupported editorial fragments %j', async changes => {
    const model: ModelPort = { request:async () => extraction(REHEARSAL,changes) };
    await expect(analyzeSource(notes[0],run(model))).rejects.toThrow();
  });

  it('will not borrow an exact quote from an unprovided paragraph or Canvas metadata', async () => {
    const model: ModelPort = { request:async () => extraction(GARDEN,{ summary:'Measurements guide an adjustment.' }) };
    await expect(analyzeSource(source('synthetic/chunks.md',`${REHEARSAL}\n\n${GARDEN}`),run(model))).rejects.toThrow(/quotation is absent/);
    const canvas = source('synthetic/metadata.canvas',JSON.stringify({ nodes:[{ type:'text',text:REHEARSAL }],edges:[],metadata:{ label:GARDEN } }));
    await expect(analyzeSource(canvas,run(model))).rejects.toThrow(/quotation is absent/);
  });

  it('accepts an edited Canvas summary only with decoded readable-node quotes and honest offsets', async () => {
    const quote = `${REHEARSAL}\nThe next attempt preserved the correction.`, canvas = source('synthetic/readable.canvas',JSON.stringify({ nodes:[{ type:'text',text:quote }],edges:[] }));
    const model: ModelPort = { request:async () => extraction(quote,{ summary:'Listening back informs the next rehearsal.',concepts:['error correction'],mechanisms:[MECHANISM] }) };
    const result = await analyzeSource(canvas,run(model)), evidence = result.fragments[0].evidence[0];
    expect(evidence.quote).toBe(quote); expect(evidence.relativePath).toBe(canvas.path);
    expect(evidence.start).toBe(-1); expect(evidence.end).toBe(-1); expect(result.fragments[0].caveats.join(' ')).toContain('Canvas');
  });

  it('allows discovery only during extraction, not interpretation of existing safe vocabulary', async () => {
    const output = extraction(REHEARSAL,{ mechanisms:['new-synthetic-mechanism'] });
    const analysis = await analyzeSource(notes[0],run({ request:async () => output }));
    expect(analysis.fragments[0].facets.mechanisms).toEqual(['new-synthetic-mechanism']);
    await expect(interpretQuery(IDEA,{ request:async () => ({ version:1,...emptyFacets(),mechanisms:['unknown-synthetic-mechanism'] }) },vocabularyOf(analysis.fragments,true))).rejects.toThrow(/unknown or unsafe facet/);
  });
});

describe('incremental discovered dictionary provenance and privacy', () => {
  it.each(['deleted','private','local'] as const)('normalizes seed aliases before excluding a %s learned donor from cloud requests', async change => {
    const donor = source('synthetic/donor-alias.md','A measurement changes the setting used on the next iteration.'), fresh = source('synthetic/0-fresh.md','Synthetic painted borders use contrasting hues.');
    const first = await buildIndex([donor],run({ request:async input => extraction(input.text,{ mechanisms:['feedback loops'] }) }));
    expect(vocabularyOf(Object.values(first.fragments),true).mechanisms).toEqual(['反馈循环']);
    const request = vi.fn(async (input: ModelRequest) => extraction(input.text));
    const inputs = change === 'deleted' ? [fresh] : [fresh,{ ...donor,privacy:change }];
    const aliases = ['Feedback Loop','feedback loops','反馈回路','ＦＥＥＤＢＡＣＫ ＬＯＯＰ','#Feedback Loop','caller-owned synthetic seed'];
    const next = await buildIndex(inputs,{ ...run({ request },frozen(first)),vocabulary:{ ...emptyFacets(),mechanisms:aliases } });
    expect(request).toHaveBeenCalledOnce(); expect(request.mock.calls[0][0].vocabulary.mechanisms).toEqual(['caller-owned synthetic seed']);
    expect(vocabularyOf(Object.values(next.fragments),true).mechanisms).toEqual([]);
  });

  it.each(['deleted','edited','private','local','sensitive'] as const)('does not send vocabulary from a %s donor while reusing an independent unchanged source', async change => {
    const donor = source('synthetic/z-donor.md','A reservoir accumulates pulses and releases a steady flow.'), survivor = source('synthetic/survivor.md','Placing materials in advance lowers effort before a routine.'), fresh = source('synthetic/0-fresh.md','A small sketch establishes the outline before adding details.');
    const retired = 'reservoir smoothing', survivorFacet = 'action preparation';
    const request = vi.fn(async (input: ModelRequest) => extraction(input.text,{ concepts:input.text === donor.text ? [retired] : input.text === survivor.text ? [survivorFacet] : [] }));
    const first = frozen(await buildIndex([donor,survivor],run({ request }))); request.mockClear();
    let current: SourceSnapshot | undefined;
    if (change === 'edited') current = source(donor.path,'A different synthetic note discusses watercolor pigments.');
    if (change === 'private' || change === 'local') current = { ...donor,privacy:change };
    if (change === 'sensitive') current = source(donor.path,'password: synthetic-fixture-only\nThe source is blocked before any transform.');
    const inputs = [fresh,survivor,...(current ? [current] : [])];
    const next = await buildIndex(inputs,{ ...run({ request },first),vocabulary:vocabularyOf(Object.values(first.fragments),true),now:LATER });
    expect(request).toHaveBeenCalledTimes(change === 'edited' ? 2 : 1);
    for (const [input] of request.mock.calls) {
      expect(JSON.stringify(input)).not.toContain(retired); expect(input.vocabulary.concepts).toContain(survivorFacet);
      expect(input.text).not.toBe(donor.text);
    }
    expect(fragmentAt(next,survivor.path)).toEqual(fragmentAt(first,survivor.path));
    expect(vocabularyOf(Object.values(next.fragments),true).concepts).not.toContain(retired);
    if (change === 'private' || change === 'local') expect(next.sources[donor.path].status).toBe('local-only');
    if (change === 'sensitive') expect(next.sources[donor.path].status).toBe('sensitive');
  });

  it.each(['deleted','edited','private','local','sensitive'] as const)('re-edits an ambiguous merged survivor when its %s donor could otherwise leave stale facets', async change => {
    const quote = 'A measured deviation changes the next adjustment.';
    const survivor = source('synthetic/a-survivor.md',`${quote} Public synthetic context describes a rehearsal.`);
    const donor = source('synthetic/z-donor.md',`${quote} Other synthetic context describes a reservoir.`);
    const fresh = source('synthetic/0-fresh.md','Synthetic watercolor sketches use several complementary hues.');
    const ownFacet = 'rehearsal correction', retired = 'reservoir correction';
    const request = vi.fn(async (input: ModelRequest) => input.text === survivor.text ? extraction(quote,{ concepts:[ownFacet] }) : input.text === donor.text ? extraction(quote,{ concepts:[retired] }) : extraction(input.text));
    const first = frozen(await buildIndex([survivor,donor],run({ request }))), merged = Object.values(first.fragments);
    expect(merged).toHaveLength(1); expect(merged[0].facets.concepts).toEqual([ownFacet,retired]); expect(merged[0].evidence).toHaveLength(2); request.mockClear();
    let current: SourceSnapshot | undefined;
    if (change === 'edited') current = source(donor.path,'The revised synthetic source studies the color of pigments.');
    if (change === 'private' || change === 'local') current = { ...donor,privacy:change };
    if (change === 'sensitive') current = source(donor.path,'password: synthetic-fixture-only\nPrivate synthetic content is blocked.');
    const next = await buildIndex([fresh,survivor,...(current ? [current] : [])],{ ...run({ request },first),vocabulary:vocabularyOf(merged,true),now:LATER });
    // v1 unioned facets cannot attribute each label to a donor. This extra call
    // is a source-provenance change, not dictionary growth or routine refresh.
    expect(request.mock.calls.filter(([input]) => input.text === survivor.text)).toHaveLength(1);
    for (const [input] of request.mock.calls) expect(JSON.stringify(input)).not.toContain(retired);
    const remaining = fragmentAt(next,survivor.path);
    expect(remaining.facets.concepts).toEqual([ownFacet]); expect(remaining.evidence).toHaveLength(1); expect(remaining.privacy).toBe('normal');
    expect(vocabularyOf(Object.values(next.fragments),true).concepts).not.toContain(retired);
  });

  it('excludes newly discovered private/local vocabulary when switching from loopback indexing to cloud', async () => {
    const publicNote = notes[0], localNote = source('synthetic/local.md','---\nprivacy: local\n---\nA local synthetic reservoir retains its own context.'), privateNote = source('synthetic/private.md','---\nprivacy: private\n---\nA private synthetic irrigation model stays on-device.');
    const localModel: ModelPort = { request:async input => input.text === REHEARSAL ? editorial(input) : extraction(input.text,{ concepts:[input.text.includes('local synthetic') ? 'local reservoir smoothing' : 'private irrigation adaptation'] }) };
    const first = await buildIndex([publicNote,localNote,privateNote],{ ...run(localModel),mode:'local-model',cloudConsent:false });
    const all = vocabularyOf(Object.values(first.fragments));
    expect(all.concepts).toContain('local reservoir smoothing'); expect(all.concepts).toContain('private irrigation adaptation');
    const request = vi.fn(async (input: ModelRequest) => editorial(input));
    const next = await buildIndex([publicNote,localNote,privateNote],{ ...run({ request },frozen(first)),vocabulary:all });
    expect(request).toHaveBeenCalledOnce(); expect(JSON.stringify(request.mock.calls[0][0])).not.toContain('local reservoir smoothing');
    expect(JSON.stringify(request.mock.calls[0][0])).not.toContain('private irrigation adaptation');
    expect(vocabularyOf(Object.values(next.fragments),true).concepts).toEqual(['error correction']);
  });

  it('validates cached exact quotes and facet safety before sending learned names to any model', async () => {
    const first = await buildIndex([notes[0]],run({ request:async input => editorial(input) })), newNote = source('synthetic/0-new.md',GARDEN);
    const damaged = JSON.parse(JSON.stringify(first)) as IndexState, fragment = fragmentAt(damaged,notes[0].path);
    fragment.evidence[0].quote = 'An unsupported synthetic quotation.'; fragment.evidence[0].end = fragment.evidence[0].start + fragment.evidence[0].quote.length;
    const request = vi.fn(async (input: ModelRequest) => editorial(input));
    await expect(buildIndex([newNote,notes[0]],run({ request },damaged))).rejects.toThrow(/Cached quotation/); expect(request).not.toHaveBeenCalled();
    const unsafe = JSON.parse(JSON.stringify(first)) as IndexState;
    fragmentAt(unsafe,notes[0].path).facets.concepts.push('synthetic/secret.md');
    await expect(buildIndex([newNote,notes[0]],run({ request },unsafe))).rejects.toThrow(/Unsafe stored facet/); expect(request).not.toHaveBeenCalled();
  });

  it('filters unsafe seed markup before interpretation rather than normalizing it into apparently safe labels', async () => {
    const request = vi.fn(async (_input: ModelRequest) => ({ version:1,...emptyFacets() }));
    await interpretQuery(IDEA,{ request },{ ...emptyFacets(),concepts:['error correction','unsafe\nlabel','\nunsafe-edge','`synthetic command`','synthetic／path','synthetic.person@example.invalid'] });
    expect(request.mock.calls[0][0].vocabulary.concepts).toEqual(['error correction']);
  });
});
