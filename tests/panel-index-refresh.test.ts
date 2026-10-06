// SPDX-License-Identifier: MIT
// Synthetic filesystem notes and DOM/Obsidian shells. Production Main command,
// scheduler, PanelPort, renderer, Controller, FileSources and OwnedStore are used.
// Latches/commit rejection are controlled fixtures, not native I/O fault evidence.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FileSystemAdapter } from 'obsidian';
import { afterEach, expect, it, vi } from 'vitest';
import ThirdBrainPlugin from '../src/main';
import type { FileSources } from '../src/sources';
import { hash } from '../src/sources';
import type { OwnedStore } from '../src/runtime/store';
import { defaults } from '../src/settings';
import { messages } from '../src/i18n';
import { mountPanel } from '../src/ui';
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

async function fixture(locale: 'en' | 'zh' = 'en') {
  const scope = path.resolve('.local/panel-index-refresh');
  await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'case-'));
  let expectedOriginal: string | Buffer = '---\ntopics: [SyntheticTopic]\n---\n# PriorCard\nRecallNeedle records a synthetic observation with exact evidence.';
  const sourcePath = path.join(root, 'original.md');
  await fs.writeFile(sourcePath, expectedOriginal);
  const commands = new Map<string, () => void>();
  const hostOpen = vi.fn(async (_file: { path: string }) => {});
  const save = vi.fn(async () => {});
  const app = {
    vault: {
      adapter: Object.assign(Object.create(FileSystemAdapter.prototype), { getBasePath: () => root }),
      getFiles: () => [{ path: 'original.md' }], getFileByPath: (name: string) => ({ path: name }),
    },
    workspace: { onLayoutReady: () => {}, getLeavesOfType: () => [], getLeaf: () => ({ openFile: hostOpen }) },
  };
  const plugin = Object.assign(Object.create(ThirdBrainPlugin.prototype), {
    app, loadData: async () => ({ ...defaults, excludes: [], outputFolder: 'Derived', locale }), saveData: save,
    registerView: () => {}, addRibbonIcon: () => {}, addSettingTab: () => {}, registerInterval: () => {},
    addCommand: (command: { id: string; callback: () => void }) => commands.set(command.id, command.callback),
  }) as ThirdBrainPlugin;
  vi.stubGlobal('window', { setInterval: () => 1 }); // No real timer or native UI.
  await plugin.onload();
  const controller = plugin.controller;
  const store = (plugin as unknown as { store: OwnedStore }).store;
  const sources = (controller as unknown as { sources: FileSources }).sources;
  await controller.refresh();
  const before = await store.load(); expect(before).not.toBeNull();
  const stateBytes = () => fs.readFile(path.join(root, 'Derived/.third-brain/state.json'));
  const initialBytes = await stateBytes();
  const port = plugin.panelPort();
  const queries: Promise<SearchResult[]>[] = [], opens: Promise<void>[] = [], refreshes: Promise<void>[] = [];
  const find = port.find.bind(port), open = port.open.bind(port), refresh = controller.refresh.bind(controller);
  const findSpy = vi.spyOn(port, 'find').mockImplementation((...args) => { const operation = find(...args); queries.push(operation); return operation; });
  vi.spyOn(port, 'open').mockImplementation(evidence => { const operation = open(evidence); opens.push(operation); return operation; });
  vi.spyOn(controller, 'refresh').mockImplementation(() => { const operation = refresh(); refreshes.push(operation); return operation; });
  vi.stubGlobal('document', { createElement: (tag: string) => new NodeStub(tag) });
  const container = new NodeStub('main'), t = messages(locale);
  const dispose = mountPanel(container as unknown as HTMLElement, port, locale);
  const get = (className: string) => container.all().find(node => node.className === className)!;
  const cards = () => container.all().filter(node => node.className === 'tb-result-title').map(node => node.textContent);
  const settleQuery = async () => { const items = await queries.at(-1)!; await Promise.resolve(); return items; };
  const start = () => { const input = get('tb-idea'); input.value = 'RecallNeedle'; input.fire('input'); container.all().find(node => node.textContent === t.find)!.fire('click'); };
  const runRefresh = async (entry: 'panel' | 'command' | 'scheduled') => {
    if (entry === 'panel') container.all().find(node => node.textContent === t.index)!.fire('click');
    else if (entry === 'command') commands.get('refresh-derived-layer')!();
    else {
      plugin.settings.schedule = 'daily'; plugin.settings.lastIndexedAt = '';
      await (plugin as unknown as { runScheduled(): Promise<void> }).runScheduled();
    }
    await refreshes.at(-1)!; await Promise.resolve();
  };
  const change = async (text: string | Buffer) => { expectedOriginal = text; await fs.writeFile(sourcePath, text); };
  const assertOriginal = async () => expect(hash(await fs.readFile(sourcePath))).toBe(hash(expectedOriginal));
  const cleanup = async () => { controller.cancel(); await Promise.allSettled([...queries, ...opens, ...refreshes]); await Promise.resolve(); dispose(); plugin.onunload(); };
  start(); const initial = await settleQuery();
  expect(cards()).toEqual(['PriorCard']); expect(get('tb-result-summary').textContent).toBe(`1 ${t.results}`);
  return { root, plugin, controller, store, sources, port, container, get, cards, t, find, findSpy, queries, opens, hostOpen, start, settleQuery, runRefresh, change, assertOriginal, before, stateBytes, initialBytes, initial, cleanup };
}

for (const entry of ['panel', 'command', 'scheduled'] as const) it.each(['en', 'zh'] as const)(`${entry} refresh clears previous results and permits a current source-grounded search in %s`, async locale => {
  const h = await fixture(locale);
  try {
    const oldSource = h.get('tb-source');
    oldSource.fire('click'); await h.opens.at(-1)!; expect(h.hostOpen).toHaveBeenCalledOnce();
    // Deliberate synthetic edit; the plugin must preserve these new source bytes.
    await h.change('# CurrentCard\nRecallNeedle records the revised synthetic observation, not the prior claim.');
    await h.runRefresh(entry);
    expect(h.controller.status().phase).toBe('idle');
    expect.soft(h.cards()).toEqual([]);
    expect.soft(h.get('tb-result-summary').textContent).toBe('');
    expect(h.get('tb-idea').value).toBe('RecallNeedle'); expect(h.get('tb-select').value).toBe('medium');
    expect.soft(h.get('tb-empty-title')?.textContent).toBe(h.t.initial);
    expect(h.findSpy).toHaveBeenCalledOnce(); // Refresh must never rerun a query/model automatically.
    oldSource.fire('click'); await expect(h.opens.at(-1)!).rejects.toThrow(); expect(h.hostOpen).toHaveBeenCalledOnce();
    h.start(); const current = await h.settleQuery();
    expect(h.cards()).toEqual(['CurrentCard']); expect(current[0].fragment.evidence[0].sourceHash).not.toBe(h.initial[0].fragment.evidence[0].sourceHash);
    const e = current[0].fragment.evidence[0], source = await h.sources.read(e.relativePath);
    expect(source!.hash).toBe(e.sourceHash); expect(source!.text.slice(e.start, e.end)).toBe(e.quote);
    h.get('tb-source').fire('click'); await h.opens.at(-1)!; expect(h.hostOpen).toHaveBeenCalledTimes(2);
    await h.assertOriginal();
    const complete = await h.stateBytes(); await h.controller.refresh(); expect(await h.stateBytes()).toEqual(complete);
  } finally { await h.cleanup(); }
});

it('successful refresh to an empty index removes stale cards and counts, without timestamp comparison', async () => {
  const h = await fixture();
  try {
    await h.change(' \n'); await h.runRefresh('command');
    expect(h.controller.status().fragmentCount).toBe(0);
    expect.soft(h.cards()).toEqual([]); expect.soft(h.get('tb-result-summary').textContent).toBe('');
    expect.soft(h.get('tb-empty-title')?.textContent).toBe(h.t.first);
    await h.assertOriginal();
  } finally { await h.cleanup(); }
});

it('an unchanged scheduled refresh clears the old view consistently with the panel button, preserving bytes and selection', async () => {
  const h = await fixture();
  try {
    h.container.all().find(node => node.attrs['data-channel'] === 'topics')!.fire('click'); await h.settleQuery();
    const before = h.controller.status().updatedAt;
    await h.runRefresh('scheduled');
    expect(h.controller.status().updatedAt).toBe(before); expect(await h.stateBytes()).toEqual(h.initialBytes);
    expect.soft(h.cards()).toEqual([]); expect.soft(h.get('tb-result-summary').textContent).toBe('');
    expect(h.get('tb-label').textContent).toBe('Selected facet: Topic · synthetictopic');
    h.container.all().find(node => node.textContent === h.t.find)!.fire('click'); await h.settleQuery();
    expect(h.findSpy.mock.calls.at(-1)?.[3]).toEqual({ channel: 'topics', value: 'synthetictopic' });
    expect(h.cards()).toEqual(['PriorCard']); await h.assertOriginal();
  } finally { await h.cleanup(); }
});

it.each(['decode', 'commit'] as const)('%s failure keeps the last cards and structured status; repaired refresh clears them', async fault => {
  const h = await fixture();
  try {
    if (fault === 'decode') await h.change(Buffer.from([0xc3, 0x28]));
    else vi.spyOn(h.store, 'commit').mockRejectedValueOnce(new Error('SYNTHETIC_COMMIT_FAILURE'));
    await expect(h.runRefresh('command')).rejects.toThrow();
    expect(h.controller.status().phase).toBe('error');
    expect(h.cards()).toEqual(['PriorCard']); expect(h.get('tb-result-summary').textContent).toBe(`1 ${h.t.results}`);
    expect(h.get('tb-notice').hidden).toBe(false);
    expect(h.get('tb-notice').textContent).toContain(fault === 'decode' ? h.t.decodeFailed : h.t.commitUnknown);
    expect(h.get('tb-notice').textContent).not.toContain('SYNTHETIC_COMMIT_FAILURE');
    expect(await h.stateBytes()).toEqual(h.initialBytes); // Byte preservation is not a safe-load claim after unknown commit.
    if (fault === 'decode') { h.get('tb-source').fire('click'); await expect(h.opens.at(-1)!).rejects.toThrow(); expect(h.hostOpen).not.toHaveBeenCalled(); }
    await h.change('# RepairedCard\nRecallNeedle supplies a repaired synthetic observation.');
    await h.runRefresh('command'); expect.soft(h.cards()).toEqual([]); expect.soft(h.get('tb-result-summary').textContent).toBe('');
    expect(h.get('tb-notice').hidden).toBe(true);
    h.start(); await h.settleQuery(); expect(h.cards()).toEqual(['RepairedCard']);
    h.get('tb-source').fire('click'); await h.opens.at(-1)!; expect(h.hostOpen).toHaveBeenCalledOnce();
    await h.assertOriginal();
  } finally { await h.cleanup(); }
});

it('cancelled refresh preserves usable old cards, bytes and source checks until a successful retry', async () => {
  const h = await fixture(), entered = latch(), gate = latch();
  const list = h.sources.list.bind(h.sources); let held: ReturnType<FileSources['list']> | undefined;
  vi.spyOn(h.sources, 'list').mockImplementationOnce((...args) => held = (async () => { entered.release(); await gate.promise; return list(...args); })());
  let pending: Promise<void> | undefined;
  try {
    pending = h.controller.refresh(); await entered.promise;
    expect(h.controller.status().phase).toBe('indexing'); expect(h.cards()).toEqual(['PriorCard']);
    h.controller.cancel(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); gate.release(); await held?.catch(() => {});
    expect(h.controller.status().phase).toBe('cancelled'); expect(h.cards()).toEqual(['PriorCard']);
    expect(h.get('tb-result-summary').textContent).toBe(`1 ${h.t.results}`); expect(await h.stateBytes()).toEqual(h.initialBytes);
    h.get('tb-source').fire('click'); await h.opens.at(-1)!; expect(h.hostOpen).toHaveBeenCalledOnce();
    await h.runRefresh('command'); expect.soft(h.cards()).toEqual([]); expect.soft(h.get('tb-result-summary').textContent).toBe('');
    h.start(); await h.settleQuery(); expect(h.cards()).toEqual(['PriorCard']);
    expect(await h.store.load()).toEqual(h.before); await h.assertOriginal();
  } finally { gate.release(); await held?.catch(() => {}); await pending?.catch(() => {}); await h.cleanup(); }
});

it('a delayed pre-refresh query reply cannot repaint cards from the previous index', async () => {
  const h = await fixture(), entered = latch(), gate = latch();
  try {
    h.findSpy.mockImplementationOnce((...args) => {
      const operation = (async () => { const items = await h.find(...args); entered.release(); await gate.promise; return items; })();
      h.queries.push(operation); return operation;
    });
    h.start(); await entered.promise; // Real query finished; only the synthetic adapter delivery is held.
    await h.change('# CurrentCard\nRecallNeedle is now supported by a revised synthetic source.');
    await h.runRefresh('command'); gate.release(); await h.settleQuery();
    expect.soft(h.cards()).toEqual([]); expect.soft(h.get('tb-result-summary').textContent).toBe('');
    h.start(); await h.settleQuery(); expect(h.cards()).toEqual(['CurrentCard']); await h.assertOriginal();
  } finally { gate.release(); await h.cleanup(); }
});
