// SPDX-License-Identifier: MIT
// Authored synthetic files; actual renderer/Main/Controller/FileSources/OwnedStore.
// Commit hooks are controlled latches, not native clicks, OS stalls or model calls.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import ThirdBrainPlugin from '../src/main';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore, type StoreIOEvent } from '../src/runtime/store';
import { defaults } from '../src/settings';
import { messages } from '../src/i18n';
import { mountPanel } from '../src/ui';

vi.mock('obsidian', () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, MarkdownView: class {} }));
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
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function fixture(locale: 'en' | 'zh', incremental = true) {
  const scope = path.resolve('.local/refresh-cancellation-feedback/cases'); await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'case-'));
  const source = path.join(root, 'note.md'), manual = path.join(root, 'Derived/manual.txt');
  await fs.mkdir(path.dirname(manual), { recursive: true });
  await fs.writeFile(source, 'SearchNeedle preserves the exact quotation from this synthetic note.');
  await fs.writeFile(manual, 'Synthetic human-authored file; never owned by the plugin.');
  let io: (event: Readonly<StoreIOEvent>) => void | Promise<void> = () => {};
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [], locale };
  const store = new OwnedStore(root, 'Derived', { io: event => io(event) });
  const sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const model = vi.fn(() => undefined), saved = vi.fn(async () => {});
  const controller = new ThirdBrainController(sources, store, () => settings, model, saved);
  await controller.initialize(); if (incremental) { await controller.refresh(); await controller.initialize(); }
  const before = await store.load();
  const statePath = path.join(root, 'Derived/.third-brain/state.json');
  const stateBytes = async () => fs.readFile(statePath).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  const originalState = await stateBytes(), hostOpen = vi.fn(async () => {});
  const app = { vault: { getFileByPath: (name: string) => ({ path: name }) }, workspace: { getLeaf: () => ({ openFile: hostOpen }) } };
  const port = ThirdBrainPlugin.prototype.panelPort.call({ controller, store, app } as unknown as ThirdBrainPlugin);
  const pending: Promise<unknown>[] = [], actualRefresh = port.refresh.bind(port), actualFind = port.find.bind(port);
  vi.spyOn(port, 'refresh').mockImplementation(() => { const p = actualRefresh(); pending.push(p); return p; });
  vi.spyOn(port, 'find').mockImplementation((...args) => { const p = actualFind(...args); pending.push(p); return p; });
  vi.stubGlobal('document', { createElement: (tag: string) => new NodeStub(tag) });
  const container = new NodeStub('main'), t = messages(locale);
  let unmount = mountPanel(container as unknown as HTMLElement, port, locale);
  const get = (cls: string) => container.all().find(n => n.className === cls)!;
  const button = (text: string) => container.all().find(n => n.tag === 'button' && n.textContent === text)!;
  get('tb-idea').value = 'SearchNeedle'; get('tb-idea').fire('input');
  if (incremental) { button(t.find).fire('click'); await pending.at(-1); await nextTurn(); }
  if (incremental) await fs.appendFile(source, ' An explicitly revised synthetic detail remains useful.');
  const protectedHashes = [hash(await fs.readFile(source)), hash(await fs.readFile(manual))];
  model.mockClear(); saved.mockClear();
  return {
    root, source, manual, settings, store, sources, controller, port, pending, t, get, button, before, originalState, stateBytes, model, saved, hostOpen,
    setIO: (hook: typeof io) => { io = hook; },
    remount: () => { unmount(); unmount = mountPanel(container as unknown as HTMLElement, port, locale); },
    unchanged: async () => expect([hash(await fs.readFile(source)), hash(await fs.readFile(manual))]).toEqual(protectedHashes),
    cleanup: async () => { controller.cancel(); await Promise.allSettled(pending); await nextTurn(); unmount(); controller.dispose(); },
  };
}

for (const incremental of [false, true]) for (const phase of ['staged', 'after-apply', 'before-finalize'] as const) {
  it.each(['en', 'zh'] as const)(`%s acknowledges pending ${phase} cancellation (${incremental ? 'incremental' : 'first index'})`, async locale => {
    const h = await fixture(locale, incremental), entered = latch(), gate = latch(); let blocked = false;
    h.setIO(async event => {
      if (!blocked && event.phase === phase && (phase !== 'after-apply' || event.target?.startsWith('Derived/fragment-'))) {
        blocked = true; entered.release(); await gate.promise;
      }
    });
    let settled = false;
    try {
      h.button(h.t.index).fire('click'); const running = h.pending.at(-1)!;
      const result = running.then(() => { settled = true; return null; }, error => { settled = true; return error; });
      await entered.promise;
      expect(h.controller.status()).toMatchObject({ phase: 'indexing', progress: { phase: 'committing' } });
      const beforeCancel = h.get('tb-status').textContent;
      const lockPath = path.join(h.root, 'Derived/.third-brain/write.lock'), lockBytes = await fs.readFile(lockPath);
      h.button(h.t.cancel).fire('click'); await nextTurn();
      expect(settled).toBe(false); // Commit remains owned until its filesystem work settles.
      expect(h.controller.status().phase).toBe('indexing');
      expect(h.get('tb-status').textContent).not.toBe(beforeCancel);
      expect(h.get('tb-status').textContent).toContain(locale === 'en' ? 'Cancellation requested' : '已请求取消');
      expect(h.get('tb-status').textContent).toContain(locale === 'en' ? 'save outcome is not yet known' : '保存结果尚未确认');
      expect(h.button(h.t.cancel).disabled).toBe(true); expect(h.button(h.t.cancel).hidden).toBe(false);
      expect(h.button(h.t.index).disabled).toBe(true); expect(h.button(h.t.find).disabled).toBe(true);
      expect(h.get('tb-idea').value).toBe('SearchNeedle');
      if (incremental) expect(h.get('tb-result-title').textContent).toBe(Object.values(h.before!.fragments)[0].title);
      expect(h.get('tb-notice').hidden).toBe(true);
      expect(h.get('tb-status').textContent).not.toContain(h.t.retainedIndex);
      expect(h.get('tb-status').textContent).not.toContain(h.t.notCommitted);
      await expect(h.store.load()).rejects.toThrow('Another store operation is in progress');
      await expect(h.controller.refresh()).rejects.toThrow('A task is already running');
      await expect(h.controller.find('SearchNeedle', 'low')).rejects.toThrow('A task is already running');
      expect(await fs.readFile(lockPath)).toEqual(lockBytes); await h.unchanged();
      const acknowledged = h.controller.status(); h.port.cancel(); expect(h.controller.status()).toEqual(acknowledged);
      // Reopened panel must read controller state, not rely on its own click history.
      h.remount(); expect(h.get('tb-status').textContent).toContain(locale === 'en' ? 'Cancellation requested' : '已请求取消');
      expect(h.button(h.t.cancel).disabled).toBe(true);
      gate.release(); expect(await result).toMatchObject({ name: 'AbortError' }); await nextTurn();
      expect(h.controller.status()).toMatchObject({ phase: 'cancelled', commitOutcome: 'unknown' });
      expect(h.button(h.t.cancel).hidden).toBe(true); expect(h.button(h.t.cancel).disabled).toBe(false);
      expect(h.get('tb-notice').textContent).toContain(h.t.commitUnknown); expect(h.saved).not.toHaveBeenCalled();
      if (phase === 'before-finalize') expect(await h.stateBytes()).not.toEqual(h.originalState);
      else expect(await h.stateBytes()).toEqual(h.originalState);
      // Strict recovery/reload, explicit refresh and unchanged repeat use real files.
      h.setIO(() => {}); await h.controller.initialize(); await h.port.refresh();
      const complete = await h.stateBytes(), index = (await h.store.load())!;
      await h.port.refresh(); expect(await h.stateBytes()).toEqual(complete); await h.unchanged();
      expect(h.get('tb-notice').hidden).toBe(true); expect(h.get('tb-status').textContent).not.toContain(locale === 'en' ? 'Cancellation requested' : '已请求取消');
      const results = await h.port.find('SearchNeedle', 'low'); expect(results).toHaveLength(1);
      expect(index.fragments[results[0].fragment.id]).toEqual(results[0].fragment);
      await h.port.open(results[0].fragment.evidence[0]); await h.port.openFragment!(results[0].fragment.id);
      expect(h.hostOpen).toHaveBeenCalledTimes(2); expect(h.model.mock.results.every(r => r.value === undefined)).toBe(true);
    } finally { gate.release(); await h.cleanup(); }
  });
}

it('controller-driven cancellation is acknowledged while rollback is pending; edited output still blocks recovery', async () => {
  const h = await fixture('en'), applied = latch(), continueApply = latch(), rollback = latch(), continueRollback = latch();
  let hitApply = false, hitRollback = false; let target: string | undefined;
  h.setIO(async event => {
    if (!hitApply && event.phase === 'after-apply' && event.target?.startsWith('Derived/fragment-')) {
      hitApply = true; target = event.target; applied.release(); await continueApply.promise;
    }
    if (!hitRollback && event.phase === 'before-rollback') { hitRollback = true; rollback.release(); await continueRollback.promise; }
  });
  try {
    const result = h.port.refresh().catch(error => error); await applied.promise;
    h.controller.cancel(); continueApply.release(); await rollback.promise;
    expect(h.controller.status().phase).toBe('indexing');
    expect(h.get('tb-status').textContent).toContain('Cancellation requested'); expect(h.button(h.t.cancel).disabled).toBe(true);
    // Synthetic concurrent human edit: leave it intact, never auto-repair or adopt.
    const edited = path.join(h.root, target!); await fs.writeFile(edited, 'Synthetic human edit during rollback.');
    continueRollback.release(); expect(await result).toMatchObject({ name: 'AbortError' });
    expect(h.get('tb-notice').textContent).toContain(h.t.commitUnknown);
    expect(await fs.readFile(edited, 'utf8')).toBe('Synthetic human edit during rollback.');
    await expect(h.controller.initialize()).rejects.toBeInstanceOf(Error);
    expect(h.controller.status().phase).toBe('error'); expect(h.get('tb-status').textContent).not.toContain('Cancellation requested');
    expect(await fs.readFile(edited, 'utf8')).toBe('Synthetic human edit during rollback.'); await h.unchanged();
  } finally { continueApply.release(); continueRollback.release(); await h.cleanup(); }
});

it('reading cancellation clears the acknowledgement without committing or accepting late progress', async () => {
  const h = await fixture('zh'), entered = latch(), gate = latch(); const original = h.sources.list.bind(h.sources);
  const commit = vi.spyOn(h.store, 'commit');
  const list = vi.spyOn(h.sources, 'list').mockImplementationOnce(async options => {
    entered.release(); await gate.promise; options?.onProgress?.({ completed: 99, total: 99, phase: 'done' });
    return original(); // A synthetic legacy adapter ignores the cancellation signal.
  });
  try {
    const result = h.port.refresh().catch(error => error); await entered.promise;
    h.port.cancel(); expect(h.get('tb-status').textContent).toContain('已请求取消');
    expect(h.get('tb-status').textContent).not.toContain('保存结果尚未确认');
    expect(await result).toMatchObject({ name: 'AbortError' });
    const status = h.controller.status(); expect(status.phase).toBe('cancelled'); expect(status.commitOutcome).toBeUndefined();
    expect(h.button(h.t.cancel).disabled).toBe(false); expect(h.button(h.t.cancel).hidden).toBe(true);
    gate.release(); await list.mock.results[0].value; await nextTurn();
    expect(h.controller.status()).toEqual(status); expect(commit).not.toHaveBeenCalled();
    expect(await h.stateBytes()).toEqual(h.originalState); await h.unchanged();
  } finally { gate.release(); await Promise.allSettled(list.mock.results.filter(r => r.type === 'return').map(r => r.value)); await h.cleanup(); }
});
