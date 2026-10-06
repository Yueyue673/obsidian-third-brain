// SPDX-License-Identifier: MIT
// Actual registered ActivationView / Main / renderer / filesystem pipeline.
// DOM focus and Obsidian lifecycle shells are synthetic, not native input evidence.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FileSystemAdapter, MarkdownView } from 'obsidian';
import { afterEach, expect, it, vi } from 'vitest';
import ThirdBrainPlugin from '../src/main';
import { hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { messages } from '../src/i18n';
import { defaults } from '../src/settings';

vi.mock('obsidian', () => ({
  Plugin: class { constructor(readonly app: unknown) {} },
  ItemView: class {
    contentEl: HTMLElement; containerEl: HTMLElement;
    constructor(readonly leaf: { containerEl: HTMLElement }) {
      this.containerEl = leaf.containerEl; this.contentEl = document.createElement('main');
      this.containerEl.append(this.contentEl);
    }
  },
  FileSystemAdapter: class {}, MarkdownView: class {}, PluginSettingTab: class {},
  Notice: class { constructor() { throw new Error('Unexpected host notice in focus fixture'); } },
}));
class NodeStub {
  id = ''; className = ''; textContent = ''; value = ''; hidden = false; disabled = false;
  children: NodeStub[] = []; parent: NodeStub | null = null;
  handlers = new Map<string, Set<(event: unknown) => void>>();
  focusCalls = 0; selectionStart = 0; selectionEnd = 0;
  constructor(readonly tag: string, readonly ownerDocument: DocumentStub) {}
  append(...nodes: NodeStub[]) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes: NodeStub[]) { for (const node of this.children) node.parent = null; this.children = []; this.append(...nodes); }
  setAttribute() {}
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); this.parent = null; }
  focus() {
    if (this.ownerDocument.activeElement !== this) this.ownerDocument.activeElement.fire('blur');
    this.focusCalls++; this.ownerDocument.activeElement = this;
  }
  get isConnected(): boolean { return this === this.ownerDocument.body || this.parent?.isConnected === true; }
  get childElementCount() { return this.children.length; }
  addEventListener(event: string, handler: (event: unknown) => void) { const handlers = this.handlers.get(event) ?? new Set(); handlers.add(handler); this.handlers.set(event, handlers); }
  removeEventListener(event: string, handler: (event: unknown) => void) { this.handlers.get(event)?.delete(handler); }
  fire(event: string, payload: unknown = {}) { for (const handler of [...this.handlers.get(event) ?? []]) handler(payload); }
  all(): NodeStub[] { return [this, ...this.children.flatMap(node => node.all())]; }
  querySelector(selector: string) { return this.all().find(node => node.className.split(' ').includes(selector.slice(1))) ?? null; }
}
class DocumentStub {
  body = new NodeStub('body', this); activeElement: NodeStub = this.body; focused = true;
  createElement(tag: string) { return new NodeStub(tag, this); }
  hasFocus() { return this.focused; }
}
interface ViewShell {
  containerEl: NodeStub; contentEl: NodeStub;
  onOpen(): Promise<void>; onClose(): Promise<void>; redraw(): void;
}
interface LeafShell { view: ViewShell; containerEl: NodeStub; setViewState(state: { type: string; active: boolean }): Promise<void> }
function latch() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function fixture(locale: 'en' | 'zh' = 'en') {
  const scope = path.resolve('.local/panel-open-focus/cases'); await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'case-'));
  const originals = {
    'alpha.md': '# Synthetic observation\nFocusNeedle preserves the exact original observation and its limits.',
    'draft.md': '# Synthetic draft\nA different starting point for an unfinished idea.',
  };
  for (const [name, text] of Object.entries(originals)) await fs.writeFile(path.join(root, name), text);
  const doc = new DocumentStub(), editor = doc.createElement('textarea'); doc.body.append(editor); editor.focus();
  vi.stubGlobal('document', doc); vi.stubGlobal('activeDocument', doc);
  vi.stubGlobal('window', { setInterval: () => 1 });
  const leaves: LeafShell[] = [], commands = new Map<string, () => void>(), deferred = new Set<LeafShell>();
  let factory!: (leaf: LeafShell) => ViewShell, ribbon!: () => void;
  const draftView = Object.assign(Object.create(MarkdownView.prototype), {
    file: { path: 'draft.md' }, editor: { getValue: () => '---\nprivacy: private\n---\nFocusNeedle', getSelection: () => 'FocusNeedle' },
  });
  const openedView = Object.assign(Object.create(MarkdownView.prototype), {
    file: { path: 'alpha.md' }, getMode: () => 'source',
    editor: { getValue: () => originals['alpha.md'], setSelection: vi.fn(), scrollIntoView: vi.fn() },
  });
  const openFile = vi.fn(async () => {}), vault = {
    adapter: Object.assign(Object.create(FileSystemAdapter.prototype), { getBasePath: () => root }),
    getFiles: () => Object.keys(originals).map(name => ({ path: name })),
    getFileByPath: (name: string) => ({ path: name, extension: 'md' }),
  };
  const makeLeaf = () => {
    const containerEl = doc.createElement('aside'); doc.body.append(containerEl);
    const leaf = { containerEl } as LeafShell;
    leaf.setViewState = async state => { expect(state).toEqual({ type: 'third-brain-activation', active: true }); leaf.view = factory(leaf); leaves.push(leaf); await leaf.view.onOpen(); };
    return leaf;
  };
  const workspace = {
    containerEl: doc.body,
    getLeavesOfType: (type: string) => type === 'markdown' ? [{ view: draftView }] : leaves,
    getRightLeaf: vi.fn((_split: boolean) => makeLeaf()),
    // Public contract: reveal completes after the view is loaded. There is no
    // host promise to select an arbitrary textarea owned by a custom plugin.
    revealLeaf: vi.fn(async (leaf: LeafShell) => {
      if (deferred.delete(leaf)) { leaf.view = factory(leaf); await leaf.view.onOpen(); }
    }),
    onLayoutReady: () => {}, getActiveFile: () => ({ path: 'draft.md', extension: 'md' }),
    getLeaf: () => ({ openFile, view: openedView }),
  };
  const plugin = new ThirdBrainPlugin({ vault, workspace } as never, {} as never);
  Object.assign(plugin, {
    loadData: async () => ({ ...defaults, excludes: [], outputFolder: 'Derived', locale }), saveData: async () => {},
    registerView: (_type: string, cb: typeof factory) => { factory = cb; }, addRibbonIcon: (_icon: string, _name: string, cb: () => void) => { ribbon = cb; },
    addCommand: (command: { id: string; callback: () => void }) => commands.set(command.id, command.callback),
    addSettingTab: () => {}, registerInterval: () => {},
  });
  await plugin.onload(); await plugin.controller.refresh();
  const store = (plugin as unknown as { store: OwnedStore }).store, loaded = await store.load();
  const stateBytes = await fs.readFile(path.join(root, 'Derived/.third-brain/state.json'));
  const calls: Promise<void>[] = [], searches: ReturnType<typeof plugin.controller.find>[] = [], contexts: ReturnType<NonNullable<ReturnType<typeof plugin.panelPort>['current']>>[] = [], opens: Promise<void>[] = [];
  const panelPort = plugin.panelPort.bind(plugin);
  vi.spyOn(plugin, 'panelPort').mockImplementation(() => {
    const port = panelPort(), find = port.find, current = port.current!, open = port.open;
    port.find = (...args) => { const op = find(...args); searches.push(op); return op; };
    port.current = () => { const op = current(); contexts.push(op); return op; };
    port.open = evidence => { const op = open(evidence); opens.push(op); return op; }; return port;
  });
  const actualOpen = plugin.openPanel.bind(plugin);
  vi.spyOn(plugin, 'openPanel').mockImplementation(() => { const op = actualOpen(); calls.push(op); return op; });
  const enter = (entry: 'command' | 'ribbon' = 'command') => { if (entry === 'command') commands.get('open-activation')!(); else ribbon(); return calls.at(-1)!; };
  const restore = async () => { const leaf = makeLeaf(); await leaf.setViewState({ type: 'third-brain-activation', active: true }); return leaf; };
  const restoreDeferred = () => {
    const leaf = makeLeaf();
    leaf.view = { containerEl: leaf.containerEl, contentEl: leaf.containerEl, onOpen: async () => {}, onClose: async () => {}, redraw: () => {} };
    leaves.push(leaf); deferred.add(leaf); return leaf;
  };
  const get = (cls: string) => leaves[0].view.contentEl.querySelector(`.${cls}`)!;
  const button = (text: string) => leaves[0].view.contentEl.all().find(node => node.tag === 'button' && node.textContent === text)!;
  const unchanged = async () => {
    for (const [name, text] of Object.entries(originals)) expect(hash(await fs.readFile(path.join(root, name)))).toBe(hash(text));
    expect(await fs.readFile(path.join(root, 'Derived/.third-brain/state.json'))).toEqual(stateBytes);
    expect(await store.load()).toEqual(loaded);
  };
  const cleanup = async () => { plugin.controller.cancel(); await Promise.allSettled([...calls, ...searches, ...contexts, ...opens]); await nextTurn(); for (const leaf of leaves) await leaf.view.onClose(); plugin.onunload(); };
  return { plugin, root, doc, editor, leaves, workspace, enter, restore, restoreDeferred, get, button, searches, contexts, opens, openFile, openedView, unchanged, cleanup, t: messages(locale) };
}

for (const entry of ['command', 'ribbon'] as const) for (const existing of [false, true])
it.each(['en', 'zh'] as const)(`${entry} focuses the ${existing ? 'existing' : 'new'} idea input without searching in %s`, async locale => {
  const h = await fixture(locale);
  try {
    if (existing) await h.restore();
    expect(h.doc.activeElement).toBe(h.editor);
    await h.enter(entry);
    expect(h.workspace.revealLeaf).toHaveBeenCalledOnce();
    const input = h.get('tb-idea');
    expect(h.doc.activeElement === input).toBe(true);
    expect(input.focusCalls).toBe(1); expect(h.leaves).toHaveLength(1);
    expect(h.searches).toHaveLength(0); expect(h.contexts).toHaveLength(0);
    // Existing fill action still carries FULL draft privacy; reopening must not
    // erase it, the selection, or the already-visible evidence/results.
    h.button(h.t.current).fire('click'); await h.contexts.at(-1); await nextTurn();
    expect(input.value).toBe('FocusNeedle'); expect(h.get('tb-privacy').hidden).toBe(false);
    const key = { key: 'Enter', ctrlKey: locale === 'en', metaKey: locale === 'zh', repeat: false, isComposing: false, preventDefault: vi.fn() };
    input.fire('keydown', key); const results = await h.searches.at(-1)!; await nextTurn();
    expect(results).toHaveLength(1); expect(h.get('tb-result')).toBeDefined();
    const summary = h.get('tb-result-summary').textContent;
    input.selectionStart = 2; input.selectionEnd = 5;
    h.editor.focus(); await h.enter(entry);
    expect(h.doc.activeElement === input).toBe(true); expect(input.value).toBe('FocusNeedle');
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]);
    expect(h.get('tb-privacy').hidden).toBe(false); expect(h.get('tb-result-summary').textContent).toBe(summary);
    expect(h.searches).toHaveLength(1); expect(h.contexts).toHaveLength(1);
    h.get('tb-source').fire('click'); await h.opens.at(-1); await nextTurn();
    expect(h.openFile).toHaveBeenCalledOnce(); expect(h.openedView.editor.setSelection).toHaveBeenCalledOnce();
    const e = results[0].fragment.evidence[0], source = await h.plugin.controller.snapshot(e.relativePath);
    expect(source!.hash).toBe(e.sourceHash); expect(source!.text.slice(e.start, e.end)).toBe(e.quote);
    await h.unchanged();
  } finally { await h.cleanup(); }
});

it('restoring, redrawing and controller refresh never focus the idea automatically', async () => {
  const h = await fixture();
  try {
    const leaf = await h.restore(); expect(h.get('tb-idea').focusCalls).toBe(0);
    leaf.view.redraw(); await h.plugin.controller.refresh();
    expect(h.get('tb-idea').focusCalls).toBe(0); expect(h.doc.activeElement).toBe(h.editor);
    expect(h.workspace.revealLeaf).not.toHaveBeenCalled(); expect(h.searches).toHaveLength(0);
    await h.unchanged();
  } finally { await h.cleanup(); }
});

it.each(['input', 'compositionstart', 'focus-elsewhere', 'window-blur', 'close', 'redraw', 'unload'] as const)('a delayed reveal cannot reclaim focus after %s', async intent => {
  const h = await fixture(), gate = latch(), entered = latch();
  try {
    const leaf = await h.restore(), oldInput = h.get('tb-idea');
    h.workspace.revealLeaf.mockImplementationOnce(async () => { entered.release(); await gate.promise; });
    const opening = h.enter(); await entered.promise;
    if (intent === 'input' || intent === 'compositionstart') h.editor.fire(intent);
    if (intent === 'focus-elsewhere') { const other = h.doc.createElement('textarea'); h.doc.body.append(other); other.focus(); }
    if (intent === 'window-blur') h.doc.focused = false;
    if (intent === 'close') { await leaf.view.onClose(); h.leaves.splice(0); }
    if (intent === 'redraw') leaf.view.redraw();
    if (intent === 'unload') h.plugin.onunload();
    const expected = h.doc.activeElement;
    gate.release(); await opening;
    expect(oldInput.focusCalls).toBe(0); expect(h.doc.activeElement === expected).toBe(true);
    if (intent === 'redraw') expect(h.get('tb-idea').focusCalls).toBe(0);
    expect(h.searches).toHaveLength(0); expect(h.contexts).toHaveLength(0);
    for (const handlers of h.editor.handlers.values()) expect(handlers.size).toBe(0);
  } finally { gate.release(); await h.cleanup(); }
});

it('a newer explicit opening retires an older delayed focus request', async () => {
  const h = await fixture(), gate = latch(), entered = latch();
  try {
    await h.restore();
    h.workspace.revealLeaf.mockImplementationOnce(async () => { entered.release(); await gate.promise; });
    const older = h.enter(); await entered.promise;
    expect(h.get('tb-idea').focusCalls).toBe(0);
    await h.enter('ribbon'); const input = h.get('tb-idea');
    expect(h.doc.activeElement === input).toBe(true); expect(input.focusCalls).toBe(1);
    h.editor.focus(); gate.release(); await older;
    expect(h.doc.activeElement).toBe(h.editor); expect(input.focusCalls).toBe(1);
    await h.unchanged();
  } finally { gate.release(); await h.cleanup(); }
});

it('waits for the host to replace a deferred view before focusing the actual registered input', async () => {
  const h = await fixture(), gate = latch(), entered = latch();
  try {
    const leaf = h.restoreDeferred(), placeholder = leaf.view;
    const reveal = h.workspace.revealLeaf.getMockImplementation()!;
    h.workspace.revealLeaf.mockImplementationOnce(async target => { entered.release(); await gate.promise; await reveal(target); });
    const opening = h.enter(); await entered.promise;
    expect(leaf.view).toBe(placeholder); expect(h.doc.activeElement).toBe(h.editor);
    gate.release(); await opening;
    expect(leaf.view).not.toBe(placeholder); expect(h.doc.activeElement === h.get('tb-idea')).toBe(true);
    expect(h.get('tb-idea').focusCalls).toBe(1); expect(h.searches).toHaveLength(0); await h.unchanged();
  } finally { gate.release(); await h.cleanup(); }
});

it.each(['container', 'content'] as const)('can focus after the host focuses the view %s itself', async target => {
  const h = await fixture();
  try {
    await h.restore();
    h.workspace.revealLeaf.mockImplementationOnce(async leaf => { (target === 'container' ? leaf.view.containerEl : leaf.view.contentEl).focus(); });
    await h.enter(); expect(h.doc.activeElement === h.get('tb-idea')).toBe(true); await h.unchanged();
  } finally { await h.cleanup(); }
});

it('does not redirect focus across documents after a delayed reveal', async () => {
  const h = await fixture(), gate = latch(), entered = latch();
  try {
    await h.restore(); h.workspace.revealLeaf.mockImplementationOnce(async () => { entered.release(); await gate.promise; });
    const opening = h.enter(); await entered.promise;
    vi.stubGlobal('activeDocument', new DocumentStub()); gate.release(); await opening;
    expect(h.doc.activeElement).toBe(h.editor); expect(h.get('tb-idea').focusCalls).toBe(0);
    for (const handlers of h.editor.handlers.values()) expect(handlers.size).toBe(0);
  } finally { gate.release(); await h.cleanup(); }
});

it('releases transient listeners on a failed reveal and allows a fresh explicit retry', async () => {
  const h = await fixture();
  try {
    await h.restore(); const error = new Error('SYNTHETIC_HOST_REVEAL_FAILURE');
    h.workspace.revealLeaf.mockRejectedValueOnce(error);
    await expect(h.plugin.openPanel()).rejects.toBe(error);
    expect(h.get('tb-idea').focusCalls).toBe(0);
    for (const handlers of h.editor.handlers.values()) expect(handlers.size).toBe(0);
    await h.enter(); expect(h.doc.activeElement === h.get('tb-idea')).toBe(true); await h.unchanged();
  } finally { await h.cleanup(); }
});

// Delay a real Main.current -> Controller.snapshot -> FileSources read result.
// This is a synthetic scheduling latch, not an actual slow disk or native click.
async function delayedCurrent(h: Awaited<ReturnType<typeof fixture>>) {
  const entered = latch(), gate = latch(), snapshot = h.plugin.controller.snapshot.bind(h.plugin.controller);
  vi.spyOn(h.plugin.controller, 'snapshot').mockImplementationOnce(async name => {
    const source = await snapshot(name); entered.release(); await gate.promise; return source;
  });
  h.button(h.t.current).fire('click'); const operation = h.contexts.at(-1)!; await entered.promise;
  expect(h.get('tb-status').textContent).toContain(h.t.contextReading);
  return { release: gate.release, settle: async () => { gate.release(); await operation; await nextTurn(); } };
}

it.each(['editor', 'other-control', 'away-and-back', 'window-blur', 'input', 'compositionstart'] as const)('late current-note fill does not reclaim focus after %s', async intent => {
  const h = await fixture(intent === 'editor' ? 'zh' : 'en');
  let pending: Awaited<ReturnType<typeof delayedCurrent>> | undefined;
  try {
    await h.restore(); const input = h.get('tb-idea'), current = h.button(h.t.current);
    // Some hosts retain the editor's focus on a pointer activation. Continuing
    // to compose in that same element must also revoke the delayed focus request.
    if (intent !== 'input' && intent !== 'compositionstart') current.focus();
    pending = await delayedCurrent(h);
    if (intent === 'editor' || intent === 'away-and-back') h.editor.focus();
    if (intent === 'other-control') h.get('tb-select').focus();
    if (intent === 'away-and-back') current.focus();
    if (intent === 'window-blur') h.doc.focused = false;
    if (intent === 'input' || intent === 'compositionstart') h.editor.fire(intent);
    const expected = h.doc.activeElement;
    await pending.settle();
    expect.soft(input.focusCalls).toBe(0); expect.soft(h.doc.activeElement === expected).toBe(true);
    // Focus ownership is separate from the still-requested, read-only fill.
    expect(input.value).toBe('FocusNeedle'); expect(h.get('tb-privacy').hidden).toBe(false);
    expect(h.get('tb-status').textContent).not.toContain(h.t.contextReading);
    expect(h.button(h.t.cancel).hidden).toBe(true); expect(h.searches).toHaveLength(0);
    for (const name of ['blur', 'input', 'compositionstart']) expect(h.editor.handlers.get(name)?.size ?? 0).toBe(0);
    h.doc.focused = true; input.focus();
    h.button(h.t.find).fire('click'); const items = await h.searches.at(-1)!; await nextTurn();
    expect(items).toHaveLength(1);
    const e = items[0].fragment.evidence[0], source = await h.plugin.controller.snapshot(e.relativePath);
    expect(source!.hash).toBe(e.sourceHash); expect(source!.text.slice(e.start, e.end)).toBe(e.quote);
    h.get('tb-source').fire('click'); await h.opens.at(-1); await nextTurn();
    expect(h.openFile).toHaveBeenCalledOnce(); expect(h.openedView.editor.setSelection).toHaveBeenCalledOnce();
    await h.unchanged();
  } finally { pending?.release(); await h.cleanup(); }
});

it.each(['button', 'retained-editor', 'idea'] as const)('current-note fill keeps deliberate focus handoff from %s without auto-search', async origin => {
  const h = await fixture('zh'); let pending: Awaited<ReturnType<typeof delayedCurrent>> | undefined;
  try {
    await h.restore(); const input = h.get('tb-idea');
    if (origin === 'button') h.button(h.t.current).focus();
    if (origin === 'idea') input.focus();
    const before = input.focusCalls; pending = await delayedCurrent(h); await pending.settle();
    expect(h.doc.activeElement === input).toBe(true);
    expect(input.focusCalls).toBe(before + (origin === 'idea' ? 0 : 1));
    expect(input.value).toBe('FocusNeedle'); expect(h.get('tb-privacy').hidden).toBe(false);
    expect(h.searches).toHaveLength(0); await h.unchanged();
  } finally { pending?.release(); await h.cleanup(); }
});

it.each(['cancel', 'edit', 'close', 'redraw', 'search'] as const)('retiring a current-note read via %s also releases its transient focus guard', async intent => {
  const h = await fixture(); let pending: Awaited<ReturnType<typeof delayedCurrent>> | undefined;
  try {
    await h.restore(); const input = h.get('tb-idea'), current = h.button(h.t.current);
    input.value = 'FocusNeedle'; input.fire('input'); current.focus(); pending = await delayedCurrent(h);
    if (intent === 'cancel') h.button(h.t.cancel).fire('click');
    if (intent === 'edit') { input.value = 'New unsent idea'; input.fire('input'); }
    if (intent === 'close') await h.leaves[0].view.onClose();
    if (intent === 'redraw') h.leaves[0].view.redraw();
    if (intent === 'search') { h.button(h.t.find).fire('click'); await h.searches.at(-1); await nextTurn(); }
    // Do not wait for the possibly slow OS read to release the element listeners.
    for (const name of ['blur', 'input', 'compositionstart']) expect(current.handlers.get(name)?.size ?? 0).toBe(0);
    h.editor.focus(); await pending.settle();
    expect(input.focusCalls).toBe(0); expect(h.doc.activeElement).toBe(h.editor);
    expect(input.value).toBe(intent === 'edit' ? 'New unsent idea' : 'FocusNeedle');
    if (intent !== 'close') expect(h.get('tb-privacy').hidden).toBe(true);
    expect(h.searches).toHaveLength(intent === 'search' ? 1 : 0); await h.unchanged();
  } finally { pending?.release(); await h.cleanup(); }
});

it('an older current-note completion cannot release the newer request focus guard', async () => {
  const h = await fixture(); let first: Awaited<ReturnType<typeof delayedCurrent>> | undefined, second: typeof first;
  try {
    await h.restore(); const input = h.get('tb-idea'), current = h.button(h.t.current); current.focus();
    first = await delayedCurrent(h); second = await delayedCurrent(h);
    await first.settle();
    expect(input.value).toBe(''); expect(input.focusCalls).toBe(0);
    for (const name of ['blur', 'input', 'compositionstart']) expect(current.handlers.get(name)?.size).toBe(1);
    h.editor.focus(); await second.settle();
    expect(input.value).toBe('FocusNeedle'); expect(h.get('tb-privacy').hidden).toBe(false);
    expect(h.doc.activeElement).toBe(h.editor); expect(input.focusCalls).toBe(0);
    for (const name of ['blur', 'input', 'compositionstart']) expect(current.handlers.get(name)?.size).toBe(0);
    expect(h.searches).toHaveLength(0); await h.unchanged();
  } finally { first?.release(); second?.release(); await h.cleanup(); }
});

it('a failed current-note read releases its focus guard and a fresh explicit retry still works', async () => {
  const h = await fixture();
  try {
    await h.restore(); const input = h.get('tb-idea'), current = h.button(h.t.current); current.focus();
    const fault = new Error('SYNTHETIC_CONTEXT_FAILURE');
    vi.spyOn(h.plugin.controller, 'snapshot').mockRejectedValueOnce(fault);
    current.fire('click'); await expect(h.contexts.at(-1)).rejects.toBe(fault); await nextTurn();
    expect(input.value).toBe(''); expect(input.focusCalls).toBe(0);
    expect(h.get('tb-notice').textContent).toBe(h.t.contextUnavailable);
    for (const name of ['blur', 'input', 'compositionstart']) expect(current.handlers.get(name)?.size).toBe(0);
    current.fire('click'); await h.contexts.at(-1); await nextTurn();
    expect(input.value).toBe('FocusNeedle'); expect(h.doc.activeElement === input).toBe(true);
    expect(h.get('tb-privacy').hidden).toBe(false); expect(h.get('tb-notice').hidden).toBe(true);
    expect(h.searches).toHaveLength(0); await h.unchanged();
  } finally { await h.cleanup(); }
});

it('does not refocus an already composing idea or select its text', async () => {
  const h = await fixture();
  try {
    await h.restore(); const input = h.get('tb-idea'); input.focus();
    input.value = 'Unfinished synthetic idea'; input.selectionStart = 4; input.selectionEnd = 4;
    input.fire('compositionstart'); await h.enter();
    expect(input.focusCalls).toBe(1); expect(input.value).toBe('Unfinished synthetic idea');
    expect([input.selectionStart, input.selectionEnd]).toEqual([4, 4]); expect(h.searches).toHaveLength(0);
    await h.unchanged();
  } finally { await h.cleanup(); }
});
