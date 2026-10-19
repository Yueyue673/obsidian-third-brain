// SPDX-License-Identifier: MIT
// Authored synthetic properties/long-note donors; real filesystem and Main PanelPort,
// DOM/host shells only. No model calls, semantic grading or native clicks.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { MarkdownView } from 'obsidian';
import ThirdBrainPlugin from '../src/main';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { sourceFacets } from '../src/core/sources';
import { analyzeSource, buildIndex, emptyIndex, prepareSource } from '../src/core';
import { buildFragmentNetwork } from '../src/core/connections';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
import type { SearchResult } from '../src/core/types';
vi.mock('obsidian', () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, MarkdownView: class {}, Notice: class {} }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const primary = 'Only in the inert workshop, the violet marker records the seal; a warm rim is a counterexample.';
const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-property-legacy.json', 'utf8'));
const early = '## Early independent observation\n' + 'The synthetic paper register records tile orientation before the dummy rehearsal. '.repeat(24);
const body = '# Synthetic workshop\n\n' + early + '\n\n## Late shared observation\n' + primary;
function raw(label: string, extension: string, tail = '', quoted = false): string {
  const text = '---\nprivacy: private\nconcepts: [' + (quoted ? JSON.stringify(label) : label) + ']\n---\n' + (quoted ? '# Synthetic workshop\n\n## Late shared observation\n' + primary : body) + tail;
  return extension === 'canvas' ? JSON.stringify({ nodes: [{ type: 'text', text }], edges: [] }) : text;
}
class Node {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false; children: Node[] = []; attrs: Record<string, string> = {}; handlers = new Map<string, (() => void)[]>();
  constructor(readonly tag: string) {} append(...nodes: Node[]) { this.children.push(...nodes); } replaceChildren(...nodes: Node[]) { this.children = nodes; }
  setAttribute(k: string, v: string) { this.attrs[k] = v; } remove() {} focus() {} get childElementCount() { return this.children.length; }
  addEventListener(k: string, fn: () => void) { this.handlers.set(k, [...this.handlers.get(k) ?? [], fn]); }
  fire(k: string) { for (const fn of this.handlers.get(k) ?? []) fn(); } all(): Node[] { return [this, ...this.children.flatMap(n => n.all())]; }
}
async function fixture(extension: string, locale: 'en' | 'zh', quoted = false) {
  const base = path.resolve('.local/local-property-donors'); await fs.mkdir(base, { recursive: true }); const root = await fs.mkdtemp(path.join(base, 'case-'));
  const expected = new Map<string, { text: string; mtime: string }>();
  const put = async (name: string, text: string) => { await fs.writeFile(path.join(root, name), text); expected.set(name, { text, mtime: (await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString() }); };
  const a = 'a.' + extension, b = 'b.' + extension;
  const labelA = quoted ? 'staged inlet, delayed outlet' : 'staged inlet';
  const labelB = 'porcelain witness';
  await put(a, raw(labelA, extension, '', quoted));
  await put(b, raw(labelB, extension, '\n\n## Unique later example\nOnly a cold dummy chamber uses an ochre cloth to preserve the porcelain witness; warm chalk is the counterexample.', quoted));
  await fs.mkdir(path.join(root, 'Derived')); await put('Derived/manual.md', 'Synthetic human-owned material.');
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] as string[], locale }, store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const model = vi.fn(() => undefined); const c = new ThirdBrainController(sources, store, () => settings, model, async () => {});
  await c.initialize(); await c.refresh(); const index = (await store.load())!; await c.initialize();
  const hostOpens: string[] = [], selections: unknown[] = [];
  const leaf = { view: Object.create(MarkdownView.prototype), openFile: async (file: { path: string }) => {
    hostOpens.push(file.path); leaf.view.file = file; leaf.view.getMode = () => 'source'; leaf.view.editor = { getValue: () => expected.get(file.path)?.text ?? '', setSelection: (...args: unknown[]) => selections.push(args), scrollIntoView: () => {} };
  } };
  const plugin = Object.assign(Object.create(ThirdBrainPlugin.prototype), { settings, controller: c, store, app: { vault: { getFileByPath: (name: string) => ({ path: name, extension: path.extname(name).slice(1) }) }, workspace: { getLeaf: () => leaf } } }) as ThirdBrainPlugin;
  const port = plugin.panelPort(), finds: Promise<SearchResult[]>[] = [], opens: Promise<void>[] = [], generated: Promise<void>[] = [];
  const find = port.find.bind(port), open = port.open.bind(port), openFragment = port.openFragment!.bind(port);
  const findSpy = vi.spyOn(port, 'find').mockImplementation((...args) => { const p = find(...args); finds.push(p); return p; });
  vi.spyOn(port, 'open').mockImplementation(e => { const p = open(e); opens.push(p); return p; });
  vi.spyOn(port, 'openFragment').mockImplementation(id => { const p = openFragment(id); generated.push(p); return p; });
  vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) });
  const container = new Node('main'), dispose = mountPanel(container as unknown as HTMLElement, port, locale);
  const query = async (text: string) => { const input = container.all().find(n => n.className === 'tb-idea')!; input.value = text; input.fire('input'); container.all().find(n => n.textContent === messages(locale).find)!.fire('click'); const hits = await finds.at(-1)!; await Promise.resolve(); return hits; };
  const originals = async () => { for (const [name, e] of expected) { expect(hash(await fs.readFile(path.join(root, name)))).toBe(hash(e.text)); expect((await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString()).toBe(e.mtime); } };
  const close = async () => { await Promise.allSettled([...finds, ...opens, ...generated]); dispose(); c.dispose(); };
  return { root, expected, put, a, b, labelA, labelB, settings, store, sources, c, index, container, port, findSpy, query, finds, opens, generated, hostOpens, selections, originals, close };
}
it.each([['md', 'en'], ['md', 'zh'], ['canvas', 'en'], ['canvas', 'zh']] as const)('actual %s/%s merged source properties retire only the changed donor and keep unique later information', async (extension, locale) => {
  const f = await fixture(extension, locale); try {
    const hits = await f.query('violet marker'); expect(hits).toHaveLength(1); const merged = hits[0].fragment;
    expect(new Set(merged.evidence.map(e => e.relativePath))).toEqual(new Set([f.a, f.b])); expect(merged.facets.concepts).toEqual([f.labelB, f.labelA].sort());
    const button = f.container.all().find(n => n.attrs['data-channel'] === 'concepts' && n.textContent.endsWith(f.labelB))!; expect(button).toBeDefined(); button.fire('click'); await f.finds.at(-1)!; await Promise.resolve(); expect(f.findSpy.mock.calls.at(-1)?.[3]).toEqual({ channel: 'concepts', value: f.labelB });
    const tail = Object.values(f.index.fragments).find(v => v.summary.includes('ochre cloth'))!; expect(tail.evidence.every(e => e.relativePath === f.b)).toBe(true);
    const links = buildFragmentNetwork(f.index).connections.get(merged.id)!; expect(links.some(l => l.targetId === tail.id && l.shared.some(s => s.value === f.labelB))).toBe(true);
    for (const b of f.container.all().filter(n => n.className === 'tb-source')) { b.fire('click'); await f.opens.at(-1); }
    for (const b of f.container.all().filter(n => n.tag === 'button' && n.textContent === messages(locale).openFragment)) { b.fire('click'); await f.generated.at(-1); }
    expect(f.opens.length).toBeGreaterThan(0); expect(f.generated.length).toBeGreaterThan(0); if (extension === 'md') expect(f.selections).toHaveLength(f.opens.length);
    const statePath = path.join(f.root, 'Derived/.third-brain/state.json'), previous = await fs.readFile(statePath);
    await f.put(f.b, raw('new witness property', extension, '\n\n## Unique later example\nOnly a cold dummy chamber uses an ochre cloth to preserve the porcelain witness; warm chalk is the counterexample.'));
    for (const e of merged.evidence) await expect(f.c.verifyOpen(e)).rejects.toThrow(); expect(await fs.readFile(statePath)).toEqual(previous);
    await f.c.refresh(); await f.c.initialize(); const current = (await f.store.load())!, shared = current.fragments[merged.id];
    expect(shared.facets.concepts).toEqual(['new witness property', f.labelA].sort()); expect(shared.facets.concepts).not.toContain(f.labelB);
    expect(await f.c.find('', 'medium', 'private', { channel: 'concepts', value: f.labelB })).toHaveLength(0);
    const after = await f.query('ochre cloth'); expect(after).toHaveLength(1); expect(after[0].fragment.summary).toContain('warm chalk is the counterexample'); expect(after[0].fragment.evidence.every(e => e.relativePath === f.b)).toBe(true);
    for (const frag of Object.values(current.fragments)) { const text = await fs.readFile(path.join(f.root, await f.store.fragmentPath(frag.id)), 'utf8'); expect(text.split('## Related fragments')[1] ?? '').not.toContain('Shared concepts: ' + f.labelB); }
    for (const e of after[0].fragment.evidence) await f.port.open(e); await f.port.openFragment!(after[0].fragment.id);
    const currentCard = (await f.query('violet marker'))[0].fragment; expect(currentCard.id).toBe(shared.id);
    f.settings.excludes.push(f.b); for (const e of currentCard.evidence) await expect(f.c.verifyOpen(e)).rejects.toThrow(); await f.c.refresh(); await f.c.initialize();
    const surviving = (await f.store.load())!.fragments[merged.id]; expect(surviving.facets.concepts).toEqual([f.labelA]); expect(surviving.evidence.every(e => e.relativePath === f.a)).toBe(true); expect(await f.c.find('ochre cloth', 'medium')).toHaveLength(0);
    const bytes = await fs.readFile(statePath); await f.c.refresh(); expect(await fs.readFile(statePath)).toEqual(bytes); await f.originals();
  } finally { await f.close(); }
});
it.each(['md', 'canvas'])('actual %s unsupported quoted property does not invent clickable partial values or false persistent links', async extension => {
  const f = await fixture(extension, 'en', true); try {
    const hits = await f.query('violet marker'); expect(hits).toHaveLength(1); expect(hits[0].fragment.facets.concepts).toEqual([f.labelB]);
    expect(f.container.all().some(n => n.attrs['data-channel'] === 'concepts' && /staged inlet|delayed outlet/u.test(n.textContent))).toBe(false);
    const button = f.container.all().find(n => n.attrs['data-channel'] === 'concepts' && n.textContent.endsWith(f.labelB))!; expect(button).toBeDefined(); button.fire('click'); const selected = await f.finds.at(-1)!; await Promise.resolve(); expect(selected.some(r => r.fragment.id === hits[0].fragment.id)).toBe(true); expect(f.findSpy.mock.calls.at(-1)?.[3]).toEqual({ channel: 'concepts', value: f.labelB });
    await f.put('partial.' + extension, raw('staged inlet', extension, '', true).replaceAll(primary, 'A separate empty-tank trial records a uniquely unrelated lime disc.'));
    await f.c.refresh(); await f.c.initialize(); const current = (await f.store.load())!; const original = current.fragments[hits[0].fragment.id], partial = Object.values(current.fragments).find(v => v.summary.includes('lime disc'))!;
    expect(buildFragmentNetwork(current).connections.get(original.id)!.some(l => l.targetId === partial.id)).toBe(false);
    const saved = await fs.readFile(path.join(f.root, await f.store.fragmentPath(original.id)), 'utf8'); expect(saved).not.toContain('](<' + path.basename(await f.store.fragmentPath(partial.id)) + '>)');
    for (const e of original.evidence) await f.port.open(e); await f.port.openFragment!(original.id); await f.originals();
  } finally { await f.close(); }
});
it.each([
  ['concepts: ["inlet, then outlet", witness]', ['witness']],
  ["concepts:\n  - 'inlet, then outlet'\n  - witness", ['witness']],
  ['concepts: "inlet, then outlet"', []],
  ['concepts: ["inlet # gate", witness] # trailing comment', ['witness']],
  ["concepts: ['operator''s gate', witness]", ['witness']],
  ['concepts: ["inlet，then outlet", witness]', ['witness']],
  ['concepts: ["inlet gate", witness] # comment', ['inlet gate', 'witness']],
  ['concepts: inlet gate, witness', ['inlet gate', 'witness']],
] as const)('validates quoted values as whole scalars without loosening the safe-label grammar: %s', (metadata, expected) => {
  const text = '---\n' + metadata + '\n---\nThe synthetic observation is independent and readable.';
  expect(sourceFacets(prepareSource('synthetic.md', text, hash(text), 'synthetic')).concepts).toEqual([...expected].sort());
});

it.each(['topics', 'concepts', 'mechanisms', 'atmosphere'] as const)('quoted %s values cannot fabricate safe fragments of unsupported labels', channel => {
  for (const value of ['"first, second"', "'first, second'", '"first # hidden, second"', '"first\\", second"']) {
    const text = '---\n' + channel + ': [' + value + ', witness]\n---\nAn authored synthetic observation remains readable.';
    expect(sourceFacets(prepareSource('synthetic.md', text, hash(text), 'synthetic'))[channel]).toEqual(['witness']);
  }
});
it.each(['["unclosed, witness]', '["safe" stray, witness]', '[safe, [nested, witness]]', '[safe, {nested: witness}]', '[safe, witness', '["safe\\q", witness]'])('does not guess labels from unsupported or incomplete syntax: %s', value => {
  const text = '---\nconcepts: ' + value + '\n---\nAn authored synthetic observation remains readable.';
  expect(sourceFacets(prepareSource('synthetic.md', text, hash(text), 'synthetic')).concepts).toEqual([]);
});
it('actual old property bytes stay readable; a synthetic current-signature fixture isolates metadata repair without a generation reset', async () => {
  const base = path.resolve('.local/local-property-donors'); await fs.mkdir(base, { recursive: true }); const root = await fs.mkdtemp(path.join(base, 'upgrade-'));
  const originals = new Map<string, { bytes: Buffer; mtime: string }>();
  for (const [name, text] of Object.entries(legacy.raws)) { await fs.writeFile(path.join(root, name), text as string); originals.set(name, { bytes: await fs.readFile(path.join(root, name)), mtime: (await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString() }); }
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] }, store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths()), c = new ThirdBrainController(sources, store, () => settings, () => undefined, async () => {});
  try {
    const snapshots = await sources.list(), sameGeneration = structuredClone(legacy.oldIndex);
    // This one field is deliberately synthetic, not historical cache evidence:
    // isolate the metadata-only repair from later independent local policies.
    // Frozen generated bytes and all safety/retry assertions remain unchanged.
    sameGeneration.signature = (await buildIndex([], { mode: 'local-excerpts', cloudConsent: false, signature: generationSignature(settings), previous: emptyIndex() })).signature;
    await store.commit(sameGeneration, () => sources.verify(snapshots));
    const marker = JSON.parse(await fs.readFile(path.join(root, 'Derived/.third-brain/marker.json'), 'utf8')), oldFiles: Buffer[] = [];
    for (const id of Object.keys(legacy.oldIndex.fragments)) { const bytes = await fs.readFile(path.join(root, await store.fragmentPath(id))); expect(bytes.toString().replaceAll(marker.storeId, 'SYNTHETIC_STORE_ID')).toBe(legacy.rendered[id]); oldFiles.push(bytes); }
    const statePath = path.join(root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath); await c.initialize(); expect(await store.load()).toEqual(sameGeneration); expect(await fs.readFile(statePath)).toEqual(state);
    // A real unmodified-runtime fixture proves the false stored edge exists.
    const old = Object.values(legacy.oldIndex.fragments) as SearchResult['fragment'][];
    expect(buildFragmentNetwork(legacy.oldIndex).connections.get(old[0].id)!.some(l => l.targetId === old[1].id)).toBe(true);
    const list = sources.list.bind(sources); let entered!: () => void, release!: () => void; const started = new Promise<void>(r => { entered = r; }), latch = new Promise<void>(r => { release = r; });
    vi.spyOn(sources, 'list').mockImplementationOnce(async options => { entered(); await latch; return list(options); }); const commit = vi.spyOn(store, 'commit'); const cancelled = c.refresh(); await started; c.cancel(); release(); await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' }); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    await c.refresh(); await c.initialize(); const repaired = (await store.load())!; expect(repaired.signature).toBe(sameGeneration.signature); expect(Object.keys(repaired.fragments)).toEqual(Object.keys(legacy.oldIndex.fragments));
    const owner = Object.values(repaired.fragments).find(v => v.summary.includes('violet marker'))!; expect(owner.facets.concepts).toEqual(['witness']); expect(buildFragmentNetwork(repaired).connections.get(owner.id)).toEqual([]);
    const saved = await fs.readFile(statePath); await c.refresh(); expect(await fs.readFile(statePath)).toEqual(saved); expect(await store.load()).toEqual(repaired);
    const history = await fs.readdir(path.join(root, 'Derived/.third-brain/history'), { recursive: true, withFileTypes: true }), backups = await Promise.all(history.filter(e => e.isFile()).map(e => fs.readFile(path.join(e.parentPath, e.name)))); for (const bytes of oldFiles) expect(backups.some(b => b.equals(bytes))).toBe(true);
    const card = (await c.find('violet marker', 'medium'))[0]; for (const e of card.fragment.evidence) await c.verifyOpen(e); await c.verifyFragmentOpen(card.fragment.id);
    const file = path.join(root, await store.fragmentPath(owner.id)); await fs.appendFile(file, '\nSynthetic human amendment.'); await expect(c.refresh()).rejects.toThrow(); expect(await fs.readFile(statePath)).toEqual(saved); expect(await fs.readFile(file, 'utf8')).toContain('Synthetic human amendment.');
    for (const [name, expected] of originals) { expect(await fs.readFile(path.join(root, name))).toEqual(expected.bytes); expect((await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString()).toBe(expected.mtime); }
  } finally { c.dispose(); }
});
it('corrects explicit hints without changing AI primary/background policy, safety grammar or generation signatures', async () => {
  const text = '---\nconcepts: ["inlet, then outlet", witness]\n---\n# Synthetic observation\nAn inert jar records a complete rehearsal observation.';
  const snapshot = prepareSource('synthetic.md', text, hash(text), 'synthetic'), requests: unknown[] = [];
  await analyzeSource(snapshot, { mode: 'local-model', cloudConsent: false, model: { request: async r => { requests.push(r); expect(r.vocabulary.concepts).toEqual(['witness']); expect(r.text).toBe('An inert jar records a complete rehearsal observation.'); expect(r.context).toEqual({ heading: 'Synthetic observation', before: '' }); return { version: 1, decision: 'insufficient-context', fragments: [] }; } } });
  expect(requests).toHaveLength(1);
  for (const mode of ['local-excerpts', 'local-model', 'cloud-model'] as const) expect(generationSignature({ ...defaults, outputFolder: 'Derived', mode })).toBe(JSON.stringify({ version: 1, ...(mode === 'local-excerpts' ? { localExcerptPolicy: 'quoted-lazy-lists-1' } : {}), mode, endpoint: mode === 'local-excerpts' ? '' : defaults.endpoint, model: defaults.model, excludes: [...defaults.excludes].sort(), maxFileBytes: defaults.maxFileBytes }));
});
