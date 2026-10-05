import type { Facets, Fragment, RelationReason, SearchOptions, SearchResult } from './types';
import { emptyFacets } from './types';
import { CoreError, FACET_KEYS, facetKey, unionFacets } from './util';
import { safeVocabulary } from './privacy';

const LATIN_STOP = new Set('a an and are as at be been but by can could do does for from had has have how i if in is it its just may me my not of on or our should so some than that the their them there these they this to us was we were what when where which who why will with would you your'.split(' '));
const HAN_STOP = new Set(['一下','一个','一些','这个','那个','这些','那些','什么','怎么','如何','可以','可能','有没有','有没','没有','想要','我想','想法','事情','东西','知道','感觉','请问','一下','因为','所以','但是','然后','就是','这样','那样','自己','我们','他们']);
export function lexicalTokens(text: string): string[] {
  const normalized = text.normalize('NFKC').toLocaleLowerCase('en-US'), result: string[] = [];
  for (const match of normalized.matchAll(/[a-z0-9]+(?:['’-][a-z0-9]+)*/gu)) if (match[0].length > 1 && !LATIN_STOP.has(match[0]) && !/^\d+$/u.test(match[0])) result.push(match[0]);
  for (const match of normalized.matchAll(/[\p{Script=Han}]+/gu)) {
    const chars = [...match[0]];
    for (let i = 0; i < chars.length - 1; i++) { const token = chars[i] + chars[i+1]; if (!HAN_STOP.has(token)) result.push(token); }
  }
  return result;
}
function counts(tokens: string[]): Map<string,number> {
  const result = new Map<string,number>(); for (const token of tokens) result.set(token,(result.get(token) ?? 0)+1); return result;
}
function cosine(query: Map<string,number>, doc: Map<string,number>, frequency: Map<string,number>, count: number): number {
  let numerator = 0, qNorm = 0, dNorm = 0;
  const weight = (token: string, tf: number) => (1 + Math.log(tf)) * (Math.log((count + 1) / ((frequency.get(token) ?? 0) + 1)) + 1);
  for (const [token,tf] of query) { const value = weight(token,tf); qNorm += value * value; numerator += value * (doc.has(token) ? weight(token,doc.get(token)!) : 0); }
  for (const [token,tf] of doc) { const value = weight(token,tf); dNorm += value * value; }
  return qNorm && dNorm ? numerator / Math.sqrt(qNorm * dNorm) : 0;
}
function mentioned(query: string, values: string[]): string[] {
  const haystack = query.normalize('NFKC').toLocaleLowerCase('en-US');
  return values.filter(value => {
    const key = facetKey(value);
    if (/^[a-z0-9 -]+$/u.test(key)) return new RegExp(`(?:^|[^a-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')}(?:$|[^a-z0-9])`,'u').test(haystack);
    return haystack.includes(key) || (key === '反馈循环' && /\bfeedback loops?\b/iu.test(haystack)) || (key === '减少摩擦' && /\b(?:reduce|lower) friction\b/iu.test(haystack)) || (key === '认知负荷' && /\bcognitive load\b/iu.test(haystack)) || (key === '间隔重复' && /\bspaced repetition\b/iu.test(haystack));
  });
}
export function vocabularyOf(fragments: Fragment[], cloudSafe = false): Facets {
  const safe = fragments.filter(fragment => !cloudSafe || fragment.privacy === 'normal');
  const output = unionFacets(...safe.map(fragment => fragment.facets));
  // The bounded request vocabulary is distinct from a potentially larger local index.
  for (const key of FACET_KEYS) output[key] = output[key].slice(0,256);
  return safeVocabulary(output);
}
export function searchFragments(fragments: Fragment[], query: string, options: SearchOptions): SearchResult[] {
  if (typeof query !== 'string' || query.length > 20_000 || !['low','medium','high'].includes(options.breadth)) throw new CoreError('Invalid search options');
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 0 || limit > 200) throw new CoreError('Invalid result limit');
  if (!limit) return [];
  const vocabulary = vocabularyOf(fragments), explicit = safeVocabulary(options.facets), intent = emptyFacets();
  for (const key of FACET_KEYS) intent[key] = [...new Set([...explicit[key],...mentioned(query,vocabulary[key])])];
  const qTokens = counts(lexicalTokens(query));
  if (!qTokens.size && FACET_KEYS.every(key => !intent[key].length)) return [];
  const candidates = fragments.flatMap(fragment => {
    const evidence = fragment.evidence.filter(item => item.quote.trim() && (!options.excludeSource || (item.sourceId !== options.excludeSource && item.relativePath !== options.excludeSource)));
    return evidence.length ? [{ ...fragment,evidence }] : [];
  });
  const documents = candidates.map(fragment => counts(lexicalTokens(`${fragment.title}\n${fragment.summary}`)));
  const facetDocuments = candidates.map(fragment => Object.fromEntries(FACET_KEYS.map(key => [key,counts(lexicalTokens(fragment.facets[key].join(' ')))])) as Record<keyof Facets,Map<string,number>>);
  const frequency = new Map<string,number>();
  // Facet labels are existing local metadata, not filenames or inferred query tags.
  for (let i = 0; i < candidates.length; i++) {
    const tokens = new Set([...documents[i].keys(),...FACET_KEYS.flatMap(key => [...facetDocuments[i][key].keys()])]);
    for (const token of tokens) frequency.set(token,(frequency.get(token) ?? 0)+1);
  }
  const results: SearchResult[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const fragment = candidates[i], reasons: RelationReason[] = [], quotes = [...new Set(fragment.evidence.map(item => item.quote))].slice(0,3);
    const lexical = cosine(qTokens,documents[i],frequency,candidates.length);
    const shared = emptyFacets();
    for (const key of FACET_KEYS) shared[key] = fragment.facets[key].filter(value => intent[key].some(item => facetKey(item) === facetKey(value)));
    let score = lexical;
    const tokens = [...qTokens.keys()].filter(token => documents[i].has(token)).slice(0,6);
    if (lexical > 0) reasons.push({ kind:'content',label:`Lexical baseline: ${tokens.join(' · ')}`,quotes });
    for (const [key,kind,boost] of [['topics','topic',0.6],['concepts','concept',0.55]] as const) if (shared[key].length) { score += boost; reasons.push({ kind,label:`Shared ${kind} facet: ${shared[key].join(' · ')}`,quotes,caveat:'A shared declared facet is not proof of semantic equivalence.' }); }
    const addFacetKeyword = (key: keyof Facets): boolean => {
      if (shared[key].length) return false; // Exact facet matches already have their own channel.
      const hits = [...qTokens.keys()].filter(token => facetDocuments[i][key].has(token)).slice(0,6);
      if (!hits.length) return false;
      const labels = fragment.facets[key].filter(value => lexicalTokens(value).some(token => hits.includes(token)));
      score += 0.25 * cosine(qTokens,facetDocuments[i][key],frequency,candidates.length);
      reasons.push({ kind:'content',label:`Facet keyword match: ${hits.join(' · ')} → ${labels.join(' · ')}`,quotes,caveat:'A matching facet label is a retrieval hint, not evidence of semantic or causal equivalence.' });
      return true;
    };
    const topicKeyword = addFacetKeyword('topics'), conceptKeyword = addFacetKeyword('concepts');
    const direct = lexical > 0 || shared.topics.length > 0 || shared.concepts.length > 0 || topicKeyword || conceptKeyword;
    const requestedTopics = intent.topics.length > 0;
    // Medium remains within a requested topic if one exists. High may cross it,
    // but only on an existing, named mechanism; it never fills top-K with noise.
    const mechanismAllowed = options.breadth === 'high' || (options.breadth === 'medium' && (!requestedTopics || direct));
    if (mechanismAllowed && shared.mechanisms.length) {
      const analogy = !direct && requestedTopics && !shared.topics.length;
      score += analogy ? 0.3 : 0.45;
      reasons.push({ kind:analogy ? 'analogy' : 'mechanism',label:`Suggested shared mechanism: ${shared.mechanisms.join(' · ')}`,quotes,caveat:['Facet-based suggestion, not a verified causal relationship; applicability may differ.',...fragment.conditions,...fragment.caveats].join(' ') });
    }
    if (mechanismAllowed) addFacetKeyword('mechanisms');
    if (options.breadth === 'high') {
      addFacetKeyword('atmosphere');
      if (shared.atmosphere.length) { score += 0.15; reasons.push({ kind:'atmosphere',label:`Shared atmosphere facet: ${shared.atmosphere.join(' · ')}`,quotes,caveat:'Atmosphere is a declared facet, not evidence of causal similarity.' }); }
    }
    if (score > 0 && reasons.length) results.push({ fragment,score,reasons });
  }
  return results.sort((a,b) => b.score - a.score || a.fragment.id.localeCompare(b.fragment.id)).slice(0,limit);
}
