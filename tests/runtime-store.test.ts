// SPDX-License-Identifier: MIT
// All notes, IDs, hashes and revisions here are authored synthetic fixtures.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildIndex } from '../src/core/index';
import { FileSources } from '../src/sources';
import { defaults } from '../src/settings';
import { OwnedStore, type StoreTestHooks } from '../src/runtime/store';
import { emptyFacets, emptyIndex, type Fragment, type IndexState } from '../src/core/types';

const sha = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex');
const folder = 'Third Brain/Fragments';
const sourcePath = 'Synthetic notes/Exact [source] #1.md';
const original = '# Synthetic experiment\n\nShorter feedback loops reduce wasted work.\n';
const quote = 'Shorter feedback loops reduce wasted work.';
const date = '2026-01-01T00:00:00.000Z';
let root: string;
const absolute = (rel: string): string => path.join(root, ...rel.split('/'));
const meta = (name: string): string => absolute(`${folder}/.third-brain/${name}`);
const outputName = (id = 'synthetic-fragment'): string => `fragment-${sha(id)}.md`;
async function fixture(id = 'synthetic-fragment'): Promise<IndexState> {
  await fs.mkdir(path.dirname(absolute(sourcePath)), { recursive: true });
  await fs.writeFile(absolute(sourcePath), original);
  const start = original.indexOf(quote);
  const f: Fragment = { id, privacy: 'normal', title: 'Synthetic feedback', summary: quote, kind: 'excerpt', facets: emptyFacets(),
    evidence: [{ sourceId: 'synthetic-source', relativePath: sourcePath, sourceHash: sha(original), quote, start, end: start + quote.length }],
    mode: 'local', updatedAt: date, conditions: [], caveats: [] };
  return { version: 1, signature: 'synthetic-generation-1', updatedAt: date,
    sources: { [sourcePath]: { hash: sha(original), status: 'indexed', fragmentIds: [id] } }, fragments: { [id]: f } };
}
function changed(old: IndexState): IndexState {
  const next = structuredClone(old);
  next.signature = 'synthetic-generation-2';
  next.fragments[Object.keys(next.fragments)[0]].title = 'Synthetic revised title';
  return next;
}
async function absent(file: string): Promise<boolean> {
  try { await fs.stat(file); return false; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return true; throw e; }
}
async function outputs(): Promise<string[]> { return (await fs.readdir(absolute(folder))).filter(f => f.endsWith('.md')).sort(); }
async function pending(old: IndexState): Promise<void> {
  const store = new OwnedStore(root, folder, { io: event => {
    if (event.phase === 'before-apply' && event.target?.endsWith('/state.json')) throw new Error('Synthetic write failure');
    if (event.phase === 'before-rollback') throw new Error('Synthetic rollback failure');
  } });
  await expect(store.commit(changed(old))).rejects.toThrow('rollback failed');
  expect(await absent(meta('journal.json'))).toBe(false);
}

beforeEach(async () => {
  // Never use os.tmpdir(): only a newly-created repository-local disposable vault.
  const base = path.resolve('.local/runtime-store');
  await fs.mkdir(base, { recursive: true });
  root = await fs.mkdtemp(path.join(base, 'synthetic-'));
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('OwnedStore actual filesystem ownership and provenance', () => {
  it('commits the actual pure-core output, including decoded Canvas provenance, and reloads it for incremental indexing', async () => {
    await fixture();
    const canvasPath = 'Synthetic notes/Decoded.canvas';
    const canvas = JSON.stringify({ nodes: [{ id: 'synthetic-node', type: 'text', text: 'A synthetic line.\nShorter feedback loops reduce wasted work.' }], edges: [] });
    await fs.writeFile(absolute(canvasPath), canvas);
    const snapshots = [
      { id: 'synthetic-markdown', path: sourcePath, text: original, hash: sha(original), privacy: 'normal' as const, format: 'markdown' as const },
      { id: 'synthetic-canvas', path: canvasPath, text: canvas, hash: sha(canvas), privacy: 'local' as const, format: 'canvas' as const },
    ];
    const run = { mode: 'local-excerpts' as const, cloudConsent: false, signature: 'synthetic-core-integration', previous: null, now: date };
    const next = await buildIndex(snapshots, run);
    expect(Object.keys(next.fragments).length).toBeGreaterThan(0);
    const store = new OwnedStore(root, folder);
    await store.commit(next);
    expect(await store.load()).toEqual(next);
    const repeat = await buildIndex(snapshots, { ...run, previous: await store.load() });
    await store.commit(repeat);
    expect(await store.load()).toEqual(next);
    expect(sha(await fs.readFile(absolute(sourcePath)))).toBe(sha(original));
    expect(sha(await fs.readFile(absolute(canvasPath)))).toBe(sha(canvas));
  });
  it('loads empty without adopting a folder, preserves originals/manual notes, and emits precise encoded links', async () => {
    const next = await fixture();
    await fs.mkdir(absolute(folder), { recursive: true });
    const manual = absolute(`${folder}/Manual.md`);
    await fs.writeFile(manual, 'Synthetic manual note, never plugin-owned.');
    const store = new OwnedStore(root, folder);
    expect(await store.load()).toBeNull();
    expect(await store.managedSourcePaths()).toEqual(new Set());
    await store.commit(next, async () => { expect(sha(await fs.readFile(absolute(sourcePath)))).toBe(sha(original)); });
    expect(await new OwnedStore(root, folder).load()).toEqual(next);
    expect(await store.managedSourcePaths()).toEqual(new Set([`${folder}/${outputName()}`]));
    expect(await fs.readFile(manual, 'utf8')).toBe('Synthetic manual note, never plugin-owned.');
    expect(await fs.readFile(absolute(sourcePath), 'utf8')).toBe(original);
    const md = await fs.readFile(absolute(`${folder}/${outputName()}`), 'utf8');
    expect(md).toContain('privacy: normal');
    expect(md).toContain('../../Synthetic%20notes/Exact%20%5Bsource%5D%20%231.md');
    expect(md).toContain(sha(original));
    expect(md).toContain(`character range: ${original.indexOf(quote)}–${original.indexOf(quote) + quote.length}`);
    expect(md).toContain('Local excerpt; not an AI summary');
  });
  it('uses stable safe ID filenames, never titles or model-proposed paths', async () => {
    const id = 'synthetic ../CON:*?"<|>\\fragment';
    const next = await fixture(id);
    next.fragments[id].title = 'Synthetic [[injection]] <script>noop</script>';
    const store = new OwnedStore(root, folder);
    await store.commit(next);
    expect(await outputs()).toEqual([outputName(id)]);
    expect(await fs.readFile(absolute(`${folder}/${outputName(id)}`), 'utf8')).toContain('\\[\\[injection\\]\\]');
    const before = await fs.stat(absolute(`${folder}/${outputName(id)}`));
    let verified = 0;
    await store.commit(next, async () => { verified++; });
    expect((await fs.stat(absolute(`${folder}/${outputName(id)}`))).mtimeMs).toBe(before.mtimeMs);
    expect(verified).toBe(1);
  });
  it('refuses an unowned same-name file even inside the output folder', async () => {
    const next = await fixture();
    await fs.mkdir(absolute(folder), { recursive: true });
    const target = absolute(`${folder}/${outputName()}`);
    await fs.writeFile(target, 'Synthetic manual collision');
    await expect(new OwnedStore(root, folder).commit(next)).rejects.toThrow('Unowned');
    expect(await fs.readFile(target, 'utf8')).toBe('Synthetic manual collision');
    expect(await fs.readFile(absolute(sourcePath), 'utf8')).toBe(original);
    expect(await absent(meta('state.json'))).toBe(true);
  });
  it('does not regain ownership from a generated-looking header when the manifest is absent', async () => {
    const next = await fixture();
    const store = new OwnedStore(root, folder);
    await store.commit(next);
    const before = await fs.readFile(absolute(`${folder}/${outputName()}`));
    await fs.unlink(meta('state.json'));
    await expect(store.commit(next)).rejects.toThrow('Unowned');
    expect(await fs.readFile(absolute(`${folder}/${outputName()}`))).toEqual(before);
  });
  it('protects human-edited owned files on load, commit, recovery and managed listing', async () => {
    const next = await fixture();
    const store = new OwnedStore(root, folder);
    await store.commit(next);
    const target = absolute(`${folder}/${outputName()}`);
    await fs.appendFile(target, '\nSynthetic human amendment.\n');
    const edited = await fs.readFile(target);
    await expect(store.load()).rejects.toThrow('human-edited');
    await expect(store.managedSourcePaths()).rejects.toThrow('human-edited');
    await expect(store.recover()).rejects.toThrow('human-edited');
    await expect(store.commit(changed(next))).rejects.toThrow('human-edited');
    expect(await fs.readFile(target)).toEqual(edited);
  });
  it('permanently archives old owned markdown and removes retired sources from active files/state', async () => {
    const old = await fixture();
    const store = new OwnedStore(root, folder);
    await store.commit(old);
    const first = await fs.readFile(absolute(`${folder}/${outputName()}`));
    await store.commit(changed(old));
    const second = await fs.readFile(absolute(`${folder}/${outputName()}`));
    const history = meta('history');
    const revisions = await fs.readdir(history);
    expect(revisions.length).toBe(1);
    expect(await fs.readFile(path.join(history, revisions[0], `${outputName()}.bak`))).toEqual(first);
    const empty = { ...emptyIndex(), signature: 'synthetic-removal', updatedAt: date };
    await store.commit(empty);
    expect(await outputs()).toEqual([]);
    expect((await store.load())?.fragments).toEqual({});
    expect(await store.managedSourcePaths()).toEqual(new Set());
    const backups = await Promise.all((await fs.readdir(history)).map(async d => fs.readFile(path.join(history, d, `${outputName()}.bak`))));
    expect(backups.some(b => b.equals(second))).toBe(true);
    expect(await fs.readFile(absolute(sourcePath), 'utf8')).toBe(original);
  });
  it('rejects original/generated and original/reserved-state aliases before initialization', async () => {
    const next = await fixture();
    const alias = `${folder}/${outputName()}`.toLowerCase();
    next.sources[alias] = { hash: sha('Synthetic original collision'), status: 'empty', fragmentIds: [] };
    await expect(new OwnedStore(root, folder).commit(next)).rejects.toThrow('original source');
    expect(await absent(meta('marker.json'))).toBe(true);
    delete next.sources[alias];
    next.sources[`${folder}/.third-brain/state.json`] = { hash: sha('synthetic'), status: 'empty', fragmentIds: [] };
    await expect(new OwnedStore(root, folder).commit(next)).rejects.toThrow('original source');
    expect(await absent(meta('marker.json'))).toBe(true);
  });
});

describe('OwnedStore strict state, marker and path validation', () => {
  it.each(['../outside', '/absolute', 'C:/outside', 'safe/../outside', 'safe\\outside', 'safe/NUL', '.obsidian/generated', 'safe/.third-brain'])('rejects unsafe output folder %s', folder => {
    expect(() => new OwnedStore(root, folder)).toThrow();
  });
  it('fails closed on a pre-existing reserved directory without a marker', async () => {
    await fs.mkdir(meta(''), { recursive: true });
    await fs.writeFile(meta('manual.txt'), 'Synthetic reserved manual file');
    const store = new OwnedStore(root, folder);
    await expect(store.load()).rejects.toThrow('marker');
    await expect(store.commit(await fixture())).rejects.toThrow('marker');
    expect(await fs.readFile(meta('manual.txt'), 'utf8')).toBe('Synthetic reserved manual file');
  });
  it.each(['corrupt', 'unknown-schema', 'owned-traversal', 'source-traversal', 'missing-privacy', 'duplicate-key', 'unknown-field'])('fails closed on %s state without changing outputs', async variant => {
    const next = await fixture();
    const store = new OwnedStore(root, folder);
    await store.commit(next);
    const before = await fs.readFile(absolute(`${folder}/${outputName()}`));
    const raw = await fs.readFile(meta('state.json'), 'utf8');
    const state = JSON.parse(raw);
    let bad: string;
    switch (variant) {
      case 'corrupt': bad = '{'; break;
      case 'unknown-schema': state.schema = 42; bad = JSON.stringify(state); break;
      case 'owned-traversal': state.owned['../../Synthetic notes/Exact [source] #1.md'] = sha(original); bad = JSON.stringify(state); break;
      case 'source-traversal': state.index.sources['../outside.md'] = { hash: sha('synthetic'), status: 'empty', fragmentIds: [] }; bad = JSON.stringify(state); break;
      case 'missing-privacy': delete state.index.fragments['synthetic-fragment'].privacy; bad = JSON.stringify(state); break;
      case 'duplicate-key': bad = raw.replace('"schema":1', '"schema":42,"schema":1'); break;
      default: state.unrecognized = true; bad = JSON.stringify(state);
    }
    await fs.writeFile(meta('state.json'), bad);
    await expect(store.load()).rejects.toThrow();
    await expect(store.commit(changed(next))).rejects.toThrow();
    expect(await fs.readFile(meta('state.json'), 'utf8')).toBe(bad);
    expect(await fs.readFile(absolute(`${folder}/${outputName()}`))).toEqual(before);
    expect(await fs.readFile(absolute(sourcePath), 'utf8')).toBe(original);
  });
  it('rejects a junction/symlink output folder and a symlink vault root on the real filesystem', async () => {
    const next = await fixture();
    const elsewhere = absolute('synthetic-outside-target');
    await fs.mkdir(elsewhere);
    await fs.writeFile(path.join(elsewhere, 'Manual.md'), 'Synthetic protected linked directory');
    await fs.mkdir(absolute('Third Brain'), { recursive: true });
    await fs.symlink(elsewhere, absolute(folder), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(new OwnedStore(root, folder).commit(next)).rejects.toThrow('Unsafe');
    expect(await fs.readFile(path.join(elsewhere, 'Manual.md'), 'utf8')).toBe('Synthetic protected linked directory');
    const alias = absolute('synthetic-root-alias');
    await fs.symlink(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(new OwnedStore(alias, folder).load()).rejects.toThrow('vault root');
  });
  it('guards symlinks during load and each apply, not just construction', async () => {
    const next = await fixture();
    const store = new OwnedStore(root, folder);
    await store.commit(next);
    const moved = absolute('synthetic-moved-outputs');
    await fs.rename(absolute(folder), moved);
    await fs.symlink(moved, absolute(folder), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(store.load()).rejects.toThrow('Unsafe');
    await expect(store.recover()).rejects.toThrow('Unsafe');
    expect(await fs.readFile(absolute(sourcePath), 'utf8')).toBe(original);
  });
  it('refuses a hardlinked target pointing at a synthetic original', async () => {
    const next = await fixture();
    await fs.mkdir(absolute(folder), { recursive: true });
    await fs.link(absolute(sourcePath), absolute(`${folder}/${outputName()}`));
    await expect(new OwnedStore(root, folder).commit(next)).rejects.toThrow('Unsafe');
    expect(await fs.readFile(absolute(sourcePath), 'utf8')).toBe(original);
  });
});

describe('OwnedStore actual transactions, CAS, cancellation and recovery', () => {
  it('supports the parent source-reader CAS that calls managedSourcePaths, including a second verification after generated writes', async () => {
    await fixture(); await fs.mkdir(absolute(folder), { recursive: true });
    const manualPath = `${folder}/Synthetic manual original.md`;
    const manual = 'Synthetic manual source: visible ownership is not inferred from a folder name.';
    await fs.writeFile(absolute(manualPath), manual);
    const store = new OwnedStore(root, folder);
    const reader = new FileSources(root, () => ({ ...defaults, outputFolder: folder }), () => store.managedSourcePaths());
    const snapshots = await reader.list();
    expect(snapshots.map(s => s.path)).toContain(manualPath);
    const run = { mode: 'local-excerpts' as const, cloudConsent: false, signature: 'synthetic-real-reader', previous: null, now: date };
    const next = await buildIndex(snapshots, run);
    let checks = 0;
    await store.commit(next, async () => { checks++; await reader.verify(snapshots); });
    expect(checks).toBe(2);
    expect((await reader.list()).map(s => s.path)).toEqual(snapshots.map(s => s.path));
    expect(await fs.readFile(absolute(manualPath), 'utf8')).toBe(manual);
    const repeated = await buildIndex(await reader.list(), { ...run, previous: await store.load() });
    await store.commit(repeated, () => reader.verify(snapshots));
    expect(await store.load()).toEqual(next);
  });
  it('rolls back when the source changes between initial CAS and the atomic state swap', async () => {
    const old = await fixture(); await new OwnedStore(root, folder).commit(old);
    const before = await fs.readFile(absolute(`${folder}/${outputName()}`));
    let edited = false;
    const store = new OwnedStore(root, folder, { io: async e => {
      if (!edited && e.phase === 'after-apply' && e.target === `${folder}/${outputName()}`) {
        edited = true; await fs.appendFile(absolute(sourcePath), 'Synthetic source edit during writes.');
      }
    } });
    let checks = 0;
    await expect(store.commit(changed(old), async () => {
      checks++;
      if (sha(await fs.readFile(absolute(sourcePath))) !== old.sources[sourcePath].hash) throw new Error('Synthetic late source CAS conflict');
    })).rejects.toThrow('late source CAS conflict');
    expect(checks).toBe(2);
    expect(await fs.readFile(absolute(`${folder}/${outputName()}`))).toEqual(before);
    expect(await new OwnedStore(root, folder).load()).toEqual(old);
    expect(await fs.readFile(absolute(sourcePath), 'utf8')).toBe(original + 'Synthetic source edit during writes.');
  });
  it.each(['new-output-link', 'state-link', 'generated-replacement'])('recovers a real abrupt child-process exit at %s', async boundary => {
    const old = await fixture();
    await new OwnedStore(root, folder).commit(old);
    const before = await fs.readFile(absolute(`${folder}/${outputName()}`));
    const next = changed(old);
    const newId = 'synthetic-added-fragment';
    next.fragments[newId] = { ...structuredClone(old.fragments['synthetic-fragment']), id: newId, title: 'Synthetic independent addition' };
    next.sources[sourcePath].fragmentIds.push(newId);
    const target = boundary === 'state-link' ? `${folder}/.third-brain/state.json` :
      boundary === 'new-output-link' ? `${folder}/${outputName(newId)}` : `${folder}/${outputName()}`;
    // The state already exists, so state replacement uses rename, not link.
    const phase = boundary === 'new-output-link' ? 'after-link' : 'after-apply';
    const moduleURL = pathToFileURL(path.resolve('src/runtime/store.ts')).href;
    const script = `import {OwnedStore} from ${JSON.stringify(moduleURL)};
      const store=new OwnedStore(${JSON.stringify(root)},${JSON.stringify(folder)},{io:e=>{
        if(e.phase===${JSON.stringify(phase)}&&e.target===${JSON.stringify(target)}) process.exit(73);
      }}); await store.commit(${JSON.stringify(next)}); process.exit(0);`;
    const child = spawn(process.execPath, ['--no-deprecation', '--import', 'tsx', '--input-type', 'module', '--eval', script], { cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = ''; child.stderr.on('data', b => { stderr += b.toString(); });
    const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    expect(stderr).toBe(''); expect(code).toBe(73);
    expect(await absent(meta('journal.json'))).toBe(false);
    const recovered = new OwnedStore(root, folder);
    await recovered.recover();
    if (boundary === 'state-link') expect(await recovered.load()).toEqual(next);
    else {
      expect(await recovered.load()).toEqual(old);
      expect(await fs.readFile(absolute(`${folder}/${outputName()}`))).toEqual(before);
      expect(await absent(absolute(`${folder}/${outputName(newId)}`))).toBe(true);
    }
    expect(await absent(meta('write.lock'))).toBe(true);
    expect(await absent(meta('journal.json'))).toBe(true);
    expect(await fs.readFile(absolute(sourcePath), 'utf8')).toBe(original);
  });
  it('recovers a real crash between exclusive initial state link and work-name unlink as a committed revision', async () => {
    const next = await fixture();
    const moduleURL = pathToFileURL(path.resolve('src/runtime/store.ts')).href;
    const script = `import {OwnedStore} from ${JSON.stringify(moduleURL)};
      await new OwnedStore(${JSON.stringify(root)},${JSON.stringify(folder)},{io:e=>{
        if(e.phase==='after-link'&&e.target.endsWith('/state.json')) process.exit(73);
      }}).commit(${JSON.stringify(next)}); process.exit(0);`;
    const child = spawn(process.execPath, ['--no-deprecation', '--import', 'tsx', '--input-type', 'module', '--eval', script], { cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = ''; child.stderr.on('data', b => { stderr += b.toString(); });
    const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    expect(stderr).toBe(''); expect(code).toBe(73);
    expect((await fs.stat(meta('state.json'))).nlink).toBe(2);
    const store = new OwnedStore(root, folder);
    expect(await store.load()).toEqual(next);
    expect((await fs.stat(meta('state.json'))).nlink).toBe(1);
    expect(await absent(meta('journal.json'))).toBe(true);
    expect(await fs.readFile(absolute(sourcePath), 'utf8')).toBe(original);
  });
  it('runs source CAS after durable staging and before any generated/state mutation', async () => {
    const old = await fixture();
    await new OwnedStore(root, folder).commit(old);
    const before = await fs.readFile(absolute(`${folder}/${outputName()}`));
    let casCalls = 0;
    const store = new OwnedStore(root, folder, { io: async event => {
      if (event.phase === 'staged') await fs.appendFile(absolute(sourcePath), 'Synthetic editor change.\n');
    } });
    await expect(store.commit(changed(old), async () => {
      casCalls++;
      expect(await absent(meta('journal.json'))).toBe(false);
      if (sha(await fs.readFile(absolute(sourcePath))) !== old.sources[sourcePath].hash) throw new Error('Synthetic source CAS conflict');
    })).rejects.toThrow('CAS conflict');
    expect(casCalls).toBe(1);
    expect(await fs.readFile(absolute(`${folder}/${outputName()}`))).toEqual(before);
    expect(await new OwnedStore(root, folder).load()).toEqual(old);
    expect(await fs.readFile(absolute(sourcePath), 'utf8')).toBe(original + 'Synthetic editor change.\n');
    expect(await absent(meta('journal.json'))).toBe(true);
  });
  it('cancels before starting without creating metadata', async () => {
    const next = await fixture(); const controller = new AbortController(); controller.abort();
    await expect(new OwnedStore(root, folder).commit(next, undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(await absent(meta('marker.json'))).toBe(true);
    expect(await fs.readFile(absolute(sourcePath), 'utf8')).toBe(original);
  });
  it('cancels staged work without touching old active outputs', async () => {
    const old = await fixture(); const controller = new AbortController();
    await new OwnedStore(root, folder).commit(old);
    const before = await fs.readFile(absolute(`${folder}/${outputName()}`));
    const store = new OwnedStore(root, folder, { io: e => { if (e.phase === 'staged') controller.abort(); } });
    await expect(store.commit(changed(old), undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(await fs.readFile(absolute(`${folder}/${outputName()}`))).toEqual(before);
    expect(await new OwnedStore(root, folder).load()).toEqual(old);
  });
  it('rolls back actual generated mutations on mid-commit cancellation and preserves originals', async () => {
    const old = await fixture(); const controller = new AbortController();
    await new OwnedStore(root, folder).commit(old);
    const before = await fs.readFile(absolute(`${folder}/${outputName()}`));
    const store = new OwnedStore(root, folder, { io: e => {
      if (e.phase === 'after-apply' && e.target === `${folder}/${outputName()}`) controller.abort();
    } });
    await expect(store.commit(changed(old), undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(await fs.readFile(absolute(`${folder}/${outputName()}`))).toEqual(before);
    expect(await new OwnedStore(root, folder).load()).toEqual(old);
    expect(await fs.readFile(absolute(sourcePath), 'utf8')).toBe(original);
    expect(await absent(meta('journal.json'))).toBe(true);
  });
  it('recovers a rollback failure from the persisted journal in a fresh store', async () => {
    const old = await fixture();
    await new OwnedStore(root, folder).commit(old);
    const before = await fs.readFile(absolute(`${folder}/${outputName()}`));
    await pending(old);
    expect(await fs.readFile(absolute(`${folder}/${outputName()}`))).not.toEqual(before);
    await new OwnedStore(root, folder).recover();
    expect(await fs.readFile(absolute(`${folder}/${outputName()}`))).toEqual(before);
    expect(await new OwnedStore(root, folder).load()).toEqual(old);
    expect(await fs.readFile(absolute(sourcePath), 'utf8')).toBe(original);
    expect(await absent(meta('journal.json'))).toBe(true);
  });
  it('never reports recovery success if a restoration operation fails', async () => {
    const old = await fixture();
    await new OwnedStore(root, folder).commit(old);
    await pending(old);
    const store = new OwnedStore(root, folder, { io: e => { if (e.phase === 'before-rollback') throw new Error('Synthetic recovery failure'); } });
    await expect(store.recover()).rejects.toThrow('Synthetic recovery failure');
    expect(await absent(meta('journal.json'))).toBe(false);
    expect(await fs.readFile(absolute(sourcePath), 'utf8')).toBe(original);
    await new OwnedStore(root, folder).recover();
    expect(await new OwnedStore(root, folder).load()).toEqual(old);
  });
  it.each(['traversal', 'original-target', 'unknown-schema', 'unknown-field', 'backup-traversal', 'bad-backup-hash', 'bad-stage-hash'])('refuses %s in a persisted recovery plan before writes', async variant => {
    const old = await fixture();
    await new OwnedStore(root, folder).commit(old); await pending(old);
    const journal = JSON.parse(await fs.readFile(meta('journal.json'), 'utf8'));
    const before = await fs.readFile(absolute(`${folder}/${outputName()}`));
    switch (variant) {
      case 'traversal': journal.operations[0].target = '../Synthetic original.md'; break;
      case 'original-target': journal.operations[0].target = sourcePath; break;
      case 'unknown-schema': journal.schema = 20; break;
      case 'unknown-field': journal.command = 'synthetic forbidden'; break;
      case 'backup-traversal': journal.operations.find((o: { backup: string }) => o.backup).backup = '../../Synthetic original.md'; break;
      case 'bad-backup-hash': {
        const name = journal.operations.find((o: { backup: string }) => o.backup).backup;
        await fs.writeFile(meta(`transactions/${journal.transaction}/${name}`), 'Synthetic corrupt backup'); break;
      }
      case 'bad-stage-hash': await fs.writeFile(meta(`transactions/${journal.transaction}/next.json`), 'Synthetic corrupt stage'); break;
    }
    await fs.writeFile(meta('journal.json'), JSON.stringify(journal));
    await expect(new OwnedStore(root, folder).recover()).rejects.toThrow();
    expect(await fs.readFile(absolute(`${folder}/${outputName()}`))).toEqual(before);
    expect(await fs.readFile(absolute(sourcePath), 'utf8')).toBe(original);
    expect(await absent(meta('journal.json'))).toBe(false);
  });
  it('guards recovery transaction-directory junctions before reading backups', async () => {
    const old = await fixture();
    await new OwnedStore(root, folder).commit(old); await pending(old);
    const j = JSON.parse(await fs.readFile(meta('journal.json'), 'utf8'));
    const tx = meta(`transactions/${j.transaction}`), moved = absolute('synthetic-moved-transaction');
    await fs.rename(tx, moved);
    await fs.symlink(moved, tx, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(new OwnedStore(root, folder).recover()).rejects.toThrow('Unsafe');
    expect(await fs.readFile(absolute(sourcePath), 'utf8')).toBe(original);
    expect(await absent(meta('journal.json'))).toBe(false);
  });
  it('preserves a human edit that arrives at the actual write boundary; journal remains for intervention', async () => {
    const old = await fixture(); await new OwnedStore(root, folder).commit(old);
    const target = `${folder}/${outputName()}`;
    const store = new OwnedStore(root, folder, { io: async e => {
      if (e.phase === 'before-apply' && e.target === target) await fs.appendFile(absolute(target), '\nSynthetic concurrent human edit.');
    } });
    await expect(store.commit(changed(old))).rejects.toThrow('rollback failed');
    expect(await fs.readFile(absolute(target), 'utf8')).toContain('Synthetic concurrent human edit.');
    expect(await fs.readFile(absolute(sourcePath), 'utf8')).toBe(original);
    await expect(new OwnedStore(root, folder).recover()).rejects.toThrow('conflict');
  });
  it('serializes all stores for a vault, not just one instance', async () => {
    const old = await fixture(); await new OwnedStore(root, folder).commit(old);
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const hooks: StoreTestHooks = { io: async e => { if (e.phase === 'staged') { enter(); await blocked; } } };
    const writing = new OwnedStore(root, folder, hooks).commit(changed(old));
    await entered;
    await expect(new OwnedStore(root, folder).commit(old)).rejects.toThrow('in progress');
    await expect(new OwnedStore(root, 'Other Generated').commit(old)).rejects.toThrow('in progress');
    release(); await writing;
    expect(await new OwnedStore(root, folder).load()).toEqual(changed(old));
  });
  it('finishes a committed pointer after finalization failure instead of rolling it back or claiming success', async () => {
    const old = await fixture(); await new OwnedStore(root, folder).commit(old);
    const store = new OwnedStore(root, folder, { io: e => { if (e.phase === 'before-finalize') throw new Error('Synthetic finalize failure'); } });
    await expect(store.commit(changed(old))).rejects.toThrow('recovery required');
    expect(await absent(meta('journal.json'))).toBe(false);
    await new OwnedStore(root, folder).recover();
    expect(await new OwnedStore(root, folder).load()).toEqual(changed(old));
    expect(await absent(meta('journal.json'))).toBe(true);
    expect(await fs.readFile(absolute(sourcePath), 'utf8')).toBe(original);
  });
});
