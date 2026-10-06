// SPDX-License-Identifier: MIT
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import * as path from 'node:path';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Facets, Fragment, IndexState, StorePort } from '../core/types';
import { buildFragmentNetwork, type FragmentNetwork } from '../core/connections';

const OWNER = 'third-brain';
const STATE_LIMIT = 32 * 1024 * 1024;
const FILE_LIMIT = 2 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const TOKEN = /^[a-f0-9]{32}$/;
const writers = new Set<string>();
const hash = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
function fail(message = 'Third Brain store validation failed'): never { throw new Error(message); }
const own = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);
const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) fail();
  return v as Record<string, unknown>;
};
function keys(v: unknown, expected: string[]): Record<string, unknown> {
  const r = record(v);
  const k = Object.keys(r).sort();
  if (k.join('\0') !== [...expected].sort().join('\0')) fail();
  return r;
}
function text(v: unknown, max: number, empty = false): string {
  if (typeof v !== 'string' || v.length > max || (!empty && !v.trim()) || v.includes('\0')) fail();
  return v as string;
}
function strings(v: unknown, maxItems = 64, maxLength = 512): string[] {
  if (!Array.isArray(v) || v.length > maxItems) fail();
  return v.map(item => text(item, maxLength));
}
function digest(v: unknown): string {
  if (typeof v !== 'string' || !HASH.test(v)) fail();
  return v as string;
}
function relative(v: unknown): string {
  const p = text(v, 2048);
  if (p.includes('\\') || p.startsWith('/') || /[\x00-\x1f\x7f:*?"<>|]/.test(p)) fail('Unsafe store path');
  for (const segment of p.split('/')) {
    if (!segment || segment === '.' || segment === '..' || /[. ]$/.test(segment) ||
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)) fail('Unsafe store path');
  }
  return p;
}

// JSON.parse alone accepts duplicate keys. Scan the bounded document first;
// refuse duplicate/prototype keys and deep nesting before parsing any schema.
function parse(data: Buffer, limit = STATE_LIMIT, entryLimit = 50000): unknown {
  if (data.length > limit) fail('Store data exceeds size limit');
  let s: string;
  try { s = new TextDecoder('utf-8', { fatal: true }).decode(data); } catch { return fail(); }
  let i = 0;
  const ws = (): void => { while (i < s.length && /[ \t\r\n]/.test(s[i])) i++; };
  const str = (): string => {
    const start = i++;
    for (; i < s.length; i++) {
      if (s[i] === '\\') { i++; continue; }
      if (s[i] === '"') { i++; return JSON.parse(s.slice(start, i)) as string; }
    }
    return fail();
  };
  const value = (depth: number): void => {
    if (depth > 32) fail();
    ws();
    if (s[i] === '"') { str(); return; }
    if (s[i] === '{' || s[i] === '[') {
      const object = s[i++] === '{';
      const end = object ? '}' : ']';
      const seen = new Set<string>();
      ws();
      if (s[i] === end) { i++; return; }
      let count = 0;
      while (i < s.length) {
        if (++count > entryLimit) fail();
        ws();
        if (object) {
          if (s[i] !== '"') fail();
          const k = str();
          if (seen.has(k) || ['__proto__', 'constructor', 'prototype'].includes(k)) fail();
          seen.add(k); ws();
          if (s[i++] !== ':') fail();
        }
        value(depth + 1); ws();
        if (s[i] === end) { i++; return; }
        if (s[i++] !== ',') fail();
      }
      return fail();
    }
    const m = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(s.slice(i));
    if (!m) fail();
    i += m[0].length;
  };
  try { value(0); ws(); if (i !== s.length) fail(); return JSON.parse(s); } catch { return fail('Corrupt store JSON'); }
}

function facets(v: unknown): Facets {
  const f = keys(v, ['topics', 'concepts', 'mechanisms', 'atmosphere']);
  for (const k of Object.keys(f)) strings(f[k], 256, 256);
  return v as Facets;
}
function validateIndex(v: unknown): IndexState {
  const x = keys(v, ['version', 'signature', 'updatedAt', 'sources', 'fragments']);
  if (x.version !== 1) fail('Unknown index schema');
  text(x.signature, 4096, true); text(x.updatedAt, 64, true);
  const sources = record(x.sources);
  const fragments = record(x.fragments);
  if (Object.keys(sources).length > 20000 || Object.keys(fragments).length > 10000) fail();
  for (const [sourcePath, value] of Object.entries(sources)) {
    relative(sourcePath);
    const source = keys(value, ['hash', 'status', 'fragmentIds']);
    digest(source.hash);
    if (!['indexed', 'empty', 'insufficient-context', 'sensitive', 'local-only', 'error'].includes(source.status as string)) fail();
    const ids = strings(source.fragmentIds, 10000, 512);
    if (new Set(ids).size !== ids.length || (source.status === 'indexed') !== (ids.length > 0)) fail('Invalid source status or fragment list');
    for (const id of ids) if (!own(fragments, id)) fail();
  }
  for (const [id, value] of Object.entries(fragments)) {
    text(id, 512);
    const f = keys(value, ['id', 'privacy', 'title', 'summary', 'kind', 'facets', 'evidence', 'mode', 'updatedAt', 'conditions', 'caveats']);
    if (f.id !== id || !['normal', 'local', 'private'].includes(f.privacy as string) || !['local', 'ai'].includes(f.mode as string)) fail();
    text(f.title, 1024); text(f.summary, 100000); text(f.kind, 256); text(f.updatedAt, 64, true);
    facets(f.facets); strings(f.conditions); strings(f.caveats);
    if (!Array.isArray(f.evidence) || !f.evidence.length || f.evidence.length > 256) fail();
    for (const value of f.evidence) {
      const e = keys(value, ['sourceId', 'relativePath', 'sourceHash', 'quote', 'start', 'end']);
      text(e.sourceId, 512); const p = relative(e.relativePath); const h = digest(e.sourceHash);
      const quote = text(e.quote, 100000);
      const decodedCanvas = e.start === -1 && e.end === -1 && p.toLowerCase().endsWith('.canvas') && (f.caveats as string[]).length > 0;
      if (!decodedCanvas && (!Number.isSafeInteger(e.start) || !Number.isSafeInteger(e.end) || (e.start as number) < 0 || (e.end as number) - (e.start as number) !== quote.length)) fail();
      if (!own(sources, p)) fail('Fragment references an unavailable source');
      const source = sources[p] as { hash: string; fragmentIds: string[] };
      if (source.hash !== h || !source.fragmentIds.includes(id)) fail('Fragment source revision mismatch');
    }
  }
  for (const [p, source] of Object.entries(sources)) {
    for (const id of (source as { fragmentIds: string[] }).fragmentIds) {
      if (!(fragments[id] as Fragment).evidence.some(e => e.relativePath === p)) fail();
    }
  }
  return v as IndexState;
}

interface Marker { schema: 1; owner: 'third-brain'; storeId: string; outputFolder: string; stagingKey?: string; }
// Absence means the exact 0.1.0 renderer; never reinterpret its owned hashes.
interface Manifest { schema: 1; owner: 'third-brain'; storeId: string; outputFolder: string; index: IndexState; owned: Record<string, string>; renderVersion?: 2; }
interface Loaded { value: Manifest; bytes: Buffer; hash: string; }
interface Operation { target: string; before: string | null; after: string | null; backup: string | null; stage: string | null; }
interface Journal { schema: 1; owner: 'third-brain'; storeId: string; outputFolder: string; transaction: string; previous: string | null; next: string; operations: Operation[]; }
interface StagingOwnership { schema: 1; owner: 'third-brain'; storeId: string; outputFolder: string; transaction: string; artifacts: Record<string, string>; authentication: string; }

// Only durable stage/backup artifacts belong to this inventory. Work names are
// prospective and may never be created by the transaction. Without a live
// recovery proof, matching their expected bytes cannot establish ownership.
function stagingArtifacts(journal: Journal): Record<string, string> {
  const artifacts: Record<string, string> = { 'next.json': journal.next };
  if (journal.previous) artifacts['previous.json'] = journal.previous;
  journal.operations.forEach(o => {
    if (o.backup && o.before) artifacts[o.backup] = o.before;
    if (o.stage && o.after) artifacts[o.stage] = o.after;
  });
  return artifacts;
}
function authenticateStaging(marker: Marker, tx: string, artifacts: Record<string, string>): string {
  if (!marker.stagingKey) fail('Missing staging ownership key');
  const payload = JSON.stringify([1, OWNER, marker.storeId, marker.outputFolder, tx,
    Object.entries(artifacts).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)]);
  return createHmac('sha256', Buffer.from(marker.stagingKey, 'hex')).update(payload).digest('hex');
}

export interface StoreIOEvent { phase: 'staged' | 'before-apply' | 'before-rollback' | 'after-link' | 'after-apply' | 'before-finalize' | 'after-finalize'; target?: string; }
export interface StoreTestHooks {
  /** Optional boundary failpoint; production callers leave this absent. */
  io?: (event: Readonly<StoreIOEvent>) => void | Promise<void>;
}

function filename(id: string): string { return `fragment-${hash(id)}.md`; }
function escapeMD(s: string): string { return s.replace(/[\\`*_{}\[\]()<>#+!|]/g, '\\$&'); }
function renderLegacy(fragment: Fragment, marker: Marker): Buffer {
  const lines = [
    '---', 'third_brain_owned: true', 'third_brain_schema: 1', `third_brain_store: ${marker.storeId}`,
    `fragment_id: ${JSON.stringify(fragment.id)}`, `privacy: ${fragment.privacy}`,
    `title: ${JSON.stringify(fragment.title)}`, `extraction: ${fragment.mode === 'local' ? 'local-excerpt' : 'ai-edited'}`,
    `updated_at: ${JSON.stringify(fragment.updatedAt)}`,
    `provenance: ${JSON.stringify(fragment.evidence.map(e => ({ path: e.relativePath, revision: e.sourceHash, start: e.start, end: e.end })))}`,
    '---', '', `# ${escapeMD(fragment.title)}`, '', escapeMD(fragment.summary), '',
    fragment.mode === 'local' ? '_Local excerpt; not an AI summary._' : '_AI-edited derived fragment; check the original evidence._', '',
  ];
  for (const [name, values] of Object.entries(fragment.facets)) {
    if (values.length) lines.push(`**${name}:** ${values.map(escapeMD).join(', ')}`, '');
  }
  for (const s of fragment.conditions) lines.push(`- Condition: ${escapeMD(s)}`);
  for (const s of fragment.caveats) lines.push(`- Caveat: ${escapeMD(s)}`);
  lines.push('', '## Original evidence', '');
  for (const e of fragment.evidence) {
    const link = path.posix.relative(marker.outputFolder, e.relativePath).split('/').map(encodeURIComponent).join('/');
    lines.push(`[Open original](<${link}>) — ${escapeMD(e.relativePath)}`, '',
      `Revision: ${e.sourceHash}; character range: ${e.start < 0 ? 'unavailable (decoded Canvas text)' : `${e.start}–${e.end}`}`, '',
      ...e.quote.split(/\r?\n/).map(line => `> ${escapeMD(line)}`), '');
  }
  const bytes = Buffer.from(lines.join('\n') + '\n', 'utf8');
  if (bytes.length > FILE_LIMIT) fail('Generated fragment exceeds size limit');
  return bytes;
}
function render(fragment: Fragment, marker: Marker, index: IndexState, network: FragmentNetwork): Buffer {
  const inline = (s: string): string => escapeMD(s.replace(/[\r\n\x00-\x1f\x7f]/g, ' '));
  const lines = ['', '## Related fragments', '',
    'Suggested from shared existing facets, not verified AI semantics or causal equivalence. Check both originals; mechanism applicability and conditions may differ.',
    'Same-privacy targets only. Generic/common labels and bounded candidates may be omitted; absence is not proof of no relationship.', ''];
  for (const connection of network.connections.get(fragment.id) ?? []) {
    const target = index.fragments[connection.targetId];
    // Targets come only from the complete index rendered in this transaction.
    if (!target || target.id === fragment.id || target.privacy !== fragment.privacy) fail('Invalid fragment connection target');
    const shared = connection.shared.map(s => `${s.channel}: ${inline(s.value)}`).join('; ');
    lines.push(`- [${inline(target.title)}](<${filename(target.id)}>) — Shared ${shared}.`);
    if (connection.shared.some(s => s.channel === 'mechanisms')) lines.push('  Suggested mechanism connection; check the target evidence and its conditions/caveats, not a verified causal relationship.');
  }
  if (!(network.connections.get(fragment.id)?.length)) lines.push('No sufficiently specific shared facets within the bounded network.');
  const legacy = renderLegacy(fragment, marker).toString('utf8');
  const bytes = Buffer.from(legacy.replace(/^---\n/, `---\nthird_brain_render: 2\naliases: ${JSON.stringify([fragment.title])}\n`) + lines.join('\n') + '\n', 'utf8');
  if (bytes.length > FILE_LIMIT) fail('Generated fragment exceeds size limit');
  return bytes;
}
function makeManifest(index: IndexState, marker: Marker, renderVersion: 1 | 2 = 2): Manifest {
  const owned: Record<string, string> = {};
  const sourceNames = new Set(Object.keys(index.sources).map(p => p.toLowerCase()));
  const reserved = `${marker.outputFolder}/.third-brain`.toLowerCase();
  const network = renderVersion === 2 ? buildFragmentNetwork(index) : null;
  for (const p of sourceNames) if (p === reserved || p.startsWith(`${reserved}/`)) fail('Reserved state cannot be an original source');
  for (const f of Object.values(index.fragments).sort((a, b) => a.id.localeCompare(b.id))) {
    const name = filename(f.id);
    if (sourceNames.has(`${marker.outputFolder}/${name}`.toLowerCase())) fail('A generated target is an original source');
    owned[name] = hash(network ? render(f, marker, index, network) : renderLegacy(f, marker));
  }
  return { schema: 1, owner: OWNER, storeId: marker.storeId, outputFolder: marker.outputFolder, index, owned,
    ...(renderVersion === 2 ? { renderVersion: 2 as const } : {}) };
}
function manifest(bytes: Buffer, marker: Marker): Loaded {
  const parsed = record(parse(bytes));
  const v = keys(parsed, ['schema', 'owner', 'storeId', 'outputFolder', 'index', 'owned', ...(own(parsed, 'renderVersion') ? ['renderVersion'] : [])]);
  if (v.schema !== 1 || v.owner !== OWNER || v.storeId !== marker.storeId || v.outputFolder !== marker.outputFolder) fail('Unknown or unowned store state');
  if (own(v, 'renderVersion') && v.renderVersion !== 2) fail('Unknown store render version');
  const index = validateIndex(v.index);
  const owned = record(v.owned);
  // Recovery validates previous and next independently; legacy journals may
  // contain two legacy manifests, upgrade journals one of each, or two v2s.
  const expected = makeManifest(index, marker, own(v, 'renderVersion') ? 2 : 1).owned;
  if (Object.keys(owned).sort().join('\0') !== Object.keys(expected).sort().join('\0')) fail();
  for (const [name, h] of Object.entries(owned)) {
    if (!/^fragment-[a-f0-9]{64}\.md$/.test(name) || digest(h) !== expected[name]) fail('Invalid owned manifest');
  }
  return { value: v as unknown as Manifest, bytes, hash: hash(bytes) };
}
function operations(marker: Marker, tx: string, previous: Loaded | null, next: Loaded): Operation[] {
  const before = previous?.value.owned ?? {};
  const after = next.value.owned;
  const outputs: Operation[] = [];
  const history: Operation[] = [];
  const originalPaths = new Set([...Object.keys(previous?.value.index.sources ?? {}), ...Object.keys(next.value.index.sources)].map(p => p.toLowerCase()));
  for (const name of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const b = before[name] ?? null, a = after[name] ?? null;
    if (b === a) continue;
    // Never claim a source path as generated, even when only retiring it.
    const target = `${marker.outputFolder}/${name}`;
    if (originalPaths.has(target.toLowerCase())) fail('A generated target is an original source');
    const i = outputs.length;
    outputs.push({ target, before: b, after: a, backup: b ? `backup-${i}.bin` : null, stage: a ? `stage-${i}.bin` : null });
    if (b) history.push({ target: `${marker.outputFolder}/.third-brain/history/${tx}/${name}.bak`, before: null, after: b, backup: null, stage: `backup-${i}.bin` });
  }
  return [...history, ...outputs, {
    target: `${marker.outputFolder}/.third-brain/state.json`, before: previous?.hash ?? null,
    after: next.hash, backup: previous ? 'previous.json' : null, stage: 'next.json',
  }];
}
function aborted(signal?: AbortSignal): void {
  if (signal?.aborted) { const e = new Error('Store operation cancelled'); e.name = 'AbortError'; throw e; }
}
function missing(error: unknown): boolean { return (error as NodeJS.ErrnoException)?.code === 'ENOENT'; }

/** A desktop-only, hash-owned filesystem store. It never scans a folder into ownership. */
export class OwnedStore implements StorePort {
  private readonly root: string;
  private readonly folder: string;
  private readonly reserved: string;
  private readonly writerKey: string;
  private readonly verification = new AsyncLocalStorage<{ active: boolean; paths: Set<string> }>();
  constructor(vaultRoot: string, outputFolder: string, private readonly hooks: StoreTestHooks = {}) {
    if (typeof vaultRoot !== 'string' || !path.isAbsolute(vaultRoot)) fail('Vault root must be absolute');
    this.root = path.resolve(vaultRoot);
    this.folder = relative(outputFolder);
    if (this.folder.split('/').some(s => s.startsWith('.') || /^\.third-brain$/i.test(s))) fail('Reserved output folder');
    this.reserved = `${this.folder}/.third-brain`;
    this.writerKey = process.platform === 'win32' ? this.root.toLowerCase() : this.root;
  }
  private async event(phase: StoreIOEvent['phase'], target?: string): Promise<void> { await this.hooks.io?.({ phase, target }); }
  private async verify(callback: (() => Promise<void>) | undefined, paths: Set<string>): Promise<void> {
    if (!callback) return;
    const scope = { active: true, paths };
    // Source CAS may enumerate sources using managedSourcePaths(). Permit only
    // this async-scoped read, not an overlapping writer or an unrelated reader.
    await this.verification.run(scope, async () => {
      try { await callback(); } finally { scope.active = false; }
    });
  }
  private async rootGuard(): Promise<void> {
    let current = this.root;
    while (true) {
      const st = await fs.lstat(current);
      if (st.isSymbolicLink() || !st.isDirectory()) fail('Symlink or invalid vault root');
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  private async guard(rel: string, allowLinkedWork = false): Promise<string> {
    relative(rel);
    await this.rootGuard();
    const parts = rel.split('/');
    let current = this.root;
    let absent = false;
    for (let i = 0; i < parts.length; i++) {
      current = path.join(current, parts[i]);
      if (absent) continue;
      try {
        const st = await fs.lstat(current);
        if (st.isSymbolicLink() || (i < parts.length - 1 && !st.isDirectory()) ||
            (i === parts.length - 1 && !st.isDirectory() && (!st.isFile() || (st.nlink !== 1 && !(allowLinkedWork && st.nlink === 2))))) fail('Unsafe filesystem target');
      } catch (error) { if (!missing(error)) throw error; absent = true; }
    }
    return current;
  }
  private async mkdir(rel: string): Promise<void> {
    const parts = relative(rel).split('/');
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join('/');
      const absolute = await this.guard(p);
      try { await fs.mkdir(absolute); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      const st = await fs.lstat(await this.guard(p));
      if (!st.isDirectory()) fail();
    }
  }
  private async read(rel: string, max = STATE_LIMIT, allowLinkedWork = false): Promise<Buffer | null> {
    const absolute = await this.guard(rel, allowLinkedWork);
    let handle: Awaited<ReturnType<typeof fs.open>>;
    try { handle = await fs.open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); }
    catch (error) { if (missing(error)) return null; throw error; }
    try {
      const st = await handle.stat();
      const live = await fs.lstat(await this.guard(rel, allowLinkedWork));
      if (!st.isFile() || (st.nlink !== 1 && !(allowLinkedWork && st.nlink === 2)) || st.size > max || live.ino !== st.ino || live.dev !== st.dev) fail('Unsafe store file');
      // Read a bounded amount even if an external writer grows the file.
      const buffer = Buffer.alloc(Math.min(max + 1, st.size + 1));
      let length = 0;
      while (length < buffer.length) {
        const r = await handle.read(buffer, length, buffer.length - length, length);
        if (!r.bytesRead) break;
        length += r.bytesRead;
      }
      const end = await handle.stat();
      if (length > max || end.size !== st.size || end.mtimeMs !== st.mtimeMs || length !== st.size) fail('Store file changed while reading');
      await this.guard(rel, allowLinkedWork);
      return buffer.subarray(0, length);
    } finally { await handle.close(); }
  }
  private async syncDir(rel: string): Promise<void> {
    // Windows does not support opening directories for fsync. File fsync and
    // same-volume atomic rename are used there; power-loss durability is limited.
    const absolute = await this.guard(rel);
    if (process.platform === 'win32') return;
    const handle = await fs.open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try { await handle.sync(); } finally { await handle.close(); }
  }
  private async exclusive(rel: string, bytes: Buffer): Promise<void> {
    await this.mkdir(path.posix.dirname(rel));
    const absolute = await this.guard(rel);
    const handle = await fs.open(absolute, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    const actual = await this.read(rel);
    if (!actual || hash(actual) !== hash(bytes)) fail('Store write verification failed');
    await this.syncDir(path.posix.dirname(rel));
  }
  private async remove(rel: string, expected: string): Promise<void> {
    const data = await this.read(rel);
    if (!data) return;
    if (hash(data) !== expected) fail('Protected file conflict');
    await fs.unlink(await this.guard(rel));
    await this.syncDir(path.posix.dirname(rel));
  }
  /** Best-effort, hash-owned cleanup. The durable authenticated inventory is
   * written before staging, and remains until every owned artifact is gone.
   * Legacy stores have no key: only a live/validated journal can prove cleanup;
   * their unverifiable orphan directories are intentionally preserved. */
  private async discardTransaction(marker: Marker, tx: string, proven?: Record<string, string>): Promise<void> {
    if (!TOKEN.test(tx)) return;
    const dir = `${this.reserved}/transactions/${tx}`;
    try {
      let artifacts = proven;
      let ownershipBytes: Buffer | null = null;
      if (marker.stagingKey) {
        ownershipBytes = await this.read(`${dir}/ownership.json`);
        if (!ownershipBytes) return;
        const v = keys(parse(ownershipBytes, STATE_LIMIT, 90005), ['schema', 'owner', 'storeId', 'outputFolder', 'transaction', 'artifacts', 'authentication']);
        if (v.schema !== 1 || v.owner !== OWNER || v.storeId !== marker.storeId || v.outputFolder !== this.folder || v.transaction !== tx) return;
        const claimed = record(v.artifacts);
        if (Object.keys(claimed).length > 90005 || !own(claimed, 'next.json')) return;
        for (const [name, expected] of Object.entries(claimed)) {
          if (!/^(?:previous\.json|next\.json|(?:backup|stage)-\d+\.bin)$/.test(name) || name.length > 64) return;
          digest(expected);
        }
        const authentication = digest(v.authentication);
        const expected = authenticateStaging(marker, tx, claimed as Record<string, string>);
        if (!timingSafeEqual(Buffer.from(authentication, 'hex'), Buffer.from(expected, 'hex'))) return;
        if (proven && (Object.keys(proven).length !== Object.keys(claimed).length || Object.entries(proven).some(([name, h]) => claimed[name] !== h))) return;
        artifacts = claimed as Record<string, string>;
      }
      if (!artifacts) return;
      let names: string[];
      try { names = await fs.readdir(await this.guard(dir)); } catch (error) { if (missing(error)) return; throw error; }
      for (const name of names) {
        if (!own(artifacts, name)) continue;
        try { await this.remove(`${dir}/${name}`, artifacts[name]); } catch { /* preserve edited/unsafe artifacts */ }
      }
      names = await fs.readdir(await this.guard(dir));
      if (ownershipBytes && names.length === 1 && names[0] === 'ownership.json') await this.remove(`${dir}/ownership.json`, hash(ownershipBytes));
      try { await fs.rmdir(await this.guard(dir)); } catch { /* an unrecognised remnant keeps the directory */ }
      await this.syncDir(`${this.reserved}/transactions`);
    } catch { /* cleanup is best effort */ }
  }
  /** A crash may outlive its journal. Only authenticated, hash-matching artifacts
   * can be pruned on the next locked run; all unverifiable orphans stay intact. */
  private async sweepTransactions(marker: Marker): Promise<void> {
    try {
      let names: string[];
      try { names = await fs.readdir(await this.guard(`${this.reserved}/transactions`)); } catch (error) { if (missing(error)) return; throw error; }
      for (const name of names) if (TOKEN.test(name)) await this.discardTransaction(marker, name);
    } catch { /* best effort */ }
  }
  private async getMarker(create: boolean): Promise<Marker | null> {
    await this.rootGuard();
    const metadata = await this.guard(this.reserved);
    try {
      const st = await fs.lstat(metadata);
      if (!st.isDirectory()) fail();
    } catch (error) {
      if (!missing(error)) throw error;
      if (!create) return null;
      await this.mkdir(this.folder);
      // Never adopt an existing .third-brain directory, even an empty one.
      await fs.mkdir(await this.guard(this.reserved));
      const marker: Marker = { schema: 1, owner: OWNER, storeId: randomBytes(16).toString('hex'), outputFolder: this.folder,
        stagingKey: randomBytes(32).toString('hex') };
      await this.exclusive(`${this.reserved}/marker.json`, Buffer.from(JSON.stringify(marker)));
    }
    const bytes = await this.read(`${this.reserved}/marker.json`, 8192);
    if (!bytes) fail('Reserved store directory has no ownership marker');
    const parsed = record(parse(bytes, 8192));
    const m = keys(parsed, ['schema', 'owner', 'storeId', 'outputFolder', ...(own(parsed, 'stagingKey') ? ['stagingKey'] : [])]);
    if (m.schema !== 1 || m.owner !== OWNER || typeof m.storeId !== 'string' || !TOKEN.test(m.storeId) || m.outputFolder !== this.folder) fail('Unknown store marker');
    if (own(m, 'stagingKey')) digest(m.stagingKey);
    return m as unknown as Marker;
  }
  private async locked<T>(create: boolean, fn: (marker: Marker | null) => Promise<T>): Promise<T> {
    if (writers.has(this.writerKey)) fail('Another store operation is in progress');
    writers.add(this.writerKey);
    let lockBytes: Buffer | undefined;
    let lockRel: string | undefined;
    try {
      const marker = await this.getMarker(create);
      if (!marker) return await fn(null);
      lockRel = `${this.reserved}/write.lock`;
      const existing = await this.read(lockRel, 8192);
      if (existing) {
        const lock = keys(parse(existing, 8192), ['schema', 'owner', 'storeId', 'pid', 'nonce']);
        if (lock.schema !== 1 || lock.owner !== OWNER || lock.storeId !== marker.storeId ||
            !Number.isSafeInteger(lock.pid) || (lock.pid as number) <= 0 || typeof lock.nonce !== 'string' || !TOKEN.test(lock.nonce)) fail('Invalid writer lock');
        let alive = true;
        try { process.kill(lock.pid as number, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false; }
        if (alive) fail('Another store writer is active');
        await this.remove(lockRel, hash(existing));
      }
      lockBytes = Buffer.from(JSON.stringify({ schema: 1, owner: OWNER, storeId: marker.storeId, pid: process.pid, nonce: randomBytes(16).toString('hex') }));
      await this.exclusive(lockRel, lockBytes);
      return await fn(marker);
    } finally {
      try { if (lockBytes && lockRel) await this.remove(lockRel, hash(lockBytes)); }
      finally { writers.delete(this.writerKey); }
    }
  }
  private async getState(marker: Marker, checkFiles = true): Promise<Loaded | null> {
    const data = await this.read(`${this.reserved}/state.json`);
    if (!data) return null;
    const state = manifest(data, marker);
    if (checkFiles) {
      for (const [name, expected] of Object.entries(state.value.owned)) {
        const data = await this.read(`${this.folder}/${name}`, FILE_LIMIT);
        if (!data || hash(data) !== expected) fail('Owned generated file is missing or human-edited');
      }
    }
    return state;
  }
  private async getJournal(marker: Marker): Promise<{ journal: Journal; bytes: Buffer; previous: Loaded | null; next: Loaded } | null> {
    const bytes = await this.read(`${this.reserved}/journal.json`);
    if (!bytes) return null;
    const j = keys(parse(bytes), ['schema', 'owner', 'storeId', 'outputFolder', 'transaction', 'previous', 'next', 'operations']);
    if (j.schema !== 1 || j.owner !== OWNER || j.storeId !== marker.storeId || j.outputFolder !== this.folder ||
        typeof j.transaction !== 'string' || !TOKEN.test(j.transaction)) fail('Invalid recovery journal');
    if (j.previous !== null) digest(j.previous);
    digest(j.next);
    if (!Array.isArray(j.operations) || j.operations.length > 30001) fail();
    for (const value of j.operations) {
      const o = keys(value, ['target', 'before', 'after', 'backup', 'stage']);
      relative(o.target);
      for (const k of ['before', 'after']) if (o[k] !== null) digest(o[k]);
      for (const k of ['backup', 'stage']) if (o[k] !== null && (typeof o[k] !== 'string' || !/^(?:previous\.json|next\.json|(?:backup|stage)-\d+\.bin)$/.test(o[k] as string))) fail();
    }
    const journal = j as unknown as Journal;
    const txRoot = `${this.reserved}/transactions/${journal.transaction}`;
    const nextBytes = await this.read(`${txRoot}/next.json`);
    if (!nextBytes || hash(nextBytes) !== journal.next) fail('Recovery stage is missing or corrupt');
    const next = manifest(nextBytes, marker);
    let previous: Loaded | null = null;
    if (journal.previous) {
      const oldBytes = await this.read(`${txRoot}/previous.json`);
      if (!oldBytes || hash(oldBytes) !== journal.previous) fail('Recovery backup is missing or corrupt');
      previous = manifest(oldBytes, marker);
    }
    const expected = operations(marker, journal.transaction, previous, next);
    // Compare fields rather than trusting even a well-formed target in a journal.
    if (journal.operations.length !== expected.length) fail('Recovery operation set mismatch');
    for (let i = 0; i < expected.length; i++) {
      const o = journal.operations[i], e = expected[i];
      for (const k of ['target', 'before', 'after', 'backup', 'stage'] as const) if (o[k] !== e[k]) fail('Invalid recovery target');
    }
    // Validate every backup, stage, and target before making any recovery write.
    const linkedWork: { target: string; work: string; expected: string }[] = [];
    for (let ordinal = 0; ordinal < expected.length; ordinal++) {
      const o = expected[ordinal];
      await this.guard(o.target, true);
      if (o.backup) {
        const b = await this.read(`${txRoot}/${o.backup}`);
        if (!b || hash(b) !== o.before) fail('Recovery backup hash mismatch');
      }
      if (o.stage) {
        const b = await this.read(`${txRoot}/${o.stage}`);
        if (!b || hash(b) !== o.after) fail('Recovery stage hash mismatch');
      }
      const b = await this.read(o.target, STATE_LIMIT, true);
      const actual = b ? hash(b) : null;
      if (actual !== o.before && actual !== o.after) fail('Protected recovery target conflict');
      if (b) {
        const targetStat = await fs.lstat(await this.guard(o.target, true));
        if (targetStat.nlink === 2) {
          // A crash can occur between exclusive link installation and unlinking
          // its work name. Only this exact journal-derived inode pair is allowed;
          // arbitrary hardlinked targets remain protected and fail closed.
          let proven = false;
          for (const direction of ['forward', 'rollback'] as const) {
            const from = direction === 'forward' ? o.before : o.after;
            const to = direction === 'forward' ? o.after : o.before;
            if (from !== null || to !== actual) continue;
            const work = `${txRoot}/work-${direction}-${ordinal}.bin`;
            const workBytes = await this.read(work, STATE_LIMIT, true);
            if (!workBytes) continue;
            const workStat = await fs.lstat(await this.guard(work, true));
            if (workStat.nlink !== 2 || workStat.ino !== targetStat.ino || workStat.dev !== targetStat.dev || hash(workBytes) !== actual) fail('Unproven linked recovery target');
            linkedWork.push({ target: o.target, work, expected: actual! }); proven = true; break;
          }
          if (!proven) fail('Unproven linked recovery target');
        }
      }
    }
    // Unchanged owned files are not in the journal, but must also be protected.
    const affectedTargets = new Set(expected.map(o => o.target));
    for (const [name, h] of Object.entries(next.value.owned)) {
      if (affectedTargets.has(`${this.folder}/${name}`)) continue;
      const b = await this.read(`${this.folder}/${name}`, FILE_LIMIT);
      if (!b || hash(b) !== h) fail('Protected unchanged output conflict');
    }
    // Only after validating the entire plan may recovery resolve an interrupted
    // no-clobber link. Hash+inode checks are repeated at the unlink boundary.
    for (const pair of linkedWork) {
      const target = await this.read(pair.target, STATE_LIMIT, true), work = await this.read(pair.work, STATE_LIMIT, true);
      const a = await fs.lstat(await this.guard(pair.target, true)), b = await fs.lstat(await this.guard(pair.work, true));
      if (!target || !work || hash(target) !== pair.expected || hash(work) !== pair.expected || a.ino !== b.ino || a.dev !== b.dev || a.nlink !== 2 || b.nlink !== 2) fail('Linked work changed during recovery');
      await fs.unlink(await this.guard(pair.work, true));
      await this.syncDir(txRoot);
    }
    return { journal, bytes, previous, next };
  }
  private async apply(journal: Journal, operation: Operation, direction: 'forward' | 'rollback', ordinal: number, recovery = true): Promise<void> {
    await this.event(direction === 'forward' ? 'before-apply' : 'before-rollback', operation.target);
    const from = direction === 'forward' ? operation.before : operation.after;
    const to = direction === 'forward' ? operation.after : operation.before;
    const current = await this.read(operation.target);
    const currentHash = current ? hash(current) : null;
    if (currentHash === to) {
      if (!recovery && from !== to) fail('An unexpected target appeared during commit');
      return;
    }
    if (currentHash !== from) fail('Protected transaction target conflict');
    if (!to) { await this.remove(operation.target, from!); return; }
    const reference = direction === 'forward' ? operation.stage : operation.backup;
    if (!reference) fail();
    const txRoot = `${this.reserved}/transactions/${journal.transaction}`;
    const data = await this.read(`${txRoot}/${reference}`);
    if (!data || hash(data) !== to) fail('Transaction stage hash mismatch');
    await this.mkdir(path.posix.dirname(operation.target));
    const work = `${txRoot}/work-${direction}-${ordinal}.bin`;
    const leftover = await this.read(work);
    if (leftover) { if (hash(leftover) !== to) fail('Corrupt transaction work file'); }
    else await this.exclusive(work, data);
    // Last possible check before same-volume atomic replacement. Node has no
    // portable compare-and-rename primitive against hostile concurrent editors.
    const recheck = await this.read(operation.target);
    if ((recheck ? hash(recheck) : null) !== from) fail('Target changed during transaction');
    const target = await this.guard(operation.target), staged = await this.guard(work);
    if (from === null) {
      // link is exclusive/no-clobber; unlike rename it cannot overwrite a file
      // that appeared between the absence check and installation.
      await fs.link(staged, target);
      await this.event('after-link', operation.target);
      await fs.unlink(staged);
    } else {
      await fs.rename(staged, target);
    }
    await this.syncDir(path.posix.dirname(operation.target));
    const installed = await this.read(operation.target);
    if (!installed || hash(installed) !== to) fail('Transaction write verification failed');
    await this.event('after-apply', operation.target);
  }
  private async recoverLocked(marker: Marker): Promise<void> {
    const pending = await this.getJournal(marker);
    if (!pending) { await this.getState(marker); await this.sweepTransactions(marker); return; }
    const current = await this.read(`${this.reserved}/state.json`);
    const committed = current !== null && hash(current) === pending.journal.next;
    const ops = pending.journal.operations;
    // State is the last atomic commit point. An interrupted pre-commit revision
    // rolls back; a committed one finishes forward before the journal is removed.
    const order = committed ? ops.map((o, i) => ({ o, i })) : ops.map((o, i) => ({ o, i })).reverse();
    for (const { o, i } of order) await this.apply(pending.journal, o, committed ? 'forward' : 'rollback', i);
    await this.getState(marker);
    await this.event('before-finalize');
    await this.remove(`${this.reserved}/journal.json`, hash(pending.bytes));
    await this.event('after-finalize');
    await this.discardTransaction(marker, pending.journal.transaction, stagingArtifacts(pending.journal));
    await this.sweepTransactions(marker);
  }
  async load(): Promise<IndexState | null> {
    return await this.locked(false, async marker => {
      if (!marker) return null;
      await this.recoverLocked(marker);
      return (await this.getState(marker))?.value.index ?? null;
    });
  }
  async fragmentPath(id: string): Promise<string> {
    const index = await this.load();
    if (!index || !Object.prototype.hasOwnProperty.call(index.fragments, id)) fail('Fragment is not in the current owned layer');
    return `${this.folder}/${filename(id)}`;
  }
  async managedSourcePaths(): Promise<Set<string>> {
    const scope = this.verification.getStore();
    if (scope?.active) return new Set(scope.paths);
    return await this.locked(false, async marker => {
      if (!marker) return new Set<string>();
      await this.recoverLocked(marker);
      const state = await this.getState(marker);
      return new Set(Object.keys(state?.value.owned ?? {}).map(name => `${this.folder}/${name}`));
    });
  }
  async recover(): Promise<void> {
    await this.locked(false, async marker => { if (marker) await this.recoverLocked(marker); });
  }
  async commit(nextInput: IndexState, verifySources?: () => Promise<void>, signal?: AbortSignal): Promise<void> {
    aborted(signal);
    // Freeze caller-owned mutable objects before any async boundary.
    const nextBytes = Buffer.from(JSON.stringify(nextInput));
    const index = validateIndex(parse(nextBytes));
    // Validate source/target separation before even initializing reserved metadata.
    makeManifest(index, { schema: 1, owner: OWNER, storeId: '0'.repeat(32), outputFolder: this.folder });
    await this.locked(true, async marker => {
      if (!marker) fail();
      aborted(signal);
      await this.recoverLocked(marker);
      const previous = await this.getState(marker);
      const bytes = Buffer.from(JSON.stringify(makeManifest(index, marker)));
      const next = manifest(bytes, marker);
      const managed = new Set([...Object.keys(previous?.value.owned ?? {}), ...Object.keys(next.value.owned)].map(name => `${this.folder}/${name}`));
      if (previous && previous.bytes.equals(bytes)) {
        await this.verify(verifySources, managed); aborted(signal); return;
      }
      const tx = randomBytes(16).toString('hex');
      const txRoot = `${this.reserved}/transactions/${tx}`;
      const ops = operations(marker, tx, previous, next);
      // Check all affected targets before creating any revision artifact.
      for (const o of ops) {
        const b = await this.read(o.target);
        if ((b ? hash(b) : null) !== o.before) fail('Unowned or human-edited generated target');
      }
      const journal: Journal = { schema: 1, owner: OWNER, storeId: marker.storeId, outputFolder: this.folder, transaction: tx,
        previous: previous?.hash ?? null, next: next.hash, operations: ops };
      const artifacts = stagingArtifacts(journal);
      await this.mkdir(`${this.reserved}/transactions`);
      // Never adopt a pre-existing transaction directory, even on token collision.
      await fs.mkdir(await this.guard(txRoot));
      if (marker.stagingKey) {
        const ownership: StagingOwnership = { schema: 1, owner: OWNER, storeId: marker.storeId, outputFolder: this.folder,
          transaction: tx, artifacts, authentication: authenticateStaging(marker, tx, artifacts) };
        await this.exclusive(`${txRoot}/ownership.json`, Buffer.from(JSON.stringify(ownership)));
      }
      await this.exclusive(`${txRoot}/next.json`, bytes);
      if (previous) await this.exclusive(`${txRoot}/previous.json`, previous.bytes);
      const outputOps = ops.filter(o => o.target.startsWith(`${this.folder}/fragment-`));
      const fragmentsByPath = new Map(Object.values(index.fragments).map(f => [`${this.folder}/${filename(f.id)}`, f]));
      const network = buildFragmentNetwork(index);
      for (const o of outputOps) {
        aborted(signal);
        if (o.backup) {
          const b = await this.read(o.target, FILE_LIMIT);
          if (!b || hash(b) !== o.before) fail('Output changed before staging');
          await this.exclusive(`${txRoot}/${o.backup}`, b);
        }
        if (o.stage) {
          const f = fragmentsByPath.get(o.target);
          if (!f) fail();
          await this.exclusive(`${txRoot}/${o.stage}`, render(f, marker, index, network));
        }
      }
      await this.event('staged');
      aborted(signal);
      const journalBytes = Buffer.from(JSON.stringify(journal));
      await this.exclusive(`${this.reserved}/journal.json`, journalBytes);
      let switched = false;
      try {
        // Validate the complete durable plan, then source-CAS immediately before
        // applying it. No model processing or additional staging happens here.
        await this.getJournal(marker);
        aborted(signal); await this.verify(verifySources, managed); aborted(signal);
        for (let i = 0; i < ops.length; i++) {
          aborted(signal);
          if (i === ops.length - 1 && i > 0) {
            // Check the sources again immediately before the atomic state swap,
            // including edits which occurred while generated files were applied.
            await this.getJournal(marker);
            await this.verify(verifySources, managed); aborted(signal);
          }
          await this.apply(journal, ops[i], 'forward', i, false);
          if (i === ops.length - 1) switched = true;
        }
        await this.getState(marker);
        await this.event('before-finalize');
        await this.remove(`${this.reserved}/journal.json`, hash(journalBytes));
        await this.event('after-finalize');
        await this.discardTransaction(marker, tx, artifacts);
        await this.sweepTransactions(marker);
      } catch (error) {
        // The state swap may have happened even if an after-write hook failed.
        const current = await this.read(`${this.reserved}/state.json`, STATE_LIMIT, true);
        switched ||= current !== null && hash(current) === journal.next;
        if (switched) {
          // Do not claim success after an interrupted finalization; keep journal
          // for a subsequent validated forward recovery.
          throw new Error('Store commit finalized incompletely; recovery required', { cause: error });
        }
        try {
          await this.recoverLocked(marker);
        } catch (recoveryError) {
          throw new AggregateError([error, recoveryError], 'Store commit and rollback failed; recovery required');
        }
        throw error;
      }
    });
  }
}
