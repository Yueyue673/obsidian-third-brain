// SPDX-License-Identifier: MIT
// Registered command -> real Main/Controller/FileSources/OwnedStore/renderer.
// Only synthetic notes and host/DOM shells; load latches are not real disk faults
// or native Obsidian command-palette evidence. No model/provider requests.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FileSystemAdapter, MarkdownView } from 'obsidian';
import { afterEach, expect, it, vi } from 'vitest';
import ThirdBrainPlugin from '../src/main';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults } from '../src/settings';
import { messages } from '../src/i18n';
import { mountPanel } from '../src/ui';

const notices = vi.hoisted(() => [] as string[]);
vi.mock('obsidian', () => ({
  Plugin: class { constructor(readonly app: unknown) {} }, ItemView: class {}, PluginSettingTab: class {},
  FileSystemAdapter: class {}, MarkdownView: class {}, Notice: class { constructor(text: string) { notices.push(text); } },
}));
class NodeStub {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false;
  children: NodeStub[] = []; handlers = new Map<string, Array<() => void>>();
  constructor(readonly tag: string) {}
  append(...nodes: NodeStub[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: NodeStub[]) { this.children = nodes; }
  setAttribute() {} remove() {} focus() {}
  get childElementCount() { return this.children.length; }
  addEventListener(event: string, handler: () => void) { this.handlers.set(event, [...this.handlers.get(event) ?? [], handler]); }
  fire(event: string) { for (const handler of this.handlers.get(event) ?? []) handler(); }
  all(): NodeStub[] { return [this, ...this.children.flatMap(node => node.all())]; }
}
function latch() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); notices.length = 0; });
const loadingGuidance = {
  en: 'The generated layer is still loading. No refresh started. Wait for loading to finish, then choose Refresh notes again.',
  zh: '提炼层仍在加载，本次没有开始更新。请等加载结束后，再选择“更新笔记”。',
};
type Entry = 'startup' | 'folder-change';
async function fixture(locale: 'en' | 'zh', indexed: boolean, entry: Entry = 'startup') {
  const scope = path.resolve('.local/refresh-command-loading/cases'); await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'case-'));
  const original = '# Synthetic observation\nCommandNeedle preserves a precise observation and the exact original quotation.';
  const human = 'Synthetic user-authored file in the output folder; never owned.';
  await fs.writeFile(path.join(root, 'original.md'), original);
  await fs.mkdir(path.join(root, 'Derived')); await fs.writeFile(path.join(root, 'Derived/manual.txt'), human);
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] as string[], locale };
  const seedStore = new OwnedStore(root, 'Derived'), seedSources = new FileSources(root, () => settings, () => seedStore.managedSourcePaths());
  if (indexed) {
    const seed = new ThirdBrainController(seedSources, seedStore, () => settings, () => undefined, async () => {});
    await seed.initialize(); await seed.refresh(); seed.dispose();
  }
  const loaded = await seedStore.load(), statePath = path.join(root, 'Derived/.third-brain/state.json');
  const stateBytes = indexed ? await fs.readFile(statePath) : null;
  const targetPath = loaded ? path.join(root, await seedStore.fragmentPath(Object.keys(loaded.fragments)[0])) : null;
  const targetBytes = targetPath ? await fs.readFile(targetPath) : null;
  const commands = new Map<string, () => void>(), save = vi.fn(async () => {}), hostOpen = vi.fn(async () => {});
  const opened = Object.assign(Object.create(MarkdownView.prototype), {
    file: { path: 'original.md' }, getMode: () => 'source',
    editor: { getValue: () => original, setSelection: vi.fn(), scrollIntoView: vi.fn() },
  });
  const makePlugin = (folder: string) => {
    const plugin = new ThirdBrainPlugin({
      vault: { adapter: Object.assign(Object.create(FileSystemAdapter.prototype), { getBasePath: () => root }),
        getFiles: () => [{ path: 'original.md' }], getFileByPath: (name: string) => ({ path: name, extension: 'md' }) },
      workspace: { onLayoutReady: () => {}, getLeavesOfType: () => [], getLeaf: () => ({ openFile: hostOpen, view: opened }) },
    } as never, {} as never);
    Object.assign(plugin, {
      loadData: async () => ({ ...settings, outputFolder: folder }), saveData: save,
      registerView: () => {}, addRibbonIcon: () => {}, addSettingTab: () => {}, registerInterval: () => {},
      addCommand: (command: { id: string; callback: () => void }) => commands.set(command.id, command.callback),
    }); return plugin;
  };
  vi.stubGlobal('window', { setInterval: () => 1 });
  vi.stubGlobal('document', { createElement: (tag: string) => new NodeStub(tag) });
  const plugin = makePlugin(entry === 'startup' ? 'Derived' : 'Prior Derived');
  if (entry === 'folder-change') await plugin.onload();
  const gate = latch(), entered = latch(), load = OwnedStore.prototype.load; let held = false;
  vi.spyOn(OwnedStore.prototype, 'load').mockImplementation(async function (this: OwnedStore) {
    if (!held && (this as unknown as { folder: string }).folder === 'Derived') {
      held = true; entered.release(); await gate.promise;
    }
    return load.call(this);
  });
  let loading: Promise<void>;
  if (entry === 'startup') loading = plugin.onload();
  else { plugin.settings.outputFolder = 'Derived'; loading = plugin.persistSettings(); }
  await entered.promise;
  const controller = plugin.controller, store = (plugin as unknown as { store: OwnedStore }).store;
  const sources = (controller as unknown as { sources: FileSources }).sources;
  const commit = vi.spyOn(store, 'commit'), list = vi.spyOn(sources, 'list'), queries = vi.spyOn(controller, 'find');
  const refreshes: Promise<void>[] = [], refresh = controller.refresh.bind(controller);
  const refreshSpy = vi.spyOn(controller, 'refresh').mockImplementation(() => { const op = refresh(); refreshes.push(op); return op; });
  const container = new NodeStub('main'), port = plugin.panelPort(), t = messages(locale);
  const draft = { text: 'CommandNeedle unfinished idea', privacy: 'private' as const, breadth: 'high' as const, selection: { channel: 'kind' as const, value: 'excerpt' as const } };
  const dispose = mountPanel(container as unknown as HTMLElement, port, locale, draft);
  const get = (cls: string) => container.all().find(node => node.className.split(/\s+/).includes(cls))!;
  const command = () => commands.get('refresh-derived-layer')!();
  const finishLoad = async () => { gate.release(); await loading; await nextTurn(); };
  const unchanged = async () => {
    expect(hash(await fs.readFile(path.join(root, 'original.md')))).toBe(hash(original));
    expect(await fs.readFile(path.join(root, 'Derived/manual.txt'), 'utf8')).toBe(human);
    if (stateBytes) expect(await fs.readFile(statePath)).toEqual(stateBytes);
    else await expect(fs.stat(statePath)).rejects.toMatchObject({ code: 'ENOENT' });
  };
  const cleanup = async () => { gate.release(); await loading; controller.cancel(); await Promise.allSettled(refreshes); await nextTurn(); dispose(); plugin.onunload(); };
  return { root, plugin, makePlugin, controller, store, port, t, command, finishLoad, cleanup, unchanged, refreshSpy, refreshes, commit, list, queries, save, get, dispose, draft, hostOpen, opened, targetPath, targetBytes, statePath, stateBytes, loaded };
}

for (const entry of ['startup', 'folder-change'] as const) for (const indexed of [false, true])
it.each(['en', 'zh'] as const)(`${entry} refresh command during ${indexed ? 'saved' : 'empty'} layer loading explains no work started in %s`, async locale => {
  const h = await fixture(locale, indexed, entry);
  try {
    const before = h.controller.status(), saves = h.save.mock.calls.length, input = h.get('tb-idea');
    expect(before.phase).toBe('loading'); expect(h.get('tb-status').textContent).toContain(h.t.loading);
    h.command(); await nextTurn();
    expect.soft(notices).toEqual([loadingGuidance[locale]]);
    expect.soft(h.refreshSpy).not.toHaveBeenCalled();
    expect(h.controller.status()).toEqual(before); expect(h.list).not.toHaveBeenCalled(); expect(h.commit).not.toHaveBeenCalled();
    expect(h.save).toHaveBeenCalledTimes(saves); expect(h.queries).not.toHaveBeenCalled();
    expect(h.get('tb-idea') === input).toBe(true); expect(input.value).toBe(h.draft.text);
    expect(h.get('tb-privacy').hidden).toBe(false); expect(h.get('tb-select').value).toBe('high');
    expect(h.get('tb-label').textContent).toContain(h.t.kind_excerpt); expect(h.get('tb-notice').hidden).toBe(true);
    await h.unchanged(); await h.finishLoad();
    expect(h.controller.status()).toMatchObject({ phase: 'idle', hasCompleteIndex: indexed });
    expect(h.get('tb-idea') === input).toBe(true); expect(h.queries).not.toHaveBeenCalled();
    expect(h.list).not.toHaveBeenCalled(); expect(h.commit).not.toHaveBeenCalled();
    await h.unchanged(); expect(await h.store.load()).toEqual(h.loaded);
    // Only this fresh explicit command may start maintenance. It is not queued by loading.
    const beforeRetry = h.refreshes.length; h.command(); expect(h.refreshes.length).toBe(beforeRetry + 1);
    await h.refreshes.at(-1); await nextTurn(); expect(h.controller.status().phase).toBe('idle'); expect(h.commit).toHaveBeenCalledOnce();
    const bytes = await fs.readFile(h.statePath), loaded = await h.store.load(); expect(loaded).not.toBeNull();
    const results = await h.port.find('CommandNeedle', 'low', 'private'); expect(results).toHaveLength(1);
    const e = results[0].fragment.evidence[0], source = await h.controller.snapshot(e.relativePath);
    expect(source!.hash).toBe(e.sourceHash); expect(source!.id).toBe(e.sourceId); expect(source!.text.slice(e.start, e.end)).toBe(e.quote);
    await h.port.open(e); expect(h.hostOpen).toHaveBeenCalledOnce(); expect(h.opened.editor.setSelection).toHaveBeenCalledOnce();
    h.command(); await h.refreshes.at(-1); await nextTurn(); expect(await fs.readFile(h.statePath)).toEqual(bytes);
    expect(await h.store.load()).toEqual(loaded); expect(notices).toHaveLength(1);
    expect(hash(await fs.readFile(path.join(h.root, 'original.md')))).toBe(e.sourceHash);
    expect(await fs.readFile(path.join(h.root, 'Derived/manual.txt'), 'utf8')).toBe('Synthetic user-authored file in the output folder; never owned.');
    if (indexed) await h.unchanged();
  } finally { await h.cleanup(); }
});

for (const fault of ['changed', 'invalid-state'] as const)
it.each(['en', 'zh'] as const)(`refresh command after ${fault} initialize refusal keeps safe diagnostics and needs explicit reopen in %s`, async locale => {
  const h = await fixture(locale, true); let reopened: ThirdBrainPlugin | undefined;
  try {
    const target = fault === 'changed' ? h.targetPath! : h.statePath;
    const preserved = fault === 'changed' ? Buffer.concat([h.targetBytes!, Buffer.from('\nSynthetic human amendment.')]) : Buffer.from('{"synthetic-invalid-state":true}');
    await fs.writeFile(target, preserved); // Deliberate fixture mutation, not plugin behaviour.
    await h.finishLoad();
    expect(h.controller.status()).toMatchObject({ phase: 'error', errorCode: 'index-unavailable' });
    const expected = fault === 'changed' ? h.t.generatedFileChanged : h.t.unavailable;
    expect(notices).toEqual([expected]); expect(h.get('tb-notice').textContent).toBe(expected);
    const status = h.controller.status(); h.command(); await nextTurn();
    expect(notices).toEqual([expected, expected]); expect(h.controller.status()).toEqual(status);
    expect(h.commit).not.toHaveBeenCalled(); expect(h.list).not.toHaveBeenCalled(); expect(h.queries).not.toHaveBeenCalled();
    expect(h.get('tb-idea').value).toBe(h.draft.text); expect(h.get('tb-privacy').hidden).toBe(false);
    expect(notices.join('')).not.toContain('synthetic-invalid-state'); expect(notices.join('')).not.toContain(h.t.noCompleteIndex);
    expect(await fs.readFile(target)).toEqual(preserved); await expect(h.store.load()).rejects.toThrow();
    expect(await fs.readFile(path.join(h.root, 'Derived/manual.txt'), 'utf8')).toBe('Synthetic user-authored file in the output folder; never owned.');
    // Restore only our test's exact saved bytes. Production does not repair or
    // overwrite human edits; a refresh does not retry failed initialization.
    await fs.writeFile(target, fault === 'changed' ? h.targetBytes! : h.stateBytes!);
    h.command(); await nextTurn(); expect(h.controller.status()).toEqual(status); expect(h.commit).not.toHaveBeenCalled();
    h.dispose(); h.plugin.onunload(); reopened = h.makePlugin('Derived'); await reopened.onload();
    expect(reopened.controller.status().phase).toBe('idle'); expect(await h.store.load()).toEqual(h.loaded);
    await reopened.controller.refresh(); const results = await reopened.panelPort().find('CommandNeedle', 'low'); expect(results).toHaveLength(1);
    await reopened.panelPort().open(results[0].fragment.evidence[0]); expect(h.hostOpen).toHaveBeenCalledOnce(); await h.unchanged();
  } finally { reopened?.onunload(); await h.cleanup(); }
});
