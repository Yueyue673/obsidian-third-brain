// SPDX-License-Identifier: MIT
// Authored synthetic paragraphs. Offline protocol snapshots are not semantic/model-quality evidence.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { analyzeSource, buildIndex, prepareSource } from '../src/core';
import { textBlocks } from '../src/core/sources';
import { sourceDiagnostic } from '../src/core/source-diagnostics';
import type { IndexState, ModelRequest } from '../src/core/types';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
import { presentFailure } from '../src/presentation';
const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-paragraph-legacy.json', 'utf8'));
const local = { mode: 'local-excerpts' as const, cloudConsent: false, now: '2026-01-01T00:00:00.000Z' };
const snapshot = (raw: string, name = 'synthetic.md') => prepareSource(name, raw, hash(raw), hash(name).slice(0,24));
const chinese = '仅限断开真实设备的离线模拟器执行本段操作。' + '合成观察记录同一次有条件的模拟校准。'.repeat(110) + '末尾步骤：按下赭石校验按钮。';
const canvas = (raw: string) => JSON.stringify({ nodes: [
  { type: 'text', text: '---\nprivacy: private\n---\n' + raw },
  { type: 'text', text: '独立白色节点不为前一节点提供条件。' },
], edges: [] });

it.each([
  ['English', legacy.raw, 'Only in the disconnected', 'Final step'],
  ['Chinese', chinese, '仅限断开真实设备', '赭石校验按钮'],
])('%s retains opening conditions and later information in a complete bounded local paragraph', async (_name, raw, opening, tail) => {
  expect(raw.length).toBeGreaterThan(1400);
  const source = snapshot(raw), result = await analyzeSource(source, local);
  const fragment = result.fragments.find(f => f.summary.includes(tail))!;
  expect(fragment).toBeDefined(); expect(fragment.summary).toBe(raw);
  expect(fragment.summary).toContain(opening); expect(fragment.evidence).toHaveLength(1);
  expect(fragment.mode).toBe('local'); expect(fragment.evidence[0].quote).toBe(raw);
  expect(source.text.slice(fragment.evidence[0].start, fragment.evidence[0].end)).toBe(raw);
});

it('does not collapse identical tails from opposing long-paragraph contexts; exact complete copies still merge', async () => {
  const tail = 'Final instruction: rotate the synthetic bronze control.';
  const paragraph = (lead: string) => lead + 'Synthetic observation. '.repeat(45) + 'z'.repeat(1399 - lead.length - 'Synthetic observation. '.repeat(45).length) + ' ' + tail;
  const allow = paragraph('Only in the offline simulator is this allowed. ');
  const forbid = paragraph('On connected live equipment this is forbidden. ');
  const index = await buildIndex([snapshot(allow, 'a.md'), snapshot(forbid, 'b.md'), snapshot(allow, 'copy.md')], { ...local, previous: null, signature: 'synthetic-context' });
  const results = Object.values(index.fragments).filter(f => f.summary.includes(tail));
  expect(results).toHaveLength(2);
  expect(results.map(f => f.summary).sort()).toEqual([allow, forbid].sort());
  expect(results.find(f => f.summary === allow)!.evidence).toHaveLength(2);
  expect(results.find(f => f.summary === forbid)!.evidence).toHaveLength(1);
});

it('keeps independent paragraphs/sections/nodes separate and never borrows hidden or code text', async () => {
  const first = chinese;
  const second = '独立蓝鲸书架按日期整理，不属于模拟校准。';
  const raw = '# 合成章节\n' + first + '\n\n' + second + '\n\n```\nHidden synthetic code must stay hidden.\n```\n<!-- Hidden synthetic comment. -->\n# 另一章节\n另一章节有独立雪松观点。';
  const result = await analyzeSource(snapshot(raw), local);
  expect(result.fragments.find(f => f.summary.includes('赭石校验'))!.summary).toBe('# 合成章节\n\n' + first);
  expect(result.fragments.some(f => f.summary === '# 合成章节\n\n' + second)).toBe(true);
  expect(result.fragments.some(f => f.summary === '# 另一章节\n\n另一章节有独立雪松观点。')).toBe(true);
  expect(JSON.stringify(result)).not.toContain('Hidden synthetic');
  const decoded = await analyzeSource(snapshot(canvas(first), 'synthetic.canvas'), local);
  const f = decoded.fragments.find(f => f.summary.includes('赭石校验'))!;
  expect(f.summary).toBe(first); expect(f.summary).not.toContain('白色'); expect(f.privacy).toBe('private');
  for (const evidence of f.evidence) {
    if (evidence.start < 0) expect(textBlocks(snapshot(canvas(first), 'synthetic.canvas')).some(b => b.text.includes(evidence.quote))).toBe(true);
    else expect(canvas(first).slice(evidence.start, evidence.end)).toBe(evidence.quote);
  }
});

it('accepts exactly 16,384 UTF-16 units intact, refuses the next unit without a partial result', async () => {
  const raw = '仅限离线合成演练。' + '校'.repeat(16384 - '仅限离线合成演练。'.length - 3) + '🧠终';
  expect(raw.length).toBe(16384);
  const valid = await analyzeSource(snapshot(raw), local);
  expect(valid.fragments).toHaveLength(1); expect(valid.fragments[0].summary).toBe(raw);
  let caught: unknown;
  try { await analyzeSource(snapshot(raw + '尾'), local); } catch (error) { caught = error; }
  expect(caught).toBeDefined();
  expect(sourceDiagnostic(caught)).toEqual({ relativePath: 'synthetic.md', stage: 'analysis', reason: 'local-context-size-limit' });
});

it('preserves the exact existing AI text, background and signature (offline protocol only)', async () => {
  for (const mode of ['local-model', 'cloud-model'] as const) {
    expect(generationSignature({ ...defaults, mode, outputFolder: 'Derived' })).toBe(legacy.signatures[mode]);
    const requests: ModelRequest[] = [];
    await analyzeSource(snapshot(legacy.raw), { mode, cloudConsent: true, model: { request: async input => { requests.push(input); return { version: 1, decision: 'insufficient-context', fragments: [] }; } } });
    expect(requests).toEqual(legacy.requests[mode]);
  }
});

class NodeStub {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false;
  children: NodeStub[] = []; handlers = new Map<string, (() => void)[]>();
  constructor(readonly tag: string) {}
  append(...nodes: NodeStub[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: NodeStub[]) { this.children = nodes; }
  setAttribute() {} remove() {} focus() {}
  get childElementCount() { return this.children.length; }
  addEventListener(event: string, handler: () => void) { this.handlers.set(event, [...this.handlers.get(event) ?? [], handler]); }
  fire(event: string) { for (const handler of this.handlers.get(event) ?? []) handler(); }
  all(): NodeStub[] { return [this, ...this.children.flatMap(n => n.all())]; }
  text(): string { return [this.textContent, ...this.children.map(n => n.text())].join('\n'); }
}

it.each(['md', 'canvas'])('real %s file → controller → strict store → bilingual panel → current original; failure, cancel and retry stay safe', async extension => {
  const scope = path.resolve('.local/local-paragraph-context'); await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'vault-'));
  const raw: string = extension === 'md' ? legacy.raw : chinese;
  const name = 'synthetic.' + extension, encoded = extension === 'md' ? raw : canvas(raw);
  const original = path.join(root, name); await fs.writeFile(original, encoded);
  const originalStat = await fs.stat(original, { bigint: true });
  await fs.mkdir(path.join(root, 'Derived')); const human = path.join(root, 'Derived/manual.txt');
  await fs.writeFile(human, 'Synthetic human-owned material.');
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] as string[] };
  const store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  if (extension === 'md') {
    const old: IndexState = structuredClone(legacy.old), inputs = await sources.list();
    expect(Object.values(old.fragments).some(f => f.summary.includes('Final step') && !f.summary.includes('Only in'))).toBe(true);
    await store.commit(old, () => sources.verify(inputs));
  }
  const model = vi.fn(async () => { throw new Error('Forbidden model request'); });
  const controller = new ThirdBrainController(sources, store, () => settings, () => ({ request: model }), async () => {});
  let dispose: (() => void) | undefined, pending: Promise<unknown> | undefined;
  try {
    await controller.initialize(); await controller.refresh();
    const next = (await store.load())!;
    if (extension === 'md') expect(next.signature).not.toBe(legacy.old.signature);
    const tail = extension === 'md' ? 'Final step' : '赭石校验';
    const f = Object.values(next.fragments).find(f => f.summary.includes(tail))!;
    expect(f.summary).toBe(raw);
    if (extension === 'md') for (const id of Object.keys(legacy.old.fragments)) expect(next.fragments[id]).toBeUndefined();
    const statePath = path.join(root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath);
    await controller.initialize(); await controller.refresh();
    expect(await fs.readFile(statePath)).toEqual(state); expect(await store.load()).toEqual(next);
    expect(hash(await fs.readFile(original))).toBe(hash(encoded));
    expect((await fs.stat(original, { bigint: true })).mtimeNs.toString()).toBe(originalStat.mtimeNs.toString());
    const query = extension === 'md' ? 'copper calibration lever' : '赭石校验按钮';
    let evidence = f.evidence[0]; let verifiedActions = 0;
    for (const locale of ['en', 'zh'] as const) {
      vi.stubGlobal('document', { createElement: (tag: string) => new NodeStub(tag) });
      const container = new NodeStub('main'), opens: Promise<void>[] = [];
      dispose = mountPanel(container as unknown as HTMLElement, {
        status: () => controller.status(), subscribe: fn => controller.subscribe(fn),
        refresh: () => controller.refresh(), cancel: () => controller.cancel(),
        find: (...args) => { const op = controller.find(...args); pending = op; return op; },
        open: item => { const op = controller.verifyOpen(item); opens.push(op); return op; },
      }, locale);
      const input = container.all().find(n => n.className === 'tb-idea')!; input.value = query; input.fire('input');
      container.all().find(n => n.tag === 'button' && n.textContent === messages(locale).find)!.fire('click');
      const results = await pending as Awaited<ReturnType<ThirdBrainController['find']>>; await Promise.resolve();
      const result = results.find(r => r.fragment.id === f.id)!; expect(result).toBeDefined(); evidence = result.fragment.evidence[0];
      const card = container.all().find(n => n.className === 'tb-result' && n.text().includes(tail))!;
      expect(card.text()).toContain(raw); expect(card.text()).toContain(messages(locale).excerpt);
      const buttons = card.all().filter(n => n.className === 'tb-source'); expect(buttons.length).toBeGreaterThan(0);
      buttons.forEach(n => n.fire('click')); await Promise.all(opens); verifiedActions += opens.length;
      dispose(); dispose = undefined; vi.unstubAllGlobals();
    }
    const commit = vi.spyOn(store, 'commit');
    await fs.writeFile(original, extension === 'md' ? raw + '校'.repeat(16384) : canvas(raw + '校'.repeat(16384)));
    await expect(controller.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled();
    expect(controller.status().commitOutcome).toBe('not-started');
    for (const locale of ['en', 'zh'] as const) {
      const notice = presentFailure(controller.status(), locale);
      expect(notice).toContain(name); expect(notice).toContain('16,384');
      expect(notice).toContain(locale === 'en' ? 'paragraph' : '段落');
      expect(notice).toContain(locale === 'en' ? 'conditions and examples' : '条件和例子');
    }
    expect(await fs.readFile(statePath)).toEqual(state); await expect(controller.verifyOpen(evidence)).rejects.toThrow();
    await fs.writeFile(original, encoded); await controller.refresh(); expect(await fs.readFile(statePath)).toEqual(state);
    // Controlled SourcePort completion latch, not a claim of hard OS I/O interruption.
    const actualList = sources.list.bind(sources); let release!: () => void, entered!: () => void;
    const enteredPromise = new Promise<void>(r => { entered = r; }), latch = new Promise<void>(r => { release = r; });
    vi.spyOn(sources, 'list').mockImplementationOnce(async options => { entered(); await latch; return actualList(options); });
    commit.mockClear(); const refresh = controller.refresh(); await enteredPromise; controller.cancel(); release();
    await expect(refresh).rejects.toMatchObject({ name: 'AbortError' });
    expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    await controller.refresh(); expect(await fs.readFile(statePath)).toEqual(state);
    settings.excludes.push(name); await expect(controller.verifyOpen(evidence)).rejects.toThrow(); settings.excludes.pop();
    const generated = path.join(root, await store.fragmentPath(f.id)), generatedBytes = await fs.readFile(generated);
    await fs.writeFile(generated, Buffer.concat([generatedBytes, Buffer.from('\nSynthetic human amendment.')]));
    await expect(controller.refresh()).rejects.toThrow(); expect(await fs.readFile(generated, 'utf8')).toContain('Synthetic human amendment.');
    expect(await fs.readFile(statePath)).toEqual(state); await fs.writeFile(generated, generatedBytes);
    await controller.initialize(); await controller.refresh(); expect(await fs.readFile(statePath)).toEqual(state);
    expect(await fs.readFile(original, 'utf8')).toBe(encoded); expect(await fs.readFile(human, 'utf8')).toBe('Synthetic human-owned material.');
    expect(model).not.toHaveBeenCalled();
    await fs.writeFile(path.join(scope, extension + '-receipt.json'), JSON.stringify({ extension, strictReload: true, byteIdempotent: true, oldCacheUpgraded: extension === 'md', verifiedActions, originalHash: hash(encoded), fullContextLength: raw.length, realModelRequests: 0, nativeHost: false }, null, 2));
  } finally {
    await pending?.catch(() => {}); dispose?.(); controller.dispose(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  }
});
