import type { Facets, Privacy, SourceSnapshot } from './types';
import { emptyFacets } from './types';
import { CoreError, FACET_KEYS, boundedString, canonicalFacets, isPrivacy, parseCompleteJson, plainObject, relativePath, restrictive, unionFacets } from './util';
import { mapped, safeVocabulary, type MappedText } from './privacy';
import { bindSourceDiagnostic } from './source-diagnostics';

export interface TextBlock extends MappedText { heading: string; localList?: boolean; localHeadings?: MappedText[]; localLeadIn?: MappedText; }
/** Complete local structural context is bounded, never truncated or re-split. */
export const LOCAL_EXCERPT_CONTEXT_LIMIT = 16384;
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
function markdownBlocks(raw: string, base: number, excalidraw = false, local = false, sourcePath = '', includeHeadings = false): TextBlock[] {
  const meta = frontmatter(raw), blocks: TextBlock[] = [];
  const ancestors: { depth: number; block: MappedText }[] = [];
  let heading = '', start = -1, end = -1, fence = '', fenceLength = 0, hidden = '', drawing = false;
  let listIndent = -1, contentIndent = -1, blockedIndent = -1, blockedContentIndent = -1, blank = false, rootIsExample = false;
  let introduction: { block: TextBlock; end: number } | undefined, listLeadIn: MappedText | undefined;
  const columns = (text: string) => { let width = 0; for (const char of text) width += char === '\t' ? 4 - width % 4 : 1; return width; };
  const clearBlocked = () => { blockedIndent = blockedContentIndent = -1; };
  const barrier = () => { if (local && listIndent >= 0) { blockedIndent = listIndent; blockedContentIndent = contentIndent; } flush(); introduction = undefined; listLeadIn = undefined; };
  const flush = () => {
    const headingLength = ancestors.length ? ancestors.reduce((size, item) => size + item.block.text.length + 1, 1) : 0;
    const introductionLength = listIndent >= 0 && listLeadIn ? listLeadIn.text.length + 2 : 0;
    if (local && start >= 0 && end - start + headingLength + introductionLength > LOCAL_EXCERPT_CONTEXT_LIMIT) {
      const error = new CoreError(listIndent >= 0 ? 'Local list context exceeds 16384 characters; no partial index was saved.' : 'Local paragraph context exceeds 16384 characters; no partial index was saved.');
      bindSourceDiagnostic(error,{ relativePath:sourcePath,stage:'analysis',reason:'local-context-size-limit' });
      throw error;
    }
    if (start >= 0 && end > start) {
      const text = raw.slice(start, end), trimStart = text.length - text.trimStart().length, trimmed = text.trim();
      if (trimmed) {
        const block: TextBlock = { ...mapped(trimmed, base < 0 ? -1 : base + start + trimStart), heading, ...(local && listIndent >= 0 ? { localList:true, ...(listLeadIn ? { localLeadIn:listLeadIn } : {}) } : {}), ...(local && ancestors.length ? { localHeadings:ancestors.map(item => item.block) } : {}) };
        blocks.push(block);
        if (local && listIndent < 0) introduction = /[:：]$/u.test(trimmed) ? { block,end } : undefined;
      }
    }
    start = end = -1; listIndent = contentIndent = -1; rootIsExample = false;
  };
  const linePattern = /[^\r\n]+(?:\r\n|\r|\n|$)|(?:\r\n|\r|\n)/gu;
  for (const hit of raw.slice(meta.body).matchAll(linePattern)) {
    const offset = meta.body + hit.index, line = hit[0].replace(/[\r\n]+$/u, '');
    const code = /^\s*(`{3,}|~{3,})/u.exec(line);
    if (code) {
      barrier();
      if (!fence) { fence=code[1][0]; fenceLength=code[1].length; }
      else if (fence === code[1][0] && code[1].length >= fenceLength && !line.slice(line.indexOf(code[1]) + code[1].length).trim()) { fence=''; fenceLength=0; }
      continue;
    }
    if (fence) continue;
    if (hidden) { if (line.includes(hidden)) hidden = ''; continue; }
    if (line.trim().startsWith('<!--')) { barrier(); if (!line.includes('-->')) hidden = '-->'; continue; }
    if (line.trim().startsWith('%%')) { barrier(); if (line.trim() === '%%' || !line.trim().slice(2).includes('%%')) hidden = '%%'; continue; }
    const title = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/u.exec(line);
    if (title) {
      flush(); clearBlocked(); introduction = undefined; listLeadIn = undefined;
      heading = title[1].replace(/\s+\^[a-z0-9-]+$/iu, '').slice(0,160);
      drawing = excalidraw && /^(?:drawing|绘图)$/iu.test(heading);
      if (local || includeHeadings) {
        const text = line.trim(), leading = line.length - line.trimStart().length;
        const block = mapped(text,base < 0 ? -1 : base + offset + leading);
        if (local) {
          // A neutral child title cannot erase a restrictive ancestor. Keep the
          // full authored lines, not the capped display title or an inference.
          if (line.includes('<!--') || line.includes('%%')) throw new CoreError('Local heading context intersects hidden content; no partial index was saved.');
          const depth = /^#+/u.exec(text)![0].length;
          while (ancestors.length && ancestors.at(-1)!.depth >= depth) ancestors.pop();
          ancestors.push({ depth,block });
        }
        if (includeHeadings && !drawing) blocks.push({ ...block,heading });
      }
      continue;
    }
    if (drawing) continue;
    const item = /^(\s*)(?:[-*+]\s+|\d+[.)]\s+)/u.exec(line);
    const indent = columns(item?.[1] ?? /^\s*/u.exec(line)![0]);
    // Unrelated prose after a blank line is outside the previous list. Keep its
    // existing parsing policy, including literal markup examples in inline code.
    if (local && !item && line.trim()) {
      if (listIndent >= 0 && blank && indent < contentIndent) { flush(); clearBlocked(); listLeadIn = undefined; }
      if (blockedIndent >= 0 && indent < blockedContentIndent) clearBlocked();
    }
    // Check the first parent item too: skipping it would expose bare children.
    // Outside list groups this change must not silently discard ordinary prose.
    if (local && (listIndent >= 0 || item) && (line.includes('<!--') || line.includes('%%'))) {
      throw new CoreError('Local list context intersects hidden content; no partial index was saved.');
    }
    if (!line.trim()) { blank = true; if (!(local && listIndent >= 0)) flush(); continue; }
    if (/^\s*(?:[-*_]\s*){3,}$/u.test(line) || /^\s*\^[a-z0-9-]+\s*$/iu.test(line)) { barrier(); continue; }
    if (local) {
      if (item) {
        if (blockedIndent >= 0 && indent > blockedIndent) throw new CoreError('Local list context crosses a structural boundary; no partial index was saved.');
        if (listIndent >= 0 && indent > listIndent && indent < contentIndent) {
          if (!blank) throw new CoreError('Local list context has ambiguous indentation; no partial index was saved.');
          flush();
        }
        clearBlocked();
        // An explicit following example label is context for the preceding root,
        // not a new unqualified idea. Keep its exact text and descendants too.
        // Do not infer labels inside prose or attach a leading standalone label.
        const example = /^(?:examples?|counterexamples?|例子|示例|反例)[ \t]*[:：]/iu.test(line.slice(item[0].length));
        if (listIndent >= 0 && indent === listIndent && !rootIsExample && example) {
          contentIndent = columns(item[0]);
        } else if (listIndent < 0 || indent <= listIndent) {
          const continuing = listIndent >= 0;
          flush();
          if (!continuing) {
            listLeadIn = undefined;
            // A literal terminal colon explicitly introduces the adjacent list.
            // Do not infer semantic dependence from arbitrary previous prose.
            if (introduction && blocks.at(-1) === introduction.block && !raw.slice(introduction.end,offset).trim()) {
              if (introduction.block.text.includes('<!--') || introduction.block.text.includes('%%')) throw new CoreError('Local list context intersects hidden content; no partial index was saved.');
              listLeadIn = introduction.block;
              blocks.pop(); // The introduction belongs to its actions, not an orphan excerpt.
            }
            introduction = undefined;
          }
          listIndent = indent; contentIndent = columns(item[0]); rootIsExample = example;
        }
      }
    } else if (item && start >= 0) flush();
    blank = false;
    if (start < 0) start = offset;
    end = offset + line.length;
  }
  flush(); return blocks;
}
function sourceBlocks(snapshot: SourceSnapshot, local = false, includeHeadings = false): TextBlock[] {
  if (snapshot.format === 'markdown') return markdownBlocks(snapshot.text, 0, /(?:^|\n)\s*excalidraw-plugin\s*:/iu.test(frontmatter(snapshot.text).metadata) || /\.excalidraw\.md$/iu.test(snapshot.path), local, snapshot.path, includeHeadings);
  const nodes = canvasObject(snapshot.text).nodes as unknown[], blocks: TextBlock[] = [];
  for (const node of nodes) {
    if (!plainObject(node) || node.type !== 'text' || typeof node.text !== 'string') continue;
    const text = node.text;
    // Escaped Canvas strings have no contiguous original-byte span. Never fake one.
    const literal = JSON.stringify(text), rawPosition = literal.includes('\\') ? -1 : snapshot.text.indexOf(literal);
    blocks.push(...markdownBlocks(text, rawPosition < 0 ? -1 : rawPosition + 1, false, local, snapshot.path, includeHeadings));
  }
  return blocks;
}
/** Existing AI, vocabulary and cached quotation parsing remain unchanged. */
export function textBlocks(snapshot: SourceSnapshot): TextBlock[] { return sourceBlocks(snapshot); }
export function localExcerptBlocks(snapshot: SourceSnapshot): TextBlock[] { return sourceBlocks(snapshot,true); }
/** Evidence verification may read full visible headings in decoded Canvas text.
 * This is not model primary input: textBlocks and background-only guards stay unchanged. */
export function hasReadableQuote(snapshot: SourceSnapshot, quote: string): boolean {
  return sourceBlocks(snapshot,false,true).some(block => block.text.includes(quote));
}
/** Decoded Canvas groups use existing individually verifiable quotations rather
 * than pretending their escaped JSON has one contiguous original span. */
export function localEvidencePieces(block: TextBlock): TextBlock[] {
  return markdownBlocks(block.text,block.offsets[0] ?? -1);
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
