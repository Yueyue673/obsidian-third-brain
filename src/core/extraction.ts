import type { Analysis, AnalyzeOptions, Fragment, SourceSnapshot } from './types';
import { SOURCE_CONTEXT_LIMITS } from './types';
import { CoreError, LOCAL_LABEL, MODEL_TEXT_LIMIT, cancellable, checkAbort, timestamp, yieldToHost } from './util';
import { extendVocabulary, hasCredentials, mapped, redact, safeVocabulary } from './privacy';
import { checkedSource, meaningful, sourceFacets, splitBlock, textBlocks, type TextBlock } from './sources';
import { CANVAS_OFFSET_CAVEAT, evidenceFor, fragmentId, mergeFragments } from './fragments';
import { parseExtraction } from './model';

function contextSlice(text: string, limit: number, tail = false): string {
  let start = tail ? Math.max(0,text.length - limit) : 0, end = tail ? text.length : Math.min(limit,text.length);
  if (start && /[\uDC00-\uDFFF]/u.test(text[start]) && /[\uD800-\uDBFF]/u.test(text[start-1])) start++;
  if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end-1]) && /[\uDC00-\uDFFF]/u.test(text[end])) end--;
  return text.slice(start,end);
}
function previousParagraph(snapshot: SourceSnapshot, blocks: TextBlock[], index: number): string {
  const previous = blocks[index-1], current = blocks[index];
  // Canvas node order is not semantic adjacency. Do not cross section boundaries,
  // including repeated headings, or promote hidden/code/frontmatter into context.
  if (snapshot.format !== 'markdown' || !previous || previous.heading !== current.heading) return '';
  const start = previous.offsets.at(-1), end = current.offsets[0];
  if (start === undefined || end === undefined || start < 0 || end < 0 || /^\s{0,3}#{1,6}\s+/mu.test(snapshot.text.slice(start+1,end))) return '';
  return contextSlice(redact(previous).text,SOURCE_CONTEXT_LIMITS.before,true);
}

export async function analyzeSource(input: SourceSnapshot, options: AnalyzeOptions): Promise<Analysis> {
  checkAbort(options.signal);
  if (!['local-excerpts','local-model','cloud-model'].includes(options.mode)) throw new CoreError('Unknown processing mode');
  const snapshot = checkedSource(input);
  // Raw policy and credentials precede YAML, plugin, Canvas and code-fence transforms.
  if (options.mode === 'cloud-model' && snapshot.privacy !== 'normal') return { status:'local-only',fragments:[] };
  if (hasCredentials(snapshot.text)) return { status:'sensitive',fragments:[] };
  if (options.mode === 'cloud-model' && !options.cloudConsent) throw new CoreError('Cloud processing requires explicit consent');
  const blocks = textBlocks(snapshot);
  if (!blocks.length) return { status:'empty',fragments:[] };
  const usable = blocks.filter(block => meaningful(block.text));
  if (!usable.length) return { status:'insufficient-context',fragments:[] };
  const now = timestamp(options.now), explicit = sourceFacets(snapshot);
  if (options.mode === 'local-excerpts') {
    const fragments: Fragment[] = []; let visited = 0;
    for (const block of usable) for (const piece of splitBlock(block,1400)) {
      checkAbort(options.signal);
      if (++visited % 32 === 0) await yieldToHost(options.signal);
      if (!meaningful(piece.text)) continue;
      const evidence = evidenceFor(snapshot,piece.text,piece.offsets);
      const fragment: Fragment = { id:'',privacy:snapshot.privacy,title:piece.heading || piece.text.replace(/^[\s>*+\-\[\]xX0-9.)]+/u,'').slice(0,100),summary:piece.text,kind:'excerpt',facets:explicit,evidence:[evidence],mode:'local',updatedAt:now,conditions:[],caveats:[LOCAL_LABEL] };
      if (evidence.start < 0) fragment.caveats.push(CANVAS_OFFSET_CAVEAT);
      fragment.id = fragmentId(fragment); fragments.push(fragment);
    }
    return { status:fragments.length ? 'indexed' : 'insufficient-context',fragments:mergeFragments(fragments) };
  }
  if (!options.model) throw new CoreError('Model mode requires a configured model port');
  let vocabulary = extendVocabulary(safeVocabulary(options.vocabulary),explicit);
  const fragments: Fragment[] = [];
  // Every later paragraph is visited; limits bound individual requests, not the entire note.
  // All quotation occurrences are retained; successful discoveries are hints for
  // later blocks, not a prerequisite for extracting from an untagged source.
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (!meaningful(block.text)) continue;
    // The parser caps headings before redaction. Omit already clipped headings
    // rather than disclose a partial PII/path token we can no longer recognise.
    const heading = block.heading.length >= SOURCE_CONTEXT_LIMITS.heading ? '' : contextSlice(redact(mapped(block.heading)).text,SOURCE_CONTEXT_LIMITS.heading);
    let before = previousParagraph(snapshot,blocks,index);
    for (const sanitized of splitBlock({ ...redact(block),heading:'' },MODEL_TEXT_LIMIT)) {
      checkAbort(options.signal);
      const context = heading || before ? { heading,before } : undefined;
      before = contextSlice(sanitized.text,SOURCE_CONTEXT_LIMITS.before,true);
      if (!meaningful(sanitized.text)) continue;
      const response = await cancellable(async () => {
        // Context belongs to the same immutable source. Each paragraph/chunk
        // remains a disclosure boundary for both primary text and background.
        await options.beforeRequest?.(snapshot,vocabulary);
        checkAbort(options.signal);
        return options.model!.request({ task:'extract',text:sanitized.text,vocabulary,...(context ? { context } : {}) },options.signal);
      },options.signal);
      checkAbort(options.signal);
      // Background never enters the mapped input used for quotation validation.
      const extracted = parseExtraction(response,snapshot,sanitized,vocabulary,now);
      fragments.push(...extracted);
      for (const fragment of extracted) vocabulary = extendVocabulary(vocabulary,fragment.facets);
    }
  }
  checkAbort(options.signal);
  return { status:fragments.length ? 'indexed' : 'insufficient-context',fragments:mergeFragments(fragments) };
}
