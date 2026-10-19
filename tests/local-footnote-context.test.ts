// SPDX-License-Identifier: MIT
// Authored synthetic footnotes; filesystem + actual Main/renderer callbacks.
// No real models, semantic-quality grading, private vaults or native clicks.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { MarkdownView } from 'obsidian';
import ThirdBrainPlugin from '../src/main';
import { ThirdBrainController } from '../src/controller';
import { analyzeSource, buildIndex, emptyIndex, prepareSource } from '../src/core';
import { hasReadableQuote } from '../src/core/sources';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
import type { ModelRequest, SearchResult } from '../src/core/types';
vi.mock('obsidian', () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, MarkdownView: class {}, Notice: class {} }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const point = 'The violet marker records the seal[^scope].';
const condition = 'Only inside the disconnected synthetic chamber.';
const counter = '  A warm rim is the counterexample; keep the dummy lid shut.';
const definition = '[^scope]: ' + condition + '\n' + counter;
const opposite = '[^scope]: Never inside the disconnected synthetic chamber.\n' + counter;
const early = '# Synthetic rehearsal\n\n## Earlier independent register\n' + 'The paper register records mock tile orientation. '.repeat(50);
const body = early + '\n\n## Late independent point\n' + point + '\n\n## Endnotes\n' + definition;
const opts = { mode: 'local-excerpts' as const, cloudConsent: false, now: '2026-01-01T00:00:00.000Z' };
const snap = (text: string, name = 'synthetic.md') => prepareSource(name, text, hash(text), hash(name).slice(0, 24));
const wrap = (text: string, ext: string) => ext === 'canvas' ? JSON.stringify({ nodes: [{ type: 'text', text: '---\nprivacy: private\n---\n' + text }], edges: [] }) : '---\nprivacy: local\n---\n' + text;

it.each(['md', 'canvas'])('%s same primary with opposite footnote conditions must not merge; exact copies retain complete donors', async ext => {
  const inputs = [snap(wrap(body, ext), 'a.' + ext), snap(wrap(body, ext), 'b.' + ext), snap(wrap(body.replace(definition, opposite), ext), 'c.' + ext)];
  const index = await buildIndex(inputs, { ...opts, previous: emptyIndex(), signature: generationSignature(defaults) });
  const all = Object.values(index.fragments), hits = all.filter(f => f.summary.includes(point));
  expect(hits).toHaveLength(2);
  const allowed = hits.find(f => f.summary.includes(condition))!; expect(allowed).toBeDefined();
  expect(allowed.summary).toContain(counter); expect(allowed.summary).toContain('[^scope]:');
  expect(new Set(allowed.evidence.map(e => e.relativePath))).toEqual(new Set(['a.' + ext, 'b.' + ext]));
  expect(hits.some(f => f.summary.includes('Never inside'))).toBe(true);
  expect(all.some(f => f.summary.includes(definition) && !f.summary.includes(point))).toBe(false);
  for (const f of hits) for (const e of f.evidence) {
    const s = inputs.find(s => s.path === e.relativePath)!;
    expect(e.sourceHash).toBe(s.hash); expect(e.sourceId).toBe(s.id);
    if (e.start >= 0) expect(s.text.slice(e.start, e.end)).toBe(e.quote); else { expect(ext).toBe('canvas'); expect(hasReadableQuote(s, e.quote)).toBe(true); }
  }
});
it('keeps multiline/transitive footnotes once, preserves exact newlines and leaves unrelated prose/unused notes independent', async () => {
  for (const newline of ['\n', '\r\n', '\r']) {
    const raw = ('# Trial\nA porcelain witness records the rehearsal[^a][^a].\n\n[^a]: Only an inert dummy cabinet[^b].\n  Keep its cover shut.\n\n  A warm rim is a counterexample.\n[^b]: Use the disconnected mock fixture[^a].\n[^unused]: The amber ledger records a separate observation.\n\nAn unrelated indigo register remains independent.').replace(/\n/gu, newline);
    const all = (await analyzeSource(snap(raw), opts)).fragments, target = all.find(f => f.summary.includes('porcelain witness'))!;
    expect(target.summary).toContain('Only an inert dummy cabinet'); expect(target.summary).toContain('A warm rim is a counterexample'); expect(target.summary).toContain('disconnected mock fixture');
    expect(target.summary.match(/\[\^a\]:/gu)).toHaveLength(1); expect(target.summary.match(/\[\^b\]:/gu)).toHaveLength(1);
    expect(target.summary).not.toContain('amber ledger'); expect(target.summary).not.toContain('indigo register');
    expect(all.some(f => f.summary.includes('amber ledger'))).toBe(true); expect(all.some(f => f.summary.includes('indigo register'))).toBe(true);
    for (const e of target.evidence) expect(raw.slice(e.start, e.end)).toBe(e.quote);
  }
});
it('supports Chinese labels, definitions before usage, headings, list introductions and omitted sibling references', async () => {
  const raw = '[^边界]: 仅限断开的合成试验箱，温热边缘是反例。\n\n# Synthetic trial[^边界]\nOnly use this disconnected mock fixture[^边界]:\n- Shared rehearsal points:\n  - The violet marker records the first observation.\n  - The amber register records the second observation[^边界].';
  const all = (await analyzeSource(snap(raw), opts)).fragments;
  expect(all).toHaveLength(2); for (const f of all) { expect(f.summary).toContain('[^边界]: 仅限断开的合成试验箱，温热边缘是反例。'); expect(f.localContext).toBeDefined(); }
});
it('ignores escaped/inline-code/fenced/commented references and never reads a definition from another Canvas node', async () => {
  const raw = '# Synthetic trial\nLiteral `[^missing]`, ``[^other]`` and \\[^escaped] are syntax examples.\n\n```md\nFenced reference[^hidden].\n[^hidden]: This is not readable context.\n```\n\n<!--\nHidden reference[^comment].\n-->\n\n%%\nHidden reference[^private].\n%%';
  const all = (await analyzeSource(snap(raw), opts)).fragments; expect(all).toHaveLength(1); expect(all[0].summary).toContain('syntax examples'); expect(all[0].summary).not.toContain('not readable');
  const canvas = JSON.stringify({ nodes: [{ type: 'text', text: point }, { type: 'text', text: definition }], edges: [] });
  await expect(analyzeSource(snap(canvas, 'synthetic.canvas'), opts)).rejects.toThrow();
});
it.each([
  point,
  point + '\n\n[^scope]:',
  point + '\n\n[^scope]: First synthetic restriction.\n[^scope]: A different restriction.',
  point + '\n\n```md\n' + definition + '\n```',
  point + '\n\n<!--\n' + definition + '\n-->',
  point + '\n\n%%\n' + definition + '\n%%',
  point + '\n\n[^scope]: Only <!-- hidden --> in the mock fixture.',
  point + '\n\n[^scope]: Only %%hidden%% in the mock fixture.',
  point + '\n\n[^scope]: Only the mock fixture.\n  ```md\n  Hidden code must not be promoted.\n  ```',
])('fails closed rather than publishing an unresolved/ambiguous/hidden footnote condition', async raw => {
  await expect(analyzeSource(snap(raw), opts)).rejects.toThrow();
});

class Node {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false; children: Node[] = []; attrs: Record<string, string> = {}; handlers = new Map<string, (() => void)[]>();
  constructor(readonly tag: string) {} append(...nodes: Node[]) { this.children.push(...nodes); } replaceChildren(...nodes: Node[]) { this.children = nodes; }
  setAttribute(k: string, v: string) { this.attrs[k] = v; } remove() {} focus() {} get childElementCount() { return this.children.length; }
  addEventListener(k: string, fn: () => void) { this.handlers.set(k, [...this.handlers.get(k) ?? [], fn]); } fire(k: string) { for (const fn of this.handlers.get(k) ?? []) fn(); }
  all(): Node[] { return [this, ...this.children.flatMap(n => n.all())]; } text(): string { return [this.textContent, ...this.children.map(n => n.text())].join('\n'); }
}
async function fixture(ext: string, locale: 'en' | 'zh') {
  const base = path.resolve('.local/local-footnotes'); await fs.mkdir(base, { recursive: true }); const root = await fs.mkdtemp(path.join(base, ext + '-'));
  const expected = new Map<string, { text: string; mtime: string }>();
  const put = async (name: string, text: string) => { await fs.writeFile(path.join(root, name), text); expected.set(name, { text, mtime: (await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString() }); };
  await put('a.' + ext, wrap(body, ext)); await put('b.' + ext, wrap(body, ext)); await fs.mkdir(path.join(root, 'Derived')); await put('Derived/manual.txt', 'Synthetic human-owned material.');
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] as string[], locale }, store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const request = vi.fn(async () => { throw Error('Forbidden model request'); }), c = new ThirdBrainController(sources, store, () => settings, () => ({ request }), async () => {});
  const hostOpens: string[] = [], selections: unknown[] = [];
  const leaf = { view: Object.create(MarkdownView.prototype), openFile: async (file: { path: string }) => { hostOpens.push(file.path); leaf.view.file = file; leaf.view.getMode = () => 'source'; leaf.view.editor = { getValue: () => expected.get(file.path)?.text ?? '', setSelection: (...args: unknown[]) => selections.push(args), scrollIntoView: () => {} }; } };
  const plugin = Object.assign(Object.create(ThirdBrainPlugin.prototype), { settings, controller: c, store, app: { vault: { getFileByPath: (p: string) => ({ path: p, extension: path.extname(p).slice(1) }) }, workspace: { getLeaf: () => leaf } } }) as ThirdBrainPlugin;
  const port = plugin.panelPort(), finds: Promise<SearchResult[]>[] = [], opens: Promise<void>[] = [], generated: Promise<void>[] = [];
  const find = port.find.bind(port), open = port.open.bind(port), fragment = port.openFragment!.bind(port);
  vi.spyOn(port, 'find').mockImplementation((...args) => { const p = find(...args); finds.push(p); return p; }); vi.spyOn(port, 'open').mockImplementation(e => { const p = open(e); opens.push(p); return p; }); vi.spyOn(port, 'openFragment').mockImplementation(id => { const p = fragment(id); generated.push(p); return p; });
  vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) }); const container = new Node('main'), dispose = mountPanel(container as unknown as HTMLElement, port, locale);
  const query = async () => { const input = container.all().find(n => n.className === 'tb-idea')!; input.value = 'violet marker'; input.fire('input'); container.all().find(n => n.tag === 'button' && n.textContent === messages(locale).find)!.fire('click'); const hits = await finds.at(-1)!; await Promise.resolve(); return hits; };
  const originals = async () => { for (const [name, e] of expected) { expect(hash(await fs.readFile(path.join(root, name)))).toBe(hash(e.text)); expect((await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString()).toBe(e.mtime); } expect(request).not.toHaveBeenCalled(); };
  const close = async () => { await Promise.allSettled([...finds, ...opens, ...generated]); dispose(); c.dispose(); };
  return { root, expected, put, settings, store, sources, c, container, port, query, finds, opens, generated, hostOpens, selections, originals, close };
}
it.each([['md', 'en'], ['md', 'zh'], ['canvas', 'en'], ['canvas', 'zh']] as const)('actual %s/%s natural idea → complete footnote card → strict store → all Main renderer source/generated actions', async (ext, locale) => {
  const f = await fixture(ext, locale); try {
    await f.c.initialize(); await f.c.refresh(); await f.c.initialize(); const hits = await f.query(); expect(hits).toHaveLength(1);
    const card = hits[0].fragment; expect(card.summary).toContain(condition); expect(card.summary).toContain(counter); expect(new Set(card.evidence.map(e => e.relativePath)).size).toBe(2);
    const visible = f.container.all().find(n => n.className === 'tb-fragment')!; expect(visible.text()).toContain(condition); expect(visible.text()).toContain(counter);
    for (const b of f.container.all().filter(n => n.className === 'tb-source')) { b.fire('click'); await f.opens.at(-1); }
    f.container.all().find(n => n.tag === 'button' && n.textContent === messages(locale).openFragment)!.fire('click'); await f.generated.at(-1);
    expect(f.opens).toHaveLength(card.evidence.length); expect(f.generated).toHaveLength(1); expect(f.hostOpens.at(-1)).toBe(await f.store.fragmentPath(card.id)); if (ext === 'md') expect(f.selections).toHaveLength(card.evidence.length);
    const rendered = await fs.readFile(path.join(f.root, await f.store.fragmentPath(card.id)), 'utf8'); expect(rendered).toContain(condition); expect(rendered).toContain(counter);
    const statePath = path.join(f.root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath); await f.c.refresh(); expect(await fs.readFile(statePath)).toEqual(state);
    await f.put('b.' + ext, wrap(body.replace(definition, opposite), ext)); for (const e of card.evidence) await expect(f.c.verifyOpen(e)).rejects.toThrow(); expect(await f.c.find('violet marker', 'medium')).toHaveLength(0); expect(await fs.readFile(statePath)).toEqual(state);
    await f.c.refresh(); await f.c.initialize(); const current = await f.query(); expect(current).toHaveLength(2); expect(current.every(r => r.fragment.evidence.every(e => e.relativePath === r.fragment.evidence[0].relativePath))).toBe(true); expect(current.some(r => r.fragment.summary.includes('Never inside'))).toBe(true);
    for (const r of current) for (const e of r.fragment.evidence) await f.port.open(e);
    f.settings.excludes.push('b.' + ext); for (const e of current.find(r => r.fragment.summary.includes('Never inside'))!.fragment.evidence) await expect(f.c.verifyOpen(e)).rejects.toThrow(); f.settings.excludes.pop(); await f.originals();
  } finally { await f.close(); }
});
it('actual failure/cancel/retry preserve prior bytes, human files and originals; combined context bounds are not relaxed', async () => {
  const f = await fixture('md', 'en'); try {
    await f.c.initialize(); await f.c.refresh(); const statePath = path.join(f.root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath), commit = vi.spyOn(f.store, 'commit');
    await f.put('b.md', wrap(body.replace(definition, '[^scope]: Only ' + '合'.repeat(16384)), 'md')); await expect(f.c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    await f.put('b.md', wrap(body.replace(definition, ''), 'md')); await expect(f.c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    await f.put('b.md', wrap(body, 'md')); const list = f.sources.list.bind(f.sources); let entered!: () => void, release!: () => void; const started = new Promise<void>(r => { entered = r; }), latch = new Promise<void>(r => { release = r; });
    vi.spyOn(f.sources, 'list').mockImplementationOnce(async options => { entered(); await latch; return list(options); }); const cancelled = f.c.refresh(); await started; f.c.cancel(); release(); await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' }); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    await f.c.refresh(); await f.c.initialize(); const index = (await f.store.load())!, target = Object.values(index.fragments).find(v => v.summary.includes(point))!; const stable = await fs.readFile(statePath); await f.c.refresh(); expect(await fs.readFile(statePath)).toEqual(stable);
    const file = path.join(f.root, await f.store.fragmentPath(target.id)); await fs.appendFile(file, '\nSynthetic human amendment.'); await expect(f.c.refresh()).rejects.toThrow(); expect(await fs.readFile(statePath)).toEqual(stable); expect(await fs.readFile(file, 'utf8')).toContain('Synthetic human amendment.'); await f.originals();
  } finally { await f.close(); }
});
it.each(['md', 'canvas'])('actual %s retains the 256 combined evidence bound within a source and across duplicate donors', async ext => {
  const base = path.resolve('.local/local-footnotes'); await fs.mkdir(base, { recursive: true }); const root = await fs.mkdtemp(path.join(base, 'bounds-'));
  const make = (count: number) => wrap('A porcelain register records the synthetic trial' + Array.from({ length: count }, (_, i) => '[^n' + i + ']').join('') + '.\n\n' + Array.from({ length: count }, (_, i) => '[^n' + i + ']: Only inert fixture ' + i + '.').join('\n'), ext);
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] }, store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths()), c = new ThirdBrainController(sources, store, () => settings, () => undefined, async () => {});
  const a = path.join(root, 'a.' + ext), b = path.join(root, 'b.' + ext);
  try {
    await fs.writeFile(a, make(255)); await c.initialize(); await c.refresh(); await c.initialize(); const index = (await store.load())!; expect(Object.values(index.fragments)).toHaveLength(1); expect(Object.values(index.fragments)[0].evidence).toHaveLength(256);
    const statePath = path.join(root, 'Derived/.third-brain/state.json'), saved = await fs.readFile(statePath); await c.refresh(); expect(await fs.readFile(statePath)).toEqual(saved); const commit = vi.spyOn(store, 'commit');
    await fs.writeFile(a, make(256)); await expect(c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(saved);
    await fs.writeFile(a, make(128)); await fs.writeFile(b, make(128)); await expect(c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(saved);
    await fs.writeFile(a, make(127)); await fs.writeFile(b, make(127)); await c.refresh(); await c.initialize(); const current = (await store.load())!; expect(Object.values(current.fragments)).toHaveLength(1); expect(Object.values(current.fragments)[0].evidence).toHaveLength(256);
    const stable = await fs.readFile(statePath); await c.refresh(); expect(await fs.readFile(statePath)).toEqual(stable); expect(await fs.readFile(a, 'utf8')).toBe(make(127)); expect(await fs.readFile(b, 'utf8')).toBe(make(127));
  } finally { c.dispose(); }
});
it('counts the primary, complete footnotes and siblings together without truncation, retaining CRLF duplicate identity', async () => {
  const prefix = 'An inert dummy register records the rehearsal[^a].', def = '[^a]: Only inert ';
  const fill = 16384 - (prefix + '\n\n' + def).length;
  const legal = prefix + '\n\n' + def + '合'.repeat(fill);
  const one = (await analyzeSource(snap(legal), opts)).fragments; expect(one).toHaveLength(1); expect(one[0].summary).toHaveLength(16384);
  await expect(analyzeSource(snap(legal + '合'), opts)).rejects.toThrow();
  const merged = await buildIndex([snap(body, 'a.md'), snap(body.replace(/\n/gu, '\r\n'), 'b.md')], { ...opts, previous: emptyIndex(), signature: generationSignature(defaults) });
  const target = Object.values(merged.fragments).filter(f => f.summary.includes(point)); expect(target).toHaveLength(1); expect(new Set(target[0].evidence.map(e => e.relativePath)).size).toBe(2);
  const grouped = '- Only the dummy trial:\n  - First independent rehearsal point[^a].\n  - Second independent rehearsal point.\n\n' + def + '合'.repeat(fill);
  await expect(analyzeSource(snap(grouped), opts)).rejects.toThrow();
});
it('does not change AI primary/background/vocabulary inputs or either AI generation signature', async () => {
  const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-footnote-legacy.json', 'utf8'));
  for (const mode of ['local-model', 'cloud-model'] as const) {
    expect(generationSignature({ ...defaults, mode })).toBe(legacy.signatures[mode]); const requests: ModelRequest[] = [];
    await analyzeSource(snap(body), { mode, cloudConsent: true, model: { request: async r => { requests.push(r); return { version: 1, decision: 'insufficient-context', fragments: [] }; } } });
    expect(requests).toEqual(legacy.requests[mode]);
  }
  expect(generationSignature(defaults)).not.toBe(legacy.signatures['local-excerpts']);
});
it('actual saved old generation loads byte-for-byte, upgrades via Controller once, retains history and is strictly idempotent', async () => {
  const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-footnote-legacy.json', 'utf8')), f = await fixture('md', 'en'); try {
    const snapshots = await f.sources.list(); await f.store.commit(structuredClone(legacy.oldIndex), () => f.sources.verify(snapshots)); const statePath = path.join(f.root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath);
    const marker = JSON.parse(await fs.readFile(path.join(f.root, 'Derived/.third-brain/marker.json'), 'utf8')), oldFiles: Buffer[] = [];
    for (const id of Object.keys(legacy.oldIndex.fragments)) { const bytes = await fs.readFile(path.join(f.root, await f.store.fragmentPath(id))); expect(bytes.toString().replaceAll(marker.storeId, 'SYNTHETIC_STORE_ID')).toBe(legacy.rendered[id]); oldFiles.push(bytes); }
    await f.c.initialize(); expect(await f.store.load()).toEqual(legacy.oldIndex); expect(await fs.readFile(statePath)).toEqual(state); await f.c.refresh(); await f.c.initialize();
    const hits = await f.query(); expect(hits).toHaveLength(1); expect(hits[0].fragment.summary).toContain(condition); expect(hits[0].fragment.summary).toContain(counter); expect((await f.store.load())!.signature).not.toBe(legacy.oldIndex.signature);
    const saved = await fs.readFile(statePath); await f.c.refresh(); expect(await fs.readFile(statePath)).toEqual(saved);
    const history = await fs.readdir(path.join(f.root, 'Derived/.third-brain/history'), { recursive: true, withFileTypes: true }), backups = await Promise.all(history.filter(e => e.isFile()).map(e => fs.readFile(path.join(e.parentPath, e.name)))); for (const b of oldFiles) expect(backups.some(v => v.equals(b))).toBe(true); await f.originals();
  } finally { await f.close(); }
});
