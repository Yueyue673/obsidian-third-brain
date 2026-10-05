import type { Facets, Privacy, SourceSnapshot } from './types';
import { emptyFacets } from './types';
import { CoreError, FACET_KEYS, boundedString, canonicalFacets, isPrivacy, parseCompleteJson, plainObject, relativePath, restrictive, unionFacets } from './util';
import { mapped, safeVocabulary, type MappedText } from './privacy';

export interface TextBlock extends MappedText { heading: string; }
function frontmatter(raw: string): { body: number; metadata: string } {
  const first = /^(?:\ufeff)?---[ \t]*(?:\r\n|\n|\r)/u.exec(raw);
  if (!first) return { body: 0, metadata: '' };
  const end = /^(?:---|\.\.\.)[ \t]*(?:\r\n|\n|\r|$)/gmu;
  end.lastIndex = first[0].length;
  const close = end.exec(raw);
  // Unclosed frontmatter is not promoted into model-readable prose.
  if (!close) return { body: raw.length, metadata: raw.slice(first[0].length) };
  return { body: close.index + close[0].length, metadata: raw.slice(first[0].length, close.index) };
}
function metadataPrivacy(text: string): Privacy {
  let policy: Privacy = 'normal';
  for (const hit of text.matchAll(/(?:^|[\s{,])["']?(?:privacy|sensitivity)["']?\s*:\s*([^\r\n},]*)/gimu)) {
    const value = hit[1].replace(/\s+#.*$/u, '').replace(/["'\[\]]/gu, '').trim().toLowerCase();
    policy = restrictive(policy, value === 'normal' || value === 'public' ? 'normal' : value === 'local' ? 'local' : 'private');
  }
  if (/^\s*(?:private|local-only|local_only)\s*:\s*(?:true|yes)\b/gimu.test(text)) policy = 'private';
  return policy;
}
function canvasObject(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try { parsed = parseCompleteJson(raw.replace(/^\ufeff/u, '')); } catch { throw new CoreError('Invalid Canvas JSON'); }
  if (!plainObject(parsed) || !Array.isArray(parsed.nodes)) throw new CoreError('Invalid Canvas document');
  return parsed;
}
function canvasPrivacy(object: unknown, depth = 0): Privacy {
  if (depth > 48) throw new CoreError('Canvas metadata nesting too deep');
  let result: Privacy = 'normal';
  if (Array.isArray(object)) { for (const item of object) result = restrictive(result, canvasPrivacy(item, depth + 1)); }
  else if (plainObject(object)) {
    for (const [key, value] of Object.entries(object)) {
      const normalized = key.toLowerCase();
      if (normalized === 'privacy' || normalized === 'sensitivity') result = restrictive(result, value === 'normal' || value === 'public' ? 'normal' : value === 'local' ? 'local' : 'private');
      else if ((normalized === 'private' || normalized === 'local-only') && value === true) result = 'private';
      if (normalized === 'text' && typeof value === 'string') result = restrictive(result, metadataPrivacy(frontmatter(value).metadata));
      if (value && typeof value === 'object') result = restrictive(result, canvasPrivacy(value, depth + 1));
    }
  }
  return result;
}
export function prepareSource(path: string, raw: string, hash: string, id: string): SourceSnapshot {
  relativePath(path); boundedString(hash, 256); boundedString(id, 256);
  if (typeof raw !== 'string') throw new CoreError('Invalid source text');
  const extension = path.toLowerCase();
  if (!extension.endsWith('.md') && !extension.endsWith('.canvas')) throw new CoreError('Unsupported source format');
  const format = extension.endsWith('.canvas') ? 'canvas' : 'markdown';
  const privacy = format === 'canvas' ? canvasPrivacy(canvasObject(raw)) : metadataPrivacy(frontmatter(raw).metadata);
  return Object.freeze({ id, path, text: raw, hash, privacy, format });
}
/** Re-read raw policy: manually constructed snapshots cannot downgrade privacy. */
export function checkedSource(snapshot: SourceSnapshot): SourceSnapshot {
  if (!snapshot || !isPrivacy(snapshot.privacy)) throw new CoreError('Invalid source snapshot');
  const checked = prepareSource(snapshot.path, snapshot.text, snapshot.hash, snapshot.id);
  if (snapshot.format !== checked.format) throw new CoreError('Source format mismatch');
  return Object.freeze({ ...checked, privacy: restrictive(checked.privacy, snapshot.privacy) });
}
function valueList(text: string): string[] {
  const clean = text.trim().replace(/\s+#.*$/u, '');
  if (clean.startsWith('[') && clean.endsWith(']')) return clean.slice(1, -1).split(',').map(item => item.trim().replace(/^["']|["']$/gu, '')).filter(Boolean);
  return clean.split(/[,，]/u).map(item => item.trim().replace(/^["']|["']$/gu, '')).filter(Boolean);
}
function metadataFacets(metadata: string): Facets {
  const result = emptyFacets(); let current: keyof Facets | undefined;
  for (const line of metadata.split(/\r\n|\n|\r/u)) {
    const pair = /^\s*(tags|topics|concepts|mechanisms|atmosphere)\s*:\s*(.*?)\s*$/iu.exec(line);
    if (pair) { current = pair[1].toLowerCase() === 'tags' ? 'topics' : pair[1].toLowerCase() as keyof Facets; result[current].push(...valueList(pair[2])); continue; }
    const item = /^\s+-\s+(.+)$/u.exec(line);
    if (item && current) result[current].push(...valueList(item[1])); else if (line.trim() && !/^\s*#/u.test(line)) current = undefined;
  }
  for (const key of FACET_KEYS) result[key] = result[key].filter(v => v.length <= 120).slice(0,256);
  return safeVocabulary(canonicalFacets(result));
}
export function sourceFacets(snapshot: SourceSnapshot): Facets {
  if (snapshot.format === 'canvas') {
    const nodes = canvasObject(snapshot.text).nodes as unknown[];
    const result = nodes.filter(plainObject).filter(node => node.type === 'text' && typeof node.text === 'string').map(node => metadataFacets(frontmatter(node.text as string).metadata));
    return unionFacets(...result);
  }
  const result = metadataFacets(frontmatter(snapshot.text).metadata);
  const body = textBlocks(snapshot).map(block => block.text).join('\n');
  for (const match of body.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_-][\p{L}\p{N}_/-]*)/gu)) if (!match[1].includes('/')) result.topics.push(match[1]);
  return safeVocabulary({ ...result, topics: result.topics.slice(0,256) });
}
function markdownBlocks(raw: string, base: number, excalidraw = false): TextBlock[] {
  const meta = frontmatter(raw), blocks: TextBlock[] = [];
  let heading = '', start = -1, end = -1, fence = '', fenceLength = 0, hidden = '', drawing = false;
  const flush = () => {
    if (start >= 0 && end > start) { const text = raw.slice(start, end); const trimStart = text.length - text.trimStart().length; const trimmed = text.trim(); if (trimmed) blocks.push({ ...mapped(trimmed, base < 0 ? -1 : base + start + trimStart), heading }); }
    start = end = -1;
  };
  const linePattern = /[^\r\n]+(?:\r\n|\r|\n|$)|(?:\r\n|\r|\n)/gu;
  for (const hit of raw.slice(meta.body).matchAll(linePattern)) {
    const offset = meta.body + hit.index, line = hit[0].replace(/[\r\n]+$/u, '');
    const code = /^\s*(`{3,}|~{3,})/u.exec(line);
    if (code) {
      flush();
      if (!fence) { fence=code[1][0]; fenceLength=code[1].length; }
      else if (fence === code[1][0] && code[1].length >= fenceLength && !line.slice(line.indexOf(code[1]) + code[1].length).trim()) { fence=''; fenceLength=0; }
      continue;
    }
    if (fence) continue;
    if (hidden) { if (line.includes(hidden)) hidden = ''; continue; }
    if (line.trim().startsWith('<!--')) { flush(); if (!line.includes('-->')) hidden = '-->'; continue; }
    if (line.trim().startsWith('%%')) { flush(); if (line.trim() === '%%' || !line.trim().slice(2).includes('%%')) hidden = '%%'; continue; }
    const title = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/u.exec(line);
    if (title) { flush(); heading = title[1].replace(/\s+\^[a-z0-9-]+$/iu, '').slice(0,160); drawing = excalidraw && /^(?:drawing|绘图)$/iu.test(heading); continue; }
    if (drawing) continue;
    if (!line.trim() || /^\s*(?:[-*_]\s*){3,}$/u.test(line) || /^\s*\^[a-z0-9-]+\s*$/iu.test(line)) { flush(); continue; }
    if (/^\s*(?:[-*+]\s+|\d+[.)]\s+)/u.test(line) && start >= 0) flush();
    if (start < 0) start = offset;
    end = offset + line.length;
  }
  flush(); return blocks;
}
export function textBlocks(snapshot: SourceSnapshot): TextBlock[] {
  if (snapshot.format === 'markdown') return markdownBlocks(snapshot.text, 0, /(?:^|\n)\s*excalidraw-plugin\s*:/iu.test(frontmatter(snapshot.text).metadata) || /\.excalidraw\.md$/iu.test(snapshot.path));
  const nodes = canvasObject(snapshot.text).nodes as unknown[], blocks: TextBlock[] = [];
  for (const node of nodes) {
    if (!plainObject(node) || node.type !== 'text' || typeof node.text !== 'string') continue;
    const text = node.text;
    // Escaped Canvas strings have no contiguous original-byte span. Never fake one.
    const literal = JSON.stringify(text), rawPosition = literal.includes('\\') ? -1 : snapshot.text.indexOf(literal);
    blocks.push(...markdownBlocks(text, rawPosition < 0 ? -1 : rawPosition + 1));
  }
  return blocks;
}
export function splitBlock(block: TextBlock, limit: number): TextBlock[] {
  const parts: TextBlock[] = []; let start = 0;
  while (start < block.text.length) {
    let end = Math.min(start + limit, block.text.length);
    if (end < block.text.length) {
      const window = block.text.slice(start, end), boundaries = [...window.matchAll(/[。！？.!?;；\n]\s*|\s+/gu)];
      const boundary = boundaries.filter(match => match.index + match[0].length >= limit / 2).at(-1);
      if (boundary) end = start + boundary.index + boundary[0].length;
      // Do not bisect a UTF-16 surrogate pair.
      if (/[\uD800-\uDBFF]/u.test(block.text[end-1]) && /[\uDC00-\uDFFF]/u.test(block.text[end])) end--;
    }
    const piece = block.text.slice(start, end), leading = piece.length - piece.trimStart().length, trailing = piece.trimEnd().length;
    if (piece.trim()) parts.push({ text: piece.slice(leading, trailing), offsets: block.offsets.slice(start + leading, start + trailing), heading: block.heading });
    start = end;
  }
  return parts;
}
export function meaningful(text: string): boolean {
  const clean = text.replace(/\[REDACTED\]/gu, '').replace(/^[\s>*+\-\[\]xX0-9.)]+/u, '').trim();
  if (!clean || /^(?:todo|tbd|test|untitled|hello|hi|ok|note|待办|待补充|测试|你好|无标题|嗯|好的|记一下|随便记记)[.!！。?？]*$/iu.test(clean)) return false;
  if ((clean.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < 3) return false;
  const words = clean.match(/[a-z]{2,}/giu) ?? [];
  return /[\p{Script=Han}]/u.test(clean) || words.length >= 2 || /\d.*[=:+-].*\d/u.test(clean);
}
