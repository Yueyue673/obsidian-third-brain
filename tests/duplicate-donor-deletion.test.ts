// SPDX-License-Identifier: MIT
// Fresh authored synthetic donors. Actual files/core/store/Main/renderer;
// DOM and Obsidian host shells only, not native clicks or AI semantic grading.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { MarkdownView } from 'obsidian';
import ThirdBrainPlugin from '../src/main';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults } from '../src/settings';
import { hasReadableQuote } from '../src/core/sources';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
import type { SearchResult } from '../src/core/types';
vi.mock('obsidian', () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, MarkdownView: class {} }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
class Node {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false;
  children: Node[] = []; handlers = new Map<string, Array<() => void>>();
  constructor(readonly tag: string) {}
  append(...n: Node[]) { this.children.push(...n); } replaceChildren(...n: Node[]) { this.children = n; }
  setAttribute() {} remove() {} focus() {} get childElementCount() { return this.children.length; }
  addEventListener(k: string, h: () => void) { this.handlers.set(k, [...this.handlers.get(k) ?? [], h]); }
  fire(k: string) { for (const h of this.handlers.get(k) ?? []) h(); }
  all(): Node[] { return [this, ...this.children.flatMap(n => n.all())]; }
}
const early = 'The synthetic paper log records the orientation of an inert tile before a dummy trial. '.repeat(22);
const shared = '# Synthetic pressure rehearsal\n\n## Early notes\n' + early + '\n\n## Shared trial\n- Only inside the offline dummy bench:\n  - Record the porcelain gauge at four marks.\n    - Example: a cold inert plate.\n  - Place the ochre token beside the simulated outlet.\n    - Caveat: never apply this to live equipment.';
const donors = [
  { name: 'a.md', privacy: 'normal', label: 'paper witness', tail: 'A silver spool preserves the paper witness only in a dry dummy cabinet; damp felt is the counterexample.' },
  { name: 'b.canvas', privacy: 'local', label: 'linen witness', tail: 'An amber ribbon preserves the linen witness only in a cold dummy drawer; warm glass is the counterexample.' },
  { name: 'c.canvas', privacy: 'private', label: 'ceramic witness', tail: 'A jade tab preserves the ceramic witness only in a dark dummy box; bright chalk is the counterexample.' },
] as const;
async function fixture(locale: 'en' | 'zh') {
  const scope = path.resolve('.local/duplicate-donor-deletion'); await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'vault-'));
  const originals = new Map<string, { text: string; mtime: string }>();
  for (const d of donors) {
    const text = `---\nprivacy: ${d.privacy}\nconcepts: [${d.label}]\n---\n${shared}\n\n## Unique final observation\n${d.tail}`;
    const raw = d.name.endsWith('.canvas') ? JSON.stringify({ nodes: [{ type: 'text', text }], edges: [] }) : text;
    await fs.writeFile(path.join(root, d.name), raw); originals.set(d.name, { text: raw, mtime: (await fs.stat(path.join(root, d.name), { bigint: true })).mtimeNs.toString() });
  }
  await fs.mkdir(path.join(root, 'Derived')); const human = 'Synthetic unowned material; the plugin must never adopt this file.';
  await fs.writeFile(path.join(root, 'Derived/manual.txt'), human);
  const settings = { ...defaults, locale, outputFolder: 'Derived', excludes: [] as string[] };
  const store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const factory = vi.fn(() => undefined), saved = vi.fn(async () => {}), controller = new ThirdBrainController(sources, store, () => settings, factory, saved);
  await controller.initialize(); await controller.refresh(); await controller.initialize();
  const opened: string[] = [], selected: unknown[] = [];
  const leaf = { view: Object.create(MarkdownView.prototype), openFile: async (file: { path: string }) => {
    opened.push(file.path); leaf.view.file = file; leaf.view.getMode = () => 'source';
    leaf.view.editor = { getValue: () => originals.get(file.path)?.text ?? '', setSelection: (...args: unknown[]) => selected.push(args), scrollIntoView: () => {} };
  } };
  const plugin = Object.assign(Object.create(ThirdBrainPlugin.prototype), { settings, controller, store, app: { vault: { getFileByPath: (name: string) => ({ path: name, extension: path.extname(name).slice(1) }) }, workspace: { getLeaf: () => leaf } } }) as ThirdBrainPlugin;
  const port = plugin.panelPort(), queries: Promise<SearchResult[]>[] = [], operations: Promise<void>[] = [];
  const find = port.find.bind(port), open = port.open.bind(port), generated = port.openFragment!.bind(port);
  vi.spyOn(port, 'find').mockImplementation((...a) => { const p = find(...a); queries.push(p); return p; });
  vi.spyOn(port, 'open').mockImplementation(e => { const p = open(e); operations.push(p); return p; });
  vi.spyOn(port, 'openFragment').mockImplementation((...a) => { const p = generated(...a); operations.push(p); return p; });
  vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) });
  const container = new Node('main'), dispose = mountPanel(container as unknown as HTMLElement, port, locale), t = messages(locale);
  const search = async (q: string) => { const input = container.all().find(n => n.className === 'tb-idea')!; input.value = q; input.fire('input'); container.all().find(n => n.tag === 'button' && n.textContent === t.find)!.fire('click'); const hits = await queries.at(-1)!; await Promise.resolve(); return hits; };
  const click = (n: Node) => { n.fire('click'); return operations.at(-1)!; };
  const actions = (card: Node) => card.all().filter(n => n.className === 'tb-source' || (n.tag === 'button' && n.textContent === t.openFragment));
  const protectedFiles = async () => { for (const [name, e] of originals) { expect(hash(await fs.readFile(path.join(root, name)))).toBe(hash(e.text)); expect((await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString()).toBe(e.mtime); } expect(await fs.readFile(path.join(root, 'Derived/manual.txt'), 'utf8')).toBe(human); expect(factory.mock.results.every(v => v.type === 'return' && v.value === undefined)).toBe(true); };
  const close = async () => { await Promise.allSettled([...queries, ...operations]); dispose(); controller.dispose(); };
  return { root, originals, settings, sources, store, controller, saved, container, port, opened, selected, search, click, actions, protectedFiles, close };
}
it.each([['a.md', 'en'], ['c.canvas', 'zh']] as const)('deleting synthetic %s retires complete old actions and reconciles surviving late points (%s)', async (removed, locale) => {
  const f = await fixture(locale); try {
    const initial = await f.search('porcelain gauge'); expect(initial).toHaveLength(1);
    const old = initial[0].fragment; expect(old.localContext).toContain('never apply this to live equipment'); expect(old.summary).toContain('Only inside the offline dummy bench');
    expect(new Set(old.evidence.map(e => e.relativePath))).toEqual(new Set(donors.map(d => d.name))); expect(old.privacy).toBe('private');
    const card = f.container.all().find(n => n.className === 'tb-result')!, oldActions = f.actions(card); expect(oldActions.length).toBe(old.evidence.length + 1);
    for (const action of oldActions) await f.click(action); await f.protectedFiles();
    const statePath = path.join(f.root, 'Derived/.third-brain/state.json'), before = await fs.readFile(statePath), openCount = f.opened.length;
    await fs.unlink(path.join(f.root, removed)); // Only this fixture's freshly authored donor.
    f.originals.delete(removed);
    for (const action of oldActions) await expect(f.click(action)).rejects.toThrow(); expect(f.opened).toHaveLength(openCount);
    await Promise.resolve(); expect(f.container.all().find(n => n.className === 'tb-notice')!.textContent).toBe(messages(locale).sourceEvidenceUnavailable);
    expect(await f.controller.find('porcelain gauge', 'medium')).toEqual([]); expect(await fs.readFile(statePath)).toEqual(before);
    // Controlled scheduling-save latch AFTER actual durable commit, not a real disk fault.
    // The previous card is still attached while refresh waits for its saved callback.
    let entered!: () => void, release!: () => void;
    const reached = new Promise<void>(r => { entered = r; }), gate = new Promise<void>(r => { release = r; });
    f.saved.mockImplementationOnce(async () => { entered(); await gate; });
    const refreshing = f.controller.refresh();
    try {
      await reached; expect(f.controller.status().phase).toBe('indexing'); expect(f.container.all()).toContain(card);
      for (const action of oldActions) await expect.soft(f.click(action)).rejects.toThrow(); expect.soft(f.opened).toHaveLength(openCount);
    } finally { release(); await refreshing; }
    await f.controller.initialize();
    const index = (await f.store.load())!, current = index.fragments[old.id]; expect(current).toBeDefined();
    expect(current.evidence.every(e => e.relativePath !== removed)).toBe(true); expect(new Set(current.evidence.map(e => e.relativePath)).size).toBe(2);
    expect(current.privacy).toBe(removed === 'c.canvas' ? 'local' : 'private'); expect(current.localContext).toBe(old.localContext);
    const gone = donors.find(d => d.name === removed)!; expect(current.facets.concepts).not.toContain(gone.label); expect(index.sources[removed]).toBeUndefined();
    // Same stable fragment ID is not permission to open the new revision from an old card.
    for (const action of oldActions) await expect.soft(f.click(action)).rejects.toThrow(); expect.soft(f.opened).toHaveLength(openCount);
    const fresh = await f.search('porcelain gauge'); expect(fresh).toHaveLength(1); expect(fresh[0].fragment.id).toBe(old.id);
    const freshCard = f.container.all().find(n => n.className === 'tb-result')!; for (const action of f.actions(freshCard)) await f.click(action);
    for (const d of donors.filter(d => d.name !== removed)) {
      const hits = await f.search(d.tail.split(' preserves ')[0]); expect(hits).toHaveLength(1); expect(hits[0].fragment.summary).toContain(d.tail); expect(hits[0].fragment.evidence.every(e => e.relativePath === d.name)).toBe(true);
      for (const action of f.actions(f.container.all().find(n => n.className === 'tb-result')!)) await f.click(action);
    }
    expect(await f.controller.find(gone.tail.split(' preserves ')[0], 'low')).toEqual([]);
    for (const fragment of Object.values(index.fragments)) for (const e of fragment.evidence) {
      const s = (await f.sources.read(e.relativePath))!; expect(e.sourceId).toBe(s.id); expect(e.sourceHash).toBe(s.hash); expect(index.sources[e.relativePath].fragmentIds).toContain(fragment.id);
      if (e.start >= 0) expect(s.text.slice(e.start, e.end)).toBe(e.quote); else expect(hasReadableQuote(s, e.quote)).toBe(true);
    }
    const saved = await fs.readFile(statePath); await f.controller.refresh(); expect(await fs.readFile(statePath)).toEqual(saved); expect(await f.store.load()).toEqual(index);
    await f.protectedFiles();
  } finally { await f.close(); }
});
it('card proofs reject cloned or cross-fragment quotations, retain cancelled-search opens and preserve direct saved-file compatibility', async () => {
  const f = await fixture('en'); try {
    const sharedCard = (await f.search('porcelain gauge'))[0].fragment, proof = sharedCard.evidence[0];
    await f.controller.verifyFragmentOpen(sharedCard.id, proof);
    await expect(f.controller.verifyFragmentOpen(sharedCard.id, structuredClone(proof))).rejects.toThrow();
    await expect(f.controller.verifyFragmentOpen('unknown-fragment', proof)).rejects.toThrow();
    const read = f.sources.read.bind(f.sources);
    vi.spyOn(f.sources, 'read').mockImplementationOnce(async (...args) => { f.controller.cancel(); return read(...args); });
    await expect(f.controller.find('porcelain gauge', 'medium')).rejects.toMatchObject({ name: 'AbortError' });
    await f.controller.verifyFragmentOpen(sharedCard.id, proof);
    f.settings.excludes.push('c.canvas'); await expect(f.controller.verifyFragmentOpen(sharedCard.id, proof)).rejects.toThrow(); f.settings.excludes.pop();
    const tail = (await f.search('silver spool'))[0].fragment; expect(tail.localContext).toBeUndefined();
    await expect(f.controller.verifyFragmentOpen(tail.id, proof)).rejects.toThrow();
    await f.controller.verifyFragmentOpen(tail.id, tail.evidence[0]);
    f.settings.excludes.push('a.md'); await expect(f.controller.verifyFragmentOpen(tail.id, tail.evidence[0])).rejects.toThrow();
    // This old API means opening saved derived text, not authenticating a result card.
    await f.controller.verifyFragmentOpen(tail.id); f.settings.excludes.pop();
    await f.protectedFiles();
  } finally { await f.close(); }
});
