// SPDX-License-Identifier: MIT
// Authored synthetic files; real Main/renderer/Controller/FileSources/OwnedStore.
// Host/DOM shells and injected failures/latches do not prove native clicks or real disk faults.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FileSystemAdapter } from 'obsidian';
import { afterEach, expect, it, vi } from 'vitest';
import ThirdBrainPlugin from '../src/main';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults } from '../src/settings';
import { messages } from '../src/i18n';
import { generatedFileDiagnostic } from '../src/core/generated-diagnostics';
import { mountPanel } from '../src/ui';

const notices = vi.hoisted(() => [] as string[]);
vi.mock('obsidian', () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, FileSystemAdapter: class {},
  Notice: class { constructor(text: string) { notices.push(text); } } }));
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
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); notices.length = 0; });
type Fault = 'missing' | 'changed';
const guidance = (fault: Fault, locale: 'en' | 'zh') => fault === 'missing' ? messages(locale).generatedFileMissing : locale === 'zh'
  ? '提炼层有生成文件与已保存版本不一致，已停止本次操作以保护改动。请保留改动和生成目录，在测试副本中检查冲突；不要覆盖文件或清空索引来强行更新。'
  : messages(locale).generatedFileChanged;

async function fixture(locale: 'en' | 'zh' = 'en', initialFault?: Fault) {
  const scope = path.resolve('.local/maintenance-store-recovery/cases'); await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'case-'));
  const original = 'MaintenanceNeedle is a synthetic observation with complete exact source evidence.';
  await fs.writeFile(path.join(root, 'original.md'), original);
  await fs.mkdir(path.join(root, 'Derived'));
  await fs.writeFile(path.join(root, 'Derived/manual.txt'), 'Synthetic user-owned content.');
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] as string[], locale };
  const seedStore = new OwnedStore(root, 'Derived'), seedSources = new FileSources(root, () => settings, () => seedStore.managedSourcePaths());
  const seed = new ThirdBrainController(seedSources, seedStore, () => settings, () => undefined, async () => {});
  await seed.initialize(); await seed.refresh(); seed.dispose();
  const index = (await seedStore.load())!, id = Object.values(index.fragments)[0].id;
  const targetPath = path.join(root, await seedStore.fragmentPath(id)), targetBytes = await fs.readFile(targetPath);
  const statePath = path.join(root, 'Derived/.third-brain/state.json'), stateBytes = await fs.readFile(statePath);
  const mutate = async (fault: Fault) => {
    if (fault === 'missing') await fs.unlink(targetPath); // This fixture's synthetic output only.
    else await fs.writeFile(targetPath, Buffer.concat([targetBytes, Buffer.from('\nSynthetic human amendment.')]));
  };
  if (initialFault) await mutate(initialFault);
  const commands = new Map<string, () => void>(), hostOpen = vi.fn(async () => {}), save = vi.fn(async () => {});
  const plugin = Object.assign(Object.create(ThirdBrainPlugin.prototype), {
    app: { vault: { adapter: Object.assign(Object.create(FileSystemAdapter.prototype), { getBasePath: () => root }),
      getFiles: () => [{ path: 'original.md' }], getFileByPath: (name: string) => ({ path: name }) },
    workspace: { onLayoutReady: () => {}, getLeavesOfType: () => [], getLeaf: () => ({ openFile: hostOpen }) } },
    loadData: async () => settings, saveData: save, registerView: () => {}, addRibbonIcon: () => {}, addSettingTab: () => {}, registerInterval: () => {},
    addCommand: (c: { id: string; callback: () => void }) => commands.set(c.id, c.callback),
  }) as ThirdBrainPlugin;
  vi.stubGlobal('window', { setInterval: () => 1 });
  vi.stubGlobal('document', { createElement: (tag: string) => new NodeStub(tag) });
  await plugin.onload();
  const controller = plugin.controller, store = (plugin as unknown as { store: OwnedStore }).store;
  const sources = (controller as unknown as { sources: FileSources }).sources;
  const commit = vi.spyOn(store, 'commit'), port = plugin.panelPort(), refreshes: Promise<void>[] = [];
  const find = vi.spyOn(port, 'find'), open = vi.spyOn(port, 'openFragment');
  const refresh = controller.refresh.bind(controller);
  vi.spyOn(controller, 'refresh').mockImplementation(() => { const p = refresh(); refreshes.push(p); return p; });
  const container = new NodeStub('main'), t = messages(locale);
  const dispose = mountPanel(container as unknown as HTMLElement, port, locale);
  const get = (cls: string) => container.all().find(n => n.className === cls)!;
  const start = (entry: 'panel' | 'command' | 'scheduled' = 'panel') => {
    if (entry === 'panel') container.all().find(n => n.tag === 'button' && n.textContent === t.index)!.fire('click');
    else if (entry === 'command') commands.get('refresh-derived-layer')!();
    else {
      plugin.settings.schedule = 'daily'; plugin.settings.lastIndexedAt = '';
      void (plugin as unknown as { runScheduled(): Promise<void> }).runScheduled();
    }
    return refreshes.at(-1)!;
  };
  const unchanged = async () => {
    expect(hash(await fs.readFile(path.join(root, 'original.md')))).toBe(hash(original));
    expect(await fs.readFile(path.join(root, 'Derived/manual.txt'), 'utf8')).toBe('Synthetic user-owned content.');
    expect(await fs.readFile(statePath)).toEqual(stateBytes);
  };
  const cleanup = async () => { controller.cancel(); await Promise.allSettled(refreshes); await Promise.resolve(); dispose(); plugin.onunload(); };
  return { root, plugin, controller, store, sources, port, commit, find, open, hostOpen, save, get, t, start, mutate, targetPath, targetBytes, statePath, unchanged, cleanup };
}

for (const entry of ['panel', 'command', 'scheduled'] as const) for (const fault of ['missing', 'changed'] as const)
it.each(['en', 'zh'] as const)(`${entry} first maintenance refusal explains ${fault} in %s without any open/search first`, async locale => {
  const h = await fixture(locale);
  try {
    await h.mutate(fault); const afterMutation = fault === 'changed' ? await fs.readFile(h.targetPath) : null;
    const error = await h.start(entry).catch(e => e); await Promise.resolve();
    expect(generatedFileDiagnostic(error)).toBe(fault);
    expect.soft(h.controller.status()).toMatchObject({ phase: 'error', generatedFileDiagnostic: fault, commitOutcome: 'not-started' });
    expect.soft(h.get('tb-notice').textContent).toContain(guidance(fault, locale));
    expect.soft(h.get('tb-notice').textContent).toContain(h.t.notCommitted);
    expect(h.get('tb-notice').textContent).not.toContain(h.t.retainedIndex);
    expect(h.get('tb-notice').hidden).toBe(false);
    if (entry === 'command') expect.soft(notices.at(-1)).toBe(h.get('tb-notice').textContent);
    else expect(notices).toEqual([]); // Quiet schedule, same visible panel diagnostics.
    expect(h.commit).not.toHaveBeenCalled(); expect(h.find).not.toHaveBeenCalled(); expect(h.open).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled(); expect(h.hostOpen).not.toHaveBeenCalled();
    await expect(h.store.load()).rejects.toThrow(); await h.unchanged();
    if (afterMutation) expect(await fs.readFile(h.targetPath)).toEqual(afterMutation);
    else await expect(fs.stat(h.targetPath)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await h.cleanup(); }
});

for (const fault of ['missing', 'changed'] as const) it.each(['en', 'zh'] as const)(`startup ${fault} carries safe guidance into the first panel and command in %s`, async locale => {
  const h = await fixture(locale, fault);
  try {
    expect.soft(h.controller.status()).toMatchObject({ phase: 'error', errorCode: 'index-unavailable', generatedFileDiagnostic: fault });
    expect.soft(h.get('tb-notice').textContent).toContain(guidance(fault, locale));
    expect.soft(notices.at(-1)).toBe(h.get('tb-notice').textContent);
    expect(h.get('tb-notice').textContent).not.toContain(h.t.noCompleteIndex); // An unverified disk index is not proof of first use.
    await expect(h.start('command')).rejects.toThrow(); await Promise.resolve();
    expect.soft(notices.at(-1)).toBe(h.get('tb-notice').textContent);
    expect(h.commit).not.toHaveBeenCalled(); await h.unchanged();
  } finally { await h.cleanup(); }
});

it('matching-backup fixture restoration clears command-driven notice and permits strict reload, search, open and idempotent refresh', async () => {
  const h = await fixture('zh');
  try {
    await h.mutate('missing'); await expect(h.start()).rejects.toThrow(); await Promise.resolve();
    expect.soft(h.get('tb-notice').textContent).toContain(guidance('missing', 'zh'));
    // Explicit fixture restoration from saved exact bytes; no auto-repair or regeneration.
    await fs.writeFile(h.targetPath, h.targetBytes);
    await h.start('command'); await Promise.resolve();
    expect(h.get('tb-notice').hidden).toBe(true); expect(h.controller.status().phase).toBe('idle');
    await h.controller.initialize(); const results = await h.port.find('MaintenanceNeedle', 'low');
    expect(results).toHaveLength(1); await h.port.openFragment!(results[0].fragment.id); expect(h.hostOpen).toHaveBeenCalledOnce();
    await h.start(); await h.controller.initialize(); await h.unchanged();
    expect(await fs.readFile(h.targetPath)).toEqual(h.targetBytes);
  } finally { await h.cleanup(); }
});

it.each(['initialize', 'refresh'] as const)('unknown %s error keeps identity and ignores forged name/message/diagnostic fields', async phase => {
  const h = await fixture();
  try {
    const failure = Object.assign(new TypeError('SYNTHETIC_DETAIL_NOT_FOR_UI'), { name: 'GeneratedFileUnavailableError', generatedFileDiagnostic: 'missing' });
    if (phase === 'initialize') vi.spyOn(h.store, 'recover').mockRejectedValueOnce(failure);
    else vi.spyOn(h.store, 'managedSourcePaths').mockRejectedValueOnce(failure);
    const result = await (phase === 'initialize' ? h.controller.initialize() : h.start('command')).catch(e => e); await Promise.resolve();
    expect.soft(result).toBe(failure);
    expect(generatedFileDiagnostic(result)).toBeUndefined();
    expect(h.controller.status()).not.toHaveProperty('generatedFileDiagnostic', 'missing');
    expect(h.get('tb-notice').textContent).toBe(phase === 'initialize' ? h.t.unavailable : h.t.failure);
    expect(h.get('tb-notice').textContent).not.toContain('SYNTHETIC_DETAIL');
    if (phase === 'refresh') expect(notices.at(-1)).toBe(h.t.failure);
    expect(h.commit).not.toHaveBeenCalled(); await h.unchanged();
  } finally { await h.cleanup(); }
});

it.each(['state', 'journal', 'marker'] as const)('corrupt %s remains an unknown/global refusal, not a matching-backup diagnosis', async file => {
  const h = await fixture();
  try {
    const target = path.join(h.root, `Derived/.third-brain/${file}.json`), bytes = '{"synthetic-invalid":true}';
    await fs.writeFile(target, bytes); await expect(h.start('command')).rejects.toThrow(); await Promise.resolve();
    expect(h.get('tb-notice').textContent).toBe(h.t.failure); expect(notices.at(-1)).toBe(h.t.failure);
    expect(h.commit).not.toHaveBeenCalled(); expect(await fs.readFile(target, 'utf8')).toBe(bytes);
    expect(await fs.readFile(h.targetPath)).toEqual(h.targetBytes);
  } finally { await h.cleanup(); }
});

it('a source diagnostic after generated-layer repair replaces the old hint and keeps its own no-commit/evidence warning', async () => {
  const h = await fixture();
  try {
    await h.mutate('missing'); await expect(h.start()).rejects.toThrow();
    await fs.writeFile(h.targetPath, h.targetBytes);
    await fs.writeFile(path.join(h.root, 'original.md'), Buffer.from([0xc3, 0x28]));
    await expect(h.start('command')).rejects.toThrow(); await Promise.resolve();
    expect(h.get('tb-notice').textContent).toContain(h.t.decodeFailed);
    expect(h.get('tb-notice').textContent).toContain(h.t.retainedIndex);
    expect(h.get('tb-notice').textContent).not.toContain(h.t.generatedFileMissing);
    expect.soft(notices.at(-1)).toBe(h.get('tb-notice').textContent);
    expect(h.commit).not.toHaveBeenCalled();
  } finally { await h.cleanup(); }
});

it('a real protected-output refusal discovered after commit starts retains the unknown-outcome warning', async () => {
  const h = await fixture();
  try {
    const commit = h.store.commit.bind(h.store);
    h.commit.mockImplementationOnce(async (...args) => { await h.mutate('changed'); return commit(...args); });
    await expect(h.start()).rejects.toThrow(); await Promise.resolve();
    expect.soft(h.get('tb-notice').textContent).toContain(guidance('changed', 'en'));
    expect(h.get('tb-notice').textContent).toContain(h.t.commitUnknown);
    expect(h.get('tb-notice').textContent).not.toContain(h.t.notCommitted);
    expect(h.get('tb-notice').textContent).not.toContain(h.t.retainedIndex);
    await h.unchanged(); expect(await fs.readFile(h.targetPath, 'utf8')).toContain('Synthetic human amendment.');
  } finally { await h.cleanup(); }
});

it('cancelled managed-layer read ignores a late protected-file refusal, without starting commit', async () => {
  const h = await fixture(), entered = latch(), gate = latch(); let pending: Promise<void> | undefined;
  try {
    await h.mutate('changed'); const error = await h.store.load().catch(e => e);
    vi.spyOn(h.store, 'managedSourcePaths').mockImplementationOnce(async () => { entered.release(); await gate.promise; throw error; });
    pending = h.start(); const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await entered.promise; h.controller.cancel(); await rejected; await Promise.resolve();
    const state = h.controller.status(), text = h.get('tb-notice').textContent;
    expect(state.phase).toBe('cancelled'); expect(text).toContain(h.t.cancelled);
    expect(text).not.toContain(h.t.generatedFileChanged);
    gate.release(); await Promise.resolve(); await Promise.resolve();
    expect(h.controller.status()).toEqual(state); expect(h.get('tb-notice').textContent).toBe(text);
    expect(h.commit).not.toHaveBeenCalled(); await h.unchanged();
  } finally { gate.release(); await pending?.catch(() => {}); await h.cleanup(); }
});
