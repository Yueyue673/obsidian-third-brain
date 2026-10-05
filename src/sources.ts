import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { prepareSource } from './core/index';
import { textBlocks } from './core/sources';
import type { Evidence, Privacy, SourceSnapshot } from './core/types';
import type { Settings } from './settings';
export interface SourcePort {
  list(): Promise<SourceSnapshot[]>;
  read(relativePath: string): Promise<SourceSnapshot | null>;
  verify(snapshots: SourceSnapshot[]): Promise<void>;
}
export function hash(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
export function canonicalPath(value: string): string {
  if (value.includes('\\') || !value || value.startsWith('/') || /^[A-Za-z]:/.test(value) || /[\x00-\x1f]/.test(value) || value.split('/').some(x => !x || x === '.' || x === '..')) throw new Error('Invalid source path.');
  return value;
}
export class FileSources implements SourcePort {
  constructor(private readonly root: string, private readonly settings: () => Settings,
    private readonly managed: () => Promise<Set<string>>, private readonly paths?: () => Promise<string[]>) {}
  private async safePath(relative: string): Promise<string | null> {
    canonicalPath(relative);
    const root = path.resolve(this.root); let current = root;
    const rootStat = await fs.lstat(root);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('Unsafe source root.');
    for (const segment of relative.split('/')) {
      current = path.join(current, segment);
      try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Symbolic-link sources are not supported.'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    }
    return current;
  }
  async read(relative: string): Promise<SourceSnapshot | null> {
    const target = await this.safePath(relative); if (!target) return null;
    const stat = await fs.stat(target); if (!stat.isFile()) return null;
    if (stat.size > this.settings().maxFileBytes) throw new Error('A note exceeds the configured size limit. No partial index was saved.');
    const bytes = await fs.readFile(target); if (bytes.length > this.settings().maxFileBytes) throw new Error('A note exceeds the configured size limit.');
    let text: string;
    try {
      const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
      const body = encoding === 'utf-8' ? bytes : bytes.subarray(2);
      text = new TextDecoder(encoding, { fatal: true }).decode(body);
    } catch { throw new Error('A note has an unsupported or invalid text encoding.'); }
    return prepareSource(relative, text, hash(bytes), hash(relative).slice(0, 24));
  }
  private allowed(relative: string, managed: Set<string>): boolean {
    return /\.(md|canvas)$/i.test(relative) && !relative.split('/').some(x => x.startsWith('.')) && !managed.has(relative) && !this.settings().excludes.some(x => relative === x || relative.startsWith(`${x}/`));
  }
  private async availablePaths(): Promise<string[]> {
    if (this.paths) return (await this.paths()).map(canonicalPath).sort();
    const result: string[] = [];
    const walk = async (rel: string): Promise<void> => {
      const target = rel ? await this.safePath(rel) : path.resolve(this.root); if (!target) return;
      for (const entry of await fs.readdir(target, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const child = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) throw new Error('Symbolic-link sources are not supported.');
        if (entry.isDirectory()) await walk(child); else if (entry.isFile()) result.push(child);
      }
    };
    await walk(''); return result.sort();
  }
  async list(): Promise<SourceSnapshot[]> {
    const managed = await this.managed(); const names = (await this.availablePaths()).filter(x => this.allowed(x, managed));
    if (names.length > this.settings().maxNotes) throw new Error('The vault exceeds the configured note limit. No partial index was saved.');
    const snapshots: SourceSnapshot[] = []; let totalBytes = 0;
    for (const name of names) { const s = await this.read(name); if (s) { totalBytes += Buffer.byteLength(s.text); if (totalBytes > 100 * 1024 * 1024) throw new Error('This batch exceeds 100 MiB. Add source exclusions before retrying.'); snapshots.push(s); } }
    return snapshots;
  }
  async verify(snapshots: SourceSnapshot[]): Promise<void> {
    const current = await this.list();
    const expected = new Map(snapshots.map(x => [x.path, x.hash]));
    if (current.length !== snapshots.length || current.some(x => expected.get(x.path) !== x.hash)) throw new Error('Source notes changed during processing. The previous index is preserved.');
  }
}
export function contextPrivacy(original: SourceSnapshot, fullDraft: string): Privacy {
  const draft = prepareSource(original.path, fullDraft, hash(fullDraft), original.id);
  return original.privacy === 'private' || draft.privacy === 'private' ? 'private' : original.privacy === 'local' || draft.privacy === 'local' ? 'local' : 'normal';
}
export async function currentEvidence(evidence: Evidence[], sources: SourcePort): Promise<Evidence[]> {
  const result: Evidence[] = []; const cache = new Map<string, SourceSnapshot | null>();
  for (const item of evidence) {
    if (!cache.has(item.relativePath)) cache.set(item.relativePath, await sources.read(item.relativePath));
    const live = cache.get(item.relativePath);
    if (!live || live.hash !== item.sourceHash || live.id !== item.sourceId || !item.quote || !Number.isSafeInteger(item.start) || !Number.isSafeInteger(item.end)) continue;
    const contiguous = item.start >= 0 && item.end > item.start && live.text.slice(item.start, item.end) === item.quote;
    const decodedCanvas = live.format === 'canvas' && item.start === -1 && item.end === -1 && textBlocks(live).some(block => block.text.includes(item.quote));
    if (contiguous || decodedCanvas) result.push(item);
  }
  return result;
}
