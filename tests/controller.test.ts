import { describe, expect, it, vi } from 'vitest';
import { ThirdBrainController } from '../src/controller';
import { prepareSource } from '../src/core/index';
import { emptyFacets } from '../src/core/types';
import type { IndexState, SourceSnapshot, StorePort } from '../src/core/types';
import { defaults, type Settings } from '../src/settings';
import { hash, type SourcePort } from '../src/sources';

const original = '---\nmechanisms: [feedback loop]\n---\nShorter cycles of checking and correcting reduce wasted effort.';
const snapshot = (text: string): SourceSnapshot => prepareSource('synthetic.md', text, hash(text), 'synthetic-source');
async function setup() {
  const settings: Settings = { ...defaults, excludes: [] };
  let live: SourceSnapshot | null = snapshot(original), index: IndexState | null = null;
  const sources: SourcePort = { list: async () => live ? [live] : [], read: async () => live, verify: async () => undefined };
  const store: StorePort = { recover: async () => undefined, load: async () => index,
    commit: async (next, verify) => { await verify?.(); index = structuredClone(next); } };
  const request = vi.fn(async () => ({ version: 1, ...emptyFacets() }));
  const factorySettings: Readonly<Settings>[] = [];
  const controller = new ThirdBrainController(sources, store, () => settings, options => { factorySettings.push(options); return { request }; }, async () => undefined);
  await controller.initialize(); await controller.refresh();
  return { controller, settings, request, factorySettings, setLive: (next: SourceSnapshot | null) => { live = next; } };
}

describe('controller privacy before query interpretation', () => {
  it.each(['private', 'local', 'deleted', 'changed'])('does not resend vocabulary from a %s stale source to a cloud model', async variant => {
    const f = await setup();
    if (variant === 'deleted') f.setLive(null);
    else if (variant === 'changed') f.setLive(snapshot('A different fully synthetic observation.'));
    else f.setLive(snapshot(`---\nprivacy: ${variant}\nmechanisms: [feedback loop]\n---\nShorter cycles of checking and correcting reduce wasted effort.`));
    f.settings.mode = 'cloud-model'; f.settings.cloudConsent = true;
    await f.controller.find('I want frequent correction', 'medium');
    expect(f.request).not.toHaveBeenCalled();
    f.controller.dispose();
  });
  it('still interprets an explicitly submitted ordinary idea against current ordinary vocabulary', async () => {
    const f = await setup(); f.settings.mode = 'cloud-model'; f.settings.cloudConsent = true;
    await f.controller.find('I want frequent correction', 'medium');
    expect(f.request).toHaveBeenCalledTimes(1);
    f.controller.dispose();
  });
  it('does not interpret private current-note context with a cloud model', async () => {
    const f = await setup(); f.settings.mode = 'cloud-model'; f.settings.cloudConsent = true;
    await f.controller.find('I want frequent correction', 'medium', 'private');
    expect(f.request).not.toHaveBeenCalled();
    f.controller.dispose();
  });
  it('passes the captured run settings into its model factory, not a changed live mode', async () => {
    const f = await setup();
    f.controller.subscribe(() => { if (f.controller.status().phase === 'indexing') f.settings.mode = 'cloud-model'; });
    await f.controller.refresh();
    expect(f.factorySettings.at(-1)?.mode).toBe('local-excerpts');
    expect(f.request).not.toHaveBeenCalled();
    f.controller.dispose();
  });
});
