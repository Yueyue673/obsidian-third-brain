import { describe, expect, it } from 'vitest';
import { ThirdBrainController } from '../src/controller';
import { prepareSource } from '../src/core';
import type { IndexState, SourceSnapshot, StorePort } from '../src/core';
import { defaults } from '../src/settings';
import { hash, type SourcePort } from '../src/sources';

// Literal synthetic data only; no real vault or external model.
describe('merged claim freshness at activation', () => {
  it.each(['deleted', 'private'])('does not retain unioned donor labels after a donor becomes %s', async change => {
    const sentence = 'Shorter cycles of checking and correcting reduce wasted effort.';
    const snapshot = (path: string, raw: string): SourceSnapshot => prepareSource(path, raw, hash(raw), hash(path).slice(0, 24));
    const inputs = new Map([
      ['a.md', snapshot('a.md', `---\nmechanisms: [feedback loop]\n---\n${sentence}`)],
      ['b.md', snapshot('b.md', sentence)],
    ]);
    const sources: SourcePort = { list: async () => [...inputs.values()], read: async path => inputs.get(path) ?? null, verify: async () => undefined, excluded: async () => new Set<string>() };
    let state: IndexState | null = null;
    const store: StorePort = { recover: async () => undefined, load: async () => state, commit: async next => { state = structuredClone(next); } };
    const settings = { ...defaults, excludes: [] };
    const controller = new ThirdBrainController(sources, store, () => settings, () => undefined, async () => undefined);
    try {
      await controller.initialize(); await controller.refresh();
      const initial = await controller.find('feedback loop', 'medium');
      expect(initial).toHaveLength(1); expect(initial[0].fragment.evidence).toHaveLength(2);
      if (change === 'deleted') inputs.delete('a.md');
      else inputs.set('a.md', snapshot('a.md', `---\nprivacy: private\nmechanisms: [feedback loop]\n---\n${sentence}`));
      expect(await controller.find('feedback loop', 'medium')).toEqual([]);
      const remaining = initial[0].fragment.evidence.find(item => item.relativePath === 'b.md')!;
      await expect(controller.verifyOpen(remaining)).resolves.toBeUndefined();
    } finally { controller.dispose(); }
  });
});
