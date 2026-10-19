// SPDX-License-Identifier: MIT
// Fresh authored synthetic files and offline protocol captures, not AI semantic or native-click evidence.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { MarkdownView } from 'obsidian';
import ThirdBrainPlugin from '../src/main';
import { analyzeSource, prepareSource } from '../src/core';
import { hasReadableQuote } from '../src/core/sources';
import type { IndexState, ModelRequest, SearchResult } from '../src/core/types';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
vi.mock('obsidian', () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, MarkdownView: class {} }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-mixed-checklist-legacy.json', 'utf8'));
const raws: Record<string, string> = legacy.raws;
const action = 'Drain the violet chamber after the inlet is closed.';
const prep = 'Close the cobalt inlet before the trial.';
const opts = { mode: 'local-excerpts' as const, cloudConsent: false, now: '2026-01-01T00:00:00.000Z' };
const snap = (r: string, n = 'synthetic.md') => prepareSource(n, r, hash(r), hash(n).slice(0, 24));
const canvas = (text: string, extra = '') => JSON.stringify({ nodes: [{ type: 'text', text }, ...(extra ? [{ type: 'text', text: extra }] : [])], edges: [] });
const wrap = (text: string, ext: string) => ext === 'canvas' ? canvas('---\nprivacy: private\n---\n' + text) : text;

it.each(['md', 'canvas', 'quoted-md', 'quoted-canvas'])('%s retains mixed same-marker task roots in either order with all preparation and restrictions', async format => {
  const group = '- Record the amber dummy dial.\n- [x] ' + prep + '\n  - Example: a cold dummy gate.\n- ' + action + '\n  - Limitation: inert samples only.\n- Condition: never connect real equipment.';
  for (const marker of ['-', '*', '+']) for (const newline of ['\n', '\r\n', '\r']) {
    let raw = 'Only in the isolated dummy bench:\n\n' + group.replace(/^-/gmu, marker);
    if (format.startsWith('quoted')) raw = raw.split('\n').map(r => '> ' + r).join('\n');
    raw = raw.replace(/\n/gu, newline);
    const s = snap(format.endsWith('canvas') ? canvas(raw) : raw, format.endsWith('canvas') ? 'synthetic.canvas' : 'synthetic.md');
    const all = (await analyzeSource(s, opts)).fragments;
    expect(all).toHaveLength(1); expect(all[0].summary).toContain(prep); expect(all[0].summary).toContain(action); expect(all[0].summary).toContain('Record the amber dummy dial.');
    expect(all[0].summary).toContain('Condition: never connect real equipment.'); expect(all[0].localContext).toBeUndefined();
    for (const e of all[0].evidence) { expect(e.sourceId).toBe(s.id); expect(e.sourceHash).toBe(s.hash); if (e.start >= 0) expect(s.text.slice(e.start, e.end)).toBe(e.quote); else expect(hasReadableQuote(s, e.quote)).toBe(true); }
  }
});

it('keeps independent ordinary roots, nested-only tasks, custom states, changed markers/types and separate nodes outside mixed root grouping', async () => {
  const ordinary = '- Remember the amber archive.\n- File the jade ledger.';
  expect((await analyzeSource(snap(ordinary), opts)).fragments).toHaveLength(2);
  const nested = '- Remember the amber archive:\n  - [x] Prepare the dummy sleeve.\n- File the jade ledger.';
  const separate = (await analyzeSource(snap(nested), opts)).fragments; expect(separate).toHaveLength(2); expect(separate.find(f => f.summary.includes('jade'))!.summary).not.toContain('sleeve');
  for (const suffix of ['* ' + action, '1. ' + action, '- [-] ' + action, '- [x]' + action]) {
    const all = (await analyzeSource(snap('- [x] ' + prep + '\n' + suffix), opts)).fragments;
    expect(all).toHaveLength(2); expect(all.find(f => f.summary.includes(action))!.summary).not.toContain(prep);
  }
  const nodes = (await analyzeSource(snap(canvas('- [x] ' + prep, '- ' + action), 'synthetic.canvas'), opts)).fragments;
  expect(nodes).toHaveLength(2); expect(nodes.find(f => f.summary.includes(action))!.summary).not.toContain(prep);
});

it('ends mixed scope at prose/headings/code/hidden/rules and retains literal prose after ending the old list', async () => {
  for (const boundary of ['\n\nIndependent synthetic prose.\n\n', '\n# Separate synthetic section\n', '\n```\nSynthetic code.\n```\n', '\n<!-- hidden -->\n', '\n%% hidden %%\n', '\n---\n']) {
    const all = (await analyzeSource(snap('- [x] ' + prep + boundary + '- ' + action), opts)).fragments;
    expect(all.find(f => f.summary.includes(action))!.summary).not.toContain(prep);
  }
  for (const marker of ['<!-- hidden -->', '%% hidden %%']) await expect(analyzeSource(snap('- ' + marker + ' Remember amber.\n- [x] ' + prep + '\n- ' + action), opts)).rejects.toThrow();
  const literal = 'Literal `<!--` and `%%` syntax examples remain ordinary prose.';
  expect((await analyzeSource(snap('- [x] ' + prep + '\n\n' + literal), opts)).fragments.some(f => f.summary === literal)).toBe(true);
});

it('versions local caches once while retaining existing AI signatures and complete offline requests', async () => {
  expect(generationSignature({ ...defaults, outputFolder: 'Derived' })).not.toBe(legacy.signatures['local-excerpts']);
  for (const mode of ['local-model', 'cloud-model'] as const) {
    expect(generationSignature({ ...defaults, outputFolder: 'Derived', mode })).toBe(legacy.signatures[mode]);
    const requests: ModelRequest[] = [];
    await analyzeSource(snap(raws['a.md'], 'a.md'), { mode, cloudConsent: true, model: { request: async r => { requests.push(r); return { version: 1, decision: 'insufficient-context', fragments: [] }; } } });
    expect(requests).toEqual(legacy.requests[mode]);
  }
});

async function fixture(ext: string) {
  const scope = path.resolve('.local/local-mixed-checklist'); await fs.mkdir(scope, { recursive: true }); const root = await fs.mkdtemp(path.join(scope, ext + '-'));
  const originals = new Map<string, { text: string; mtime: string }>();
  const put = async (name: string, text: string) => { await fs.writeFile(path.join(root, name), text); originals.set(name, { text, mtime: (await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString() }); };
  for (const [n, r] of Object.entries(raws)) await put(n.replace('.md', '.' + ext), wrap(r, ext));
  await fs.mkdir(path.join(root, 'Derived')); await fs.writeFile(path.join(root, 'Derived/manual.txt'), 'Synthetic human-owned material.');
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] as string[] }, store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const factory = vi.fn(() => undefined), c = new ThirdBrainController(sources, store, () => settings, factory, async () => {});
  const protectedFiles = async () => { for (const [n, v] of originals) { expect(await fs.readFile(path.join(root, n), 'utf8')).toBe(v.text); expect((await fs.stat(path.join(root, n), { bigint: true })).mtimeNs.toString()).toBe(v.mtime); } expect(await fs.readFile(path.join(root, 'Derived/manual.txt'), 'utf8')).toBe('Synthetic human-owned material.'); expect(factory.mock.results.every(r => r.value === undefined)).toBe(true); };
  return { root, originals, settings, store, sources, c, put, protectedFiles };
}

it('actual legacy store loads unchanged, upgrades mixed context once, preserves history and output/state byte+mtime idempotency', async () => {
  const f = await fixture('md'); try {
    const inputs = await f.sources.list(); await f.store.commit(structuredClone(legacy.old) as IndexState, () => f.sources.verify(inputs));
    await f.c.initialize(); expect(await f.store.load()).toEqual(legacy.old);
    const oldPaths: string[] = []; for (const id of Object.keys(legacy.old.fragments)) oldPaths.push(await f.store.fragmentPath(id)); const oldBytes = await Promise.all(oldPaths.map(n => fs.readFile(path.join(f.root, n))));
    await f.c.refresh(); await f.c.initialize(); const index = (await f.store.load())!;
    const found = await f.c.find('violet chamber', 'medium'); expect(found).toHaveLength(2); expect(found.every(r => r.fragment.summary.includes('cobalt inlet'))).toBe(true);
    const merged = found.find(r => r.fragment.summary.includes(prep))!.fragment; expect(new Set(merged.evidence.map(e => e.relativePath)).size).toBe(2); expect(found.find(r => r.fragment.id !== merged.id)!.fragment.summary).toContain('Keep the cobalt inlet open');
    const history = await fs.readdir(path.join(f.root, 'Derived/.third-brain/history'), { recursive: true, withFileTypes: true }), archived = await Promise.all(history.filter(v => v.isFile()).map(v => fs.readFile(path.join(v.parentPath, v.name))));
    for (let i = 0; i < oldPaths.length; i++) if (!Object.keys(index.fragments).some(id => oldPaths[i].endsWith('fragment-' + id.slice(2) + '.md'))) expect(archived.some(b => b.equals(oldBytes[i]))).toBe(true);
    const targets = ['Derived/.third-brain/state.json']; for (const id of Object.keys(index.fragments)) targets.push(await f.store.fragmentPath(id)); const before = await Promise.all(targets.map(async n => ({ bytes: await fs.readFile(path.join(f.root, n)), mtime: (await fs.stat(path.join(f.root, n), { bigint: true })).mtimeNs.toString() })));
    await f.c.refresh(); expect(await f.store.load()).toEqual(index);
    for (let i = 0; i < targets.length; i++) { expect(await fs.readFile(path.join(f.root, targets[i]))).toEqual(before[i].bytes); expect((await fs.stat(path.join(f.root, targets[i]), { bigint: true })).mtimeNs.toString()).toBe(before[i].mtime); }
    await f.protectedFiles();
  } finally { f.c.dispose(); }
});

class Node {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false; children: Node[] = []; handlers = new Map<string, (() => void)[]>();
  constructor(readonly tag: string) {} append(...n: Node[]) { this.children.push(...n); } replaceChildren(...n: Node[]) { this.children = n; } setAttribute() {} remove() {} focus() {} get childElementCount() { return this.children.length; }
  addEventListener(k: string, h: () => void) { this.handlers.set(k, [...this.handlers.get(k) ?? [], h]); } fire(k: string) { for (const h of this.handlers.get(k) ?? []) h(); } all(): Node[] { return [this, ...this.children.flatMap(n => n.all())]; } text(): string { return [this.textContent, ...this.children.map(n => n.text())].join('\n'); }
}

it.each([['md', 'en'], ['canvas', 'zh']] as const)('actual %s/%s → idea → Main/renderer → complete current source and generated actions, including unique late information', async (ext, locale) => {
  const f = await fixture(ext), queries: Promise<SearchResult[]>[] = [], operations: Promise<void>[] = []; let dispose: (() => void) | undefined;
  try {
    await f.c.initialize(); await f.c.refresh(); await f.c.initialize(); const index = (await f.store.load())!;
    const opened: string[] = [], selected: unknown[] = [], leaf = { view: Object.create(MarkdownView.prototype), openFile: async (file: { path: string }) => { opened.push(file.path); leaf.view.file = file; leaf.view.getMode = () => 'source'; leaf.view.editor = { getValue: () => f.originals.get(file.path)?.text ?? '', setSelection: (...a: unknown[]) => selected.push(a), scrollIntoView: () => {} }; } };
    const plugin = Object.assign(Object.create(ThirdBrainPlugin.prototype), { settings: f.settings, controller: f.c, store: f.store, app: { vault: { getFileByPath: (n: string) => ({ path: n, extension: path.extname(n).slice(1) }) }, workspace: { getLeaf: () => leaf } } }) as ThirdBrainPlugin;
    const port = plugin.panelPort(), find = port.find.bind(port), open = port.open.bind(port), generated = port.openFragment!.bind(port);
    vi.spyOn(port, 'find').mockImplementation((...a) => { const p = find(...a); queries.push(p); return p; }); vi.spyOn(port, 'open').mockImplementation(e => { const p = open(e); operations.push(p); return p; }); vi.spyOn(port, 'openFragment').mockImplementation((...a) => { const p = generated(...a); operations.push(p); return p; });
    vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) }); const container = new Node('main'), t = messages(locale); dispose = mountPanel(container as unknown as HTMLElement, port, locale);
    for (const query of ['violet chamber', 'silver spool']) {
      const input = container.all().find(n => n.className === 'tb-idea')!; input.value = query; input.fire('input'); container.all().find(n => n.tag === 'button' && n.textContent === t.find)!.fire('click'); const hits = await queries.at(-1)!; await Promise.resolve(); expect(hits).toHaveLength(query === 'violet chamber' ? 2 : 1);
      const cards = container.all().filter(n => n.className === 'tb-result'); expect(cards).toHaveLength(hits.length);
      for (const card of cards) { expect(card.text()).toContain(t.excerpt); expect(card.text()).toContain(query === 'violet chamber' ? 'cobalt inlet' : 'damp felt is the counterexample'); for (const button of card.all().filter(n => n.className === 'tb-source' || n.tag === 'button' && n.textContent === t.openFragment)) { button.fire('click'); await operations.at(-1); } }
    }
    for (const fragment of Object.values(index.fragments)) for (const e of fragment.evidence) { const s = (await f.sources.read(e.relativePath))!; expect(e.sourceId).toBe(s.id); expect(e.sourceHash).toBe(s.hash); expect(index.sources[e.relativePath].fragmentIds).toContain(fragment.id); if (e.start >= 0) expect(s.text.slice(e.start, e.end)).toBe(e.quote); else expect(hasReadableQuote(s, e.quote)).toBe(true); }
    expect(opened.some(n => n.startsWith('Derived/fragment-'))).toBe(true); expect(opened.some(n => n.endsWith('.' + ext) && !n.startsWith('Derived/'))).toBe(true); if (ext === 'md') expect(selected.length).toBeGreaterThan(0); else expect(Object.values(index.fragments).every(v => v.privacy === 'private')).toBe(true);
    await f.protectedFiles();
  } finally { await Promise.allSettled([...queries, ...operations]); dispose?.(); f.c.dispose(); }
});

it.each(['md', 'canvas'])('actual %s changed preparation/exclusion, cancellation and human edits refuse safely and permit repaired retry', async ext => {
  const f = await fixture(ext); try {
    await f.c.initialize(); await f.c.refresh(); const found = await f.c.find('violet chamber', 'medium'); expect(found).toHaveLength(2); const merged = found.find(r => r.fragment.summary.includes(prep))!.fragment;
    const statePath = path.join(f.root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath), name = 'copy.' + ext;
    await f.put(name, wrap(raws['copy.md'].replace(prep, 'Keep the dummy inlet open.'), ext));
    for (const e of merged.evidence) { await expect(f.c.verifyOpen(e)).rejects.toThrow(); await expect(f.c.verifyFragmentOpen(merged.id, e)).rejects.toThrow(); }
    expect((await f.c.find('violet chamber', 'medium')).some(r => r.fragment.id === merged.id)).toBe(false); expect(await fs.readFile(statePath)).toEqual(state);
    await f.put(name, wrap(raws['copy.md'], ext)); f.settings.excludes.push(name); for (const e of merged.evidence) await expect(f.c.verifyOpen(e)).rejects.toThrow(); f.settings.excludes.pop();
    const list = f.sources.list.bind(f.sources); let entered!: () => void, release!: () => void; const started = new Promise<void>(r => { entered = r; }), latch = new Promise<void>(r => { release = r; }); vi.spyOn(f.sources, 'list').mockImplementationOnce(async o => { entered(); await latch; return list(o); }); const commit = vi.spyOn(f.store, 'commit');
    const refresh = f.c.refresh(); await started; f.c.cancel(); release(); await expect(refresh).rejects.toMatchObject({ name: 'AbortError' }); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state); await f.c.refresh(); expect(await fs.readFile(statePath)).toEqual(state);
    const target = path.join(f.root, await f.store.fragmentPath(merged.id)), bytes = await fs.readFile(target); await fs.writeFile(target, Buffer.concat([bytes, Buffer.from('\nSynthetic human amendment.')])); await expect(f.c.refresh()).rejects.toThrow(); expect(await fs.readFile(statePath)).toEqual(state); expect(await fs.readFile(target, 'utf8')).toContain('Synthetic human amendment.');
    await fs.writeFile(target, bytes); await f.c.initialize(); await f.c.refresh(); expect(await fs.readFile(statePath)).toEqual(state); await f.protectedFiles();
  } finally { f.c.dispose(); }
});

it('mixed whole-group size and 256/257 Canvas evidence bounds reject before commit, including merged overflow, without partial context', async () => {
  const f = await fixture('canvas'); try {
    await f.c.initialize(); await f.c.refresh(); const statePath = path.join(f.root, 'Derived/.third-brain/state.json'), old = await fs.readFile(statePath), commit = vi.spyOn(f.store, 'commit');
    const huge = '- [x] ' + '合'.repeat(9000) + '\n- ' + '成'.repeat(9000); await f.put('a.canvas', canvas(huge)); await expect(f.c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(old);
    const make = (n: number) => canvas('- [x] Prepare the inert dummy gate.\n' + Array.from({ length: n - 1 }, (_, i) => '- Record synthetic tile ' + i + '.').join('\n'));
    for (const n of ['a.canvas', 'copy.canvas', 'opposite.canvas']) await f.put(n, canvas(''));
    await f.put('a.canvas', make(256)); await f.c.refresh(); const all = Object.values((await f.store.load())!.fragments); expect(all).toHaveLength(1); expect(all[0].evidence).toHaveLength(256); const state = await fs.readFile(statePath); commit.mockClear();
    await f.put('a.canvas', make(257)); await expect(f.c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    await f.put('a.canvas', make(129)); await f.put('copy.canvas', make(129)); await expect(f.c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    await f.put('copy.canvas', canvas('')); await f.put('a.canvas', make(256)); await f.c.refresh(); await f.c.initialize(); const repaired = await fs.readFile(statePath); await f.c.refresh(); expect(await fs.readFile(statePath)).toEqual(repaired); await f.protectedFiles();
  } finally { f.c.dispose(); }
});
