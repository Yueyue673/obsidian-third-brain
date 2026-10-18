// SPDX-License-Identifier: MIT
// Authored synthetic notes; offline protocol captures are not model-quality evidence.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { analyzeSource, buildIndex, prepareSource } from '../src/core';
import type { Evidence, IndexState, ModelRequest } from '../src/core/types';
import { hasReadableQuote } from '../src/core/sources';
import { sourceDiagnostic } from '../src/core/source-diagnostics';
import { ThirdBrainController } from '../src/controller';
import { FileSources, currentEvidence, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';

const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-list-qualifiers-legacy.json', 'utf8'));
const opts = { mode: 'local-excerpts' as const, cloudConsent: false, now: '2026-01-01T00:00:00.000Z' };
const snap = (raw: string, name = 'synthetic.md') => prepareSource(name, raw, hash(raw), hash(name).slice(0, 24));
const canvas = (raw: string, extra = '') => JSON.stringify({ nodes: [{ type: 'text', text: raw }, ...(extra ? [{ type: 'text', text: extra }] : [])], edges: [] });
const action = '- Rotate the synthetic amber calibration ring.';

it.each(['md', 'canvas'])('%s action keeps its following conditions/caveats; distinct contexts do not deduplicate', async extension => {
  const inputs = Object.entries(legacy.raws as Record<string, string>).map(([n, r]) => snap(extension === 'md' ? r : canvas(r), n.replace('.md', '.' + extension)));
  const index = await buildIndex(inputs, { ...opts, previous: null, signature: generationSignature(defaults) });
  const actions = Object.values(index.fragments).filter(f => f.summary.includes(action));
  expect(actions).toHaveLength(2);
  for (const f of actions) {
    expect(f.summary).toContain(legacy.heading); expect(f.summary).toContain(legacy.lead);
    expect(f.summary).toContain('- Condition:'); expect(f.summary).toContain('- Caveat:');
    expect(f.summary).toContain('Verify the synthetic cable is isolated.');
    expect(f.summary).toContain('- Example:'); expect(f.summary).not.toContain(legacy.other);
    for (const e of f.evidence) {
      const source = inputs.find(s => s.path === e.relativePath)!;
      if (e.start >= 0) expect(source.text.slice(e.start, e.end)).toBe(e.quote);
      else expect(hasReadableQuote(source, e.quote)).toBe(true);
    }
  }
  const original = actions.find(f => f.summary.includes(legacy.condition))!;
  expect(new Set(original.evidence.map(e => e.relativePath)).size).toBe(2);
  expect(Object.values(index.fragments).filter(f => f.summary.includes(legacy.other))).toHaveLength(1);
});

it.each(['Condition:', 'Conditions：', 'Caveat:', 'CAVEATS:', 'Limitation:', 'Limitations:', '条件：', '前提：', '限制：'])('retains a same-level %s label and descendants without absorbing the next independent point', async label => {
  const group = action + '\n- ' + label + ' only the isolated synthetic rig.\n  - Check the disconnected synthetic cable.';
  const other = '- Record the independent synthetic blue reading.';
  const result = await analyzeSource(snap(group + '\n' + other), opts);
  expect(result.fragments.map(f => f.summary).sort()).toEqual([group, other].sort());
  expect(result.fragments.find(f => f.summary === group)!.evidence[0].quote).toBe(group);
});

it.each([
  '8. Rotate the synthetic amber calibration ring.\n\n9. Condition: isolated synthetic rig.\n   - Verify the synthetic cable.\n\n10. Caveat: never use the connected rig.',
  '1) Rotate the synthetic amber calibration ring.\n2) 限制：仅供离线合成装置。\n3) 反例：已连接的合成装置。',
  '* Rotate the synthetic amber calibration ring.\n* Example: the isolated synthetic bench.\n* Conditions: the synthetic motor is disconnected.\n* Caveats: not for the connected rig.',
  '+ Rotate the synthetic amber calibration ring.\n  + Check the synthetic cable.\n+ 前提：仅供离线合成装置。\n  + 记录合成指示灯。',
])('keeps numbered/loose/mixed-context groups intact: %s', async group => {
  const r = await analyzeSource(snap(group + '\n- Record an independent synthetic blue reading.'), opts);
  expect(r.fragments).toHaveLength(2); expect(r.fragments.some(f => f.summary === group)).toBe(true);
});

it('does not infer labels inside prose, ordinary titles or leading standalone context', async () => {
  for (const next of ['Condition monitoring is an independent topic.', 'Caveat archive contains separate observations.', 'Limitation study is a separate subject.', 'An ordinary sentence mentions Condition: without introducing context.', '条件判断是另一个独立主题。']) {
    const r = await analyzeSource(snap(action + '\n- ' + next), opts);
    expect(r.fragments.find(f => f.summary.includes(action))!.summary).toBe(action);
    expect(r.fragments).toHaveLength(2);
  }
  const leading = '- Condition: a standalone synthetic precondition.\n- Caveat: a standalone synthetic limitation.\n' + action;
  const r = await analyzeSource(snap(leading), opts);
  expect(r.fragments).toHaveLength(3); expect(r.fragments.find(f => f.summary.includes(action))!.summary).toBe(action);
  const ordinary = 'Literal `<!--` and `%%` are ordinary inline examples.';
  expect((await analyzeSource(snap(action + '\n\n' + ordinary + '\n\n- Condition: unrelated synthetic scope.'), opts)).fragments.some(f => f.summary === ordinary)).toBe(true);
});

it('ends attachment at independent prose, headings, hidden/code boundaries and Canvas nodes', async () => {
  for (const boundary of ['\n\nIndependent synthetic prose.\n\n', '\n# Separate synthetic section\n', '\n```\nSynthetic code.\n```\n', '\n<!-- hidden -->\n', '\n%% hidden %%\n', '\n---\n']) {
    const r = await analyzeSource(snap(action + boundary + '- Condition: unrelated synthetic context.'), opts);
    expect(r.fragments.find(f => f.summary.includes(action))!.summary).toBe(action);
  }
  const r = await analyzeSource(snap(canvas(action, '- Condition: unrelated synthetic context.'), 'synthetic.canvas'), opts);
  expect(r.fragments.find(f => f.summary.includes(action))!.summary).toBe(action);
});

it.each(['<!-- hidden -->', '%% hidden %%'])('rejects %s in either first parent or attached restriction', async marker => {
  for (const raw of ['- Rotate ' + marker + ' the synthetic ring.\n- Condition: disconnected rig.', action + '\n- Caveat: ' + marker + ' connected rigs forbidden.']) {
    await expect(analyzeSource(snap(raw), opts)).rejects.toThrow();
  }
});

it('never length-splits a long restriction and counts it in the existing complete-context bound', async () => {
  const prefix = '# Synthetic calibration\n\nFor the synthetic demonstration:\n\n' + action + '\n- Condition: ';
  const raw = prefix + '合'.repeat(16384 - prefix.length);
  const r = await analyzeSource(snap(raw), opts);
  expect(r.fragments).toHaveLength(1); expect(r.fragments[0].summary).toBe(raw);
  let error: unknown; try { await analyzeSource(snap(raw + '尾'), opts); } catch (e) { error = e; }
  expect(sourceDiagnostic(error)).toEqual({ relativePath: 'synthetic.md', stage: 'analysis', reason: 'local-context-size-limit' });
});

it('invalidates only local generations; AI primary/background/signatures remain exactly unchanged (offline)', async () => {
  expect(generationSignature({ ...defaults, outputFolder: 'Derived' })).not.toBe(legacy.signatures['local-excerpts']);
  for (const mode of ['local-model', 'cloud-model'] as const) {
    expect(generationSignature({ ...defaults, outputFolder: 'Derived', mode })).toBe(legacy.signatures[mode]);
    const requests: ModelRequest[] = [];
    await analyzeSource(snap(legacy.raws['a.md'], 'a.md'), { mode, cloudConsent: true, model: { request: async request => { requests.push(request); return { version: 1, decision: 'insufficient-context', fragments: [] }; } } });
    expect(requests).toEqual(legacy.requests[mode]);
  }
});

class Node {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false; children: Node[] = []; handlers = new Map<string, (() => void)[]>();
  constructor(readonly tag: string) {}
  append(...n: Node[]) { this.children.push(...n); } replaceChildren(...n: Node[]) { this.children = n; }
  setAttribute() {} remove() {} focus() {} get childElementCount() { return this.children.length; }
  addEventListener(k: string, h: () => void) { this.handlers.set(k, [...this.handlers.get(k) ?? [], h]); }
  fire(k: string) { for (const h of this.handlers.get(k) ?? []) h(); }
  all(): Node[] { return [this, ...this.children.flatMap(n => n.all())]; }
  text(): string { return [this.textContent, ...this.children.map(n => n.text())].join('\n'); }
}

async function fixture(extension: string) {
  const scope = path.resolve('.local/local-list-qualifiers'); await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'vault-'));
  const raws = Object.fromEntries(Object.entries(legacy.raws as Record<string, string>).map(([n, r]) => [n.replace('.md', '.' + extension), extension === 'md' ? r : canvas('---\nprivacy: private\n---\n' + r)]));
  const mtimes = new Map<string, string>();
  for (const [n, r] of Object.entries(raws)) { await fs.writeFile(path.join(root, n), r); mtimes.set(n, (await fs.stat(path.join(root, n), { bigint: true })).mtimeNs.toString()); }
  await fs.mkdir(path.join(root, 'Derived')); await fs.writeFile(path.join(root, 'Derived/manual.txt'), 'Synthetic human-owned file.');
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] as string[] };
  const store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const request = vi.fn(async () => { throw Error('Forbidden model request'); });
  const c = new ThirdBrainController(sources, store, () => settings, () => ({ request }), async () => {});
  return { root, raws, mtimes, settings, store, sources, request, c, statePath: path.join(root, 'Derived/.third-brain/state.json') };
}

it.each([['md', 'en'], ['md', 'zh'], ['canvas', 'en'], ['canvas', 'zh']] as const)('actual %s files → strict reload → %s renderer → every original action', async (extension, locale) => {
  const f = await fixture(extension); let dispose: (() => void) | undefined, pending: Promise<unknown> | undefined;
  try {
    await f.c.initialize(); await f.c.refresh(); const index = (await f.store.load())!;
    expect(Object.values(index.fragments).filter(x => x.summary.includes(action))).toHaveLength(2);
    if (extension === 'canvas') expect(Object.values(index.fragments).every(x => x.privacy === 'private')).toBe(true);
    const state = await fs.readFile(f.statePath); await f.c.initialize(); await f.c.refresh(); expect(await f.store.load()).toEqual(index); expect(await fs.readFile(f.statePath)).toEqual(state);
    vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) });
    const container = new Node('main'), opens: Promise<void>[] = [];
    dispose = mountPanel(container as unknown as HTMLElement, {
      status: () => f.c.status(), subscribe: listener => f.c.subscribe(listener), refresh: () => f.c.refresh(), cancel: () => f.c.cancel(),
      find: (...args) => { pending = f.c.find(...args); return pending as ReturnType<ThirdBrainController['find']>; },
      open: e => { const p = f.c.verifyOpen(e); opens.push(p); return p; },
    }, locale);
    const input = container.all().find(n => n.className === 'tb-idea')!; input.value = 'amber calibration ring'; input.fire('input');
    container.all().find(n => n.tag === 'button' && n.textContent === messages(locale).find)!.fire('click');
    const results = await pending as Awaited<ReturnType<ThirdBrainController['find']>>; await Promise.resolve();
    const found = results.filter(r => r.fragment.summary.includes(action)); expect(found).toHaveLength(2);
    const cards = container.all().filter(n => n.className === 'tb-result' && n.text().includes(action)); expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.text()).toContain('- Condition:'); expect(card.text()).toContain('- Caveat:'); expect(card.text()).toContain(messages(locale).excerpt);
      for (const b of card.all().filter(n => n.className === 'tb-source')) { b.fire('click'); await opens.at(-1); }
    }
    expect(opens).toHaveLength(found.reduce((count, r) => count + r.fragment.evidence.length, 0));
    await Promise.all(opens);
    for (const [n, r] of Object.entries(f.raws)) { expect(hash(await fs.readFile(path.join(f.root, n)))).toBe(hash(r)); expect((await fs.stat(path.join(f.root, n), { bigint: true })).mtimeNs.toString()).toBe(f.mtimes.get(n)); }
    expect(f.request).not.toHaveBeenCalled();
  } finally { await pending?.catch(() => {}); dispose?.(); f.c.dispose(); vi.unstubAllGlobals(); vi.restoreAllMocks(); }
});

it('upgrades a frozen prior local index through actual OwnedStore once, then preserves exact state bytes', async () => {
  const f = await fixture('md');
  try {
    const inputs = await f.sources.list(), old: IndexState = structuredClone(legacy.old);
    await f.store.commit(old, () => f.sources.verify(inputs));
    const bare = Object.values(old.fragments).find(x => x.summary.includes(action))!;
    const oldPath = path.join(f.root, await f.store.fragmentPath(bare.id));
    await f.c.initialize(); await f.c.refresh(); const next = (await f.store.load())!;
    expect(next.signature).not.toBe(old.signature); expect(Object.values(next.fragments).filter(x => x.summary.includes(action))).toHaveLength(2);
    await expect(fs.stat(oldPath)).rejects.toMatchObject({ code: 'ENOENT' });
    const state = await fs.readFile(f.statePath); await f.c.initialize(); await f.c.refresh(); expect(await f.store.load()).toEqual(next); expect(await fs.readFile(f.statePath)).toEqual(state); expect(f.request).not.toHaveBeenCalled();
  } finally { f.c.dispose(); }
});

it.each(['md', 'canvas'])('%s restriction-only source changes/exclusions reject all old opens; failures/cancel/human edits preserve protected bytes', async extension => {
  const f = await fixture(extension);
  try {
    await f.c.initialize(); await f.c.refresh();
    const results = await f.c.find('amber calibration ring', 'medium');
    const matched = results.find(r => r.fragment.summary.includes(action) && r.fragment.summary.includes(legacy.condition));
    expect(matched).toBeDefined(); const original = matched!.fragment;
    expect(new Set(original.evidence.map(e => e.relativePath)).size).toBe(2);
    expect(await currentEvidence(original.evidence, f.sources)).toEqual(original.evidence);
    const evidence: Evidence[] = original.evidence, state = await fs.readFile(f.statePath), name = 'a.' + extension;
    await fs.writeFile(path.join(f.root, name), f.raws[name].replace('the synthetic motor must be disconnected.', 'only a changed synthetic simulator is permitted.'));
    for (const e of evidence) await expect(f.c.verifyOpen(e)).rejects.toThrow();
    expect((await f.c.find('amber calibration ring', 'medium')).some(r => r.fragment.id === original.id)).toBe(false);
    await fs.writeFile(path.join(f.root, name), f.raws[name]); f.settings.excludes.push(name);
    for (const e of evidence) await expect(f.c.verifyOpen(e)).rejects.toThrow();
    f.settings.excludes.pop(); for (const e of evidence) await f.c.verifyOpen(e);
    const commit = vi.spyOn(f.store, 'commit'), oversized = action + '\n- Condition: ' + '合'.repeat(16384);
    await fs.writeFile(path.join(f.root, name), extension === 'md' ? oversized : canvas(oversized));
    await expect(f.c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(f.statePath)).toEqual(state);
    await fs.writeFile(path.join(f.root, name), f.raws[name]); await f.c.refresh(); expect(await fs.readFile(f.statePath)).toEqual(state);
    const list = f.sources.list.bind(f.sources); let release!: () => void, entered!: () => void;
    const started = new Promise<void>(r => { entered = r; }), latch = new Promise<void>(r => { release = r; });
    vi.spyOn(f.sources, 'list').mockImplementationOnce(async options => { entered(); await latch; return list(options); });
    commit.mockClear(); const refresh = f.c.refresh(); await started; f.c.cancel(); release();
    await expect(refresh).rejects.toMatchObject({ name: 'AbortError' }); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(f.statePath)).toEqual(state);
    await f.c.refresh(); expect(await fs.readFile(f.statePath)).toEqual(state);
    const generated = path.join(f.root, await f.store.fragmentPath(original.id)), bytes = await fs.readFile(generated);
    await fs.writeFile(generated, Buffer.concat([bytes, Buffer.from('\nSynthetic human amendment.')]));
    await expect(f.c.refresh()).rejects.toThrow(); expect(await fs.readFile(generated, 'utf8')).toContain('Synthetic human amendment.'); expect(await fs.readFile(f.statePath)).toEqual(state);
    await fs.writeFile(generated, bytes); await f.c.initialize(); await f.c.refresh(); expect(await fs.readFile(f.statePath)).toEqual(state);
    for (const [n, r] of Object.entries(f.raws)) expect(await fs.readFile(path.join(f.root, n), 'utf8')).toBe(r);
    for (const n of Object.keys(f.raws).filter(n => n !== name)) expect((await fs.stat(path.join(f.root, n), { bigint: true })).mtimeNs.toString()).toBe(f.mtimes.get(n));
    expect(await fs.readFile(path.join(f.root, 'Derived/manual.txt'), 'utf8')).toBe('Synthetic human-owned file.'); expect(f.request).not.toHaveBeenCalled();
  } finally { f.c.dispose(); vi.restoreAllMocks(); }
});

it('attached Canvas conditions count within 256 quotations; 257 refuses commit, preserves bytes and recovers', async () => {
  const f = await fixture('canvas');
  const encode = (count: number) => canvas('# Synthetic calibration\n' + action + '\n' + Array.from({ length: count }, (_, i) => '- Condition: synthetic isolated tile ' + i + '.').join('\n'));
  const source = path.join(f.root, 'boundary.canvas');
  // Exclude the fixture notes rather than reclassifying or altering cached material.
  f.settings.excludes.push(...Object.keys(f.raws));
  try {
    await fs.writeFile(source, encode(254)); await f.c.initialize(); await f.c.refresh(); const index = (await f.store.load())!;
    expect(Object.values(index.fragments)).toHaveLength(1); const fragment = Object.values(index.fragments)[0]; expect(fragment.evidence).toHaveLength(256);
    expect(await currentEvidence(fragment.evidence, f.sources)).toEqual(fragment.evidence);
    const results = await f.c.find('amber calibration ring', 'medium'); expect(results).toHaveLength(1);
    for (const e of [results[0].fragment.evidence[0], results[0].fragment.evidence.at(-1)!]) await f.c.verifyOpen(e);
    const state = await fs.readFile(f.statePath); await f.c.refresh(); expect(await fs.readFile(f.statePath)).toEqual(state);
    const commit = vi.spyOn(f.store, 'commit'); await fs.writeFile(source, encode(255));
    await expect(f.c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(f.statePath)).toEqual(state);
    await fs.writeFile(source, encode(254)); await f.c.refresh(); expect(await fs.readFile(f.statePath)).toEqual(state); expect(f.request).not.toHaveBeenCalled();
  } finally { f.c.dispose(); vi.restoreAllMocks(); }
});
