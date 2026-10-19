// SPDX-License-Identifier: MIT
// Authored synthetic list-first headings, not AI semantic or native-host grading.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { MarkdownView } from 'obsidian';
import ThirdBrainPlugin from '../src/main';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
import type { ModelRequest, SearchResult } from '../src/core/types';
import { analyzeSource, buildIndex, emptyIndex, prepareSource } from '../src/core';
import { hasReadableQuote } from '../src/core/sources';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { ThirdBrainController } from '../src/controller';
import { defaults, generationSignature } from '../src/settings';
vi.mock('obsidian', () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, MarkdownView: class {}, Notice: class {} }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-first-heading-legacy.json', 'utf8'));
const { parent, other, point, raw, storedRaw } = legacy as { parent: string; other: string; point: string; raw: string; storedRaw: string };
const options = { mode: 'local-excerpts' as const, cloudConsent: false, now: '2026-01-01T00:00:00.000Z' };
const snap = (text: string, name: string) => prepareSource(name, text, hash(text), hash(name).slice(0, 24));
const wrap = (text: string, ext: string) => ext === 'canvas' ? JSON.stringify({ nodes: [{ type: 'text', text: '---\nprivacy: private\n---\n' + text }], edges: [] }) : '---\nprivacy: local\n---\n' + text;
it.each(['md', 'canvas'])('%s first-item underline retains opposing conditions and complete duplicate donors', async ext => {
  const inputs = ['a', 'b', 'c'].map(name => snap(wrap(name === 'c' ? raw.replace(parent, other) : raw, ext), name + '.' + ext));
  const index = await buildIndex(inputs, { ...options, previous: emptyIndex(), signature: generationSignature(defaults) });
  const all = Object.values(index.fragments), targets = all.filter(f => f.summary.includes(point));
  expect(targets).toHaveLength(2);
  const allowed = targets.find(f => f.summary.includes(parent))!; expect(allowed).toBeDefined(); expect(allowed.summary).toContain('warm chalk');
  expect(new Set(allowed.evidence.map(e => e.relativePath))).toEqual(new Set(['a.' + ext, 'b.' + ext]));
  expect(targets.some(f => f.summary.includes(other))).toBe(true);
  expect(all.find(f => f.summary.includes('copper ledger'))!.summary).not.toContain(parent);
  for (const f of targets) for (const e of f.evidence) {
    const source = inputs.find(s => s.path === e.relativePath)!;
    expect(e.sourceHash).toBe(source.hash); expect(e.sourceId).toBe(source.id);
    if (e.start >= 0) expect(source.text.slice(e.start, e.end)).toBe(e.quote); else expect(hasReadableQuote(source, e.quote)).toBe(true);
  }
});
it.each(['md', 'canvas'])('actual %s FileSources → Controller → strict OwnedStore reload → late idea/originals', async ext => {
  const base = path.resolve('.local/first-headings'); await fs.mkdir(base, { recursive: true }); const root = await fs.mkdtemp(path.join(base, ext + '-'));
  for (const [name, text] of Object.entries({ a: raw, b: raw, c: raw.replace(parent, other) })) await fs.writeFile(path.join(root, name + '.' + ext), wrap(text, ext));
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] }, store = new OwnedStore(root, 'Derived');
  const sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const c = new ThirdBrainController(sources, store, () => settings, () => undefined, async () => {});
  try {
    await c.initialize(); await c.refresh(); await c.initialize(); const saved = (await store.load())!, found = await c.find('opal dial', 'medium');
    expect(found).toHaveLength(2); expect(found.every(r => r.fragment.summary.includes('unplugged synthetic amber chest'))).toBe(true);
    for (const r of found) { expect(saved.fragments[r.fragment.id]).toBeDefined(); for (const e of r.fragment.evidence) await c.verifyOpen(e); }
  } finally { c.dispose(); }
});

it('retains first-paragraph headings for ordinary item markers, relative indentation, Chinese and exact line endings', async () => {
  for (const marker of ['- ', '* ', '+ ', '1. ', '12) ', '-    ']) for (const underline of ['---', '===', '-']) for (const newline of ['\n', '\r\n', '\r']) {
    const pad = ' '.repeat(marker.length), text = (marker + '仅限断开的合成空箱：\n' + pad + underline + '\n\n' + pad + '- 冷态记录后转动蛋白石旋钮。\n' + pad + '  反例：温热粉笔不适用。').replace(/\n/gu, newline);
    const all = (await analyzeSource(snap(text, 'synthetic.md'), options)).fragments;
    expect(all).toHaveLength(1); expect(all[0].summary).toContain('仅限断开的合成空箱'); expect(all[0].summary).toContain('反例');
    for (const e of all[0].evidence) expect(text.slice(e.start, e.end)).toBe(e.quote);
  }
  const nested = '- Outer synthetic scope:\n  - ' + parent + '\n    ---\n\n    - ' + point;
  expect((await analyzeSource(snap(nested, 'nested.md'), options)).fragments[0].summary).toContain(parent);
});
it.each(['md', 'canvas'])('%s quoted and multiline first paragraphs preserve the whole parent, not a global ancestor', async ext => {
  for (const body of [raw, raw.replace(parent, 'Only inside the unplugged\n  synthetic amber chest:')]) for (const quoted of [false, true]) {
    // A single contiguous quote run begins at its explicit first list item.
    const text = quoted ? body.slice(body.indexOf('- ' + (body === raw ? parent : 'Only inside'))).split('\n').map(row => '> ' + row).join('\n') : body;
    const source = snap(wrap(text, ext), 'synthetic.' + ext), all = (await analyzeSource(source, options)).fragments;
    const target = all.find(f => f.summary.includes(point))!; expect(target.summary).toContain('synthetic amber chest:'); expect(target.summary).toContain('---');
    expect(all.find(f => f.summary.includes('copper ledger'))!.summary).not.toContain('synthetic amber chest:');
    for (const e of target.evidence) if (e.start >= 0) expect(source.text.slice(e.start, e.end)).toBe(e.quote); else expect(hasReadableQuote(source, e.quote)).toBe(true);
  }
});
it('keeps thematic/code/hidden/malformed boundaries closed and normal prose/global headings intact', async () => {
  for (const separator of ['\n\n  ---', '\n  - - -', '\n  ***', '\n ---', '\n      ---', '\n  ```\n  Synthetic code\n  ```', '\n  <!-- hidden -->', '\n  %%hidden%%']) {
    await expect(analyzeSource(snap('- ' + parent + separator + '\n\n  - ' + point, 'synthetic.md'), options)).rejects.toThrow();
  }
  for (const prefix of ['# Only inert chests:', '> Only inert chests:', '<div>Only inert chests:</div>']) await expect(analyzeSource(snap('- ' + prefix + '\n  ---\n\n  - ' + point, 'synthetic.md'), options)).rejects.toThrow();
  for (const marker of ['<!-- hidden -->', '%%hidden%%']) await expect(analyzeSource(snap('- Only ' + marker + ' inert chests:\n  ---\n\n  - ' + point, 'synthetic.md'), options)).rejects.toThrow();
  const literal = 'Literal `---`, `<!-- marker -->` and `%%` remain ordinary inline examples.';
  const text = raw + '\n\n' + literal + '\n\nOnly the independent archive\n===\n## Neutral\nThe emerald ledger belongs only to this archive.';
  const all = (await analyzeSource(snap(text, 'synthetic.md'), options)).fragments;
  expect(all.some(f => f.summary.endsWith(literal))).toBe(true);
  const separate = all.find(f => f.summary.includes('emerald ledger'))!; expect(separate.summary).toContain('Only the independent archive\n==='); expect(separate.summary).not.toContain(parent);
  const canvas = JSON.stringify({ nodes: [{ type: 'text', text: raw }, { type: 'text', text: 'A saffron card is an independent node.' }], edges: [] });
  expect((await analyzeSource(snap(canvas, 'separate.canvas'), options)).fragments.find(f => f.summary.includes('saffron card'))!.summary).not.toContain(parent);
});
it('retains first-paragraph context within the unchanged 16384-unit limit, never clipping the parent', async () => {
  const prefix = '- ' + parent + '\n  ---\n\n  - ', text = prefix + '合'.repeat(16384 - prefix.length);
  const all = (await analyzeSource(snap(text, 'synthetic.md'), options)).fragments; expect(all).toHaveLength(1); expect(all[0].summary).toHaveLength(16384);
  await expect(analyzeSource(snap(text + '尾', 'synthetic.md'), options)).rejects.toThrow();
});
it('changes only local generation and retains both exact AI signatures and full offline request captures', async () => {
  expect(generationSignature({ ...defaults, outputFolder: 'Derived' })).not.toBe(legacy.signatures['local-excerpts']);
  for (const mode of ['local-model', 'cloud-model'] as const) {
    expect(generationSignature({ ...defaults, outputFolder: 'Derived', mode })).toBe(legacy.signatures[mode]); const requests: ModelRequest[] = [];
    await analyzeSource(snap(raw, 'synthetic.md'), { mode, cloudConsent: true, model: { request: async r => { requests.push(r); return { version: 1, decision: 'insufficient-context', fragments: [] }; } } });
    expect(requests).toEqual(legacy.requests[mode]);
  }
});

class Node {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false; children: Node[] = []; handlers = new Map<string, (() => void)[]>();
  constructor(readonly tag: string) {} append(...nodes: Node[]) { this.children.push(...nodes); } replaceChildren(...nodes: Node[]) { this.children = nodes; }
  setAttribute() {} remove() {} focus() {} get childElementCount() { return this.children.length; }
  addEventListener(key: string, handler: () => void) { this.handlers.set(key, [...this.handlers.get(key) ?? [], handler]); }
  fire(key: string) { for (const handler of this.handlers.get(key) ?? []) handler(); }
  all(): Node[] { return [this, ...this.children.flatMap(node => node.all())]; } text(): string { return [this.textContent, ...this.children.map(node => node.text())].join('\n'); }
}
async function fixture(ext: string, locale: 'en' | 'zh' = 'en', body = raw) {
  const base = path.resolve('.local/first-headings'); await fs.mkdir(base, { recursive: true }); const root = await fs.mkdtemp(path.join(base, 'ui-' + ext + '-'));
  const expected = new Map<string, { text: string; mtime: string }>();
  const put = async (name: string, text: string) => { await fs.writeFile(path.join(root, name), text); expected.set(name, { text, mtime: (await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString() }); };
  for (const [name, text] of Object.entries({ a: body, b: body, c: body.replace(parent, other) })) await put(name + '.' + ext, wrap(text, ext));
  await fs.mkdir(path.join(root, 'Derived')); await put('Derived/manual.txt', 'Synthetic human-owned first-heading material.');
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] as string[], locale }, store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const request = vi.fn(async () => { throw Error('Forbidden model request'); }), c = new ThirdBrainController(sources, store, () => settings, () => ({ request }), async () => {});
  const hostOpens: string[] = [], selections: unknown[] = [];
  const leaf = { view: Object.create(MarkdownView.prototype), openFile: async (file: { path: string }) => { hostOpens.push(file.path); leaf.view.file = file; leaf.view.getMode = () => 'source'; leaf.view.editor = { getValue: () => expected.get(file.path)?.text ?? '', setSelection: (...args: unknown[]) => selections.push(args), scrollIntoView: () => {} }; } };
  const plugin = Object.assign(Object.create(ThirdBrainPlugin.prototype), { settings, controller: c, store, app: { vault: { getFileByPath: (p: string) => ({ path: p, extension: path.extname(p).slice(1) }) }, workspace: { getLeaf: () => leaf } } }) as ThirdBrainPlugin;
  const port = plugin.panelPort(), finds: Promise<SearchResult[]>[] = [], opens: Promise<void>[] = [], generated: Promise<void>[] = [];
  const find = port.find.bind(port), open = port.open.bind(port), fragment = port.openFragment!.bind(port);
  vi.spyOn(port, 'find').mockImplementation((...args) => { const p = find(...args); finds.push(p); return p; });
  vi.spyOn(port, 'open').mockImplementation(e => { const p = open(e); opens.push(p); return p; });
  vi.spyOn(port, 'openFragment').mockImplementation(id => { const p = fragment(id); generated.push(p); return p; });
  vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) }); const container = new Node('main'), dispose = mountPanel(container as unknown as HTMLElement, port, locale);
  const query = async () => { const input = container.all().find(n => n.className === 'tb-idea')!; input.value = 'opal dial'; input.fire('input'); container.all().find(n => n.tag === 'button' && n.textContent === messages(locale).find)!.fire('click'); const hits = await finds.at(-1)!; await Promise.resolve(); return hits; };
  const originals = async () => { for (const [name, e] of expected) { expect(hash(await fs.readFile(path.join(root, name)))).toBe(hash(e.text)); expect((await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString()).toBe(e.mtime); } expect(request).not.toHaveBeenCalled(); };
  const close = async () => { await Promise.allSettled([...finds, ...opens, ...generated]); dispose(); c.dispose(); };
  return { root, settings, store, sources, c, port, container, query, opens, generated, hostOpens, selections, put, originals, close };
}
it.each([['md', 'en'], ['md', 'zh'], ['canvas', 'en'], ['canvas', 'zh']] as const)('actual %s/%s late idea → scoped card → every Main original/generated renderer action', async (ext, locale) => {
  const f = await fixture(ext, locale); try {
    await f.c.initialize(); await f.c.refresh(); await f.c.initialize(); const found = await f.query(); expect(found).toHaveLength(2);
    const cards = f.container.all().filter(n => n.className === 'tb-result'); expect(cards).toHaveLength(2);
    for (const card of cards) { expect(card.all().find(n => n.className === 'tb-fragment')!.text()).toContain('unplugged synthetic amber chest'); expect(card.text()).toContain(messages(locale).excerpt); for (const button of card.all().filter(n => n.className === 'tb-source')) { button.fire('click'); await f.opens.at(-1); } card.all().find(n => n.tag === 'button' && n.textContent === messages(locale).openFragment)!.fire('click'); await f.generated.at(-1); }
    expect(f.opens).toHaveLength(found.reduce((n, r) => n + r.fragment.evidence.length, 0)); expect(f.generated).toHaveLength(2); expect(f.hostOpens).toHaveLength(f.opens.length + 2); if (ext === 'md') expect(f.selections).toHaveLength(f.opens.length);
    for (const r of found) { const text = await fs.readFile(path.join(f.root, await f.store.fragmentPath(r.fragment.id)), 'utf8'); expect(text).toContain('unplugged synthetic amber chest'); expect(text).toContain(point); expect(text).toContain('warm chalk'); }
    await f.originals(); await fs.writeFile(path.join(f.root, '../' + path.basename(f.root) + '-receipt.json'), JSON.stringify({ ext, locale, originalCallbacks: f.opens.length, generatedCallbacks: f.generated.length, hostCallbacks: f.hostOpens.length, strictReload: true, realModels: 0, nativeGUI: false }));
  } finally { await f.close(); }
});
it('actual previously valid equal-underline store preserves frozen bytes, upgrades local generation once, retains history and is idempotent', async () => {
  // The old dash form failed before committing anything. This frozen equal form
  // was actually produced by the previous runtime; it is not a fabricated cache.
  const f = await fixture('md', 'en', storedRaw); try {
    const inputs = await f.sources.list(); await f.store.commit(structuredClone(legacy.oldIndex), () => f.sources.verify(inputs)); const statePath = path.join(f.root, 'Derived/.third-brain/state.json'), oldState = await fs.readFile(statePath), marker = JSON.parse(await fs.readFile(path.join(f.root, 'Derived/.third-brain/marker.json'), 'utf8')), oldFiles: Buffer[] = [];
    for (const id of Object.keys(legacy.oldIndex.fragments)) { const bytes = await fs.readFile(path.join(f.root, await f.store.fragmentPath(id))); expect(bytes.toString().replaceAll(marker.storeId, 'SYNTHETIC_STORE_ID')).toBe(legacy.rendered[id]); oldFiles.push(bytes); }
    await f.c.initialize(); expect(await f.store.load()).toEqual(legacy.oldIndex); expect(await fs.readFile(statePath)).toEqual(oldState); await f.c.refresh(); await f.c.initialize(); expect((await f.store.load())!.signature).not.toBe(legacy.oldIndex.signature); expect(await f.query()).toHaveLength(2);
    const stable = await fs.readFile(statePath); await f.c.refresh(); expect(await fs.readFile(statePath)).toEqual(stable);
    const history = await fs.readdir(path.join(f.root, 'Derived/.third-brain/history'), { recursive: true, withFileTypes: true }), saved = await Promise.all(history.filter(e => e.isFile()).map(e => fs.readFile(path.join(e.parentPath, e.name))));
    for (const bytes of oldFiles) if (bytes.toString().includes(point)) expect(saved.some(v => v.equals(bytes))).toBe(true); await f.originals();
  } finally { await f.close(); }
});
it.each(['md', 'canvas'])('actual %s parent-only changes/exclusion refuse every old original; refresh preserves a unique later point', async ext => {
  const f = await fixture(ext); try {
    await f.c.initialize(); await f.c.refresh(); const old = (await f.query()).find(r => r.fragment.summary.includes(parent))!; expect(new Set(old.fragment.evidence.map(e => e.relativePath)).size).toBe(2);
    const statePath = path.join(f.root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath);
    await f.put('b.' + ext, wrap(raw.replace(parent, other), ext)); for (const e of old.fragment.evidence) await expect(f.port.open(e)).rejects.toThrow(); expect(await fs.readFile(statePath)).toEqual(state); expect((await f.c.find('opal dial', 'medium')).some(r => r.fragment.id === old.fragment.id)).toBe(false);
    await f.c.refresh(); await f.c.initialize(); expect(await f.query()).toHaveLength(2);
    await f.put('b.' + ext, wrap(raw.replace(parent, other).replace(point, 'The turquoise spindle records a distinct final observation.'), ext)); await f.c.refresh(); await f.c.initialize(); const late = await f.c.find('turquoise spindle', 'medium'); expect(late).toHaveLength(1); expect(late[0].fragment.summary).toContain(other); expect(late[0].fragment.summary).toContain('counterexample'); for (const e of late[0].fragment.evidence) await f.port.open(e);
    expect(await f.c.find('opal dial', 'medium')).toHaveLength(2); f.settings.excludes.push('b.' + ext); for (const e of late[0].fragment.evidence) await expect(f.port.open(e)).rejects.toThrow(); f.settings.excludes.pop(); const saved = await fs.readFile(statePath); await f.c.refresh(); expect(await fs.readFile(statePath)).toEqual(saved); await f.originals();
  } finally { await f.close(); }
});
it('actual hidden/oversized failures, cancel/no commit, repaired retry and human edits retain prior bytes and originals', async () => {
  const f = await fixture('md'); try {
    await f.c.initialize(); await f.c.refresh(); const statePath = path.join(f.root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath), commit = vi.spyOn(f.store, 'commit');
    for (const invalid of [raw.replace(parent, 'Only <!-- hidden --> inert chests:'), raw.replace(point, '合'.repeat(16384))]) { await f.put('b.md', wrap(invalid, 'md')); await expect(f.c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state); }
    await f.put('b.md', wrap(raw, 'md')); const list = f.sources.list.bind(f.sources); let entered!: () => void, release!: () => void; const started = new Promise<void>(r => { entered = r; }), latch = new Promise<void>(r => { release = r; }); vi.spyOn(f.sources, 'list').mockImplementationOnce(async o => { entered(); await latch; return list(o); }); const pending = f.c.refresh(); await started; f.c.cancel(); release(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    await f.c.refresh(); await f.c.initialize(); expect(await fs.readFile(statePath)).toEqual(state); const target = (await f.query())[0].fragment, file = path.join(f.root, await f.store.fragmentPath(target.id)); await fs.appendFile(file, '\nSynthetic human amendment.'); await expect(f.c.refresh()).rejects.toThrow(); expect(await fs.readFile(statePath)).toEqual(state); expect(await fs.readFile(file, 'utf8')).toContain('Synthetic human amendment.'); await f.originals();
  } finally { await f.close(); }
});
it('actual Canvas keeps the unchanged 256/257 quotation bound, including first headings and merged donors', async () => {
  const base = path.resolve('.local/first-headings'); await fs.mkdir(base, { recursive: true }); const root = await fs.mkdtemp(path.join(base, 'bounds-'));
  const make = (count: number) => wrap('- ' + parent + '\n  ---\n\n' + Array.from({ length: count }, (_, i) => '  ' + (i + 1) + '. Synthetic step ' + i + '.').join('\n'), 'canvas');
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] }, store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths()), c = new ThirdBrainController(sources, store, () => settings, () => undefined, async () => {});
  try {
    await fs.writeFile(path.join(root, 'a.canvas'), make(255)); await c.initialize(); await c.refresh(); await c.initialize(); expect(Object.values((await store.load())!.fragments)[0].evidence).toHaveLength(256);
    const statePath = path.join(root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath), commit = vi.spyOn(store, 'commit');
    await fs.writeFile(path.join(root, 'a.canvas'), make(256)); await expect(c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    await fs.writeFile(path.join(root, 'a.canvas'), make(128)); await fs.writeFile(path.join(root, 'b.canvas'), make(128)); await expect(c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    await fs.writeFile(path.join(root, 'a.canvas'), make(127)); await fs.writeFile(path.join(root, 'b.canvas'), make(127)); await c.refresh(); await c.initialize(); expect(Object.values((await store.load())!.fragments)[0].evidence).toHaveLength(256); const saved = await fs.readFile(statePath); await c.refresh(); expect(await fs.readFile(statePath)).toEqual(saved);
  } finally { c.dispose(); }
});
