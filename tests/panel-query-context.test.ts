// SPDX-License-Identifier: MIT
// Synthetic notes + DOM/Obsidian shells, production renderer/Main PanelPort/
// Controller/FileSources/OwnedStore. Controlled delays are not native I/O evidence.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { MarkdownView } from 'obsidian';
import { afterEach, expect, it, vi } from 'vitest';
import ThirdBrainPlugin from '../src/main';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults } from '../src/settings';
import { messages } from '../src/i18n';
import { mountPanel } from '../src/ui';
import type { SearchResult } from '../src/core/types';

vi.mock('obsidian', () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, MarkdownView: class {} }));
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
  fire(event: string) { for (const handler of this.handlers.get(event) ?? []) handler(); }
  all(): NodeStub[] { return [this, ...this.children.flatMap(node => node.all())]; }
}
function latch() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function fixture(locale: 'en' | 'zh' = 'en', seeded = true) {
  const scope = path.resolve('.local/panel-query-context');
  await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'case-'));
  const originals = {
    'alpha.md': '---\ntopics: [AlphaTopic]\n---\n# AlphaCard\nAlphaNeedle preserves a synthetic observation and its limits.',
    'beta.md': '# BetaCard\nBetaNeedle preserves a different synthetic observation and its original evidence.',
  };
  for (const [name, text] of Object.entries(originals)) await fs.writeFile(path.join(root, name), text);
  const settings = { ...defaults, excludes: [], outputFolder: 'Derived' };
  const store = new OwnedStore(root, settings.outputFolder);
  const sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const factory = vi.fn(() => undefined);
  const controller = new ThirdBrainController(sources, store, () => settings, factory, async () => {});
  await controller.initialize(); await controller.refresh();
  const before = await store.load(); expect(before).not.toBeNull();
  const stateBytes = await fs.readFile(path.join(root, 'Derived/.third-brain/state.json'));
  const hostOpen = vi.fn(async (_file: { path: string }) => {});
  // Main must combine the unchanged disk original and FULL private draft before using the selection.
  const view = Object.assign(Object.create(MarkdownView.prototype), {
    file: { path: 'beta.md' }, editor: { getValue: () => '---\nprivacy: private\n---\nBetaNeedle', getSelection: () => 'BetaNeedle' },
  });
  const app = {
    vault: { getFileByPath: (name: string) => ({ path: name }) },
    workspace: { getLeaf: () => ({ openFile: hostOpen }), getActiveFile: () => ({ path: 'beta.md', extension: 'md' }), getLeavesOfType: () => [{ view }] },
  };
  const port = ThirdBrainPlugin.prototype.panelPort.call({ controller, store, app } as unknown as ThirdBrainPlugin);
  const queries: Promise<SearchResult[]>[] = [], opens: Promise<void>[] = [], contexts: ReturnType<NonNullable<typeof port.current>>[] = [];
  const find = port.find.bind(port), open = port.open.bind(port), current = port.current!.bind(port);
  const findSpy = vi.spyOn(port, 'find').mockImplementation((...args) => { const operation = find(...args); queries.push(operation); return operation; });
  vi.spyOn(port, 'open').mockImplementation(evidence => { const operation = open(evidence); opens.push(operation); return operation; });
  vi.spyOn(port, 'current').mockImplementation(() => { const operation = current(); contexts.push(operation); return operation; });
  vi.stubGlobal('document', { createElement: (tag: string) => new NodeStub(tag) });
  const container = new NodeStub('main'), t = messages(locale);
  const previous = locale === 'zh' ? '上次搜索结果；再次寻找关联以更新' : 'Previous search results; search again to update';
  const dispose = mountPanel(container as unknown as HTMLElement, port, locale);
  const get = (className: string) => container.all().find(node => node.className.split(' ').includes(className))!;
  const button = (text: string) => container.all().find(node => node.tag === 'button' && node.textContent === text)!;
  const cards = () => container.all().filter(node => node.className === 'tb-result-title').map(node => node.textContent);
  const type = (text: string) => { get('tb-idea').value = text; get('tb-idea').fire('input'); };
  const search = () => button(t.find).fire('click');
  const settleQuery = async () => { const items = await queries.at(-1)!; await Promise.resolve(); return items; };
  const assertUnchanged = async (refreshCount = 1) => {
    for (const [name, text] of Object.entries(originals)) expect(hash(await fs.readFile(path.join(root, name)))).toBe(hash(text));
    expect(await fs.readFile(path.join(root, 'Derived/.third-brain/state.json'))).toEqual(stateBytes);
    expect(await store.load()).toEqual(before);
    expect(factory).toHaveBeenCalledTimes(refreshCount);
    expect(factory.mock.results.every(result => result.type === 'return' && result.value === undefined)).toBe(true);
  };
  const cleanup = async () => { controller.cancel(); await Promise.allSettled([...queries, ...opens, ...contexts]); await Promise.resolve(); dispose(); controller.dispose(); };
  if (seeded) { type('AlphaNeedle'); search(); await settleQuery(); expect(cards()).toEqual(['AlphaCard']); expect(get('tb-result-summary').textContent).toBe(`1 ${t.results}`); }
  return { root, sources, controller, port, container, get, button, cards, type, search, settleQuery, find, findSpy, queries, opens, contexts, hostOpen, assertUnchanged, cleanup, t, previous };
}

for (const edit of ['BetaNeedle', ''] as const) it.each(['en', 'zh'] as const)(`editing the idea to ${edit || '(blank)'} labels retained results without a new search in %s`, async locale => {
  const h = await fixture(locale);
  try {
    const oldSource = h.get('tb-source'), oldReason = h.get('tb-reason').textContent;
    h.type(edit);
    expect.soft(h.get('tb-result-summary').textContent).toBe(`${h.previous} · 1 ${h.t.results}`);
    expect(h.cards()).toEqual(['AlphaCard']); expect(h.get('tb-reason').textContent).toBe(oldReason);
    expect(h.button(h.t.find).disabled).toBe(!edit); expect(h.findSpy).toHaveBeenCalledOnce();
    h.type(`${edit} `); // Repeated input events must not stack the previous-search label.
    expect.soft(h.get('tb-result-summary').textContent).toBe(`${h.previous} · 1 ${h.t.results}`);
    oldSource.fire('click'); await h.opens.at(-1)!; expect(h.hostOpen).toHaveBeenCalledOnce();
    h.type('BetaNeedle'); h.search(); const next = await h.settleQuery();
    expect(h.cards()).toEqual(['BetaCard']); expect(h.get('tb-result-summary').textContent).toBe(`1 ${h.t.results}`);
    const e = next[0].fragment.evidence[0], source = await h.sources.read(e.relativePath);
    expect(source!.hash).toBe(e.sourceHash); expect(source!.text.slice(e.start, e.end)).toBe(e.quote);
    h.get('tb-source').fire('click'); await h.opens.at(-1)!; expect(h.hostOpen.mock.calls.at(-1)?.[0].path).toBe('beta.md');
    await h.assertUnchanged();
  } finally { await h.cleanup(); }
});

it.each(['en', 'zh'] as const)('loading a current note labels the old facet results and preserves full-draft privacy in %s', async locale => {
  const h = await fixture(locale);
  try {
    h.container.all().find(node => node.attrs['data-channel'] === 'topics')!.fire('click'); await h.settleQuery();
    expect(h.findSpy.mock.calls.at(-1)?.[3]).toEqual({ channel: 'topics', value: 'alphatopic' });
    h.button(h.t.current).fire('click'); await h.contexts.at(-1)!; await Promise.resolve();
    expect(h.get('tb-idea').value).toBe('BetaNeedle'); expect(h.get('tb-label').textContent).toBe(h.t.idea);
    expect.soft(h.get('tb-result-summary').textContent).toBe(`${h.previous} · 1 ${h.t.results}`);
    expect(h.get('tb-privacy').hidden).toBe(false); expect(h.findSpy).toHaveBeenCalledTimes(2);
    h.search(); await h.settleQuery();
    expect(h.findSpy.mock.calls.at(-1)).toEqual(['BetaNeedle', 'medium', 'private']);
    expect(h.cards()).toEqual(['BetaCard']); expect(h.get('tb-result-summary').textContent).toBe(`1 ${h.t.results}`);
    await h.assertUnchanged();
  } finally { await h.cleanup(); }
});

it('marks a previous empty result too, but does not invent a previous search on first input', async () => {
  const h = await fixture('en', false);
  try {
    h.type('UnmatchedNeedle'); expect(h.get('tb-result-summary').textContent).toBe(''); expect(h.findSpy).not.toHaveBeenCalled();
    h.search(); expect(await h.settleQuery()).toEqual([]); expect(h.get('tb-result-summary').textContent).toBe(`0 ${h.t.results}`);
    h.type('AlphaNeedle'); expect.soft(h.get('tb-result-summary').textContent).toBe(`${h.previous} · 0 ${h.t.results}`);
    expect(h.cards()).toEqual([]); expect(h.findSpy).toHaveBeenCalledOnce();
    h.search(); await h.settleQuery(); expect(h.cards()).toEqual(['AlphaCard']); await h.assertUnchanged();
  } finally { await h.cleanup(); }
});

it.each(['cancel', 'failure'] as const)('%s keeps old cards explicitly marked with unchanged source-open checks and retry', async outcome => {
  const h = await fixture(), entered = latch(), gate = latch();
  const read = h.sources.read.bind(h.sources); let held: ReturnType<FileSources['read']> | undefined;
  vi.spyOn(h.sources, 'read').mockImplementationOnce((...args) => held = (async () => {
    const source = await read(...args); entered.release(); await gate.promise;
    if (outcome === 'failure') throw new Error('SYNTHETIC_READ_FAILURE');
    return source;
  })());
  try {
    h.type('BetaNeedle'); h.search(); const pending = h.queries.at(-1)!; await entered.promise;
    expect.soft(h.get('tb-result-summary').textContent).toBe(`${h.previous} · 1 ${h.t.results}`);
    if (outcome === 'cancel') h.button(h.t.cancel).fire('click');
    gate.release(); await expect(pending).rejects.toThrow(); await held?.catch(() => {}); await Promise.resolve();
    expect(h.controller.status().phase).toBe(outcome === 'cancel' ? 'cancelled' : 'error');
    expect(h.cards()).toEqual(['AlphaCard']); expect.soft(h.get('tb-result-summary').textContent).toBe(`${h.previous} · 1 ${h.t.results}`);
    expect(h.get('tb-notice').hidden).toBe(false); expect(h.get('tb-notice').textContent).not.toContain('SYNTHETIC_READ_FAILURE');
    h.get('tb-source').fire('click'); await h.opens.at(-1)!; expect(h.hostOpen).toHaveBeenCalledOnce();
    h.search(); await h.settleQuery(); expect(h.cards()).toEqual(['BetaCard']);
    expect(h.get('tb-result-summary').textContent).toBe(`1 ${h.t.results}`); await h.assertUnchanged();
  } finally { gate.release(); await held?.catch(() => {}); await h.cleanup(); }
});

it('a late completed query cannot relabel retained results as matching a newer edit', async () => {
  const h = await fixture(), entered = latch(), gate = latch();
  try {
    h.findSpy.mockImplementationOnce((...args) => {
      const operation = (async () => { const items = await h.find(...args); entered.release(); await gate.promise; return items; })();
      h.queries.push(operation); return operation;
    });
    h.type('BetaNeedle'); h.search(); await entered.promise; // Query complete; fixture delays only delivery.
    h.type('Newer unsent idea'); gate.release(); await h.settleQuery();
    expect(h.cards()).toEqual(['AlphaCard']); expect.soft(h.get('tb-result-summary').textContent).toBe(`${h.previous} · 1 ${h.t.results}`);
    expect(h.get('tb-idea').value).toBe('Newer unsent idea'); expect(h.findSpy).toHaveBeenCalledTimes(2);
    await h.controller.refresh(); expect(h.cards()).toEqual([]); expect(h.get('tb-result-summary').textContent).toBe('');
    h.type('BetaNeedle'); h.search(); await h.settleQuery(); expect(h.cards()).toEqual(['BetaCard']); await h.assertUnchanged(2);
  } finally { gate.release(); await h.cleanup(); }
});

it('previous-search marking never bypasses changed-source refusal', async () => {
  const h = await fixture();
  try {
    const oldSource = h.get('tb-source'); h.type('BetaNeedle');
    oldSource.fire('click'); await h.opens.at(-1)!; expect(h.hostOpen).toHaveBeenCalledOnce();
    await h.assertUnchanged();
    // Intentional synthetic mutation, after original-preservation checks.
    await fs.writeFile(path.join(h.root, 'alpha.md'), 'Synthetic changed source invalidates the old quotation.');
    oldSource.fire('click'); await expect(h.opens.at(-1)!).rejects.toThrow(); expect(h.hostOpen).toHaveBeenCalledOnce();
    expect.soft(h.get('tb-result-summary').textContent).toBe(`${h.previous} · 1 ${h.t.results}`);
  } finally { await h.cleanup(); }
});
