// SPDX-License-Identifier: MIT
// Authored synthetic notes. Offline ModelPort captures are not semantic-quality evidence.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { analyzeSource, buildIndex, prepareSource } from '../src/core';
import { hasReadableQuote } from '../src/core/sources';
import type { Evidence, IndexState, ModelRequest } from '../src/core/types';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';

const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-nested-qualified-legacy.json', 'utf8'));
const opts = { mode: 'local-excerpts' as const, cloudConsent: false, now: '2026-01-01T00:00:00.000Z' };
const snap = (raw: string, name = 'synthetic.md') => prepareSource(name, raw, hash(raw), hash(name).slice(0, 24));
const canvas = (raw: string) => JSON.stringify({ nodes: [{ type: 'text', text: raw }], edges: [] });
const body = '- Only in the disconnected synthetic fixture:\n  - Remember the amber calibration point.\n    - Example: a disposable mock.\n  - File the jade ledger by date.\n    - Counterexample: real identities are forbidden.';

it.each(['md', 'canvas', 'quoted-md', 'quoted-canvas'])('%s separates individually qualified nested points while retaining full parent and shared context', async format => {
  const inputs = Object.entries(legacy.raws as Record<string, string>).map(([name, raw]) => {
    const text = format.startsWith('quoted') ? raw.split('\n').map(line => '> ' + line).join('\n') : raw;
    return snap(format.endsWith('canvas') ? canvas(text) : text, name.replace('.md', format.endsWith('canvas') ? '.canvas' : '.md'));
  });
  const index = await buildIndex(inputs, { ...opts, previous: null, signature: generationSignature(defaults) });
  const all = Object.values(index.fragments);
  expect(all).toHaveLength(4);
  const actions = all.filter(f => f.summary.includes(legacy.action));
  expect(actions).toHaveLength(2);
  for (const f of actions) {
    expect(f.summary).not.toContain(legacy.other);
    expect(f.summary).not.toContain('separate mock archive');
    for (const common of ['# Synthetic maintenance', '## Isolated bench', 'Only in the synthetic laboratory:', 'copper simulator:', 'Example: the amber sandbox.', 'Counterexample: connected machinery', 'Limitation: no production equipment.', 'Condition: use a disposable mock fixture.']) expect(f.summary).toContain(common);
  }
  const copy = actions.find(f => f.summary.includes('disconnected'))!;
  expect(new Set(copy.evidence.map(e => e.relativePath)).size).toBe(2);
  expect(new Set(actions.map(f => f.id)).size).toBe(2);
  for (const f of all) for (const e of f.evidence) {
    const source = inputs.find(s => s.path === e.relativePath)!;
    expect(e.sourceId).toBe(source.id); expect(e.sourceHash).toBe(source.hash);
    if (e.start >= 0) expect(source.text.slice(e.start, e.end)).toBe(e.quote);
    else { expect(source.format).toBe('canvas'); expect(hasReadableQuote(source, e.quote)).toBe(true); }
  }
});

it.each([
  ['Chinese', '- 仅在离线合成环境中允许：\n  - 将青铜旋钮调到七档。\n    - 例子：离线沙盒。\n  - 将翡翠记录按日期归档。\n    - 反例：真实身份禁止记录。'],
  ['numbered root with unordered points', '1. Only the synthetic fixture:\n   - Remember the amber point.\n      - Example: a disposable mock.\n   - File the jade ledger.\n      - Caveat: no real identity.'],
  ['tabs', '- Only the synthetic fixture:\n\t- Remember the amber point.\n\t\t- Example: a disposable mock.\n\t- File the jade ledger.\n\t\t- Caveat: no real identity.'],
  ['loose', body.replace(/\n  - /gu, '\n\n  - ')],
])('%s keeps complete qualified branches and exact CR/CRLF mappings', async (_label, raw) => {
  for (const newline of ['\n', '\r\n', '\r']) {
    const text = raw.replace(/\n/gu, newline);
    const all = (await analyzeSource(snap(text), opts)).fragments;
    expect(all).toHaveLength(2);
    expect(all.every(f => f.summary.includes(text.split(newline)[0]))).toBe(true);
    expect(all.every(f => f.summary.includes('Example:') || f.summary.includes('Counterexample:') || f.summary.includes('Caveat:') || f.summary.includes('例子：') || f.summary.includes('反例：'))).toBe(true);
    expect(all.every(f => f.evidence.length >= 2)).toBe(true);
    for (const f of all) for (const e of f.evidence) expect(text.slice(e.start, e.end)).toBe(e.quote);
  }
});

it('retains direct-child shared labels, their descendants and root-level qualifiers with every branch in authored order', async () => {
  const raw = body.replace('  - Remember', '  - Condition: use only a disconnected bench.\n    - Keep the synthetic cord isolated.\n  - Remember') + '\n  - Limitation: never use real equipment.\n    - This includes the test rig.\n- Caveat: no production work.';
  const all = (await analyzeSource(snap(raw), opts)).fragments;
  expect(all).toHaveLength(2);
  for (const f of all) {
    expect(f.summary.indexOf('Condition:')).toBeLessThan(f.summary.indexOf('  - Remember') >= 0 ? f.summary.indexOf('  - Remember') : f.summary.indexOf('  - File'));
    for (const common of ['Keep the synthetic cord isolated.', 'Limitation: never use real equipment.', 'This includes the test rig.', 'Caveat: no production work.']) expect(f.summary).toContain(common);
    for (const e of f.evidence) expect(raw.slice(e.start, e.end)).toBe(e.quote);
  }
});

it('keeps ambiguous or single-branch groups whole; partly qualified peers retain complete visible context', async () => {
  for (const raw of [
    '1. Only the synthetic fixture:\n   1. Remember the amber point.\n      - Example: a disposable mock.\n   2. File the jade ledger.\n      - Caveat: no real identity.',

    body.replace('fixture:', 'fixture.'),
    body.replace('fixture:\n', 'fixture:\n  Complete both branches before restarting.\n'),
    body + '\n  Both branches must finish before restarting.',
    body.replace(/    - /gu, '   - '),
    '- Only the synthetic fixture:\n  - Remember the amber point.\n    - Example: a disposable mock.\n  - Caveat: keep the fixture isolated.',
    '- Only the synthetic fixture:\n  - Complete the coupled sequence:\n    - Remember the amber point.\n      - Example: a disposable mock.\n    - File the jade ledger.\n      - Caveat: no real identity.',
  ]) expect((await analyzeSource(snap(raw), opts)).fragments.map(f => f.summary)).toEqual([raw]);
  const partial = body.replace('    - Example: a disposable mock.\n', '');
  const all = (await analyzeSource(snap(partial), opts)).fragments;
  expect(all).toHaveLength(2);
  for (const f of all) {
    expect(f.localContext).toBeTruthy();
    for (const line of partial.split('\n')) expect(f.summary + '\n' + f.localContext).toContain(line.trim());
  }
  expect(all.find(f => f.summary.includes('File the jade'))!.summary).not.toContain('Remember the amber');
});

it('retains every long qualified subtree intact; existing whole-group and hidden-boundary protections do not become a fan-out bypass', async () => {
  const raw = body.replace('a disposable mock.', 'a disposable mock. ' + '合成记录。'.repeat(320));
  const all = (await analyzeSource(snap(raw), opts)).fragments;
  expect(all).toHaveLength(2);
  expect(all.find(f => f.summary.includes('amber'))!.summary.length).toBeGreaterThan(1400);
  for (const marker of ['<!-- hidden -->', '%% hidden %%']) await expect(analyzeSource(snap(body.replace('fixture:', marker + ' fixture:')), opts)).rejects.toThrow();
  await expect(analyzeSource(snap(body.replace('a disposable mock.', '合'.repeat(16384))), opts)).rejects.toThrow();
  const nodes = JSON.stringify({ nodes: [{ type: 'text', text: body }, { type: 'text', text: '- Separate white archive record.' }], edges: [] });
  expect((await analyzeSource(snap(nodes, 'synthetic.canvas'), opts)).fragments.find(f => f.summary.includes('white'))!.summary).toBe('- Separate white archive record.');
  const literal = 'Literal `<!--` and `%%` examples are ordinary prose.';
  expect((await analyzeSource(snap(body + '\n\n' + literal), opts)).fragments.some(f => f.summary === literal)).toBe(true);
});

it('invalidates only local generations and preserves complete AI primary/background inputs exactly (offline)', async () => {
  expect(generationSignature({ ...defaults, outputFolder: 'Derived' })).not.toBe(legacy.signatures['local-excerpts']);
  for (const mode of ['local-model', 'cloud-model'] as const) {
    expect(generationSignature({ ...defaults, outputFolder: 'Derived', mode })).toBe(legacy.signatures[mode]);
    const requests: ModelRequest[] = [];
    await analyzeSource(snap(legacy.raws['a.md'], 'a.md'), { mode, cloudConsent: true, model: { request: async request => { requests.push(request); return { version: 1, decision: 'insufficient-context', fragments: [] }; } } });
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

// Keep independent real-file journeys below the unchanged per-test deadline.
// Each phase has a fresh vault; both language phases still invoke EVERY source
// callback. No safety assertion, evidence entry or live store check is skipped.
it.each([
  ['md', 'storage'], ['canvas', 'storage'],
  ['md', 'en'], ['md', 'zh'], ['canvas', 'en'], ['canvas', 'zh'],
  ['md', 'guards'], ['canvas', 'guards'],
] as const)('actual %s files / %s → strict reload, original integrity and complete owned journey', async (extension, phase) => {
  const scope = path.resolve('.local/local-nested-qualified'); await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'vault-'));
  const raws = Object.fromEntries(Object.entries(legacy.raws as Record<string, string>).map(([n, r]) => [n.replace('.md', '.' + extension), extension === 'md' ? r : canvas('---\nprivacy: private\n---\n' + r)]));
  const mtimes = new Map<string, string>();
  for (const [n, r] of Object.entries(raws)) { await fs.writeFile(path.join(root, n), r); mtimes.set(n, (await fs.stat(path.join(root, n), { bigint: true })).mtimeNs.toString()); }
  await fs.mkdir(path.join(root, 'Derived')); await fs.writeFile(path.join(root, 'Derived/manual.txt'), 'Synthetic human-owned file.');
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] as string[] };
  const store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const request = vi.fn(async () => { throw Error('Forbidden model request'); });
  const c = new ThirdBrainController(sources, store, () => settings, () => ({ request }), async () => {});
  let dispose: (() => void) | undefined, pending: Promise<unknown> | undefined;
  try {
    let oldId: string | undefined;
    if (extension === 'md' && phase === 'storage') { const inputs = await sources.list(); const old: IndexState = structuredClone(legacy.old); await store.commit(old, () => sources.verify(inputs)); oldId = Object.values(old.fragments)[0].id; }
    await c.initialize(); await c.refresh(); const index = (await store.load())!, all = Object.values(index.fragments);
    expect(all).toHaveLength(4); if (oldId) expect(index.fragments[oldId]).toBeUndefined();
    if (extension === 'canvas') expect(all.every(f => f.privacy === 'private')).toBe(true);
    const statePath = path.join(root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath);
    await c.initialize(); await c.refresh(); expect(await store.load()).toEqual(index); expect(await fs.readFile(statePath)).toEqual(state);
    let evidence: Evidence[] = [], openCount = 0;
    for (const locale of phase === 'en' || phase === 'zh' ? [phase] : []) {
      vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) });
      const container = new Node('main'), opens: Promise<void>[] = [];
      dispose = mountPanel(container as unknown as HTMLElement, { status: () => c.status(), subscribe: h => c.subscribe(h), refresh: () => c.refresh(), cancel: () => c.cancel(), find: (...args) => { pending = c.find(...args); return pending as ReturnType<ThirdBrainController['find']>; }, open: e => { const p = c.verifyOpen(e); opens.push(p); return p; } }, locale);
      const input = container.all().find(n => n.className === 'tb-idea')!;
      input.value = 'cobalt calibration point'; input.fire('input'); container.all().find(n => n.tag === 'button' && n.textContent === messages(locale).find)!.fire('click');
      const result = await pending as Awaited<ReturnType<ThirdBrainController['find']>>; await Promise.resolve();
      const actions = result.filter(r => r.fragment.summary.includes(legacy.action)); expect(actions).toHaveLength(2);
      evidence = actions.find(r => r.fragment.summary.includes('disconnected'))!.fragment.evidence;
      const cards = container.all().filter(n => n.className === 'tb-result' && n.text().includes(legacy.action)); expect(cards).toHaveLength(2);
      for (const card of cards) {
        expect(card.text()).toContain(messages(locale).excerpt);
        // The primary still separates. Same-group siblings now deliberately
        // remain visible in the separately labelled source context and evidence.
        expect(card.all().find(n => n.className === 'tb-fragment')!.text()).not.toContain(legacy.other);
        expect(card.all().find(n => n.className === 'tb-local-context')!.text()).toContain(legacy.other);
        expect(card.all().find(n => n.className === 'tb-evidence')!.text()).toContain(legacy.other);
        expect(card.text()).toContain('Limitation: no production equipment.'); expect(card.text()).toContain('Condition: use a disposable mock fixture.');
        for (const button of card.all().filter(n => n.className === 'tb-source')) { button.fire('click'); await opens.at(-1); }
      }
      expect(opens).toHaveLength(actions.reduce((n, r) => n + r.fragment.evidence.length, 0)); openCount += opens.length;
      dispose(); dispose = undefined; vi.unstubAllGlobals();
    }
    for (const [n, r] of Object.entries(raws)) { expect(hash(await fs.readFile(path.join(root, n)))).toBe(hash(r)); expect((await fs.stat(path.join(root, n), { bigint: true })).mtimeNs.toString()).toBe(mtimes.get(n)); }
    if (phase === 'guards') {
      const current = await c.find('cobalt calibration point', 'medium');
      evidence = current.find(r => r.fragment.summary.includes(legacy.action) && r.fragment.summary.includes('disconnected'))!.fragment.evidence;
      expect(evidence.length).toBeGreaterThan(0);
      const name = 'a.' + extension;
      await fs.writeFile(path.join(root, name), raws[name].replace('disconnected copper', 'changed synthetic'));
      for (const e of evidence) await expect(c.verifyOpen(e)).rejects.toThrow();
      expect((await c.find('cobalt calibration point', 'medium')).some(r => r.fragment.id === all.find(f => f.summary.includes(legacy.action) && f.summary.includes('disconnected'))!.id)).toBe(false);
      await fs.writeFile(path.join(root, name), raws[name]); settings.excludes.push(name);
      for (const e of evidence) await expect(c.verifyOpen(e)).rejects.toThrow(); settings.excludes.pop(); for (const e of evidence) await c.verifyOpen(e);
      const commit = vi.spyOn(store, 'commit');
      const huge = body.replace('a disposable mock.', '合'.repeat(16384));
      await fs.writeFile(path.join(root, name), extension === 'md' ? huge : canvas(huge)); await expect(c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
      await fs.writeFile(path.join(root, name), raws[name]); await c.refresh(); expect(await fs.readFile(statePath)).toEqual(state);
      const list = sources.list.bind(sources); let release!: () => void, entered!: () => void;
      const started = new Promise<void>(r => { entered = r; }), latch = new Promise<void>(r => { release = r; });
      vi.spyOn(sources, 'list').mockImplementationOnce(async o => { entered(); await latch; return list(o); }); commit.mockClear();
      const refresh = c.refresh(); await started; c.cancel(); release(); await expect(refresh).rejects.toMatchObject({ name: 'AbortError' }); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
      await c.refresh(); expect(await fs.readFile(statePath)).toEqual(state);
      const target = path.join(root, await store.fragmentPath(all[0].id)), bytes = await fs.readFile(target);
      await fs.writeFile(target, Buffer.concat([bytes, Buffer.from('\nSynthetic human amendment.')])); await expect(c.refresh()).rejects.toThrow(); expect(await fs.readFile(target, 'utf8')).toContain('Synthetic human amendment.'); expect(await fs.readFile(statePath)).toEqual(state);
      await fs.writeFile(target, bytes); await c.initialize(); await c.refresh(); expect(await fs.readFile(statePath)).toEqual(state);
    }
    expect(await fs.readFile(path.join(root, 'Derived/manual.txt'), 'utf8')).toBe('Synthetic human-owned file.'); for (const [n, r] of Object.entries(raws)) expect(await fs.readFile(path.join(root, n), 'utf8')).toBe(r); expect(request).not.toHaveBeenCalled();
    await fs.writeFile(path.join(scope, extension + '-' + phase + '-receipt.json'), JSON.stringify({ phase, strictReload: true, independentlyQualifiedFragments: 4, openCount, upgrade: extension === 'md' && phase === 'storage', idempotent: true, realModelRequests: 0, nativeHost: false }, null, 2));
  } finally { await pending?.catch(() => {}); dispose?.(); c.dispose(); vi.unstubAllGlobals(); vi.restoreAllMocks(); }
});

it('strictly reloads 256 Canvas quotations after nested separation, refuses 257 before commit and retries idempotently', async () => {
  const make = (n: number) => canvas('- Only the disconnected synthetic fixture:\n  - Remember the amber point.\n' + Array.from({ length: n }, (_, i) => '    - Example: synthetic tile ' + i + '.').join('\n') + '\n  - File the jade ledger.\n    - Caveat: no real identity.');
  const scope = path.resolve('.local/local-nested-qualified'); await fs.mkdir(scope, { recursive: true }); const root = await fs.mkdtemp(path.join(scope, 'bounds-'));
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] }, store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  // Root + selected child + n examples + omitted child + its caveat = n + 4.
  // Preserve the same exact 256/257 boundary, now counting all sibling evidence.
  const c = new ThirdBrainController(sources, store, () => settings, () => undefined, async () => {}), file = path.join(root, 'source.canvas'); const legal = make(252);
  try {
    await fs.writeFile(file, legal); await c.initialize(); await c.refresh(); const index = (await store.load())!, all = Object.values(index.fragments); expect(all).toHaveLength(2); const f = all.find(f => f.summary.includes('amber'))!; expect(f.evidence).toHaveLength(256);
    const found = await c.find('amber point', 'medium'); const current = found.find(r => r.fragment.id === f.id)!; expect(current).toBeDefined(); for (const e of [current.fragment.evidence[0], current.fragment.evidence.at(-1)!]) await c.verifyOpen(e);
    const statePath = path.join(root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath); await c.refresh(); expect(await fs.readFile(statePath)).toEqual(state);
    const commit = vi.spyOn(store, 'commit'); await fs.writeFile(file, make(253)); await expect(c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    await fs.writeFile(file, legal); await c.refresh(); expect(await fs.readFile(statePath)).toEqual(state); expect(await fs.readFile(file, 'utf8')).toBe(legal);
  } finally { c.dispose(); vi.restoreAllMocks(); }
});
