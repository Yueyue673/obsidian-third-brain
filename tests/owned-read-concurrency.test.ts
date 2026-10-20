// SPDX-License-Identifier: MIT
// Fresh authored Markdown/Canvas through FileSources, Controller and OwnedStore.
// Read latches/errors below are synthetic probes, not real OS failures or a benchmark.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { afterEach, expect, it, vi } from 'vitest';
import { ThirdBrainController } from '../src/controller';
import { FileSources } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults } from '../src/settings';
import type { IndexState } from '../src/core/types';

afterEach(() => vi.restoreAllMocks());
function latch() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));
async function fixture() {
  const base = path.resolve('.local/owned-read-concurrency'); await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'synthetic-'));
  const originals = new Map<string, Buffer>();
  for (let i = 0; i < 12; i++) {
    const text = `---\nprivacy: ${['normal', 'local', 'private'][i % 3]}\n---\n# 合成纸轴${i}\n\n仅在动力断开时，第${i}号合成纸轴的铜色演练扣可以旋转半圈；夹持松动即停止，不能用于金属轴。`;
    const name = `note-${i}.${i % 2 ? 'canvas' : 'md'}`;
    const bytes = Buffer.from(i % 2 ? JSON.stringify({ nodes: [{ id: `synthetic-${i}`, type: 'text', text }], edges: [] }) : text);
    originals.set(name, bytes); await fs.writeFile(path.join(root, name), bytes);
  }
  await fs.mkdir(path.join(root, 'Derived'));
  originals.set('Derived/manual.txt', Buffer.from('Synthetic user-authored material. Not owned.'));
  await fs.writeFile(path.join(root, 'Derived/manual.txt'), originals.get('Derived/manual.txt')!);
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] as string[] };
  const store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const factory = vi.fn(() => undefined), c = new ThirdBrainController(sources, store, () => settings, factory, async () => {});
  await c.initialize(); await c.refresh(); await c.initialize();
  const index = (await store.load())!; expect(Object.keys(index.fragments)).toHaveLength(12);
  const files = (await fs.readdir(root, { recursive: true, withFileTypes: true })).filter(f => f.isFile()).map(f => path.join(f.parentPath, f.name));
  const before = await Promise.all(files.map(async name => ({ name, bytes: await fs.readFile(name), mtime: (await fs.stat(name, { bigint: true })).mtimeNs.toString() })));
  const unchanged = async () => {
    for (const f of before) {
      expect(await fs.readFile(f.name)).toEqual(f.bytes);
      expect((await fs.stat(f.name, { bigint: true })).mtimeNs.toString()).toBe(f.mtime);
    }
    expect(await fs.readdir(path.join(root, 'Derived/.third-brain/transactions'))).toEqual([]);
    expect(factory.mock.results.every(r => r.value === undefined)).toBe(true);
  };
  return { root, store, sources, c, index, before, unchanged, originals };
}
interface Reads { read(rel: string, max?: number, allowLinkedWork?: boolean): Promise<Buffer | null>; }
function probe(store: OwnedStore, gate: ReturnType<typeof latch>, failFirst?: unknown, failLate?: unknown) {
  const internal = store as unknown as Reads, read = internal.read.bind(store);
  let active = 0, peak = 0, settled = 0;
  const calls: string[] = [], firstFailed = latch();
  const spy = vi.spyOn(internal, 'read').mockImplementation(async (...args) => {
    if (!/^Derived\/fragment-[a-f0-9]{64}\.md$/.test(args[0])) return read(...args);
    const ordinal = calls.length; calls.push(args[0]); active++; peak = Math.max(peak, active);
    try {
      if (ordinal === 0 && failFirst !== undefined) { firstFailed.release(); throw failFirst; }
      await gate.promise;
      if (ordinal === 2 && failLate !== undefined) throw failLate;
      return await read(...args); // Includes real path/link/inode/byte/hash input checks and handle close.
    } finally { active--; settled++; }
  });
  return { calls, firstFailed: firstFailed.promise, restore: () => spy.mockRestore(), counts: () => ({ active, peak, settled }) };
}

it('overlaps at most four complete owned reads, still verifies every file on every strict reload', async () => {
  const h = await fixture(), gate = latch(), p = probe(h.store, gate);
  const running = h.store.load();
  try {
    await vi.waitFor(() => expect(p.calls).toHaveLength(4), { timeout: 1500 });
    expect(p.counts().active).toBe(4);
    await expect(new OwnedStore(h.root, 'Derived').commit(h.index)).rejects.toThrow('in progress');
    gate.release(); expect(await running).toEqual(h.index);
    expect(p.counts()).toEqual({ active: 0, peak: 4, settled: 24 });
    expect(new Set(p.calls).size).toBe(12);
    for (const name of new Set(p.calls)) expect(p.calls.filter(n => n === name)).toHaveLength(2);
    p.calls.length = 0; expect(await h.store.load()).toEqual(h.index);
    expect(p.calls).toHaveLength(24); // No cross-operation ownership cache.
    await h.unchanged();
  } finally { gate.release(); await running.catch(() => {}); p.restore(); h.c.dispose(); }
});

it('drains in-flight reads before rejecting and unlocking, stops scheduling after failure, and preserves the first error identity', async () => {
  const h = await fixture(), gate = latch();
  const first = Object.assign(new TypeError('SYNTHETIC_FIRST_READ_FAILURE'), { code: 'EIO' });
  const late = new Error('SYNTHETIC_LATE_READ_FAILURE');
  const p = probe(h.store, gate, first, late); let outcome: unknown, complete = false;
  const running = h.store.load().then(v => { outcome = v; complete = true; }, e => { outcome = e; complete = true; });
  try {
    await p.firstFailed; await nextTurn();
    // All four workers start before the first rejected promise is observed.
    expect(p.calls).toHaveLength(4); expect(p.counts().active).toBe(3); expect(complete).toBe(false);
    const lockPath = path.join(h.root, 'Derived/.third-brain/write.lock'), lockBytes = await fs.readFile(lockPath);
    await expect(new OwnedStore(h.root, 'Derived').load()).rejects.toThrow('in progress');
    await expect(new OwnedStore(h.root, 'Other').commit(h.index)).rejects.toThrow('in progress');
    expect(await fs.readFile(lockPath)).toEqual(lockBytes);
    gate.release(); await running;
    expect(complete).toBe(true); expect(outcome).toBe(first); expect(p.counts().active).toBe(0);
    expect(p.calls).toHaveLength(4); expect(p.counts().settled).toBe(4);
    p.restore(); expect(await h.store.load()).toEqual(h.index); await h.unchanged();
  } finally { gate.release(); await running; p.restore(); h.c.dispose(); }
});

it('keeps the lock until real file handles close after an injected read error', async () => {
  const h = await fixture(), entered = latch(), gate = latch(), open = fs.open;
  const error = Object.assign(new TypeError('SYNTHETIC_HANDLE_READ_ERROR'), { code: 'EIO' });
  let opened = 0, closed = 0, finished = false, outcome: unknown;
  const spy = vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
    const handle = await open(...args);
    if (!String(args[0]).startsWith(path.join(h.root, 'Derived', 'fragment-'))) return handle;
    const ordinal = opened++;
    if (opened === 4) entered.release();
    const read = handle.read.bind(handle) as (...a: unknown[]) => Promise<unknown>;
    vi.spyOn(handle, 'read').mockImplementation((async (...a: unknown[]) => {
      if (ordinal === 0) { await entered.promise; throw error; }
      await gate.promise; return read(...a);
    }) as typeof handle.read);
    const close = handle.close.bind(handle);
    vi.spyOn(handle, 'close').mockImplementation(async () => { await close(); closed++; });
    return handle;
  });
  syncBuiltinESMExports();
  const running = h.store.load().then(v => { outcome = v; finished = true; }, e => { outcome = e; finished = true; });
  try {
    await vi.waitFor(() => expect(opened).toBe(4), { timeout: 1500 });
    await vi.waitFor(() => expect(closed).toBe(1));
    expect(finished).toBe(false); expect(opened - closed).toBe(3);
    await expect(new OwnedStore(h.root, 'Derived').commit(h.index)).rejects.toThrow('in progress');
    gate.release(); await running;
    expect(outcome).toBe(error); expect(opened).toBe(4); expect(closed).toBe(4);
    spy.mockRestore(); syncBuiltinESMExports();
    expect(await h.store.load()).toEqual(h.index); await h.unchanged();
  } finally {
    // Also release the first handle if this test is run against the serial baseline.
    entered.release(); gate.release(); await running;
    spy.mockRestore(); syncBuiltinESMExports(); h.c.dispose();
  }
});

it('cancels the query without releasing a pending owned-read operation or publishing a late result', async () => {
  const h = await fixture(), gate = latch(), p = probe(h.store, gate); let error: unknown;
  const commit = vi.spyOn(h.store, 'commit');
  const running = h.c.find('铜色演练扣 旋转半圈', 'medium').catch(e => { error = e; });
  try {
    await vi.waitFor(() => expect(p.calls).toHaveLength(4), { timeout: 1500 });
    h.c.cancel(); await running; expect(error).toMatchObject({ name: 'AbortError' });
    expect(h.c.status().phase).toBe('cancelled'); const cancelled = h.c.status();
    await expect(new OwnedStore(h.root, 'Derived').load()).rejects.toThrow('in progress');
    gate.release();
    await vi.waitFor(() => expect(p.counts().active).toBe(0));
    // Drain the exact underlying managed operation before an explicit retry.
    p.restore(); await vi.waitFor(async () => { expect(await h.store.load()).toEqual(h.index); });
    expect(h.c.status()).toEqual(cancelled); expect(commit).not.toHaveBeenCalled();
    expect((await h.c.find('铜色演练扣 旋转半圈', 'medium')).length).toBeGreaterThan(0);
    await h.c.refresh(); await h.c.initialize(); await h.c.refresh(); await h.unchanged();
  } finally { gate.release(); await running; p.restore(); h.c.dispose(); }
});

it.each(['changed', 'missing', 'hardlink'] as const)('does not overlook an unrelated last owned file that is %s', async variant => {
  const h = await fixture();
  const state = JSON.parse(await fs.readFile(path.join(h.root, 'Derived/.third-brain/state.json'), 'utf8')) as { owned: Record<string, string> };
  const names = Object.keys(state.owned), target = path.join(h.root, 'Derived', names.at(-1)!);
  const saved = await fs.readFile(target), stateBytes = await fs.readFile(path.join(h.root, 'Derived/.third-brain/state.json'));
  try {
    if (variant === 'changed') await fs.appendFile(target, '\nSynthetic human amendment.');
    else if (variant === 'missing') await fs.unlink(target);
    else { await fs.unlink(target); await fs.link(path.join(h.root, 'note-0.md'), target); }
    const edited = variant === 'missing' ? undefined : await fs.readFile(target);
    await expect(h.store.load()).rejects.toThrow();
    await expect(h.c.find('铜色演练扣', 'medium')).rejects.toThrow();
    await expect(h.store.commit(h.index)).rejects.toThrow();
    if (edited) expect(await fs.readFile(target)).toEqual(edited);
    expect(await fs.readFile(path.join(h.root, 'Derived/.third-brain/state.json'))).toEqual(stateBytes);
    for (const [name, bytes] of h.originals) expect(await fs.readFile(path.join(h.root, name))).toEqual(bytes);
    // Restore only our just-authored synthetic fixture, not any user material.
    if (variant !== 'missing') await fs.unlink(target);
    await fs.writeFile(target, saved); expect(await h.store.load()).toEqual(h.index);
    await h.c.refresh(); await h.c.initialize(); await h.c.refresh();
    expect(await fs.readFile(target)).toEqual(saved); expect(await h.store.load()).toEqual(h.index);
    expect(await fs.readdir(path.join(h.root, 'Derived/.third-brain/transactions'))).toEqual([]);
  } finally { h.c.dispose(); }
});
