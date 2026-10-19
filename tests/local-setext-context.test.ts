// SPDX-License-Identifier: MIT
// Authored synthetic long-note/setext context; no semantic-model or native-click grading.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { analyzeSource, buildIndex, emptyIndex, prepareSource } from '../src/core';
import { hasReadableQuote } from '../src/core/sources';
import type { ModelRequest } from '../src/core/types';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-setext-legacy.json', 'utf8'));
const raws: Record<string, string> = legacy.raws;
const point = 'Seal the lilac jar only after the rehearsal.';
const scope = 'Only disconnected synthetic cabinets';
const later = 'verdigris witness stripe';
const opts = { mode: 'local-excerpts' as const, cloudConsent: false, now: '2026-01-01T00:00:00.000Z' };
const snap = (text: string, name = 'synthetic.md') => prepareSource(name, text, hash(text), hash(name).slice(0, 24));
const wrap = (text: string, extension: string) => extension === 'canvas' ? JSON.stringify({ nodes: [{ type: 'text', text: '---\nprivacy: private\n---\n' + text }], edges: [] }) : text;

it.each([['md', '='], ['md', '-'], ['canvas', '='], ['canvas', '-']])('%s/%s long-note tail retains setext scope, distinct conditions and complete duplicate donors', async (extension, marker) => {
  const inputs = Object.entries(raws).map(([name, raw]) => {
    const text = marker === '-' ? raw.replace('## Closure routine', '### Closure routine').replace('### Later independent observation', '#### Later independent observation') : raw;
    return snap(wrap(text.replace('====================', marker.repeat(20)), extension), name.replace('.md', '.' + extension));
  });
  const index = await buildIndex(inputs, { ...opts, signature: generationSignature(defaults), previous: emptyIndex() });
  const targets = Object.values(index.fragments).filter(f => f.summary.includes(point));
  expect(targets).toHaveLength(2);
  expect(targets.every(f => f.summary.includes('disconnected synthetic cabinets') && f.summary.includes(marker.repeat(20)))).toBe(true);
  const shared = targets.find(f => f.summary.includes(scope))!;
  expect(new Set(shared.evidence.map(e => e.relativePath)).size).toBe(2);
  expect(targets.find(f => f.id !== shared.id)!.summary).toContain('Never disconnected');
  const tails = Object.values(index.fragments).filter(f => f.summary.includes(later)); expect(tails).toHaveLength(2);
  expect(tails.every(f => f.summary.includes('warm chalk is a counterexample') && f.summary.includes('disconnected synthetic cabinets'))).toBe(true);
  for (const f of [...targets, ...tails]) for (const e of f.evidence) {
    const source = inputs.find(s => s.path === e.relativePath)!; expect(e.sourceId).toBe(source.id); expect(e.sourceHash).toBe(source.hash);
    if (e.start >= 0) expect(source.text.slice(e.start, e.end)).toBe(e.quote); else { expect(source.format).toBe('canvas'); expect(hasReadableQuote(source, e.quote)).toBe(true); }
    if (extension === 'canvas') expect(f.privacy).toBe('private');
  }
});

it('retains multiline, Chinese, short underlines, legal indentation and exact newline evidence', async () => {
  for (const heading of ['Only the inert\nrehearsal cabinet', '  只在断开的合成柜体内', 'Only the inert cabinet']) for (const underline of ['=', '-', '   ===\t', '  --- ']) for (const newline of ['\n', '\r\n', '\r']) {
    const raw = (heading + '\n' + underline + '\n### Neutral child\n' + point).replace(/\n/gu, newline);
    const all = (await analyzeSource(snap(raw), opts)).fragments;
    expect(all).toHaveLength(1); expect(all[0].summary).toContain(heading.trim().replace(/\n/gu, newline));
    expect(all[0].evidence).toHaveLength(3); for (const e of all[0].evidence) expect(raw.slice(e.start, e.end)).toBe(e.quote);
  }
});

it('ends setext scope at an equal/higher heading, retaining both mixed-style ancestors only within their section', async () => {
  const raw = '# Outer trial\nOnly inert jars\n---\n### Neutral\n' + point + '\n\n## Separate archive\nThe amber ledger records unrelated receipts.\n\nFresh trial\n===\n### Neutral\nThe jade bell marks a separate observation.';
  const all = (await analyzeSource(snap(raw), opts)).fragments;
  const target = all.find(f => f.summary.includes(point))!; expect(target.summary).toContain('# Outer trial\nOnly inert jars\n---\n### Neutral');
  const unrelated = all.find(f => f.summary.includes('amber ledger'))!; expect(unrelated.summary).toContain('# Outer trial\n## Separate archive'); expect(unrelated.summary).not.toContain('Only inert jars');
  const fresh = all.find(f => f.summary.includes('jade bell'))!; expect(fresh.summary).toContain('Fresh trial\n==='); expect(fresh.summary).not.toContain('Outer trial'); expect(fresh.summary).not.toContain('Only inert jars');
});

it('does not promote thematic rules, lists, quotes, fences, HTML or malformed/indented underlines to ancestor headings', async () => {
  for (const prefix of ['Ordinary independent observation.\n\n---', '- Ordinary independent observation.\n---', '> Ordinary independent observation.\n---', '```\nOrdinary independent observation.\n===\n```', '    Ordinary independent observation.\n===', '<div>Ordinary independent observation.</div>\n---', 'Ordinary independent observation.\n= = =', 'Ordinary independent observation.\n    ===']) {
    const all = (await analyzeSource(snap(prefix + '\n\n### Neutral\n' + point), opts)).fragments;
    const target = all.find(f => f.summary.includes(point))!; expect(target.summary).toBe('### Neutral\n\n' + point);
  }
  const raw = '- Only within the synthetic list:\n  - Keep the dummy jar closed.\n\n---\n\n### Neutral\n' + point;
  expect((await analyzeSource(snap(raw), opts)).fragments.find(f => f.summary.includes(point))!.summary).not.toContain('dummy jar');
});

it('fails closed for hidden/oversized heading context and retains literal non-heading syntax examples', async () => {
  for (const marker of ['<!-- hidden -->', '%% hidden %%']) await expect(analyzeSource(snap('Only ' + marker + ' on the inert bench\n===\n## Neutral\n' + point), opts)).rejects.toThrow();
  await expect(analyzeSource(snap('合'.repeat(16384) + '\n===\n## Neutral\n' + point), opts)).rejects.toThrow();
  const literal = 'Literal `===` and `---` examples remain ordinary text.'; const all = (await analyzeSource(snap(literal + '\n\n## Neutral\n' + point), opts)).fragments;
  expect(all.some(f => f.summary === literal)).toBe(true); expect(all.find(f => f.summary.includes(point))!.summary).not.toContain('Literal');
});

it('changes local generation once without changing exact offline AI inputs or generation signatures', async () => {
  expect(generationSignature({ ...defaults, outputFolder: 'Derived' })).not.toBe(legacy.signatures['local-excerpts']);
  for (const mode of ['local-model', 'cloud-model'] as const) {
    expect(generationSignature({ ...defaults, outputFolder: 'Derived', mode })).toBe(legacy.signatures[mode]); const requests: ModelRequest[] = [];
    await analyzeSource(snap(raws['a.md'], 'a.md'), { mode, cloudConsent: true, model: { request: async r => { requests.push(r); return { version: 1, decision: 'insufficient-context', fragments: [] }; } } });
    expect(requests).toEqual(legacy.requests[mode]);
  }
});

async function fixture(extension: string) {
  const base = path.resolve('.local/local-setext'); await fs.mkdir(base, { recursive: true }); const root = await fs.mkdtemp(path.join(base, extension + '-'));
  const expected = new Map<string, { text: string; mtime: string }>();
  const put = async (name: string, text: string) => { await fs.writeFile(path.join(root, name), text); expected.set(name, { text, mtime: (await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString() }); };
  for (const [name, text] of Object.entries(raws)) await put(name.replace('.md', '.' + extension), wrap(text, extension));
  await fs.mkdir(path.join(root, 'Derived')); await fs.writeFile(path.join(root, 'Derived/manual.txt'), 'Synthetic human-owned material.');
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] as string[] }, store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const request = vi.fn(async () => { throw Error('Forbidden model request'); }), c = new ThirdBrainController(sources, store, () => settings, () => ({ request }), async () => {});
  const originals = async () => { for (const [name, value] of expected) { expect(hash(await fs.readFile(path.join(root, name)))).toBe(hash(value.text)); expect((await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString()).toBe(value.mtime); } expect(await fs.readFile(path.join(root, 'Derived/manual.txt'), 'utf8')).toBe('Synthetic human-owned material.'); expect(request).not.toHaveBeenCalled(); };
  return { root, settings, store, sources, c, put, originals };
}

async function commitLegacy(f: Awaited<ReturnType<typeof fixture>>) {
  const snapshots = await f.sources.list();
  await f.store.commit(structuredClone(legacy.oldIndex), () => f.sources.verify(snapshots));
}
async function upgradeLegacy(f: Awaited<ReturnType<typeof fixture>>) {
  const statePath = path.join(f.root, 'Derived/.third-brain/state.json'), oldState = await fs.readFile(statePath);
  await f.c.initialize(); expect(await f.store.load()).toEqual(legacy.oldIndex); expect(await fs.readFile(statePath)).toEqual(oldState);
  await f.c.refresh(); await f.c.initialize();
  const index = (await f.store.load())!;
  expect(index.signature).not.toBe(legacy.oldIndex.signature);
  return index;
}

// Keep storage/history and each complete open journey in separate fresh vaults.
// Repeated endpoint checks read the real owned layer; do not mock them away or
// give the combined journey a longer deadline on slower filesystems.
it('actual legacy store keeps frozen bytes, upgrades/reloads once, retains history and stays byte-idempotent', async () => {
  const f = await fixture('md'); try {
    await commitLegacy(f);
    const marker = JSON.parse(await fs.readFile(path.join(f.root, 'Derived/.third-brain/marker.json'), 'utf8')), oldFiles: Buffer[] = [];
    for (const id of Object.keys(legacy.oldIndex.fragments)) { const bytes = await fs.readFile(path.join(f.root, await f.store.fragmentPath(id))); expect(bytes.toString().replaceAll(marker.storeId, 'SYNTHETIC_STORE_ID')).toBe(legacy.rendered[id]); oldFiles.push(bytes); }
    const statePath = path.join(f.root, 'Derived/.third-brain/state.json');
    const index = await upgradeLegacy(f);
    const state = await fs.readFile(statePath); await f.c.refresh(); expect(await fs.readFile(statePath)).toEqual(state); expect(await f.store.load()).toEqual(index);
    const history = await fs.readdir(path.join(f.root, 'Derived/.third-brain/history'), { recursive: true, withFileTypes: true }), saved = await Promise.all(history.filter(item => item.isFile()).map(item => fs.readFile(path.join(item.parentPath, item.name))));
    for (const bytes of oldFiles) { const text = bytes.toString(); if (text.includes(point) || text.includes(later)) expect(saved.some(value => value.equals(bytes))).toBe(true); }
    await f.originals();
  } finally { f.c.dispose(); }
});

it.each(['lilac jar', later])('actual legacy upgrade finds %s and verifies every current original/generated endpoint', async query => {
  const f = await fixture('md'); try {
    await commitLegacy(f); const index = await upgradeLegacy(f);
    const found = await f.c.find(query, 'medium'); expect(found).toHaveLength(2);
    if (query === later) expect(found.every(r => r.fragment.summary.includes('cold dummy chamber') && r.fragment.summary.includes('warm chalk is a counterexample'))).toBe(true);
    else expect(found.every(r => r.fragment.summary.includes(point) && r.fragment.summary.includes('disconnected synthetic cabinets'))).toBe(true);
    const statePath = path.join(f.root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath);
    await f.c.refresh(); expect(await fs.readFile(statePath)).toEqual(state); expect(await f.store.load()).toEqual(index);
    for (const r of found) { for (const e of r.fragment.evidence) await f.c.verifyOpen(e); await f.c.verifyFragmentOpen(r.fragment.id); }
    await f.originals();
  } finally { f.c.dispose(); }
});

it('actual near-duplicate long notes keep a unique late point findable and replace only its current donor evidence', async () => {
  const f = await fixture('md'); try {
    const original = raws['b.md'] + '\n\n## Unique late preparation\nOnly in the cold dummy chamber, the porcelain witness needs a blue cloth; warm chalk is the counterexample.';
    await f.put('b.md', original); await f.c.initialize(); await f.c.refresh(); await f.c.initialize();
    const before = await f.c.find('porcelain', 'medium'); expect(before).toHaveLength(1); expect(before[0].fragment.summary).toContain('cold dummy chamber'); expect(before[0].fragment.summary).toContain('warm chalk is the counterexample');
    expect(new Set(before[0].fragment.evidence.map(e => e.relativePath))).toEqual(new Set(['b.md'])); for (const e of before[0].fragment.evidence) await f.c.verifyOpen(e);
    await f.put('b.md', original.replace('needs a blue cloth', 'needs an ochre cloth'));
    for (const e of before[0].fragment.evidence) await expect(f.c.verifyOpen(e)).rejects.toThrow(); expect(await f.c.find('porcelain', 'medium')).toHaveLength(0);
    await f.c.refresh(); await f.c.initialize(); const after = await f.c.find('porcelain', 'medium'); expect(after).toHaveLength(1); expect(after[0].fragment.id).not.toBe(before[0].fragment.id); expect(after[0].fragment.summary).toContain('ochre cloth'); expect(after[0].fragment.summary).not.toContain('blue cloth');
    for (const e of after[0].fragment.evidence) await f.c.verifyOpen(e); expect(await f.c.find('lilac jar', 'medium')).toHaveLength(2);
    const statePath = path.join(f.root, 'Derived/.third-brain/state.json'), bytes = await fs.readFile(statePath); await f.c.refresh(); expect(await fs.readFile(statePath)).toEqual(bytes); await f.originals();
  } finally { f.c.dispose(); }
});

it('actual Canvas counts setext context in the unchanged 256-quotation bound and refuses overflow before commit', async () => {
  const base = path.resolve('.local/local-setext'); await fs.mkdir(base, { recursive: true }); const root = await fs.mkdtemp(path.join(base, 'bounds-'));
  const make = (count: number) => wrap('Only inert synthetic cabinets\n===\n' + Array.from({ length: count }, (_, i) => '- [ ] Calibrate synthetic tile ' + i + '.').join('\n'), 'canvas');
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] }, store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths()), c = new ThirdBrainController(sources, store, () => settings, () => undefined, async () => {});
  const file = path.join(root, 'source.canvas'), legal = make(255);
  try {
    await fs.writeFile(file, legal); await c.initialize(); await c.refresh(); const index = (await store.load())!, all = Object.values(index.fragments); expect(all).toHaveLength(1); expect(all[0].evidence).toHaveLength(256); expect(all[0].summary).toContain('Only inert synthetic cabinets\n===');
    const statePath = path.join(root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath); await c.refresh(); expect(await fs.readFile(statePath)).toEqual(state);
    const commit = vi.spyOn(store, 'commit'); await fs.writeFile(file, make(256)); await expect(c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    await fs.writeFile(file, make(128)); await fs.writeFile(path.join(root, 'copy.canvas'), make(128)); await expect(c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    await fs.writeFile(path.join(root, 'copy.canvas'), wrap('', 'canvas')); await fs.writeFile(file, legal); await c.refresh(); const repaired = (await store.load())!; expect(Object.values(repaired.fragments)[0].evidence).toHaveLength(256); const saved = await fs.readFile(statePath); await c.refresh(); expect(await fs.readFile(statePath)).toEqual(saved); expect(await fs.readFile(file, 'utf8')).toBe(legal);
  } finally { c.dispose(); vi.restoreAllMocks(); }
});

class Node {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false; children: Node[] = []; handlers = new Map<string, (() => void)[]>();
  constructor(readonly tag: string) {} append(...nodes: Node[]) { this.children.push(...nodes); } replaceChildren(...nodes: Node[]) { this.children = nodes; }
  setAttribute() {} remove() {} focus() {} get childElementCount() { return this.children.length; }
  addEventListener(key: string, handler: () => void) { this.handlers.set(key, [...this.handlers.get(key) ?? [], handler]); }
  fire(key: string) { for (const handler of this.handlers.get(key) ?? []) handler(); }
  all(): Node[] { return [this, ...this.children.flatMap(node => node.all())]; } text(): string { return [this.textContent, ...this.children.map(node => node.text())].join('\n'); }
}

it.each([['md', 'en'], ['md', 'zh'], ['canvas', 'en'], ['canvas', 'zh']] as const)('actual %s/%s idea → scoped late card → all source/generated renderer actions', async (extension, locale) => {
  const f = await fixture(extension); let dispose: (() => void) | undefined, pending: Promise<unknown> | undefined;
  try {
    await f.c.initialize(); await f.c.refresh(); await f.c.initialize(); vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) });
    const container = new Node('main'), opens: Promise<void>[] = [], generated: Promise<void>[] = [];
    dispose = mountPanel(container as unknown as HTMLElement, { status: () => f.c.status(), subscribe: h => f.c.subscribe(h), refresh: () => f.c.refresh(), cancel: () => f.c.cancel(), find: (...args) => { pending = f.c.find(...args); return pending as ReturnType<ThirdBrainController['find']>; }, open: e => { const p = f.c.verifyOpen(e); opens.push(p); return p; }, openFragment: id => { const p = f.c.verifyFragmentOpen(id).then(async () => { const text = await fs.readFile(path.join(f.root, await f.store.fragmentPath(id)), 'utf8'); expect(text).toContain('disconnected synthetic cabinets'); expect(text).toContain(later); }); generated.push(p); return p; } }, locale);
    const input = container.all().find(n => n.className === 'tb-idea')!; input.value = later; input.fire('input'); container.all().find(n => n.tag === 'button' && n.textContent === messages(locale).find)!.fire('click');
    const found = await pending as Awaited<ReturnType<ThirdBrainController['find']>>; await Promise.resolve(); expect(found).toHaveLength(2);
    const cards = container.all().filter(n => n.className === 'tb-result'); expect(cards).toHaveLength(2);
    for (const card of cards) { const primary = card.all().find(n => n.className === 'tb-fragment')!.text(); expect(primary).toContain('disconnected synthetic cabinets'); expect(primary).toContain('warm chalk is a counterexample'); expect(card.text()).toContain(messages(locale).excerpt); for (const button of card.all().filter(n => n.className === 'tb-source')) { button.fire('click'); await opens.at(-1); } card.all().find(n => n.tag === 'button' && n.textContent === messages(locale).openFragment)!.fire('click'); await generated.at(-1); }
    expect(opens).toHaveLength(found.reduce((n, r) => n + r.fragment.evidence.length, 0)); expect(generated).toHaveLength(2); await f.originals();
  } finally { await pending?.catch(() => {}); dispose?.(); f.c.dispose(); vi.unstubAllGlobals(); }
});

it.each(['md', 'canvas'])('actual %s donor-scope change/exclusion rejects old originals, reconciles distinct cards, cancels/retries and protects human files', async extension => {
  const f = await fixture(extension); try {
    await f.c.initialize(); await f.c.refresh(); const found = await f.c.find(later, 'medium'); expect(found).toHaveLength(2); const merged = found.find(r => new Set(r.fragment.evidence.map(e => e.relativePath)).size === 2)!;
    const statePath = path.join(f.root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath);
    const name = 'copy.' + extension; await f.put(name, wrap(raws['b.md'], extension));
    for (const e of merged.fragment.evidence) await expect(f.c.verifyOpen(e)).rejects.toThrow(); expect(await fs.readFile(statePath)).toEqual(state);
    expect((await f.c.find(later, 'medium')).some(r => r.fragment.id === merged.fragment.id)).toBe(false);
    const list = f.sources.list.bind(f.sources); let entered!: () => void, release!: () => void; const started = new Promise<void>(r => { entered = r; }), latch = new Promise<void>(r => { release = r; });
    vi.spyOn(f.sources, 'list').mockImplementationOnce(async options => { entered(); await latch; return list(options); }); const commit = vi.spyOn(f.store, 'commit');
    const refresh = f.c.refresh(); await started; f.c.cancel(); release(); await expect(refresh).rejects.toMatchObject({ name: 'AbortError' }); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    await f.c.refresh(); await f.c.initialize(); const fresh = await f.c.find(later, 'medium'); expect(fresh).toHaveLength(2); expect(fresh.some(r => r.fragment.summary.includes('Never disconnected') && new Set(r.fragment.evidence.map(e => e.relativePath)).size === 2)).toBe(true);
    const current = fresh.find(r => new Set(r.fragment.evidence.map(e => e.relativePath)).size === 2)!; for (const e of current.fragment.evidence) await f.c.verifyOpen(e);
    f.settings.excludes.push(name); for (const e of current.fragment.evidence) await expect(f.c.verifyOpen(e)).rejects.toThrow(); f.settings.excludes.pop();
    const saved = await fs.readFile(statePath); await f.c.refresh(); expect(await fs.readFile(statePath)).toEqual(saved);
    const target = path.join(f.root, await f.store.fragmentPath(fresh[0].fragment.id)), bytes = await fs.readFile(target); await fs.writeFile(target, Buffer.concat([bytes, Buffer.from('\nSynthetic human amendment.')]));
    await expect(f.c.refresh()).rejects.toThrow(); expect(await fs.readFile(statePath)).toEqual(saved); expect(await fs.readFile(target, 'utf8')).toContain('Synthetic human amendment.'); await f.originals();
  } finally { f.c.dispose(); vi.restoreAllMocks(); }
});
