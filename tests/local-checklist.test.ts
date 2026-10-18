// SPDX-License-Identifier: MIT
// Authored synthetic notes. Offline protocol captures are not semantic-quality evidence.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { analyzeSource, prepareSource } from '../src/core';
import { hasReadableQuote } from '../src/core/sources';
import type { Evidence, IndexState, ModelRequest } from '../src/core/types';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';

const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-checklist-legacy.json', 'utf8'));
const raw: string = legacy.raw;
const opts = { mode: 'local-excerpts' as const, cloudConsent: false, now: '2026-01-01T00:00:00.000Z' };
const snap = (text: string, name = 'synthetic.md') => prepareSource(name, text, hash(text), hash(name).slice(0, 24));
const canvas = (text: string) => JSON.stringify({ nodes: [{ type: 'text', text }], edges: [] });
const required = ['Seal the cobalt inlet.', 'Example: keep the dummy gate closed.', 'Drain the violet chamber after sealing the inlet.', 'Limitation: use only inert samples.', 'Condition: never connect real equipment.', 'Caveat: do not restart before both preparations finish.', '# Synthetic checklist', '## Disconnected bench', 'Only inside the isolated synthetic laboratory:'];

it.each(['md', 'canvas', 'quoted-md', 'quoted-canvas'])('%s keeps the complete qualified checklist, not an isolated dependent operation', async format => {
  const variants = [raw, raw.replace('[x]', '[X]'), raw.replace('[x]', '[ ]'), raw.replace('  - [x]', '  * [x]'), raw.replace('  - [x]', '  -'), raw.replace('  - [ ]', '  -'), raw.replace('- Complete', '- [ ] Complete').replace(/  - \[[ x]\]/gu, '  -'), raw.replace(/\n/gu, '\r\n')];
  for (const variant of variants) {
    const text = format.startsWith('quoted') ? variant.split(/\r?\n/u).map(line => '> ' + line).join('\n') : variant;
    const source = snap(format.endsWith('canvas') ? canvas(text) : text, format.endsWith('canvas') ? 'synthetic.canvas' : 'synthetic.md');
    const fragments = (await analyzeSource(source, opts)).fragments;
    expect(fragments).toHaveLength(1);
    for (const exact of required) expect(fragments[0].summary).toContain(exact);
    for (const row of text.split(/\r?\n/u).filter(line => /\[[ xX]\]/u.test(line))) expect(fragments[0].summary).toContain(row.trimEnd());
    for (const e of fragments[0].evidence) {
      expect(e.sourceId).toBe(source.id); expect(e.sourceHash).toBe(source.hash);
      if (e.start >= 0) expect(source.text.slice(e.start, e.end)).toBe(e.quote);
      else { expect(source.format).toBe('canvas'); expect(hasReadableQuote(source, e.quote)).toBe(true); }
    }
  }
});

it('keeps Chinese, tabbed, loose and long checklists whole without a wording-based dependency detector', async () => {
  const text = '- 仅限合成环境：\n  - [x] 先关闭青铜入口。\n    - 例子：隔离虚构闸门。\n  - [ ] 再排空紫色容器。\n    - 限制：只用惰性样本。\n  - 条件：不能接入真实设备。';
  for (const input of [text, text.replace('  - [ ]', '\n  - [ ]'), text.replace(/    - /gu, '\t\t- ').replace(/  - /gu, '\t- ')]) expect((await analyzeSource(snap(input), opts)).fragments.map(f => f.summary)).toEqual([input]);
  const long = raw.replace('keep the dummy gate closed.', 'keep the dummy gate closed. ' + 'Synthetic context. '.repeat(90));
  const fragments = (await analyzeSource(snap(long), opts)).fragments;
  expect(fragments).toHaveLength(1); expect(fragments[0].summary.length).toBeGreaterThan(1400);
  for (const exact of required) expect(fragments[0].summary).toContain(exact);
});

it('still separates qualified ordinary peers, with branch-local checkboxes and literal inline marker examples', async () => {
  const text = '- Independent synthetic observations:\n  - Remember the amber archive point.\n    - Example: literal `[ ]` is a marker example.\n      - [ ] Label the dummy sleeve.\n      - [x] Place the sleeve on the shelf.\n  - File the jade ledger.\n    - Caveat: no real identities.\n  - Condition: only in the disconnected archive.';
  const all = (await analyzeSource(snap(text), opts)).fragments;
  expect(all).toHaveLength(2); const amber = all.find(f => f.summary.includes('amber'))!;
  expect(amber.summary).toContain('[ ] Label'); expect(amber.summary).toContain('[x] Place'); expect(amber.summary).not.toContain('File the jade');
  expect(all.every(f => f.summary.includes('Condition: only in the disconnected archive.'))).toBe(true);
  const roots = '- [ ] Remember the amber archive point.\n- [x] File the jade ledger.';
  expect((await analyzeSource(snap(roots), opts)).fragments).toHaveLength(2);
  const nodes = JSON.stringify({ nodes: [{ type: 'text', text: raw }, { type: 'text', text: '- Independent white archive record.' }], edges: [] });
  expect((await analyzeSource(snap(nodes, 'synthetic.canvas'), opts)).fragments.find(f => f.summary.includes('white'))!.summary).toBe('- Independent white archive record.');
});

it('retains whole-group size and first-parent hidden barriers rather than using checkboxes as a bypass', async () => {
  await expect(analyzeSource(snap(raw.replace('keep the dummy gate closed.', '合'.repeat(16384))), opts)).rejects.toThrow();
  for (const marker of ['<!-- hidden -->', '%% hidden %%']) await expect(analyzeSource(snap(raw.replace('Complete both', marker + ' Complete both')), opts)).rejects.toThrow();
  const literal = 'Literal `<!--` and `%%` examples are ordinary prose.';
  expect((await analyzeSource(snap(raw + '\n\n' + literal), opts)).fragments.some(f => f.summary === '# Synthetic checklist\n## Disconnected bench\n\n' + literal)).toBe(true);
});

it('invalidates only the local generation and leaves both complete AI requests and signatures unchanged offline', async () => {
  expect(generationSignature({ ...defaults, outputFolder: 'Derived' })).not.toBe(legacy.signatures['local-excerpts']);
  for (const mode of ['local-model', 'cloud-model'] as const) {
    expect(generationSignature({ ...defaults, mode, outputFolder: 'Derived' })).toBe(legacy.signatures[mode]);
    const requests: ModelRequest[] = [];
    await analyzeSource(snap(raw, 'checklist.md'), { mode, cloudConsent: true, model: { request: async request => { requests.push(request); return { version: 1, decision: 'insufficient-context', fragments: [] }; } } });
    expect(requests).toEqual(legacy.requests[mode]);
  }
});

class Node {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false;
  children: Node[] = []; handlers = new Map<string, (() => void)[]>();
  constructor(readonly tag: string) {}
  append(...nodes: Node[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: Node[]) { this.children = nodes; }
  setAttribute() {} remove() {} focus() {}
  get childElementCount() { return this.children.length; }
  addEventListener(key: string, handler: () => void) { this.handlers.set(key, [...this.handlers.get(key) ?? [], handler]); }
  fire(key: string) { for (const handler of this.handlers.get(key) ?? []) handler(); }
  all(): Node[] { return [this, ...this.children.flatMap(n => n.all())]; }
  text(): string { return [this.textContent, ...this.children.map(n => n.text())].join('\n'); }
}

// Independent fresh-vault phases retain every callback under the existing deadline.
it.each([
  ['md', 'storage'], ['canvas', 'storage'],
  ['md', 'en'], ['md', 'zh'], ['canvas', 'en'], ['canvas', 'zh'],
  ['md', 'guards'], ['canvas', 'guards'],
] as const)('actual %s / %s: complete checklist → strict reload → local search and all original callbacks', async (extension, phase) => {
  const scope = path.resolve('.local/local-checklist'); await fs.mkdir(scope, { recursive: true }); const root = await fs.mkdtemp(path.join(scope, 'vault-'));
  const raws = Object.fromEntries(Object.entries({ checklist: raw, copy: raw, denied: raw.replace('Complete both preparations', 'Never complete these preparations') }).map(([name, text]) => [name + '.' + extension, extension === 'md' ? text : canvas('---\nprivacy: private\n---\n' + text)]));
  const mtimes = new Map<string, string>();
  for (const [name, text] of Object.entries(raws)) { await fs.writeFile(path.join(root, name), text); mtimes.set(name, (await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString()); }
  await fs.mkdir(path.join(root, 'Derived')); await fs.writeFile(path.join(root, 'Derived/manual.txt'), 'Synthetic human-owned material.');
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] as string[] }, store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const request = vi.fn(async () => { throw Error('Forbidden model request'); });
  const c = new ThirdBrainController(sources, store, () => settings, () => ({ request }), async () => {});
  let dispose: (() => void) | undefined, pending: Promise<unknown> | undefined;
  try {
    const oldIds: string[] = [];
    if (extension === 'md' && phase === 'storage') { const inputs = await sources.list(); const old: IndexState = structuredClone(legacy.oldIndex); oldIds.push(...Object.keys(old.fragments)); await store.commit(old, () => sources.verify(inputs)); }
    await c.initialize(); await c.refresh(); const index = (await store.load())!, all = Object.values(index.fragments);
    expect(all).toHaveLength(2); expect(all.every(f => required.every(exact => f.summary.includes(exact)))).toBe(true);
    const merged = all.find(f => f.summary.includes('Complete both'))!; expect(new Set(merged.evidence.map(e => e.relativePath)).size).toBe(2);
    for (const id of oldIds) expect(index.fragments[id]).toBeUndefined();
    if (extension === 'canvas') expect(all.every(f => f.privacy === 'private')).toBe(true);
    const statePath = path.join(root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath);
    await c.initialize(); await c.refresh(); expect(await store.load()).toEqual(index); expect(await fs.readFile(statePath)).toEqual(state);
    let openCount = 0;
    if (phase === 'en' || phase === 'zh') {
      vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) }); const container = new Node('main'), opens: Promise<void>[] = [];
      dispose = mountPanel(container as unknown as HTMLElement, { status: () => c.status(), subscribe: h => c.subscribe(h), refresh: () => c.refresh(), cancel: () => c.cancel(), find: (...args) => { pending = c.find(...args); return pending as ReturnType<ThirdBrainController['find']>; }, open: e => { const p = c.verifyOpen(e); opens.push(p); return p; } }, phase);
      const input = container.all().find(n => n.className === 'tb-idea')!; input.value = 'violet chamber'; input.fire('input'); container.all().find(n => n.tag === 'button' && n.textContent === messages(phase).find)!.fire('click');
      const found = await pending as Awaited<ReturnType<ThirdBrainController['find']>>; await Promise.resolve(); expect(found).toHaveLength(2);
      const cards = container.all().filter(n => n.className === 'tb-result'); expect(cards).toHaveLength(2);
      for (const card of cards) {
        expect(card.text()).toContain(messages(phase).excerpt);
        for (const exact of required) expect(card.text()).toContain(exact);
        for (const button of card.all().filter(n => n.className === 'tb-source')) { button.fire('click'); await opens.at(-1); }
      }
      expect(opens).toHaveLength(found.reduce((n, r) => n + r.fragment.evidence.length, 0)); openCount = opens.length;
      dispose(); dispose = undefined; vi.unstubAllGlobals();
    }
    for (const [name, text] of Object.entries(raws)) { expect(hash(await fs.readFile(path.join(root, name)))).toBe(hash(text)); expect((await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString()).toBe(mtimes.get(name)); }
    if (phase === 'guards') {
      const found = await c.find('violet chamber', 'medium'), current = found.find(r => r.fragment.id === merged.id)!; expect(current).toBeDefined(); const evidence: Evidence[] = current.fragment.evidence;
      const name = 'checklist.' + extension;
      await fs.writeFile(path.join(root, name), raws[name].replace('Seal the cobalt inlet.', 'Block the synthetic inlet.'));
      for (const e of evidence) await expect(c.verifyOpen(e)).rejects.toThrow(); expect((await c.find('violet chamber', 'medium')).some(r => r.fragment.id === merged.id)).toBe(false);
      await fs.writeFile(path.join(root, name), raws[name]); settings.excludes.push(name); for (const e of evidence) await expect(c.verifyOpen(e)).rejects.toThrow(); settings.excludes.pop(); for (const e of evidence) await c.verifyOpen(e);
      const commit = vi.spyOn(store, 'commit'), list = sources.list.bind(sources); let entered!: () => void, release!: () => void;
      const started = new Promise<void>(r => { entered = r; }), latch = new Promise<void>(r => { release = r; });
      vi.spyOn(sources, 'list').mockImplementationOnce(async o => { entered(); await latch; return list(o); });
      const refresh = c.refresh(); await started; c.cancel(); release(); await expect(refresh).rejects.toMatchObject({ name: 'AbortError' }); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
      await c.refresh(); expect(await fs.readFile(statePath)).toEqual(state);
      const target = path.join(root, await store.fragmentPath(merged.id)), bytes = await fs.readFile(target); await fs.writeFile(target, Buffer.concat([bytes, Buffer.from('\nSynthetic human amendment.')]));
      await expect(c.refresh()).rejects.toThrow(); expect(await fs.readFile(target, 'utf8')).toContain('Synthetic human amendment.'); expect(await fs.readFile(statePath)).toEqual(state);
      await fs.writeFile(target, bytes); await c.initialize(); await c.refresh(); expect(await fs.readFile(statePath)).toEqual(state);
    }
    for (const [name, text] of Object.entries(raws)) expect(await fs.readFile(path.join(root, name), 'utf8')).toBe(text);
    expect(await fs.readFile(path.join(root, 'Derived/manual.txt'), 'utf8')).toBe('Synthetic human-owned material.'); expect(request).not.toHaveBeenCalled();
    await fs.writeFile(path.join(scope, extension + '-' + phase + '-receipt.json'), JSON.stringify({ phase, completeChecklistGroups: 2, strictReload: true, openCount, idempotent: true, originalBytesPreserved: true, genuineModels: 0, nativeClicks: false }, null, 2));
  } finally { await pending?.catch(() => {}); dispose?.(); c.dispose(); vi.unstubAllGlobals(); vi.restoreAllMocks(); }
});

it('reloads a complete Canvas checklist with 256 quotations, rejects 257 before commit and permits repaired retry', async () => {
  const make = (n: number) => canvas('- Complete both preparations:\n  - [x] Seal the amber inlet.\n' + Array.from({ length: n }, (_, i) => '    - Example: synthetic tile ' + i + '.').join('\n') + '\n  - [ ] Drain the violet chamber.\n    - Caveat: inert samples only.');
  const scope = path.resolve('.local/local-checklist'); await fs.mkdir(scope, { recursive: true }); const root = await fs.mkdtemp(path.join(scope, 'bounds-'));
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] }, store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths()), c = new ThirdBrainController(sources, store, () => settings, () => undefined, async () => {});
  const file = path.join(root, 'source.canvas'), legal = make(252);
  try {
    await fs.writeFile(file, legal); await c.initialize(); await c.refresh(); const index = (await store.load())!, all = Object.values(index.fragments); expect(all).toHaveLength(1); expect(all[0].evidence).toHaveLength(256);
    const found = await c.find('violet chamber', 'medium'); expect(found).toHaveLength(1); for (const e of [found[0].fragment.evidence[0], found[0].fragment.evidence.at(-1)!]) await c.verifyOpen(e);
    const statePath = path.join(root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath); await c.refresh(); expect(await fs.readFile(statePath)).toEqual(state);
    const commit = vi.spyOn(store, 'commit'); await fs.writeFile(file, make(253)); await expect(c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    await fs.writeFile(file, legal); await c.refresh(); expect(await fs.readFile(statePath)).toEqual(state); expect(await fs.readFile(file, 'utf8')).toBe(legal);
  } finally { c.dispose(); vi.restoreAllMocks(); }
});
