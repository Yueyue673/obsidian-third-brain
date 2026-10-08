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

const noticeState = vi.hoisted(() => ({ allowed: false, messages: [] as string[] }));
vi.mock('obsidian', () => ({
  Plugin: class { constructor(readonly app: unknown) {} },
  ItemView: class {
    contentEl: HTMLElement; containerEl: HTMLElement;
    constructor(readonly leaf: { containerEl: HTMLElement }) {
      this.containerEl = leaf.containerEl; this.contentEl = document.createElement('main');
      this.containerEl.append(this.contentEl);
    }
  },
  FileSystemAdapter: class {}, MarkdownView: class {},
  PluginSettingTab: class { containerEl = document.createElement('section'); },
  Setting: class {
    row: HTMLElement;
    constructor(container: HTMLElement) { this.row = document.createElement('div'); container.append(this.row); }
    setName(name: string) { this.row.textContent = name; return this; }
    setDesc() { return this; }
    addDropdown(cb: (control: unknown) => void) { return this.control(cb); }
    addText(cb: (control: unknown) => void) { return this.control(cb); }
    addTextArea(cb: (control: unknown) => void) { return this.control(cb); }
    addToggle(cb: (control: unknown) => void) { return this.control(cb, true); }
    addComponent() { return this; } // Secret selector is not used by these tests.
    control(cb: (control: unknown) => void, toggle = false) {
      const inputEl = document.createElement('input'); this.row.append(inputEl);
      const control = {
        inputEl, addOptions() { return this; }, setPlaceholder() { return this; },
        setValue(value: string | boolean) { inputEl.value = String(value); return this; }, getValue() { return inputEl.value; },
        onChange(callback: (value: string | boolean) => void) { inputEl.addEventListener('change', () => callback(toggle ? inputEl.value === 'true' : inputEl.value)); return this; },
      }; cb(control); return this;
    }
  },
  Notice: class { constructor(message: string) { if (!noticeState.allowed) throw new Error('Unexpected host notice in focus fixture'); noticeState.messages.push(message); } },
}));
class NodeStub {
  id = ''; className = ''; textContent = ''; value = ''; hidden = false; disabled = false;
  children: NodeStub[] = []; parent: NodeStub | null = null;
  handlers = new Map<string, Set<(event: unknown) => void>>();
  focusCalls = 0; selectionStart = 0; selectionEnd = 0;
  constructor(readonly tag: string, readonly ownerDocument: DocumentStub) {}
  append(...nodes: NodeStub[]) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes: NodeStub[]) { for (const node of this.children) node.parent = null; this.children = []; this.append(...nodes); }
  empty() { this.replaceChildren(); }
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
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); noticeState.allowed = false; noticeState.messages.length = 0; });

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
  let settingsTab!: { containerEl: NodeStub; display(): void };
  const saved: string[] = [], settingsWrites: Promise<void>[] = [];
  const settingsFile = path.join(root, 'synthetic-plugin-settings.json');
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
    loadData: async () => ({ ...defaults, excludes: [], outputFolder: 'Derived', locale }),
    saveData: async (data: unknown) => { const text = JSON.stringify(data); await fs.writeFile(settingsFile, text); saved.push(text); },
    registerView: (_type: string, cb: typeof factory) => { factory = cb; }, addRibbonIcon: (_icon: string, _name: string, cb: () => void) => { ribbon = cb; },
    addCommand: (command: { id: string; callback: () => void }) => commands.set(command.id, command.callback),
    addSettingTab: (tab: typeof settingsTab) => { settingsTab = tab; }, registerInterval: () => {},
  });
  await plugin.onload(); await plugin.controller.refresh();
  const persist = plugin.persistSettings.bind(plugin);
  vi.spyOn(plugin, 'persistSettings').mockImplementation(() => { const op = persist(); settingsWrites.push(op); return op; });
  const startSetting = (name: string, value: string, event = 'change') => {
    settingsTab.display();
    const row = settingsTab.containerEl.children.find(node => name.split('|').includes(node.textContent));
    expect(row, `Registered setting ${name}`).toBeDefined();
    const before = settingsWrites.length;
    const input = row!.children[0]; input.value = value; input.fire(event);
    expect(settingsWrites.length).toBe(before + 1); return settingsWrites.at(-1)!;
  };
  const changeSetting = async (name: string, value: string, event = 'change') => {
    await startSetting(name, value, event); await nextTurn();
  };
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
  const cleanup = async () => { plugin.controller.cancel(); await Promise.allSettled([...calls, ...searches, ...contexts, ...opens, ...settingsWrites]); await nextTurn(); for (const leaf of leaves) await leaf.view.onClose(); plugin.onunload(); };
  return { plugin, root, settingsFile, doc, editor, leaves, workspace, enter, restore, restoreDeferred, get, button, searches, contexts, opens, openFile, openedView, unchanged, cleanup, startSetting, changeSetting, saved, t: messages(locale) };
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
async function delayedCurrent(h: Awaited<ReturnType<typeof fixture>>, outcome: 'resolve' | 'reject' = 'resolve') {
  const entered = latch(), gate = latch(), snapshot = h.plugin.controller.snapshot.bind(h.plugin.controller);
  const fault = new Error('SYNTHETIC_DELAYED_CONTEXT_FAILURE');
  vi.spyOn(h.plugin.controller, 'snapshot').mockImplementationOnce(async name => {
    const source = await snapshot(name); entered.release(); await gate.promise;
    if (outcome === 'reject') throw fault;
    return source;
  });
  h.button(h.t.current).fire('click'); const operation = h.contexts.at(-1)!; await entered.promise;
  expect(h.get('tb-status').textContent).toContain(h.t.contextReading);
  return { release: gate.release, settle: async () => {
    gate.release();
    if (outcome === 'reject') await expect(operation).rejects.toBe(fault); else await operation;
    await nextTurn();
  } };
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

// Explicit composition lifecycle events, with NO input event before delivery.
// These prove callback handling only, not any native IME's event ordering.
for (const delivery of ['composing', 'ended-without-input', 'rejected'] as const)
it.each(['en', 'zh'] as const)(`idea composition retires a pending current-note ${delivery} response in %s`, async locale => {
  const h = await fixture(locale); let pending: Awaited<ReturnType<typeof delayedCurrent>> | undefined;
  try {
    await h.restore(); const input = h.get('tb-idea'), current = h.button(h.t.current);
    const find = vi.spyOn(h.plugin.controller, 'find');
    input.value = 'Unsent synthetic idea'; input.fire('input'); current.focus();
    pending = await delayedCurrent(h, delivery === 'rejected' ? 'reject' : 'resolve');
    input.focus(); const focusCalls = input.focusCalls;
    input.fire('compositionstart');
    // Merely beginning composition owns the input, even if it is later cancelled
    // and produces neither new text nor an input event.
    if (delivery === 'ended-without-input') input.fire('compositionend');
    expect.soft(h.get('tb-status').textContent).not.toContain(h.t.contextReading);
    expect.soft(h.button(h.t.cancel).hidden).toBe(true);
    await pending.settle();
    expect.soft(input.value).toBe('Unsent synthetic idea');
    expect.soft(h.get('tb-privacy').hidden).toBe(true);
    expect.soft(h.get('tb-notice').hidden).toBe(true);
    expect(input.focusCalls).toBe(focusCalls); expect(h.doc.activeElement === input).toBe(true);
    expect(h.searches).toHaveLength(0);
    for (const name of ['blur', 'input', 'compositionstart']) expect(current.handlers.get(name)?.size ?? 0).toBe(0);
    if (delivery !== 'ended-without-input') input.fire('compositionend');
    input.value = 'FocusNeedle'; input.fire('input');
    expect(h.searches).toHaveLength(0); // Completion/edit never auto-searches.
    h.button(h.t.find).fire('click'); const items = await h.searches.at(-1)!; await nextTurn();
    expect(find.mock.calls.at(-1)).toEqual(['FocusNeedle', 'medium', 'normal']);
    expect(items).toHaveLength(1);
    const e = items[0].fragment.evidence[0], source = await h.plugin.controller.snapshot(e.relativePath);
    expect(source!.hash).toBe(e.sourceHash); expect(source!.text.slice(e.start, e.end)).toBe(e.quote);
    h.get('tb-source').fire('click'); await h.opens.at(-1); await nextTurn();
    expect(h.openFile).toHaveBeenCalledOnce(); expect(h.openedView.editor.setSelection).toHaveBeenCalledOnce();
    // The discarded request does not disable a fresh explicit fill or weaken
    // full-draft privacy just because Main returned only a selected body.
    current.fire('click'); await h.contexts.at(-1); await nextTurn();
    expect(input.value).toBe('FocusNeedle'); expect(h.get('tb-privacy').hidden).toBe(false);
    expect(h.searches).toHaveLength(1);
    h.button(h.t.find).fire('click'); await h.searches.at(-1); await nextTurn();
    expect(find.mock.calls.at(-1)).toEqual(['FocusNeedle', 'medium', 'private']);
    expect(h.get('tb-notice').hidden).toBe(true); await h.unchanged();
  } finally { pending?.release(); await h.cleanup(); }
});

it('a composition-retired current-note response cannot clear a newer explicit read', async () => {
  const h = await fixture(); let first: Awaited<ReturnType<typeof delayedCurrent>> | undefined, second: typeof first;
  try {
    await h.restore(); const input = h.get('tb-idea'); input.value = 'Unsent synthetic idea'; input.fire('input');
    first = await delayedCurrent(h); input.focus(); input.fire('compositionstart');
    expect.soft(h.button(h.t.cancel).hidden).toBe(true);
    input.fire('compositionend'); second = await delayedCurrent(h); await first.settle();
    expect(input.value).toBe('Unsent synthetic idea'); expect(h.get('tb-privacy').hidden).toBe(true);
    expect(h.get('tb-status').textContent).toContain(h.t.contextReading); expect(h.button(h.t.cancel).hidden).toBe(false);
    await second.settle();
    expect(input.value).toBe('FocusNeedle'); expect(h.get('tb-privacy').hidden).toBe(false);
    expect(h.button(h.t.cancel).hidden).toBe(true); expect(h.searches).toHaveLength(0); await h.unchanged();
  } finally { first?.release(); second?.release(); await h.cleanup(); }
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

// Registered Settings -> persistSettings -> ActivationView -> real renderer,
// with synthetic files and host/DOM shells. No native settings/IME claim.
for (const setting of ['schedule', 'language', 'folder'] as const)
it.each(['en', 'zh'] as const)(`saving ${setting} retains an unfinished idea only in the open view in %s`, async locale => {
  const h = await fixture(locale);
  try {
    const leaf = await h.restore(), input = h.get('tb-idea');
    const idea = 'UnsentSettingsDraft\nFocusNeedle'; input.value = idea; input.fire('input');
    h.get('tb-select').value = 'high'; h.get('tb-select').fire('change');
    if (setting === 'schedule') await h.changeSetting('Refresh schedule|更新频率', 'weekly');
    if (setting === 'language') await h.changeSetting('Language|语言', locale === 'en' ? 'zh' : 'en');
    if (setting === 'folder') await h.changeSetting('Generated layer|提炼层位置', 'Another Derived', 'blur');
    expect.soft(h.get('tb-idea').value).toBe(idea); expect.soft(h.get('tb-select').value).toBe('high');
    expect(h.doc.activeElement).toBe(h.editor); expect(h.get('tb-idea').focusCalls).toBe(0);
    expect(h.searches).toHaveLength(0); expect(h.contexts).toHaveLength(0);
    expect(h.saved.every(text => !text.includes('UnsentSettingsDraft') && !text.includes('FocusNeedle'))).toBe(true);
    expect(h.get('tb-result')).toBeNull(); expect(h.get('tb-result-summary').textContent).toBe('');
    // A remount is not authorization to search the carried draft.
    h.get('tb-select').value = 'low'; h.get('tb-select').fire('change'); expect(h.searches).toHaveLength(0);
    if (setting !== 'folder') {
      const t = messages(h.plugin.settings.locale); h.button(t.find).fire('click');
      const items = await h.searches.at(-1)!; await nextTurn(); expect(items).toHaveLength(1);
      h.get('tb-source').fire('click'); await h.opens.at(-1); await nextTurn(); expect(h.openFile).toHaveBeenCalledOnce();
      const e = items[0].fragment.evidence[0], source = await h.plugin.controller.snapshot(e.relativePath);
      expect(source!.hash).toBe(e.sourceHash); expect(source!.text.slice(e.start, e.end)).toBe(e.quote);
    } else expect(h.plugin.controller.status().fragmentCount).toBe(0);
    await h.unchanged();
    // Closing drops the draft; neither a newly mounted view nor plugin settings restore it.
    await leaf.view.onClose(); h.leaves.splice(0); await h.restore();
    expect(h.get('tb-idea').value).toBe(''); expect(h.get('tb-privacy').hidden).toBe(true);
  } finally { await h.cleanup(); }
});

it.each(['en', 'zh'] as const)('settings keep full-draft privacy and never turn a carried private idea into a cloud request in %s', async locale => {
  const h = await fixture(locale);
  try {
    await h.restore(); const find = vi.spyOn(h.plugin.controller, 'find');
    const model = vi.spyOn(h.plugin as unknown as { model(settings: unknown): unknown }, 'model');
    h.button(h.t.current).fire('click'); await h.contexts.at(-1); await nextTurn();
    expect(h.get('tb-idea').value).toBe('FocusNeedle'); expect(h.get('tb-privacy').hidden).toBe(false);
    // A private query bypasses even the factory/secret lookup: no provider,
    // authentication or HTTP is involved in this local safety check.
    await h.changeSetting('Processing mode|处理方式', 'cloud-model');
    expect.soft(h.get('tb-idea').value).toBe('FocusNeedle'); expect.soft(h.get('tb-privacy').hidden).toBe(false);
    h.button(h.t.find).fire('click'); const items = await h.searches.at(-1)!; await nextTurn();
    expect(find.mock.calls.at(-1)).toEqual(['FocusNeedle', 'medium', 'private']); expect(items).toHaveLength(1);
    expect(model).not.toHaveBeenCalled(); expect(h.saved.every(text => !text.includes('FocusNeedle'))).toBe(true);
    h.get('tb-source').fire('click'); await h.opens.at(-1); await nextTurn(); expect(h.openFile).toHaveBeenCalledOnce();
    await h.unchanged();
  } finally { await h.cleanup(); }
});

it('settings retire old search results and revalidate a retained type selection after source exclusion', async () => {
  const h = await fixture();
  try {
    await h.restore(); h.get('tb-idea').value = 'FocusNeedle'; h.get('tb-idea').fire('input');
    h.button(h.t.find).fire('click'); const items = await h.searches.at(-1)!; await nextTurn(); expect(items).toHaveLength(1);
    h.get('tb-facet').fire('click'); await h.searches.at(-1); await nextTurn();
    const label = h.get('tb-label').textContent, value = h.get('tb-idea').value;
    const find = vi.spyOn(h.plugin.controller, 'find');
    await h.changeSetting('Source exclusions|排除的原始文件夹', 'alpha.md\ndraft.md');
    expect.soft(h.get('tb-idea').value).toBe(value); expect.soft(h.get('tb-label').textContent).toBe(label);
    expect(h.get('tb-result')).toBeNull(); expect(h.get('tb-result-summary').textContent).toBe(''); expect(find).not.toHaveBeenCalled();
    h.get('tb-select').value = 'high'; h.get('tb-select').fire('change'); expect(find).not.toHaveBeenCalled();
    h.button(h.t.find).fire('click'); const excluded = await h.searches.at(-1); await nextTurn();
    expect(find.mock.calls.at(-1)?.[3]).toEqual({ channel: 'kind', value: items[0].fragment.kind });
    expect(excluded).toEqual([]); expect(h.get('tb-result')).toBeNull();
    await expect(h.plugin.controller.verifyOpen(items[0].fragment.evidence[0])).rejects.toThrow();
    await h.unchanged();
  } finally { await h.cleanup(); }
});

it('settings capture the latest draft after an asynchronous save, without keeping a late old search', async () => {
  const h = await fixture(), resultGate = latch(), resultReady = latch(), saveGate = latch(), saveEntered = latch();
  try {
    await h.restore(); const input = h.get('tb-idea'); input.value = 'FocusNeedle'; input.fire('input');
    const find = h.plugin.controller.find.bind(h.plugin.controller);
    vi.spyOn(h.plugin.controller, 'find').mockImplementationOnce(async (...args) => {
      const items = await find(...args); expect(items).toHaveLength(1); resultReady.release(); await resultGate.promise; return items;
    });
    h.button(h.t.find).fire('click'); await resultReady.promise;
    const save = h.plugin.saveData.bind(h.plugin);
    vi.spyOn(h.plugin, 'saveData').mockImplementationOnce(async data => { saveEntered.release(); await saveGate.promise; await save(data); });
    const saving = h.changeSetting('Refresh schedule', 'weekly'); await saveEntered.promise;
    input.value = 'LatestUnsentDraft'; input.fire('input');
    saveGate.release(); await saving;
    expect(h.get('tb-idea').value).toBe('LatestUnsentDraft');
    resultGate.release(); await h.searches.at(-1); await nextTurn();
    expect(h.get('tb-result')).toBeNull(); expect(h.get('tb-result-summary').textContent).toBe('');
    expect(h.get('tb-idea').value).toBe('LatestUnsentDraft'); expect(h.searches).toHaveLength(1);
    expect(h.saved.every(text => !text.includes('LatestUnsentDraft'))).toBe(true); await h.unchanged();
  } finally { resultGate.release(); saveGate.release(); await h.cleanup(); }
});

it.each(['resolve', 'reject'] as const)('settings retire an old current-note %s without erasing the existing draft', async outcome => {
  const h = await fixture(); let pending: Awaited<ReturnType<typeof delayedCurrent>> | undefined;
  try {
    await h.restore(); h.get('tb-idea').value = 'Unsent synthetic idea'; h.get('tb-idea').fire('input');
    pending = await delayedCurrent(h, outcome);
    await h.changeSetting('Refresh schedule', 'weekly');
    expect.soft(h.get('tb-idea').value).toBe('Unsent synthetic idea');
    await pending.settle();
    expect.soft(h.get('tb-idea').value).toBe('Unsent synthetic idea'); expect(h.get('tb-privacy').hidden).toBe(true);
    expect(h.get('tb-notice').hidden).toBe(true); expect(h.button(h.t.cancel).hidden).toBe(true);
    expect(h.searches).toHaveLength(0); await h.unchanged();
  } finally { pending?.release(); await h.cleanup(); }
});

// Ordinary settings saves do not replace the store/controller. Delay only a
// host save completion; exercise newer intent while the newer save is queued.
// This is synthetic I/O timing, not a real slow disk or native settings test.
for (const intent of ['search', 'current-read', 'composition'] as const)
it.each(['en', 'zh'] as const)(`an older ordinary settings completion cannot retire a newer ${intent} intent in %s`, async locale => {
  const h = await fixture(locale), saveGate = latch(), saveEntered = latch(), latestGate = latch();
  let pending: Awaited<ReturnType<typeof delayedCurrent>> | undefined;
  let older: Promise<void> | undefined, latest: Promise<void> | undefined;
  try {
    await h.restore(); const controller = h.plugin.controller;
    const save = h.plugin.saveData.bind(h.plugin);
    let saveCalls = 0;
    vi.spyOn(h.plugin, 'saveData').mockImplementation(async data => {
      const call = ++saveCalls;
      if (call === 1) { saveEntered.release(); await saveGate.promise; }
      if (call === 2) await latestGate.promise;
      await save(data);
    });
    older = h.startSetting('Refresh schedule|更新频率', 'weekly'); await saveEntered.promise;
    latest = h.startSetting('Language|语言', locale === 'en' ? 'zh' : 'en'); await nextTurn();
    // The newer write cannot finish before the older one. The still-mounted
    // renderer stays in its original locale until the newest save succeeds.
    const t = h.t, input = h.get('tb-idea');
    const find = vi.spyOn(h.plugin.controller, 'find');
    // Main merges the selected body with the FULL private editor draft.
    h.button(t.current).fire('click'); await h.contexts.at(-1); await nextTurn();
    expect(input.value).toBe('FocusNeedle'); expect(h.get('tb-privacy').hidden).toBe(false);
    if (intent === 'search') {
      h.button(t.find).fire('click'); expect(await h.searches.at(-1)).toHaveLength(1); await nextTurn();
      expect(h.get('tb-result')).not.toBeNull();
    } else if (intent === 'current-read') {
      pending = await delayedCurrent(h);
    } else {
      input.focus(); input.fire('compositionstart'); input.value = 'FocusNeedle UnsentComposition';
    }
    const focus = h.doc.activeElement, searchesBefore = h.searches.length;
    saveGate.release(); await older; await nextTurn();
    expect.soft(h.plugin.controller).toBe(controller);
    expect.soft(h.get('tb-idea') === input).toBe(true);
    expect.soft(h.doc.activeElement === focus).toBe(true);
    expect.soft(h.get('tb-privacy').hidden).toBe(false);
    expect(h.searches).toHaveLength(searchesBefore);
    if (intent === 'search') {
      expect.soft(h.get('tb-result')).not.toBeNull();
      expect.soft(h.get('tb-result-summary').textContent).toBe(`1 ${t.results}`);
    } else if (intent === 'current-read') {
      expect.soft(h.get('tb-status').textContent).toContain(t.contextReading);
      expect.soft(h.button(t.cancel).hidden).toBe(false);
      await pending!.settle(); expect(h.get('tb-idea').value).toBe('FocusNeedle');
    } else {
      expect(h.get('tb-idea').value).toBe('FocusNeedle UnsentComposition'); input.fire('compositionend');
      h.get('tb-select').value = 'high'; h.get('tb-select').fire('change');
      expect(h.searches).toHaveLength(searchesBefore);
    }
    if (intent !== 'search') { h.button(t.find).fire('click'); expect(await h.searches.at(-1)).toHaveLength(1); await nextTurn(); }
    expect(find.mock.calls.at(-1)?.[2]).toBe('private');
    const items = await h.searches.at(-1)!, e = items[0].fragment.evidence[0];
    const source = await h.plugin.controller.snapshot(e.relativePath);
    expect(source!.id).toBe(e.sourceId); expect(source!.hash).toBe(e.sourceHash);
    expect(source!.text.slice(e.start, e.end)).toBe(e.quote);
    // The genuinely rendered current result still opens the precise original.
    const open = h.get('tb-source');
    expect.soft(open).not.toBeNull();
    if (open) { open.fire('click'); await h.opens.at(-1); await nextTurn(); expect(h.openFile).toHaveBeenCalledOnce(); expect(h.openedView.editor.setSelection).toHaveBeenCalledOnce(); }
    expect(h.saved.every(text => !text.includes('FocusNeedle') && !text.includes('UnsentComposition'))).toBe(true);
    await h.unchanged();
    latestGate.release(); await latest; await nextTurn();
    expect(h.get('tb-idea').value).toBe(input.value); expect(h.get('tb-privacy').hidden).toBe(false);
    expect(h.get('tb-result')).toBeNull(); // Only the latest successful save may redraw.
  } finally { saveGate.release(); latestGate.release(); pending?.release(); await Promise.allSettled([older, latest].filter(Boolean)); await h.cleanup(); }
});
// Controlled host save timing and synthetic settings files, not native disk faults.
for (const outcome of ['resolve', 'reject'] as const)
it.each(['en', 'zh'] as const)(`settings writes stay ordered after an older ${outcome}, keeping revoked consent on disk in %s`, async locale => {
  const h = await fixture(locale), entered = latch(), gate = latch();
  let first: Promise<unknown> | undefined, second: Promise<void> | undefined;
  try {
    await h.restore(); h.button(h.t.current).fire('click'); await h.contexts.at(-1); await nextTurn();
    expect(h.get('tb-privacy').hidden).toBe(false);
    const save = h.plugin.saveData.bind(h.plugin); let active = 0, maxActive = 0, calls = 0;
    noticeState.allowed = outcome === 'reject';
    vi.spyOn(h.plugin, 'saveData').mockImplementation(async data => {
      active++; maxActive = Math.max(maxActive, active); const call = ++calls;
      const snapshot = JSON.parse(JSON.stringify(data)); // Host captures the payload before asynchronous file work.
      try {
        if (call === 1) { entered.release(); await gate.promise; if (outcome === 'reject') throw new Error('SYNTHETIC_UNSAFE_SAVE_MESSAGE'); }
        await save(snapshot);
      } finally { active--; }
    });
    first = h.startSetting('Allow cloud processing|允许云端处理', 'true').catch(error => error); await entered.promise;
    second = h.startSetting('Allow cloud processing|允许云端处理', 'false'); await nextTurn();
    expect.soft(calls).toBe(1); expect(h.plugin.settings.cloudConsent).toBe(false);
    expect(h.get('tb-privacy').hidden).toBe(false);
    gate.release(); const firstResult = await first; await second; await nextTurn();
    expect.soft(maxActive).toBe(1);
    expect.soft(JSON.parse(await fs.readFile(h.settingsFile, 'utf8')).cloudConsent).toBe(false);
    expect(h.plugin.settings.cloudConsent).toBe(false); expect(h.get('tb-privacy').hidden).toBe(false);
    if (outcome === 'reject') {
      expect(firstResult).toBeInstanceOf(Error); expect(noticeState.messages).toHaveLength(1);
      expect(noticeState.messages.join('')).not.toContain('SYNTHETIC_UNSAFE_SAVE_MESSAGE');
    } else expect(firstResult).toBeUndefined();
    const find = vi.spyOn(h.plugin.controller, 'find');
    h.button(h.t.find).fire('click'); const items = await h.searches.at(-1)!; await nextTurn();
    expect(items).toHaveLength(1); expect(find.mock.calls.at(-1)?.[2]).toBe('private');
    h.get('tb-source').fire('click'); await h.opens.at(-1); await nextTurn(); expect(h.openFile).toHaveBeenCalledOnce();
    const e = items[0].fragment.evidence[0], source = await h.plugin.controller.snapshot(e.relativePath);
    expect(source!.id).toBe(e.sourceId); expect(source!.hash).toBe(e.sourceHash); expect(source!.text.slice(e.start, e.end)).toBe(e.quote);
    expect(h.saved.every(text => !text.includes('FocusNeedle'))).toBe(true); await h.unchanged();
  } finally { gate.release(); await Promise.allSettled([first, second].filter(Boolean)); await h.cleanup(); }
});

it.each(['en', 'zh'] as const)('a failed latest settings write leaves the private idea intact and permits an explicit retry in %s', async locale => {
  const h = await fixture(locale);
  try {
    await h.restore(); h.button(h.t.current).fire('click'); await h.contexts.at(-1); await nextTurn();
    const input = h.get('tb-idea'), diskBefore = await fs.readFile(h.settingsFile);
    noticeState.allowed = true;
    vi.spyOn(h.plugin, 'saveData').mockRejectedValueOnce(new Error('SYNTHETIC_UNSAFE_SAVE_MESSAGE'));
    await expect(h.startSetting('Refresh schedule|更新频率', 'weekly')).rejects.toThrow('SYNTHETIC_UNSAFE_SAVE_MESSAGE'); await nextTurn();
    expect(await fs.readFile(h.settingsFile)).toEqual(diskBefore);
    expect(h.get('tb-idea') === input).toBe(true); expect(input.value).toBe('FocusNeedle');
    expect(h.get('tb-privacy').hidden).toBe(false); expect(h.searches).toHaveLength(0);
    expect(noticeState.messages).toHaveLength(1); expect(noticeState.messages.join('')).not.toContain('SYNTHETIC_UNSAFE_SAVE_MESSAGE');
    await h.changeSetting('Refresh schedule|更新频率', 'weekly');
    expect(JSON.parse(await fs.readFile(h.settingsFile, 'utf8')).schedule).toBe('weekly');
    expect(h.get('tb-idea').value).toBe('FocusNeedle'); expect(h.get('tb-privacy').hidden).toBe(false);
    const find = vi.spyOn(h.plugin.controller, 'find');
    h.button(h.t.find).fire('click'); expect(await h.searches.at(-1)).toHaveLength(1); await nextTurn();
    expect(find.mock.calls.at(-1)?.[2]).toBe('private');
    h.get('tb-source').fire('click'); await h.opens.at(-1); await nextTurn(); expect(h.openFile).toHaveBeenCalledOnce();
    expect(h.saved.every(text => !text.includes('FocusNeedle'))).toBe(true); await h.unchanged();
  } finally { await h.cleanup(); }
});

// Policy changes are effective before host persistence. A rejected synthetic
// save must not leave a pre-change read/search authorized to deliver afterward.
for (const setting of ['exclusions', 'mode'] as const) for (const outcome of ['resolve', 'reject'] as const)
it.each(['en', 'zh'] as const)(`a failed settings save retires the pre-change current-note ${outcome} after ${setting} in %s`, async locale => {
  const h = await fixture(locale), saveEntered = latch(), saveGate = latch();
  let pending: Awaited<ReturnType<typeof delayedCurrent>> | undefined, saving: Promise<unknown> | undefined;
  try {
    await h.restore(); h.button(h.t.current).fire('click'); await h.contexts.at(-1); await nextTurn();
    const input = h.get('tb-idea'); expect(input.value).toBe('FocusNeedle'); expect(h.get('tb-privacy').hidden).toBe(false);
    h.button(h.t.find).fire('click'); const prior = await h.searches.at(-1)!; await nextTurn(); expect(prior).toHaveLength(1);
    const card = h.get('tb-result'); input.value = 'Unsent private synthetic idea'; input.fire('input');
    pending = await delayedCurrent(h, outcome);
    const diskBefore = await fs.readFile(h.settingsFile), focus = h.doc.activeElement, focuses = input.focusCalls;
    const model = vi.spyOn(h.plugin as unknown as { model(settings: unknown): unknown }, 'model');
    const fault = new Error('SYNTHETIC_UNSAFE_SETTINGS_FAILURE'); noticeState.allowed = true;
    vi.spyOn(h.plugin, 'saveData').mockImplementationOnce(async () => { saveEntered.release(); await saveGate.promise; throw fault; });
    saving = h.startSetting(setting === 'exclusions' ? 'Source exclusions|排除的原始文件夹' : 'Processing mode|处理方式', setting === 'exclusions' ? 'alpha.md' : 'cloud-model').catch(error => error);
    await saveEntered.promise;
    expect.soft(h.get('tb-status').textContent).not.toContain(h.t.contextReading);
    expect.soft(h.button(h.t.cancel).hidden).toBe(true);
    for (const name of ['blur', 'input', 'compositionstart']) expect.soft(h.editor.handlers.get(name)?.size ?? 0).toBe(0);
    saveGate.release(); expect(await saving).toBe(fault); await nextTurn();
    expect(await fs.readFile(h.settingsFile)).toEqual(diskBefore);
    await pending.settle();
    expect.soft(h.get('tb-idea') === input).toBe(true); expect.soft(input.value).toBe('Unsent private synthetic idea');
    expect(h.get('tb-privacy').hidden).toBe(false); expect.soft(h.get('tb-notice').hidden).toBe(true);
    expect.soft(h.doc.activeElement === focus).toBe(true); expect.soft(input.focusCalls).toBe(focuses);
    expect(h.get('tb-result')).toBe(card); expect(h.get('tb-result-summary').textContent).toContain(h.t.previousResults);
    expect(h.searches).toHaveLength(1); expect(model).not.toHaveBeenCalled();
    expect(noticeState.messages).toHaveLength(1); expect(noticeState.messages.join('')).not.toContain(fault.message);
    if (setting === 'exclusions') await expect(h.plugin.controller.verifyOpen(prior[0].fragment.evidence[0])).rejects.toThrow();
    // Retry restores the policy explicitly, not the discarded request. Search
    // remains opt-in, private and source-verified; no authentication is resolved.
    await h.changeSetting(setting === 'exclusions' ? 'Source exclusions|排除的原始文件夹' : 'Processing mode|处理方式', setting === 'exclusions' ? '' : 'local-excerpts');
    expect(h.get('tb-idea').value).toBe('Unsent private synthetic idea'); expect(h.get('tb-privacy').hidden).toBe(false);
    h.get('tb-select').value = 'high'; h.get('tb-select').fire('change'); expect(h.searches).toHaveLength(1);
    h.button(h.t.current).fire('click'); await h.contexts.at(-1); await nextTurn();
    expect(h.get('tb-idea').value).toBe('FocusNeedle'); expect(h.get('tb-privacy').hidden).toBe(false);
    const find = vi.spyOn(h.plugin.controller, 'find'); h.button(h.t.find).fire('click'); const items = await h.searches.at(-1)!; await nextTurn();
    expect(items).toHaveLength(1); expect(find.mock.calls.at(-1)).toEqual(['FocusNeedle', 'high', 'private']);
    h.get('tb-source').fire('click'); await h.opens.at(-1); await nextTurn(); expect(h.openFile).toHaveBeenCalledOnce();
    const e = items[0].fragment.evidence[0], source = await h.plugin.controller.snapshot(e.relativePath);
    expect(source!.id).toBe(e.sourceId); expect(source!.hash).toBe(e.sourceHash); expect(source!.text.slice(e.start, e.end)).toBe(e.quote);
    expect(h.saved.every(text => !text.includes('FocusNeedle') && !text.includes('Unsent private'))).toBe(true); await h.unchanged();
  } finally { saveGate.release(); pending?.release(); await Promise.allSettled([saving].filter(Boolean)); await h.cleanup(); }
});

it.each(['en', 'zh'] as const)('a failed settings save cannot render a pre-change search reply after excluding its source in %s', async locale => {
  const h = await fixture(locale), entered = latch(), gate = latch();
  try {
    await h.restore(); h.button(h.t.current).fire('click'); await h.contexts.at(-1); await nextTurn();
    const find = h.plugin.controller.find.bind(h.plugin.controller);
    vi.spyOn(h.plugin.controller, 'find').mockImplementationOnce(async (...args) => {
      const items = await find(...args); expect(items).toHaveLength(1); entered.release(); await gate.promise; return items;
    });
    h.button(h.t.find).fire('click'); await entered.promise;
    expect(h.plugin.controller.status().phase).toBe('idle'); // Controller finished; renderer delivery is synthetically delayed.
    const input = h.get('tb-idea'), diskBefore = await fs.readFile(h.settingsFile);
    noticeState.allowed = true; const fault = new Error('SYNTHETIC_UNSAFE_SETTINGS_FAILURE');
    vi.spyOn(h.plugin, 'saveData').mockRejectedValueOnce(fault);
    await expect(h.startSetting('Source exclusions|排除的原始文件夹', 'alpha.md')).rejects.toBe(fault); await nextTurn();
    gate.release(); const old = await h.searches.at(-1)!; await nextTurn();
    expect.soft(h.get('tb-result')).toBeNull(); expect.soft(h.get('tb-result-summary').textContent).toBe('');
    expect(h.get('tb-idea') === input).toBe(true); expect(input.value).toBe('FocusNeedle'); expect(h.get('tb-privacy').hidden).toBe(false);
    expect(await fs.readFile(h.settingsFile)).toEqual(diskBefore); expect(noticeState.messages).toHaveLength(1);
    await expect(h.plugin.controller.verifyOpen(old[0].fragment.evidence[0])).rejects.toThrow();
    await h.changeSetting('Source exclusions|排除的原始文件夹', '');
    expect(h.searches).toHaveLength(1); h.button(h.t.find).fire('click'); const current = await h.searches.at(-1)!; await nextTurn();
    expect(current).toHaveLength(1); expect(h.get('tb-result')).not.toBeNull();
    h.get('tb-source').fire('click'); await h.opens.at(-1); await nextTurn(); expect(h.openFile).toHaveBeenCalledOnce();
    await h.unchanged();
  } finally { gate.release(); await h.cleanup(); }
});

for (const intent of ['current-read', 'search'] as const)
it.each(['en', 'zh'] as const)(`a failed settings save keeps a newer explicit ${intent} accepted under the changed policy in %s`, async locale => {
  const h = await fixture(locale), saveEntered = latch(), saveGate = latch(), queryReady = latch(), queryGate = latch();
  let pending: Awaited<ReturnType<typeof delayedCurrent>> | undefined, saving: Promise<unknown> | undefined;
  try {
    await h.restore(); h.button(h.t.current).fire('click'); await h.contexts.at(-1); await nextTurn();
    const input = h.get('tb-idea'); expect(h.get('tb-privacy').hidden).toBe(false);
    const model = vi.spyOn(h.plugin as unknown as { model(settings: unknown): unknown }, 'model');
    const fault = new Error('SYNTHETIC_UNSAFE_SETTINGS_FAILURE'); noticeState.allowed = true;
    vi.spyOn(h.plugin, 'saveData').mockImplementationOnce(async () => { saveEntered.release(); await saveGate.promise; throw fault; });
    saving = h.startSetting('Processing mode|处理方式', 'cloud-model').catch(error => error); await saveEntered.promise;
    const find = h.plugin.controller.find.bind(h.plugin.controller);
    if (intent === 'current-read') pending = await delayedCurrent(h);
    else {
      vi.spyOn(h.plugin.controller, 'find').mockImplementationOnce(async (...args) => { const items = await find(...args); queryReady.release(); await queryGate.promise; return items; });
      h.button(h.t.find).fire('click'); await queryReady.promise;
    }
    saveGate.release(); expect(await saving).toBe(fault); await nextTurn();
    expect(h.get('tb-idea') === input).toBe(true); expect(h.get('tb-privacy').hidden).toBe(false);
    if (pending) {
      expect(h.get('tb-status').textContent).toContain(h.t.contextReading); expect(h.button(h.t.cancel).hidden).toBe(false);
      await pending.settle(); expect(input.value).toBe('FocusNeedle'); h.button(h.t.find).fire('click');
    } else queryGate.release();
    const items = await h.searches.at(-1)!; await nextTurn(); expect(items).toHaveLength(1); expect(h.get('tb-result')).not.toBeNull();
    expect(h.get('tb-notice').hidden).toBe(true); expect(h.searches).toHaveLength(1); expect(model).not.toHaveBeenCalled();
    h.get('tb-source').fire('click'); await h.opens.at(-1); await nextTurn(); expect(h.openFile).toHaveBeenCalledOnce(); await h.unchanged();
  } finally { saveGate.release(); queryGate.release(); pending?.release(); await Promise.allSettled([saving].filter(Boolean)); await h.cleanup(); }
});

it.each(['en', 'zh'] as const)('a failed settings save preserves the selected type but requires a new explicit search in %s', async locale => {
  const h = await fixture(locale);
  try {
    await h.restore(); h.button(h.t.current).fire('click'); await h.contexts.at(-1); await nextTurn();
    h.button(h.t.find).fire('click'); const items = await h.searches.at(-1)!; await nextTurn();
    h.get('tb-facet').fire('click'); await h.searches.at(-1); await nextTurn();
    const input = h.get('tb-idea'), label = h.get('tb-label').textContent, value = input.value, card = h.get('tb-result');
    noticeState.allowed = true; vi.spyOn(h.plugin, 'saveData').mockRejectedValueOnce(new Error('SYNTHETIC_UNSAFE_SETTINGS_FAILURE'));
    await expect(h.startSetting('Source exclusions|排除的原始文件夹', 'draft.md')).rejects.toThrow(); await nextTurn();
    expect(h.get('tb-idea') === input).toBe(true); expect(input.value).toBe(value); expect(h.get('tb-label').textContent).toBe(label);
    expect(h.get('tb-privacy').hidden).toBe(true); // Selected current card is an ordinary-source type, not the preceding private idea.
    expect(h.get('tb-result')).toBe(card); expect.soft(h.get('tb-result-summary').textContent).toContain(h.t.previousResults);
    const count = h.searches.length; h.get('tb-select').value = 'high'; h.get('tb-select').fire('change');
    expect.soft(h.searches).toHaveLength(count);
    // Await any wrongly auto-started baseline query before testing recovery.
    if (h.searches.length !== count) { await h.searches.at(-1); await nextTurn(); }
    const find = vi.spyOn(h.plugin.controller, 'find'); h.button(h.t.find).fire('click'); const current = await h.searches.at(-1)!; await nextTurn();
    expect(find.mock.calls.at(-1)).toEqual([value, 'high', 'normal', { channel: 'kind', value: items[0].fragment.kind }]);
    expect(current).toHaveLength(1); h.get('tb-source').fire('click'); await h.opens.at(-1); await nextTurn();
    expect(h.openFile).toHaveBeenCalledOnce(); await h.unchanged();
  } finally { await h.cleanup(); }
});

it('a failed settings save does not require a deferred view to have mounted a panel', async () => {
  const h = await fixture();
  try {
    const leaf = h.restoreDeferred(), placeholder = leaf.view; noticeState.allowed = true;
    const fault = new Error('SYNTHETIC_UNSAFE_SETTINGS_FAILURE'); vi.spyOn(h.plugin, 'saveData').mockRejectedValueOnce(fault);
    await expect(h.startSetting('Refresh schedule', 'weekly')).rejects.toBe(fault); await nextTurn();
    expect(leaf.view).toBe(placeholder); expect(h.contexts).toHaveLength(0); expect(h.searches).toHaveLength(0);
    expect(noticeState.messages).toHaveLength(1); await h.enter(); expect(h.get('tb-idea').value).toBe(''); await h.unchanged();
  } finally { await h.cleanup(); }
});

it('refresh timestamp saves share the settings queue and snapshot data before waiting', async () => {
  const h = await fixture(), entered = latch(), gate = latch(), savedEntered = latch();
  let first: Promise<void> | undefined, second: Promise<void> | undefined, refresh: Promise<void> | undefined;
  try {
    await h.restore(); const before = h.saved.length, previousTimestamp = h.plugin.settings.lastIndexedAt;
    const save = h.plugin.saveData.bind(h.plugin); let active = 0, maxActive = 0, calls = 0;
    vi.spyOn(h.plugin, 'saveData').mockImplementation(async data => {
      active++; maxActive = Math.max(maxActive, active); const call = ++calls;
      const snapshot = JSON.parse(JSON.stringify(data)); // Host captures the payload before asynchronous file work.
      try { if (call === 1) { entered.release(); await gate.promise; } await save(snapshot); } finally { active--; }
    });
    const controller = h.plugin.controller as unknown as { saved(when: string): Promise<void> };
    const saved = controller.saved.bind(controller);
    vi.spyOn(controller, 'saved').mockImplementation(when => { const op = saved(when); savedEntered.release(); return op; });
    first = h.startSetting('Refresh schedule', 'weekly'); await entered.promise;
    second = h.startSetting('Refresh schedule', 'daily');
    refresh = h.plugin.controller.refresh(); await savedEntered.promise;
    const timestamp = h.plugin.settings.lastIndexedAt;
    expect(timestamp).not.toBe(previousTimestamp); expect.soft(calls).toBe(1);
    gate.release(); await Promise.all([first, second, refresh]); await nextTurn();
    expect.soft(maxActive).toBe(1);
    const writes = h.saved.slice(before).map(text => JSON.parse(text));
    expect.soft(writes.map(data => data.schedule)).toEqual(['weekly', 'daily', 'daily']);
    expect.soft(writes.map(data => data.lastIndexedAt)).toEqual([previousTimestamp, previousTimestamp, timestamp]);
    const disk = JSON.parse(await fs.readFile(h.settingsFile, 'utf8'));
    expect(disk.schedule).toBe('daily'); expect(disk.lastIndexedAt).toBe(timestamp);
    expect(h.plugin.controller.status().phase).toBe('idle'); expect(h.plugin.controller.status().warningCode).toBeUndefined();
    await h.unchanged();
  } finally { gate.release(); await Promise.allSettled([first, second, refresh].filter(Boolean)); await h.cleanup(); }
});

// Hold the completion of a real OwnedStore load for one synthetic folder only.
// The controller initializes normally; this is controlled timing/fault injection,
// not an actual stalled disk, native setting callback, or model response.
function delayedFolderLoad(folder: string, outcome: 'resolve' | 'reject') {
  const entered = latch(), gate = latch(), load = OwnedStore.prototype.load;
  const fault = new TypeError('SYNTHETIC_UNSAFE_FOLDER_LOAD_DETAIL'); let calls = 0;
  vi.spyOn(OwnedStore.prototype, 'load').mockImplementation(async function (this: OwnedStore) {
    const result = await load.call(this);
    if ((this as unknown as { folder: string }).folder === folder && calls++ === 0) {
      entered.release(); await gate.promise;
      if (outcome === 'reject') throw fault;
    }
    return result;
  });
  return { entered: entered.promise, release: gate.release, fault };
}

for (const outcome of ['resolve', 'reject'] as const) for (const intent of ['search', 'current-read', 'composition'] as const)
it.each(['en', 'zh'] as const)(`generated-folder older initialize ${outcome} cannot override newer ${intent} in %s`, async locale => {
  const h = await fixture(locale), held = delayedFolderLoad('Another Derived', outcome);
  let older: Promise<void> | undefined, pending: Awaited<ReturnType<typeof delayedCurrent>> | undefined;
  try {
    await fs.mkdir(path.join(h.root, 'Another Derived'));
    const human = path.join(h.root, 'Another Derived/manual.txt'), humanBytes = 'Synthetic human-authored output-folder file.';
    await fs.writeFile(human, humanBytes);
    await h.restore(); h.button(h.t.current).fire('click'); await h.contexts.at(-1); await nextTurn();
    expect(h.get('tb-privacy').hidden).toBe(false);
    noticeState.allowed = true;
    older = h.startSetting('Generated layer|提炼层位置', 'Another Derived', 'blur'); await held.entered;
    const obsolete = h.plugin.controller;
    expect(obsolete.status().phase).toBe('loading');
    await h.changeSetting('Generated layer|提炼层位置', 'Derived', 'blur');
    const current = h.plugin.controller, input = h.get('tb-idea'), redraw = vi.spyOn(h.leaves[0].view, 'redraw');
    expect(current).not.toBe(obsolete); expect(current.status().fragmentCount).toBeGreaterThan(0);
    expect(input.value).toBe('FocusNeedle'); expect(h.get('tb-privacy').hidden).toBe(false);
    const find = vi.spyOn(current, 'find');
    if (intent === 'search') {
      h.button(h.t.find).fire('click'); expect(await h.searches.at(-1)).toHaveLength(1); await nextTurn();
    } else if (intent === 'current-read') pending = await delayedCurrent(h);
    else { input.focus(); input.fire('compositionstart'); input.value = 'FocusNeedle UnsentFolderComposition'; }
    const focus = h.doc.activeElement, count = h.searches.length;
    held.release(); await older; await nextTurn();
    expect.soft(h.plugin.controller).toBe(current);
    expect.soft(redraw).not.toHaveBeenCalled();
    expect.soft(h.get('tb-idea') === input).toBe(true); expect.soft(h.doc.activeElement === focus).toBe(true);
    expect(h.get('tb-privacy').hidden).toBe(false); expect(h.searches).toHaveLength(count);
    expect.soft(noticeState.messages).toEqual([]);
    if (intent === 'search') {
      expect.soft(h.get('tb-result')).not.toBeNull(); expect.soft(h.get('tb-result-summary').textContent).toBe(`1 ${h.t.results}`);
      // Recover the baseline's lost cards to keep source-open and invariant
      // assertions executable even while the direct red assertions are recorded.
      if (!h.get('tb-result')) { h.button(h.t.find).fire('click'); await h.searches.at(-1); await nextTurn(); }
    } else if (intent === 'current-read') {
      expect.soft(h.get('tb-status').textContent).toContain(h.t.contextReading);
      expect.soft(h.button(h.t.cancel).hidden).toBe(false);
      await pending!.settle(); expect(h.get('tb-idea').value).toBe('FocusNeedle');
      h.button(h.t.find).fire('click'); await h.searches.at(-1); await nextTurn();
    } else {
      expect(h.get('tb-idea').value).toBe('FocusNeedle UnsentFolderComposition'); input.fire('compositionend');
      h.get('tb-select').value = 'high'; h.get('tb-select').fire('change'); expect(h.searches).toHaveLength(count);
      h.button(h.t.find).fire('click'); await h.searches.at(-1); await nextTurn();
    }
    expect(find.mock.calls.at(-1)?.[2]).toBe('private');
    const items = await h.searches.at(-1)!, e = items[0].fragment.evidence[0], source = await current.snapshot(e.relativePath);
    expect(source!.id).toBe(e.sourceId); expect(source!.hash).toBe(e.sourceHash);
    expect(source!.text.slice(e.start, e.end)).toBe(e.quote);
    h.get('tb-source').fire('click'); await h.opens.at(-1); await nextTurn();
    expect(h.openFile).toHaveBeenCalledOnce(); expect(h.openedView.editor.setSelection).toHaveBeenCalledOnce();
    h.plugin.settings.excludes = ['alpha.md']; await expect(current.verifyOpen(e)).rejects.toThrow(); h.plugin.settings.excludes = [];
    expect(await fs.readFile(human, 'utf8')).toBe(humanBytes);
    expect(h.saved.every(text => !text.includes('FocusNeedle') && !text.includes('UnsentFolderComposition'))).toBe(true);
    expect(JSON.parse(await fs.readFile(h.settingsFile, 'utf8')).outputFolder).toBe('Derived'); await h.unchanged();
  } finally { held.release(); pending?.release(); await Promise.allSettled([older].filter(Boolean)); await h.cleanup(); }
});

for (const outcome of ['resolve', 'reject'] as const)
it.each(['en', 'zh'] as const)(`generated-folder pending initialize ${outcome} cannot redraw or notify after unload in %s`, async locale => {
  const h = await fixture(locale), held = delayedFolderLoad('Another Derived', outcome); let saving: Promise<void> | undefined;
  try {
    const leaf = await h.restore(); h.get('tb-idea').value = 'UnsentUnloadDraft'; h.get('tb-idea').fire('input');
    noticeState.allowed = true;
    saving = h.startSetting('Generated layer|提炼层位置', 'Another Derived', 'blur'); await held.entered;
    h.plugin.onunload(); await leaf.view.onClose();
    const input = h.get('tb-idea'), redraw = vi.spyOn(leaf.view, 'redraw');
    held.release(); await saving; await nextTurn();
    expect.soft(redraw).not.toHaveBeenCalled(); expect.soft(h.get('tb-idea') === input).toBe(true);
    expect.soft(noticeState.messages).toEqual([]);
    expect(h.searches).toHaveLength(0); expect(h.contexts).toHaveLength(0);
    expect(h.saved.every(text => !text.includes('UnsentUnloadDraft'))).toBe(true); await h.unchanged();
  } finally { held.release(); await Promise.allSettled([saving].filter(Boolean)); await h.cleanup(); }
});

it.each(['en', 'zh'] as const)('generated-folder current initialize failure stays visible and a fresh explicit retry works in %s', async locale => {
  const h = await fixture(locale), held = delayedFolderLoad('Another Derived', 'reject'); let saving: Promise<void> | undefined;
  try {
    await h.restore(); h.button(h.t.current).fire('click'); await h.contexts.at(-1); await nextTurn(); noticeState.allowed = true;
    saving = h.startSetting('Generated layer|提炼层位置', 'Another Derived', 'blur'); await held.entered;
    held.release(); await saving; await nextTurn();
    expect(h.plugin.controller.status()).toMatchObject({ phase: 'error', errorCode: 'index-unavailable', hasCompleteIndex: false });
    expect(noticeState.messages).toHaveLength(1); expect(noticeState.messages[0]).toBe(h.t.unavailable);
    expect(h.get('tb-notice').textContent).toBe(h.t.unavailable); expect(h.get('tb-notice').hidden).toBe(false);
    expect(h.get('tb-idea').value).toBe('FocusNeedle'); expect(h.get('tb-privacy').hidden).toBe(false);
    expect(noticeState.messages.join('')).not.toContain(held.fault.message);
    await h.changeSetting('Generated layer|提炼层位置', 'Derived', 'blur');
    expect(h.searches).toHaveLength(0); h.button(h.t.find).fire('click'); expect(await h.searches.at(-1)).toHaveLength(1); await nextTurn();
    expect(h.get('tb-notice').hidden).toBe(true); h.get('tb-source').fire('click'); await h.opens.at(-1); await nextTurn();
    expect(h.openFile).toHaveBeenCalledOnce(); await h.unchanged();
  } finally { held.release(); await Promise.allSettled([saving].filter(Boolean)); await h.cleanup(); }
});

it.each(['en', 'zh'] as const)('generated-folder older initialize cannot redraw after a newer ordinary save on the same controller in %s', async locale => {
  const h = await fixture(locale), held = delayedFolderLoad('Derived', 'resolve'); let saving: Promise<void> | undefined;
  try {
    await h.restore(); h.button(h.t.current).fire('click'); await h.contexts.at(-1); await nextTurn();
    await h.changeSetting('Generated layer|提炼层位置', 'Another Derived', 'blur');
    saving = h.startSetting('Generated layer|提炼层位置', 'Derived', 'blur'); await held.entered;
    const controller = h.plugin.controller;
    await h.changeSetting('Refresh schedule|更新频率', 'weekly');
    expect(h.plugin.controller).toBe(controller); expect(controller.status().phase).toBe('loading');
    const input = h.get('tb-idea'), redraw = vi.spyOn(h.leaves[0].view, 'redraw');
    input.focus(); input.fire('compositionstart'); input.value = 'FocusNeedle SameControllerComposition';
    held.release(); await saving; await nextTurn();
    expect.soft(redraw).not.toHaveBeenCalled(); expect.soft(h.get('tb-idea') === input).toBe(true);
    expect.soft(h.doc.activeElement === input).toBe(true); expect(controller.status().phase).toBe('idle');
    expect(h.get('tb-idea').value).toBe('FocusNeedle SameControllerComposition'); expect(h.get('tb-privacy').hidden).toBe(false);
    input.fire('compositionend'); h.get('tb-select').value = 'high'; h.get('tb-select').fire('change'); expect(h.searches).toHaveLength(0);
    h.button(h.t.find).fire('click'); expect(await h.searches.at(-1)).toHaveLength(1); await nextTurn();
    h.get('tb-source').fire('click'); await h.opens.at(-1); await nextTurn(); expect(h.openFile).toHaveBeenCalledOnce();
    expect(h.saved.every(text => !text.includes('SameControllerComposition'))).toBe(true); await h.unchanged();
  } finally { held.release(); await Promise.allSettled([saving].filter(Boolean)); await h.cleanup(); }
});

// Loading-state handoff uses the registered setting and actual replacement
// Controller/FileSources/OwnedStore. Only load completion/failure is synthetic;
// no native clicks, slow-disk claim, model request or generated-cache mutation.
async function seedAlternateFolder(h: Awaited<ReturnType<typeof fixture>>) {
  await h.changeSetting('Generated layer|提炼层位置', 'Another Derived', 'blur');
  await h.plugin.controller.refresh();
  const store = (h.plugin as unknown as { store: OwnedStore }).store;
  const loaded = await store.load(); expect(loaded).not.toBeNull();
  const bytes = await fs.readFile(path.join(h.root, 'Another Derived/.third-brain/state.json'));
  await h.changeSetting('Generated layer|提炼层位置', 'Derived', 'blur');
  return { store, loaded, bytes };
}
for (const indexed of [false, true]) for (const outcome of ['resolve', 'reject'] as const)
it.each(['en', 'zh'] as const)(`replacement-folder loading handoff with ${indexed ? 'saved' : 'empty'} index and ${outcome} keeps controls and draft accurate in %s`, async locale => {
  const h = await fixture(locale); let held: ReturnType<typeof delayedFolderLoad> | undefined, saving: Promise<void> | undefined;
  try {
    const alternate = indexed ? await seedAlternateFolder(h) : undefined;
    await fs.mkdir(path.join(h.root, 'Another Derived'), { recursive: true });
    const human = path.join(h.root, 'Another Derived/manual.txt'), humanBytes = 'Synthetic human-authored output-folder file, never owned.';
    await fs.writeFile(human, humanBytes);
    await h.restore(); h.button(h.t.current).fire('click'); await h.contexts.at(-1); await nextTurn();
    h.button(h.t.find).fire('click'); expect(await h.searches.at(-1)).toHaveLength(1); await nextTurn();
    expect(h.get('tb-result')).not.toBeNull(); expect(h.get('tb-privacy').hidden).toBe(false);
    const searchCount = h.searches.length, contextCount = h.contexts.length;
    held = delayedFolderLoad('Another Derived', outcome); noticeState.allowed = true;
    saving = h.startSetting('Generated layer|提炼层位置', 'Another Derived', 'blur'); await held.entered;
    const controller = h.plugin.controller;
    expect(controller.status().phase).toBe('loading');
    // No input/click/manual redraw should be needed to see the new live state.
    expect.soft(h.get('tb-status').textContent).toContain(h.t.loading);
    expect.soft(h.button(h.t.index).disabled).toBe(true);
    expect.soft(h.button(h.t.find).disabled).toBe(true);
    expect.soft(h.button(h.t.current).disabled).toBe(true);
    expect.soft(h.get('tb-select').disabled).toBe(true);
    expect(h.button(h.t.cancel).hidden).toBe(true); // Loading I/O is not a cancellable task.
    expect.soft(h.get('tb-result') === null).toBe(true); expect.soft(h.get('tb-result-summary').textContent).toBe('');
    const input = h.get('tb-idea'); expect(input.value).toBe('FocusNeedle'); expect(input.disabled).toBe(false);
    expect(h.get('tb-privacy').hidden).toBe(false); expect.soft(input.focusCalls).toBe(0);
    // Composition can continue while loading. A completed initialize must update
    // the same subscribed renderer, not remount and displace the composing input.
    input.focus(); input.fire('compositionstart'); input.value = 'FocusNeedle UnsentLoadingIdea'; input.fire('input');
    const focusCalls = input.focusCalls, redraw = vi.spyOn(h.leaves[0].view, 'redraw');
    held.release(); await saving; await nextTurn();
    expect.soft(redraw).not.toHaveBeenCalled(); expect.soft(h.get('tb-idea') === input).toBe(true);
    expect.soft(h.doc.activeElement === h.get('tb-idea')).toBe(true); expect(input.focusCalls).toBe(focusCalls);
    expect(h.get('tb-idea').value).toBe('FocusNeedle UnsentLoadingIdea'); expect(h.get('tb-privacy').hidden).toBe(false);
    expect(h.searches).toHaveLength(searchCount); expect(h.contexts).toHaveLength(contextCount);
    if (outcome === 'reject') {
      expect(controller.status()).toMatchObject({ phase: 'error', errorCode: 'index-unavailable', hasCompleteIndex: false });
      expect(h.get('tb-status').textContent).toContain(h.t.error);
      expect(h.get('tb-notice').hidden).toBe(false); expect(h.get('tb-notice').textContent).toBe(h.t.unavailable);
      expect(noticeState.messages).toEqual([h.t.unavailable]);
      expect(noticeState.messages.join('')).not.toContain(held.fault.message);
    } else {
      expect(controller.status().phase).toBe('idle'); expect(h.get('tb-status').textContent).toContain(h.t.idle);
      expect(h.get('tb-notice').hidden).toBe(true); expect(h.button(h.t.index).disabled).toBe(false);
      expect(h.button(h.t.current).disabled).toBe(false); expect(h.get('tb-select').disabled).toBe(false);
      expect(h.button(h.t.find).hidden).toBe(!indexed); expect(h.button(h.t.find).disabled).toBe(!indexed);
      expect(h.get('tb-empty-title').textContent).toBe(indexed ? h.t.initial : h.t.first);
      expect(noticeState.messages).toEqual([]);
    }
    h.get('tb-idea').fire('compositionend');
    if (alternate) {
      expect(await fs.readFile(path.join(h.root, 'Another Derived/.third-brain/state.json'))).toEqual(alternate.bytes);
      expect(await alternate.store.load()).toEqual(alternate.loaded);
    } else await expect(fs.stat(path.join(h.root, 'Another Derived/.third-brain/state.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    // An explicit valid-folder retry rebinds the panel; no refresh or query is
    // inferred from the carried private draft. Real source checks still run.
    await h.changeSetting('Generated layer|提炼层位置', 'Derived', 'blur');
    const find = vi.spyOn(h.plugin.controller, 'find');
    h.get('tb-select').value = 'high'; h.get('tb-select').fire('change'); expect(h.searches).toHaveLength(searchCount);
    h.button(h.t.find).fire('click'); const items = await h.searches.at(-1)!; await nextTurn();
    expect(find.mock.calls.at(-1)).toEqual(['FocusNeedle UnsentLoadingIdea', 'high', 'private']); expect(items).toHaveLength(1);
    const e = items[0].fragment.evidence[0], source = await h.plugin.controller.snapshot(e.relativePath);
    expect(source!.id).toBe(e.sourceId); expect(source!.hash).toBe(e.sourceHash); expect(source!.text.slice(e.start, e.end)).toBe(e.quote);
    h.get('tb-source').fire('click'); await h.opens.at(-1); await nextTurn();
    expect(h.openFile).toHaveBeenCalledOnce(); expect(h.openedView.editor.setSelection).toHaveBeenCalledOnce();
    h.plugin.settings.excludes = ['alpha.md']; await expect(h.plugin.controller.verifyOpen(e)).rejects.toThrow(); h.plugin.settings.excludes = [];
    expect(await fs.readFile(human, 'utf8')).toBe(humanBytes);
    expect(h.saved.every(text => !text.includes('FocusNeedle') && !text.includes('UnsentLoadingIdea'))).toBe(true); await h.unchanged();
  } finally { held?.release(); await Promise.allSettled([saving].filter(Boolean)); await h.cleanup(); }
});

it.each(['en', 'zh'] as const)('replacement-folder loading handoff preserves typed selection without authorizing automatic refinement in %s', async locale => {
  const h = await fixture(locale); let held: ReturnType<typeof delayedFolderLoad> | undefined, saving: Promise<void> | undefined;
  try {
    const alternate = await seedAlternateFolder(h); await h.restore();
    h.get('tb-idea').value = 'FocusNeedle'; h.get('tb-idea').fire('input'); h.button(h.t.find).fire('click');
    const prior = await h.searches.at(-1)!; await nextTurn(); h.get('tb-facet').fire('click'); const typed = await h.searches.at(-1)!; await nextTurn();
    const label = h.get('tb-label').textContent, value = h.get('tb-idea').value, count = h.searches.length;
    held = delayedFolderLoad('Another Derived', 'resolve');
    saving = h.startSetting('Generated layer|提炼层位置', 'Another Derived', 'blur'); await held.entered;
    expect.soft(h.get('tb-status').textContent).toContain(h.t.loading);
    expect(h.get('tb-label').textContent).toBe(label); expect(h.get('tb-idea').value).toBe(value);
    held.release(); await saving; await nextTurn();
    expect(h.get('tb-label').textContent).toBe(label); expect(h.get('tb-idea').value).toBe(value);
    const find = vi.spyOn(h.plugin.controller, 'find');
    h.get('tb-select').value = 'high'; h.get('tb-select').fire('change'); expect(h.searches).toHaveLength(count);
    h.button(h.t.find).fire('click'); const items = await h.searches.at(-1)!; await nextTurn();
    expect(items.map(item => item.fragment.id)).toEqual(typed.map(item => item.fragment.id));
    expect(find.mock.calls.at(-1)).toEqual([value, 'high', 'normal', { channel: 'kind', value: prior[0].fragment.kind }]);
    h.get('tb-source').fire('click'); await h.opens.at(-1); await nextTurn(); expect(h.openFile).toHaveBeenCalledOnce();
    expect(await fs.readFile(path.join(h.root, 'Another Derived/.third-brain/state.json'))).toEqual(alternate.bytes);
    expect(await alternate.store.load()).toEqual(alternate.loaded); await h.unchanged();
  } finally { held?.release(); await Promise.allSettled([saving].filter(Boolean)); await h.cleanup(); }
});

it.each(['en', 'zh'] as const)('a view opened during replacement-folder loading keeps its subscribed composing input on completion in %s', async locale => {
  const h = await fixture(locale), held = delayedFolderLoad('Another Derived', 'resolve'); let saving: Promise<void> | undefined;
  try {
    saving = h.startSetting('Generated layer|提炼层位置', 'Another Derived', 'blur'); await held.entered;
    await h.restore(); expect(h.get('tb-status').textContent).toContain(h.t.loading);
    expect(h.button(h.t.index).disabled).toBe(true); expect(h.button(h.t.current).disabled).toBe(true);
    const input = h.get('tb-idea'); input.focus(); input.fire('compositionstart'); input.value = 'OpenedWhileLoadingDraft';
    const redraw = vi.spyOn(h.leaves[0].view, 'redraw');
    held.release(); await saving; await nextTurn();
    expect.soft(redraw).not.toHaveBeenCalled(); expect.soft(h.get('tb-idea') === input).toBe(true);
    expect.soft(h.doc.activeElement === h.get('tb-idea')).toBe(true); expect(h.get('tb-idea').value).toBe('OpenedWhileLoadingDraft');
    expect(h.get('tb-status').textContent).toContain(h.t.idle); expect(h.button(h.t.index).disabled).toBe(false);
    expect(h.button(h.t.current).disabled).toBe(false); expect(h.searches).toHaveLength(0); expect(h.contexts).toHaveLength(0);
    expect(h.saved.every(text => !text.includes('OpenedWhileLoadingDraft'))).toBe(true); await h.unchanged();
  } finally { held.release(); await Promise.allSettled([saving].filter(Boolean)); await h.cleanup(); }
});
