// SPDX-License-Identifier: MIT
// Authored synthetic notes, real FileSources/OwnedStore and Main PanelPort.
// DOM/Obsidian shells and controlled read/commit latches are not native-host proof.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FileSystemAdapter } from 'obsidian';
import { afterEach, expect, it, vi } from 'vitest';
import ThirdBrainPlugin from '../src/main';
import { defaults } from '../src/settings';
import { messages } from '../src/i18n';
import { mountPanel } from '../src/ui';
import { hash, type FileSources } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import type { SearchResult } from '../src/core/types';

vi.mock('obsidian', () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, FileSystemAdapter: class {}, Notice: class {} }));
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
const emptyTitle = { en: 'No usable fragments from the last refresh', zh: '上次更新没有得到可用片段' };
type Scenario = 'no-notes' | 'blank' | 'sparse' | 'excluded';
async function fixture(locale: 'en' | 'zh', scenario: Scenario, holdInitialLoad = false) {
  const scope = path.resolve('.local/empty-index-panel/cases');
  await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'case-'));
  const expected = new Map<string, string | Buffer>();
  const put = async (name: string, text: string | Buffer) => {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), text); expected.set(name, text);
  };
  await put('Derived/handwritten.txt', 'A synthetic user-authored file: never adopt or overwrite.');
  if (scenario !== 'no-notes') await put('original.md', scenario === 'blank' ? ' \n' : scenario === 'sparse' ? 'todo' : 'RecallNeedle preserves a synthetic observation.');
  const hostOpen = vi.fn(async () => {}), commands = new Map<string, () => void>();
  const plugin = Object.assign(Object.create(ThirdBrainPlugin.prototype), {
    app: {
      vault: {
        adapter: Object.assign(Object.create(FileSystemAdapter.prototype), { getBasePath: () => root }),
        getFiles: () => [...expected.keys()].map(path => ({ path })), getFileByPath: (path: string) => ({ path }),
      },
      workspace: { onLayoutReady: () => {}, getLeavesOfType: () => [], getLeaf: () => ({ openFile: hostOpen }) },
    },
    loadData: async () => ({ ...defaults, outputFolder: 'Derived', locale, excludes: scenario === 'excluded' ? ['original.md'] : [] }),
    saveData: async () => {}, registerView: () => {}, addRibbonIcon: () => {}, addSettingTab: () => {}, registerInterval: () => {},
    addCommand: (command: { id: string; callback: () => void }) => commands.set(command.id, command.callback),
  }) as ThirdBrainPlugin;
  vi.stubGlobal('window', { setInterval: () => 1 });
  vi.stubGlobal('document', { createElement: (tag: string) => new NodeStub(tag) });
  const loadEntered = latch(), loadGate = latch();
  if (holdInitialLoad) {
    const load = OwnedStore.prototype.load;
    vi.spyOn(OwnedStore.prototype, 'load').mockImplementationOnce(async function (this: OwnedStore) {
      loadEntered.release(); await loadGate.promise; return load.call(this);
    });
  }
  const loading = plugin.onload();
  if (holdInitialLoad) await loadEntered.promise; else await loading;
  const finishLoad = async () => { loadGate.release(); await loading; };
  const controller = plugin.controller, store = (plugin as unknown as { store: OwnedStore }).store;
  const sources = (controller as unknown as { sources: FileSources }).sources, port = plugin.panelPort();
  const refreshes: Promise<void>[] = [], queries: Promise<SearchResult[]>[] = [], opens: Promise<void>[] = [];
  const refresh = controller.refresh.bind(controller), find = port.find.bind(port), open = port.open.bind(port);
  vi.spyOn(controller, 'refresh').mockImplementation(() => { const p = refresh(); refreshes.push(p); return p; });
  const findSpy = vi.spyOn(port, 'find').mockImplementation((...args) => { const p = find(...args); queries.push(p); return p; });
  vi.spyOn(port, 'open').mockImplementation(e => { const p = open(e); opens.push(p); return p; });
  const t = messages(locale), container = new NodeStub('main');
  let dispose = mountPanel(container as unknown as HTMLElement, port, locale);
  const get = (cls: string) => container.all().find(n => n.className === cls)!;
  const button = (label: string) => container.all().find(n => n.tag === 'button' && n.textContent === label)!;
  const title = () => get('tb-empty-title')?.textContent;
  const body = () => get('tb-results').children.map(n => n.textContent).join(' ');
  const stateBytes = () => fs.readFile(path.join(root, 'Derived/.third-brain/state.json'));
  const assertOriginals = async () => { for (const [name, bytes] of expected) expect(hash(await fs.readFile(path.join(root, name)))).toBe(hash(bytes)); };
  const runRefresh = async (entry: 'panel' | 'command' | 'scheduled' = 'panel') => {
    if (entry === 'panel') button(t.index).fire('click');
    else if (entry === 'command') commands.get('refresh-derived-layer')!();
    else { plugin.settings.schedule = 'daily'; plugin.settings.lastIndexedAt = ''; await (plugin as unknown as { runScheduled(): Promise<void> }).runScheduled(); }
    await refreshes.at(-1)!; await Promise.resolve();
  };
  const reload = async () => { dispose(); await controller.initialize(); dispose = mountPanel(container as unknown as HTMLElement, port, locale); };
  const cleanup = async () => { await finishLoad(); controller.cancel(); await Promise.allSettled([...refreshes, ...queries, ...opens]); dispose(); plugin.onunload(); };
  return { plugin, controller, store, sources, t, get, button, title, body, stateBytes, assertOriginals, runRefresh, reload, put, findSpy, queries, opens, hostOpen, finishLoad, cleanup };
}

for (const scenario of ['no-notes', 'blank', 'sparse', 'excluded'] as const) it.each(['en', 'zh'] as const)(`${scenario}: completed empty refresh is not first-use guidance, including strict reload in %s`, async locale => {
  const h = await fixture(locale, scenario);
  try {
    expect(h.controller.status().hasCompleteIndex).toBe(false); expect(h.title()).toBe(h.t.first);
    expect(await h.store.load()).toBeNull();
    await h.runRefresh(scenario === 'excluded' ? 'command' : scenario === 'sparse' ? 'scheduled' : 'panel');
    expect(h.controller.status()).toMatchObject({ phase: 'idle', hasCompleteIndex: true, fragmentCount: 0, sourceCount: ['blank', 'sparse'].includes(scenario) ? 1 : 0 });
    const loaded = await h.store.load(); expect(loaded).not.toBeNull(); expect(loaded!.fragments).toEqual({});
    if (scenario === 'blank' || scenario === 'sparse') expect(loaded!.sources['original.md'].status).toBe(scenario === 'blank' ? 'empty' : 'insufficient-context');
    expect.soft(h.title()).toBe(emptyTitle[locale]); expect.soft(h.body()).not.toContain(h.t.firstBody);
    expect(h.button(h.t.find).hidden).toBe(true); expect(h.findSpy).not.toHaveBeenCalled();
    const bytes = await h.stateBytes(); await h.runRefresh(); expect(await h.stateBytes()).toEqual(bytes);
    expect.soft(h.title()).toBe(emptyTitle[locale]);
    await h.reload(); expect(h.controller.status().hasCompleteIndex).toBe(true);
    expect.soft(h.title()).toBe(emptyTitle[locale]); expect.soft(h.body()).not.toContain(h.t.firstBody);
    expect.soft(h.body()).toContain(locale === 'en' ? (scenario === 'no-notes' || scenario === 'excluded' ? 'No source notes were included' : 'Empty or low-context notes') : (scenario === 'no-notes' || scenario === 'excluded' ? '没有纳入来源笔记' : '空白、语境不足'));
    await h.assertOriginals();
  } finally { await h.cleanup(); }
});

it.each(['en', 'zh'] as const)('loading and pending durable commit do not claim an empty refresh completed in %s', async locale => {
  const h = await fixture(locale, 'blank', true);
  let pending: Promise<void> | undefined;
  try {
    expect(h.controller.status().phase).toBe('loading');
    expect(h.get('tb-status').textContent).toContain(h.t.loading);
    expect(h.title()).toBeUndefined();
    await h.finishLoad();
    expect(h.controller.status().hasCompleteIndex).toBe(false); expect(h.title()).not.toBe(emptyTitle[locale]);
    const commitEntered = latch(), commitGate = latch(), commit = h.store.commit.bind(h.store);
    vi.spyOn(h.store, 'commit').mockImplementationOnce(async (...args) => { commitEntered.release(); await commitGate.promise; return commit(...args); });
    try {
      pending = h.controller.refresh(); await commitEntered.promise;
      expect(h.controller.status()).toMatchObject({ phase: 'indexing', hasCompleteIndex: false });
      expect(h.title()).not.toBe(emptyTitle[locale]); expect(await h.store.load()).toBeNull();
      commitGate.release(); await pending; expect.soft(h.title()).toBe(emptyTitle[locale]);
    } finally { commitGate.release(); await pending?.catch(() => {}); }
    await h.assertOriginals();
  } finally { await h.finishLoad(); await pending?.catch(() => {}); await h.cleanup(); }
});

for (const priorEmpty of [false, true]) for (const fault of ['decode', 'commit', 'cancel'] as const) it(`${fault} with prior empty=${priorEmpty} never claims success; repaired refresh recovers`, async () => {
  const h = await fixture('en', 'blank'), entered = latch(), gate = latch();
  let pending: Promise<void> | undefined, held: ReturnType<FileSources['list']> | undefined;
  try {
    if (priorEmpty) await h.runRefresh();
    const before = priorEmpty ? await h.stateBytes() : null;
    if (fault === 'decode') await h.put('original.md', Buffer.from([0xc3, 0x28]));
    if (fault === 'commit') vi.spyOn(h.store, 'commit').mockRejectedValueOnce(new Error('SYNTHETIC_COMMIT_FAILURE'));
    if (fault === 'cancel') {
      const list = h.sources.list.bind(h.sources);
      vi.spyOn(h.sources, 'list').mockImplementationOnce((...args) => held = (async () => { entered.release(); await gate.promise; return list(...args); })());
      pending = h.controller.refresh(); await entered.promise; h.button(h.t.cancel).fire('click');
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); gate.release(); await held?.catch(() => {});
    } else await expect(h.runRefresh()).rejects.toThrow();
    expect(h.controller.status()).toMatchObject({ phase: fault === 'cancel' ? 'cancelled' : 'error', hasCompleteIndex: priorEmpty });
    expect.soft(h.title()).toBe(fault === 'cancel' ? h.t.cancelled : h.t.error);
    expect.soft(h.body()).not.toContain(h.t.firstBody); expect(h.title()).not.toBe(emptyTitle.en);
    expect(h.get('tb-notice').hidden).toBe(false);
    expect(h.get('tb-notice').textContent).toContain(fault === 'commit' ? h.t.commitUnknown : fault === 'decode' ? h.t.decodeFailed : h.t.cancelled);
    expect(h.get('tb-notice').textContent).not.toContain('SYNTHETIC_COMMIT_FAILURE');
    if (before) expect(await h.stateBytes()).toEqual(before); else expect(await h.store.load()).toBeNull();
    await h.put('original.md', ' '); await h.runRefresh(); expect.soft(h.title()).toBe(emptyTitle.en);
    expect(h.get('tb-notice').hidden).toBe(true); await h.assertOriginals();
  } finally { gate.release(); await held?.catch(() => {}); await pending?.catch(() => {}); await h.cleanup(); }
});

it.each(['en', 'zh'] as const)('after adding context, empty-index guidance gives way to real search and original open in %s', async locale => {
  const h = await fixture(locale, 'sparse');
  try {
    await h.runRefresh(); expect.soft(h.title()).toBe(emptyTitle[locale]);
    await h.put('original.md', '# Synthetic observation\nRecallNeedle records a useful and precise observation.');
    await h.runRefresh(); expect(h.title()).toBe(h.t.initial); expect(h.button(h.t.find).hidden).toBe(false);
    const input = h.get('tb-idea'); input.value = 'RecallNeedle'; input.fire('input'); h.button(h.t.find).fire('click');
    const items = await h.queries.at(-1)!; await Promise.resolve(); expect(items).toHaveLength(1);
    for (const e of items[0].fragment.evidence) {
      const source = await h.sources.read(e.relativePath); expect(source!.hash).toBe(e.sourceHash); expect(source!.text.slice(e.start, e.end)).toBe(e.quote);
    }
    h.get('tb-source').fire('click'); await h.opens.at(-1)!; expect(h.hostOpen).toHaveBeenCalledOnce();
    const bytes = await h.stateBytes(); await h.runRefresh(); expect(await h.stateBytes()).toEqual(bytes); await h.assertOriginals();
  } finally { await h.cleanup(); }
});
