import { describe, expect, it, vi } from 'vitest';
import { ThirdBrainController } from '../src/controller';
import { analyzeSource, buildIndex, prepareSource } from '../src/core';
import { emptyFacets, emptyIndex, type Fragment, type IndexState, type ModelRequest, type SourceSnapshot, type StorePort } from '../src/core/types';
import { searchFragments } from '../src/core/retrieval';
import { defaults, type Settings } from '../src/settings';
import { hash, type SourcePort } from '../src/sources';

// Literal synthetic data only; no real vault, model or credential is used.
const snapshot = (path: string, raw: string): SourceSnapshot => prepareSource(path, raw, hash(raw), hash(path).slice(0, 24));
const extraction = (text: string) => ({ version: 1, decision: 'extract', fragments: [{ title: 'Selected exact step', summary: text, kind: 'method', topics: [], concepts: [], mechanisms: [], atmosphere: [], quotes: [text], conditions: [], caveats: [] }] });

async function harness(options: { list: () => SourceSnapshot[]; read: (path: string) => Promise<SourceSnapshot | null>; request?: (input: ModelRequest) => Promise<unknown>; state?: IndexState }) {
  const settings: Settings = { ...defaults, excludes: [] };
  let index: IndexState | null = options.state ?? null; let commits = 0;
  const sources: SourcePort = {
    list: async () => options.list(), read: options.read, verify: async () => undefined,
    excluded: async paths => new Set(paths.filter(p => settings.excludes.some(x => p === x || p.startsWith(`${x}/`)))),
  };
  const store: StorePort = { recover: async () => undefined, load: async () => index, commit: async next => { commits++; index = structuredClone(next); } };
  const request = vi.fn(options.request ?? (async (input: ModelRequest) => input.task === 'interpret'
    ? { version: 1, topics: [], concepts: [], mechanisms: [], atmosphere: [] }
    : extraction(input.text)));
  const controller = new ThirdBrainController(sources, store, () => settings, run => run.mode === 'local-excerpts' ? undefined : { request }, async () => undefined);
  await controller.initialize();
  return { controller, settings, request, commits: () => commits };
}
const vocabularyOfCall = (request: ReturnType<typeof vi.fn>, index: number) => (request.mock.calls[index][0] as ModelRequest).vocabulary;

function activationFixture(directTarget = false) {
  const files = new Map(['anchor','target'].map(id => [id, snapshot(`Synthetic/${id}.md`, `Exact synthetic quotation for ${id}.`)]));
  const state = emptyIndex();
  for (const [id, source] of files) {
    const f: Fragment = { id,privacy:'normal',title:`Title ${id}`,summary:directTarget && id === 'target' ? 'needle' : `Summary ${id}`,kind:'method',mode:'ai',updatedAt:'2026-01-01',conditions:[`${id} condition`],caveats:[],
      facets:{ ...emptyFacets(),mechanisms:id === 'anchor' ? ['needle','bridge'] : ['bridge'] },
      evidence:[{ sourceId:source.id,relativePath:source.path,sourceHash:source.hash,quote:source.text,start:0,end:source.text.length }] };
    state.fragments[id] = f; state.sources[source.path] = { hash:source.hash,status:'indexed',fragmentIds:[id] };
  }
  return { files,state };
}

describe('both source endpoints at indirect activation', () => {
  it('returns a trace whose two original references both pass verifyOpen without a model call', async () => {
    const f = activationFixture();
    const h = await harness({ state:f.state,list:() => [...f.files.values()],read:async path => [...f.files.values()].find(s => s.path === path) ?? null });
    try {
      const hits = await h.controller.find('needle','high'), trace = hits.find(r => r.fragment.id === 'target')!.reasons[0].indirect!;
      expect(trace.anchor.conditions).toEqual(['anchor condition']); expect(trace.target.conditions).toEqual(['target condition']);
      for (const e of [...trace.anchor.evidence,...trace.target.evidence]) await expect(h.controller.verifyOpen(e)).resolves.toBeUndefined();
      expect(h.request).not.toHaveBeenCalled();
    } finally { h.controller.dispose(); }
  });
  it.each(['anchor','target'] as const)('rejects excluded %s endpoint', async id => {
    const f = activationFixture(), h = await harness({ state:f.state,list:() => [...f.files.values()],read:async path => [...f.files.values()].find(s => s.path === path) ?? null });
    try { h.settings.excludes = [`Synthetic/${id}.md`]; const hits = await h.controller.find('needle','high'); expect(hits.find(r => r.fragment.id === 'target')).toBeUndefined(); }
    finally { h.controller.dispose(); }
  });
  for (const id of ['anchor','target'] as const) it.each(['deleted','changed','privacy','quote','identity'])(`rejects ${id} endpoint with %s provenance`, async variant => {
    const f = activationFixture(), original = f.files.get(id)!;
    if (variant === 'deleted') f.files.delete(id);
    else if (variant === 'changed') f.files.set(id,snapshot(original.path,'An entirely changed synthetic original.'));
    else if (variant === 'privacy') f.files.set(id,{ ...original,privacy:'private' });
    else if (variant === 'quote') f.files.set(id,{ ...original,text:'No readable quotation here.' });
    else f.files.set(id,{ ...original,id:'different-source' });
    const h = await harness({ state:f.state,list:() => [...f.files.values()],read:async path => [...f.files.values()].find(s => s.path === path) ?? null });
    try { const hits = await h.controller.find('needle','high'); expect(hits.find(r => r.fragment.id === 'target')).toBeUndefined(); }
    finally { h.controller.dispose(); }
  });
  it('removes a late-invalidated anchor explanation without retaining an indirect score bonus on a direct target', async () => {
    const f = activationFixture(true), original = f.files.get('anchor')!; let targetReads = 0;
    const directScore = searchFragments(Object.values(f.state.fragments),'needle',{ breadth:'high' }).find(r => r.fragment.id === 'target')!.score;
    const h = await harness({ state:f.state,list:() => [...f.files.values()],read:async path => {
      if (path.endsWith('/target.md') && ++targetReads === 3) f.files.set('anchor',snapshot(original.path,'Edited while target evidence was being read.'));
      return [...f.files.values()].find(s => s.path === path) ?? null;
    } });
    try {
      const target = (await h.controller.find('needle','high')).find(r => r.fragment.id === 'target')!;
      expect(targetReads).toBeGreaterThanOrEqual(3); expect(target.reasons.every(r => r.kind !== 'indirect-mechanism')).toBe(true); expect(target.score).toBe(directScore);
    } finally { h.controller.dispose(); }
  });
  it('drops even a directly matched target if it becomes stale during its anchor check', async () => {
    const f = activationFixture(true), original = f.files.get('target')!; let anchorReads = 0;
    const h = await harness({ state:f.state,list:() => [...f.files.values()],read:async path => {
      if (path.endsWith('/anchor.md') && ++anchorReads === 2) f.files.set('target',snapshot(original.path,'Edited during anchor verification.'));
      return [...f.files.values()].find(s => s.path === path) ?? null;
    } });
    try { expect((await h.controller.find('needle','high')).find(r => r.fragment.id === 'target')).toBeUndefined(); }
    finally { h.controller.dispose(); }
  });
  it('rejects either original click after its source is excluded following activation', async () => {
    const f = activationFixture(), h = await harness({ state:f.state,list:() => [...f.files.values()],read:async path => [...f.files.values()].find(s => s.path === path) ?? null });
    try {
      const target = (await h.controller.find('needle','high')).find(r => r.fragment.id === 'target')!, trace = target.reasons[0].indirect!;
      for (const e of [...trace.anchor.evidence,...trace.target.evidence]) {
        h.settings.excludes = [e.relativePath]; await expect(h.controller.verifyOpen(e)).rejects.toThrow('no longer available');
      }
    } finally { h.controller.dispose(); }
  });
  it('fails cancelled endpoint verification instead of returning partial suggestions', async () => {
    const f = activationFixture(); let cancel = () => {};
    const h = await harness({ state:f.state,list:() => [...f.files.values()],read:async path => { if (path.endsWith('/target.md')) cancel(); return [...f.files.values()].find(s => s.path === path) ?? null; } });
    cancel = () => h.controller.cancel();
    try { await expect(h.controller.find('needle','high')).rejects.toThrow('Cancelled'); expect(h.controller.status().phase).toBe('cancelled'); }
    finally { h.controller.dispose(); }
  });
});

describe('privacy at the exact moment of a model request', () => {
  it('stops using cloud vocabulary from a folder excluded after indexing', async () => {
    const kept = snapshot('kept.md', '---\nmechanisms: [beta-mechanism]\n---\nBeta checks every correction.');
    const excluded = snapshot('excluded/alpha.md', '---\nmechanisms: [alpha-mechanism]\n---\nAlpha keeps cycles short.');
    const files = new Map([[kept.path, kept], [excluded.path, excluded]]);
    const h = await harness({ list: () => [kept, excluded], read: async path => files.get(path) ?? null });
    try {
      await h.controller.refresh();
      h.settings.excludes = ['excluded']; h.settings.mode = 'cloud-model'; h.settings.cloudConsent = true;
      await h.controller.find('checking every correction', 'low');
      expect(h.request).toHaveBeenCalledTimes(1);
      const vocabulary = vocabularyOfCall(h.request, 0);
      expect(vocabulary.mechanisms).toContain('beta-mechanism');
      expect(vocabulary.mechanisms).not.toContain('alpha-mechanism');
    } finally { h.controller.dispose(); }
  });
  it('re-verifies every donor immediately before the cloud request is sent', async () => {
    const alphaNormal = snapshot('alpha.md', '---\nmechanisms: [alpha-mechanism]\n---\nAlpha keeps cycles short.');
    const alphaPrivate = snapshot('alpha.md', '---\nprivacy: private\nmechanisms: [alpha-mechanism]\n---\nAlpha keeps cycles short.');
    const beta = snapshot('beta.md', '---\nmechanisms: [beta-mechanism]\n---\nBeta checks every correction.');
    const [alphaFragment] = (await analyzeSource(alphaNormal, { mode: 'local-excerpts', cloudConsent: false })).fragments;
    const [betaFragment] = (await analyzeSource(beta, { mode: 'local-excerpts', cloudConsent: false })).fragments;
    // Alpha is indexed first. Reading beta then flips alpha to private, so the
    // first collection pass sees alpha as ordinary; only a re-verification pass
    // immediately before the request can catch the change.
    const state: IndexState = { version: 1, signature: 'synthetic-race', updatedAt: '2026-01-01T00:00:00.000Z',
      sources: { [alphaNormal.path]: { hash: alphaNormal.hash, status: 'indexed', fragmentIds: [alphaFragment.id] }, [beta.path]: { hash: beta.hash, status: 'indexed', fragmentIds: [betaFragment.id] } },
      fragments: { [alphaFragment.id]: alphaFragment, [betaFragment.id]: betaFragment } };
    let flipped = false;
    const read = async (path: string) => {
      if (path === 'alpha.md') return flipped ? alphaPrivate : alphaNormal;
      if (path === 'beta.md') { flipped = true; return beta; }
      return null;
    };
    const h = await harness({ list: () => [alphaNormal, beta], read, state });
    try {
      h.settings.mode = 'cloud-model'; h.settings.cloudConsent = true;
      await h.controller.find('checking every correction', 'low');
      expect(flipped).toBe(true);
      expect(h.request).toHaveBeenCalledTimes(1);
      const vocabulary = vocabularyOfCall(h.request, 0);
      expect(vocabulary.mechanisms).toContain('beta-mechanism');
      expect(vocabulary.mechanisms).not.toContain('alpha-mechanism');
    } finally { h.controller.dispose(); }
  });
  it('never sends a note that became private while an earlier note was being analyzed', async () => {
    const alpha = snapshot('alpha.md', 'Alpha method keeps one variable visible.');
    const betaNormal = snapshot('beta.md', 'Beta observations stay local.');
    const betaPrivate = snapshot('beta.md', '---\nprivacy: private\n---\nBeta observations stay local.');
    let beta = betaNormal;
    const h = await harness({
      list: () => [alpha, beta], read: async path => path === 'beta.md' ? beta : alpha,
      request: async (input: ModelRequest) => { beta = betaPrivate; return extraction(input.text); },
    });
    try {
      h.settings.mode = 'cloud-model'; h.settings.cloudConsent = true;
      await expect(h.controller.refresh()).rejects.toThrow();
      expect(h.request).toHaveBeenCalledTimes(1);
      expect((h.request.mock.calls[0][0] as ModelRequest).text).toContain('Alpha method');
      expect(h.commits()).toBe(0);
      expect(h.controller.status().phase).toBe('error');
    } finally { h.controller.dispose(); }
  });
  it('refuses to analyze when the fresh read disagrees, and proceeds when it matches', async () => {
    const alpha = snapshot('alpha.md', 'Alpha method keeps one variable visible.');
    const edited = snapshot('alpha.md', 'Alpha method keeps one variable visible. An edit appeared.');
    const request = vi.fn(async (input: ModelRequest) => extraction(input.text));
    const run = { mode: 'cloud-model' as const, cloudConsent: true, model: { request }, previous: null, signature: 'synthetic-recheck-generation' };
    await expect(buildIndex([alpha], { ...run, recheck: async () => edited })).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
    await expect(buildIndex([alpha], { ...run, recheck: async () => alpha })).resolves.toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
    await expect(buildIndex([alpha], { ...run, recheck: async () => null })).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
