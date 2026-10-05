import type { Facets, Fragment, ModelPort, SourceSnapshot } from './types';
import { emptyFacets } from './types';
import { CoreError, FACET_KEYS, boundedString, cancellable, checkAbort, exactKeys, facetKey, parseResponse, stringList } from './util';
import { extendVocabulary, hasCredentials, mapped, redact, safeFacet, safeVocabulary, type MappedText } from './privacy';
import { AI_EDITOR_CAVEAT, CANVAS_OFFSET_CAVEAT, fragmentId, quotations } from './fragments';
import { meaningful } from './sources';

const KINDS = new Map<string,string>([
  ['excerpt','excerpt'],['idea','idea'],['method','method'],['concept','concept'],['observation','observation'],['question','question'],['quote','quote'],['reference','reference'],
  ['素材','reference'],['方法','method'],['观点','idea'],['概念','concept'],['观察','observation'],['问题','question'],['金句','quote'],
]);
const FRAGMENT_KEYS = ['title','summary','kind','topics','concepts','mechanisms','atmosphere','quotes','conditions','caveats'] as const;
function controlledFacets(object: Record<string,unknown>, vocabulary: Facets, discover = false): Facets {
  const result = emptyFacets();
  for (const key of FACET_KEYS) {
    const known = new Map(vocabulary[key].map(item => [facetKey(item),item]));
    for (const value of stringList(object[key],discover ? 6 : 24)) {
      const normalized = facetKey(value), canonical = known.get(normalized) ?? (discover ? normalized : undefined);
      if (!canonical || !safeFacet(value) || !safeFacet(canonical)) throw new CoreError('Model returned an unknown or unsafe facet');
      result[key].push(canonical);
    }
    result[key] = [...new Set(result[key])].sort();
  }
  return result;
}
function safeModelText(text: string): void {
  if (hasCredentials(text) || text.includes('[REDACTED]') || redact(mapped(text)).text !== text || /\[\[|^---(?:\r?\n|$)/mu.test(text)) throw new CoreError('Unsafe model field');
}
export function parseExtraction(response: unknown, snapshot: SourceSnapshot, input: MappedText, vocabulary: Facets, now: string): Fragment[] {
  const object = parseResponse(response);
  exactKeys(object,['version','decision','fragments']);
  if (object.version !== 1 || (object.decision !== 'extract' && object.decision !== 'insufficient-context') || !Array.isArray(object.fragments) || object.fragments.length > 32) throw new CoreError('Invalid extraction schema');
  if (object.decision === 'insufficient-context') { if (object.fragments.length) throw new CoreError('Conflicting extraction decision'); return []; }
  if (!object.fragments.length) throw new CoreError('Empty extraction must abstain explicitly');
  let known = safeVocabulary(vocabulary);
  return object.fragments.map(item => {
    exactKeys(item,FRAGMENT_KEYS);
    const title = boundedString(item.title,160), summary = boundedString(item.summary,6000), rawKind = boundedString(item.kind,32), kind = KINDS.get(rawKind);
    if (!kind) throw new CoreError('Unknown fragment kind');
    safeModelText(title); safeModelText(summary);
    const quotes = stringList(item.quotes,24,6000), conditions = stringList(item.conditions,12,500), caveats = stringList(item.caveats,12,500);
    if (!quotes.length || !meaningful(summary) || quotes.some(quote => !meaningful(quote))) throw new CoreError('Fragment needs substantive quotation evidence');
    const excerpt = quotes.some(quote => quote.includes(summary));
    // Exact excerpts remain compatible; an edited summary is short, regardless
    // of the source fragment's kind. Only evidence.quote is a literal quotation.
    // Semantic entailment is not claimed: exact evidence is verified below,
    // and the program supplies uncertainty for summaries and inferred facets.
    if (!excerpt && summary.length > 800) throw new CoreError('Edited summary must be short');
    for (const value of [...conditions,...caveats]) { safeModelText(value); if (!input.text.includes(value)) throw new CoreError('Conditions and caveats must be source-grounded'); }
    const evidence = quotes.flatMap(quote => { safeModelText(quote); return quotations(snapshot,input,quote); });
    const facets = controlledFacets(item,known,true);
    known = extendVocabulary(known,facets);
    const fragment: Fragment = { id:'', privacy:snapshot.privacy, title, summary, kind, facets, evidence, mode:'ai', updatedAt:now, conditions, caveats:[...new Set([...caveats,AI_EDITOR_CAVEAT])] };
    if (evidence.some(item => item.start < 0)) fragment.caveats.push(CANVAS_OFFSET_CAVEAT);
    fragment.id = fragmentId(fragment); return fragment;
  });
}
/** Callers must pass vocabularyOf(publicFragments, true) for cloud interpretation.
 * This fixed port has no mode/consent or per-facet provenance; the authorised adapter owns both.
 */
export async function interpretQuery(query: string, model: ModelPort, vocabulary: Facets, signal?: AbortSignal): Promise<Facets> {
  checkAbort(signal);
  boundedString(query,6000,true);
  if (!query.trim() || hasCredentials(query)) return emptyFacets();
  const safe = safeVocabulary(vocabulary), text = redact(mapped(query)).text;
  if (!meaningful(text) || FACET_KEYS.every(key => safe[key].length === 0)) return emptyFacets();
  const response = await cancellable(() => model.request({ task:'interpret',text,vocabulary:safe },signal),signal);
  checkAbort(signal);
  const object = parseResponse(response);
  exactKeys(object,['version',...FACET_KEYS]);
  if (object.version !== 1) throw new CoreError('Unknown query schema version');
  return controlledFacets(object,safe);
}
