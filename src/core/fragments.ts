import type { Evidence, Facets, Fragment, SourceSnapshot } from './types';
import { CoreError, boundedString, canonicalText, digest, restrictive, unionFacets } from './util';
import type { MappedText } from './privacy';
import { hasCredentials } from './privacy';
import { LOCAL_EXCERPT_CONTEXT_LIMIT } from './sources';

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
/** Legacy no-field records keep their exact identity. New context is local-only.
 * Count every displayed primary/context code unit plus the joining newline once;
 * ancestors/shared qualifiers occur only in the primary, never once per sibling.
 * The parser also checks the unseparated original group before fan-out.
 */
export function validateLocalContext(fragment: Fragment): void {
  if (!Object.hasOwn(fragment,'localContext')) return;
  if (fragment.mode !== 'local' || fragment.kind !== 'excerpt') throw new CoreError('Invalid local source context');
  const context = boundedString(fragment.localContext,LOCAL_EXCERPT_CONTEXT_LIMIT);
  if (hasCredentials(context) || fragment.summary.length + 1 + context.length > LOCAL_EXCERPT_CONTEXT_LIMIT) throw new CoreError('Invalid or oversized local source context');
  // Stored context is not a free-form editorial claim. Every nonblank authored
  // line must be quoted by every complete donor, including decoded Canvas whose
  // individual list quotations do not form one contiguous original JSON span.
  if (!Array.isArray(fragment.evidence) || !fragment.evidence.length) throw new CoreError('Local source context lacks quotation evidence');
  const donors = new Map<string,string[]>();
  for (const item of fragment.evidence) {
    if (!item || typeof item.quote !== 'string') throw new CoreError('Local source context lacks quotation evidence');
    const key = JSON.stringify([item.sourceId,item.relativePath,item.sourceHash]);
    donors.set(key,[...donors.get(key) ?? [],item.quote]);
  }
  const lines = context.split(/\r\n|\r|\n/u).map(line => line.trim()).filter(Boolean);
  for (const quotes of donors.values()) if (lines.some(line => !quotes.some(quote => quote.includes(line)))) throw new CoreError('Local source context lacks quotation evidence');
}
type FragmentBody = Pick<Fragment, 'summary' | 'kind' | 'conditions' | 'caveats' | 'localContext' | 'mode'>;
function identityBody(fragment: FragmentBody, legacy = false): string {
  // Literal local excerpts retain authored line/indentation boundaries. Flattening
  // whitespace can merge different list scopes and display one donor's hierarchy
  // as another's. Only line-ending representation is immaterial here; this does
  // not infer semantic equivalence. AI editorial identity remains unchanged.
  const canonical = !legacy && fragment.mode === 'local' && fragment.kind === 'excerpt'
    ? (text: string) => text.replace(/\r\n|\r/gu,'\n').trim()
    : canonicalText;
  const body = [canonical(fragment.summary), fragment.kind, fragment.conditions.map(canonicalText).sort(), fragment.caveats.filter(value => value !== CANVAS_OFFSET_CAVEAT).map(canonicalText).sort()];
  if (fragment.localContext !== undefined) body.push(canonical(fragment.localContext));
  return JSON.stringify(body);
}
export function bodyKey(fragment: FragmentBody): string { return identityBody(fragment); }
export function fragmentId(fragment: FragmentBody): string { return `f_${digest(bodyKey(fragment))}`; }
/** Compatibility only: strict reload/recovery must reproduce old owned bytes.
 * New local generations never emit the flattened legacy key for a new excerpt. */
export function validFragmentId(fragment: Fragment): boolean {
  return fragment.id === fragmentId(fragment) || (fragment.mode === 'local' && fragment.kind === 'excerpt' && fragment.id === `f_${digest(identityBody(fragment,true))}`);
}
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
