// SPDX-License-Identifier: MIT
// Authored synthetic files; real renderer/Main/Controller/FileSources/OwnedStore.
// DOM/Obsidian shells, injected EIO and latches are not native-host or real-I/O-fault proof.
import { promises as fs } from 'node:fs';
import path from 'node:path';
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
const copy = {
  en: {
    missing: 'A generated file is missing. Keep the generated folder, including hidden files. Check a matching backup in a test copy before reopening the plugin; refreshing or clearing the index will not safely repair this.',
    changed: 'A generated file differs from its saved version and is protected. Keep your edits and the generated folder, and inspect the conflict in a test copy. Do not overwrite the file or clear the index to force a refresh.',
    unavailable: 'This fragment is no longer available in the current generated layer or host file list. Find connections again and open a new result. If it still fails, keep the generated folder and inspect it in a test copy.',
  },
  zh: {
    missing: '提炼层有生成文件缺失。请保留生成目录及隐藏文件，在测试副本中核对并恢复备份里的对应版本，再重新打开插件；反复更新或清空索引不能安全修复此问题。',
    changed: '提炼层有生成文件与已保存版本不一致，已停止本次操作以保护改动。请保留改动和生成目录，在测试副本中检查冲突；不要覆盖文件或清空索引来强行更新。',
    unavailable: '这个片段已不在当前提炼层或宿主文件列表中。请再次寻找关联，从新结果打开；若仍失败，请保留生成目录，在测试副本中排查。',
  },
};
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function fixture(locale: 'en' | 'zh' = 'en') {
  const scope = path.resolve('.local/fragment-open-recovery/cases'); await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'case-'));
  const originals = new Map([
    ['note.md', '# Context\nFragmentNeedle is a synthetic observation with an exact source quotation.'],
    ['other.md', '# Other\nA separate synthetic paragraph retains its own provenance and generated file.'],
    ['Derived/handwritten.txt', 'Synthetic unowned content; never adopt or overwrite.'],
  ]);
  for (const [name, body] of originals) { await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true }); await fs.writeFile(path.join(root, name), body); }
  const settings = { ...defaults, excludes: [] as string[], outputFolder: 'Derived' }, store = new OwnedStore(root, 'Derived');
  const sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const factory = vi.fn(() => undefined), controller = new ThirdBrainController(sources, store, () => settings, factory, async () => {});
  await controller.initialize(); await controller.refresh(); await controller.initialize();
  const statePath = path.join(root, 'Derived/.third-brain/state.json');
  const stateBytes = () => fs.readFile(statePath), initialBytes = await stateBytes();
  const openFile = vi.fn(async (_file: { path: string }) => {});
  const getFileByPath = vi.fn((name: string): { path: string; extension: string } | null => ({ path: name, extension: 'md' }));
  const app = { vault: { getFileByPath }, workspace: { getLeaf: () => ({ openFile }) } };
  const port = ThirdBrainPlugin.prototype.panelPort.call({ controller, store, app } as unknown as ThirdBrainPlugin);
  const queries: Promise<SearchResult[]>[] = [], opens: Promise<void>[] = [], refreshes: Promise<void>[] = [];
  const find = port.find.bind(port), open = port.openFragment!.bind(port), refresh = port.refresh.bind(port);
  vi.spyOn(port, 'find').mockImplementation((...args) => { const p = find(...args); queries.push(p); return p; });
  vi.spyOn(port, 'openFragment').mockImplementation(id => { const p = open(id); opens.push(p); return p; });
  vi.spyOn(port, 'refresh').mockImplementation(() => { const p = refresh(); refreshes.push(p); return p; });
  vi.stubGlobal('document', { createElement: (tag: string) => new NodeStub(tag) });
  const container = new NodeStub('main'), t = messages(locale), dispose = mountPanel(container as unknown as HTMLElement, port, locale);
  const get = (cls: string) => container.all().find(n => n.className === cls)!;
  const button = (text: string) => container.all().find(n => n.tag === 'button' && n.textContent === text)!;
  const search = async () => { button(t.find).fire('click'); const items = await queries.at(-1)!; await Promise.resolve(); return items; };
  const refreshNotes = async () => { button(t.index).fire('click'); await refreshes.at(-1)!; await Promise.resolve(); };
  const click = () => { button(t.openFragment).fire('click'); return opens.at(-1)!; };
  const protectedFiles = async () => {
    for (const [name, body] of originals) expect(hash(await fs.readFile(path.join(root, name)))).toBe(hash(body));
    expect(await stateBytes()).toEqual(initialBytes);
    expect(factory.mock.results.every(x => x.type === 'return' && x.value === undefined)).toBe(true);
  };
  const cleanup = async () => { controller.cancel(); await Promise.allSettled([...queries, ...opens, ...refreshes]); dispose(); controller.dispose(); };
  get('tb-idea').value = 'FragmentNeedle'; get('tb-idea').fire('input');
  const initial = await search(); expect(initial).toHaveLength(1);
  const target = await store.fragmentPath(initial[0].fragment.id), targetPath = path.join(root, target), targetBytes = await fs.readFile(targetPath);
  return { root, originals, store, sources, controller, port, openFile, getFileByPath, get, t, initial, target, targetPath, targetBytes, statePath, stateBytes, search, refreshNotes, click, queries, opens, refreshes, protectedFiles, dispose, cleanup };
}

it.each(['en', 'zh'] as const)('missing generated file gives safe recovery in %s; a matching-backup fixture can reopen without regeneration', async locale => {
  const h = await fixture(locale);
  try {
    await h.click(); expect(h.openFile).toHaveBeenLastCalledWith({ path: h.target, extension: 'md' }); h.openFile.mockClear();
    await fs.unlink(h.targetPath); // Only this test's owned synthetic output.
    await expect(h.click()).rejects.toThrow(); await Promise.resolve();
    expect.soft(h.get('tb-notice').textContent).toBe(copy[locale].missing); expect(h.get('tb-notice').hidden).toBe(false);
    expect(h.openFile).not.toHaveBeenCalled(); expect(h.queries).toHaveLength(1); expect(h.refreshes).toHaveLength(0);
    await expect(h.store.load()).rejects.toThrow(); await expect(h.controller.refresh()).rejects.toThrow();
    await expect(fs.stat(h.targetPath)).rejects.toMatchObject({ code: 'ENOENT' }); await h.protectedFiles();
    // Explicit fixture action: restore its exact generated backup, not a plugin repair.
    await fs.writeFile(h.targetPath, h.targetBytes); await h.controller.initialize(); await h.refreshNotes();
    await h.search(); await h.click(); expect(h.openFile).toHaveBeenCalledOnce(); expect(h.get('tb-notice').hidden).toBe(true);
    await h.controller.initialize(); expect(await fs.readFile(h.targetPath)).toEqual(h.targetBytes); await h.protectedFiles();
  } finally { await h.cleanup(); }
});

it.each(['en', 'zh'] as const)('human-edited generated file gives protection guidance in %s without adopting or rewriting it', async locale => {
  const h = await fixture(locale);
  try {
    const edited = Buffer.concat([h.targetBytes, Buffer.from('\nSynthetic human amendment that must remain intact.\n')]);
    await fs.writeFile(h.targetPath, edited);
    await expect(h.click()).rejects.toThrow(); await Promise.resolve();
    expect.soft(h.get('tb-notice').textContent).toBe(copy[locale].changed);
    expect(h.openFile).not.toHaveBeenCalled(); expect(h.refreshes).toHaveLength(0); expect(h.queries).toHaveLength(1);
    await expect(h.store.load()).rejects.toThrow(); await expect(h.store.recover()).rejects.toThrow();
    await expect(h.store.managedSourcePaths()).rejects.toThrow(); await expect(h.controller.refresh()).rejects.toThrow();
    expect(await fs.readFile(h.targetPath)).toEqual(edited); await h.protectedFiles();
  } finally { await h.cleanup(); }
});

it('a protected different output blocks the complete layer, without falsely naming the clicked fragment as edited', async () => {
  const h = await fixture();
  try {
    const index = await h.store.load(), other = Object.values(index!.fragments).find(f => f.id !== h.initial[0].fragment.id)!;
    const otherPath = path.join(h.root, await h.store.fragmentPath(other.id)); await fs.appendFile(otherPath, '\nSynthetic separate human edit.');
    const edited = await fs.readFile(otherPath); await expect(h.click()).rejects.toThrow(); await Promise.resolve();
    expect.soft(h.get('tb-notice').textContent).toBe(copy.en.changed); expect(h.openFile).not.toHaveBeenCalled();
    expect(await fs.readFile(otherPath)).toEqual(edited); expect(await fs.readFile(h.targetPath)).toEqual(h.targetBytes); await h.protectedFiles();
  } finally { await h.cleanup(); }
});

it.each(['host-missing', 'retired-result'] as const)('%s refuses to guess a path and gives new-result guidance', async fault => {
  const h = await fixture();
  try {
    if (fault === 'host-missing') h.getFileByPath.mockReturnValueOnce(null);
    else {
      // A real current owned layer with no member matching the still-visible card.
      await fs.writeFile(path.join(h.root, 'note.md'), '# Replacement\nA wholly different observation no longer retains the previous excerpt.');
      h.originals.set('note.md', await fs.readFile(path.join(h.root, 'note.md'), 'utf8'));
      const settings = { ...defaults, outputFolder: 'Derived' };
      const controller = new ThirdBrainController(h.sources, h.store, () => settings, () => undefined, async () => {});
      try { await controller.initialize(); await controller.refresh(); } finally { controller.dispose(); }
    }
    await expect(h.click()).rejects.toThrow(); await Promise.resolve();
    expect.soft(h.get('tb-notice').textContent).toBe(copy.en.unavailable); expect(h.openFile).not.toHaveBeenCalled();
    expect(h.queries).toHaveLength(1); expect(h.refreshes).toHaveLength(0);
    await expect(h.store.fragmentPath('../manual.md')).rejects.toThrow();
  } finally { await h.cleanup(); }
});

it.each(['load', 'host', 'same-name', 'same-message'] as const)('unknown %s error retains identity and is not reclassified as missing or edited', async fault => {
  const h = await fixture();
  try {
    const failure = Object.assign(new Error(fault === 'same-message' ? 'Owned generated file is missing or human-edited' : 'SYNTHETIC_DETAIL_NOT_FOR_UI'),
      { code: 'EIO', name: fault === 'same-name' ? 'GeneratedFileUnavailableError' : 'Error', generatedFileDiagnostic: 'missing' });
    if (fault === 'host') h.openFile.mockRejectedValueOnce(failure);
    else vi.spyOn(h.store, 'load').mockRejectedValueOnce(failure);
    await expect(h.click()).rejects.toBe(failure); await Promise.resolve();
    expect(h.get('tb-notice').textContent).toBe(h.t.failure); expect(h.get('tb-notice').textContent).not.toContain('SYNTHETIC_DETAIL');
    expect(h.openFile).toHaveBeenCalledTimes(fault === 'host' ? 1 : 0); await h.protectedFiles();
  } finally { await h.cleanup(); }
});

it.each(['state', 'journal', 'marker'] as const)('corrupt %s is not downgraded into a repairable missing-file notice', async file => {
  const h = await fixture();
  try {
    const target = path.join(h.root, `Derived/.third-brain/${file}.json`); await fs.writeFile(target, '{"synthetic-invalid":true}');
    const before = await fs.readFile(target); await expect(h.click()).rejects.toThrow(); await Promise.resolve();
    expect(h.get('tb-notice').textContent).toBe(h.t.failure); expect(h.openFile).not.toHaveBeenCalled();
    expect(await fs.readFile(target)).toEqual(before); expect(await fs.readFile(h.targetPath)).toEqual(h.targetBytes);
  } finally { await h.cleanup(); }
});

it.each(['edit', 'refresh-search', 'structured-failure', 'cancel', 'dispose'] as const)('late fragment-open rejection cannot overwrite %s intent or status', async action => {
  const h = await fixture(), entered = latch(), gate = latch(); let pending: Promise<void> | undefined;
  try {
    const failure = new Error('SYNTHETIC_DELAYED_IO');
    vi.spyOn(h.store, 'load').mockImplementationOnce(async () => { entered.release(); await gate.promise; throw failure; });
    pending = h.click(); const rejection = expect(pending).rejects.toBe(failure); await entered.promise;
    if (action === 'edit') { h.get('tb-idea').value = 'New intent'; h.get('tb-idea').fire('input'); }
    if (action === 'refresh-search') { await h.refreshNotes(); await h.search(); }
    if (action === 'structured-failure') {
      await fs.writeFile(path.join(h.root, 'note.md'), Buffer.from([0xc3, 0x28])); await expect(h.refreshNotes()).rejects.toThrow();
      expect(h.get('tb-notice').textContent).toContain(h.t.decodeFailed);
    }
    if (action === 'cancel') {
      const read = h.sources.read.bind(h.sources);
      vi.spyOn(h.sources, 'read').mockImplementationOnce(async (...args) => { h.controller.cancel(); return read(...args); });
      await expect(h.search()).rejects.toMatchObject({ name: 'AbortError' }); await Promise.resolve();
      expect(h.get('tb-notice').textContent).toContain(h.t.cancelled);
    }
    if (action === 'dispose') h.dispose();
    const before = { text: h.get('tb-notice').textContent, hidden: h.get('tb-notice').hidden };
    gate.release(); await rejection; await Promise.resolve();
    expect({ text: h.get('tb-notice').textContent, hidden: h.get('tb-notice').hidden }).toEqual(before);
    expect(h.openFile).not.toHaveBeenCalled();
  } finally { gate.release(); await pending?.catch(() => {}); await h.cleanup(); }
});

it('opening generated Markdown does not dismiss a still-unresolved original-evidence warning', async () => {
  const h = await fixture(); let pending: Promise<void> | undefined;
  try {
    const open = h.port.open.bind(h.port);
    vi.spyOn(h.port, 'open').mockImplementation(e => { pending = open(e); return pending; });
    await fs.appendFile(path.join(h.root, 'note.md'), '\nSynthetic source changed after search.');
    h.get('tb-source').fire('click'); await expect(pending).rejects.toThrow(); await Promise.resolve();
    expect(h.get('tb-notice').textContent).toBe(h.t.sourceEvidenceUnavailable); expect(h.get('tb-notice').hidden).toBe(false);
    await h.click(); await Promise.resolve(); // The saved generated file still exists; its source has not recovered.
    expect(h.openFile).toHaveBeenCalledOnce(); expect(h.get('tb-notice').textContent).toBe(h.t.sourceEvidenceUnavailable);
    expect(h.get('tb-notice').hidden).toBe(false);
  } finally { await pending?.catch(() => {}); await h.cleanup(); }
});

it('a deliberate fragment click after cancelled search still reports the protected layer', async () => {
  const h = await fixture();
  try {
    const read = h.sources.read.bind(h.sources);
    vi.spyOn(h.sources, 'read').mockImplementationOnce(async (...args) => { h.controller.cancel(); return read(...args); });
    await expect(h.search()).rejects.toMatchObject({ name: 'AbortError' }); await Promise.resolve();
    await fs.appendFile(h.targetPath, '\nSynthetic human edit after cancellation.');
    await expect(h.click()).rejects.toThrow(); await Promise.resolve();
    expect(h.get('tb-notice').textContent).toBe(copy.en.changed); expect(h.openFile).not.toHaveBeenCalled();
    await h.protectedFiles();
  } finally { await h.cleanup(); }
});
