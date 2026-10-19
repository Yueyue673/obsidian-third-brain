// SPDX-License-Identifier: MIT
// Authored synthetic file journeys, not AI semantics or native host clicks.
// Paragraph continuations can omit quote/list prefixes:
// https://spec.commonmark.org/0.31.2/#lazy-continuation-line
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { MarkdownView } from 'obsidian';
import ThirdBrainPlugin from '../src/main';
import { analyzeSource, prepareSource } from '../src/core';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { hasReadableQuote, textBlocks } from '../src/core/sources';
import type { IndexState, SearchResult } from '../src/core/types';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
import { CORE_REVISION, digest } from '../src/core/util';
vi.mock('obsidian', () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, MarkdownView: class {} }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-lazy-legacy.json', 'utf8'));
const options = { mode: 'local-excerpts' as const, cloudConsent: false };
const snap = (raw: string, name = 'synthetic.md') => prepareSource(name, raw, hash(raw), hash(name).slice(0, 24));
const canvas = (raw: string) => JSON.stringify({ nodes: [{ type: 'text', text: '---\nprivacy: private\n---\n' + raw }], edges: [] });
const action = 'Turn the copper memory dial.';
const lazy = 'and never while the violet vent is open:';
const group = '- Only while the inert inlet is sealed\n' + lazy + '\n  - ' + action;
const quote = (raw: string) => raw.split('\n').map((row, i) => i === 1 ? row : '> ' + row).join('\n');
const late = 'Silver spool records retain their dry felt restriction and damp felt counterexample.';
const document = (quoted: boolean) => '# Synthetic scope\n\n' + (quoted ? quote(group) : group) + '\n\n' + late;
for (const ext of ['md', 'canvas']) for (const quoted of [false, true]) {
  it(`${ext} ${quoted ? 'quoted' : 'plain'} lazy parent retains the complete condition while the following paragraph stays independent`, async () => {
    const scope = path.resolve('.local/lazy-list'); await fs.mkdir(scope, { recursive: true }); const root = await fs.mkdtemp(path.join(scope, 'vault-'));
    const source = ext === 'md' ? document(quoted) : JSON.stringify({ nodes: [{ type: 'text', text: '---\nprivacy: private\n---\n' + document(quoted) }], edges: [] });
    await fs.writeFile(path.join(root, 'source.' + ext), source);
    const settings = { ...defaults, outputFolder: 'Derived', excludes: [] }, store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
    const c = new ThirdBrainController(sources, store, () => settings, () => undefined, async () => {});
    try {
      await c.initialize(); await c.refresh(); await c.initialize(); const index = (await store.load())!;
      const hits = await c.find('copper memory dial', 'medium'); expect(hits).toHaveLength(1);
      expect(hits[0].fragment.summary).toContain('Only while the inert inlet is sealed');
      expect(hits[0].fragment.summary).toContain(lazy); expect(hits[0].fragment.summary).not.toContain(late);
      const tail = await c.find('Silver spool', 'medium'); expect(tail).toHaveLength(1); expect(tail[0].fragment.summary).not.toContain(lazy);
      for (const e of hits[0].fragment.evidence) await c.verifyOpen(e);
      expect(Object.values(index.fragments).some(f => f.summary.includes(action))).toBe(true);
      expect(await fs.readFile(path.join(root, 'source.' + ext), 'utf8')).toBe(source);
    } finally { c.dispose(); }
  });
}
it('ordinary lazy task text remains an exact local excerpt without fabricating facets', async () => {
  const raw = '- [x] Prepare the inert chamber\nonly after the cobalt inlet is sealed.\n- Drain the violet chamber.';
  const s = prepareSource('synthetic.md', raw, hash(raw), hash('synthetic.md').slice(0, 24));
  const result = await analyzeSource(s, { mode: 'local-excerpts', cloudConsent: false });
  expect(result.fragments).toHaveLength(1); expect(result.fragments[0].summary).toBe(raw); expect(result.fragments[0].facets).toEqual({ topics: [], concepts: [], mechanisms: [], atmosphere: [] });
});

it('retains plain lazy quoted-list context exactly for LF/CRLF/CR, including trailing restrictions and a continued introduction', async () => {
  for (const raw of [quote(group), '> - ' + action + '\nOnly while the inert inlet is sealed.', '> Only in the inert rig,\nnever on live equipment:\n> - ' + action, '> - ' + action + '\n2. This is paragraph continuation, not an interrupting first list item.\n>   - Example: inert mock equipment.']) {
    for (const newline of ['\n', '\r\n', '\r']) {
      const input = raw.replace(/\n/gu, newline), result = await analyzeSource(snap(input), options);
      expect(result.fragments).toHaveLength(1); expect(result.fragments[0].summary).toBe(input);
      for (const e of result.fragments[0].evidence) expect(input.slice(e.start, e.end)).toBe(e.quote);
    }
  }
  const chinese = '> - 仅在合成阀门完全关闭时\n并且蓝色通风口没有打开：\n>   - 旋转青铜记忆旋钮。';
  const result = await analyzeSource(snap(chinese), options); expect(result.fragments[0].summary).toBe(chinese);
});

it('keeps a real blank/heading/list/rule/fence boundary and Canvas node separation; ordinary inline syntax outside the list survives', async () => {
  for (const boundary of ['\n\n', '\n# Independent section\n', '\n---\n', '\n```\nSynthetic code.\n```\n']) {
    const result = await analyzeSource(snap(quote(group) + boundary + late), options);
    expect(result.fragments.find(f => f.summary.includes(action))!.summary).not.toContain(late);
    expect(result.fragments.find(f => f.summary.includes(late))!.summary).not.toContain(lazy);
  }
  const independent = '- Independent jade ledger records the paper texture.';
  const result = await analyzeSource(snap(quote(group) + '\n' + independent), options);
  expect(result.fragments.find(f => f.summary.includes('jade ledger'))!.summary).toBe(independent);
  const literal = 'Literal `<!--` and `%%` syntax examples remain ordinary prose.';
  expect((await analyzeSource(snap(quote(group) + '\n\n' + literal), options)).fragments.some(f => f.summary === literal)).toBe(true);
  const nodes = JSON.stringify({ nodes: [{ type: 'text', text: quote(group) }, { type: 'text', text: late }], edges: [] });
  const split = (await analyzeSource(snap(nodes, 'synthetic.canvas'), options)).fragments;
  expect(split.find(f => f.summary.includes(late))!.summary).toBe(late);
  const blank = '> - Remember the amber paper texture.\n>\n' + late;
  expect((await analyzeSource(snap(blank), options)).fragments.find(f => f.summary.includes(late))!.summary).toBe(late);
});

it('refuses hidden first parents, lazy rows and unsupported nested/code/rule boundaries instead of publishing partial context', async () => {
  for (const marker of ['<!-- hidden -->', '%% hidden %%']) {
    for (const raw of [quote(group).replace('Only while', marker + ' Only while'), quote(group).replace(lazy, lazy + marker), quote(group) + '\n>   - ' + marker + ' Hidden synthetic descendant.']) await expect(analyzeSource(snap(raw), options)).rejects.toThrow();
  }
  for (const boundary of ['> ```\n> Synthetic code.\n> ```', '> ---', '> > Nested synthetic quote.']) await expect(analyzeSource(snap(quote(group) + '\n' + boundary), options)).rejects.toThrow();
});

it('retains long later conditions, enforces the complete 16384-unit bound and leaves AI parsing/signatures unchanged', async () => {
  const expanded = (quote(group) + '\n>     - Example: ' + 'The disconnected mock selector retains its inert paper sleeve. '.repeat(40)).trimEnd();
  expect(expanded.length).toBeGreaterThan(1400); expect((await analyzeSource(snap(expanded), options)).fragments[0].summary).toBe(expanded);
  const start = quote(group), legal = start + '合'.repeat(16384 - start.length);
  expect((await analyzeSource(snap(legal), options)).fragments[0].summary).toBe(legal);
  await expect(analyzeSource(snap(legal + '尾'), options)).rejects.toThrow();
  expect(generationSignature({ ...defaults, outputFolder: 'Derived' })).not.toBe(legacy.signatures['local-excerpts']);
  for (const mode of ['local-model', 'cloud-model'] as const) expect(generationSignature({ ...defaults, outputFolder: 'Derived', mode })).toBe(legacy.signatures[mode]);
  for (const [name, raw] of Object.entries(legacy.raws as Record<string, string>)) expect(hash(JSON.stringify(textBlocks(snap(raw, name))))).toBe(legacy.blockHashes[name]);
});

async function fixture(ext: string, frozenLayout = false) {
  const scope = path.resolve('.local/lazy-list'); await fs.mkdir(scope, { recursive: true }); const root = await fs.mkdtemp(path.join(scope, ext + '-'));
  const originals = new Map<string, { text: string; mtime: string }>();
  const put = async (name: string, text: string) => { await fs.writeFile(path.join(root, name), text); originals.set(name, { text, mtime: (await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString() }); };
  for (const [name, raw] of Object.entries(legacy.raws as Record<string, string>)) {
    // Keep long-note coverage and all target/independent text, but do not
    // multiply unrelated generated prefix cards in every Main callback case.
    // Only the legacy upgrade uses the exact captured historical layout.
    const body = frozenLayout ? raw : raw.replace(/\n\n(?=Archive entry [1-3] records)/gu, ' ');
    expect(body.indexOf(action)).toBeGreaterThan(1400); expect(body.indexOf(action)).toBeGreaterThan(body.length / 2);
    await put(name.replace('.md', '.' + ext), ext === 'md' ? body : canvas(body));
  }
  await fs.mkdir(path.join(root, 'Derived')); await put('Derived/manual.txt', 'Synthetic human-owned file, not generated.');
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] as string[] }, store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const factory = vi.fn(() => undefined), c = new ThirdBrainController(sources, store, () => settings, factory, async () => {});
  const protectedFiles = async () => { for (const [name, original] of originals) { expect(await fs.readFile(path.join(root, name), 'utf8')).toBe(original.text); expect((await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString()).toBe(original.mtime); } expect(factory.mock.results.every(r => r.value === undefined)).toBe(true); };
  const targets = async () => { const index = (await store.load())!; const names = ['Derived/.third-brain/state.json']; for (const id of Object.keys(index.fragments)) names.push(await store.fragmentPath(id)); return Promise.all(names.map(async name => ({ name, bytes: await fs.readFile(path.join(root, name)), mtime: (await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString() }))); };
  const unchanged = async (before: Awaited<ReturnType<typeof targets>>) => { for (const file of before) { expect(await fs.readFile(path.join(root, file.name))).toEqual(file.bytes); expect((await fs.stat(path.join(root, file.name), { bigint: true })).mtimeNs.toString()).toBe(file.mtime); } };
  return { root, originals, put, settings, store, sources, c, protectedFiles, targets, unchanged };
}

it('actual frozen legacy state loads byte-preserving, upgrades once with complete opposing contexts/history and reruns without writes', async () => {
  const f = await fixture('md', true); try {
    const inputs = await f.sources.list(); await f.store.commit(structuredClone(legacy.old) as IndexState, () => f.sources.verify(inputs));
    const old = await f.targets(); await f.c.initialize(); expect(await f.store.load()).toEqual(legacy.old); await f.unchanged(old);
    const commit = vi.spyOn(f.store, 'commit'); await f.c.refresh(); expect(commit).toHaveBeenCalledTimes(1); await f.c.initialize();
    const hits = await f.c.find('copper memory dial', 'medium'); expect(hits).toHaveLength(2); expect(hits.every(r => r.fragment.summary.includes(lazy))).toBe(true);
    expect(hits.find(r => r.fragment.summary.includes('inert inlet is sealed'))!.fragment.evidence.filter(e => e.quote.includes(action))).toHaveLength(2);
    expect(hits.find(r => r.fragment.summary.includes('inert inlet is open'))).toBeDefined();
    const index = (await f.store.load())!; expect(index.signature).not.toBe(legacy.old.signature);
    expect(index.signature).toBe(`${CORE_REVISION}:${digest(JSON.stringify({ generation: generationSignature(f.settings), mode: 'local-excerpts', cloudConsent: false }))}`);
    const history = await fs.readdir(path.join(f.root, 'Derived/.third-brain/history'), { recursive: true, withFileTypes: true }); const bodies = await Promise.all(history.filter(v => v.isFile()).map(v => fs.readFile(path.join(v.parentPath, v.name))));
    for (const file of old.filter(v => v.name.includes('fragment-') && !Object.keys(index.fragments).some(id => v.name.endsWith('fragment-' + id.slice(2) + '.md')))) expect(bodies.some(b => b.equals(file.bytes))).toBe(true);
    const before = await f.targets(); await f.c.refresh(); await f.unchanged(before); await f.protectedFiles();
  } finally { f.c.dispose(); }
});

class Node {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false; children: Node[] = []; handlers = new Map<string, (() => void)[]>();
  constructor(readonly tag: string) {} append(...nodes: Node[]) { this.children.push(...nodes); } replaceChildren(...nodes: Node[]) { this.children = nodes; } setAttribute() {} remove() {} focus() {} get childElementCount() { return this.children.length; }
  addEventListener(key: string, fn: () => void) { this.handlers.set(key, [...this.handlers.get(key) ?? [], fn]); } fire(key: string) { for (const fn of this.handlers.get(key) ?? []) fn(); } all(): Node[] { return [this, ...this.children.flatMap(n => n.all())]; } text(): string { return [this.textContent, ...this.children.map(n => n.text())].join('\n'); }
}

it.each([['md', 'en'], ['md', 'zh'], ['canvas', 'en'], ['canvas', 'zh']] as const)('actual %s/%s late-note idea → Main renderer → all original/generated callbacks with complete conditions and stale-donor refusal', async (ext, locale) => {
  const f = await fixture(ext), queries: Promise<SearchResult[]>[] = [], operations: Promise<void>[] = []; let dispose: (() => void) | undefined;
  try {
    await f.c.initialize(); await f.c.refresh(); await f.c.initialize(); const index = (await f.store.load())!;
    const opened: string[] = [], selections: unknown[] = [], leaf = { view: Object.create(MarkdownView.prototype), openFile: async (file: { path: string }) => { opened.push(file.path); leaf.view.file = file; leaf.view.getMode = () => 'source'; leaf.view.editor = { getValue: () => f.originals.get(file.path)?.text ?? '', setSelection: (...args: unknown[]) => selections.push(args), scrollIntoView: () => {} }; } };
    const plugin = Object.assign(Object.create(ThirdBrainPlugin.prototype), { controller: f.c, store: f.store, settings: f.settings, app: { vault: { getFileByPath: (name: string) => ({ path: name, extension: path.extname(name).slice(1) }) }, workspace: { getLeaf: () => leaf } } }) as ThirdBrainPlugin;
    const port = plugin.panelPort(), find = port.find.bind(port), open = port.open.bind(port), generated = port.openFragment!.bind(port);
    vi.spyOn(port, 'find').mockImplementation((...args) => { const op = find(...args); queries.push(op); return op; });
    vi.spyOn(port, 'open').mockImplementation(e => { const op = open(e); operations.push(op); return op; }); vi.spyOn(port, 'openFragment').mockImplementation((...args) => { const op = generated(...args); operations.push(op); return op; });
    vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) }); const container = new Node('main'), t = messages(locale); dispose = mountPanel(container as unknown as HTMLElement, port, locale);
    const search = async (query: string) => { const input = container.all().find(n => n.className === 'tb-idea')!; input.value = query; input.fire('input'); container.all().find(n => n.tag === 'button' && n.textContent === t.find)!.fire('click'); const hits = await queries.at(-1)!; await Promise.resolve(); return hits; };
    const actions = (card: Node) => card.all().filter(n => n.className === 'tb-source' || n.tag === 'button' && n.textContent === t.openFragment);
    const hits = await search('copper memory dial'); expect(hits).toHaveLength(2); const cards = container.all().filter(n => n.className === 'tb-result'); expect(cards).toHaveLength(2);
    const sealed = cards.find(n => n.text().includes('inert inlet is sealed'))!; expect(sealed).toBeDefined();
    for (const [i, card] of cards.entries()) { expect(card.text()).toContain(lazy); expect(card.text()).toContain(t.excerpt); expect(card.text()).not.toContain(late); expect(actions(card)).toHaveLength(hits[i].fragment.evidence.length + 1); for (const button of actions(card)) { button.fire('click'); await operations.at(-1); } }
    for (const hit of hits) { expect(hit.reasons.length).toBeGreaterThan(0); for (const e of hit.fragment.evidence) { const s = (await f.sources.read(e.relativePath))!; expect(e.sourceId).toBe(s.id); expect(e.sourceHash).toBe(s.hash); expect(index.sources[e.relativePath].fragmentIds).toContain(hit.fragment.id); if (e.start >= 0) expect(s.text.slice(e.start, e.end)).toBe(e.quote); else expect(hasReadableQuote(s, e.quote)).toBe(true); } }
    const lateHits = await search('Silver spool'); expect(lateHits).toHaveLength(1); const lateCard = container.all().find(n => n.className === 'tb-result')!; expect(lateCard.text()).toContain(late); expect(lateCard.text()).not.toContain(lazy); expect(actions(lateCard)).toHaveLength(lateHits[0].fragment.evidence.length + 1); for (const button of actions(lateCard)) { button.fire('click'); await operations.at(-1); }
    const name = 'copy.' + ext, raw = f.originals.get(name)!.text; await f.put(name, raw.replace('inert inlet is sealed', 'inert inlet has changed'));
    const count = opened.length; for (const button of actions(sealed)) { button.fire('click'); await expect(operations.at(-1)).rejects.toThrow(); } expect(opened).toHaveLength(count);
    expect((await f.c.find('copper memory dial', 'medium')).some(r => r.fragment.summary.includes('inert inlet is sealed'))).toBe(false);
    await f.put(name, raw); f.settings.excludes.push(name); for (const button of actions(sealed)) { button.fire('click'); await expect(operations.at(-1)).rejects.toThrow(); } f.settings.excludes.pop();
    await search('copper memory dial'); for (const card of container.all().filter(n => n.className === 'tb-result')) for (const button of actions(card)) { button.fire('click'); await operations.at(-1); }
    if (ext === 'md') expect(selections.length).toBeGreaterThan(0); else expect(Object.values(index.fragments).every(v => v.privacy === 'private')).toBe(true);
    expect(opened.some(n => n.startsWith('Derived/fragment-'))).toBe(true); expect(opened.some(n => !n.startsWith('Derived/'))).toBe(true);
    const before = await f.targets(); await f.c.refresh(); await f.unchanged(before); await f.protectedFiles();
  } finally { await Promise.allSettled([...queries, ...operations]); dispose?.(); f.c.dispose(); }
});

it.each(['md', 'canvas'])('actual %s oversized/hidden context, cancellation and human amendments refuse without commit and permit explicit repaired retry', async ext => {
  const f = await fixture(ext); try {
    await f.c.initialize(); await f.c.refresh(); const before = await f.targets(), commit = vi.spyOn(f.store, 'commit'), name = 'a.' + ext, original = f.originals.get(name)!.text;
    for (const raw of [quote(group) + '合'.repeat(16384), quote(group).replace(lazy, lazy + ' %% hidden %%')]) {
      await f.put(name, ext === 'md' ? raw : canvas(raw)); await expect(f.c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); await f.unchanged(before);
      await f.put(name, original); await f.c.refresh(); await f.unchanged(before); commit.mockClear();
    }
    const list = f.sources.list.bind(f.sources); let enter!: () => void, release!: () => void; const entered = new Promise<void>(r => { enter = r; }), latch = new Promise<void>(r => { release = r; }); vi.spyOn(f.sources, 'list').mockImplementationOnce(async options => { enter(); await latch; return list(options); });
    const pending = f.c.refresh(); await entered; f.c.cancel(); release(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); expect(commit).not.toHaveBeenCalled(); await f.unchanged(before); await f.c.refresh(); await f.unchanged(before);
    const target = before.find(v => v.name.includes('fragment-'))!; await fs.writeFile(path.join(f.root, target.name), Buffer.concat([target.bytes, Buffer.from('\nSynthetic human amendment.')])); await expect(f.c.refresh()).rejects.toThrow(); expect(await fs.readFile(path.join(f.root, target.name), 'utf8')).toContain('Synthetic human amendment.');
    expect(await fs.readFile(path.join(f.root, 'Derived/.third-brain/state.json'))).toEqual(before[0].bytes); await fs.writeFile(path.join(f.root, target.name), target.bytes); await f.c.initialize(); await f.c.refresh();
    const repaired = await f.targets(); await f.c.refresh(); await f.unchanged(repaired); await f.protectedFiles();
  } finally { f.c.dispose(); }
});
