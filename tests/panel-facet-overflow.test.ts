// SPDX-License-Identifier: MIT
// Authored synthetic attributes, real files/store/controller/Main PanelPort and renderer.
// DOM/host shells exercise callbacks, not native Obsidian clicks or AI inference.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import ThirdBrainPlugin from '../src/main';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults } from '../src/settings';
import { mountPanel } from '../src/ui';
import { FACET_KEYS } from '../src/core/util';
import type { Facets, SearchResult } from '../src/core/types';

vi.mock('obsidian', () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {} }));
class NodeStub {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false; open = false;
  children: NodeStub[] = []; attrs: Record<string, string> = {};
  handlers = new Map<string, Array<() => void>>();
  constructor(readonly tag: string) {}
  append(...nodes: NodeStub[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: NodeStub[]) { this.children = nodes; }
  setAttribute(key: string, value: string) { this.attrs[key] = value; }
  remove() {} focus() {}
  get childElementCount() { return this.children.length; }
  addEventListener(event: string, handler: () => void) { this.handlers.set(event, [...this.handlers.get(event) ?? [], handler]); }
  // Also dispatch disabled buttons to verify the callback's live-state guard.
  fire(event: string) { for (const handler of this.handlers.get(event) ?? []) handler(); }
  all(): NodeStub[] { return [this, ...this.children.flatMap(node => node.all())]; }
}
function latch() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const richFacets = Object.fromEntries(FACET_KEYS.map(channel => [channel, Array.from({ length: 6 }, (_, n) => `${channel}${n}`)])) as unknown as Facets;

async function fixture(facets: Partial<Facets> = richFacets, locale: 'en' | 'zh' = 'en') {
  const scope = path.resolve('.local/panel-facet-overflow');
  await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'case-'));
  const text = `---\n${Object.entries(facets).map(([key, values]) => `${key}: [${values.join(', ')}]`).join('\n')}\n---\n# Bounded observation\nReachabilityNeedle records a synthetic trial with clearly stated limits.`;
  await fs.writeFile(path.join(root, 'original.md'), text);
  const settings = { ...defaults, excludes: [], outputFolder: 'Derived' };
  const store = new OwnedStore(root, settings.outputFolder);
  const sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const factory = vi.fn(() => undefined);
  const controller = new ThirdBrainController(sources, store, () => settings, factory, async () => {});
  await controller.initialize(); await controller.refresh();
  const before = await store.load(); // Strict reload proves this is a lawful persisted card.
  expect(before).not.toBeNull();
  const owner = Object.values(before!.fragments)[0];
  const hostOpen = vi.fn(async (_file: { path: string }) => {});
  const app = { vault: { getFileByPath: (name: string) => ({ path: name }) }, workspace: { getLeaf: () => ({ openFile: hostOpen }) } };
  const port = ThirdBrainPlugin.prototype.panelPort.call({ controller, store, app } as unknown as ThirdBrainPlugin);
  const queries: Promise<SearchResult[]>[] = [], opens: Promise<void>[] = [];
  const find = port.find.bind(port), open = port.open.bind(port);
  const findSpy = vi.spyOn(port, 'find').mockImplementation((...args) => { const operation = find(...args); queries.push(operation); return operation; });
  vi.spyOn(port, 'open').mockImplementation(evidence => { const operation = open(evidence); opens.push(operation); return operation; });
  vi.stubGlobal('document', { createElement: (tag: string) => new NodeStub(tag) });
  const container = new NodeStub('main');
  const dispose = mountPanel(container as unknown as HTMLElement, port, locale);
  const get = (className: string) => container.all().find(node => node.className === className)!;
  const buttons = () => container.all().filter(node => node.className === 'tb-facet');
  const settleQuery = async () => { const result = await queries.at(-1)!; await Promise.resolve(); return result; };
  const start = () => { const input = get('tb-idea'); input.value = 'ReachabilityNeedle'; input.fire('input'); get('tb-primary').fire('click'); };
  get('tb-select').value = 'high'; start(); const initial = await settleQuery();
  const unchanged = async () => {
    expect(hash(await fs.readFile(path.join(root, 'original.md')))).toBe(hash(text));
    expect(await store.load()).toEqual(before);
    expect(factory).toHaveBeenCalledOnce(); // Refresh's local-mode factory only; never a model port.
    expect(factory.mock.results[0].value).toBeUndefined();
  };
  const cleanup = async () => { controller.cancel(); await Promise.allSettled([...queries, ...opens]); await Promise.resolve(); dispose(); controller.dispose(); };
  return { root, owner, container, sources, controller, get, buttons, findSpy, queries, opens, hostOpen, start, settleQuery, initial, unchanged, cleanup };
}

it.each(['en', 'zh'] as const)('all lawful facets remain reachable through the real card and exact original in %s', async locale => {
  const h = await fixture(richFacets, locale);
  try {
    const expected = FACET_KEYS.flatMap(channel => h.owner.facets[channel].map(value => ({ channel, value })));
    expect(expected).toHaveLength(24);
    expect(h.initial.map(item => item.fragment.id)).toEqual([h.owner.id]);
    // Baseline renderer showed only topics/concepts: 12 of these lawful 24 properties.
    expect(h.buttons().filter(button => button.attrs['data-channel'] !== 'kind')).toHaveLength(expected.length);
    const overflow = h.get('tb-facet-overflow');
    expect(overflow.tag).toBe('details'); expect(overflow.open).toBe(false);
    expect(overflow.children[0].tag).toBe('summary');
    expect(overflow.children[0].textContent).toBe(`${locale === 'en' ? 'More properties' : '更多属性'} · 12`);
    const overflowButtons = overflow.all().filter(node => node.className === 'tb-facet');
    expect(overflowButtons.map(button => button.attrs['data-channel'])).toEqual([...Array(6).fill('mechanisms'), ...Array(6).fill('atmosphere')]);
    const visible = h.get('tb-facets').children.filter(node => node.tag === 'button');
    expect(visible.map(button => button.attrs['data-channel'])).toEqual(['kind', ...Array(6).fill('topics'), ...Array(6).fill('concepts')]);
    // Native disclosure semantics are not simulated; exercise its actual descendant callbacks.
    overflow.open = true;
    for (const chosen of expected) {
      const button = h.buttons().find(node => node.attrs['data-channel'] === chosen.channel && node.textContent.endsWith(` · ${chosen.value}`))!;
      expect(button).toBeDefined(); expect(button.disabled).toBe(false); button.fire('click');
      const hits = await h.settleQuery();
      expect(h.findSpy.mock.calls.at(-1)).toEqual([chosen.value, 'high', 'normal', chosen]);
      expect(hits.map(item => item.fragment.id)).toEqual([h.owner.id]);
      expect(hits[0].reasons.some(reason => reason.kind === 'content')).toBe(false);
      const evidence = hits[0].fragment.evidence[0], current = await h.sources.read(evidence.relativePath);
      expect(current!.hash).toBe(evidence.sourceHash);
      expect(current!.text.slice(evidence.start, evidence.end)).toBe(evidence.quote);
      h.get('tb-source').fire('click'); await h.opens.at(-1)!;
    }
    expect(h.hostOpen).toHaveBeenCalledTimes(expected.length);
    expect(h.hostOpen.mock.calls.every(([file]) => file.path === 'original.md')).toBe(true);
    h.start(); expect(await h.settleQuery()).toEqual(h.initial);
    expect(h.findSpy.mock.calls.at(-1)).toHaveLength(3);
    await h.unchanged();
  } finally { await h.cleanup(); }
});

it.each([0, 12, 13])('discloses only overflow for a card with %s distinct properties', async count => {
  const topics = Array.from({ length: count }, (_, n) => `topic${n}`);
  const h = await fixture({ topics: [...topics, ...topics] });
  try {
    expect(h.owner.facets.topics).toHaveLength(count);
    expect(h.buttons().filter(button => button.attrs['data-channel'] !== 'kind')).toHaveLength(count);
    const overflow = h.get('tb-facet-overflow');
    if (count <= 12) expect(overflow).toBeUndefined();
    else {
      expect(overflow.children[0].textContent).toBe('More properties · 1');
      expect(overflow.all().filter(node => node.className === 'tb-facet')).toHaveLength(1);
    }
    expect(h.buttons().filter(button => button.attrs['data-channel'] === 'kind')).toHaveLength(1);
    await h.unchanged();
  } finally { await h.cleanup(); }
});

it('overflow callbacks respect busy/cancel and reject stale source opens without model work', async () => {
  const h = await fixture(), entered = latch(), gate = latch();
  let heldRead: ReturnType<FileSources['read']> | undefined;
  try {
    const overflow = h.get('tb-facet-overflow'); expect(overflow).toBeDefined();
    const lateButtons = overflow.all().filter(node => node.className === 'tb-facet');
    const read = h.sources.read.bind(h.sources);
    vi.spyOn(h.sources, 'read').mockImplementationOnce((...args) => heldRead = (async () => { const source = await read(...args); entered.release(); await gate.promise; return source; })());
    h.start(); const pending = h.queries.at(-1)!; await entered.promise;
    for (const button of lateButtons) { expect(button.disabled).toBe(true); button.fire('click'); }
    expect(h.findSpy).toHaveBeenCalledTimes(2); expect(h.get('tb-idea').value).toBe('ReachabilityNeedle');
    h.container.all().find(node => node.textContent === 'Cancel')!.fire('click');
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); gate.release(); await heldRead;
    expect(lateButtons.every(button => !button.disabled)).toBe(true);
    lateButtons[0].fire('click'); expect((await h.settleQuery()).map(item => item.fragment.id)).toEqual([h.owner.id]);
    await h.unchanged();
    const sourceButton = h.get('tb-source');
    sourceButton.fire('click'); await h.opens.at(-1)!; expect(h.hostOpen).toHaveBeenCalledOnce();
    // Intentional fixture edit: original-preservation proof above precedes this negative case.
    await fs.writeFile(path.join(h.root, 'original.md'), 'Synthetic changed source invalidates every old quote.');
    sourceButton.fire('click'); await expect(h.opens.at(-1)!).rejects.toThrow();
    expect(h.hostOpen).toHaveBeenCalledOnce();
  } finally { gate.release(); await heldRead; await h.cleanup(); }
});
