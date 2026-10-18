// SPDX-License-Identifier: MIT
// Authored synthetic files and DOM shell; no model, HTTP or native Obsidian.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
import { presentFailure } from '../src/presentation';
import { sourceDiagnostic } from '../src/core/source-diagnostics';
import { CoreError } from '../src/core/util';

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
  all(): NodeStub[] { return [this, ...this.children.flatMap(node => node.all())]; }
}
const validBody = '- Only in the disconnected synthetic simulator:\n  - Amber calibration uses a disposable dial.\n  - Connected equipment is a counterexample.';
const canvas = (text: string) => JSON.stringify({ nodes: [{ type: 'text', text }], edges: [] });
const excessiveBody = '- Only in the disconnected synthetic simulator:\n  - ' + 'Amber observation stays conditional. '.repeat(500);
const excessiveEvidence = '- Only in the disconnected synthetic simulator:\n' + Array.from({ length: 256 }, (_, i) => `  - Amber observation ${i}.`).join('\n');

for (const reason of ['local-context-size-limit', 'local-context-evidence-limit'] as const)
for (const incremental of [false, true])
for (const locale of ['en', 'zh'] as const)
it(`explains ${reason}, ${incremental ? 'incremental' : 'initial'}, ${locale}; preserves and recovers real files`, async () => {
  const scope = path.resolve('.local/local-context-diagnostics');
  await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'case-'));
  const name = reason === 'local-context-size-limit' ? 'synthetic-list.md' : 'synthetic-list.canvas';
  const encode = name.endsWith('.canvas') ? canvas : (value: string) => value;
  const valid = encode(validBody), invalid = encode(reason === 'local-context-size-limit' ? excessiveBody : excessiveEvidence);
  const original = path.join(root, name), statePath = path.join(root, 'Derived/.third-brain/state.json');
  await fs.writeFile(original, valid);
  await fs.mkdir(path.join(root, 'Derived'));
  const human = path.join(root, 'Derived/manual.txt');
  await fs.writeFile(human, 'Synthetic human-owned file.');
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] as string[] };
  const store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const model = vi.fn(() => { throw new Error('Forbidden model request'); });
  const controller = new ThirdBrainController(sources, store, () => settings, () => ({ request: model }), async () => {});
  await controller.initialize();
  if (incremental) await controller.refresh();
  const old = await store.load(), oldBytes = incremental ? await fs.readFile(statePath) : null;
  const oldEvidence = Object.values(old?.fragments ?? {}).flatMap(fragment => fragment.evidence)[0];
  const commit = vi.spyOn(store, 'commit');
  await fs.writeFile(original, invalid); // Deliberate change to this test's own synthetic source.
  const originalBefore = await fs.stat(original, { bigint: true });
  vi.stubGlobal('document', { createElement: (tag: string) => new NodeStub(tag) });
  const container = new NodeStub('main');
  let operation = Promise.resolve(); let thrown: unknown;
  const dispose = mountPanel(container as unknown as HTMLElement, {
    status: () => controller.status(), subscribe: listener => controller.subscribe(listener),
    refresh: () => operation = controller.refresh(), cancel: () => controller.cancel(),
    find: (...args) => controller.find(...args), open: evidence => controller.verifyOpen(evidence),
  }, locale);
  try {
    container.all().find(node => node.tag === 'button' && node.textContent === messages(locale).index)!.fire('click');
    try { await operation; } catch (error) { thrown = error; }
    await Promise.resolve();
    expect(thrown).toBeInstanceOf(CoreError);
    expect.soft(sourceDiagnostic(thrown)).toEqual({ relativePath: name, stage: 'analysis', reason });
    const status = controller.status();
    expect(status.phase).toBe('error');
    expect.soft(status.sourceDiagnostic).toEqual({ relativePath: name, stage: 'analysis', reason });
    expect(status.commitOutcome).toBe('not-started');
    expect(status.hasCompleteIndex).toBe(incremental);
    expect(commit).not.toHaveBeenCalled();
    const notice = container.all().find(node => node.className === 'tb-notice')!;
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toBe(presentFailure(status, locale));
    expect(notice.textContent).toContain(name);
    expect.soft(notice.textContent).toContain(reason === 'local-context-size-limit' ? '16,384' : '256');
    expect.soft(notice.textContent).toContain(locale === 'en' ? 'conditions and examples' : '条件和例子');
    expect.soft(notice.textContent).toContain(locale === 'en' ? 'copy' : '副本');
    expect(notice.textContent).toContain(messages(locale).notCommitted);
    expect(notice.textContent).toContain(incremental ? messages(locale).retainedIndex : messages(locale).noCompleteIndex);
    expect(notice.textContent).not.toContain('Amber observation');
    expect(await store.load()).toEqual(old);
    if (oldBytes) expect(await fs.readFile(statePath)).toEqual(oldBytes);
    else await expect(fs.stat(statePath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.readFile(original, 'utf8')).toBe(invalid);
    expect((await fs.stat(original, { bigint: true })).mtimeNs.toString()).toBe(originalBefore.mtimeNs.toString());
    expect(await fs.readFile(human, 'utf8')).toBe('Synthetic human-owned file.');
    if (oldEvidence) await expect(controller.verifyOpen(oldEvidence)).rejects.toThrow();
    // Repair only the authored fixture; no automatic retry, truncation or source editing by the plugin.
    await fs.writeFile(original, valid);
    await controller.refresh();
    expect(controller.status().phase).toBe('idle');
    expect(notice.hidden).toBe(true);
    const loaded = (await store.load())!, bytes = await fs.readFile(statePath);
    await controller.initialize(); await controller.refresh();
    expect(await store.load()).toEqual(loaded);
    expect(await fs.readFile(statePath)).toEqual(bytes);
    const result = (await controller.find('calibration', 'medium'))[0];
    expect(result.fragment.summary).toBe(validBody.split('\n').slice(0,2).join('\n'));
    expect(result.fragment.localContext).toBe(validBody.split('\n')[2]);
    for (const line of validBody.split('\n')) expect(result.fragment.summary + '\n' + result.fragment.localContext).toContain(line);
    for (const evidence of result.fragment.evidence) await controller.verifyOpen(evidence);
    expect(await fs.readFile(original, 'utf8')).toBe(valid);
    expect(await fs.readFile(human, 'utf8')).toBe('Synthetic human-owned file.');
    expect(model).not.toHaveBeenCalled();
    await fs.writeFile(path.join(root, '..', `${path.basename(root)}-receipt.json`), JSON.stringify({
      reason, incremental, locale, status, notice: notice.textContent, originalHash: hash(valid),
      noCommitOnRefusal: true, strictReload: true, byteIdempotent: true,
      verifiedOriginalActions: result.fragment.evidence.length, realModelRequests: 0, nativeHost: false,
    }, null, 2));
  } finally {
    await operation.catch(() => {}); await Promise.resolve(); dispose(); controller.dispose();
    vi.unstubAllGlobals(); vi.restoreAllMocks();
  }
});

it('does not turn an external error message or diagnostic-shaped property into trusted limit guidance', async () => {
  const store = { recover: async () => {}, load: async () => null, commit: vi.fn() };
  const error = Object.assign(new CoreError('Local list context exceeds 16384 characters. ARBITRARY_BODY'), {
    sourceDiagnostic: { relativePath: 'forged.md', stage: 'analysis', reason: 'local-context-size-limit' },
  });
  const sources = { list: async () => { throw error; }, read: async () => null, excluded: async () => new Set<string>(), verify: async () => {} };
  const controller = new ThirdBrainController(sources, store, () => defaults, () => undefined, async () => {});
  try {
    await controller.initialize(); await expect(controller.refresh()).rejects.toBe(error);
    expect(sourceDiagnostic(error)).toBeUndefined();
    expect(controller.status().sourceDiagnostic).toBeUndefined();
    expect(controller.status().commitOutcome).toBeUndefined();
    for (const locale of ['en', 'zh'] as const) {
      const text = presentFailure(controller.status(), locale);
      expect(text).not.toMatch(/16,384|256|forged.md|ARBITRARY_BODY/);
    }
    expect(store.commit).not.toHaveBeenCalled();
  } finally { controller.dispose(); }
});
