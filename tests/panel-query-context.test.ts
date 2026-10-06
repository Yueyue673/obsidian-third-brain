// SPDX-License-Identifier: MIT
// Synthetic notes + DOM/Obsidian shells, production renderer/Main PanelPort/
// Controller/FileSources/OwnedStore. Controlled delays are not native I/O evidence.
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
import { sourceDiagnostic } from '../src/core/source-diagnostics';

vi.mock('obsidian', () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, MarkdownView: class {} }));
class NodeStub {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false;
  children: NodeStub[] = []; attrs: Record<string, string> = {};
  handlers = new Map<string, Array<(event: unknown) => void>>();
  constructor(readonly tag: string) {}
  append(...nodes: NodeStub[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: NodeStub[]) { this.children = nodes; }
  setAttribute(key: string, value: string) { this.attrs[key] = value; }
  remove() {} focus() {}
  get childElementCount() { return this.children.length; }
  addEventListener(event: string, handler: (event: unknown) => void) { this.handlers.set(event, [...this.handlers.get(event) ?? [], handler]); }
  fire(event: string, payload: unknown = {}) { for (const handler of this.handlers.get(event) ?? []) handler(payload); }
  all(): NodeStub[] { return [this, ...this.children.flatMap(node => node.all())]; }
}
function latch() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const unavailableContext = (locale: 'en' | 'zh') => locale === 'zh'
  ? '当前笔记无法读取或核验。请确认文件仍存在且可读取后重试，也可以直接在这里写一个想法。'
  : 'The current note could not be read or verified. Check that the file is still available and readable, then try again, or type an idea here.';

async function fixture(locale: 'en' | 'zh' = 'en', seeded = true) {
  const scope = path.resolve('.local/panel-query-context');
  await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'case-'));
  const originals = {
    'alpha.md': '---\ntopics: [AlphaTopic]\n---\n# AlphaCard\nAlphaNeedle preserves a synthetic observation and its limits.',
    'beta.md': '# BetaCard\nBetaNeedle preserves a different synthetic observation and its original evidence.',
  };
  for (const [name, text] of Object.entries(originals)) await fs.writeFile(path.join(root, name), text);
  const settings = { ...defaults, excludes: [], outputFolder: 'Derived' };
  const store = new OwnedStore(root, settings.outputFolder);
  const sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const factory = vi.fn(() => undefined);
  const controller = new ThirdBrainController(sources, store, () => settings, factory, async () => {});
  await controller.initialize(); await controller.refresh();
  const before = await store.load(); expect(before).not.toBeNull();
  const stateBytes = await fs.readFile(path.join(root, 'Derived/.third-brain/state.json'));
  const hostOpen = vi.fn(async (_file: { path: string }) => {});
  // Main must combine the unchanged disk original and FULL private draft before using the selection.
  const view = Object.assign(Object.create(MarkdownView.prototype), {
    file: { path: 'beta.md' }, editor: { getValue: () => '---\nprivacy: private\n---\nBetaNeedle', getSelection: () => 'BetaNeedle' },
  });
  const app = {
    vault: { getFileByPath: (name: string) => ({ path: name }), read: async (file: { path: string }) => fs.readFile(path.join(root, file.path), 'utf8') },
    workspace: { getLeaf: () => ({ openFile: hostOpen }), getActiveFile: (): { path: string; extension: string } | null => ({ path: 'beta.md', extension: 'md' }), getLeavesOfType: () => [{ view }] },
  };
  const port = ThirdBrainPlugin.prototype.panelPort.call({ controller, store, app } as unknown as ThirdBrainPlugin);
  const queries: Promise<SearchResult[]>[] = [], opens: Promise<void>[] = [], contexts: ReturnType<NonNullable<typeof port.current>>[] = [];
  const find = port.find.bind(port), open = port.open.bind(port), current = port.current!.bind(port);
  const findSpy = vi.spyOn(port, 'find').mockImplementation((...args) => { const operation = find(...args); queries.push(operation); return operation; });
  vi.spyOn(port, 'open').mockImplementation(evidence => { const operation = open(evidence); opens.push(operation); return operation; });
  vi.spyOn(port, 'current').mockImplementation(() => { const operation = current(); contexts.push(operation); return operation; });
  vi.stubGlobal('document', { createElement: (tag: string) => new NodeStub(tag) });
  const container = new NodeStub('main'), t = messages(locale);
  const previous = locale === 'zh' ? '上次搜索结果；再次寻找关联以更新' : 'Previous search results; search again to update';
  const dispose = mountPanel(container as unknown as HTMLElement, port, locale);
  const get = (className: string) => container.all().find(node => node.className.split(' ').includes(className))!;
  const button = (text: string) => container.all().find(node => node.tag === 'button' && node.textContent === text)!;
  const cards = () => container.all().filter(node => node.className === 'tb-result-title').map(node => node.textContent);
  const type = (text: string) => { get('tb-idea').value = text; get('tb-idea').fire('input'); };
  const search = () => button(t.find).fire('click');
  const settleQuery = async () => { const items = await queries.at(-1)!; await Promise.resolve(); return items; };
  const assertUnchanged = async (refreshCount = 1) => {
    for (const [name, text] of Object.entries(originals)) expect(hash(await fs.readFile(path.join(root, name)))).toBe(hash(text));
    expect(await fs.readFile(path.join(root, 'Derived/.third-brain/state.json'))).toEqual(stateBytes);
    expect(await store.load()).toEqual(before);
    expect(factory).toHaveBeenCalledTimes(refreshCount);
    expect(factory.mock.results.every(result => result.type === 'return' && result.value === undefined)).toBe(true);
  };
  const cleanup = async () => { controller.cancel(); await Promise.allSettled([...queries, ...opens, ...contexts]); await Promise.resolve(); dispose(); controller.dispose(); };
  if (seeded) { type('AlphaNeedle'); search(); await settleQuery(); expect(cards()).toEqual(['AlphaCard']); expect(get('tb-result-summary').textContent).toBe(`1 ${t.results}`); }
  return { root, sources, controller, port, container, get, button, cards, type, search, settleQuery, find, findSpy, queries, opens, contexts, hostOpen, assertUnchanged, cleanup, t, previous, editor: view.editor, current, dispose, app, view };
}

// Synthetic keyboard payloads exercise the real event callback. They do not
// emulate a native IME or prove any OS-specific composition event sequence.
const enterKey = (modifier?: 'ctrlKey' | 'metaKey', isComposing = false, repeat = false) => ({
  key: 'Enter', ctrlKey: modifier === 'ctrlKey', metaKey: modifier === 'metaKey', isComposing, repeat, preventDefault: vi.fn(),
});

for (const modifier of ['ctrlKey', 'metaKey'] as const)
it.each(['en', 'zh'] as const)(`held ${modifier}+Enter does not restart a completed search in %s`, async locale => {
  const h = await fixture(locale);
  try {
    h.button(h.t.current).fire('click'); await h.contexts.at(-1)!; await Promise.resolve();
    const input = h.get('tb-idea'), first = enterKey(modifier);
    input.fire('keydown', first); const items = await h.settleQuery();
    expect(first.preventDefault).toHaveBeenCalledOnce(); expect(h.findSpy).toHaveBeenCalledTimes(2);
    expect(h.controller.status().phase).toBe('idle'); expect(h.button(h.t.find).disabled).toBe(false);
    expect(h.findSpy.mock.calls.at(-1)).toEqual(['BetaNeedle', 'medium', 'private']);
    expect(h.cards()).toEqual(['BetaCard']); expect(h.get('tb-privacy').hidden).toBe(false);
    const summary = h.get('tb-result-summary').textContent, reason = h.get('tb-reason').textContent;
    // No keyup/new press: the OS's repeated keydown must not become new intent,
    // even when the controller has finished and the search button is enabled.
    for (let i = 0; i < 2; i++) {
      const repeated = enterKey(modifier, false, true); input.fire('keydown', repeated);
      expect(repeated.preventDefault).toHaveBeenCalledOnce();
      expect(h.findSpy).toHaveBeenCalledTimes(2);
      expect(h.controller.status().phase).toBe('idle');
      expect(h.get('tb-result-summary').textContent).toBe(summary);
      expect(h.get('tb-reason').textContent).toBe(reason); expect(h.cards()).toEqual(['BetaCard']);
    }
    const ordinary = enterKey(undefined, false, true), composing = enterKey(modifier, true, true);
    input.fire('keydown', ordinary); input.fire('keydown', composing);
    expect(ordinary.preventDefault).not.toHaveBeenCalled(); expect(composing.preventDefault).not.toHaveBeenCalled();
    expect(h.findSpy).toHaveBeenCalledTimes(2); expect(input.value).toBe('BetaNeedle');
    for (const e of items[0].fragment.evidence) {
      const source = await h.sources.read(e.relativePath);
      expect(source!.hash).toBe(e.sourceHash); expect(source!.text.slice(e.start, e.end)).toBe(e.quote);
    }
    h.get('tb-source').fire('click'); await h.opens.at(-1)!;
    expect(h.hostOpen.mock.calls.at(-1)?.[0].path).toBe('beta.md');
    // A deliberate fresh press of the SAME query is still a valid retry.
    input.fire('keyup', { key: 'Enter' }); const fresh = enterKey(modifier); input.fire('keydown', fresh);
    expect(fresh.preventDefault).toHaveBeenCalledOnce(); expect(await h.settleQuery()).toEqual(items);
    expect(h.findSpy).toHaveBeenCalledTimes(3);
    expect(h.findSpy.mock.calls.at(-1)).toEqual(['BetaNeedle', 'medium', 'private']);
    expect(h.get('tb-result-summary').textContent).toBe(summary); await h.assertUnchanged();
  } finally { await h.cleanup(); }
});

it.each(['ctrlKey', 'metaKey'] as const)('held %s+Enter does not restart a cancelled search', async modifier => {
  const h = await fixture(), entered = latch(), gate = latch();
  const read = h.sources.read.bind(h.sources); let held: ReturnType<FileSources['read']> | undefined;
  vi.spyOn(h.sources, 'read').mockImplementationOnce((...args) => held = (async () => {
    const source = await read(...args); entered.release(); await gate.promise; return source;
  })());
  try {
    h.type('BetaNeedle'); const input = h.get('tb-idea'); input.fire('keydown', enterKey(modifier));
    const pending = h.queries.at(-1)!; await entered.promise;
    expect(h.controller.status().phase).toBe('searching');
    h.button(h.t.cancel).fire('click'); gate.release();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); await held; await Promise.resolve();
    expect(h.controller.status().phase).toBe('cancelled'); expect(h.button(h.t.find).disabled).toBe(false);
    const summary = h.get('tb-result-summary').textContent, notice = h.get('tb-notice').textContent;
    const repeated = enterKey(modifier, false, true); input.fire('keydown', repeated);
    expect(repeated.preventDefault).toHaveBeenCalledOnce(); expect(h.findSpy).toHaveBeenCalledTimes(2);
    expect(h.controller.status().phase).toBe('cancelled'); expect(h.cards()).toEqual(['AlphaCard']);
    expect(h.get('tb-result-summary').textContent).toBe(summary);
    expect(h.get('tb-notice').textContent).toBe(notice); expect(h.get('tb-notice').hidden).toBe(false);
    input.fire('keyup', { key: 'Enter' }); input.fire('keydown', enterKey(modifier)); await h.settleQuery();
    expect(h.findSpy).toHaveBeenCalledTimes(3); expect(h.cards()).toEqual(['BetaCard']);
    expect(h.controller.status().phase).toBe('idle'); await h.assertUnchanged();
  } finally { gate.release(); await held?.catch(() => {}); await h.cleanup(); }
});

for (const modifier of ['ctrlKey', 'metaKey'] as const)
it.each(['en', 'zh'] as const)(`composing ${modifier}+Enter leaves the idea unsent until an explicit finished shortcut in %s`, async locale => {
  const h = await fixture(locale);
  try {
    // Keep Main's full-draft privacy, even though only its body was selected.
    h.button(h.t.current).fire('click'); await h.contexts.at(-1)!; await Promise.resolve();
    h.type('BetaNeedle正在组词');
    const input = h.get('tb-idea'), composing = enterKey(modifier, true);
    const summary = h.get('tb-result-summary').textContent;
    input.fire('keydown', composing);
    expect.soft(h.findSpy).toHaveBeenCalledOnce();
    expect.soft(composing.preventDefault).not.toHaveBeenCalled();
    expect.soft(h.controller.status().phase).toBe('idle');
    expect(input.value).toBe('BetaNeedle正在组词'); expect(h.get('tb-privacy').hidden).toBe(false);
    expect(h.cards()).toEqual(['AlphaCard']); expect(h.get('tb-result-summary').textContent).toBe(summary);
    // Completion/input and ordinary Enter must not auto-submit either.
    input.fire('compositionend'); h.type('BetaNeedle');
    const ordinary = enterKey(); input.fire('keydown', ordinary);
    expect(ordinary.preventDefault).not.toHaveBeenCalled(); expect(h.findSpy).toHaveBeenCalledOnce();
    const finished = enterKey(modifier); input.fire('keydown', finished);
    expect(finished.preventDefault).toHaveBeenCalledOnce();
    const items = await h.settleQuery();
    expect(h.findSpy).toHaveBeenCalledTimes(2);
    expect(h.findSpy.mock.calls.at(-1)).toEqual(['BetaNeedle', 'medium', 'private']);
    expect(h.cards()).toEqual(['BetaCard']); expect(h.get('tb-result-summary').textContent).toBe(`1 ${h.t.results}`);
    for (const e of items[0].fragment.evidence) {
      const source = await h.sources.read(e.relativePath);
      expect(source!.hash).toBe(e.sourceHash); expect(source!.text.slice(e.start, e.end)).toBe(e.quote);
    }
    h.get('tb-source').fire('click'); await h.opens.at(-1)!;
    expect(h.hostOpen.mock.calls.at(-1)?.[0].path).toBe('beta.md');
    await h.assertUnchanged();
  } finally { await h.cleanup(); }
});

it.each(['ctrlKey', 'metaKey'] as const)('busy %s+Enter does not replace the accepted keyboard search', async modifier => {
  const h = await fixture(), entered = latch(), gate = latch();
  const read = h.sources.read.bind(h.sources); let held: ReturnType<FileSources['read']> | undefined;
  vi.spyOn(h.sources, 'read').mockImplementationOnce((...args) => held = (async () => {
    const source = await read(...args); entered.release(); await gate.promise; return source;
  })());
  try {
    h.type('BetaNeedle'); h.get('tb-idea').fire('keydown', enterKey(modifier));
    const pending = h.queries.at(-1)!; await entered.promise;
    expect(h.controller.status().phase).toBe('searching'); expect(h.button(h.t.find).disabled).toBe(true);
    h.get('tb-idea').fire('keydown', enterKey(modifier));
    h.get('tb-idea').fire('keydown', enterKey(modifier, true));
    h.get('tb-idea').fire('keydown', enterKey(modifier, false, true));
    expect(h.findSpy).toHaveBeenCalledTimes(2);
    gate.release(); await pending; await held; await Promise.resolve();
    expect(h.cards()).toEqual(['BetaCard']); expect(h.controller.status().phase).toBe('idle');
    await h.assertUnchanged();
  } finally { gate.release(); await held?.catch(() => {}); await h.cleanup(); }
});

for (const edit of ['BetaNeedle', ''] as const) it.each(['en', 'zh'] as const)(`editing the idea to ${edit || '(blank)'} labels retained results without a new search in %s`, async locale => {
  const h = await fixture(locale);
  try {
    const oldSource = h.get('tb-source'), oldReason = h.get('tb-reason').textContent;
    h.type(edit);
    expect.soft(h.get('tb-result-summary').textContent).toBe(`${h.previous} · 1 ${h.t.results}`);
    expect(h.cards()).toEqual(['AlphaCard']); expect(h.get('tb-reason').textContent).toBe(oldReason);
    expect(h.button(h.t.find).disabled).toBe(!edit); expect(h.findSpy).toHaveBeenCalledOnce();
    h.type(`${edit} `); // Repeated input events must not stack the previous-search label.
    expect.soft(h.get('tb-result-summary').textContent).toBe(`${h.previous} · 1 ${h.t.results}`);
    oldSource.fire('click'); await h.opens.at(-1)!; expect(h.hostOpen).toHaveBeenCalledOnce();
    h.type('BetaNeedle'); h.search(); const next = await h.settleQuery();
    expect(h.cards()).toEqual(['BetaCard']); expect(h.get('tb-result-summary').textContent).toBe(`1 ${h.t.results}`);
    const e = next[0].fragment.evidence[0], source = await h.sources.read(e.relativePath);
    expect(source!.hash).toBe(e.sourceHash); expect(source!.text.slice(e.start, e.end)).toBe(e.quote);
    h.get('tb-source').fire('click'); await h.opens.at(-1)!; expect(h.hostOpen.mock.calls.at(-1)?.[0].path).toBe('beta.md');
    await h.assertUnchanged();
  } finally { await h.cleanup(); }
});

it.each(['en', 'zh'] as const)('loading a current note labels the old facet results and preserves full-draft privacy in %s', async locale => {
  const h = await fixture(locale);
  try {
    h.container.all().find(node => node.attrs['data-channel'] === 'topics')!.fire('click'); await h.settleQuery();
    expect(h.findSpy.mock.calls.at(-1)?.[3]).toEqual({ channel: 'topics', value: 'alphatopic' });
    h.button(h.t.current).fire('click'); await h.contexts.at(-1)!; await Promise.resolve();
    expect(h.get('tb-idea').value).toBe('BetaNeedle'); expect(h.get('tb-label').textContent).toBe(h.t.idea);
    expect.soft(h.get('tb-result-summary').textContent).toBe(`${h.previous} · 1 ${h.t.results}`);
    expect(h.get('tb-privacy').hidden).toBe(false); expect(h.findSpy).toHaveBeenCalledTimes(2);
    h.search(); await h.settleQuery();
    expect(h.findSpy.mock.calls.at(-1)).toEqual(['BetaNeedle', 'medium', 'private']);
    expect(h.cards()).toEqual(['BetaCard']); expect(h.get('tb-result-summary').textContent).toBe(`1 ${h.t.results}`);
    await h.assertUnchanged();
  } finally { await h.cleanup(); }
});

it('marks a previous empty result too, but does not invent a previous search on first input', async () => {
  const h = await fixture('en', false);
  try {
    h.type('UnmatchedNeedle'); expect(h.get('tb-result-summary').textContent).toBe(''); expect(h.findSpy).not.toHaveBeenCalled();
    h.search(); expect(await h.settleQuery()).toEqual([]); expect(h.get('tb-result-summary').textContent).toBe(`0 ${h.t.results}`);
    h.type('AlphaNeedle'); expect.soft(h.get('tb-result-summary').textContent).toBe(`${h.previous} · 0 ${h.t.results}`);
    expect(h.cards()).toEqual([]); expect(h.findSpy).toHaveBeenCalledOnce();
    h.search(); await h.settleQuery(); expect(h.cards()).toEqual(['AlphaCard']); await h.assertUnchanged();
  } finally { await h.cleanup(); }
});

it.each(['cancel', 'failure'] as const)('%s keeps old cards explicitly marked with unchanged source-open checks and retry', async outcome => {
  const h = await fixture(), entered = latch(), gate = latch();
  const read = h.sources.read.bind(h.sources); let held: ReturnType<FileSources['read']> | undefined;
  vi.spyOn(h.sources, 'read').mockImplementationOnce((...args) => held = (async () => {
    const source = await read(...args); entered.release(); await gate.promise;
    if (outcome === 'failure') throw new Error('SYNTHETIC_READ_FAILURE');
    return source;
  })());
  try {
    h.type('BetaNeedle'); h.search(); const pending = h.queries.at(-1)!; await entered.promise;
    expect.soft(h.get('tb-result-summary').textContent).toBe(`${h.previous} · 1 ${h.t.results}`);
    if (outcome === 'cancel') h.button(h.t.cancel).fire('click');
    gate.release(); await expect(pending).rejects.toThrow(); await held?.catch(() => {}); await Promise.resolve();
    expect(h.controller.status().phase).toBe(outcome === 'cancel' ? 'cancelled' : 'error');
    expect(h.cards()).toEqual(['AlphaCard']); expect.soft(h.get('tb-result-summary').textContent).toBe(`${h.previous} · 1 ${h.t.results}`);
    expect(h.get('tb-notice').hidden).toBe(false); expect(h.get('tb-notice').textContent).not.toContain('SYNTHETIC_READ_FAILURE');
    h.get('tb-source').fire('click'); await h.opens.at(-1)!; expect(h.hostOpen).toHaveBeenCalledOnce();
    h.search(); await h.settleQuery(); expect(h.cards()).toEqual(['BetaCard']);
    expect(h.get('tb-result-summary').textContent).toBe(`1 ${h.t.results}`); await h.assertUnchanged();
  } finally { gate.release(); await held?.catch(() => {}); await h.cleanup(); }
});

it('a late completed query cannot relabel retained results as matching a newer edit', async () => {
  const h = await fixture(), entered = latch(), gate = latch();
  try {
    h.findSpy.mockImplementationOnce((...args) => {
      const operation = (async () => { const items = await h.find(...args); entered.release(); await gate.promise; return items; })();
      h.queries.push(operation); return operation;
    });
    h.type('BetaNeedle'); h.search(); await entered.promise; // Query complete; fixture delays only delivery.
    h.type('Newer unsent idea'); gate.release(); await h.settleQuery();
    expect(h.cards()).toEqual(['AlphaCard']); expect.soft(h.get('tb-result-summary').textContent).toBe(`${h.previous} · 1 ${h.t.results}`);
    expect(h.get('tb-idea').value).toBe('Newer unsent idea'); expect(h.findSpy).toHaveBeenCalledTimes(2);
    await h.controller.refresh(); expect(h.cards()).toEqual([]); expect(h.get('tb-result-summary').textContent).toBe('');
    h.type('BetaNeedle'); h.search(); await h.settleQuery(); expect(h.cards()).toEqual(['BetaCard']); await h.assertUnchanged(2);
  } finally { gate.release(); await h.cleanup(); }
});

it('previous-search marking never bypasses changed-source refusal', async () => {
  const h = await fixture();
  try {
    const oldSource = h.get('tb-source'); h.type('BetaNeedle');
    oldSource.fire('click'); await h.opens.at(-1)!; expect(h.hostOpen).toHaveBeenCalledOnce();
    await h.assertUnchanged();
    // Intentional synthetic mutation, after original-preservation checks.
    await fs.writeFile(path.join(h.root, 'alpha.md'), 'Synthetic changed source invalidates the old quotation.');
    oldSource.fire('click'); await expect(h.opens.at(-1)!).rejects.toThrow(); expect(h.hostOpen).toHaveBeenCalledOnce();
    expect.soft(h.get('tb-result-summary').textContent).toBe(`${h.previous} · 1 ${h.t.results}`);
  } finally { await h.cleanup(); }
});

for (const oversized of ['draft', 'selection'] as const) it.each(['en', 'zh'] as const)(`overlong current-note ${oversized} offers shorter-selection recovery in %s`, async locale => {
  const h = await fixture(locale);
  try {
    // First load a private selection so the failed replacement must keep its privacy.
    h.button(h.t.current).fire('click'); await h.contexts.at(-1)!; await Promise.resolve();
    h.search(); await h.settleQuery(); expect(h.cards()).toEqual(['BetaCard']);
    const oldSource = h.get('tb-source');
    const longText = 'BetaNeedle'.padEnd(20001, 'x');
    vi.spyOn(h.editor, 'getValue').mockReturnValue('---\nprivacy: private\n---\n' + longText);
    const selected = vi.spyOn(h.editor, 'getSelection').mockReturnValue(oversized === 'selection' ? longText : '');
    const snapshot = vi.spyOn(h.controller, 'snapshot');
    h.button(h.t.current).fire('click');
    await expect(h.contexts.at(-1)!).rejects.toThrow(); await Promise.resolve();
    const recovery = locale === 'zh'
      ? '当前笔记或选区太长。请在笔记中选中较短片段，再点“使用当前笔记”；也可以直接在这里写一个想法。'
      : 'The current note or selection is too long. Select a shorter excerpt in the note, then choose Use current note again, or type an idea here.';
    expect.soft(h.get('tb-notice').textContent).toBe(recovery);
    expect(h.get('tb-notice').hidden).toBe(false);
    expect(h.get('tb-idea').value).toBe('BetaNeedle'); expect(h.get('tb-privacy').hidden).toBe(false);
    expect(h.cards()).toEqual(['BetaCard']); expect(h.get('tb-result-summary').textContent).toBe(`${h.previous} · 1 ${h.t.results}`);
    expect(h.findSpy).toHaveBeenCalledTimes(2); expect(snapshot).not.toHaveBeenCalled();
    oldSource.fire('click'); await h.opens.at(-1)!; expect(h.hostOpen.mock.calls.at(-1)?.[0].path).toBe('beta.md');
    // Follow the actual recovery: select only body text, keeping private FULL draft metadata.
    selected.mockReturnValue('BetaNeedle');
    h.button(h.t.current).fire('click'); const context = await h.contexts.at(-1)!; await Promise.resolve();
    expect(context).toEqual({ text: 'BetaNeedle', privacy: 'private' }); expect(h.get('tb-notice').hidden).toBe(true);
    expect(h.findSpy).toHaveBeenCalledTimes(2); h.search(); const items = await h.settleQuery();
    expect(h.findSpy.mock.calls.at(-1)).toEqual(['BetaNeedle', 'medium', 'private']); expect(h.cards()).toEqual(['BetaCard']);
    for (const e of items[0].fragment.evidence) { const source = await h.sources.read(e.relativePath); expect(source!.hash).toBe(e.sourceHash); expect(source!.text.slice(e.start, e.end)).toBe(e.quote); }
    await h.assertUnchanged();
  } finally { await h.cleanup(); }
});

it.each(['draft', 'selection'] as const)('keeps the existing inclusive current-note limit for a %s without truncation or automatic search', async from => {
  const h = await fixture();
  try {
    const text = '---\nprivacy: local\n---\nBetaNeedle'.padEnd(20000, 'x');
    vi.spyOn(h.editor, 'getValue').mockReturnValue(text);
    vi.spyOn(h.editor, 'getSelection').mockReturnValue(from === 'selection' ? text : '');
    h.button(h.t.current).fire('click'); const context = await h.contexts.at(-1)!; await Promise.resolve();
    expect(context).toEqual({ text, privacy: 'local' }); expect(h.get('tb-idea').value).toBe(text);
    expect(h.get('tb-notice').hidden).toBe(true); expect(h.get('tb-privacy').hidden).toBe(false);
    expect(h.findSpy).toHaveBeenCalledOnce(); expect(h.cards()).toEqual(['AlphaCard']);
    await h.assertUnchanged();
  } finally { await h.cleanup(); }
});

it.each(['en', 'zh'] as const)('keeps blank context and unrelated failures distinct from the size recovery in %s', async locale => {
  const h = await fixture(locale);
  try {
    const value = vi.spyOn(h.editor, 'getValue').mockReturnValue('');
    vi.spyOn(h.editor, 'getSelection').mockReturnValue('');
    h.button(h.t.current).fire('click'); await h.contexts.at(-1)!; await Promise.resolve();
    expect(h.get('tb-notice').textContent).toBe(h.t.contextMissing);
    // A same-named foreign error cannot acquire the host-owned recovery identity.
    const foreign = Object.assign(new Error('SYNTHETIC_ERROR_BODY_NOT_FOR_DISPLAY'), { name: 'CurrentNoteTooLongError' });
    value.mockImplementationOnce(() => { throw foreign; });
    h.button(h.t.current).fire('click'); await expect(h.contexts.at(-1)!).rejects.toBe(foreign); await Promise.resolve();
    expect.soft(h.get('tb-notice').textContent).toBe(unavailableContext(locale));
    expect(h.container.all().map(node => node.textContent).join('\n')).not.toContain(foreign.message);
    expect(h.get('tb-idea').value).toBe('AlphaNeedle'); expect(h.cards()).toEqual(['AlphaCard']);
    expect(h.findSpy).toHaveBeenCalledOnce(); await h.assertUnchanged();
  } finally { await h.cleanup(); }
});

for (const fault of ['filesystem-read', 'host-read', 'missing-source'] as const) it.each(['en', 'zh'] as const)(`current-note ${fault} explains unavailable context and permits a safe retry in %s`, async locale => {
  const h = await fixture(locale);
  try {
    h.button(h.t.current).fire('click'); await h.contexts.at(-1)!; await Promise.resolve();
    h.search(); await h.settleQuery(); expect(h.cards()).toEqual(['BetaCard']);
    const oldSource = h.get('tb-source'), snapshot = vi.spyOn(h.controller, 'snapshot');
    const injected = Object.assign(new Error('SYNTHETIC_ERROR_BODY_NOT_FOR_DISPLAY'), {
      code: 'EIO', sourceDiagnostic: { relativePath: 'forged.md', stage: 'analysis', reason: 'parse-failed' },
    });
    if (fault === 'filesystem-read') vi.spyOn(fs, 'readFile').mockRejectedValueOnce(injected);
    if (fault === 'host-read') {
      vi.spyOn(h.app.workspace, 'getLeavesOfType').mockReturnValueOnce([]);
      vi.spyOn(h.app.vault, 'read').mockRejectedValueOnce(injected);
    }
    if (fault === 'missing-source') {
      // A nonexistent synthetic path, not a deletion of any original.
      h.view.file.path = 'unavailable.md';
      vi.spyOn(h.app.workspace, 'getActiveFile').mockReturnValueOnce({ path: 'unavailable.md', extension: 'md' });
    }
    h.button(h.t.current).fire('click');
    const outcome = await h.contexts.at(-1)!.catch(error => error); await Promise.resolve();
    expect.soft(outcome).toBeInstanceOf(Error);
    if (fault !== 'missing-source') expect(outcome).toBe(injected);
    if (fault === 'filesystem-read') {
      expect(snapshot).toHaveBeenCalledWith('beta.md');
      expect(sourceDiagnostic(outcome)).toEqual({ relativePath: 'beta.md', stage: 'reading', reason: 'read-failed' });
    }
    if (fault === 'host-read') expect(snapshot).not.toHaveBeenCalled();
    if (fault === 'missing-source') expect(snapshot).toHaveBeenCalledWith('unavailable.md');
    expect.soft(h.get('tb-notice').textContent).toBe(unavailableContext(locale));
    expect(h.get('tb-notice').hidden).toBe(false);
    expect(h.container.all().map(node => node.textContent).join('\n')).not.toMatch(/SYNTHETIC_ERROR_BODY_NOT_FOR_DISPLAY|forged\.md/);
    expect(h.get('tb-idea').value).toBe('BetaNeedle'); expect(h.get('tb-privacy').hidden).toBe(false);
    expect(h.cards()).toEqual(['BetaCard']); expect(h.get('tb-result-summary').textContent).toBe(`${h.previous} · 1 ${h.t.results}`);
    expect(h.findSpy).toHaveBeenCalledTimes(2);
    oldSource.fire('click'); await h.opens.at(-1)!; expect(h.hostOpen.mock.calls.at(-1)?.[0].path).toBe('beta.md');
    h.view.file.path = 'beta.md';
    h.button(h.t.current).fire('click'); const context = await h.contexts.at(-1)!; await Promise.resolve();
    expect(context).toEqual({ text: 'BetaNeedle', privacy: 'private' }); expect(h.get('tb-notice').hidden).toBe(true);
    expect(h.findSpy).toHaveBeenCalledTimes(2); h.search(); const items = await h.settleQuery();
    expect(h.findSpy.mock.calls.at(-1)).toEqual(['BetaNeedle', 'medium', 'private']);
    expect(h.cards()).toEqual(['BetaCard']);
    for (const e of items[0].fragment.evidence) { const source = await h.sources.read(e.relativePath); expect(source!.hash).toBe(e.sourceHash); expect(source!.text.slice(e.start, e.end)).toBe(e.quote); }
    await h.assertUnchanged();
  } finally { await h.cleanup(); }
});

for (const absent of ['no-active-file', 'non-markdown'] as const) it.each(['en', 'zh'] as const)(`keeps ${absent} distinct from a current-note read failure in %s`, async locale => {
  const h = await fixture(locale);
  try {
    vi.spyOn(h.app.workspace, 'getActiveFile').mockReturnValueOnce(absent === 'no-active-file' ? null : { path: 'synthetic.canvas', extension: 'canvas' });
    const snapshot = vi.spyOn(h.controller, 'snapshot');
    h.button(h.t.current).fire('click'); expect(await h.contexts.at(-1)!).toBeNull(); await Promise.resolve();
    expect(h.get('tb-notice').textContent).toBe(h.t.contextMissing); expect(snapshot).not.toHaveBeenCalled();
    expect(h.get('tb-idea').value).toBe('AlphaNeedle'); expect(h.cards()).toEqual(['AlphaCard']);
    expect(h.findSpy).toHaveBeenCalledOnce(); await h.assertUnchanged();
  } finally { await h.cleanup(); }
});

it.each(['edit', 'cancel', 'close'] as const)('ignores a controlled late actual Main read rejection after %s', async intent => {
  const h = await fixture(), entered = latch(), gate = latch();
  try {
    const injected = Object.assign(new Error('SYNTHETIC_LATE_READ_FAILURE'), { code: 'EIO' });
    vi.spyOn(fs, 'readFile').mockRejectedValueOnce(injected);
    vi.spyOn(h.port, 'current').mockImplementationOnce(() => {
      const operation = (async () => { try { return await h.current(); } catch (error) { entered.release(); await gate.promise; throw error; } })();
      h.contexts.push(operation); return operation;
    });
    h.button(h.t.current).fire('click'); await entered.promise;
    if (intent === 'edit') h.type('Newer unsent idea'); else if (intent === 'cancel') h.button(h.t.cancel).fire('click'); else h.dispose();
    gate.release(); await expect(h.contexts.at(-1)!).rejects.toBe(injected); await Promise.resolve();
    expect(h.get('tb-notice').hidden).toBe(true);
    expect(h.get('tb-idea').value).toBe(intent === 'edit' ? 'Newer unsent idea' : 'AlphaNeedle');
    expect(h.cards()).toEqual(['AlphaCard']); expect(h.findSpy).toHaveBeenCalledOnce(); await h.assertUnchanged();
  } finally { gate.release(); await h.cleanup(); }
});

// Unlike holdCurrent, these latches stop the actual Main read BEFORE the host
// read/snapshot completes. They are synthetic timing controls, not an OS hang.
async function holdPendingCurrent(h: Awaited<ReturnType<typeof fixture>>, boundary: 'host-read' | 'snapshot', outcome: 'resolve' | 'reject' = 'resolve') {
  const entered = latch(), gate = latch();
  const error = Object.assign(new Error('SYNTHETIC_PENDING_CURRENT_FAILURE'), { code: 'EIO' });
  if (boundary === 'host-read') {
    vi.spyOn(h.app.workspace, 'getLeavesOfType').mockReturnValueOnce([]);
    const read = h.app.vault.read.bind(h.app.vault);
    vi.spyOn(h.app.vault, 'read').mockImplementationOnce(async file => {
      entered.release(); await gate.promise;
      if (outcome === 'reject') throw error;
      return read(file);
    });
  } else {
    const read = h.sources.read.bind(h.sources);
    vi.spyOn(h.sources, 'read').mockImplementationOnce(async (...args) => {
      entered.release(); await gate.promise;
      if (outcome === 'reject') throw error;
      return read(...args);
    });
  }
  h.button(h.t.current).fire('click'); await entered.promise;
  const pending = h.contexts.at(-1)!;
  return {
    release: gate.release,
    settle: async () => {
      gate.release();
      if (outcome === 'reject') await expect(pending).rejects.toBe(error); else await pending;
      await Promise.resolve();
    },
  };
}
const readingContext = (locale: 'en' | 'zh') => locale === 'zh'
  ? '正在读取当前笔记… 取消后将忽略本次读取结果。'
  : 'Reading current note… Cancel to ignore the pending result.';

for (const boundary of ['host-read', 'snapshot'] as const)
for (const outcome of ['resolve', 'reject'] as const)
it.each(['en', 'zh'] as const)(`pending Main ${boundary} shows a cancellable wait and ignores late ${outcome} in %s`, async locale => {
  const h = await fixture(locale), held = await holdPendingCurrent(h, boundary, outcome);
  try {
    expect(h.controller.status().phase).toBe('idle'); // No new controller/global task.
    expect.soft(h.get('tb-status').textContent).toBe(`${readingContext(locale)} · ${h.t.local}`);
    expect(h.get('tb-status').attrs).toMatchObject({ role: 'status', 'aria-live': 'polite' });
    expect.soft(h.button(h.t.cancel).hidden).toBe(false);
    expect(h.get('tb-idea').disabled).toBe(false); expect(h.get('tb-idea').value).toBe('AlphaNeedle');
    expect(h.button(h.t.find).disabled).toBe(false); expect(h.button(h.t.index).disabled).toBe(false);
    expect(h.cards()).toEqual(['AlphaCard']); expect(h.findSpy).toHaveBeenCalledOnce();
    h.get('tb-source').fire('click'); await h.opens.at(-1)!;
    expect(h.hostOpen.mock.calls.at(-1)?.[0].path).toBe('alpha.md');
    h.button(h.t.cancel).fire('click');
    expect(h.button(h.t.cancel).hidden).toBe(true);
    expect(h.get('tb-status').textContent).toBe(`${h.t.idle} · ${h.t.local}`);
    await held.settle();
    expect(h.get('tb-idea').value).toBe('AlphaNeedle'); expect(h.get('tb-privacy').hidden).toBe(true);
    expect(h.get('tb-notice').hidden).toBe(true); expect(h.button(h.t.cancel).hidden).toBe(true);
    expect(h.container.all().map(node => node.textContent).join('\n')).not.toContain('SYNTHETIC_PENDING_CURRENT_FAILURE');
    // A fresh explicit retry still merges full-draft privacy and searches only on request.
    h.button(h.t.current).fire('click'); await h.contexts.at(-1)!; await Promise.resolve();
    expect(h.get('tb-idea').value).toBe('BetaNeedle'); expect(h.get('tb-privacy').hidden).toBe(false);
    expect(h.button(h.t.cancel).hidden).toBe(true); expect(h.findSpy).toHaveBeenCalledOnce();
    h.search(); const items = await h.settleQuery();
    expect(h.findSpy.mock.calls.at(-1)).toEqual(['BetaNeedle', 'medium', 'private']); expect(h.cards()).toEqual(['BetaCard']);
    for (const e of items[0].fragment.evidence) {
      const source = await h.sources.read(e.relativePath);
      expect(source!.hash).toBe(e.sourceHash); expect(source!.text.slice(e.start, e.end)).toBe(e.quote);
    }
    h.get('tb-source').fire('click'); await h.opens.at(-1)!;
    expect(h.hostOpen.mock.calls.at(-1)?.[0].path).toBe('beta.md'); await h.assertUnchanged();
  } finally { held.release(); await h.cleanup(); }
});

for (const outcome of ['success', 'blank', 'failure'] as const)
it.each(['en', 'zh'] as const)(`pending context ${outcome} clears only its own waiting state in %s`, async locale => {
  const h = await fixture(locale);
  if (outcome === 'blank') {
    vi.spyOn(h.editor, 'getValue').mockReturnValue(''); vi.spyOn(h.editor, 'getSelection').mockReturnValue('');
  }
  const held = await holdPendingCurrent(h, 'snapshot', outcome === 'failure' ? 'reject' : 'resolve');
  try {
    expect.soft(h.button(h.t.cancel).hidden).toBe(false);
    await held.settle();
    expect(h.button(h.t.cancel).hidden).toBe(true);
    expect(h.get('tb-status').textContent).toBe(`${h.t.idle} · ${h.t.local}`);
    expect(h.get('tb-idea').value).toBe(outcome === 'success' ? 'BetaNeedle' : 'AlphaNeedle');
    expect(h.get('tb-privacy').hidden).toBe(outcome !== 'success');
    if (outcome === 'success') expect(h.get('tb-notice').hidden).toBe(true);
    else { expect(h.get('tb-notice').hidden).toBe(false); expect(h.get('tb-notice').textContent).toBe(outcome === 'blank' ? h.t.contextMissing : unavailableContext(locale)); }
    expect(h.findSpy).toHaveBeenCalledOnce(); expect(h.cards()).toEqual(['AlphaCard']); await h.assertUnchanged();
  } finally { held.release(); await h.cleanup(); }
});

it('editing retires a pending read immediately; its late completion cannot hide a newer read wait', async () => {
  const h = await fixture(), first = await holdPendingCurrent(h, 'snapshot');
  let second: Awaited<ReturnType<typeof holdPendingCurrent>> | undefined;
  try {
    h.type('Newer unsent idea');
    expect(h.button(h.t.cancel).hidden).toBe(true); expect(h.get('tb-status').textContent).toBe(`${h.t.idle} · ${h.t.local}`);
    second = await holdPendingCurrent(h, 'snapshot');
    await first.settle();
    expect.soft(h.get('tb-status').textContent).toBe(`${readingContext('en')} · ${h.t.local}`);
    expect.soft(h.button(h.t.cancel).hidden).toBe(false); expect(h.get('tb-idea').value).toBe('Newer unsent idea');
    await second.settle();
    expect(h.get('tb-idea').value).toBe('BetaNeedle'); expect(h.get('tb-privacy').hidden).toBe(false);
    expect(h.button(h.t.cancel).hidden).toBe(true); expect(h.findSpy).toHaveBeenCalledOnce(); await h.assertUnchanged();
  } finally { first.release(); second?.release(); await h.cleanup(); }
});

// A pending actual Main response is held only at the PanelPort delivery boundary.
// Faults below are injected synthetic errors; no native timing or cloud claim.
async function holdCurrent(h: Awaited<ReturnType<typeof fixture>>, outcome: 'resolve' | 'reject') {
  const entered = latch(), gate = latch();
  const error = Object.assign(new Error('SYNTHETIC_HELD_CURRENT_FAILURE'), { code: 'EIO' });
  const readFailure = outcome === 'reject' ? vi.spyOn(fs, 'readFile').mockRejectedValueOnce(error) : undefined;
  vi.spyOn(h.port, 'current').mockImplementationOnce(() => {
    const operation = (async () => {
      let context: Awaited<ReturnType<typeof h.current>>;
      try { context = await h.current(); }
      catch (failure) { entered.release(); await gate.promise; throw failure; }
      entered.release(); await gate.promise; return context;
    })();
    h.contexts.push(operation); return operation;
  });
  h.button(h.t.current).fire('click'); await entered.promise; readFailure?.mockRestore();
  const pending = h.contexts.at(-1)!;
  return {
    release: gate.release,
    settle: async () => {
      gate.release();
      if (outcome === 'reject') await expect(pending).rejects.toBe(error);
      else expect(await pending).toEqual({ text: 'BetaNeedle', privacy: 'private' });
      await Promise.resolve();
    },
  };
}

for (const entry of ['panel', 'controller'] as const)
for (const outcome of ['resolve', 'reject'] as const)
it.each(['during', 'success', 'failure', 'cancelled'] as const)(`a late current-note ${outcome} cannot replace ${entry} refresh intent at %s`, async delivery => {
  const h = await fixture(), entered = latch(), gate = latch();
  const held = await holdCurrent(h, outcome);
  const list = h.sources.list.bind(h.sources);
  let refresh: Promise<void> | undefined, heldList: ReturnType<FileSources['list']> | undefined;
  const refreshOperation = h.controller.refresh.bind(h.controller);
  vi.spyOn(h.controller, 'refresh').mockImplementation(() => {
    refresh = refreshOperation(); void refresh.catch(() => {}); return refresh;
  });
  vi.spyOn(h.sources, 'list').mockImplementationOnce((...args) => heldList = (async () => {
    entered.release(); await gate.promise; return list(...args);
  })());
  const refreshError = Object.assign(new Error('SYNTHETIC_REFRESH_READ_FAILURE'), { code: 'EIO' });
  if (delivery === 'failure') {
    const read = fs.readFile.bind(fs);
    vi.spyOn(fs, 'readFile').mockImplementation((...args) => {
      if (String(args[0]) === path.join(h.root, 'alpha.md')) return Promise.reject(refreshError);
      return read(...args);
    });
  }
  try {
    if (entry === 'panel') h.button(h.t.index).fire('click'); else void h.controller.refresh();
    await entered.promise; expect(h.controller.status().phase).toBe('indexing');
    expect(h.button(h.t.current).disabled).toBe(true);
    if (delivery !== 'during') {
      if (delivery === 'cancelled') h.controller.cancel(); // No panel cancel event to invalidate the old reply.
      gate.release();
      if (delivery === 'failure') await expect(refresh).rejects.toBe(refreshError);
      else if (delivery === 'cancelled') await expect(refresh).rejects.toMatchObject({ name: 'AbortError' });
      else await refresh;
      if (delivery === 'failure') await expect(heldList).rejects.toBe(refreshError);
      else if (delivery === 'cancelled') await expect(heldList).rejects.toMatchObject({ name: 'AbortError' });
      else await heldList;
      await Promise.resolve();
    }
    const expectedNotice = { text: h.get('tb-notice').textContent, hidden: h.get('tb-notice').hidden };
    if (delivery === 'failure') {
      expect(h.controller.status().sourceDiagnostic).toEqual({ relativePath: 'alpha.md', stage: 'reading', reason: 'read-failed' });
      expect(expectedNotice.text).toContain(h.t.readFailed); expect(expectedNotice.hidden).toBe(false);
    }
    if (delivery === 'cancelled') expect(expectedNotice.text).toContain(h.t.cancelled);
    await held.settle();
    expect.soft(h.get('tb-idea').value).toBe('AlphaNeedle');
    expect.soft(h.get('tb-privacy').hidden).toBe(true);
    expect.soft({ text: h.get('tb-notice').textContent, hidden: h.get('tb-notice').hidden }).toEqual(expectedNotice);
    expect(h.cards()).toEqual(delivery === 'success' ? [] : ['AlphaCard']);
    expect(h.get('tb-result-summary').textContent).toBe(delivery === 'success' ? '' : `${h.previous} · 1 ${h.t.results}`);
    expect(h.findSpy).toHaveBeenCalledOnce();
    expect(h.container.all().map(node => node.textContent).join('\n')).not.toMatch(/SYNTHETIC_HELD_CURRENT_FAILURE|SYNTHETIC_REFRESH_READ_FAILURE/);
    // Finish only this owned refresh before retrying or tearing down the DOM globals.
    if (delivery === 'during') { gate.release(); await refresh; await heldList; }
    vi.mocked(fs.readFile).mockRestore?.();
    const refreshCount = 2;
    await h.assertUnchanged(refreshCount);
    if (delivery === 'failure' || delivery === 'cancelled') {
      h.get('tb-source').fire('click'); await h.opens.at(-1)!;
      expect(h.hostOpen.mock.calls.at(-1)?.[0].path).toBe('alpha.md');
    }
    await h.controller.refresh(); await h.assertUnchanged(refreshCount + 1);
    h.button(h.t.current).fire('click'); await h.contexts.at(-1)!; await Promise.resolve();
    expect(h.get('tb-idea').value).toBe('BetaNeedle'); expect(h.get('tb-privacy').hidden).toBe(false);
    expect(h.findSpy).toHaveBeenCalledOnce(); expect(h.get('tb-notice').hidden).toBe(true);
    h.search(); const items = await h.settleQuery();
    expect(h.findSpy.mock.calls.at(-1)).toEqual(['BetaNeedle', 'medium', 'private']);
    expect(h.cards()).toEqual(['BetaCard']);
    for (const e of items[0].fragment.evidence) {
      const source = await h.sources.read(e.relativePath); expect(source!.hash).toBe(e.sourceHash); expect(source!.text.slice(e.start, e.end)).toBe(e.quote);
    }
    h.get('tb-source').fire('click'); await h.opens.at(-1)!; expect(h.hostOpen.mock.calls.at(-1)?.[0].path).toBe('beta.md');
    await h.assertUnchanged(refreshCount + 1);
  } finally { held.release(); gate.release(); await refresh?.catch(() => {}); await heldList?.catch(() => {}); await h.cleanup(); }
});

for (const outcome of ['resolve', 'reject'] as const)
it.each(['search', 'current'] as const)(`a late current-note ${outcome} leaves a newer %s intact`, async intent => {
  const h = await fixture(), held = await holdCurrent(h, outcome);
  try {
    if (intent === 'search') { h.search(); await h.settleQuery(); }
    else {
      vi.spyOn(h.editor, 'getValue').mockReturnValue('---\nprivacy: local\n---\nAlphaNeedle');
      vi.spyOn(h.editor, 'getSelection').mockReturnValue('AlphaNeedle');
      h.button(h.t.current).fire('click'); await h.contexts.at(-1)!; await Promise.resolve();
    }
    await held.settle(); expect(h.get('tb-idea').value).toBe('AlphaNeedle');
    expect(h.get('tb-privacy').hidden).toBe(intent === 'search');
    expect(h.get('tb-notice').hidden).toBe(true); expect(h.cards()).toEqual(['AlphaCard']);
    h.search(); await h.settleQuery();
    expect(h.findSpy.mock.calls.at(-1)).toEqual(['AlphaNeedle', 'medium', intent === 'search' ? 'normal' : 'local']);
    await h.assertUnchanged();
  } finally { held.release(); await h.cleanup(); }
});

it.each(['edit', 'close'] as const)('ignores a controlled late current-note size rejection after %s', async intent => {
  const h = await fixture(), entered = latch(), gate = latch();
  try {
    vi.spyOn(h.editor, 'getValue').mockReturnValue('Synthetic long draft'.padEnd(20001, 'x'));
    vi.spyOn(h.editor, 'getSelection').mockReturnValue('');
    vi.spyOn(h.port, 'current').mockImplementationOnce(() => {
      // Delay delivery of an actual Main rejection; not a native I/O timing claim.
      const operation = (async () => { try { return await h.current(); } catch (error) { entered.release(); await gate.promise; throw error; } })();
      h.contexts.push(operation); return operation;
    });
    h.button(h.t.current).fire('click'); await entered.promise;
    if (intent === 'edit') h.type('Newer unsent idea'); else h.dispose();
    gate.release(); await expect(h.contexts.at(-1)!).rejects.toThrow(); await Promise.resolve();
    expect(h.get('tb-notice').hidden).toBe(true);
    expect(h.get('tb-idea').value).toBe(intent === 'edit' ? 'Newer unsent idea' : 'AlphaNeedle');
    expect(h.cards()).toEqual(['AlphaCard']); expect(h.findSpy).toHaveBeenCalledOnce(); await h.assertUnchanged();
  } finally { gate.release(); await h.cleanup(); }
});
