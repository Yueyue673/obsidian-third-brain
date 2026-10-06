// SPDX-License-Identifier: MIT
// Synthetic notes, DOM and Obsidian lifecycle shells; real Main scheduler,
// Controller, FileSources and OwnedStore. Latches are not native I/O failures.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FileSystemAdapter } from 'obsidian';
import { afterEach, expect, it, vi } from 'vitest';
import ThirdBrainPlugin from '../src/main';
import { FileSources, hash } from '../src/sources';
import { OwnedStore, type StoreTestHooks } from '../src/runtime/store';
import { defaults, isDue, type Schedule } from '../src/settings';
import { messages } from '../src/i18n';
import { mountPanel } from '../src/ui';

const notices = vi.hoisted(() => [] as string[]);
vi.mock('obsidian', () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, FileSystemAdapter: class {}, Notice: class { constructor(text: string) { notices.push(text); } } }));
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
function latch() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); notices.length = 0; });
async function fixture(schedule: Schedule = 'daily', indexed = true, existingRoot?: string) {
  const scope = path.resolve('.local/schedule-cancellation/cases'); await fs.mkdir(scope, { recursive: true });
  const root = existingRoot ?? await fs.mkdtemp(path.join(scope, 'case-'));
  if (!existingRoot) {
    await fs.mkdir(path.join(root, 'Derived'), { recursive: true });
    await fs.writeFile(path.join(root, 'original.md'), '# Synthetic reminder\nScheduleNeedle retains a precise observation worth finding again.');
    await fs.writeFile(path.join(root, 'Derived/manual.txt'), 'Synthetic unowned file; not generated.');
  }
  const locale = schedule === 'weekly' ? 'zh' : 'en';
  const protectedHashes = await Promise.all(['original.md', 'Derived/manual.txt'].map(async p => hash(await fs.readFile(path.join(root, p)))));
  let ready!: () => void, tick!: () => void;
  const commands = new Map<string, () => void>();
  const save = vi.fn(async (_settings: unknown) => {}), hostOpen = vi.fn(async () => {});
  const app = {
    vault: { adapter: Object.assign(Object.create(FileSystemAdapter.prototype), { getBasePath: () => root }), getFiles: () => [{ path: 'original.md' }], getFileByPath: (name: string) => ({ path: name }) },
    workspace: { onLayoutReady: (cb: () => void) => { ready = cb; }, getLeavesOfType: () => [], getLeaf: () => ({ openFile: hostOpen }) },
  };
  const plugin = Object.assign(Object.create(ThirdBrainPlugin.prototype), {
    app, loadData: async () => ({ ...defaults, excludes: [], outputFolder: 'Derived', schedule, locale }), saveData: save,
    registerView: () => {}, addRibbonIcon: () => {}, addSettingTab: () => {}, registerInterval: () => {},
    addCommand: (command: { id: string; callback: () => void }) => commands.set(command.id, command.callback),
  }) as ThirdBrainPlugin;
  vi.stubGlobal('window', { setInterval: (cb: () => void, ms: number) => { expect(ms).toBe(60000); tick = cb; return 1; } });
  await plugin.onload();
  const controller = plugin.controller;
  const store = (plugin as unknown as { store: OwnedStore }).store;
  const sources = (controller as unknown as { sources: FileSources }).sources;
  if (indexed && !existingRoot) await controller.refresh();
  plugin.settings.lastIndexedAt = '2020-01-01T00:00:00.000Z'; // Deliberately overdue, never a fake successful cancellation.
  save.mockClear();
  const refreshes: Promise<void>[] = [], actualRefresh = controller.refresh.bind(controller);
  const refresh = vi.spyOn(controller, 'refresh').mockImplementation(() => { const op = actualRefresh(); refreshes.push(op); return op; });
  const port = plugin.panelPort(), t = messages(locale), container = new NodeStub('main');
  vi.stubGlobal('document', { createElement: (tag: string) => new NodeStub(tag) });
  let unmount = mountPanel(container as unknown as HTMLElement, port, locale);
  const reopen = () => { unmount(); unmount = mountPanel(container as unknown as HTMLElement, plugin.panelPort(), locale); };
  const get = (cls: string) => container.all().find(n => n.className === cls)!;
  const button = (text: string) => container.all().find(n => n.tag === 'button' && n.textContent === text)!;
  const stateBytes = () => fs.readFile(path.join(root, 'Derived/.third-brain/state.json')).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  const originalState = await stateBytes();
  get('tb-idea').value = 'ScheduleNeedle'; get('tb-idea').fire('input');
  const start = (entry: 'scheduled' | 'panel' | 'command') => {
    if (entry === 'scheduled') ready();
    else if (entry === 'panel') button(t.index).fire('click');
    else commands.get('refresh-derived-layer')!();
    return refreshes.at(-1)!;
  };
  const check = async () => { const n = refreshes.length; tick(); await Promise.allSettled(refreshes.slice(n)); await nextTurn(); };
  const unchanged = async () => expect(await Promise.all(['original.md', 'Derived/manual.txt'].map(async p => hash(await fs.readFile(path.join(root, p)))))).toEqual(protectedHashes);
  const cleanup = async () => { controller.cancel(); await Promise.allSettled(refreshes); await nextTurn(); unmount(); plugin.onunload(); };
  return { root, plugin, controller, sources, store, port, t, get, button, start, check, ready, refresh, refreshes, save, hostOpen, stateBytes, originalState, unchanged, cleanup, reopen };
}
async function holdReading(h: Awaited<ReturnType<typeof fixture>>) {
  const entered = latch(), gate = latch(), original = h.sources.list.bind(h.sources);
  let held: ReturnType<FileSources['list']> | undefined;
  vi.spyOn(h.sources, 'list').mockImplementationOnce(options => held = (async () => { entered.release(); await gate.promise; return original(options); })());
  return { entered, release: async () => { gate.release(); await held?.catch(() => {}); } };
}

const pauseCopy = {
  daily: 'Automatic updates paused after cancellation. Choose Refresh notes; automatic updates resume after a successful refresh or plugin reload.',
  weekly: '取消更新后，自动更新已暂停。可点“更新笔记”；更新成功或重新加载插件后恢复自动更新。',
};
for (const schedule of ['daily', 'weekly'] as const) for (const view of ['after search', 'after panel reopen'] as const) {
  it(`explains the ${schedule} schedule pause ${view} until a manual refresh succeeds`, async () => {
    const h = await fixture(schedule), gate = await holdReading(h);
    const searches: Array<ReturnType<typeof h.controller.find>> = [];
    const originalFind = h.controller.find.bind(h.controller);
    vi.spyOn(h.controller, 'find').mockImplementation((...args) => { const op = originalFind(...args); searches.push(op); return op; });
    let retryGate: Awaited<ReturnType<typeof holdReading>> | undefined;
    try {
      const result = h.start('scheduled').catch(error => error); await gate.entered.promise;
      h.button(h.t.cancel).fire('click'); expect(await result).toMatchObject({ name: 'AbortError' }); await gate.release();
      // Real renderer Find -> Main PanelPort -> Controller -> current filesystem evidence.
      h.button(h.t.find).fire('click'); expect(await searches.at(-1)).toHaveLength(1); await nextTurn();
      expect(h.controller.status().phase).toBe('idle'); expect(h.get('tb-result')).toBeDefined();
      if (view === 'after panel reopen') h.reopen();
      expect(h.get('tb-status').textContent).toContain(pauseCopy[schedule]);
      expect(h.get('tb-notice').hidden).toBe(true);
      await h.check(); expect(h.refresh).toHaveBeenCalledOnce(); expect(h.save).not.toHaveBeenCalled();
      expect(await h.stateBytes()).toEqual(h.originalState); await h.unchanged();
      // A command-driven retry must not hide the pause merely because work started.
      retryGate = await holdReading(h);
      const retry = h.start('command'); await retryGate.entered.promise;
      expect(h.get('tb-status').textContent).toContain(h.t.indexing);
      expect(h.get('tb-status').textContent).toContain(pauseCopy[schedule]);
      await retryGate.release(); await retry; await nextTurn();
      expect(h.get('tb-status').textContent).not.toContain(pauseCopy[schedule]);
      expect(h.save).toHaveBeenCalledOnce(); expect((await h.store.load())!.fragments).not.toEqual({});
      await h.unchanged();
    } finally { await retryGate?.release(); await gate.release(); await Promise.allSettled(searches); await h.cleanup(); }
  });
}

for (const schedule of ['daily', 'weekly'] as const) for (const indexed of [false, true]) for (const entry of ['scheduled', 'panel'] as const) {
  it(`${schedule} ${entry} cancellation stays stopped across scheduler ticks and searches (${indexed ? 'incremental' : 'first index'})`, async () => {
    const h = await fixture(schedule, indexed), gate = await holdReading(h);
    const commit = vi.spyOn(h.store, 'commit');
    try {
      const result = h.start(entry).catch(error => error); await gate.entered.promise;
      h.button(h.t.cancel).fire('click'); expect(await result).toMatchObject({ name: 'AbortError' }); await gate.release();
      expect(h.controller.status().phase).toBe('cancelled'); expect(commit).not.toHaveBeenCalled();
      expect(h.get('tb-status').textContent).toContain(pauseCopy[schedule]);
      expect(h.get('tb-notice').textContent).toContain(h.t.cancelled);
      expect(await h.stateBytes()).toEqual(h.originalState); expect(h.save).not.toHaveBeenCalled();
      expect(isDue(h.plugin.settings)).toBe(true); // Pause must not record a successful refresh.
      await h.check(); await h.check();
      expect(h.refresh).toHaveBeenCalledTimes(1);
      expect(h.controller.status().phase).toBe('cancelled');
      // A successful search changes phase to idle, not permission to restart maintenance.
      const results = await h.port.find('ScheduleNeedle', 'low'); expect(results).toHaveLength(indexed ? 1 : 0);
      if (indexed) { await h.port.open(results[0].fragment.evidence[0]); expect(h.hostOpen).toHaveBeenCalledOnce(); }
      await h.check(); expect(h.refresh).toHaveBeenCalledTimes(1);
      expect(h.get('tb-idea').value).toBe('ScheduleNeedle'); expect(h.save).not.toHaveBeenCalled();
      expect(h.get('tb-status').textContent).toContain(pauseCopy[schedule]);
      expect(await h.stateBytes()).toEqual(h.originalState); await h.unchanged();
      // Existing explicit command retries remain available, then normal scheduling resumes.
      await h.start('command'); expect(h.save).toHaveBeenCalledOnce(); expect(isDue(h.plugin.settings)).toBe(false);
      expect(h.get('tb-status').textContent).not.toContain(pauseCopy[schedule]);
      expect(h.save.mock.calls.every(([settings]) => !Object.hasOwn(settings as object, 'scheduledRefreshPaused'))).toBe(true);
      const complete = await h.stateBytes(); await h.check(); expect(h.refresh).toHaveBeenCalledTimes(2);
      h.plugin.settings.lastIndexedAt = '2020-01-01T00:00:00.000Z'; await h.check();
      expect(h.refresh).toHaveBeenCalledTimes(3); expect(await h.stateBytes()).toEqual(complete);
      expect((await h.store.load())!.fragments).not.toEqual({}); await h.unchanged(); expect(notices).toEqual([]);
    } finally { await gate.release(); await h.cleanup(); }
  });
}

it('controller cancellation of a command refresh stays paused through settings save and a failed manual retry', async () => {
  const h = await fixture(), gate = await holdReading(h);
  try {
    const result = h.start('command').catch(error => error); await gate.entered.promise;
    h.controller.cancel(); expect(await result).toMatchObject({ name: 'AbortError' }); await gate.release();
    await h.plugin.persistSettings(); await h.check(); expect(h.refresh).toHaveBeenCalledTimes(1);
    h.reopen(); expect(h.get('tb-status').textContent).toContain(pauseCopy.daily);
    // Manual mode has no automatic schedule to explain. Switching back retains
    // the same session pause; settings saves are not permission to resume.
    h.plugin.settings.schedule = 'manual'; await h.plugin.persistSettings(); h.reopen();
    expect(h.get('tb-status').textContent).not.toContain(pauseCopy.daily);
    expect(h.port.status().scheduledRefreshPaused).toBe(false);
    h.plugin.settings.schedule = 'daily'; await h.plugin.persistSettings(); h.reopen();
    expect(h.get('tb-status').textContent).toContain(pauseCopy.daily);
    vi.spyOn(h.sources, 'list').mockRejectedValueOnce(new Error('SYNTHETIC_READ_FAILURE'));
    await expect(h.port.refresh()).rejects.toThrow('SYNTHETIC_READ_FAILURE');
    expect(h.get('tb-notice').textContent).toBe(h.t.failure);
    expect(h.get('tb-status').textContent).toContain(pauseCopy.daily);
    await h.port.find('ScheduleNeedle', 'low'); await h.check(); expect(h.refresh).toHaveBeenCalledTimes(2);
    expect(await h.stateBytes()).toEqual(h.originalState); await h.unchanged();
    await h.port.refresh(); expect(h.controller.status().phase).toBe('idle');
    expect(h.get('tb-status').textContent).not.toContain(pauseCopy.daily);
    h.plugin.settings.lastIndexedAt = ''; await h.check(); expect(h.refresh).toHaveBeenCalledTimes(4);
  } finally { await gate.release(); await h.cleanup(); }
});

it('cancelled search does not suppress overdue maintenance', async () => {
  const h = await fixture(), entered = latch(), gate = latch(), original = h.sources.excluded.bind(h.sources);
  let held: ReturnType<FileSources['excluded']> | undefined;
  vi.spyOn(h.sources, 'excluded').mockImplementationOnce(paths => held = (async () => { entered.release(); await gate.promise; return original(paths); })());
  try {
    const result = h.port.find('ScheduleNeedle', 'low').catch(error => error); await entered.promise;
    h.port.cancel(); expect(await result).toMatchObject({ name: 'AbortError' }); gate.release(); await held;
    expect(h.get('tb-status').textContent).not.toContain(pauseCopy.daily);
    expect(h.port.status().scheduledRefreshPaused).toBe(false);
    await h.check(); expect(h.refresh).toHaveBeenCalledOnce(); expect(h.controller.status().phase).toBe('idle');
    expect(await h.stateBytes()).toEqual(h.originalState); await h.unchanged();
  } finally { gate.release(); await held?.catch(() => {}); await h.cleanup(); }
});

it('a fresh plugin session still catches up once after an earlier cancelled refresh', async () => {
  const h = await fixture('weekly'), gate = await holdReading(h);
  try {
    const result = h.start('scheduled').catch(error => error); await gate.entered.promise;
    h.port.cancel(); expect(await result).toMatchObject({ name: 'AbortError' }); await gate.release();
    await h.check(); expect(h.refresh).toHaveBeenCalledOnce();
  } finally { await gate.release(); await h.cleanup(); }
  const reopened = await fixture('weekly', true, h.root);
  try {
    expect(reopened.get('tb-status').textContent).not.toContain(pauseCopy.weekly);
    reopened.ready(); await reopened.refreshes.at(-1); await nextTurn();
    expect(reopened.refresh).toHaveBeenCalledOnce(); expect(isDue(reopened.plugin.settings)).toBe(false);
    await reopened.check(); expect(reopened.refresh).toHaveBeenCalledOnce();
    expect(await reopened.stateBytes()).toEqual(h.originalState); await reopened.unchanged();
  } finally { await reopened.cleanup(); }
});

it('a cancellation waiting for real store cleanup cannot be restarted or treated as a confirmed save', async () => {
  const h = await fixture('daily', false), entered = latch(), gate = latch();
  const hooks = (h.store as unknown as { hooks: StoreTestHooks }).hooks;
  hooks.io = async event => { if (event.phase === 'staged') { entered.release(); await gate.promise; } };
  try {
    const result = h.start('scheduled').catch(error => error); await entered.promise;
    h.button(h.t.cancel).fire('click');
    expect(h.controller.status()).toMatchObject({ phase: 'indexing', cancelRequested: true });
    expect(h.get('tb-status').textContent).toContain(h.t.cancellingCommit);
    expect(h.get('tb-status').textContent).toContain(pauseCopy.daily);
    await h.check(); expect(h.refresh).toHaveBeenCalledOnce();
    await expect(h.store.load()).rejects.toThrow('Another store operation is in progress');
    gate.release(); expect(await result).toMatchObject({ name: 'AbortError' }); await nextTurn();
    expect(h.controller.status()).toMatchObject({ phase: 'cancelled', commitOutcome: 'unknown' });
    await h.check(); expect(h.refresh).toHaveBeenCalledOnce();
    expect(h.get('tb-notice').textContent).toContain(h.t.commitUnknown);
    expect(h.get('tb-status').textContent).toContain(pauseCopy.daily);
    expect(h.save).not.toHaveBeenCalled(); expect(await h.stateBytes()).toBeNull();
    hooks.io = undefined; await h.controller.initialize(); await h.check(); expect(h.refresh).toHaveBeenCalledOnce();
    await h.port.refresh(); expect(h.controller.status().phase).toBe('idle'); await h.unchanged();
  } finally { gate.release(); hooks.io = undefined; await h.cleanup(); }
});

it('Cancel without a running task leaves normal overdue-on-open behavior intact', async () => {
  const h = await fixture();
  try {
    h.port.cancel(); h.ready(); await h.refreshes.at(-1); await h.check();
    expect(h.get('tb-status').textContent).not.toContain(pauseCopy.daily);
    expect(h.refresh).toHaveBeenCalledOnce(); expect(isDue(h.plugin.settings)).toBe(false);
    expect(await h.stateBytes()).toEqual(h.originalState); await h.unchanged();
  } finally { await h.cleanup(); }
});

it('manual mode, busy tasks and unload never gain an automatic refresh', async () => {
  const h = await fixture('manual'), gate = await holdReading(h);
  try {
    h.ready(); await h.check(); expect(h.refresh).not.toHaveBeenCalled();
    const result = h.start('panel').catch(error => error); await gate.entered.promise;
    h.plugin.settings.schedule = 'daily'; await h.check(); expect(h.refresh).toHaveBeenCalledOnce();
    h.plugin.onunload(); expect(await result).toMatchObject({ name: 'AbortError' }); await gate.release();
    await h.check(); expect(h.refresh).toHaveBeenCalledOnce();
    expect(await h.stateBytes()).toEqual(h.originalState); await h.unchanged();
  } finally { await gate.release(); await h.cleanup(); }
});
