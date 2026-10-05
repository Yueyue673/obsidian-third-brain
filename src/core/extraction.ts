import type { Analysis, AnalyzeOptions, Fragment, SourceSnapshot } from './types';
import { CoreError, LOCAL_LABEL, MODEL_TEXT_LIMIT, cancellable, checkAbort, timestamp, yieldToHost } from './util';
import { extendVocabulary, hasCredentials, redact, safeVocabulary } from './privacy';
import { checkedSource, meaningful, sourceFacets, splitBlock, textBlocks } from './sources';
import { CANVAS_OFFSET_CAVEAT, evidenceFor, fragmentId, mergeFragments } from './fragments';
import { parseExtraction } from './model';

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
  for (const block of usable) for (const sanitized of splitBlock({ ...redact(block),heading:'' },MODEL_TEXT_LIMIT)) {
    checkAbort(options.signal);
    if (!meaningful(sanitized.text)) continue;
    const response = await cancellable(() => options.model!.request({ task:'extract',text:sanitized.text,vocabulary },options.signal),options.signal);
    checkAbort(options.signal);
    const extracted = parseExtraction(response,snapshot,sanitized,vocabulary,now);
    fragments.push(...extracted);
    for (const fragment of extracted) vocabulary = extendVocabulary(vocabulary,fragment.facets);
  }
  checkAbort(options.signal);
  return { status:fragments.length ? 'indexed' : 'insufficient-context',fragments:mergeFragments(fragments) };
}
