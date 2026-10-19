import type { Facets, Privacy, SourceSnapshot } from './types';
import { emptyFacets } from './types';
import { CoreError, FACET_KEYS, boundedString, canonicalFacets, isPrivacy, parseCompleteJson, plainObject, relativePath, restrictive, unionFacets } from './util';
import { mapped, safeVocabulary, type MappedText } from './privacy';
import { bindSourceDiagnostic } from './source-diagnostics';

export interface TextBlock extends MappedText { heading: string; localList?: boolean; localHeadings?: MappedText[]; localLeadIn?: MappedText; localParts?: MappedText[]; localSiblings?: MappedText[]; localFootnote?: string; localFootnotes?: MappedText[]; }
/** Bound complete local structural context before any focused-branch fan-out. Never truncate. */
export const LOCAL_EXCERPT_CONTEXT_LIMIT = 16384;
// Each focused copy retains every sibling's text/evidence. Bound that quadratic
// expansion; wider groups remain one complete excerpt, never a truncated subset.
const LOCAL_BRANCH_FOCUS_LIMIT = 16;
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
  // A bounded single-line scalar/list reader, not a general YAML loader. Keep
  // quoted values whole BEFORE safeVocabulary validates them: splitting an
  // unsupported comma-containing label must not invent two safe partial labels.
  const input = text.trim(), flow = input.startsWith('['), values: string[] = [];
  let i = flow ? 1 : 0;
  const separator = (char: string) => char === ',' || (!flow && char === '，');
  while (i < input.length) {
    while (/\s/u.test(input[i] ?? '') && i < input.length) i++;
    if (flow && input[i] === ']') {
      const tail = input.slice(i + 1).trim();
      return !tail || tail.startsWith('#') ? values : [];
    }
    if (separator(input[i])) { i++; continue; }
    if (i >= input.length) break;
    let value: string;
    const begin = i, quote = input[i];
    if (quote === '"' || quote === "'") {
      i++; let closed = false;
      while (i < input.length) {
        if (quote === '"' && input[i] === '\\') { i += 2; continue; }
        if (input[i] === quote) {
          if (quote === "'" && input[i + 1] === "'") { i += 2; continue; }
          i++; closed = true; break;
        }
        i++;
      }
      if (!closed) return [];
      const scalar = input.slice(begin,i);
      try { value = quote === '"' ? JSON.parse(scalar) as string : scalar.slice(1,-1).replace(/''/gu,"'"); }
      catch { return []; }
    } else {
      while (i < input.length && !separator(input[i]) && !(flow && input[i] === ']') && !(input[i] === '#' && i > begin && /\s/u.test(input[i - 1]))) i++;
      value = input.slice(begin,i).trim();
      // Nested collections/aliases are not supported, never flattened into tags.
      if (/[\[\]{}"']/u.test(value)) return [];
    }
    if (value) values.push(value);
    while (i < input.length && /\s/u.test(input[i])) i++;
    if (separator(input[i])) { i++; continue; }
    if (flow && input[i] === ']') continue;
    if (!flow && (i === input.length || input[i] === '#')) return values;
    return [];
  }
  // An incomplete flow list/quote contributes no guessed labels.
  return flow ? [] : values;
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
function introducesList(text: string): boolean {
  if (/[:：]$/u.test(text)) return true;
  // A quoted blank line is syntax, not the end of the visible introduction.
  // Inspect only fully quoted blocks, without changing their exact evidence.
  const lines = text.split(/\r\n|\n|\r/u);
  if (!lines.every(line => /^ {0,3}>/u.test(line))) return false;
  while (lines.length && /^(?: {0,3}>[ \t]*)+$/u.test(lines.at(-1)!)) lines.pop();
  return /[:：]$/u.test(lines.at(-1)?.trimEnd() ?? '');
}
function markdownBlocks(raw: string, base: number, excalidraw = false, local = false, sourcePath = '', includeHeadings = false, quotedLists = true, footnoteDefinitions = local): TextBlock[] {
  const meta = frontmatter(raw), blocks: TextBlock[] = [];
  const ancestors: { depth: number; block: MappedText }[] = [];
  let heading = '', start = -1, end = -1, fence = '', fenceLength = 0, hidden = '', drawing = false;
  let listIndent = -1, contentIndent = -1, blockedIndent = -1, blockedContentIndent = -1, blank = false, rootIsContext = false, orderedRoot = '', taskRoot = '';
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
        if (local && listIndent < 0) introduction = introducesList(trimmed) ? { block,end } : undefined;
      }
    }
    start = end = -1; listIndent = contentIndent = -1; rootIsContext = false; orderedRoot = taskRoot = '';
  };
  const linePattern = /[^\r\n]+(?:\r\n|\r|\n|$)|(?:\r\n|\r|\n)/gu;
  let quotedThrough = -1, quoteScannedThrough = -1, footnoteThrough = -1;
  for (const hit of raw.slice(meta.body).matchAll(linePattern)) {
    const offset = meta.body + hit.index, line = hit[0].replace(/[\r\n]+$/u, '');
    if (offset < quotedThrough || offset < footnoteThrough) continue;
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
    // Obsidian's top-level named footnotes allow indented continuation lines.
    // Keep their complete authored spans before ordinary paragraph/list parsing
    // can detach a restriction. Resolve references only within this note/node.
    const footnote = footnoteDefinitions && !drawing && /^\[\^([^\]\s]+)\]:/u.exec(line);
    if (footnote) {
      barrier();
      let stop = offset + line.length;
      for (const next of raw.slice(offset + hit[0].length).matchAll(linePattern)) {
        const row = next[0].replace(/[\r\n]+$/u,'');
        if (!row.trim()) continue;
        if (!/^(?: {2,}|\t)/u.test(row)) break;
        stop = offset + hit[0].length + next.index + row.length;
      }
      const text = raw.slice(offset,stop).trimEnd();
      // Never turn hidden content or code in a definition into prose context.
      // Unsupported definitions fail the whole run, not just the referenced card.
      if (text.includes('<!--') || text.includes('%%') || /^\s*(?:`{3,}|~{3,})/mu.test(text)) throw new CoreError('Local footnote context intersects hidden content or code; no partial index was saved.');
      blocks.push({ ...mapped(text,base < 0 ? -1 : base + offset),heading,localFootnote:footnote[1],...(local && ancestors.length ? { localHeadings:ancestors.map(item => item.block) } : {}) });
      footnoteThrough = stop; blank = false;
      continue;
    }
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
    // Setext is an authored heading, not an independent paragraph whose scope
    // disappears at the next neutral ATX child. Consume only ordinary paragraph
    // text; list/quote/HTML/code-like prefixes must not become global ancestors.
    // AI primary parsing stays unchanged. Readable-quote verification recognises
    // the complete heading so decoded Canvas evidence can retain its underline.
    const underline = (local || includeHeadings) && /^ {0,3}(=+|-+)[ \t]*$/u.exec(line);
    if (underline && start >= 0 && listIndent < 0 && !blank) {
      const paragraph = raw.slice(start,end);
      const rows = paragraph.split(/\r\n|\r|\n/u);
      if (/^ {0,3}\S/u.test(rows[0]) && !rows.some(row => /^\s*(?:>|<|[-*+]\s+|\d+[.)]\s+)/u.test(row))) {
        const original = raw.slice(start,offset + line.length), leading = original.length - original.trimStart().length;
        const block = mapped(original.trim(),base < 0 ? -1 : base + start + leading);
        heading = paragraph.trim().replace(/\s+\^[a-z0-9-]+$/iu,'').slice(0,160);
        drawing = excalidraw && /^(?:drawing|绘图)$/iu.test(heading);
        start = end = -1; clearBlocked(); introduction = undefined; listLeadIn = undefined;
        if (local) {
          if (block.text.includes('<!--') || block.text.includes('%%')) throw new CoreError('Local heading context intersects hidden content; no partial index was saved.');
          const depth = underline[1][0] === '=' ? 1 : 2;
          while (ancestors.length && ancestors.at(-1)!.depth >= depth) ancestors.pop();
          ancestors.push({ depth,block });
        }
        if (includeHeadings && !drawing) blocks.push({ ...block,heading });
        continue;
      }
    }
    // Only explicit, contiguous, single-level quote runs are structural input.
    // Parse their visible list syntax with the existing local rules, then restore
    // every component to an exact original span (including its quote prefixes).
    // Never split an unrecognised prose restriction off its following actions.
    if (local && quotedLists && listIndent < 0 && offset >= quoteScannedThrough && /^ {0,3}>/u.test(line)) {
      const run = /(?: {0,3}>[^\r\n]*(?:\r\n|\r|\n|$))+/uy;
      run.lastIndex = offset;
      const match = run.exec(raw)!;
      quoteScannedThrough = offset + match[0].length;
      let visible = '\n';
      const positions = [-1], starts = [-1];
      for (const row of match[0].matchAll(linePattern)) {
        const prefix = /^ {0,3}>[ \t]?/u.exec(row[0])![0].length;
        for (let i = prefix; i < row[0].length; i++) {
          visible += row[0][i]; positions.push(offset + row.index + i); starts.push(offset + row.index);
        }
      }
      const firstItem = /^(?:[ \t]*)(?:[-*+]\s+|\d+[.)]\s+)/mu.exec(visible);
      const before = firstItem ? visible.slice(0,firstItem.index).trimEnd() : '';
      if (firstItem && !/^ {0,3}>/mu.test(visible) && (!before.trim() || /[:：]$/u.test(before))) {
        flush(); clearBlocked(); introduction = undefined; listLeadIn = undefined;
        const restore = (part: MappedText): MappedText => {
          const first = part.offsets[0], last = part.offsets.at(-1)!;
          const begin = starts[first], end = positions[last] + 1;
          const text = raw.slice(begin,end), leading = text.length - text.trimStart().length;
          return mapped(text.trim(),base < 0 ? -1 : base + begin + leading);
        };
        const inner = markdownBlocks(visible,0,false,true,sourcePath,false,false,false);
        for (const block of inner) {
          const restored: TextBlock = { ...restore(block),heading:block.heading || heading,
            ...(block.localList ? { localList:true } : {}),
            ...(block.localLeadIn ? { localLeadIn:restore(block.localLeadIn) } : {}),
            localHeadings:[...ancestors.map(item => item.block),...(block.localHeadings ?? []).map(restore)] };
          const body = restored.localLeadIn ? restored.localLeadIn.text + '\n\n' + restored.text : restored.text;
          const size = body.length + (restored.localHeadings!.length ? restored.localHeadings!.map(item => item.text).join('\n').length + 2 : 0);
          if (size > LOCAL_EXCERPT_CONTEXT_LIMIT) {
            const error = new CoreError('Local list context exceeds 16384 characters; no partial index was saved.');
            bindSourceDiagnostic(error,{ relativePath:sourcePath,stage:'analysis',reason:'local-context-size-limit' });
            throw error;
          }
          blocks.push(restored);
        }
        quotedThrough = offset + match[0].length; blank = false;
        continue;
      }
    }
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
        // Explicit following example/condition/caveat labels qualify the preceding
        // root. Keep their exact text and descendants, without interpreting prose
        // or attaching labels backwards to a leading standalone context item.
        const context = /^(?:examples?|counterexamples?|conditions?|caveats?|limitations?|例子|示例|反例|条件|前提|限制)[ \t]*[:：]/iu.test(line.slice(item[0].length));
        // Numbered roots are one authored sequence, not evidence that a later
        // step can stand alone. Keep same-delimiter peers and their descendants
        // intact; changing delimiter/list type keeps the existing boundary.
        // This is local-only conservative retention, not dependency inference.
        const ordered = /^\s*\d{1,9}([.)])\s+/u.exec(line)?.[1] ?? '';
        // A checked preparation still belongs to its unchecked operation group.
        // Retain only same-bullet standard task peers; ordinary bullets, custom
        // checkbox states and changed list types keep their existing boundaries.
        const task = /^[ \t]*\[[ \txX]\](?:[ \t]+|$)/u.test(line.slice(item[0].length))
          ? /^\s*([-*+])\s+/u.exec(line)?.[1] ?? '' : '';
        if (listIndent >= 0 && indent === listIndent && ((orderedRoot && ordered === orderedRoot) || (taskRoot && task === taskRoot) || (!rootIsContext && context))) {
          contentIndent = columns(item[0]);
        } else if (listIndent < 0 || indent <= listIndent) {
          const continuing = listIndent >= 0;
          flush();
          if (!continuing) {
            listLeadIn = undefined;
            // A literal final visible colon explicitly introduces the adjacent list.
            // Do not infer semantic dependence from arbitrary previous prose.
            if (introduction && blocks.at(-1) === introduction.block && !raw.slice(introduction.end,offset).trim()) {
              if (introduction.block.text.includes('<!--') || introduction.block.text.includes('%%')) throw new CoreError('Local list context intersects hidden content; no partial index was saved.');
              listLeadIn = introduction.block;
              blocks.pop(); // The introduction belongs to its actions, not an orphan excerpt.
            }
            introduction = undefined;
          }
          listIndent = indent; contentIndent = columns(item[0]); rootIsContext = context; orderedRoot = ordered; taskRoot = task;
        }
      }
    } else if (item && start >= 0) flush();
    blank = false;
    if (start < 0) start = offset;
    end = offset + line.length;
  }
  flush(); return blocks;
}
/** Focus direct unordered branches under a one-line colon parent, without
 * requiring authors to add example/condition labels or asserting independence.
 * Numbered and checklist groups stay whole. All shared-level labels and
 * root-level qualifiers accompany every branch, rather than guessing scope.
 * Run AFTER ordinary parsing/restoration so original whole-group limits and
 * structural/hidden barriers still apply before any smaller display is made.
 */
function focusedListBranches(block: TextBlock): TextBlock[] {
  if (!block.localList) return [block];
  const columns = (text: string) => { let width = 0; for (const char of text) width += char === '\t' ? 4 - width % 4 : 1; return width; };
  const context = (text: string) => /^(?:examples?|counterexamples?|conditions?|caveats?|limitations?|例子|示例|反例|条件|前提|限制)[ \t]*[:：]/iu.test(text);
  const quoted = /^ {0,3}>/u.test(block.text);
  const rows = [...block.text.matchAll(/[^\r\n]+(?:\r\n|\r|\n|$)|(?:\r\n|\r|\n)/gu)].map(hit => {
    const original = hit[0].replace(/[\r\n]+$/u,''), prefix = quoted ? /^ {0,3}>[ \t]?/u.exec(original)?.[0] : '';
    const text = prefix === undefined ? '' : original.slice(prefix.length);
    const item = /^(\s*)(?:[-*+]\s+|\d+[.)]\s+)/u.exec(text);
    return { offset:hit.index, text, valid:prefix !== undefined, item, indent:columns(item?.[1] ?? ''), content:item ? text.slice(item[0].length) : '' };
  });
  const root = rows[0];
  if (!root?.item || !/[:：]$/u.test(root.text.trimEnd()) || rows.some(row => !row.valid)) return [block];
  const tail = rows.findIndex((row,i) => i > 0 && row.item && row.indent <= root.indent);
  const end = tail < 0 ? rows.length : tail;
  const first = rows.findIndex((row,i) => i > 0 && i < end && row.text.trim());
  if (first < 0 || !rows[first].item || rows[first].indent < columns(root.item[0])) return [block];
  const depth = rows[first].indent;
  const starts = rows.flatMap((row,i) => i >= first && i < end && row.item && row.indent === depth ? [i] : []);
  // Ordered children can be dependent stages, even with their own examples.
  // Keep the complete group, including mixed and repeated-number Markdown.
  if (starts.some(i => /^\s*\d+[.)]\s+/u.test(rows[i].text))) return [block];
  // A task parent or direct task child can describe a coupled checklist. Its
  // checked state and labelled examples do not establish independent usability.
  // Deeper tasks remain inside their own branch; do not inspect wording.
  if ([0,...starts].some(i => /^[ \t]*\[[ \txX]\](?:[ \t]+|$)/u.test(rows[i].content))) return [block];
  if (rows.slice(first,end).some(row => row.item ? row.indent < depth : row.text.trim() && columns(/^\s*/u.exec(row.text)![0]) <= depth)) return [block];
  const groups = starts.map((start,i) => ({ start, end:starts[i+1] ?? end, shared:context(rows[start].content) }));
  const points = groups.filter(group => !group.shared);
  if (points.length < 2 || points.length > LOCAL_BRANCH_FOCUS_LIMIT) return [block];
  // Indentation supplies a display boundary, not semantic independence. Keep all
  // omitted siblings as visible, evidenced context; do not guess dependencies or
  // recursively split a selected branch. Reject malformed descendant boundaries.
  if (points.some(group => {
    const descendants = rows.slice(group.start+1,group.end).filter(row => row.item && row.indent > depth);
    return descendants.some(row => row.indent < columns(rows[group.start].item![0]));
  })) return [block];
  if (tail >= 0 && rows.slice(tail).some(row => row.item && row.indent <= root.indent && !context(row.content))) return [block];
  const part = (start: number, end: number): MappedText => {
    const begin = rows[start].offset, stop = end < rows.length ? rows[end].offset : block.text.length;
    const text = block.text.slice(begin,stop).trimEnd();
    return { text,offsets:block.offsets.slice(begin,begin+text.length) };
  };
  return points.map(point => {
    const parts = [part(0,first),...groups.filter(group => group.shared || group === point).map(group => part(group.start,group.end)),...(tail < 0 ? [] : [part(tail,rows.length)])];
    const siblings = groups.filter(group => !group.shared && group !== point).map(group => part(group.start,group.end));
    return { ...block,text:parts.map(piece => piece.text).join('\n'),offsets:parts.flatMap((piece,i) => [...(i ? [-1] : []),...piece.offsets]),localParts:parts,localSiblings:siblings };
  });
}
/** Named footnotes are authored dependencies, not inferred semantic links. Keep
 * each required definition (and its headings) once, including transitive/cyclic
 * references. Unknown or ambiguous definitions cannot yield a bare statement.
 * Inline code/escapes are syntax examples, not footnote requests. */
function localFootnoteContext(blocks: TextBlock[]): TextBlock[] {
  const definitions = new Map<string,TextBlock[]>(), used = new Set<TextBlock>();
  for (const block of blocks) if (block.localFootnote !== undefined) definitions.set(block.localFootnote,[...definitions.get(block.localFootnote) ?? [],block]);
  const references = (text: string): string[] => [...text.replace(/\\[\s\S]|(`+)[\s\S]*?\1(?!`)/gu,'').matchAll(/\[\^([^\]\s]+)\]/gu)].map(hit => hit[1]);
  const resolve = (block: TextBlock): TextBlock => {
    const text = block.localFootnote !== undefined ? block.text.replace(/^\[\^[^\]\s]+\]:/u,'') : block.text;
    const queue = references([text,...(block.localHeadings ?? []).map(v => v.text),block.localLeadIn?.text ?? '',...(block.localSiblings ?? []).map(v => v.text)].join('\n'));
    const seen = new Set<string>(block.localFootnote === undefined ? [] : [block.localFootnote]), parts: MappedText[] = [];
    const locations = new Set((block.localHeadings ?? []).map(v => JSON.stringify([v.text,v.offsets[0]])));
    for (let i = 0; i < queue.length; i++) {
      const label = queue[i]; if (seen.has(label)) continue; seen.add(label);
      const matches = definitions.get(label);
      if (matches?.length !== 1 || !matches[0].text.replace(/^\[\^[^\]\s]+\]:/u,'').trim()) throw new CoreError('Local footnote reference is missing or ambiguous; no partial index was saved.');
      const definition = matches[0]; used.add(definition);
      for (const part of [...definition.localHeadings ?? [],definition]) {
        const location = JSON.stringify([part.text,part.offsets[0]]);
        if (!locations.has(location)) { locations.add(location); parts.push(part); }
      }
      queue.push(...references(definition.text.replace(/^\[\^[^\]\s]+\]:/u,'')),...references((definition.localHeadings ?? []).map(v => v.text).join('\n')));
    }
    return parts.length ? { ...block,localFootnotes:parts } : block;
  };
  const primary = blocks.filter(block => block.localFootnote === undefined).flatMap(focusedListBranches).map(resolve);
  // An unused authored definition can still be material in its own right. Do
  // not silently delete it; resolve any dependencies just like ordinary prose.
  const unused = blocks.filter(block => block.localFootnote !== undefined && !used.has(block));
  return [...primary,...unused.map(resolve)];
}
function sourceBlocks(snapshot: SourceSnapshot, local = false, includeHeadings = false, readableFootnotes = false): TextBlock[] {
  if (snapshot.format === 'markdown') {
    const blocks = markdownBlocks(snapshot.text, 0, /(?:^|\n)\s*excalidraw-plugin\s*:/iu.test(frontmatter(snapshot.text).metadata) || /\.excalidraw\.md$/iu.test(snapshot.path), local, snapshot.path, includeHeadings,true,local || readableFootnotes);
    return local ? localFootnoteContext(blocks) : blocks;
  }
  const nodes = canvasObject(snapshot.text).nodes as unknown[], blocks: TextBlock[] = [];
  for (const node of nodes) {
    if (!plainObject(node) || node.type !== 'text' || typeof node.text !== 'string') continue;
    const text = node.text;
    // Escaped Canvas strings have no contiguous original-byte span. Never fake one.
    const literal = JSON.stringify(text), rawPosition = literal.includes('\\') ? -1 : snapshot.text.indexOf(literal);
    const parsed = markdownBlocks(text, rawPosition < 0 ? -1 : rawPosition + 1, false, local, snapshot.path, includeHeadings,true,local || readableFootnotes);
    blocks.push(...(local ? localFootnoteContext(parsed) : parsed));
  }
  return blocks;
}
/** Existing AI, vocabulary and cached quotation parsing remain unchanged. */
export function textBlocks(snapshot: SourceSnapshot): TextBlock[] { return sourceBlocks(snapshot); }
export function localExcerptBlocks(snapshot: SourceSnapshot): TextBlock[] { return sourceBlocks(snapshot,true); }
/** Evidence verification may read full visible headings in decoded Canvas text.
 * This is not model primary input: textBlocks and background-only guards stay unchanged. */
export function hasReadableQuote(snapshot: SourceSnapshot, quote: string): boolean {
  return sourceBlocks(snapshot,false,true).some(block => block.text.includes(quote))
    || sourceBlocks(snapshot,false,true,true).some(block => block.text.includes(quote));
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
