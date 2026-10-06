// SPDX-License-Identifier: MIT
// Every vault, quotation and editorial attribute below is authored synthetic.
import { beforeEach, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { OwnedStore } from '../src/runtime/store';
import { buildIndex } from '../src/core/index';
import { buildFragmentNetwork, NETWORK_LIMITS } from '../src/core/connections';
import { emptyIndex, type Fragment, type IndexState } from '../src/core/types';

const sha = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex');
const name = (id: string): string => `fragment-${sha(id)}.md`;
const folder = 'Third Brain/Fragments';
const base = path.resolve('.local/fragment-network');
let root: string;
const abs = (p: string): string => path.join(root, ...p.split('/'));
const meta = (p: string): string => abs(`${folder}/.third-brain/${p}`);
const output = (id: string): string => abs(`${folder}/${name(id)}`);
const report = async (file: string, data: unknown): Promise<void> => { await fs.writeFile(path.join(base, file), JSON.stringify(data, null, 2)); };
beforeEach(async () => { await fs.mkdir(base, { recursive: true }); root = await fs.mkdtemp(path.join(base, 'synthetic-')); });

async function fixture(): Promise<IndexState> {
  const notes = [
    ['Learning', 'normal', 'spaced practice', 'feedback loop', 'A short practice loop reveals mistakes before the next attempt.'],
    ['Gardening', 'normal', 'irrigation', '反馈回路', 'A soil check after watering reveals the next adjustment.'],
    ['Unrelated', 'normal', 'astronomy', 'spectral dispersion', 'A telescope lens collects distant starlight.'],
    ['Local', 'local', 'irrigation', 'feedback loop', 'A local synthetic soil observation remains local.'],
    ['Private', 'private', 'irrigation', 'feedback loop', 'A private synthetic soil observation stays private.'],
  ] as const;
  const snapshots = [];
  await fs.mkdir(abs('Synthetic'), { recursive: true });
  for (const [title, privacy, topic, mechanism, body] of notes) {
    const p = `Synthetic/${title}.md`;
    const text = `---\nprivacy: ${privacy}\ntopics: [${topic}]\nmechanisms: [${mechanism}]\n---\n# ${title}\n\n${body}\n`;
    await fs.writeFile(abs(p), text);
    snapshots.push({ id: `synthetic-${title}`, path: p, text, hash: sha(text), privacy, format: 'markdown' as const });
  }
  return buildIndex(snapshots, { mode: 'local-excerpts', cloudConsent: false, previous: null, signature: 'synthetic-network', now: '2026-01-01T00:00:00.000Z' });
}
const named = (index: IndexState, source: string): Fragment => Object.values(index.fragments).find(f => f.evidence[0].relativePath === `Synthetic/${source}.md`)!;
async function originals(index: IndexState): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all(Object.keys(index.sources).map(async p => [p, sha(await fs.readFile(abs(p)))])));
}
async function parsed(index: IndexState): Promise<unknown[]> {
  const targets = new Set(Object.keys(index.fragments).map(name));
  return Promise.all(Object.values(index.fragments).map(async f => {
    const bytes = await fs.readFile(output(f.id));
    const links = [...bytes.toString('utf8').matchAll(/\]\(<(fragment-[a-f0-9]{64}\.md)>\)/g)].map(m => m[1]);
    for (const link of links) { expect(targets.has(link)).toBe(true); expect((await fs.stat(abs(`${folder}/${link}`))).isFile()).toBe(true); }
    return { id: f.id, privacy: f.privacy, file: `${folder}/${name(f.id)}`, hash: sha(bytes), links };
  }));
}

// Frozen 0.1.0 render contract. This fixture is independently byte-checked
// against the unmodified baseline OwnedStore under .local, not a v2 downgrade.
function legacy(f: Fragment, storeId: string): Buffer {
  const esc = (s: string): string => s.replace(/[\\`*_{}\[\]()<>#+!|]/g, '\\$&');
  const lines = ['---', 'third_brain_owned: true', 'third_brain_schema: 1', `third_brain_store: ${storeId}`,
    `fragment_id: ${JSON.stringify(f.id)}`, `privacy: ${f.privacy}`, `title: ${JSON.stringify(f.title)}`,
    `extraction: ${f.mode === 'local' ? 'local-excerpt' : 'ai-edited'}`, `updated_at: ${JSON.stringify(f.updatedAt)}`,
    `provenance: ${JSON.stringify(f.evidence.map(e => ({ path: e.relativePath, revision: e.sourceHash, start: e.start, end: e.end })))}`,
    '---', '', `# ${esc(f.title)}`, '', esc(f.summary), '',
    f.mode === 'local' ? '_Local excerpt; not an AI summary._' : '_AI-edited derived fragment; check the original evidence._', ''];
  for (const [key, values] of Object.entries(f.facets)) if (values.length) lines.push(`**${key}:** ${values.map(esc).join(', ')}`, '');
  for (const s of f.conditions) lines.push(`- Condition: ${esc(s)}`);
  for (const s of f.caveats) lines.push(`- Caveat: ${esc(s)}`);
  lines.push('', '## Original evidence', '');
  for (const e of f.evidence) {
    const link = path.posix.relative(folder, e.relativePath).split('/').map(encodeURIComponent).join('/');
    lines.push(`[Open original](<${link}>) — ${esc(e.relativePath)}`, '',
      `Revision: ${e.sourceHash}; character range: ${e.start < 0 ? 'unavailable (decoded Canvas text)' : `${e.start}–${e.end}`}`, '',
      ...e.quote.split(/\r?\n/).map(line => `> ${esc(line)}`), '');
  }
  return Buffer.from(lines.join('\n') + '\n');
}
function oldManifest(index: IndexState): Buffer {
  const owned = Object.fromEntries(Object.values(index.fragments).sort((a, b) => a.id.localeCompare(b.id)).map(f => [name(f.id), sha(legacy(f, 'a'.repeat(32)))]));
  return Buffer.from(JSON.stringify({ schema: 1, owner: 'third-brain', storeId: 'a'.repeat(32), outputFolder: folder, index, owned }));
}
async function seedLegacy(index: IndexState): Promise<void> {
  await fs.mkdir(meta(''), { recursive: true });
  await fs.writeFile(meta('marker.json'), JSON.stringify({ schema: 1, owner: 'third-brain', storeId: 'a'.repeat(32), outputFolder: folder }));
  for (const f of Object.values(index.fragments)) await fs.writeFile(output(f.id), legacy(f, 'a'.repeat(32)));
  await fs.writeFile(meta('state.json'), oldManifest(index));
}

it('persists clickable real targets, abstains on unrelated/kind-only, isolates privacy, and retires links', async () => {
  const index = await fixture(), before = await originals(index);
  const store = new OwnedStore(root, folder); await store.commit(index);
  expect(await store.load()).toEqual(index);
  const a = named(index, 'Learning'), b = named(index, 'Gardening');
  const text = await fs.readFile(output(a.id), 'utf8');
  expect(text).toContain(`](<${name(b.id)}>)`);
  expect(text).toContain('Shared mechanisms: 反馈循环');
  expect(text).toContain('not verified AI semantics');
  expect(text).toContain(`aliases: ${JSON.stringify([a.title])}`);
  expect(await store.fragmentPath(a.id)).toBe(`${folder}/${name(a.id)}`);
  await expect(store.fragmentPath('../unowned.md')).rejects.toThrow();
  for (const source of ['Unrelated', 'Local', 'Private']) {
    const f = named(index, source); expect(text).not.toContain(name(f.id));
    expect(text.split('## Related fragments')[1]).not.toContain(f.title);
    expect(buildFragmentNetwork(index).connections.get(f.id)).toEqual([]);
  }
  await report('network.json', { root, sourceHashes: before, stateHash: sha(await fs.readFile(meta('state.json'))), outputs: await parsed(index) });
  const next = structuredClone(index); delete next.sources['Synthetic/Gardening.md']; delete next.fragments[b.id];
  await store.commit(next);
  expect(await fs.readFile(output(a.id), 'utf8')).not.toContain(name(b.id));
  expect(await originals(index)).toEqual(before);
  await report('retired.json', { root, sourceHashes: await originals(index), outputs: await parsed(next) });
});

it('rejects generic/ubiquitous or atmosphere-only associations and is deterministic at 10,000 fragments', async () => {
  const index = await fixture(), prototype = named(index, 'Learning'), scale = emptyIndex();
  for (let i = 0; i < 10000; i++) {
    const id = `synthetic-scale-${i.toString().padStart(5, '0')}`, p = `Synthetic/Scale-${i}.md`;
    scale.sources[p] = { hash: '0'.repeat(64), status: 'indexed', fragmentIds: [id] };
    scale.fragments[id] = { ...prototype, id, facets: { topics: ['general', 'ubiquitous'], concepts: [`specific-group-${Math.floor(i / 8)}`], mechanisms: [], atmosphere: ['quiet'] },
      evidence: [{ ...prototype.evidence[0], relativePath: p, sourceHash: '0'.repeat(64) }] };
  }
  const start = performance.now(), result = buildFragmentNetwork(scale), milliseconds = performance.now() - start;
  expect(result.stats.fragments).toBe(10000);
  expect(result.stats.postingVisits).toBeLessThanOrEqual(10000 * 24 * NETWORK_LIMITS.postingSize);
  expect(result.stats.candidatePairs).toBeLessThanOrEqual(10000 * NETWORK_LIMITS.candidates);
  expect(result.stats.links).toBeLessThanOrEqual(10000 * NETWORK_LIMITS.links);
  expect(result.stats.links).toBe(60000);
  for (const list of result.connections.values()) expect(list.every(c => c.shared.every(s => s.channel === 'concepts'))).toBe(true);
  scale.fragments = Object.fromEntries(Object.entries(scale.fragments).reverse());
  expect([...buildFragmentNetwork(scale).connections]).toEqual([...result.connections]);
  await report('scale.json', { milliseconds, ...result.stats, limits: NETWORK_LIMITS, networkHash: sha(JSON.stringify([...result.connections])) });
});

it('loads frozen legacy bytes, upgrades only on refresh, archives old bytes, stays idempotent and protects edits', async () => {
  const index = await fixture(), before = await originals(index); await seedLegacy(index);
  const oldState = await fs.readFile(meta('state.json')), oldBytes = await fs.readFile(output(named(index, 'Learning').id));
  const store = new OwnedStore(root, folder);
  expect(await store.load()).toEqual(index); expect(await fs.readFile(meta('state.json'))).toEqual(oldState);
  await fs.writeFile(abs(`${folder}/Manual.md`), 'Synthetic human-authored original.');
  await store.commit(index, async () => { expect(await originals(index)).toEqual(before); });
  const upgraded = await fs.readFile(meta('state.json')); expect(JSON.parse(upgraded.toString()).renderVersion).toBe(2);
  const [revision] = await fs.readdir(meta('history'));
  expect(await fs.readFile(meta(`history/${revision}/${name(named(index, 'Learning').id)}.bak`))).toEqual(oldBytes);
  const stats = await fs.stat(output(named(index, 'Learning').id)); await store.commit(index);
  expect(await fs.readFile(meta('state.json'))).toEqual(upgraded);
  expect((await fs.stat(output(named(index, 'Learning').id))).mtimeMs).toBe(stats.mtimeMs);
  const targets = await parsed(index);
  const edited = output(named(index, 'Learning').id); await fs.appendFile(edited, '\nSynthetic human amendment.\n');
  const humanHash = sha(await fs.readFile(edited));
  await expect(store.commit(index)).rejects.toThrow('human-edited');
  expect(sha(await fs.readFile(edited))).toBe(humanHash); expect(await fs.readFile(meta('state.json'))).toEqual(upgraded);
  expect(await fs.readFile(abs(`${folder}/Manual.md`), 'utf8')).toBe('Synthetic human-authored original.');
  expect(await originals(index)).toEqual(before);
  await report('upgrade.json', { root, oldStateHash: sha(oldState), newStateHash: sha(upgraded), legacyFragmentHash: sha(oldBytes), targets, idempotent: true, humanHash, editPreserved: true, sourceHashes: before });
});

it('refuses edited legacy bytes before upgrading and rejects a new manifest with legacy hashes or unknown version', async () => {
  const index = await fixture(); await seedLegacy(index);
  const state = await fs.readFile(meta('state.json'));
  const f = named(index, 'Learning'), bytes = await fs.readFile(output(f.id));
  await fs.appendFile(output(f.id), '\nSynthetic old human edit.');
  const editedHash = sha(await fs.readFile(output(f.id)));
  await expect(new OwnedStore(root, folder).commit(index)).rejects.toThrow('human-edited');
  expect(sha(await fs.readFile(output(f.id)))).toBe(editedHash); expect(await fs.readFile(meta('state.json'))).toEqual(state);
  // Restore only this newly-authored fixture so manifest validation is isolated.
  await fs.writeFile(output(f.id), bytes);
  const bad = JSON.parse(state.toString()); bad.renderVersion = 2;
  await fs.writeFile(meta('state.json'), JSON.stringify(bad)); await expect(new OwnedStore(root, folder).load()).rejects.toThrow('manifest');
  bad.renderVersion = 999; await fs.writeFile(meta('state.json'), JSON.stringify(bad));
  await expect(new OwnedStore(root, folder).load()).rejects.toThrow('render version');
  await report('legacy-protection.json', { root, stateHash: sha(state), editedHash, editPreserved: true, versionMismatchRejected: true });
});

it.each(['rollback', 'forward'] as const)('validates mixed old/new manifests and %s recovery at real transaction boundaries', async direction => {
  const index = await fixture(); await seedLegacy(index);
  const oldState = await fs.readFile(meta('state.json')), originalHashes = await originals(index);
  const store = new OwnedStore(root, folder, { io: e => {
    if (direction === 'rollback' && e.phase === 'before-apply' && e.target?.endsWith('/state.json')) throw new Error('Synthetic pre-state interruption');
    if (direction === 'rollback' && e.phase === 'before-rollback') throw new Error('Synthetic rollback interruption');
    if (direction === 'forward' && e.phase === 'before-finalize') throw new Error('Synthetic post-state interruption');
  } });
  await expect(store.commit(index)).rejects.toThrow('recovery required');
  const journal = JSON.parse(await fs.readFile(meta('journal.json'), 'utf8'));
  const previous = JSON.parse(await fs.readFile(meta(`transactions/${journal.transaction}/previous.json`), 'utf8'));
  const next = JSON.parse(await fs.readFile(meta(`transactions/${journal.transaction}/next.json`), 'utf8'));
  expect(previous.renderVersion).toBeUndefined(); expect(next.renderVersion).toBe(2);
  await new OwnedStore(root, folder).recover(); expect(await new OwnedStore(root, folder).load()).toEqual(index);
  const recovered = await fs.readFile(meta('state.json'));
  if (direction === 'rollback') expect(recovered).toEqual(oldState); else expect(JSON.parse(recovered.toString()).renderVersion).toBe(2);
  await expect(fs.stat(meta('journal.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await originals(index)).toEqual(originalHashes);
  await report(`recovery-${direction}.json`, { root, previous: journal.previous, next: journal.next, recoveredHash: sha(recovered), sourceHashes: originalHashes, journalRemoved: true });
});

it('does not claim an unowned colliding target and escapes untrusted link labels/facets', async () => {
  const index = await fixture(), a = named(index, 'Learning'), b = named(index, 'Gardening');
  b.title = 'Synthetic [[escape]] ](evil) <script>\n![payload](x)';
  a.facets.mechanisms = b.facets.mechanisms = ['specific ](evil) <script>'];
  await fs.mkdir(abs(folder), { recursive: true }); await fs.writeFile(output(b.id), 'Synthetic unowned collision.');
  await expect(new OwnedStore(root, folder).commit(index)).rejects.toThrow('Unowned');
  expect(await fs.readFile(output(b.id), 'utf8')).toBe('Synthetic unowned collision.');
  await fs.unlink(output(b.id)); // Only this test's own synthetic collision.
  await new OwnedStore(root, folder).commit(index);
  const text = (await fs.readFile(output(a.id), 'utf8')).split('## Related fragments')[1];
  expect(text).toContain('\\[\\[escape\\]\\]'); expect(text).toContain('\\<script\\>');
  expect(text).not.toContain('<script>'); expect(text).not.toContain('![payload]');
  await parsed(index);
});
