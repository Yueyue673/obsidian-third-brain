import type { Evidence, Facets, Fragment, SourceSnapshot } from './types';
import { CoreError, canonicalText, digest, restrictive, unionFacets } from './util';
import type { MappedText } from './privacy';

export const CANVAS_OFFSET_CAVEAT = 'Canvas text is decoded; a non-contiguous original span is represented by start/end = -1.';
export const AI_EDITOR_CAVEAT = 'AI summary and semantic facets are editorial interpretations, not verified facts; only the source quotations are locally verified.';
export function evidenceFor(snapshot: SourceSnapshot, quote: string, offsets: number[]): Evidence {
  const start = offsets[0] ?? -1;
  let end = start + quote.length;
  let position = start;
  if (start < 0 || offsets.length !== quote.length || offsets.some((offset, i) => offset !== start + i) || snapshot.text.slice(start, end) !== quote) {
    const first = snapshot.text.indexOf(quote);
    if (snapshot.format === 'canvas' && first >= 0 && snapshot.text.indexOf(quote, first + 1) < 0) { position = first; end = first + quote.length; }
    else { position = -1; end = -1; }
  }
  return { sourceId: snapshot.id, relativePath: snapshot.path, sourceHash: snapshot.hash, quote, start: position, end };
}
export function quotations(snapshot: SourceSnapshot, input: MappedText, quote: string): Evidence[] {
  const out: Evidence[] = []; let cursor = 0;
  while (cursor <= input.text.length - quote.length) {
    const found = input.text.indexOf(quote, cursor);
    if (found < 0) break;
    const evidence = evidenceFor(snapshot, quote, input.offsets.slice(found, found + quote.length));
    if (snapshot.format !== 'canvas' && evidence.start < 0) throw new CoreError('Quotation has no exact original mapping');
    out.push(evidence); cursor = found + Math.max(1,quote.length);
  }
  if (!out.length) throw new CoreError('Model quotation is absent from the supplied text');
  return out;
}
export function bodyKey(fragment: Pick<Fragment, 'summary' | 'kind' | 'conditions' | 'caveats'>): string {
  return JSON.stringify([canonicalText(fragment.summary), fragment.kind, fragment.conditions.map(canonicalText).sort(), fragment.caveats.filter(value => value !== CANVAS_OFFSET_CAVEAT).map(canonicalText).sort()]);
}
export function fragmentId(fragment: Pick<Fragment, 'summary' | 'kind' | 'conditions' | 'caveats'>): string { return `f_${digest(bodyKey(fragment))}`; }
export function evidenceKey(evidence: Evidence): string { return JSON.stringify([evidence.sourceId,evidence.relativePath,evidence.sourceHash,evidence.quote,evidence.start,evidence.end]); }
export function mergeFragments(input: Fragment[]): Fragment[] {
  const merged = new Map<string, Fragment>();
  for (const fragment of input) {
    const key = bodyKey(fragment), id = fragmentId(fragment), old = merged.get(id);
    if (old && bodyKey(old) !== key) throw new CoreError('Fragment identifier collision');
    if (!old) {
      merged.set(id, { ...fragment, id, facets: unionFacets(fragment.facets), evidence: fragment.evidence.map(item => ({ ...item })), conditions: [...fragment.conditions], caveats: [...fragment.caveats] });
      continue;
    }
    const evidence = new Map(old.evidence.map(item => [evidenceKey(item), item]));
    for (const item of fragment.evidence) evidence.set(evidenceKey(item), { ...item });
    old.evidence = [...evidence.values()].sort((a,b) => evidenceKey(a).localeCompare(evidenceKey(b)));
    old.facets = unionFacets(old.facets,fragment.facets);
    old.privacy = restrictive(old.privacy,fragment.privacy);
    old.mode = old.mode === 'ai' || fragment.mode === 'ai' ? 'ai' : 'local';
    old.updatedAt = old.updatedAt > fragment.updatedAt ? old.updatedAt : fragment.updatedAt;
    old.caveats = [...new Set([...old.caveats,...fragment.caveats])];
  }
  return [...merged.values()].sort((a,b) => a.id.localeCompare(b.id));
}
export function withFacets(fragment: Fragment, facets: Facets): Fragment { return { ...fragment, facets }; }
