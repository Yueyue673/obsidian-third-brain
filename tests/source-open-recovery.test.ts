// SPDX-License-Identifier: MIT
// Synthetic notes on disk; production renderer -> Main -> Controller -> FileSources/
// OwnedStore. DOM/Obsidian shells and injected I/O latches are not native-host proof.
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
const recoveryCopy = (locale: 'en' | 'zh') => locale === 'en'
  ? "This result's source evidence is no longer current or available. Check source changes or exclusions, choose Refresh notes, then Find connections again and open a new result."
  : '这条结果的来源证据已变更或不再可用。请检查来源改动或排除设置，点“更新笔记”，再点“寻找关联”，从新结果查看原文。';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function fixture(locale: 'en' | 'zh' = 'en', variant: 'single' | 'merged' | 'network' = 'single') {
  const scope = path.resolve('.local/source-open-recovery/cases'); await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'case-'));
  const text = '# First revision\nRecoveryNeedle preserves a synthetic observation with its original context.';
  const originals = new Map([['a.md', text], ['Derived/handwritten.txt', 'Synthetic unowned text; do not overwrite.']]);
  if (variant === 'merged') originals.set('b.md', text);
  if (variant === 'network') {
    // Declared synthetic facets, not AI-discovered mechanisms or quality evidence.
    originals.set('a.md', '---\nmechanisms: [recoveryneedle, loopbridge]\n---\n' + text);
    originals.set('b.md', '---\nmechanisms: [loopbridge]\n---\n# Rehearsal\nA rehearsal corrects its next attempt with observed feedback.');
  }
  for (const [name, body] of originals) { await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true }); await fs.writeFile(path.join(root, name), body); }
  const settings = { ...defaults, excludes: [] as string[], outputFolder: 'Derived' }, store = new OwnedStore(root, 'Derived');
  const sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const factory = vi.fn(() => undefined), controller = new ThirdBrainController(sources, store, () => settings, factory, async () => {});
  await controller.initialize(); await controller.refresh(); await controller.initialize();
  const stateBytes = () => fs.readFile(path.join(root, 'Derived/.third-brain/state.json'));
  const initialBytes = await stateBytes();
  const view = Object.assign(Object.create(MarkdownView.prototype), {
    file: { path: 'a.md', extension: 'md' }, getMode: () => 'source',
    editor: { getValue: () => originals.get(view.file.path), setSelection: vi.fn(), scrollIntoView: vi.fn(), setValue: vi.fn(), replaceRange: vi.fn() },
  });
  const openFile = vi.fn(async (file: { path: string; extension: string }) => { view.file = file; });
  const getFileByPath = vi.fn((name: string): { path: string; extension: string } | null => ({ path: name, extension: 'md' }));
  const app = { vault: { getFileByPath }, workspace: { getLeaf: () => ({ view, openFile }) } };
  const port = ThirdBrainPlugin.prototype.panelPort.call({ controller, store, app } as unknown as ThirdBrainPlugin);
  const queries: Promise<SearchResult[]>[] = [], opens: Promise<void>[] = [], refreshes: Promise<void>[] = [];
  const find = port.find.bind(port), open = port.open.bind(port), refresh = port.refresh.bind(port);
  vi.spyOn(port, 'find').mockImplementation((...args) => { const p = find(...args); queries.push(p); return p; });
  vi.spyOn(port, 'open').mockImplementation(e => { const p = open(e); opens.push(p); return p; });
  vi.spyOn(port, 'refresh').mockImplementation(() => { const p = refresh(); refreshes.push(p); return p; });
  vi.stubGlobal('document', { createElement: (tag: string) => new NodeStub(tag) });
  const container = new NodeStub('main'), t = messages(locale), dispose = mountPanel(container as unknown as HTMLElement, port, locale);
  const get = (cls: string) => container.all().find(n => n.className === cls)!;
  const button = (text: string) => container.all().find(n => n.tag === 'button' && n.textContent === text)!;
  const search = async () => { button(t.find).fire('click'); const items = await queries.at(-1)!; await Promise.resolve(); return items; };
  const runRefresh = async () => { button(t.index).fire('click'); await refreshes.at(-1)!; await Promise.resolve(); };
  const click = (node = get('tb-source')) => { node.fire('click'); return opens.at(-1)!; };
  const change = async (name: string, body: string) => { originals.set(name, body); await fs.writeFile(path.join(root, name), body); };
  const protectedFiles = async () => {
    for (const [name, body] of originals) expect(hash(await fs.readFile(path.join(root, name)))).toBe(hash(body));
    expect(view.editor.setValue).not.toHaveBeenCalled(); expect(view.editor.replaceRange).not.toHaveBeenCalled();
    expect(factory.mock.results.every(x => x.type === 'return' && x.value === undefined)).toBe(true);
  };
  const cleanup = async () => { controller.cancel(); await Promise.allSettled([...queries, ...opens, ...refreshes]); dispose(); controller.dispose(); };
  get('tb-idea').value = 'RecoveryNeedle'; get('tb-idea').fire('input'); get('tb-select').value = 'high';
  const initial = await search(); expect(initial.length).toBeGreaterThan(0);
  return { root, originals, text, settings, store, sources, controller, port, view, openFile, getFileByPath, get, container, t, initial, initialBytes, stateBytes, search, runRefresh, click, change, queries, opens, refreshes, protectedFiles, cleanup };
}

it.each(['en', 'zh'] as const)('changed source gives actionable recovery, then the real refresh/search/open journey succeeds in %s', async locale => {
  const h = await fixture(locale);
  try {
    const old = h.get('tb-source');
    await h.change('a.md', '# Revised evidence\nNew context adds a later section.\n\nRecoveryNeedle preserves a revised synthetic observation.');
    await expect(h.click(old)).rejects.toThrow(); await Promise.resolve();
    expect.soft(h.get('tb-notice').textContent).toBe(recoveryCopy(locale)); expect(h.get('tb-notice').hidden).toBe(false);
    expect(h.openFile).not.toHaveBeenCalled(); expect(h.get('tb-idea').value).toBe('RecoveryNeedle');
    expect(h.queries).toHaveLength(1); expect(h.refreshes).toHaveLength(0); expect(await h.stateBytes()).toEqual(h.initialBytes);
    await h.runRefresh(); expect(h.get('tb-notice').hidden).toBe(true); expect(h.get('tb-source')).toBeUndefined();
    expect(h.queries).toHaveLength(1); // No automatic query/model call.
    const items = await h.search(), e = items[0].fragment.evidence[0];
    expect(e.sourceHash).not.toBe(h.initial[0].fragment.evidence[0].sourceHash);
    expect(h.originals.get('a.md')!.slice(e.start, e.end)).toBe(e.quote);
    await h.click(); expect(h.openFile).toHaveBeenCalledOnce();
    expect(h.view.editor.setSelection).toHaveBeenCalledWith({ line: 3, ch: 0 }, { line: 3, ch: e.quote.length });
    expect(h.get('tb-notice').hidden).toBe(true);
    // Detached old card cannot become valid simply because a refresh succeeded.
    await expect(h.port.open(h.initial[0].fragment.evidence[0])).rejects.toThrow(); expect(h.openFile).toHaveBeenCalledOnce();
    const saved = await h.stateBytes(); await h.controller.initialize(); await h.controller.refresh();
    expect(await h.stateBytes()).toEqual(saved); expect(await h.store.load()).not.toBeNull(); await h.protectedFiles();
  } finally { await h.cleanup(); }
});

it.each(['other-donor', 'excluded', 'missing', 'privacy'] as const)('%s refuses the entire old merged card with recovery guidance', async fault => {
  const h = await fixture('en', 'merged');
  try {
    expect(h.initial[0].fragment.evidence).toHaveLength(2);
    if (fault === 'other-donor') await h.change('b.md', h.text + '\nA new donor condition.');
    if (fault === 'excluded') h.settings.excludes.push('b.md');
    if (fault === 'missing') { await fs.unlink(path.join(h.root, 'b.md')); h.originals.delete('b.md'); }
    if (fault === 'privacy') await h.change('b.md', '---\nprivacy: private\n---\n' + h.text);
    for (const node of h.container.all().filter(n => n.className === 'tb-source')) {
      await expect(h.click(node)).rejects.toThrow(); await Promise.resolve();
      expect.soft(h.get('tb-notice').textContent).toBe(recoveryCopy('en'));
    }
    expect(h.openFile).not.toHaveBeenCalled(); expect(await h.stateBytes()).toEqual(h.initialBytes); await h.protectedFiles();
  } finally { await h.cleanup(); }
});

it('indirect explanation buttons on both sides retain full endpoint checks and recovery guidance', async () => {
  const h = await fixture('en', 'network');
  try {
    expect(h.initial.some(item => item.reasons.some(r => r.indirect))).toBe(true);
    const trace = h.get('tb-indirect-evidence'); expect(trace).toBeDefined();
    const nodes = trace.all().filter(n => n.className === 'tb-source'); expect(nodes).toHaveLength(2);
    for (const node of nodes) await h.click(node);
    h.openFile.mockClear(); await h.change('a.md', h.originals.get('a.md')! + '\nChanged anchor context.');
    for (const node of nodes) {
      await expect(h.click(node)).rejects.toThrow(); await Promise.resolve();
      expect.soft(h.get('tb-notice').textContent).toBe(recoveryCopy('en'));
    }
    expect(h.openFile).not.toHaveBeenCalled(); expect(await h.stateBytes()).toEqual(h.initialBytes); await h.protectedFiles();
  } finally { await h.cleanup(); }
});

it.each(['read', 'exclusion', 'host', 'same-name', 'same-message'] as const)('%s failure keeps its original identity and cannot masquerade as a stale-evidence diagnosis', async fault => {
  const h = await fixture();
  try {
    const failure = Object.assign(new Error(fault === 'same-message'
      ? 'This source changed or is no longer available. Refresh the index before opening this quotation.' : 'SYNTHETIC_ERROR_DETAIL_NOT_FOR_DISPLAY'),
    { code: 'EIO', ...(fault === 'same-name' ? { name: 'SourceEvidenceUnavailableError', sourceDiagnostic: { reason: 'stale' } } : {}) });
    if (fault === 'host') h.openFile.mockRejectedValueOnce(failure);
    else if (fault === 'exclusion') vi.spyOn(h.sources, 'excluded').mockRejectedValueOnce(failure);
    else vi.spyOn(h.sources, 'read').mockRejectedValueOnce(failure);
    await expect(h.click()).rejects.toBe(failure); await Promise.resolve();
    expect(h.get('tb-notice').textContent).toBe(h.t.failure); expect(h.get('tb-notice').textContent).not.toContain('SYNTHETIC_ERROR');
    expect(h.openFile).toHaveBeenCalledTimes(fault === 'host' ? 1 : 0); expect(await h.stateBytes()).toEqual(h.initialBytes); await h.protectedFiles();
  } finally { await h.cleanup(); }
});

it.each(['host-missing', 'navigation-race'] as const)('%s receives the same bounded recovery instead of an unrelated generic error', async fault => {
  const h = await fixture();
  try {
    if (fault === 'host-missing') h.getFileByPath.mockReturnValueOnce(null);
    else {
      const snapshot = h.controller.snapshot.bind(h.controller);
      vi.spyOn(h.controller, 'snapshot').mockImplementationOnce(async name => { await h.change(name, h.text + '\nIntentional synthetic race.'); return snapshot(name); });
    }
    await expect(h.click()).rejects.toThrow(); await Promise.resolve();
    expect.soft(h.get('tb-notice').textContent).toBe(recoveryCopy('en'));
    expect(h.openFile).not.toHaveBeenCalled(); expect(await h.stateBytes()).toEqual(h.initialBytes); await h.protectedFiles();
  } finally { await h.cleanup(); }
});

it('an open failure does not replace an existing structured refresh failure', async () => {
  const h = await fixture();
  try {
    // Controlled malformed bytes, not a real disk failure.
    await fs.writeFile(path.join(h.root, 'a.md'), Buffer.from([0xc3, 0x28]));
    await expect(h.runRefresh()).rejects.toThrow();
    const message = h.get('tb-notice').textContent;
    expect(message).toContain(h.t.decodeFailed); expect(message).toContain(h.t.notCommitted);
    await expect(h.click()).rejects.toThrow(); await Promise.resolve();
    expect.soft(h.get('tb-notice').textContent).toBe(message);
    expect(h.openFile).not.toHaveBeenCalled(); expect(await h.stateBytes()).toEqual(h.initialBytes);
    await h.change('a.md', h.text); await h.runRefresh(); expect(h.get('tb-notice').hidden).toBe(true); await h.protectedFiles();
  } finally { await h.cleanup(); }
});

it('a late old-card rejection cannot overwrite a completed refresh and new search', async () => {
  const h = await fixture(), entered = latch(), gate = latch();
  let pending: Promise<void> | undefined;
  try {
    const read = h.sources.read.bind(h.sources);
    vi.spyOn(h.sources, 'read').mockImplementationOnce(async (...args) => { entered.release(); await gate.promise; return read(...args); });
    pending = h.click(); const rejected = expect(pending).rejects.toThrow(); await entered.promise;
    await h.change('a.md', h.text + '\nA revised condition remains readable.'); await h.runRefresh(); await h.search();
    expect(h.get('tb-notice').hidden).toBe(true); gate.release(); await rejected; await Promise.resolve();
    expect.soft(h.get('tb-notice').hidden).toBe(true); expect(h.openFile).not.toHaveBeenCalled();
    await h.click(); expect(h.openFile).toHaveBeenCalledOnce(); await h.protectedFiles();
  } finally { gate.release(); await pending?.catch(() => {}); await h.cleanup(); }
});

it('a deliberate old-card click after search cancellation can still explain unavailable evidence', async () => {
  const h = await fixture();
  try {
    const read = h.sources.read.bind(h.sources);
    vi.spyOn(h.sources, 'read').mockImplementationOnce(async (...args) => { h.controller.cancel(); return read(...args); });
    await expect(h.search()).rejects.toMatchObject({ name: 'AbortError' }); await Promise.resolve();
    expect(h.controller.status().phase).toBe('cancelled'); expect(h.get('tb-notice').textContent).toContain(h.t.cancelled);
    await h.change('a.md', h.text + '\nChanged after cancelled search.');
    await expect(h.click()).rejects.toThrow(); await Promise.resolve();
    expect(h.get('tb-notice').textContent).toBe(recoveryCopy('en')); expect(h.openFile).not.toHaveBeenCalled();
    expect(await h.stateBytes()).toEqual(h.initialBytes); await h.protectedFiles();
  } finally { await h.cleanup(); }
});
