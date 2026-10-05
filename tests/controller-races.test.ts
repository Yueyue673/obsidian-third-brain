import { describe, expect, it, vi } from 'vitest';
import { ThirdBrainController } from '../src/controller';
import { analyzeSource, buildIndex, prepareSource } from '../src/core';
import type { IndexState, ModelRequest, SourceSnapshot, StorePort } from '../src/core/types';
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
