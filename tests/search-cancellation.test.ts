// SPDX-License-Identifier: MIT
// Authored synthetic files and real renderer/Main/Controller/FileSources/OwnedStore.
// File-open latches and injected errors are controlled probes, not native UI/disk faults.
import { promises as fs } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import ThirdBrainPlugin from '../src/main';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, type Settings } from '../src/settings';
import { messages } from '../src/i18n';
import { mountPanel } from '../src/ui';
import type { ModelPort, SearchResult } from '../src/core/types';

vi.mock('obsidian', () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, MarkdownView: class {} }));
class NodeStub {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false;
  children: NodeStub[] = []; attrs: Record<string, string> = {}; handlers = new Map<string, Array<() => void>>();
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
const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));
afterEach(() => { vi.restoreAllMocks(); syncBuiltinESMExports(); vi.unstubAllGlobals(); });
async function fixture(locale: 'en' | 'zh' = 'en') {
  const scope = path.resolve('.local/search-cancellation/cases'); await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'case-'));
  const originals = new Map([
    ['note.md', '---\ntopics: [SyntheticTopic]\n---\n# Context\nSearchNeedle preserves a useful exact quotation from this synthetic source.'],
    ['Derived/manual.txt', 'Synthetic user-authored file. Never overwrite.'],
  ]);
  for (const [name, body] of originals) { await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true }); await fs.writeFile(path.join(root, name), body); }
  const settings: Settings = { ...defaults, outputFolder: 'Derived', excludes: [], locale };
  const store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const model = vi.fn<(s: Readonly<Settings>) => ModelPort | undefined>(() => undefined), saved = vi.fn(async () => {});
  const controller = new ThirdBrainController(sources, store, () => settings, model, saved);
  await controller.initialize(); await controller.refresh(); await controller.initialize();
  const index = (await store.load())!, fragment = Object.values(index.fragments)[0];
  const target = path.join(root, await store.fragmentPath(fragment.id)), targetBytes = await fs.readFile(target);
  const statePath = path.join(root, 'Derived/.third-brain/state.json'), stateBytes = await fs.readFile(statePath);
  const hostOpen = vi.fn(async () => {});
  const app = { vault: { getFileByPath: (name: string) => ({ path: name }) }, workspace: { getLeaf: () => ({ openFile: hostOpen }) } };
  const port = ThirdBrainPlugin.prototype.panelPort.call({ controller, store, app } as unknown as ThirdBrainPlugin);
  const pending: Promise<SearchResult[]>[] = [], actualFind = port.find.bind(port);
  const find = vi.spyOn(port, 'find').mockImplementation((...args) => { const p = actualFind(...args); pending.push(p); return p; });
  const commit = vi.spyOn(store, 'commit'), managed = vi.spyOn(store, 'managedSourcePaths');
  const read = vi.spyOn(sources, 'read');
  vi.stubGlobal('document', { createElement: (tag: string) => new NodeStub(tag) });
  const container = new NodeStub('main'), t = messages(locale), dispose = mountPanel(container as unknown as HTMLElement, port, locale);
  const get = (cls: string) => container.all().find(n => n.className === cls)!;
  const button = (text: string) => container.all().find(n => n.tag === 'button' && n.textContent === text)!;
  const start = (entry: 'idea' | 'topics' | 'kind' = 'idea') => {
    if (entry === 'idea') button(t.find).fire('click');
    else container.all().find(n => n.attrs['data-channel'] === entry)!.fire('click');
    return pending.at(-1)!;
  };
  get('tb-idea').value = 'SearchNeedle'; get('tb-idea').fire('input');
  const baseline = await start(); expect(baseline).toHaveLength(1); await Promise.resolve();
  model.mockClear(); saved.mockClear(); managed.mockClear(); read.mockClear(); find.mockClear();
  const unchanged = async () => {
    for (const [name, body] of originals) expect(hash(await fs.readFile(path.join(root, name)))).toBe(hash(body));
    expect(await fs.readFile(statePath)).toEqual(stateBytes);
  };
  const drainManaged = async () => { await Promise.allSettled(managed.mock.results.filter(r => r.type === 'return').map(r => r.value)); await nextTurn(); };
  const cleanup = async () => { controller.cancel(); await Promise.allSettled(pending); await drainManaged(); dispose(); controller.dispose(); };
  return { root, settings, sources, controller, store, port, model, saved, commit, managed, read, find, hostOpen, fragment, target, targetBytes, statePath, baseline, get, button, start, t, unchanged, cleanup, drainManaged };
}
function blockManagedFile(h: Awaited<ReturnType<typeof fixture>>, call: number, rejection?: Error) {
  const entered = latch(), gate = latch(), open = fs.open; let blocked = false;
  const spy = vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
    // The real OwnedStore lock and checks are already active; only this fixture's
    // state-file open is delayed. No actual OS syscall is claimed to be hung.
    if (!blocked && String(args[0]) === h.statePath && h.managed.mock.calls.length === call) {
      blocked = true; entered.release(); await gate.promise;
      if (rejection) throw rejection;
    }
    return open(...args);
  });
  // OwnedStore uses named node:fs/promises exports, not fs.promises properties.
  syncBuiltinESMExports();
  return { entered: entered.promise, release: gate.release, restore: () => { spy.mockRestore(); syncBuiltinESMExports(); } };
}

for (const entry of ['idea', 'topics', 'kind'] as const) for (const call of [1, 2]) {
  it.each(['resolve', 'reject'] as const)(`${entry} cancel settles before exclusion check ${call} can %s`, async late => {
    const h = await fixture(entry === 'kind' ? 'zh' : 'en');
    const gate = blockManagedFile(h, call, late === 'reject' ? new TypeError('SYNTHETIC_LATE_DETAIL') : undefined);
    let observed: { result?: SearchResult[]; error?: unknown } | undefined;
    try {
      const running = h.start(entry).then(result => { observed = { result }; }, error => { observed = { error }; });
      await gate.entered;
      expect(h.controller.status().phase).toBe('searching'); expect(h.button(h.t.cancel).hidden).toBe(false);
      const readsAtCancel = h.read.mock.calls.length, checksAtCancel = h.managed.mock.calls.length;
      h.button(h.t.cancel).fire('click'); await nextTurn();
      // This assertion runs with the managed-layer gate still CLOSED.
      expect(observed?.error).toMatchObject({ name: 'AbortError' }); await running;
      expect(h.controller.status().phase).toBe('cancelled'); expect(h.button(h.t.cancel).hidden).toBe(true);
      expect(h.button(h.t.find).disabled).toBe(false); expect(h.button(h.t.index).disabled).toBe(false);
      expect(h.get('tb-notice').textContent).toContain(h.t.cancelled);
      expect(h.get('tb-result-summary').textContent).toContain(h.t.previousResults);
      expect(h.get('tb-result-title').textContent).toBe(h.baseline[0].fragment.title);
      // Cancellation releases the search, NOT the store's still-active lock.
      await expect(h.store.load()).rejects.toThrow('Another store operation is in progress');
      const cancelled = h.controller.status();
      gate.release(); await h.drainManaged(); gate.restore();
      expect(h.controller.status()).toEqual(cancelled);
      expect(h.read.mock.calls).toHaveLength(readsAtCancel); expect(h.managed.mock.calls).toHaveLength(checksAtCancel);
      expect(h.commit).not.toHaveBeenCalled(); expect(h.saved).not.toHaveBeenCalled(); expect(h.model).not.toHaveBeenCalled();
      expect(h.get('tb-notice').textContent).not.toContain('SYNTHETIC_LATE_DETAIL');
      // Explicit retry, strict reload, both host actions and idempotent maintenance.
      h.get('tb-idea').value = 'SearchNeedle'; h.get('tb-idea').fire('input');
      expect(await h.start()).toEqual(h.baseline); await Promise.resolve(); expect(h.get('tb-notice').hidden).toBe(true);
      await h.store.load(); await h.port.open(h.baseline[0].fragment.evidence[0]); await h.port.openFragment!(h.fragment.id);
      expect(h.hostOpen).toHaveBeenCalledTimes(2); await h.unchanged();
      await h.controller.refresh(); await h.controller.initialize(); await h.controller.refresh();
      await h.unchanged(); expect(await fs.readFile(h.target)).toEqual(h.targetBytes);
    } finally { gate.release(); await h.cleanup(); gate.restore(); }
  });
}

it.each(['local-model', 'cloud-model'] as const)('cancelled %s vocabulary preflight makes no model request', async mode => {
  const h = await fixture(), request = vi.fn(async () => { throw new Error('Synthetic port must never be called'); });
  h.settings.mode = mode; h.settings.cloudConsent = true; h.model.mockReturnValue({ request });
  const gate = blockManagedFile(h, 1); let error: unknown;
  try {
    const running = h.start().catch(e => { error = e; }); await gate.entered;
    h.button(h.t.cancel).fire('click'); await nextTurn(); expect(error).toMatchObject({ name: 'AbortError' }); await running;
    gate.release(); await h.drainManaged(); gate.restore();
    expect(request).not.toHaveBeenCalled(); expect(h.read).not.toHaveBeenCalled(); expect(h.commit).not.toHaveBeenCalled();
    expect(h.controller.status().phase).toBe('cancelled'); await h.unchanged();
  } finally { gate.release(); await h.cleanup(); gate.restore(); }
});

it.each(['resolve', 'reject'] as const)('late managed %s cannot change or unlock a newer accepted search', async late => {
  const h = await fixture(), sourceEntered = latch(), sourceGate = latch();
  const gate = blockManagedFile(h, 1, late === 'reject' ? new Error('SYNTHETIC_OLD_FAILURE') : undefined);
  try {
    let cancelled: unknown;
    const old = h.start().catch(e => { cancelled = e; }); await gate.entered;
    h.button(h.t.cancel).fire('click'); await nextTurn(); expect(cancelled).toMatchObject({ name: 'AbortError' }); await old;
    h.read.mockImplementationOnce(async (...args) => { sourceEntered.release(); await sourceGate.promise; return FileSources.prototype.read.apply(h.sources, args); });
    const next = h.start(); await sourceEntered.promise; const searching = h.controller.status();
    gate.release(); await h.drainManaged(); gate.restore();
    expect(h.controller.status()).toEqual(searching); expect(searching.phase).toBe('searching');
    expect(h.button(h.t.find).disabled).toBe(true);
    await expect(h.controller.find('SearchNeedle', 'medium')).rejects.toThrow('A task is already running');
    sourceGate.release(); expect(await next).toEqual(h.baseline); await Promise.resolve();
    expect(h.controller.status().phase).toBe('idle'); expect(h.get('tb-notice').hidden).toBe(true);
    expect(h.commit).not.toHaveBeenCalled(); await h.unchanged();
  } finally { sourceGate.release(); gate.release(); await h.cleanup(); gate.restore(); }
});

it('cancelling never licenses human-edited output or stale source evidence', async () => {
  const h = await fixture(), gate = blockManagedFile(h, 1);
  try {
    let cancelled: unknown;
    const running = h.start().catch(e => { cancelled = e; }); await gate.entered;
    h.button(h.t.cancel).fire('click'); await nextTurn(); expect(cancelled).toMatchObject({ name: 'AbortError' }); await running;
    await fs.appendFile(h.target, '\nSynthetic human amendment.'); const edited = await fs.readFile(h.target);
    gate.release(); await h.drainManaged(); gate.restore();
    expect(h.controller.status().phase).toBe('cancelled');
    await expect(h.start()).rejects.toThrow(); await Promise.resolve();
    expect(h.controller.status().generatedFileDiagnostic).toBe('changed'); expect(h.get('tb-notice').textContent).toBe(h.t.generatedFileChanged);
    expect(await fs.readFile(h.target)).toEqual(edited); await h.unchanged(); expect(h.commit).not.toHaveBeenCalled();
    // Test-only exact backup restoration; the plugin never overwrites the edit.
    await fs.writeFile(h.target, h.targetBytes); await h.store.load();
    h.settings.excludes = ['note.md']; expect(await h.start()).toEqual([]);
    await expect(h.port.open(h.baseline[0].fragment.evidence[0])).rejects.toThrow();
    expect(h.hostOpen).not.toHaveBeenCalled(); expect(h.commit).not.toHaveBeenCalled(); await h.unchanged();
  } finally { gate.release(); await h.cleanup(); gate.restore(); }
});
