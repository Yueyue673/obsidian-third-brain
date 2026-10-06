// SPDX-License-Identifier: MIT
// Synthetic filesystem notes, production renderer/Main/Controller/FileSources/
// OwnedStore; Obsidian and DOM shells do not establish native host navigation.
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
import type { Evidence, SearchResult } from '../src/core/types';

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
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const normalize = (text: string) => text.replace(/\r\n?/g, '\n');
function position(text: string) { const lines = normalize(text).split('\n'); return { line: lines.length - 1, ch: lines.at(-1)!.length }; }
async function fixture(locale: 'en' | 'zh' = 'en', newline = '\n', canvas = false, donor = false) {
  const scope = path.resolve('.local/source-open-location/cases'); await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'case-'));
  const quote = '🧭 PreciseNeedle preserves the late observation.\n第二行保留语境与限制。🧭';
  const text = ['---', 'topics: [synthetic]', '---', '# Earlier context',
    ...Array.from({ length: 100 }, (_, i) => `Unrelated introductory observation ${i}.`), '', '# Later evidence', quote, '', '# Repeated evidence', quote].join('\n').replace(/\n/g, newline);
  const name = canvas ? 'original.canvas' : 'original.md';
  const raw = canvas ? JSON.stringify({ nodes: [{ id: 'synthetic-node', type: 'text', text: quote, x: 0, y: 0, width: 300, height: 200 }], edges: [] }) : text;
  const originals = new Map([[name, raw], ['Derived/handwritten.txt', 'Synthetic unowned file; never replace.']]);
  if (donor) originals.set('second.md', quote);
  for (const [file, body] of originals) { await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.writeFile(path.join(root, file), body); }
  const settings = { ...defaults, excludes: [] as string[], outputFolder: 'Derived' }, store = new OwnedStore(root, 'Derived');
  const sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const factory = vi.fn(() => undefined), controller = new ThirdBrainController(sources, store, () => settings, factory, async () => {});
  await controller.initialize(); await controller.refresh(); await controller.initialize(); // Strict disk reload, not an in-memory-only index.
  const stateBytes = await fs.readFile(path.join(root, 'Derived/.third-brain/state.json'));
  let draft = normalize(text), mode = 'preview';
  const editor = {
    getValue: vi.fn(() => draft), setSelection: vi.fn(), scrollIntoView: vi.fn(), focus: vi.fn(),
    setValue: vi.fn(() => { throw new Error('Unexpected original write'); }), replaceRange: vi.fn(() => { throw new Error('Unexpected original write'); }),
  };
  const file = { path: name, extension: canvas ? 'canvas' : 'md' };
  const view = Object.assign(Object.create(MarkdownView.prototype), { file, editor, getMode: () => mode });
  const openFile = vi.fn(async (_file: typeof file, options?: { state?: { mode?: string } }) => { if (options?.state?.mode) mode = options.state.mode; });
  const leaf = { view, openFile };
  const app = { vault: { getFileByPath: (p: string) => ({ path: p, extension: p.endsWith('.md') ? 'md' : 'canvas' }) }, workspace: { getLeaf: () => leaf } };
  const port = ThirdBrainPlugin.prototype.panelPort.call({ controller, store, app } as unknown as ThirdBrainPlugin);
  const queries: Promise<SearchResult[]>[] = [], opens: Promise<void>[] = [];
  const find = port.find.bind(port), open = port.open.bind(port);
  vi.spyOn(port, 'find').mockImplementation((...args) => { const operation = find(...args); queries.push(operation); return operation; });
  vi.spyOn(port, 'open').mockImplementation(e => { const operation = open(e); opens.push(operation); return operation; });
  vi.stubGlobal('document', { createElement: (tag: string) => new NodeStub(tag) });
  const container = new NodeStub('main'), t = messages(locale), dispose = mountPanel(container as unknown as HTMLElement, port, locale);
  const get = (cls: string) => container.all().find(n => n.className === cls)!;
  get('tb-idea').value = 'PreciseNeedle'; get('tb-idea').fire('input');
  container.all().find(n => n.tag === 'button' && n.textContent === t.find)!.fire('click');
  const items = await queries.at(-1)!; await Promise.resolve();
  expect(items).toHaveLength(1);
  const buttons = container.all().filter(n => n.className === 'tb-source');
  const click = (i = 0) => { buttons[i].fire('click'); return opens.at(-1)!; };
  const unchanged = async () => {
    for (const [file, bytes] of originals) expect(hash(await fs.readFile(path.join(root, file)))).toBe(hash(bytes));
    expect(await fs.readFile(path.join(root, 'Derived/.third-brain/state.json'))).toEqual(stateBytes);
    expect(editor.setValue).not.toHaveBeenCalled(); expect(editor.replaceRange).not.toHaveBeenCalled();
    expect(factory.mock.results.every(x => x.type === 'return' && x.value === undefined)).toBe(true);
  };
  const cleanup = async () => { await Promise.allSettled([...queries, ...opens]); dispose(); controller.dispose(); };
  return { root, text, raw, name, quote, controller, sources, settings, store, items, buttons, editor, leaf, view, openFile, click, get, t, port, unchanged, cleanup, setDraft: (value: string) => { draft = value; } };
}

for (const newline of ['\n', '\r\n']) it.each(['en', 'zh'] as const)(`opens the precise later quotation and repeated occurrence (${JSON.stringify(newline)}) in %s`, async locale => {
  const h = await fixture(locale, newline);
  try {
    const evidence = h.items[0].fragment.evidence;
    expect(evidence).toHaveLength(2); expect(h.buttons).toHaveLength(2);
    for (const [i, e] of evidence.entries()) {
      expect(h.text.slice(e.start, e.end)).toBe(e.quote); expect(position(h.text.slice(0, e.start)).line).toBeGreaterThan(100);
      await h.click(i);
      const from = position(h.text.slice(0, e.start)), to = position(h.text.slice(0, e.end));
      expect.soft(h.openFile.mock.calls.at(-1)).toEqual([{ path: h.name, extension: 'md' }, { state: { mode: 'source' } }]);
      expect.soft(h.editor.setSelection).toHaveBeenLastCalledWith(from, to);
      expect.soft(h.editor.scrollIntoView).toHaveBeenLastCalledWith({ from, to }, true);
    }
    expect(h.editor.setSelection.mock.calls[0]).not.toEqual(h.editor.setSelection.mock.calls[1]);
    await h.controller.refresh(); await h.unchanged();
  } finally { await h.cleanup(); }
});

it('Canvas opens only its verified file; decoded offsets are not Markdown editor positions', async () => {
  const h = await fixture('en', '\n', true);
  try {
    expect(h.items[0].fragment.evidence[0]).toMatchObject({ start: -1, end: -1 });
    await h.click(); expect(h.openFile).toHaveBeenCalledWith({ path: h.name, extension: 'canvas' });
    expect(h.editor.setSelection).not.toHaveBeenCalled(); expect(h.editor.scrollIntoView).not.toHaveBeenCalled(); await h.unchanged();
  } finally { await h.cleanup(); }
});

for (const mismatch of ['unsaved-draft', 'different-view', 'preview-only'] as const) it.each(['en', 'zh'] as const)(`${mismatch} does not point at unrelated text, and explains file-only opening in %s`, async locale => {
  const h = await fixture(locale);
  try {
    if (mismatch === 'unsaved-draft') h.setDraft('Unsaved synthetic context.\n' + normalize(h.text));
    if (mismatch === 'different-view') h.openFile.mockImplementationOnce(async () => { h.view.file = { path: 'another.md', extension: 'md' }; });
    if (mismatch === 'preview-only') h.openFile.mockImplementationOnce(async () => {});
    await expect(h.click()).rejects.toThrow(); await Promise.resolve();
    expect(h.openFile).toHaveBeenCalledOnce(); expect(h.editor.setSelection).not.toHaveBeenCalled(); expect(h.editor.scrollIntoView).not.toHaveBeenCalled();
    expect(h.get('tb-notice').textContent).toBe(locale === 'en'
      ? 'The source opened, but its quotation could not be located in the current editor. Check unsaved changes and compare the quotation manually.'
      : '已打开来源，但无法在当前编辑器中定位引文。请检查未保存的改动，并对照引文核验。');
    expect(h.get('tb-notice').hidden).toBe(false); await h.unchanged();
    // Repair the synthetic view/draft, not the original, then retry the same card.
    h.view.file = { path: h.name, extension: 'md' }; h.setDraft(normalize(h.text));
    await h.click(); await Promise.resolve();
    expect(h.editor.setSelection).toHaveBeenCalledOnce(); expect(h.get('tb-notice').hidden).toBe(true);
    await h.unchanged();
  } finally { await h.cleanup(); }
});

it.each(['changed-donor', 'excluded', 'read-failure'] as const)('%s still rejects before opening any file', async fault => {
  const h = await fixture('en', '\n', true, true);
  try {
    expect(h.items[0].fragment.evidence).toHaveLength(2); await h.unchanged();
    if (fault === 'changed-donor') await fs.writeFile(path.join(h.root, 'second.md'), 'Intentional synthetic donor mutation.');
    if (fault === 'excluded') h.settings.excludes.push('second.md');
    if (fault === 'read-failure') vi.spyOn(h.sources, 'read').mockRejectedValueOnce(Object.assign(new Error('SYNTHETIC_EIO_NOT_FOR_DISPLAY'), { code: 'EIO' }));
    const canvasIndex = h.items[0].fragment.evidence.findIndex(e => e.relativePath.endsWith('.canvas'));
    await expect(h.click(canvasIndex)).rejects.toThrow(); await Promise.resolve();
    expect(h.openFile).not.toHaveBeenCalled(); expect(h.editor.setSelection).not.toHaveBeenCalled();
    expect(h.get('tb-notice').textContent).toBe(fault === 'read-failure' ? h.t.failure : h.t.sourceEvidenceUnavailable);
  } finally { await h.cleanup(); }
});

it('a forged or stale Markdown evidence span is never searched by quote text to recover a position', async () => {
  const h = await fixture();
  try {
    const e: Evidence = { ...h.items[0].fragment.evidence[0], start: 0, end: 3 };
    await expect(h.port.open(e)).rejects.toThrow(); expect(h.openFile).not.toHaveBeenCalled();
    expect(h.editor.setSelection).not.toHaveBeenCalled(); await h.unchanged();
  } finally { await h.cleanup(); }
});

it('an external same-named error cannot claim a source was opened', async () => {
  const h = await fixture();
  try {
    const failure = Object.assign(new Error('SYNTHETIC_EXTERNAL_DETAIL'), { name: 'SourceLocationUnavailableError' });
    vi.spyOn(h.sources, 'read').mockRejectedValueOnce(failure);
    await expect(h.click()).rejects.toBe(failure); await Promise.resolve();
    expect(h.openFile).not.toHaveBeenCalled(); expect(h.get('tb-notice').textContent).toBe(h.t.failure);
    await h.unchanged();
  } finally { await h.cleanup(); }
});

it('a source changed between open verification and the navigation snapshot is rejected', async () => {
  const h = await fixture();
  try {
    const snapshot = h.controller.snapshot.bind(h.controller);
    vi.spyOn(h.controller, 'snapshot').mockImplementationOnce(async name => {
      // Intentional synthetic race; retaining the quotation is not enough.
      await fs.writeFile(path.join(h.root, name), h.text + '\nChanged context.');
      return snapshot(name);
    });
    await expect(h.click()).rejects.toThrow(); expect(h.openFile).not.toHaveBeenCalled();
    expect(h.editor.setSelection).not.toHaveBeenCalled();
  } finally { await h.cleanup(); }
});
