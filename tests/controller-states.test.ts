import { describe, expect, it } from 'vitest';
import { ThirdBrainController } from '../src/controller';
import { prepareSource } from '../src/core';
import type { IndexState, SourceSnapshot, StorePort } from '../src/core/types';
import { defaults } from '../src/settings';
import { hash, type SourcePort } from '../src/sources';

// Literal synthetic data only; no real vault, model or credential is used.
const note = (path: string, raw: string): SourceSnapshot => prepareSource(path, raw, hash(raw), hash(path).slice(0, 24));

function harness(options: { recoverFails?: boolean } = {}) {
  const settings = { ...defaults, excludes: [] };
  let inputs = [
    note('synthetic/a-alpha.md', 'Shorter cycles of checking and correcting reduce wasted effort.'),
    note('synthetic/b-beta.md', 'Garden irrigation adjusts water thresholds after each measurement.'),
  ];
  let index: IndexState | null = null;
  let commits = 0;
  const sources: SourcePort = {
    list: async () => [...inputs],
    read: async path => inputs.find(item => item.path === path) ?? null,
    verify: async () => undefined,
    excluded: async () => new Set<string>(),
  };
  const store: StorePort = {
    recover: async () => { if (options.recoverFails) throw new Error('Synthetic damaged state'); },
    load: async () => index,
    commit: async (next, verify) => { await verify?.(); commits += 1; index = structuredClone(next); },
  };
  const controller = new ThirdBrainController(sources, store, () => settings, () => undefined, async () => undefined);
  return { controller, replace: (next: SourceSnapshot[]) => { inputs = next; }, load: async () => index, commits: () => commits };
}

describe('controller cancellation, overlap and readiness states', () => {
  it('cancels an in-flight refresh, keeps the previous complete revision and accepts a retry', async () => {
    const h = harness();
    await h.controller.initialize();
    await h.controller.refresh();
    const baseline = JSON.stringify(await h.load());
    expect(h.commits()).toBe(1);

    h.replace([
      note('synthetic/a-alpha.md', 'Shorter cycles of checking and correcting reduce wasted effort.'),
      note('synthetic/b-beta.md', 'Garden irrigation adjusts water thresholds after each measurement. A revised synthetic observation.'),
    ]);
    let cancelled = false;
    const unsubscribe = h.controller.subscribe(() => {
      const status = h.controller.status();
      if (!cancelled && status.phase === 'indexing' && status.progress?.phase === 'processing' && status.progress.completed === 1) {
        cancelled = true; h.controller.cancel();
      }
    });
    await expect(h.controller.refresh()).rejects.toMatchObject({ name: 'AbortError', message: 'Cancelled.' });
    unsubscribe();

    expect(cancelled).toBe(true);
    expect(h.controller.status().phase).toBe('cancelled');
    expect(h.commits()).toBe(1);
    expect(JSON.stringify(await h.load())).toBe(baseline);

    await h.controller.refresh();
    expect(h.controller.status().phase).toBe('idle');
    expect(h.commits()).toBe(2);
    expect(JSON.stringify(await h.load())).not.toBe(baseline);
  });
  it('cancels an in-flight search and lets the next search complete normally', async () => {
    const h = harness();
    await h.controller.initialize();
    await h.controller.refresh();
    let cancelled = false;
    const unsubscribe = h.controller.subscribe(() => {
      if (!cancelled && h.controller.status().phase === 'searching') { cancelled = true; h.controller.cancel(); }
    });
    await expect(h.controller.find('irrigation thresholds', 'medium')).rejects.toThrow('Cancelled.');
    unsubscribe();
    expect(cancelled).toBe(true);
    expect(h.controller.status().phase).toBe('cancelled');
    const results = await h.controller.find('irrigation thresholds', 'medium');
    expect(results.length).toBeGreaterThan(0);
    expect(h.controller.status().phase).toBe('idle');
  });
  it('rejects overlapping refresh and search requests while a task is running', async () => {
    const h = harness();
    await h.controller.initialize();
    let attempts: Promise<unknown>[] = [];
    const unsubscribe = h.controller.subscribe(() => {
      if (attempts.length || h.controller.status().phase !== 'indexing') return;
      attempts = [h.controller.refresh().catch((error: Error) => error), h.controller.find('irrigation', 'low').catch((error: Error) => error)];
    });
    await h.controller.refresh();
    unsubscribe();
    const [overlappingRefresh, overlappingFind] = await Promise.all(attempts);
    expect(overlappingRefresh).toBeInstanceOf(Error);
    expect((overlappingRefresh as Error).message).toBe('A task is already running.');
    expect(overlappingFind).toBeInstanceOf(Error);
    expect((overlappingFind as Error).message).toBe('A task is already running.');
    const results = await h.controller.find('irrigation thresholds', 'low');
    expect(results.length).toBeGreaterThan(0);
  });
  it('blocks refresh and search until the layer is ready and fails visibly on damaged state', async () => {
    const h = harness();
    await expect(h.controller.refresh()).rejects.toThrow('Review the generated index before refreshing.');
    await expect(h.controller.find('irrigation', 'low')).rejects.toThrow('Review the generated index before searching.');
    expect(h.controller.status().phase).toBe('loading');
    h.controller.cancel(); // No task yet: a no-op, not an error.

    const broken = harness({ recoverFails: true });
    await expect(broken.controller.initialize()).rejects.toThrow('Synthetic damaged state');
    expect(broken.controller.status()).toMatchObject({ phase: 'error', errorCode: 'index-unavailable' });
    await expect(broken.controller.refresh()).rejects.toThrow('Review the generated index before refreshing.');
  });
  it('returns nothing for an empty idea and bounds oversized ideas without starting a task', async () => {
    const h = harness();
    await h.controller.initialize();
    await h.controller.refresh();
    for (const query of ['', '   \n\t ']) {
      await expect(h.controller.find(query, 'low')).resolves.toEqual([]);
      expect(h.controller.status().phase).toBe('idle');
    }
    const oversized = 'a '.repeat(10000) + 'a';
    expect(oversized).toHaveLength(20001);
    await expect(h.controller.find(oversized, 'low')).rejects.toThrow('Use a shorter idea or an editor selection.');
    expect(h.controller.status().phase).toBe('idle');
    await expect(h.controller.find('a '.repeat(10000), 'low')).resolves.toEqual([]);
    expect(h.controller.status().phase).toBe('idle');
  });
});
