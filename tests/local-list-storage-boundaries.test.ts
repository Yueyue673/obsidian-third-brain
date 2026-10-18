// SPDX-License-Identifier: MIT
// Synthetic parser/storage boundaries. No provider or native-host requests.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { analyzeSource, buildIndex, prepareSource } from '../src/core/index';
import { defaults, generationSignature } from '../src/settings';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { ThirdBrainController } from '../src/controller';

const options = { mode: 'local-excerpts' as const, cloudConsent: false };
const snapshot = (text: string, name = 'synthetic.md') => prepareSource(name, text, hash(text), 'synthetic-' + name);
const parent = '10. 仅允许蓝色模拟器：\n    - 模拟步骤保留。';

it('keeps a blank-separated paragraph below the parent content indentation independent', async () => {
  const independent = '独立普通段落不属于上述列表。';
  const result = await analyzeSource(snapshot(parent + '\n\n ' + independent), options);
  expect(result.fragments.map(fragment => fragment.summary)).toContain(independent);
  expect(result.fragments.find(fragment => fragment.summary.includes('仅允许'))!.summary).not.toContain(independent);
});

it.each([
  ['a fresh heading', '- 前一节的独立列表。\n\n# 全新章节\n\n  - 新章节独立列表。', '新章节独立列表。'],
  ['a shallower blank-separated root', parent + '\n\n  - 独立列表不是十号条目的子项。', '独立列表不是十号条目的子项。'],
  ['an independent paragraph', '- 仅允许蓝色模拟器：\n  - 模拟步骤保留。\n\n独立普通段落已经退出列表。\n\n  - 独立列表不属于模拟器。', '独立列表不属于模拟器。'],
  ['an independent paragraph after a barrier', '- 仅允许蓝色模拟器：\n<!-- hidden fixture -->\n独立普通段落已经结束前一列表。\n\n  - 独立白鲸条目。', '独立白鲸条目。'],
])('retires an earlier list boundary after %s', async (_name, text, independent) => {
  const result = await analyzeSource(snapshot(text), options);
  const found = result.fragments.find(fragment => fragment.summary.includes(independent));
  expect(found).toBeDefined();
  expect(found!.summary).not.toContain('仅允许');
  expect(found!.summary).not.toContain('前一节');
});

const canvas = (children: number) => JSON.stringify({
  nodes: [{ type: 'text', text: '- Only in the disconnected synthetic simulator:\n' +
    Array.from({ length: children }, (_, i) => '  - Unique amber observation ' + String(i).padStart(3, '0') + '.').join('\n') }],
  edges: [],
});

it('stores the exact Canvas evidence boundary and refuses overflow before commit, retaining the previous revision', async () => {
  const scope = path.resolve('.local/local-list-storage');
  await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'case-'));
  const valid = canvas(255), excessive = canvas(256);
  expect(valid.length).toBeLessThan(16384);
  expect(excessive.length).toBeLessThan(16384);
  const original = path.join(root, 'notes.canvas');
  await fs.writeFile(original, valid);
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] as string[] };
  const store = new OwnedStore(root, 'Derived');
  const sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const controller = new ThirdBrainController(sources, store, () => settings, () => undefined, async () => {});
  try {
    await controller.initialize();
    await controller.refresh();
    const saved = (await store.load())!;
    const fragment = Object.values(saved.fragments)[0];
    expect(fragment.evidence).toHaveLength(256);
    for (const evidence of [fragment.evidence[0], fragment.evidence.at(-1)!]) await controller.verifyOpen(evidence);
    const statePath = path.join(root, 'Derived/.third-brain/state.json');
    const bytes = await fs.readFile(statePath);
    await controller.refresh();
    expect(await fs.readFile(statePath)).toEqual(bytes);
    const commit = vi.spyOn(store, 'commit');
    await fs.writeFile(original, excessive); // Deliberate mutation of this synthetic fixture only.
    let failure: unknown;
    try { await controller.refresh(); } catch (error) { failure = error; }
    expect.soft(failure).toBeInstanceOf(Error);
    expect.soft((failure as Error)?.message).toMatch(/evidence limit|quotation parts/);
    expect.soft(commit).not.toHaveBeenCalled();
    expect(await fs.readFile(statePath)).toEqual(bytes);
    await expect(controller.verifyOpen(fragment.evidence[0])).rejects.toThrow();
    await fs.writeFile(original, valid); // Restore only this test's exact authored input.
    await controller.refresh();
    expect(await fs.readFile(statePath)).toEqual(bytes);
    await controller.verifyOpen(fragment.evidence[0]);
    commit.mockRestore();
  } finally {
    controller.dispose();
    vi.restoreAllMocks();
  }
});

it('enforces the existing store evidence limit after cross-source context deduplication', async () => {
  const raw = canvas(128);
  await expect(buildIndex([snapshot(raw, 'a.canvas'), snapshot(raw, 'b.canvas')], {
    ...options, previous: null, signature: generationSignature(defaults),
  })).rejects.toThrow(/evidence limit/);
});
