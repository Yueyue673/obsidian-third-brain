// SPDX-License-Identifier: MIT
// Authored synthetic callouts. Offline protocol captures and DOM/host shells,
// not real-model semantic evidence or native Obsidian clicks.
// https://help.obsidian.md/callouts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { MarkdownView } from 'obsidian';
import ThirdBrainPlugin from '../src/main';
import { analyzeSource, prepareSource } from '../src/core';
import type { IndexState, ModelRequest, SearchResult } from '../src/core/types';
import { hasReadableQuote, textBlocks } from '../src/core/sources';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
vi.mock('obsidian', () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, MarkdownView: class {} }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-callout-title-legacy.json', 'utf8'));
const options = { mode: 'local-excerpts' as const, cloudConsent: false };
const snap = (raw: string, name = 'synthetic.md') => prepareSource(name, raw, hash(raw), hash(name).slice(0, 24));
const encode = (raw: string, ext: string) => ext === 'md' ? raw : JSON.stringify({ nodes: [{ type: 'text', text: '---\nprivacy: private\n---\n' + raw }], edges: [] });
const { allowed, opposite, action, later, late } = legacy as { allowed: string; opposite: string; action: string; later: string; late: string };
for (const fold of ['', '+', '-']) for (const colon of ['', ':']) {
  it(`keeps the ${fold || 'plain'}/${colon ? 'colon' : 'no-colon'} callout title on a later paragraph without inventing scope outside it`, async () => {
    const title = `> [!warning]${fold} ${allowed}${colon}`;
    const raw = title + '\n>\n> 1. ' + action + '\n>    - Example: inert paper mockups.\n> 2. Check the isolated ivory pin.\n>\n> ' + later + '\n\n' + late;
    const r = await analyzeSource(snap(raw), options), hit = r.fragments.find(f => f.summary.includes(later))!;
    expect(hit.summary).toContain(title); expect(hit.summary.match(/\[!warning\]/gu)).toHaveLength(1);
    expect(r.fragments.find(f => f.summary.includes(action))!.summary).toContain('Example: inert paper mockups.');
    expect(r.fragments.find(f => f.summary.includes(late))!.summary).toBe(late);
    if (colon) { expect(hit.summary).not.toContain(action); expect(hit.evidence.some(e => e.quote === title)).toBe(true); }
    for (const f of r.fragments) for (const e of f.evidence) expect(raw.slice(e.start, e.end)).toBe(e.quote);
  });
}
it('does not reinterpret ordinary quotes, literal/escaped/unsupported callout markers, or leak title scope between quote runs/nodes', async () => {
  for (const header of ['Only on the inert rig:', '`[!warning]` Only on the inert rig:', '\\[!warning] Only on the inert rig:', '[!warning|custom] Only on the inert rig:']) {
    const r = await analyzeSource(snap('> ' + header + '\n>\n> 1. ' + action + '\n>\n> ' + later), options);
    expect(r.fragments.find(f => f.summary.includes(later))!.summary).toBe('> ' + later);
  }
  const first = '> [!warning]- ' + allowed + ':\n>\n> 1. ' + action;
  const raw = first + '\n\n> ' + later;
  expect((await analyzeSource(snap(raw), options)).fragments.find(f => f.summary.includes(later))!.summary).toBe('> ' + later);
  const nodes = JSON.stringify({ nodes: [{ type: 'text', text: first }, { type: 'text', text: '> ' + later }], edges: [] });
  expect((await analyzeSource(snap(nodes, 'synthetic.canvas'), options)).fragments.find(f => f.summary.includes(later))!.summary).toBe('> ' + later);
  const literal = 'Literal `<!--` and `%%` syntax examples remain ordinary prose.';
  expect((await analyzeSource(snap(first + '\n\n' + literal), options)).fragments.some(f => f.summary === literal)).toBe(true);
});
it('preserves quote prefixes and complete Unicode/newline evidence, counting the inherited title inside the unchanged bound', async () => {
  for (const newline of ['\n', '\r\n', '\r']) {
    const raw = '> [!warning]+ 仅在合成腔室关闭时：\n>\n> 1. 旋转紫色合成旋钮。\n>\n> 后面的锁扣需要干燥芦苇套。';
    const input = raw.replace(/\n/gu, newline), r = await analyzeSource(snap(input), options), hit = r.fragments.find(f => f.summary.includes('后面的锁扣'))!;
    expect(hit.summary).toContain('> [!warning]+ 仅在合成腔室关闭时：'); for (const e of hit.evidence) expect(input.slice(e.start, e.end)).toBe(e.quote);
  }
  const title = '> [!warning]- ' + allowed + ':', prefix = title + '\n>\n> 1. ' + action + '\n>\n';
  const paragraph = '> ' + '合'.repeat(16384 - title.length - 4);
  const r = await analyzeSource(snap(prefix + paragraph), options); expect(r.fragments.find(f => f.summary.includes('合'))!.summary).toHaveLength(16384);
  await expect(analyzeSource(snap(prefix + paragraph + '尾'), options)).rejects.toThrow();
  const longTitle = '> [!warning] ' + 'Only on the disconnected inert synthetic rig '.repeat(40) + ':';
  expect(longTitle.length).toBeGreaterThan(1400); expect((await analyzeSource(snap(longTitle + '\n>\n> 1. ' + action + '\n>\n> ' + later), options)).fragments.find(f => f.summary.includes(later))!.summary).toContain(longTitle);
});
it('refuses hidden title/first-parent context rather than exposing a bare action, while AI primary requests and signatures remain exact offline', async () => {
  for (const marker of ['<!-- hidden -->', '%% hidden %%']) await expect(analyzeSource(snap('> [!warning] Only ' + marker + ' on the inert rig:\n>\n> 1. ' + action + '\n>\n> ' + later), options)).rejects.toThrow();
  const inputs = Object.entries(legacy.raws as Record<string, string>).map(([name, raw]) => snap(raw, name)); expect(inputs.map(s => textBlocks(s))).toEqual(legacy.aiBlocks);
  expect(generationSignature({ ...defaults, outputFolder: 'Derived' })).not.toBe(legacy.signatures['local-excerpts']);
  for (const mode of ['local-model', 'cloud-model'] as const) {
    expect(generationSignature({ ...defaults, outputFolder: 'Derived', mode })).toBe(legacy.signatures[mode]); const requests: ModelRequest[] = [];
    await analyzeSource(inputs[0], { mode, cloudConsent: true, model: { request: async r => { requests.push(r); return { version: 1, decision: 'insufficient-context', fragments: [] }; } } }); expect(requests).toEqual(legacy.requests[mode]);
  }
});
async function fixture(ext: string, long = true) {
  const scope = path.resolve('.local/callout-title'); await fs.mkdir(scope, { recursive: true }); const root = await fs.mkdtemp(path.join(scope, ext + '-'));
  const originals = new Map<string, { text: string; mtime: string }>(), put = async (name: string, text: string) => { await fs.writeFile(path.join(root, name), text); originals.set(name, { text, mtime: (await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString() }); };
  for (const [name, short] of Object.entries(legacy.raws as Record<string, string>)) {
    const raw = long ? ('The archive records independent flax paper textures and inert specimens. '.repeat(26)).trim() + '\n\n' + short : short;
    if (long) { expect(raw.indexOf(action)).toBeGreaterThan(1400); expect(raw.indexOf(action)).toBeGreaterThan(raw.length / 2); }
    await put(name.replace('.md', '.' + ext), encode(raw, ext));
  }
  await fs.mkdir(path.join(root, 'Derived')); await put('Derived/manual.txt', 'Synthetic human-authored material, not generated.');
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] as string[] }, store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const factory = vi.fn(() => undefined), saved = vi.fn(async () => {}), c = new ThirdBrainController(sources, store, () => settings, factory, saved);
  const protect = async () => { for (const [name, v] of originals) { expect(await fs.readFile(path.join(root, name), 'utf8')).toBe(v.text); expect((await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString()).toBe(v.mtime); } expect(factory.mock.results.every(r => r.value === undefined)).toBe(true); };
  const targets = async () => { const i = (await store.load())!, names = ['Derived/.third-brain/state.json']; for (const id of Object.keys(i.fragments)) names.push(await store.fragmentPath(id)); return Promise.all(names.map(async name => ({ name, bytes: await fs.readFile(path.join(root, name)), mtime: (await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString() }))); };
  const unchanged = async (before: Awaited<ReturnType<typeof targets>>) => { for (const v of before) { expect(await fs.readFile(path.join(root, v.name))).toEqual(v.bytes); expect((await fs.stat(path.join(root, v.name), { bigint: true })).mtimeNs.toString()).toBe(v.mtime); } };
  return { root, originals, put, settings, store, sources, factory, saved, c, protect, targets, unchanged };
}
it('loads exact old state/bytes, repairs the later opposing callout paragraphs once, keeps history and reruns without writes', async () => {
  const f = await fixture('md', false); try {
    const inputs = await f.sources.list(); await f.store.commit(structuredClone(legacy.old) as IndexState, () => f.sources.verify(inputs)); const old = await f.targets();
    await f.c.initialize(); expect(await f.store.load()).toEqual(legacy.old); await f.unchanged(old); const commit = vi.spyOn(f.store, 'commit');
    await f.c.refresh(); expect(commit).toHaveBeenCalledTimes(1); await f.c.initialize(); const current = (await f.store.load())!, hits = await f.c.find('heliotrope latch', 'medium'); expect(hits).toHaveLength(2); expect(hits.every(r => r.fragment.summary.includes('[!warning]-'))).toBe(true);
    expect(current.signature).not.toBe(legacy.old.signature); for (const prior of Object.values(legacy.old.fragments) as IndexState['fragments'][string][]) if (prior.summary.includes(action)) { const refreshed = current.fragments[prior.id]; expect({ ...refreshed, updatedAt: prior.updatedAt }).toEqual(prior); expect(Date.parse(refreshed.updatedAt)).toBeGreaterThanOrEqual(Date.parse(prior.updatedAt)); }
    const history = await fs.readdir(path.join(f.root, 'Derived/.third-brain/history'), { recursive: true, withFileTypes: true }), bodies = await Promise.all(history.filter(v => v.isFile()).map(v => fs.readFile(path.join(v.parentPath, v.name))));
    for (const file of old.filter(v => v.name.includes('fragment-') && !Object.keys(current.fragments).some(id => v.name.endsWith('fragment-' + id.slice(2) + '.md')))) expect(bodies.some(b => b.equals(file.bytes))).toBe(true);
    const before = await f.targets(); await f.c.refresh(); await f.unchanged(before); await f.protect();
  } finally { f.c.dispose(); }
});
class Node {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false; children: Node[] = []; handlers = new Map<string, (() => void)[]>();
  constructor(readonly tag: string) {} append(...n: Node[]) { this.children.push(...n); } replaceChildren(...n: Node[]) { this.children = n; } setAttribute() {} remove() {} focus() {} get childElementCount() { return this.children.length; }
  addEventListener(k: string, h: () => void) { this.handlers.set(k, [...this.handlers.get(k) ?? [], h]); } fire(k: string) { for (const h of this.handlers.get(k) ?? []) h(); } all(): Node[] { return [this, ...this.children.flatMap(n => n.all())]; } text(): string { return [this.textContent, ...this.children.map(n => n.text())].join('\n'); }
}
it.each([['md', 'en'], ['md', 'zh'], ['canvas', 'en'], ['canvas', 'zh']] as const)('actual %s/%s long-note idea → strict store → Main renderer → every original/generated action and current endpoint', async (ext, locale) => {
  const f = await fixture(ext), queries: Promise<SearchResult[]>[] = [], operations: Promise<void>[] = []; let dispose: (() => void) | undefined;
  try {
    await f.c.initialize(); await f.c.refresh(); await f.c.initialize(); const index = (await f.store.load())!;
    const opened: string[] = [], leaf = { view: Object.create(MarkdownView.prototype), openFile: async (file: { path: string }) => { opened.push(file.path); leaf.view.file = file; leaf.view.getMode = () => 'source'; leaf.view.editor = { getValue: () => f.originals.get(file.path)?.text ?? '', setSelection: () => {}, scrollIntoView: () => {} }; } };
    const plugin = Object.assign(Object.create(ThirdBrainPlugin.prototype), { controller: f.c, store: f.store, settings: f.settings, app: { vault: { getFileByPath: (n: string) => ({ path: n, extension: path.extname(n).slice(1) }) }, workspace: { getLeaf: () => leaf } } }) as ThirdBrainPlugin;
    const port = plugin.panelPort(), find = port.find.bind(port), open = port.open.bind(port), generated = port.openFragment!.bind(port);
    vi.spyOn(port, 'find').mockImplementation((...a) => { const p = find(...a); queries.push(p); return p; }); vi.spyOn(port, 'open').mockImplementation(e => { const p = open(e); operations.push(p); return p; }); vi.spyOn(port, 'openFragment').mockImplementation((...a) => { const p = generated(...a); operations.push(p); return p; });
    vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) }); const box = new Node('main'), t = messages(locale); dispose = mountPanel(box as unknown as HTMLElement, port, locale);
    const search = async (q: string) => { const input = box.all().find(n => n.className === 'tb-idea')!; input.value = q; input.fire('input'); box.all().find(n => n.tag === 'button' && n.textContent === t.find)!.fire('click'); const hits = await queries.at(-1)!; await Promise.resolve(); return hits; };
    const actions = (card: Node) => card.all().filter(n => n.className === 'tb-source' || n.tag === 'button' && n.textContent === t.openFragment);
    let old: Node | undefined;
    for (const query of ['vermillion escrow ring', 'heliotrope latch']) {
      const hits = await search(query); expect(hits).toHaveLength(2); const cards = box.all().filter(n => n.className === 'tb-result'); expect(cards).toHaveLength(2);
      for (const [i, card] of cards.entries()) {
        const fragment = hits[i].fragment; expect(card.text()).toContain('[!warning]-'); expect(card.text()).toContain(fragment.summary.includes(allowed) ? allowed : opposite); expect(card.text()).toContain(t.excerpt); expect(card.text()).not.toContain(late); expect(hits[i].reasons.length).toBeGreaterThan(0);
        if (query.includes('vermillion')) { expect(card.text()).toContain('Counterexample: powered machinery'); expect(card.text()).toContain('2. Verify the ivory pin'); } else { expect(card.text()).toContain(later); expect(fragment.summary).not.toContain(action); }
        expect(new Set(fragment.evidence.map(e => e.relativePath)).size).toBe(fragment.summary.includes(allowed) ? 2 : 1); expect(actions(card)).toHaveLength(fragment.evidence.length + 1);
        for (const e of fragment.evidence) { const s = (await f.sources.read(e.relativePath))!; expect(e.sourceId).toBe(s.id); expect(e.sourceHash).toBe(s.hash); expect(index.sources[e.relativePath].fragmentIds).toContain(fragment.id); if (e.start >= 0) expect(s.text.slice(e.start, e.end)).toBe(e.quote); else expect(hasReadableQuote(s, e.quote)).toBe(true); }
        for (const button of actions(card)) { button.fire('click'); await operations.at(-1); }
      }
      old = cards.find(n => n.text().includes(allowed));
    }
    const name = 'copy.' + ext, original = f.originals.get(name)!.text; await f.put(name, original.replace(allowed, 'Only while the synthetic chamber has changed')); let count = opened.length;
    for (const button of actions(old!)) { button.fire('click'); await expect(operations.at(-1)).rejects.toThrow(); } expect(opened).toHaveLength(count); expect((await f.c.find('heliotrope latch', 'medium')).some(r => r.fragment.summary.includes(allowed))).toBe(false);
    await f.put(name, original); f.settings.excludes.push(name); count = opened.length; for (const button of actions(old!)) { button.fire('click'); await expect(operations.at(-1)).rejects.toThrow(); } expect(opened).toHaveLength(count); f.settings.excludes.pop();
    const tails = await search('spindle ledger'); expect(tails).toHaveLength(1); expect(tails[0].fragment.summary).toBe(late); const tail = box.all().find(n => n.className === 'tb-result')!; for (const button of actions(tail)) { button.fire('click'); await operations.at(-1); }
    expect(opened.some(n => n.startsWith('Derived/fragment-'))).toBe(true); expect(opened.some(n => !n.startsWith('Derived/'))).toBe(true); if (ext === 'canvas') expect(Object.values(index.fragments).every(f => f.privacy === 'private')).toBe(true);
    const before = await f.targets(); await f.c.refresh(); await f.unchanged(before); await f.protect();
    const inventory = (await fs.readdir(path.join(f.root, 'Derived'), { recursive: true, withFileTypes: true })).filter(n => n.isFile()).map(n => path.relative(path.join(f.root, 'Derived'), path.join(n.parentPath, n.name)));
    expect(inventory.some(n => /(?:stage|backup|work)[/\\]/u.test(n))).toBe(false);
  } finally { await Promise.allSettled([...queries, ...operations]); dispose?.(); f.c.dispose(); }
});
it.each(['md', 'canvas'])('actual %s title overflow/hidden, cancel and human edits preserve owned bytes without commit; repaired retry stays idempotent', async ext => {
  const f = await fixture(ext); try {
    await f.c.initialize(); await f.c.refresh(); const before = await f.targets(), commit = vi.spyOn(f.store, 'commit'), name = 'a.' + ext, raw = f.originals.get(name)!.text; f.saved.mockClear();
    for (const text of ['> [!warning] Only on the inert rig:\n>\n> 1. ' + action + '\n>\n> ' + '合'.repeat(16384), '> [!warning] Only %% hidden %% on the inert rig:\n>\n> 1. ' + action + '\n>\n> ' + later]) {
      await f.put(name, encode(text, ext)); await expect(f.c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(f.saved).not.toHaveBeenCalled(); await f.unchanged(before);
      await f.put(name, raw); await f.c.refresh(); await f.unchanged(before); commit.mockClear(); f.saved.mockClear();
    }
    const list = f.sources.list.bind(f.sources); let enter!: () => void, release!: () => void; const entered = new Promise<void>(r => { enter = r; }), latch = new Promise<void>(r => { release = r; }); vi.spyOn(f.sources, 'list').mockImplementationOnce(async o => { enter(); await latch; return list(o); });
    const pending = f.c.refresh(); await entered; f.c.cancel(); release(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); expect(commit).not.toHaveBeenCalled(); expect(f.saved).not.toHaveBeenCalled(); await f.unchanged(before); await f.c.refresh(); await f.unchanged(before);
    const target = before.find(v => v.name.includes('fragment-'))!; await fs.writeFile(path.join(f.root, target.name), Buffer.concat([target.bytes, Buffer.from('\nSynthetic human amendment.')])); await expect(f.c.refresh()).rejects.toThrow(); expect(await fs.readFile(path.join(f.root, target.name), 'utf8')).toContain('Synthetic human amendment.'); expect(await fs.readFile(path.join(f.root, 'Derived/.third-brain/state.json'))).toEqual(before[0].bytes);
    await fs.writeFile(path.join(f.root, target.name), target.bytes); await f.c.initialize(); await f.c.refresh(); const repaired = await f.targets(); await f.c.refresh(); await f.unchanged(repaired); await f.protect();
  } finally { f.c.dispose(); }
});
