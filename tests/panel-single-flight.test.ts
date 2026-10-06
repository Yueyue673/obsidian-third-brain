// SPDX-License-Identifier: MIT
// Synthetic files and a DOM event shell; real renderer/Controller/FileSources/OwnedStore.
// The read/list latches are controlled test delays, not measured host I/O failures.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults } from '../src/settings';
import { mountPanel, type PanelPort } from '../src/ui';
import type { SearchResult } from '../src/core/types';

class NodeStub {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false;
  children: NodeStub[] = []; attrs: Record<string, string> = {};
  handlers = new Map<string, Array<() => void>>();
  constructor(readonly tag: string) {}
  append(...nodes: NodeStub[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: NodeStub[]) { this.children = nodes; }
  setAttribute(key: string, value: string) { this.attrs[key] = value; }
  remove() {} focus() {}
  get childElementCount() { return this.children.length; }
  addEventListener(event: string, handler: () => void) { this.handlers.set(event, [...this.handlers.get(event) ?? [], handler]); }
  // Deliberately dispatch even if disabled, exercising the handler's live-state guard too.
  fire(event: string) { for (const handler of this.handlers.get(event) ?? []) handler(); }
  all(): NodeStub[] { return [this, ...this.children.flatMap(node => node.all())]; }
}
function latch() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function fixture() {
  const scope = path.resolve('.local/panel-single-flight');
  await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'case-'));
  const originals = {
    'alpha.md': '---\ntopics: [AlphaTopic]\nconcepts: [AlphaConcept]\nmechanisms: [AlphaMechanism]\natmosphere: [AlphaAtmosphere]\n---\n# AlphaCard\nAlphaNeedle records a small synthetic experiment and its limits.',
    'beta.md': '# BetaCard\nBetaNeedle preserves a separate synthetic observation with exact evidence.',
  };
  for (const [name, text] of Object.entries(originals)) await fs.writeFile(path.join(root, name), text);
  const settings = { ...defaults, excludes: [], outputFolder: 'Derived' };
  const store = new OwnedStore(root, settings.outputFolder);
  const sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  // The host factory is called by refresh even in local mode and returns no port.
  const factory = vi.fn(() => undefined);
  const controller = new ThirdBrainController(sources, store, () => settings, factory, async () => {});
  await controller.initialize(); await controller.refresh();
  const indexBefore = await store.load();
  const queries: Promise<SearchResult[]>[] = [], opens: Promise<void>[] = [];
  const find = vi.fn<PanelPort['find']>((...args) => { const operation = controller.find(...args); queries.push(operation); return operation; });
  const open = vi.fn<PanelPort['open']>(evidence => { const operation = controller.verifyOpen(evidence); opens.push(operation); return operation; });
  const port: PanelPort = { status: () => controller.status(), subscribe: cb => controller.subscribe(cb), refresh: () => controller.refresh(), find, open, cancel: () => controller.cancel() };
  vi.stubGlobal('document', { createElement: (tag: string) => new NodeStub(tag) });
  const container = new NodeStub('main');
  const dispose = mountPanel(container as unknown as HTMLElement, port, 'en');
  const get = (className: string) => container.all().find(node => node.className === className)!;
  const input = get('tb-idea');
  const settleQuery = async () => { const result = await queries.at(-1)!; await Promise.resolve(); return result; };
  const start = (query: string) => { input.value = query; input.fire('input'); get('tb-primary').fire('click'); };
  start('AlphaNeedle'); await settleQuery();
  const buttons = () => container.all().filter(node => node.className === 'tb-facet');
  expect(buttons().map(node => node.attrs['data-channel'])).toEqual(['kind', 'topics', 'concepts', 'mechanisms', 'atmosphere']);
  const unchanged = async () => {
    for (const [name, text] of Object.entries(originals)) expect(hash(await fs.readFile(path.join(root, name)))).toBe(hash(text));
    expect(await store.load()).toEqual(indexBefore);
    expect(factory.mock.results.every(result => result.type === 'return' && result.value === undefined)).toBe(true);
  };
  const cleanup = async () => { controller.cancel(); await Promise.allSettled([...queries, ...opens]); await Promise.resolve(); dispose(); controller.dispose(); };
  return { root, store, sources, controller, container, input, get, buttons, find, open, queries, opens, start, settleQuery, unchanged, cleanup };
}

it('old attribute clicks cannot discard a pending natural-idea result or change its selection', async () => {
  const h = await fixture(), entered = latch(), gate = latch();
  const read = h.sources.read.bind(h.sources);
  let heldRead: ReturnType<FileSources['read']> | undefined;
  vi.spyOn(h.sources, 'read').mockImplementationOnce((...args) => heldRead = (async () => {
    const snapshot = await read(...args); entered.release(); await gate.promise; return snapshot;
  })());
  try {
    const oldButtons = h.buttons();
    h.start('BetaNeedle'); const pending = h.queries.at(-1)!; await entered.promise;
    expect(h.controller.status().phase).toBe('searching');
    const disabledDuringSearch = oldButtons.every(button => button.disabled);
    for (const button of oldButtons) button.fire('click');
    const callsDuringSearch = h.find.mock.calls.length, inputDuringSearch = h.input.value, labelDuringSearch = h.get('tb-label').textContent;
    // Source evidence is still usable; only actions starting another search are gated.
    const source = h.container.all().find(node => node.className === 'tb-source')!;
    expect(source.disabled).toBe(false); source.fire('click'); await h.opens.at(-1)!;
    gate.release(); await pending; await heldRead; await Promise.allSettled(h.queries); await Promise.resolve();
    expect.soft(disabledDuringSearch).toBe(true);
    expect.soft(callsDuringSearch).toBe(2);
    expect.soft(inputDuringSearch).toBe('BetaNeedle'); expect.soft(labelDuringSearch).toBe('Your idea');
    expect.soft(h.container.all().filter(node => node.className === 'tb-result-title').map(node => node.textContent)).toEqual(['BetaCard']);
    expect(h.controller.status().phase).toBe('idle');
    expect(h.buttons().every(button => !button.disabled)).toBe(true);
    await h.unchanged();
  } finally { gate.release(); await heldRead; await h.cleanup(); }
});

it('controller-driven refresh gates existing attributes then restores typed searches', async () => {
  const h = await fixture(), entered = latch(), gate = latch();
  const list = h.sources.list.bind(h.sources);
  let refresh: Promise<void> | undefined;
  vi.spyOn(h.sources, 'list').mockImplementationOnce(async (...args) => { entered.release(); await gate.promise; return list(...args); });
  try {
    const oldButtons = h.buttons();
    refresh = h.controller.refresh(); await entered.promise;
    const disabledDuringRefresh = oldButtons.every(button => button.disabled);
    for (const button of oldButtons) button.fire('click');
    const callsDuringRefresh = h.find.mock.calls.length, inputDuringRefresh = h.input.value;
    gate.release(); await refresh; await Promise.allSettled(h.queries); await Promise.resolve();
    expect.soft(disabledDuringRefresh).toBe(true); expect.soft(callsDuringRefresh).toBe(1); expect.soft(inputDuringRefresh).toBe('AlphaNeedle');
    expect(h.buttons().every(button => !button.disabled)).toBe(true);
    h.get('tb-select').value = 'high';
    for (const channel of ['kind', 'topics', 'concepts', 'mechanisms', 'atmosphere']) {
      h.buttons().find(button => button.attrs['data-channel'] === channel)!.fire('click');
      expect((await h.settleQuery()).some(result => result.fragment.title === 'AlphaCard')).toBe(true);
      expect(h.find.mock.calls.at(-1)?.[3]?.channel).toBe(channel);
    }
    await h.unchanged();
  } finally { gate.release(); await refresh?.catch(() => {}); await h.cleanup(); }
});

it('cancellation re-enables old attributes and keeps the next typed result usable', async () => {
  const h = await fixture(), entered = latch(), gate = latch();
  const read = h.sources.read.bind(h.sources);
  let heldRead: ReturnType<FileSources['read']> | undefined;
  vi.spyOn(h.sources, 'read').mockImplementationOnce((...args) => heldRead = (async () => {
    const snapshot = await read(...args); entered.release(); await gate.promise; return snapshot;
  })());
  try {
    h.start('BetaNeedle'); const pending = h.queries.at(-1)!; await entered.promise;
    const disabledDuringSearch = h.buttons().every(button => button.disabled);
    h.container.all().find(node => node.textContent === 'Cancel')!.fire('click');
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    gate.release(); await heldRead; await Promise.resolve();
    expect.soft(disabledDuringSearch).toBe(true); expect(h.controller.status().phase).toBe('cancelled');
    expect(h.buttons().every(button => !button.disabled)).toBe(true);
    h.buttons().find(button => button.attrs['data-channel'] === 'topics')!.fire('click');
    expect((await h.settleQuery()).map(result => result.fragment.title)).toEqual(['AlphaCard']);
    expect(h.container.all().filter(node => node.className === 'tb-result-title').map(node => node.textContent)).toEqual(['AlphaCard']);
    await h.unchanged();
  } finally { gate.release(); await heldRead; await h.cleanup(); }
});
