// SPDX-License-Identifier: MIT
// Synthetic lock records/port faults; real OwnedStore validation, no OS hang.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { emptyIndex } from '../src/core/types';
import { storeBusyError, storeDiagnostic } from '../src/core/store-diagnostics';
import { ThirdBrainController } from '../src/controller';
import { FileSources } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults } from '../src/settings';
import { messages } from '../src/i18n';
import { presentFailure } from '../src/presentation';

afterEach(() => vi.restoreAllMocks());
async function fixture() {
  const scope = path.resolve('.local/store-busy-retry/cases'); await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'lock-')), store = new OwnedStore(root, 'Derived');
  await store.commit(emptyIndex());
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] };
  const sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const controller = new ThirdBrainController(sources, store, () => settings, () => undefined, async () => {});
  const folder = path.join(root, 'Derived/.third-brain');
  const marker = JSON.parse(await fs.readFile(path.join(folder, 'marker.json'), 'utf8'));
  const lock = { schema: 1, owner: 'third-brain', storeId: marker.storeId, pid: process.pid, nonce: 'a'.repeat(32) };
  return { store, controller, folder, lock };
}

it.each(['en', 'zh'] as const)('%s validated live-writer refusal retains lock and gives plugin-loading recovery', async locale => {
  const h = await fixture(), lockPath = path.join(h.folder, 'write.lock'), bytes = JSON.stringify(h.lock);
  await fs.writeFile(lockPath, bytes); // Authored synthetic live-PID record, not another actual writer.
  const error = await h.controller.initialize().catch(error => error);
  expect(error).toBeInstanceOf(Error); expect(storeDiagnostic(error)).toBe('busy');
  expect(h.controller.status()).toMatchObject({ phase: 'error', storeDiagnostic: 'busy', errorCode: 'index-unavailable' });
  const t = messages(locale); expect(presentFailure(h.controller.status(), locale)).toBe(`${t.storeBusy} ${t.storeBusyLoading}`);
  expect(await fs.readFile(lockPath, 'utf8')).toBe(bytes);
  await expect(h.store.load()).rejects.toThrow('Another store writer is active');
  // The test removes only its own synthetic record; production must not remove it.
  await fs.unlink(lockPath); await h.controller.initialize(); expect(h.controller.status().phase).toBe('idle');
  expect(h.controller.status().storeDiagnostic).toBeUndefined(); h.controller.dispose();
});

it.each(['storeId', 'pid', 'nonce', 'extra'] as const)('invalid %s lock is not downgraded to a temporary busy diagnosis', async field => {
  const h = await fixture(), lockPath = path.join(h.folder, 'write.lock');
  const lock = { ...h.lock, [field]: field === 'pid' ? 0 : 'INVALID_SYNTHETIC_FIELD' }, bytes = JSON.stringify(lock);
  await fs.writeFile(lockPath, bytes);
  const error = await h.controller.initialize().catch(error => error);
  expect(error).toBeInstanceOf(Error); expect(storeDiagnostic(error)).toBeUndefined();
  expect(h.controller.status().storeDiagnostic).toBeUndefined();
  expect(presentFailure(h.controller.status(), 'en')).toBe(messages('en').unavailable);
  expect(await fs.readFile(lockPath, 'utf8')).toBe(bytes); h.controller.dispose();
});

it('only the exact owned exception selects busy; external names, fields, inheritance and getters do not', () => {
  const error = storeBusyError('operation'); expect(storeDiagnostic(error)).toBe('busy');
  const fake = Object.assign(new TypeError(error.message), { name: error.name, code: 'EBUSY', storeDiagnostic: 'busy' });
  for (const value of [fake, Object.create(error), { storeDiagnostic: 'busy' }, null, undefined, 'busy', new Error(error.message)]) expect(storeDiagnostic(value)).toBeUndefined();
  expect(storeDiagnostic(Object.defineProperty({}, 'storeDiagnostic', { get() { throw new Error('Must not read'); } }))).toBeUndefined();
});

it('an external lookalike error retains exact identity and generic safe guidance', async () => {
  const h = await fixture(), error = Object.assign(new TypeError('SYNTHETIC_DETAIL_NOT_FOR_UI'), { storeDiagnostic: 'busy', name: 'StoreBusyError', code: 'EBUSY' });
  vi.spyOn(h.store, 'recover').mockRejectedValueOnce(error);
  await expect(h.controller.initialize()).rejects.toBe(error);
  expect(h.controller.status().storeDiagnostic).toBeUndefined();
  expect(presentFailure(h.controller.status(), 'en')).toBe(messages('en').unavailable); h.controller.dispose();
});

it('a synthetic busy refusal after commit entry cannot claim a preserved or safe index', async () => {
  const h = await fixture(); await h.controller.initialize();
  const before = await fs.readFile(path.join(h.folder, 'state.json')), error = storeBusyError('writer');
  vi.spyOn(h.store, 'commit').mockRejectedValueOnce(error);
  await expect(h.controller.refresh()).rejects.toBe(error);
  expect(h.controller.status()).toMatchObject({ phase: 'error', storeDiagnostic: 'busy', commitOutcome: 'unknown' });
  for (const locale of ['en', 'zh'] as const) {
    const t = messages(locale), text = presentFailure(h.controller.status(), locale);
    expect(text).toBe(`${t.storeBusy} ${t.commitUnknown}`); expect(text).not.toContain(t.retainedIndex); expect(text).not.toContain(t.notCommitted);
  }
  expect(await fs.readFile(path.join(h.folder, 'state.json'))).toEqual(before); h.controller.dispose();
});
