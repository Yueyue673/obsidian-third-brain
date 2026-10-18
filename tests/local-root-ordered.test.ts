// SPDX-License-Identifier: MIT
// Authored synthetic ordered-list context; offline captures are not semantic-quality evidence.
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
const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-root-ordered-legacy.json', 'utf8'));
const raws: Record<string, string> = legacy.raws;
const action = 'Drain the violet chamber after sealing the inlet.';
const preparation = 'Seal the cobalt inlet before draining.';
const opts = { mode: 'local-excerpts' as const, cloudConsent: false, now: '2026-01-01T00:00:00.000Z' };
const snap = (text: string, name = 'synthetic.md') => prepareSource(name, text, hash(text), hash(name).slice(0, 24));
const canvas = (text: string) => JSON.stringify({ nodes: [{ type: 'text', text }], edges: [] });
const wrap = (text: string, extension: string) => extension === 'canvas' ? canvas('---\nprivacy: private\n---\n' + text) : text;

it.each(['md', 'canvas', 'quoted-md', 'quoted-canvas'])('%s retains the complete root ordered procedure and keeps opposing preparations distinct', async format => {
  const inputs = Object.entries(raws).map(([name, raw]) => {
    if (format.startsWith('quoted')) {
      const [heading, subheading, ...body] = raw.split('\n');
      raw = heading + '\n' + subheading + '\n' + body.map(line => '> ' + line).join('\n');
    }
    return snap(wrap(raw, format.endsWith('canvas') ? 'canvas' : 'md'), name.replace('.md', format.endsWith('canvas') ? '.canvas' : '.md'));
  });
  const index = await buildIndex(inputs, { ...opts, signature: generationSignature(defaults), previous: emptyIndex() });
  const all = Object.values(index.fragments);
  expect(all).toHaveLength(2);
  expect(all.every(f => f.summary.includes(action) && f.summary.includes('cobalt inlet'))).toBe(true);
  expect(all.every(f => f.localContext === undefined)).toBe(true);
  const merged = all.find(f => f.summary.includes(preparation))!;
  expect(new Set(merged.evidence.map(e => e.relativePath)).size).toBe(2);
  expect(all.find(f => f.id !== merged.id)!.summary).toContain('Never seal');
  for (const fragment of all) {
    if (format.endsWith('canvas')) expect(fragment.privacy).toBe('private');
    for (const e of fragment.evidence) {
      const s = inputs.find(s => s.path === e.relativePath)!;
      expect(e.sourceId).toBe(s.id); expect(e.sourceHash).toBe(s.hash);
      if (e.start >= 0) expect(s.text.slice(e.start, e.end)).toBe(e.quote);
      else { expect(s.format).toBe('canvas'); expect(e.end).toBe(-1); expect(hasReadableQuote(s, e.quote)).toBe(true); }
    }
  }
});

it('retains Chinese, repeated numbers, parenthesis markers, loose/indented roots and exact newline variants', async () => {
  const base = '1. 先关闭青铜入口。\n   - 例子：隔离虚构闸门。\n2. 再排空紫色容器。\n   - 限制：只用惰性样本。';
  const variants = [base, base.replace('2.', '1.'), base.replace(/\d\./gu, '1)'), base.replace('2.', '0.'), base.replace('\n2.', '\n\n2.'), base.split('\n').map(line => '  ' + line).join('\n')];
  for (const variant of variants) for (const newline of ['\n', '\r\n', '\r']) {
    const raw = variant.replace(/\n/gu, newline), all = (await analyzeSource(snap(raw), opts)).fragments;
    expect(all).toHaveLength(1); expect(all[0].summary).toBe(raw.trim());
    expect(all[0].evidence).toHaveLength(1); const e = all[0].evidence[0]; expect(raw.slice(e.start, e.end)).toBe(e.quote);
  }
});

it('keeps a long ordered tail with its opening preparation, refuses oversized groups and first-parent hidden markers', async () => {
  const raw = '1. Only in the disconnected synthetic chamber.\n   ' + 'Synthetic preparation. '.repeat(90) + '\n2. ' + action;
  const all = (await analyzeSource(snap(raw), opts)).fragments;
  expect(all).toHaveLength(1); expect(all[0].summary).toBe(raw); expect(all[0].summary.length).toBeGreaterThan(1400);
  await expect(analyzeSource(snap('1. ' + '合'.repeat(16384) + '\n2. ' + action), opts)).rejects.toThrow();
  for (const marker of ['<!-- hidden -->', '%% hidden %%']) await expect(analyzeSource(snap('1. ' + marker + ' Only the dummy bench.\n2. ' + action), opts)).rejects.toThrow();
  const literal = 'Literal `<!--` and `%%` examples are ordinary prose.';
  expect((await analyzeSource(snap(raw + '\n\n' + literal), opts)).fragments.some(f => f.summary === literal)).toBe(true);
});

it('ends ordered scope at unrelated prose, headings, code/hidden barriers, delimiter changes, bullets and separate Canvas nodes', async () => {
  const first = '1. Seal the cobalt inlet.', second = '2. Drain the violet chamber.';
  for (const boundary of ['\n\nA separate synthetic archive paragraph.\n\n', '\n# Separate archive\n', '\n```\nsynthetic code\n```\n', '\n<!-- synthetic hidden -->\n', '\n%% synthetic hidden %%\n', '\n---\n']) {
    const all = (await analyzeSource(snap(first + boundary + second), opts)).fragments;
    expect(all.find(f => f.summary.includes('Drain'))!.summary).not.toContain('Seal');
  }
  const changed = (await analyzeSource(snap(first + '\n2) Drain the violet chamber.'), opts)).fragments;
  expect(changed).toHaveLength(2);
  const bullet = (await analyzeSource(snap(first + '\n- Remember the jade archive.'), opts)).fragments;
  expect(bullet).toHaveLength(2); expect(bullet.find(f => f.summary.includes('jade'))!.summary).not.toContain('Seal');
  const independent = '- Remember the amber archive.\n- File the jade ledger.';
  expect((await analyzeSource(snap(independent), opts)).fragments).toHaveLength(2);
  const nested = '1. Only inside the dummy archive:\n   - Remember the amber archive.\n   - File the jade ledger.';
  const focused = (await analyzeSource(snap(nested), opts)).fragments;
  expect(focused).toHaveLength(2); expect(focused.every(f => f.localContext)).toBe(true);
  const nodes = JSON.stringify({ nodes: [{ type: 'text', text: first }, { type: 'text', text: second }], edges: [] });
  const separate = (await analyzeSource(snap(nodes, 'synthetic.canvas'), opts)).fragments;
  expect(separate).toHaveLength(2); expect(separate.find(f => f.summary.includes('Drain'))!.summary).not.toContain('Seal');
});

it('invalidates only local generation and retains complete AI primary/background requests and signatures offline', async () => {
  expect(generationSignature({ ...defaults, outputFolder: 'Derived' })).not.toBe(legacy.signatures['local-excerpts']);
  for (const mode of ['local-model', 'cloud-model'] as const) {
    expect(generationSignature({ ...defaults, outputFolder: 'Derived', mode })).toBe(legacy.signatures[mode]);
    const requests: ModelRequest[] = [];
    await analyzeSource(snap(raws['procedure.md'], 'procedure.md'), { mode, cloudConsent: true, model: { request: async request => { requests.push(request); return { version: 1, decision: 'insufficient-context', fragments: [] }; } } });
    expect(requests).toEqual(legacy.requests[mode]);
  }
});

async function fixture(extension: string) {
  const scope = path.resolve('.local/local-root-ordered'); await fs.mkdir(scope, { recursive: true }); const root = await fs.mkdtemp(path.join(scope, extension + '-'));
  const expected = new Map<string, { text: string; mtime: string }>();
  const put = async (name: string, text: string) => { await fs.writeFile(path.join(root, name), text); expected.set(name, { text, mtime: (await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString() }); };
  for (const [name, text] of Object.entries(raws)) await put(name.replace('.md', '.' + extension), wrap(text, extension));
  await fs.mkdir(path.join(root, 'Derived')); await fs.writeFile(path.join(root, 'Derived/manual.txt'), 'Synthetic human-owned material.');
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] as string[] }, store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const request = vi.fn(async () => { throw Error('Forbidden model request'); }), c = new ThirdBrainController(sources, store, () => settings, () => ({ request }), async () => {});
  const originals = async () => { for (const [name, value] of expected) { expect(hash(await fs.readFile(path.join(root, name)))).toBe(hash(value.text)); expect((await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString()).toBe(value.mtime); } expect(await fs.readFile(path.join(root, 'Derived/manual.txt'), 'utf8')).toBe('Synthetic human-owned material.'); expect(request).not.toHaveBeenCalled(); };
  return { root, settings, store, sources, c, put, originals };
}

it('actual old store retains exact legacy bytes, upgrades ordered context once, archives old excerpts and stays byte-idempotent', async () => {
  const f = await fixture('md');
  try {
    const snapshots = await f.sources.list(); await f.store.commit(structuredClone(legacy.oldIndex), () => f.sources.verify(snapshots));
    const marker = JSON.parse(await fs.readFile(path.join(f.root, 'Derived/.third-brain/marker.json'), 'utf8')), oldFiles: Buffer[] = [];
    for (const id of Object.keys(legacy.oldIndex.fragments)) { const bytes = await fs.readFile(path.join(f.root, await f.store.fragmentPath(id))); expect(bytes.toString().replaceAll(marker.storeId, 'SYNTHETIC_STORE_ID')).toBe(legacy.rendered[id]); oldFiles.push(bytes); }
    await f.c.initialize(); expect(await f.store.load()).toEqual(legacy.oldIndex); await f.c.refresh(); await f.c.initialize();
    const index = (await f.store.load())!, all = Object.values(index.fragments); expect(all).toHaveLength(2); expect(index.signature).not.toBe(legacy.oldIndex.signature);
    for (const id of Object.keys(legacy.oldIndex.fragments)) { expect(index.fragments[id]).toBeUndefined(); await expect(fs.stat(path.join(f.root, 'Derived', 'fragment-' + id.slice(2) + '.md'))).rejects.toMatchObject({ code: 'ENOENT' }); }
    const history = await fs.readdir(path.join(f.root, 'Derived/.third-brain/history'), { recursive: true, withFileTypes: true }), saved = await Promise.all(history.filter(item => item.isFile()).map(item => fs.readFile(path.join(item.parentPath, item.name))));
    for (const bytes of oldFiles) expect(saved.some(value => value.equals(bytes))).toBe(true);
    const state = path.join(f.root, 'Derived/.third-brain/state.json'), bytes = await fs.readFile(state); await f.c.refresh(); expect(await fs.readFile(state)).toEqual(bytes); expect(await f.store.load()).toEqual(index);
    const found = await f.c.find('violet chamber', 'medium'); expect(found).toHaveLength(2);
    for (const r of found) { for (const e of r.fragment.evidence) await f.c.verifyOpen(e); await f.c.verifyFragmentOpen(r.fragment.id); }
    await f.originals();
  } finally { f.c.dispose(); }
});

class Node {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false; children: Node[] = []; handlers = new Map<string, (() => void)[]>();
  constructor(readonly tag: string) {}
  append(...nodes: Node[]) { this.children.push(...nodes); } replaceChildren(...nodes: Node[]) { this.children = nodes; }
  setAttribute() {} remove() {} focus() {} get childElementCount() { return this.children.length; }
  addEventListener(key: string, handler: () => void) { this.handlers.set(key, [...this.handlers.get(key) ?? [], handler]); }
  fire(key: string) { for (const handler of this.handlers.get(key) ?? []) handler(); }
  all(): Node[] { return [this, ...this.children.flatMap(node => node.all())]; } text(): string { return [this.textContent, ...this.children.map(node => node.text())].join('\n'); }
}

it.each([['md', 'en'], ['md', 'zh'], ['canvas', 'en'], ['canvas', 'zh']] as const)('actual %s/%s idea → complete ordered card → all exact original/generated callbacks', async (extension, locale) => {
  const f = await fixture(extension); let dispose: (() => void) | undefined, pending: Promise<unknown> | undefined;
  try {
    await f.c.initialize(); await f.c.refresh(); await f.c.initialize();
    vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) }); const container = new Node('main'), opens: Promise<void>[] = [], generated: Promise<void>[] = [];
    dispose = mountPanel(container as unknown as HTMLElement, { status: () => f.c.status(), subscribe: h => f.c.subscribe(h), refresh: () => f.c.refresh(), cancel: () => f.c.cancel(), find: (...args) => { pending = f.c.find(...args); return pending as ReturnType<ThirdBrainController['find']>; }, open: e => { const p = f.c.verifyOpen(e); opens.push(p); return p; }, openFragment: id => { const p = f.c.verifyFragmentOpen(id).then(async () => { const text = await fs.readFile(path.join(f.root, await f.store.fragmentPath(id)), 'utf8'); expect(text).toContain(action); expect(text).toContain('cobalt inlet'); }); generated.push(p); return p; } }, locale);
    const input = container.all().find(node => node.className === 'tb-idea')!; input.value = 'violet chamber'; input.fire('input'); container.all().find(node => node.tag === 'button' && node.textContent === messages(locale).find)!.fire('click');
    const found = await pending as Awaited<ReturnType<ThirdBrainController['find']>>; await Promise.resolve(); expect(found).toHaveLength(2);
    const cards = container.all().filter(node => node.className === 'tb-result'); expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.all().find(node => node.className === 'tb-fragment')!.text()).toContain('cobalt inlet'); expect(card.text()).toContain(messages(locale).excerpt);
      for (const button of card.all().filter(node => node.className === 'tb-source')) { button.fire('click'); await opens.at(-1); }
      card.all().find(node => node.tag === 'button' && node.textContent === messages(locale).openFragment)!.fire('click'); await generated.at(-1);
    }
    expect(opens).toHaveLength(found.reduce((count, r) => count + r.fragment.evidence.length, 0)); expect(generated).toHaveLength(2); await f.originals();
  } finally { await pending?.catch(() => {}); dispose?.(); f.c.dispose(); vi.unstubAllGlobals(); }
});

it.each(['md', 'canvas'])('actual %s preparation changes/exclusions refuse every old original action; cancellation/retry and human files stay protected', async extension => {
  const f = await fixture(extension);
  try {
    await f.c.initialize(); await f.c.refresh(); const all = await f.c.find('violet chamber', 'medium'); expect(all).toHaveLength(2);
    const merged = all.find(r => new Set(r.fragment.evidence.map(e => e.relativePath)).size === 2)!; expect(merged).toBeDefined(); expect(merged.fragment.summary).toContain(preparation);
    const statePath = path.join(f.root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath);
    const name = 'copy.' + extension;
    await f.put(name, wrap(raws['copy.md'].replace(preparation, 'Keep the dummy cobalt inlet open.'), extension));
    for (const e of merged.fragment.evidence) await expect(f.c.verifyOpen(e)).rejects.toThrow();
    // No localContext field: saved derived text retains its existing historical
    // browsing policy; that is not proof that its originals are current.
    await f.c.verifyFragmentOpen(merged.fragment.id);
    expect((await f.c.find('violet chamber', 'medium')).some(r => r.fragment.id === merged.fragment.id)).toBe(false); expect(await fs.readFile(statePath)).toEqual(state);
    await f.put(name, wrap(raws['copy.md'], extension)); f.settings.excludes.push(name);
    for (const e of merged.fragment.evidence) await expect(f.c.verifyOpen(e)).rejects.toThrow(); await f.c.verifyFragmentOpen(merged.fragment.id); f.settings.excludes.pop();
    const list = f.sources.list.bind(f.sources); let entered!: () => void, release!: () => void; const started = new Promise<void>(r => { entered = r; }), latch = new Promise<void>(r => { release = r; });
    vi.spyOn(f.sources, 'list').mockImplementationOnce(async options => { entered(); await latch; return list(options); }); const commit = vi.spyOn(f.store, 'commit');
    const refresh = f.c.refresh(); await started; f.c.cancel(); release(); await expect(refresh).rejects.toMatchObject({ name: 'AbortError' }); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    await f.c.refresh(); expect(await fs.readFile(statePath)).toEqual(state);
    for (const e of merged.fragment.evidence) await f.c.verifyOpen(e); await f.c.verifyFragmentOpen(merged.fragment.id);
    const target = path.join(f.root, await f.store.fragmentPath(merged.fragment.id)), bytes = await fs.readFile(target); await fs.writeFile(target, Buffer.concat([bytes, Buffer.from('\nSynthetic human amendment.')]));
    await expect(f.c.refresh()).rejects.toThrow(); expect(await fs.readFile(statePath)).toEqual(state); expect(await fs.readFile(target, 'utf8')).toContain('Synthetic human amendment.'); await f.originals();
  } finally { f.c.dispose(); vi.restoreAllMocks(); }
});

it('actual Canvas reloads 256 ordered quotations, refuses 257 and merged overflow before commit, then permits a legal retry', async () => {
  const scope = path.resolve('.local/local-root-ordered'); await fs.mkdir(scope, { recursive: true }); const root = await fs.mkdtemp(path.join(scope, 'bounds-'));
  const make = (count: number) => canvas(Array.from({ length: count }, (_, i) => '1. Synthetic calibration tile ' + i + '.').join('\n'));
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] }, store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths()), c = new ThirdBrainController(sources, store, () => settings, () => undefined, async () => {});
  const file = path.join(root, 'source.canvas'), legal = make(256);
  try {
    await fs.writeFile(file, legal); await c.initialize(); await c.refresh(); const index = (await store.load())!, all = Object.values(index.fragments); expect(all).toHaveLength(1); expect(all[0].evidence).toHaveLength(256);
    const statePath = path.join(root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath); await c.refresh(); expect(await fs.readFile(statePath)).toEqual(state);
    const commit = vi.spyOn(store, 'commit'); await fs.writeFile(file, make(257)); await expect(c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    await fs.writeFile(file, make(129)); await fs.writeFile(path.join(root, 'copy.canvas'), make(129)); await expect(c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    // Repair only self-authored synthetic inputs; no original or output cleanup.
    await fs.writeFile(path.join(root, 'copy.canvas'), canvas('')); await fs.writeFile(file, legal); await c.refresh(); expect(await fs.readFile(statePath)).not.toEqual(state); const repaired = (await store.load())!; expect(Object.values(repaired.fragments)).toHaveLength(1); expect(Object.values(repaired.fragments)[0].evidence).toHaveLength(256);
    const saved = await fs.readFile(statePath); await c.refresh(); expect(await fs.readFile(statePath)).toEqual(saved); expect(await fs.readFile(file, 'utf8')).toBe(legal);
  } finally { c.dispose(); vi.restoreAllMocks(); }
});
