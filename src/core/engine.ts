import type { Facets, Fragment, IndexState, RunOptions, SourceRecord, SourceSnapshot, SourceStatus } from './types';
import { CoreError, CORE_REVISION, FACET_KEYS, checkAbort, digest, exactKeys, facetKey, isPrivacy, plainObject, relativePath, restrictive, stringList, timestamp, unionFacets, yieldToHost } from './util';
import { extendVocabulary, hasCredentials, safeFacet, safeVocabulary } from './privacy';
import { checkedSource, sourceFacets, textBlocks } from './sources';
import { analyzeSource } from './extraction';
import { fragmentId, mergeFragments } from './fragments';

const STATUSES: SourceStatus[] = ['indexed','empty','insufficient-context','sensitive','local-only'];
function validatePrevious(state: IndexState): void {
  exactKeys(state,['version','signature','updatedAt','sources','fragments']);
  if (state.version !== 1 || typeof state.signature !== 'string' || typeof state.updatedAt !== 'string' || !plainObject(state.sources) || !plainObject(state.fragments)) throw new CoreError('Invalid previous index');
  for (const [path,record] of Object.entries(state.sources)) {
    relativePath(path); exactKeys(record,['hash','status','fragmentIds']);
    if (typeof record.hash !== 'string' || !record.hash || !STATUSES.includes(record.status) || !Array.isArray(record.fragmentIds) || record.fragmentIds.some(id => typeof id !== 'string' || !Object.hasOwn(state.fragments,id)) || new Set(record.fragmentIds).size !== record.fragmentIds.length || ((record.status === 'indexed') !== (record.fragmentIds.length > 0))) throw new CoreError('Invalid source record');
  }
  for (const [id,fragment] of Object.entries(state.fragments)) {
    exactKeys(fragment,['id','privacy','title','summary','kind','facets','evidence','mode','updatedAt','conditions','caveats']);
    exactKeys(fragment.facets,FACET_KEYS);
    if (id !== fragment.id || !isPrivacy(fragment.privacy) || !['local','ai'].includes(fragment.mode) || typeof fragment.updatedAt !== 'string' || typeof fragment.title !== 'string' || !fragment.title || typeof fragment.kind !== 'string' || !fragment.kind || typeof fragment.summary !== 'string' || !fragment.summary || hasCredentials(fragment.summary)) throw new CoreError('Invalid fragment record');
    for (const key of FACET_KEYS) if (stringList(fragment.facets[key],256,120).some(value => !safeFacet(value))) throw new CoreError('Unsafe stored facet');
    stringList(fragment.conditions,12,500); stringList(fragment.caveats,24,1000);
    if (!Array.isArray(fragment.evidence) || !fragment.evidence.length || fragmentId(fragment) !== id) throw new CoreError('Invalid fragment identifier or evidence');
    for (const evidence of fragment.evidence) {
      exactKeys(evidence,['sourceId','relativePath','sourceHash','quote','start','end']);
      if (typeof evidence.sourceId !== 'string' || !evidence.sourceId || typeof evidence.relativePath !== 'string' || typeof evidence.sourceHash !== 'string' || typeof evidence.quote !== 'string' || !evidence.quote || !Number.isInteger(evidence.start) || !Number.isInteger(evidence.end) || hasCredentials(evidence.quote)) throw new CoreError('Invalid stored quotation');
      relativePath(evidence.relativePath);
      if (evidence.start < 0 ? evidence.start !== -1 || evidence.end !== -1 || !evidence.relativePath.toLowerCase().endsWith('.canvas') : evidence.end !== evidence.start + evidence.quote.length) throw new CoreError('Invalid stored quotation span');
      const source = state.sources[evidence.relativePath];
      if (!source || source.hash !== evidence.sourceHash || !source.fragmentIds.includes(id)) throw new CoreError('Stored provenance is inconsistent');
    }
  }
  for (const [path,record] of Object.entries(state.sources)) for (const id of record.fragmentIds) if (!state.fragments[id].evidence.some(item => item.relativePath === path && item.sourceHash === record.hash)) throw new CoreError('Source fragment list is inconsistent');
}
function donorsCurrent(fragment: Fragment, current: Map<string,SourceSnapshot>, eligible: Set<string>): boolean {
  return fragment.evidence.every(evidence => {
    const source = current.get(evidence.relativePath);
    return source?.hash === evidence.sourceHash && source.id === evidence.sourceId && eligible.has(source.id);
  });
}
/** v1 stores unioned facets without per-donor attribution. A changed/missing or
 * protected donor therefore invalidates that merged fragment's dictionary and
 * cache; we re-edit surviving sources rather than guessing which labels belong
 * to them. Caller-supplied seed labels not from the index remain caller-owned.
 */
function currentVocabulary(vocabulary: Facets, previous: IndexState | null, reusable: Map<string,Fragment>): Facets {
  const result = { ...vocabulary };
  for (const key of FACET_KEYS) {
    const blocked = new Set(Object.values(previous?.fragments ?? {}).filter(fragment => !reusable.has(fragment.id)).flatMap(fragment => fragment.facets[key].map(facetKey)));
    result[key] = vocabulary[key].filter(value => !blocked.has(facetKey(value)));
  }
  return result;
}
function currentEvidence(fragment: Fragment, snapshot: SourceSnapshot): Fragment {
  const evidence = fragment.evidence.filter(item => item.relativePath === snapshot.path && item.sourceHash === snapshot.hash && item.sourceId === snapshot.id);
  for (const item of evidence) {
    if (item.start >= 0 ? snapshot.text.slice(item.start,item.end) !== item.quote : !textBlocks(snapshot).some(block => block.text.includes(item.quote))) throw new CoreError('Cached quotation does not match the immutable source');
  }
  return { ...fragment,privacy:snapshot.privacy,evidence:evidence.map(item => ({ ...item })),facets:unionFacets(fragment.facets),conditions:[...fragment.conditions],caveats:[...fragment.caveats] };
}
/** Pure staging: throws on any failed source; the host commits only a returned complete state. */
export async function buildIndex(inputs: SourceSnapshot[], options: RunOptions): Promise<IndexState> {
  const total = inputs.length; let completed = 0;
  const progress = (phase: 'reading' | 'processing' | 'done' | 'cancelled') => options.onProgress?.({ completed,total,phase });
  try {
    checkAbort(options.signal);
    if (typeof options.signature !== 'string' || !options.signature || options.signature.length > 4096) throw new CoreError('Generation signature is required');
    if (!['local-excerpts','local-model','cloud-model'].includes(options.mode)) throw new CoreError('Unknown processing mode');
    if (options.mode === 'cloud-model' && !options.cloudConsent) throw new CoreError('Cloud processing requires explicit consent');
    if (options.previous !== null) validatePrevious(options.previous);
    progress('reading');
    const sources = inputs.map(checkedSource).sort((a,b) => a.path.localeCompare(b.path)), current = new Map<string,SourceSnapshot>(), ids = new Set<string>();
    for (const source of sources) { checkAbort(options.signal); if (current.has(source.path) || ids.has(source.id)) throw new CoreError('Duplicate source path or identifier'); current.set(source.path,source); ids.add(source.id); }
    // Raw privacy/credential checks precede every dictionary transform. Never
    // learn hints from a source which this processing mode cannot send.
    const eligible = new Set<string>();
    for (const snapshot of sources) if (!(options.mode === 'cloud-model' && snapshot.privacy !== 'normal') && !hasCredentials(snapshot.text)) eligible.add(snapshot.id);
    const reusable = new Map<string,Fragment>();
    for (const fragment of Object.values(options.previous?.fragments ?? {})) {
      if (!donorsCurrent(fragment,current,eligible) || (options.mode === 'cloud-model' && fragment.privacy !== 'normal')) continue;
      // Validate every donor quote before using cached labels in any request.
      for (const path of new Set(fragment.evidence.map(evidence => evidence.relativePath))) currentEvidence(fragment,current.get(path)!);
      reusable.set(fragment.id,fragment);
    }
    let vocabulary = currentVocabulary(safeVocabulary(options.vocabulary),options.previous,reusable);
    // One independent source-grounded proof per canonical label is enough to
    // supply that label. A merged fragment's proof still requires ALL donors:
    // v1 cannot attribute its unioned editorial labels to individual evidence.
    // This avoids rereading an entire library for every common duplicate tag.
    const proofs = new Map<string,SourceSnapshot[]>();
    const remember = (facets: Facets, donors: SourceSnapshot[]): void => {
      const safe = safeVocabulary(facets);
      for (const key of FACET_KEYS) for (const value of safe[key]) {
        const label = `${key}:${facetKey(value)}`;
        if (!proofs.has(label)) proofs.set(label,donors);
      }
    };
    for (const fragment of reusable.values()) {
      vocabulary = extendVocabulary(vocabulary,fragment.facets);
      remember(fragment.facets,[...new Set(fragment.evidence.map(evidence => evidence.relativePath))].map(path => current.get(path)!));
    }
    for (const snapshot of sources) if (eligible.has(snapshot.id)) {
      const facets = sourceFacets(snapshot);
      vocabulary = extendVocabulary(vocabulary,facets); remember(facets,[snapshot]);
    }
    const beforeRequest = options.recheck || options.beforeRequest ? async (active: SourceSnapshot, requestVocabulary: Facets): Promise<void> => {
      await options.beforeRequest?.(active,requestVocabulary);
      checkAbort(options.signal);
      if (!options.recheck) return;
      const donors = new Map<string,SourceSnapshot>();
      for (const key of FACET_KEYS) for (const value of requestVocabulary[key]) {
        for (const donor of proofs.get(`${key}:${facetKey(value)}`) ?? []) if (donor.path !== active.path) donors.set(donor.path,donor);
      }
      // Read dictionary proofs first, then the current text last. In particular,
      // an asynchronous donor read must not invalidate an earlier body check.
      donors.set(active.path,active);
      for (const original of donors.values()) {
        checkAbort(options.signal);
        const fresh = await options.recheck(original);
        checkAbort(options.signal);
        if (!fresh || fresh.id !== original.id || fresh.path !== original.path || fresh.format !== original.format ||
            fresh.hash !== original.hash || fresh.privacy !== original.privacy || fresh.text !== original.text) throw new CoreError('Source notes changed during processing');
      }
    } : undefined;
    // Vocabulary is an incremental editorial hint, not a generation parameter.
    // Learned dictionary growth must not re-request unchanged originals. A
    // deliberate re-edit is requested by changing the caller's signature.
    const signature = `${CORE_REVISION}:${digest(JSON.stringify({ generation:options.signature,mode:options.mode,cloudConsent:options.cloudConsent }))}`;
    const sameGeneration = options.previous?.signature === signature, now = timestamp(options.now);
    const records: Record<string,SourceRecord> = Object.create(null), collected: Fragment[] = [];
    progress('processing');
    for (const snapshot of sources) {
      checkAbort(options.signal);
      if (completed % 16 === 0) await yieldToHost(options.signal);
      const old = options.previous?.sources[snapshot.path];
      let status: SourceStatus, fragments: Fragment[];
      if (options.mode === 'cloud-model' && snapshot.privacy !== 'normal') { status='local-only'; fragments=[]; }
      else if (!eligible.has(snapshot.id)) { status='sensitive'; fragments=[]; }
      else if (sameGeneration && old?.hash === snapshot.hash && old.status !== 'local-only' && old.fragmentIds.every(id => reusable.has(id) && options.previous!.fragments[id].evidence.some(item => item.relativePath === snapshot.path && item.sourceHash === snapshot.hash && item.sourceId === snapshot.id))) {
        status=old.status;
        fragments=old.fragmentIds.map(id => currentEvidence(options.previous!.fragments[id],snapshot));
        // Explicit local facets are regenerated from current source metadata. This
        // prevents merged tags from a deleted/edited source surviving on another.
        if (options.mode === 'local-excerpts') for (const fragment of fragments) fragment.facets = sourceFacets(snapshot);
        // AI facets retain their own verified source revision; they do not
        // depend on today's bounded request dictionary or explicit tags.
      } else {
        const result = await analyzeSource(snapshot,{ ...options,vocabulary,now,beforeRequest });
        status=result.status; fragments=result.fragments;
        if (status === 'error') throw new CoreError('Source analysis failed');
      }
      checkAbort(options.signal);
      records[snapshot.path] = { hash:snapshot.hash,status,fragmentIds:[] };
      for (const fragment of fragments) { vocabulary = extendVocabulary(vocabulary,fragment.facets); remember(fragment.facets,[snapshot]); }
      collected.push(...fragments); completed++; progress('processing');
    }
    const merged = mergeFragments(collected), fragments: Record<string,Fragment> = Object.create(null);
    for (const fragment of merged) {
      let privacy = 'normal' as SourceSnapshot['privacy'];
      for (const evidence of fragment.evidence) {
        const source = current.get(evidence.relativePath);
        if (!source || source.hash !== evidence.sourceHash || source.id !== evidence.sourceId) throw new CoreError('Staged evidence is stale');
        privacy = restrictive(privacy,source.privacy);
        const record = records[evidence.relativePath];
        if (!record.fragmentIds.includes(fragment.id)) record.fragmentIds.push(fragment.id);
      }
      fragment.privacy = privacy; fragments[fragment.id] = fragment;
    }
    for (const record of Object.values(records)) record.fragmentIds.sort();
    checkAbort(options.signal);
    const next: IndexState = { version:1,signature,updatedAt:now,sources:records,fragments };
    // No generation timestamp churn or derived rewrites on an unchanged revision.
    if (sameGeneration && JSON.stringify(records) === JSON.stringify(options.previous!.sources) && JSON.stringify(fragments) === JSON.stringify(options.previous!.fragments)) next.updatedAt = options.previous!.updatedAt;
    validatePrevious(next);
    checkAbort(options.signal); progress('done'); checkAbort(options.signal);
    return next;
  } catch (error) {
    if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) { progress('cancelled'); }
    throw error;
  }
}
