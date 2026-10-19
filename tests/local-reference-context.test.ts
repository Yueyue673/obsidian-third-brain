// SPDX-License-Identifier: MIT
// Authored synthetic reference links; real filesystem and Main/renderer callbacks.
// No real models, semantic grading, network link following or native clicks.
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
const point = 'The indigo latch checks the [trial boundary][scope].';
const condition = 'Only inside the disconnected synthetic enclosure.';
const definition = '[scope]: <synthetic-boundary.md> "' + condition + '"';
const opposite = '[scope]: <synthetic-boundary.md> "Never inside the disconnected synthetic enclosure."';
const body = '# Synthetic inspection\n\n## Earlier independent register\n' + 'A paper gauge records mock wheel orientation. '.repeat(50) + '\n\n## Late independent point\n' + point + '\n\n## Link definitions\n' + definition;
const opts = { mode: 'local-excerpts' as const, cloudConsent: false, now: '2026-01-01T00:00:00.000Z' };
const snap = (text: string, name = 'synthetic.md') => prepareSource(name, text, hash(text), hash(name).slice(0, 24));
const wrap = (text: string, ext: string) => ext === 'canvas' ? JSON.stringify({ nodes: [{ type: 'text', text: '---\nprivacy: private\n---\n' + text }], edges: [] }) : '---\nprivacy: local\n---\n' + text;
it.each(['md', 'canvas'])('%s reference destinations/titles stay with a late point; opposing definitions stay distinct and copies merge', async ext => {
  const sources = [snap(wrap(body, ext), 'a.' + ext), snap(wrap(body, ext), 'b.' + ext), snap(wrap(body.replace(definition, opposite), ext), 'c.' + ext)];
  const index = await buildIndex(sources, { ...opts, previous: emptyIndex(), signature: generationSignature(defaults) });
  const all = Object.values(index.fragments), hits = all.filter(f => f.summary.includes(point)); expect(hits).toHaveLength(2);
  const allowed = hits.find(f => f.summary.includes(condition))!; expect(allowed).toBeDefined(); expect(allowed.summary).toContain(definition);
  expect(new Set(allowed.evidence.map(e => e.relativePath))).toEqual(new Set(['a.' + ext, 'b.' + ext]));
  expect(hits.some(f => f.summary.includes(opposite))).toBe(true); expect(all.some(f => f.summary.includes(definition) && !f.summary.includes(point))).toBe(false);
  for (const f of hits) for (const e of f.evidence) { const s = sources.find(s => s.path === e.relativePath)!; expect(e.sourceHash).toBe(s.hash); expect(e.sourceId).toBe(s.id); if (e.start >= 0) expect(s.text.slice(e.start, e.end)).toBe(e.quote); else { expect(ext).toBe('canvas'); expect(hasReadableQuote(s, e.quote)).toBe(true); } }
});
class Node {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false; children: Node[] = []; attrs: Record<string, string> = {}; handlers = new Map<string, (() => void)[]>();
  constructor(readonly tag: string) {} append(...nodes: Node[]) { this.children.push(...nodes); } replaceChildren(...nodes: Node[]) { this.children = nodes; }
  setAttribute(k: string, v: string) { this.attrs[k] = v; } remove() {} focus() {} get childElementCount() { return this.children.length; }
  addEventListener(k: string, fn: () => void) { this.handlers.set(k, [...this.handlers.get(k) ?? [], fn]); } fire(k: string) { for (const fn of this.handlers.get(k) ?? []) fn(); }
  all(): Node[] { return [this, ...this.children.flatMap(n => n.all())]; } text(): string { return [this.textContent, ...this.children.map(n => n.text())].join('\n'); }
}
async function fixture(ext: string, locale: 'en' | 'zh') {
  const base = path.resolve('.local/local-references'); await fs.mkdir(base, { recursive: true }); const root = await fs.mkdtemp(path.join(base, ext + '-'));
  const expected = new Map<string, { text: string; mtime: string }>();
  const put = async (name: string, text: string) => { await fs.writeFile(path.join(root, name), text); expected.set(name, { text, mtime: (await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString() }); };
  await put('a.' + ext, wrap(body, ext)); await put('b.' + ext, wrap(body, ext)); await fs.mkdir(path.join(root, 'Derived')); await put('Derived/manual.txt', 'Synthetic human-owned reference material.');
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] as string[], locale }, store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const request = vi.fn(async () => { throw Error('Forbidden model request'); }), c = new ThirdBrainController(sources, store, () => settings, () => ({ request }), async () => {});
  const hostOpens: string[] = [], selections: unknown[] = [];
  const leaf = { view: Object.create(MarkdownView.prototype), openFile: async (file: { path: string }) => { hostOpens.push(file.path); leaf.view.file = file; leaf.view.getMode = () => 'source'; leaf.view.editor = { getValue: () => expected.get(file.path)?.text ?? '', setSelection: (...args: unknown[]) => selections.push(args), scrollIntoView: () => {} }; } };
  const plugin = Object.assign(Object.create(ThirdBrainPlugin.prototype), { settings, controller: c, store, app: { vault: { getFileByPath: (p: string) => ({ path: p, extension: path.extname(p).slice(1) }) }, workspace: { getLeaf: () => leaf } } }) as ThirdBrainPlugin;
  const port = plugin.panelPort(), finds: Promise<SearchResult[]>[] = [], opens: Promise<void>[] = [], generated: Promise<void>[] = [];
  const find = port.find.bind(port), open = port.open.bind(port), fragment = port.openFragment!.bind(port);
  vi.spyOn(port, 'find').mockImplementation((...args) => { const p = find(...args); finds.push(p); return p; }); vi.spyOn(port, 'open').mockImplementation(e => { const p = open(e); opens.push(p); return p; }); vi.spyOn(port, 'openFragment').mockImplementation(id => { const p = fragment(id); generated.push(p); return p; });
  vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) }); const container = new Node('main'), dispose = mountPanel(container as unknown as HTMLElement, port, locale);
  const query = async () => { const input = container.all().find(n => n.className === 'tb-idea')!; input.value = 'indigo latch'; input.fire('input'); container.all().find(n => n.tag === 'button' && n.textContent === messages(locale).find)!.fire('click'); const hits = await finds.at(-1)!; await Promise.resolve(); return hits; };
  const originals = async () => { for (const [name, e] of expected) { expect(hash(await fs.readFile(path.join(root, name)))).toBe(hash(e.text)); expect((await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString()).toBe(e.mtime); } expect(request).not.toHaveBeenCalled(); };
  const close = async () => { await Promise.allSettled([...finds, ...opens, ...generated]); dispose(); c.dispose(); };
  return { root, put, settings, store, sources, c, container, port, query, finds, opens, generated, hostOpens, selections, originals, close };
}
it.each([['md', 'en'], ['md', 'zh'], ['canvas', 'en'], ['canvas', 'zh']] as const)('actual %s/%s idea → reference context → strict store → all Main renderer source/generated actions', async (ext, locale) => {
  const f = await fixture(ext, locale); try {
    await f.c.initialize(); await f.c.refresh(); await f.c.initialize(); const hits = await f.query(); expect(hits).toHaveLength(1);
    const card = hits[0].fragment; expect(card.summary).toContain(definition); expect(new Set(card.evidence.map(e => e.relativePath)).size).toBe(2);
    const visible = f.container.all().find(n => n.className === 'tb-fragment')!; expect(visible.text()).toContain(condition);
    for (const b of f.container.all().filter(n => n.className === 'tb-source')) { b.fire('click'); await f.opens.at(-1); }
    f.container.all().find(n => n.tag === 'button' && n.textContent === messages(locale).openFragment)!.fire('click'); await f.generated.at(-1);
    expect(f.opens).toHaveLength(card.evidence.length); expect(f.generated).toHaveLength(1); expect(f.hostOpens.at(-1)).toBe(await f.store.fragmentPath(card.id)); if (ext === 'md') expect(f.selections).toHaveLength(card.evidence.length);
    const rendered = await fs.readFile(path.join(f.root, await f.store.fragmentPath(card.id)), 'utf8');
    expect(rendered).toContain('\\[scope\\]: \\<synthetic-boundary.md\\> "' + condition + '"'); expect(rendered).toContain(condition); expect(rendered).not.toContain(definition);
    const statePath = path.join(f.root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath); await f.c.refresh(); expect(await fs.readFile(statePath)).toEqual(state);
    await f.put('b.' + ext, wrap(body.replace(definition, opposite), ext)); for (const e of card.evidence) await expect(f.c.verifyOpen(e)).rejects.toThrow(); expect(await f.c.find('indigo latch', 'medium')).toHaveLength(0); expect(await fs.readFile(statePath)).toEqual(state);
    await f.c.refresh(); await f.c.initialize(); const current = await f.query(); expect(current).toHaveLength(2); expect(current.some(r => r.fragment.summary.includes(opposite))).toBe(true); for (const r of current) for (const e of r.fragment.evidence) await f.port.open(e);
    f.settings.excludes.push('b.' + ext); for (const e of current.find(r => r.fragment.summary.includes(opposite))!.fragment.evidence) await expect(f.c.verifyOpen(e)).rejects.toThrow(); f.settings.excludes.pop(); await f.originals();
  } finally { await f.close(); }
});
it('actual failed refresh/cancel/retry retain saved bytes, human protection and original hashes/mtimes', async () => {
  const f = await fixture('md', 'en'); try {
    await f.c.initialize(); await f.c.refresh(); const statePath = path.join(f.root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath), commit = vi.spyOn(f.store, 'commit');
    await f.put('b.md', wrap(body.replace(definition, '[scope]: <synthetic-boundary.md> "Only ' + '合'.repeat(16384) + '"'), 'md')); await expect(f.c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    for (const def of [definition + '\n[SCOPE]: <other.md> "Opposing restriction."', '[scope]: <dummy.md>\n"Unclosed restriction']) {
      await f.put('b.md', wrap(body.replace(definition, def), 'md')); await expect(f.c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    }
    await f.put('b.md', wrap(body, 'md')); const list = f.sources.list.bind(f.sources); let entered!: () => void, release!: () => void; const started = new Promise<void>(r => { entered = r; }), latch = new Promise<void>(r => { release = r; });
    vi.spyOn(f.sources, 'list').mockImplementationOnce(async options => { entered(); await latch; return list(options); }); const cancelled = f.c.refresh(); await started; f.c.cancel(); release(); await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' }); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    await f.c.refresh(); await f.c.initialize(); const index = (await f.store.load())!, target = Object.values(index.fragments).find(v => v.summary.includes(point))!; expect(target.summary).toContain(condition); const stable = await fs.readFile(statePath); await f.c.refresh(); expect(await fs.readFile(statePath)).toEqual(stable);
    const file = path.join(f.root, await f.store.fragmentPath(target.id)); await fs.appendFile(file, '\nSynthetic human amendment.'); await expect(f.c.refresh()).rejects.toThrow(); expect(await fs.readFile(statePath)).toEqual(stable); expect(await fs.readFile(file, 'utf8')).toContain('Synthetic human amendment.'); await f.originals();
  } finally { await f.close(); }
});
it('retains full/collapsed/shortcut/image definitions, folded labels and multiline titles exactly; no fetching or prose inference', async () => {
  for (const nl of ['\n', '\r\n', '\r']) {
    const def = '   [Scope  A]:\n  <synthetic trial.md>\n  "Only inert chambers;\n  a warm rim is the counterexample."';
    const raw = ('# Synthetic trial\nA porcelain witness checks [the boundary][SCOPE a](literal aside), [scope a][], [scope a] and ![a sketch][scope a].\n\n' + def + '\n\n[unused]: <other.md> "Unrelated amber register."\n\nAn unrelated mint gauge stays independent.').replace(/\n/gu, nl);
    const all = (await analyzeSource(snap(raw), opts)).fragments, f = all.find(f => f.summary.includes('porcelain witness'))!;
    expect(f.summary).toContain(def.replace(/\n/gu, nl)); expect(f.summary.match(/\[Scope  A\]:/gu)).toHaveLength(1); expect(f.summary).not.toContain('amber register'); expect(f.summary).not.toContain('mint gauge');
    expect(all.some(f => f.summary.includes('amber register'))).toBe(true); expect(all.some(f => f.summary.includes('mint gauge'))).toBe(true); for (const e of f.evidence) expect(raw.slice(e.start, e.end)).toBe(e.quote);
  }
  const raw = '[边界]: <合成.md> (仅限断开的试验箱；温热边缘是反例。)\n\n# 合成检查\n靛色标记检查[边界]。';
  expect((await analyzeSource(snap(raw), opts)).fragments.find(f => f.summary.includes('靛色标记'))!.summary).toContain('温热边缘是反例');
  const different = await buildIndex([snap(body, 'a.md'), snap(body.replace('synthetic-boundary.md', 'other-boundary.md'), 'b.md')], { ...opts, previous: emptyIndex(), signature: generationSignature(defaults) });
  expect(Object.values(different.fragments).filter(f => f.summary.includes(point))).toHaveLength(2);
});
it('definitions in headings/introductions/siblings/footnotes keep complete evidence, but title brackets stay literal', async () => {
  const raw = '# Trial[scope]\nOnly use [scope]:\n- Shared observations:\n  - The indigo latch records one point[^a].\n  - The amber wheel records a second point[scope].\n\n[^a]: The boundary is [scope].\n\n## Definitions[^b]\n[scope]: <fixture.md> "Keep literal [missing] and [^not-a-footnote]."\n\n[^b]: Only the disconnected synthetic chamber.';
  const all = (await analyzeSource(snap(raw), opts)).fragments; expect(all).toHaveLength(2);
  for (const f of all) { expect(f.summary).toContain('[scope]:'); expect(f.summary).toContain('Only the disconnected'); expect(f.localContext).toBeDefined(); for (const e of f.evidence) expect(raw.slice(e.start, e.end)).toBe(e.quote); }
  const quoted = '> Only [scope]:\n> - The indigo latch records the trial.\n\n[scope]: <dummy.md> "Only inert chambers."';
  expect((await analyzeSource(snap(quoted), opts)).fragments[0].summary).toContain('Only inert chambers.');
});
it('inline/escaped/wiki/fenced/hidden literals and separate Canvas nodes do not invent reference context', async () => {
  const raw = '# Synthetic trial\nThe indigo witness uses `[scope]`, ``[scope][]``, \\[scope], [[scope]], [scope](fixture.md) and [text](fixture-[scope].md).\n\n[scope]: <dummy.md> "Only inert chambers."\n\n```md\n[hidden]: <mock.md> "Fenced restriction."\n```\n\n<!--\n[hidden]: <mock.md> "Comment restriction."\n-->\n\nA porcelain witness keeps [missing][hidden] as literal text.';
  const all = (await analyzeSource(snap(raw), opts)).fragments, f = all.find(f => f.summary.includes('indigo witness'))!; expect(f.summary).not.toContain('Only inert'); expect(all.find(f => f.summary.includes('porcelain witness'))!.summary).not.toContain('restriction');
  const canvas = JSON.stringify({ nodes: [{ type: 'text', text: point }, { type: 'text', text: definition }], edges: [] }); const c = (await analyzeSource(snap(canvas, 'synthetic.canvas'), opts)).fragments; expect(c.find(f => f.summary.includes(point))!.summary).not.toContain(condition);
  const literal = 'A porcelain witness records a syntax example.\n[scope]: <dummy.md> "Not a block definition."\n\nThe indigo latch checks [scope].';
  expect((await analyzeSource(snap(literal), opts)).fragments.find(f => f.summary.includes('indigo latch'))!.summary).not.toContain('Not a block');
});
it.each([
  '[scope]: <a.md> "Only inert chambers."\n[SCOPE]: <b.md> "Never inert chambers."',
  '[scope]: <a.md> "Unclosed title',
  '[scope]: <a.md>\n"Unclosed title',
  '[scope]: <a.md> "Only <!-- hidden --> chambers."',
  '[scope]: <a.md> "Only %%hidden%% chambers."',
])('refuses ambiguous/unsupported/hidden referenced definitions, without partial output', async def => {
  await expect(analyzeSource(snap(point + '\n\n' + def), opts)).rejects.toThrow();
});
it.each(['md', 'canvas'])('actual %s retains the combined 256 quotation limit within a source and across donors', async ext => {
  const base = path.resolve('.local/local-references'); await fs.mkdir(base, { recursive: true }); const root = await fs.mkdtemp(path.join(base, 'bounds-'));
  const make = (count: number) => wrap('An indigo witness records the trial ' + Array.from({ length: count }, (_, i) => '[n' + i + ']').join(' ') + '.\n\n' + Array.from({ length: count }, (_, i) => '[n' + i + ']: <fixture-' + i + '.md>').join('\n'), ext);
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
it('counts full definitions/siblings in the unchanged text bound and keeps CRLF copies merged', async () => {
  const prefix = 'An indigo witness records the trial[scope].', def = '[scope]: <fixture.md> "';
  const legal = prefix + '\n\n' + def + '合'.repeat(16384 - (prefix + '\n\n' + def + '"').length) + '"';
  const all = (await analyzeSource(snap(legal), opts)).fragments; expect(all).toHaveLength(1); expect(all[0].summary).toHaveLength(16384); await expect(analyzeSource(snap(legal.replace('"', '"合')), opts)).rejects.toThrow();
  await expect(analyzeSource(snap('- Only the mock trial:\n  - The indigo witness records [scope].\n  - The amber wheel records another point.\n\n' + legal.slice(prefix.length + 2)), opts)).rejects.toThrow();
  const merged = await buildIndex([snap(body, 'a.md'), snap(body.replace(/\n/gu, '\r\n'), 'b.md')], { ...opts, previous: emptyIndex(), signature: generationSignature(defaults) }); const hits = Object.values(merged.fragments).filter(f => f.summary.includes(point)); expect(hits).toHaveLength(1); expect(new Set(hits[0].evidence.map(e => e.relativePath)).size).toBe(2);
});
it('actual decoded private Canvas stores and opens a complete multiline definition, then rejects a title-only revision', async () => {
  const f = await fixture('canvas', 'zh'); try {
    const multi = '[scope]:\n  <synthetic-boundary.md>\n  "' + condition + '\n  A warm rim is the counterexample."';
    await f.put('a.canvas', wrap(body.replace(definition, multi), 'canvas')); await f.put('b.canvas', wrap(body.replace(definition, multi), 'canvas'));
    await f.c.initialize(); await f.c.refresh(); await f.c.initialize(); const hits = await f.query(); expect(hits).toHaveLength(1); const card = hits[0].fragment; expect(card.privacy).toBe('private'); expect(card.summary).toContain(multi); expect(card.evidence.some(e => e.start === -1 && e.quote === multi)).toBe(true);
    for (const e of card.evidence) await f.port.open(e); const statePath = path.join(f.root, 'Derived/.third-brain/state.json'), saved = await fs.readFile(statePath); await f.c.refresh(); expect(await fs.readFile(statePath)).toEqual(saved);
    await f.put('b.canvas', wrap(body.replace(definition, multi.replace('warm rim', 'cold rim')), 'canvas')); for (const e of card.evidence) await expect(f.c.verifyOpen(e)).rejects.toThrow(); expect(await fs.readFile(statePath)).toEqual(saved); await f.originals();
  } finally { await f.close(); }
});
it('AI primary/background/vocabulary and both generation signatures are unchanged offline', async () => {
  const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-reference-legacy.json', 'utf8'));
  for (const mode of ['local-model', 'cloud-model'] as const) { expect(generationSignature({ ...defaults, mode })).toBe(legacy.signatures[mode]); const requests: ModelRequest[] = []; await analyzeSource(snap(body), { mode, cloudConsent: true, model: { request: async r => { requests.push(r); return { version: 1, decision: 'insufficient-context', fragments: [] }; } } }); expect(requests).toEqual(legacy.requests[mode]); }
  expect(generationSignature(defaults)).not.toBe(legacy.signatures['local-excerpts']);
});
it('actual old generation bytes load unchanged, upgrade once through Controller and remain idempotent with history', async () => {
  const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-reference-legacy.json', 'utf8')), f = await fixture('md', 'en'); try {
    const snapshots = await f.sources.list(); await f.store.commit(structuredClone(legacy.oldIndex), () => f.sources.verify(snapshots)); const statePath = path.join(f.root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath);
    const marker = JSON.parse(await fs.readFile(path.join(f.root, 'Derived/.third-brain/marker.json'), 'utf8')), oldFiles: Buffer[] = [];
    for (const id of Object.keys(legacy.oldIndex.fragments)) { const bytes = await fs.readFile(path.join(f.root, await f.store.fragmentPath(id))); expect(bytes.toString().replaceAll(marker.storeId, 'SYNTHETIC_STORE_ID')).toBe(legacy.rendered[id]); oldFiles.push(bytes); }
    await f.c.initialize(); expect(await f.store.load()).toEqual(legacy.oldIndex); expect(await fs.readFile(statePath)).toEqual(state); await f.c.refresh(); await f.c.initialize(); const hits = await f.query(); expect(hits).toHaveLength(1); expect(hits[0].fragment.summary).toContain(definition); expect((await f.store.load())!.signature).not.toBe(legacy.oldIndex.signature);
    const saved = await fs.readFile(statePath); await f.c.refresh(); expect(await fs.readFile(statePath)).toEqual(saved);
    const history = await fs.readdir(path.join(f.root, 'Derived/.third-brain/history'), { recursive: true, withFileTypes: true }), backups = await Promise.all(history.filter(e => e.isFile()).map(e => fs.readFile(path.join(e.parentPath, e.name)))); for (const b of oldFiles) expect(backups.some(v => v.equals(b))).toBe(true); await f.originals();
  } finally { await f.close(); }
});
