import type { Facets, Fragment, RelationReason, SearchOptions, SearchResult, SearchResults } from './types';
import { emptyFacets, QUERY_KINDS } from './types';
import { CoreError, FACET_KEYS, facetKey, unionFacets } from './util';
import { safeVocabulary } from './privacy';
import { buildFragmentNetwork } from './connections';

export const ACTIVATION_LIMITS = Object.freeze({ seeds: 3, neighborsPerSeed: 3, targets: 6, steps: 1 });
export const INDIRECT_MECHANISM_CAVEAT = 'Indirect association suggestion via an existing shared mechanism between fragments, not equivalence to the query mechanism or a verified causal relationship; compare both sources and their conditions.';

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
export function searchFragments(fragments: Fragment[], query: string, options: SearchOptions): SearchResults {
  if (typeof query !== 'string' || query.length > 20_000 || !['low','medium','high'].includes(options.breadth)) throw new CoreError('Invalid search options');
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 0 || limit > 200) throw new CoreError('Invalid result limit');
  if (options.kind !== undefined) {
    if (!QUERY_KINDS.includes(options.kind) || query !== '' || options.facets !== undefined) throw new CoreError('Invalid kind selection');
    // Equality of stored editorial classification, not lexical or network relevance.
    return fragments.filter(fragment => fragment.kind === options.kind).flatMap(fragment => {
      const evidence = fragment.evidence.filter(item => item.quote.trim() && (!options.excludeSource || (item.sourceId !== options.excludeSource && item.relativePath !== options.excludeSource)));
      return evidence.length ? [{ fragment:{ ...fragment,evidence },score:1,reasons:[{ kind:'kind' as const,label:`Same-type material: ${options.kind}`,quotes:[...new Set(evidence.map(e => e.quote))].slice(0,3),caveat:'Classification basis: the stored editorial type is equal; not objective truth, semantic equivalence or a causal connection.' }] }] : [];
    }).sort((a,b) => a.fragment.id.localeCompare(b.fragment.id)).slice(0,limit);
  }
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
  const ranked = results.sort((a,b) => b.score - a.score || a.fragment.id.localeCompare(b.fragment.id));
  const indirectCandidates: SearchResult[] = [];
  // Freeze direct seeds before walking. A neighbor never becomes a new seed.
  if (options.breadth === 'high' && options.index) {
    const eligible = new Map(candidates.filter(f => {
      const indexed = options.index!.fragments[f.id];
      return indexed && JSON.stringify(indexed) === JSON.stringify(f);
    }).map(f => [f.id,f]));
    const seeds = ranked.filter(r => eligible.has(r.fragment.id) && r.reasons.some(reason => reason.kind === 'mechanism' || reason.kind === 'analogy')).slice(0,ACTIVATION_LIMITS.seeds);
    if (seeds.length) {
      // Reuse the render-v2 network unchanged, including its generic/dense guards.
      const network = buildFragmentNetwork(options.index), byId = new Map(ranked.map(r => [r.fragment.id,r]));
      const seedIds = new Set(seeds.map(r => r.fragment.id)), visited = new Set<string>();
      const weakScore = Math.min(0.12, Math.min(...ranked.map(r => r.score)) / 2);
      const endpoint = (f: Fragment) => ({ fragmentId:f.id,title:f.title,privacy:f.privacy,evidence:f.evidence.map(e => ({ ...e })),conditions:[...f.conditions],caveats:[...f.caveats] });
      for (const seed of seeds) {
        for (const edge of (network.connections.get(seed.fragment.id) ?? []).slice(0,ACTIVATION_LIMITS.neighborsPerSeed)) {
          if (visited.size >= ACTIVATION_LIMITS.targets) break;
          const target = eligible.get(edge.targetId), mechanisms = edge.shared.filter(s => s.channel === 'mechanisms').map(s => s.value);
          if (!target || target.privacy !== seed.fragment.privacy || seedIds.has(target.id) || visited.has(target.id) || !mechanisms.length) continue;
          visited.add(target.id);
          const reason: RelationReason = { kind:'indirect-mechanism',label:`Indirect association suggestion via: ${seed.fragment.title} → ${mechanisms.join(' · ')}`,
            quotes:[...new Set([...seed.fragment.evidence,...target.evidence].map(e => e.quote))],caveat:INDIRECT_MECHANISM_CAVEAT,
            indirect:{ steps:1,sharedMechanisms:mechanisms,anchor:endpoint(seed.fragment),target:endpoint(target) } };
          const existing = byId.get(target.id);
          // Existing direct results get an explanation, never a score boost.
          // Pure neighbors stay below every direct match; invalid anchors can
          // remove the whole suggestion without leaving a hidden score bonus.
          if (existing) { existing.reasons.push(reason); indirectCandidates.push(existing); }
          else { const result = { fragment:target,score:weakScore,reasons:[reason] }; byId.set(target.id,result); ranked.push(result); indirectCandidates.push(result); }
        }
      }
    }
  }
  const output: SearchResults = ranked.sort((a,b) => b.score - a.score || a.fragment.id.localeCompare(b.fragment.id)).slice(0,limit);
  if (options.breadth === 'high' && options.retainIndirectCandidates) {
    output.indirectCandidates = indirectCandidates.sort((a,b) => b.score - a.score || a.fragment.id.localeCompare(b.fragment.id));
  }
  return output;
}
