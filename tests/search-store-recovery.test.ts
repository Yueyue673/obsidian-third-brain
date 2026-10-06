// SPDX-License-Identifier: MIT
// Authored synthetic files; real renderer/Main PanelPort/Controller/FileSources/OwnedStore.
// Host/DOM shells, injected errors and latches are not native clicks or real disk faults.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import ThirdBrainPlugin from '../src/main';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults } from '../src/settings';
import { messages } from '../src/i18n';
import { generatedFileDiagnostic } from '../src/core/generated-diagnostics';
import { bindSourceDiagnostic } from '../src/core/source-diagnostics';
import { mountPanel } from '../src/ui';
import type { SearchResult } from '../src/core/types';

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
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
type Fault = 'missing' | 'changed';
async function fixture(locale: 'en' | 'zh' = 'en') {
  const scope = path.resolve('.local/search-store-recovery/cases'); await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'case-'));
  const originals = new Map([
    ['note.md', '---\ntopics: [SearchTopic]\n---\n# Context\nSearchNeedle retains an exact source quotation in a synthetic observation.'],
    ['other.md', '# Elsewhere\nA separate synthetic passage has independent provenance and its own generated file.'],
    ['Derived/manual.txt', 'Synthetic user-authored content; never adopt or overwrite.'],
  ]);
  for (const [name, body] of originals) { await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true }); await fs.writeFile(path.join(root, name), body); }
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] as string[], locale };
  const store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const model = vi.fn(() => undefined), saved = vi.fn(async () => {});
  const controller = new ThirdBrainController(sources, store, () => settings, model, saved);
  await controller.initialize(); await controller.refresh(); await controller.initialize();
  model.mockClear(); saved.mockClear();
  const index = (await store.load())!, fragment = Object.values(index.fragments).find(f => f.evidence[0].relativePath === 'note.md')!;
  const targetPath = path.join(root, await store.fragmentPath(fragment.id)), targetBytes = await fs.readFile(targetPath);
  const statePath = path.join(root, 'Derived/.third-brain/state.json'), stateBytes = await fs.readFile(statePath);
  const hostOpen = vi.fn(async () => {});
  const app = { vault: { getFileByPath: (name: string) => ({ path: name }) }, workspace: { getLeaf: () => ({ openFile: hostOpen }) } };
  const port = ThirdBrainPlugin.prototype.panelPort.call({ controller, store, app } as unknown as ThirdBrainPlugin);
  const pending: Promise<unknown>[] = [], queries: Promise<SearchResult[]>[] = [];
  const actualFind = port.find.bind(port);
  const find = vi.spyOn(port, 'find').mockImplementation((...args) => { const p = actualFind(...args); queries.push(p); pending.push(p); return p; });
  const commit = vi.spyOn(store, 'commit'), refresh = vi.spyOn(port, 'refresh'), open = vi.spyOn(port, 'openFragment');
  const managed = vi.spyOn(store, 'managedSourcePaths');
  vi.stubGlobal('document', { createElement: (tag: string) => new NodeStub(tag) });
  const container = new NodeStub('main'), t = messages(locale), dispose = mountPanel(container as unknown as HTMLElement, port, locale);
  const get = (cls: string) => container.all().find(n => n.className === cls)!;
  const button = (text: string) => container.all().find(n => n.tag === 'button' && n.textContent === text)!;
  const start = (entry: 'idea' | 'topics' | 'kind' = 'idea') => {
    if (entry === 'idea') button(t.find).fire('click');
    else container.all().find(n => n.attrs['data-channel'] === entry)!.fire('click');
    return queries.at(-1)!;
  };
  const mutate = async (fault: Fault, other = false) => {
    const target = other ? path.join(root, await store.fragmentPath(Object.values(index.fragments).find(f => f.id !== fragment.id)!.id)) : targetPath;
    if (fault === 'missing') await fs.unlink(target); // Only this fixture's synthetic generated file.
    else await fs.appendFile(target, '\nSynthetic human amendment.');
    return target;
  };
  const unchanged = async () => {
    for (const [name, body] of originals) expect(hash(await fs.readFile(path.join(root, name)))).toBe(hash(body));
    expect(await fs.readFile(statePath)).toEqual(stateBytes);
  };
  const cleanup = async () => { controller.cancel(); await Promise.allSettled(pending); await Promise.resolve(); dispose(); controller.dispose(); };
  get('tb-idea').value = 'SearchNeedle'; get('tb-idea').fire('input');
  return { root, originals, settings, controller, sources, store, fragment, targetPath, targetBytes, statePath, model, saved, hostOpen, port, find, commit, refresh, open, managed, get, button, t, start, mutate, unchanged, cleanup };
}

for (const fault of ['missing', 'changed'] as const) it.each(['en', 'zh'] as const)(`first idea search explains ${fault} in %s before refresh or open`, async locale => {
  const h = await fixture(locale);
  try {
    await h.mutate(fault); const edited = fault === 'changed' ? await fs.readFile(h.targetPath) : null;
    const error = await h.start().catch(e => e); await Promise.resolve();
    expect(generatedFileDiagnostic(error)).toBe(fault); expect(h.managed).toHaveBeenCalled();
    expect.soft(h.controller.status()).toMatchObject({ phase: 'error', errorCode: 'operation-failed', generatedFileDiagnostic: fault });
    expect.soft(h.get('tb-notice').textContent).toBe(fault === 'missing' ? h.t.generatedFileMissing : h.t.generatedFileChanged);
    expect(h.get('tb-notice').hidden).toBe(false); expect(h.get('tb-result-summary').textContent).toBe('');
    expect(h.find).toHaveBeenCalledExactlyOnceWith('SearchNeedle', 'medium', 'normal');
    expect(h.get('tb-idea').value).toBe('SearchNeedle');
    expect(h.commit).not.toHaveBeenCalled(); expect(h.refresh).not.toHaveBeenCalled(); expect(h.open).not.toHaveBeenCalled();
    expect(h.saved).not.toHaveBeenCalled(); expect(h.hostOpen).not.toHaveBeenCalled(); expect(h.model).not.toHaveBeenCalled();
    expect(h.controller.status().commitOutcome).toBeUndefined(); // Search never commits; no retained-safe-index claim.
    await expect(h.store.load()).rejects.toThrow(); await h.unchanged();
    if (edited) expect(await fs.readFile(h.targetPath)).toEqual(edited);
    else await expect(fs.stat(h.targetPath)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await h.cleanup(); }
});

for (const entry of ['topics', 'kind'] as const) it.each(['missing', 'changed'] as const)(`${entry} card search preserves protected-layer %s guidance and previous results`, async fault => {
  const h = await fixture();
  try {
    const before = await h.start(); expect(before).toHaveLength(1); await Promise.resolve();
    const title = h.get('tb-result-title').textContent;
    await h.mutate(fault); await expect(h.start(entry)).rejects.toThrow(); await Promise.resolve();
    expect.soft(h.get('tb-notice').textContent).toBe(fault === 'missing' ? h.t.generatedFileMissing : h.t.generatedFileChanged);
    expect(h.get('tb-result-title').textContent).toBe(title); expect(h.get('tb-result-summary').textContent).toContain(h.t.previousResults);
    expect(h.find.mock.calls.at(-1)?.[3]?.channel).toBe(entry);
    expect(h.commit).not.toHaveBeenCalled(); expect(h.model).not.toHaveBeenCalled(); await h.unchanged();
  } finally { await h.cleanup(); }
});

it('a different protected output blocks search without falsely identifying the source note or overwriting any file', async () => {
  const h = await fixture();
  try {
    const other = await h.mutate('changed', true), edited = await fs.readFile(other);
    await expect(h.start()).rejects.toThrow(); await Promise.resolve();
    expect.soft(h.get('tb-notice').textContent).toBe(h.t.generatedFileChanged);
    expect(h.controller.status().sourceDiagnostic).toBeUndefined(); expect(await fs.readFile(other)).toEqual(edited);
    expect(await fs.readFile(h.targetPath)).toEqual(h.targetBytes); expect(h.commit).not.toHaveBeenCalled(); await h.unchanged();
  } finally { await h.cleanup(); }
});

it.each(['panel', 'controller'] as const)('matching-backup fixture restoration clears the hint on %s retry, with unchanged ranking and idempotent refresh', async entry => {
  const h = await fixture('zh');
  try {
    const baseline = await h.start(); expect(baseline).toHaveLength(1); await Promise.resolve();
    await h.mutate('missing'); await expect(h.start()).rejects.toThrow(); await Promise.resolve();
    expect.soft(h.get('tb-notice').textContent).toBe(h.t.generatedFileMissing);
    // Deliberate test-only restoration of the saved exact output; plugin never repairs it automatically.
    await fs.writeFile(h.targetPath, h.targetBytes); await h.store.load();
    const entered = latch(), gate = latch(), managed = h.store.managedSourcePaths.bind(h.store);
    h.managed.mockImplementationOnce(async () => { entered.release(); await gate.promise; return managed(); });
    const retry = entry === 'panel' ? h.start() : h.controller.find('SearchNeedle', 'medium');
    try {
      await entered.promise; expect(h.controller.status().phase).toBe('searching'); expect(h.get('tb-notice').hidden).toBe(true);
    } finally { gate.release(); }
    expect(await retry).toEqual(baseline); await Promise.resolve();
    expect(h.controller.status().generatedFileDiagnostic).toBeUndefined(); expect(h.get('tb-notice').hidden).toBe(true);
    await h.port.open(baseline[0].fragment.evidence[0]); await h.port.openFragment!(baseline[0].fragment.id);
    expect(h.hostOpen).toHaveBeenCalledTimes(2); expect(h.commit).not.toHaveBeenCalled();
    await h.controller.refresh(); await h.controller.initialize(); await h.controller.refresh();
    await h.unchanged(); expect(await fs.readFile(h.targetPath)).toEqual(h.targetBytes);
    expect(h.model.mock.results.every(r => r.type === 'return' && r.value === undefined)).toBe(true);
  } finally { await h.cleanup(); }
});

it('unknown errors keep identity and ignore forged diagnostic/name/message fields', async () => {
  const h = await fixture();
  try {
    const error = Object.assign(new TypeError('SYNTHETIC_DETAIL_NOT_FOR_UI'), { name: 'GeneratedFileUnavailableError', generatedFileDiagnostic: 'missing' });
    h.managed.mockRejectedValueOnce(error);
    await expect(h.start()).rejects.toBe(error); await Promise.resolve();
    expect(generatedFileDiagnostic(error)).toBeUndefined(); expect(h.controller.status().generatedFileDiagnostic).toBeUndefined();
    expect(h.get('tb-notice').textContent).toBe(h.t.failure); expect(h.commit).not.toHaveBeenCalled(); await h.unchanged();
  } finally { await h.cleanup(); }
});

it.each(['state', 'journal', 'marker'] as const)('corrupt %s remains fail-closed without a missing-file diagnosis', async file => {
  const h = await fixture();
  try {
    const target = path.join(h.root, `Derived/.third-brain/${file}.json`), bytes = '{"synthetic-invalid":true}';
    await fs.writeFile(target, bytes); await expect(h.start()).rejects.toThrow(); await Promise.resolve();
    expect(h.get('tb-notice').textContent).toBe(h.t.failure); expect(h.commit).not.toHaveBeenCalled();
    expect(await fs.readFile(target, 'utf8')).toBe(bytes); expect(await fs.readFile(h.targetPath)).toEqual(h.targetBytes);
    for (const [name, body] of h.originals) expect(hash(await fs.readFile(path.join(h.root, name)))).toBe(hash(body));
  } finally { await h.cleanup(); }
});

it('source decoding failure after restoration replaces the old generated hint without exposing source text', async () => {
  const h = await fixture();
  try {
    await h.mutate('missing'); await expect(h.start()).rejects.toThrow();
    await fs.writeFile(h.targetPath, h.targetBytes); await fs.writeFile(path.join(h.root, 'note.md'), Buffer.from([0xc3, 0x28]));
    await expect(h.start()).rejects.toThrow(); await Promise.resolve();
    expect(h.controller.status()).toMatchObject({ phase: 'error', sourceDiagnostic: { relativePath: 'note.md', stage: 'decoding', reason: 'decode-failed' } });
    expect(h.controller.status().generatedFileDiagnostic).toBeUndefined(); expect(h.get('tb-notice').textContent).toContain(h.t.decodeFailed);
    expect(h.get('tb-notice').textContent).not.toContain(h.t.generatedFileMissing); expect(h.commit).not.toHaveBeenCalled();
  } finally { await h.cleanup(); }
});

it('an existing private source diagnostic takes precedence over generated-layer guidance', async () => {
  const h = await fixture();
  try {
    await h.mutate('changed'); const error = await h.store.load().catch(e => e);
    bindSourceDiagnostic(error, { relativePath: 'note.md', stage: 'reading', reason: 'read-failed' });
    h.managed.mockRejectedValueOnce(error); await expect(h.start()).rejects.toBe(error); await Promise.resolve();
    expect(h.controller.status().generatedFileDiagnostic).toBeUndefined(); expect(h.get('tb-notice').textContent).toContain(h.t.readFailed);
    expect(h.get('tb-notice').textContent).not.toContain(h.t.generatedFileChanged); expect(h.commit).not.toHaveBeenCalled(); await h.unchanged();
  } finally { await h.cleanup(); }
});

it('a cancelled managed-layer lookup cannot display its late protected-file rejection; a later search can recover', async () => {
  const h = await fixture(), entered = latch(), gate = latch(); let pending: Promise<SearchResult[]> | undefined;
  try {
    await h.mutate('changed'); const error = await h.store.load().catch(e => e);
    h.managed.mockImplementationOnce(async () => { entered.release(); await gate.promise; throw error; });
    pending = h.start(); const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await entered.promise; h.button(h.t.cancel).fire('click'); gate.release(); await rejected; await Promise.resolve();
    expect(h.controller.status().phase).toBe('cancelled'); expect(h.controller.status().generatedFileDiagnostic).toBeUndefined();
    expect(h.get('tb-notice').textContent).toContain(h.t.cancelled); expect(h.get('tb-notice').textContent).not.toContain(h.t.generatedFileChanged);
    expect(h.commit).not.toHaveBeenCalled(); await h.unchanged();
    await fs.writeFile(h.targetPath, h.targetBytes); expect(await h.start()).toHaveLength(1); await Promise.resolve();
    expect(h.get('tb-notice').hidden).toBe(true);
  } finally { gate.release(); await pending?.catch(() => {}); await h.cleanup(); }
});
