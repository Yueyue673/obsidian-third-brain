import { buildIndex, interpretQuery, searchFragments, vocabularyOf } from './core/index';
import { emptyIndex } from './core/types';
import type { Breadth, Evidence, Fragment, IndexState, IndirectMechanism, ModelPort, Privacy, RelationEndpoint, RelationReason, RunProgress, SearchResult, SourceSnapshot, StorePort } from './core/types';
import { abortError, cancellable, checkAbort, facetKey, relativePath } from './core/util';
import { sourceDiagnostic, type SourceDiagnostic } from './core/source-diagnostics';
import { currentEvidence, type SourcePort } from './sources';
import { generationSignature, type Settings } from './settings';
export interface Status {
  phase: 'loading' | 'idle' | 'indexing' | 'searching' | 'error' | 'cancelled';
  sourceCount: number; fragmentCount: number; updatedAt: string; mode: Settings['mode'];
  progress?: RunProgress; errorCode?: 'operation-failed' | 'index-unavailable'; warningCode?: 'schedule-not-saved';
  hasCompleteIndex?: boolean;
  sourceDiagnostic?: SourceDiagnostic;
  commitOutcome?: 'not-started' | 'unknown';
}
export class ThirdBrainController {
  private indexState: IndexState = emptyIndex();
  private task: AbortController | null = null;
  private ready = false;
  private hasCompleteIndex = false;
  private taskMode: Settings['mode'] = 'local-excerpts';
  private listeners = new Set<() => void>();
  // Bind the exact rendered quotation objects to complete query-time traces.
  // Weak keys also protect still-visible old cards during a cancelled new search.
  private readonly openTraces = new WeakMap<Evidence, IndirectMechanism[]>();
  private state: Status;
  constructor(private readonly sources: SourcePort, private readonly store: StorePort,
    private readonly settings: () => Settings, private readonly model: (settings: Readonly<Settings>) => ModelPort | undefined,
    private readonly saved: (when: string) => Promise<void>) {
    this.state = { phase: 'loading', sourceCount: 0, fragmentCount: 0, updatedAt: '', mode: settings().mode };
  }
  status(): Status { return { ...this.state, ...(this.state.progress ? { progress:{ ...this.state.progress } } : {}), ...(this.state.sourceDiagnostic ? { sourceDiagnostic:{ ...this.state.sourceDiagnostic } } : {}), mode: this.task ? this.taskMode : this.settings().mode }; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private update(phase: Status['phase'], progress?: RunProgress, errorCode?: Status['errorCode'], warningCode?: Status['warningCode'], diagnostic?: SourceDiagnostic, commitOutcome?: Status['commitOutcome']): void {
    this.state = { phase, sourceCount: Object.keys(this.indexState.sources).length, fragmentCount: Object.keys(this.indexState.fragments).length, updatedAt: this.indexState.updatedAt, mode: this.task ? this.taskMode : this.settings().mode, progress, errorCode, warningCode, hasCompleteIndex:this.hasCompleteIndex, sourceDiagnostic:diagnostic, commitOutcome };
    this.listeners.forEach(listener => listener());
  }
  async initialize(): Promise<void> {
    this.ready = false;
    try { await this.store.recover(); const loaded = await this.store.load(); this.hasCompleteIndex = loaded !== null; this.indexState = loaded ?? emptyIndex(); this.ready = true; this.update('idle'); }
    catch { this.update('error', undefined, 'index-unavailable'); throw new Error('The generated index needs review before it can be used. Original notes are untouched.'); }
  }
  cancel(): void { this.task?.abort(); }
  async refresh(): Promise<void> {
    if (!this.ready) throw new Error('Review the generated index before refreshing.');
    if (this.task) throw new Error('A task is already running.');
    const options = { ...this.settings(), excludes: [...this.settings().excludes] };
    const task = new AbortController(); this.task = task; this.taskMode = options.mode; this.update('indexing', { completed: 0, total: 0, phase: 'reading' });
    let commitStarted = false;
    const progress = (p: RunProgress): void => {
      if (this.task !== task || task.signal.aborted || !this.ready || p.phase === 'cancelled') return;
      if (!Number.isSafeInteger(p.completed) || !Number.isSafeInteger(p.total) || p.completed < 0 || p.total < p.completed || !['reading','processing','committing','done'].includes(p.phase)) return;
      let path: string | undefined;
      try { if (p.relativePath) { relativePath(p.relativePath); if (!/[\u202a-\u202e\u2066-\u2069]/u.test(p.relativePath)) path = p.relativePath; } } catch { /* Untrusted progress paths are not displayed. */ }
      const checked: RunProgress = { completed:p.completed,total:p.total,phase:p.phase,...(path ? { relativePath:path } : {}) };
      // Core done means staging finished, not durable commit success.
      this.update('indexing',checked.phase === 'done' ? { ...checked,phase:'processing' } : checked);
    };
    try {
      const model = this.model(options);
      const sources = await cancellable(() => this.sources.list({ signal:task.signal,onProgress:progress }),task.signal);
      checkAbort(task.signal);
      const next = await buildIndex(sources, { mode: options.mode, cloudConsent: options.cloudConsent, model, previous: this.indexState, signature: generationSignature(options), signal: task.signal, onProgress:progress,
        // Only modes that may send source text re-read the note at its request
        // boundary; local excerpts never leave the process.
        recheck: options.mode === 'local-excerpts' ? undefined : snapshot => cancellable(() => this.sources.read(snapshot.path,{ signal:task.signal }),task.signal) });
      checkAbort(task.signal);
      progress({ completed:sources.length,total:sources.length,phase:'committing' }); checkAbort(task.signal);
      commitStarted = true;
      await this.store.commit(next, () => this.sources.verify(sources,{ signal:task.signal }), task.signal);
      checkAbort(task.signal);
      this.indexState = next; this.hasCompleteIndex = true;
      let warning: Status['warningCode'];
      try { await this.saved(new Date().toISOString()); } catch { warning = 'schedule-not-saved'; }
      this.update('idle', undefined, undefined, warning);
    } catch (error) {
      const cancelled = task.signal.aborted || (error instanceof Error && error.name === 'AbortError');
      const diagnostic = cancelled ? undefined : sourceDiagnostic(error);
      this.update(cancelled ? 'cancelled' : 'error',this.state.progress,cancelled ? undefined : 'operation-failed',undefined,diagnostic,commitStarted ? 'unknown' : diagnostic ? 'not-started' : undefined);
      if (cancelled) { const stopped = abortError(); stopped.message = 'Cancelled.'; throw stopped; }
      throw error;
    }
    finally { this.task = null; }
  }
  async find(query: string, breadth: Breadth, privacy: Privacy = 'normal'): Promise<SearchResult[]> {
    if (!this.ready) throw new Error('Review the generated index before searching.');
    if (this.task) throw new Error('A task is already running.');
    if (!query.trim()) return [];
    if (query.length > 20000) throw new Error('Use a shorter idea or an editor selection.');
    const settings = { ...this.settings(), excludes: [...this.settings().excludes] };
    const task = new AbortController(); this.task = task; this.taskMode = settings.mode; this.update('searching');
    try {
      const currentSources: SourcePort = {
        list:options => this.sources.list(options),read:path => this.readAtStep(path,task.signal),
        verify:(snapshots,options) => this.sources.verify(snapshots,options),excluded:paths => this.sources.excluded(paths),
      };
      const fragments = Object.values(this.indexState.fragments);
      let facets;
      if (settings.mode !== 'local-excerpts' && !(settings.mode === 'cloud-model' && privacy !== 'normal')) {
        const port = this.model(settings);
        if (port) {
          const blocked = await this.sources.excluded([...new Set(fragments.flatMap(fragment => fragment.evidence.map(item => item.relativePath)))]);
          if (task.signal.aborted) throw new Error('Cancelled.');
          let vocabularyFragments: Fragment[];
          if (settings.mode === 'cloud-model') {
            const live = new Map<string, SourceSnapshot | null>(); const candidates: Fragment[] = [];
            for (const fragment of fragments) if (await this.cloudSafe(fragment, blocked, live, task.signal)) candidates.push(fragment);
            // Re-verify every donor immediately before sending: a source that
            // became private, changed or was excluded while later fragments
            // were being read must not enter the request. This narrows the
            // check-to-send window; it cannot eliminate it.
            const recheck = new Map<string, SourceSnapshot | null>(); vocabularyFragments = [];
            for (const fragment of candidates) if (await this.cloudSafe(fragment, blocked, recheck, task.signal)) vocabularyFragments.push(fragment);
          } else {
            // A locally configured model is a live library lookup: labels from a
            // currently excluded folder or the derived layer are no longer sources.
            vocabularyFragments = fragments.filter(fragment => !fragment.evidence.some(item => blocked.has(item.relativePath)));
          }
          facets = await interpretQuery(query, port, vocabularyOf(vocabularyFragments, settings.mode === 'cloud-model'), task.signal);
        }
      }
      const ranked = searchFragments(fragments, query, { breadth, limit: 30, facets, index: this.indexState, retainIndirectCandidates: breadth === 'high' });
      const results: SearchResult[] = [];
      const validate = async (result: SearchResult, suggestion = false): Promise<SearchResult | null> => {
        if (task.signal.aborted) throw new Error('Cancelled.');
        const evidence = await currentEvidence(result.fragment.evidence, currentSources);
        // Facets and editorial text are unioned without per-donor attribution.
        // Partial provenance cannot establish that the remaining donor supports
        // every cached label, so stale merged claims wait for a full refresh.
        if (evidence.length !== result.fragment.evidence.length) return null;
        const traceTarget = result.reasons.find(r => r.kind === 'indirect-mechanism')?.indirect?.target;
        if (traceTarget && !(await this.currentEndpoint(traceTarget, task.signal))) return null;
        const reasons: RelationReason[] = []; let targetCurrent = true;
        for (const reason of result.reasons) {
          if (reason.kind !== 'indirect-mechanism') { reasons.push(reason); continue; }
          const trace = reason.indirect;
          if (!trace || trace.target.fragmentId !== result.fragment.id || !this.traceMembers(trace)) continue;
          // Read both complete donors again for each suggestion. Do not reuse
          // earlier ranking/cloud reads across asynchronous source changes.
          const anchorCurrent = await this.currentEndpoint(trace.anchor, task.signal);
          if (!(await this.currentEndpoint(trace.target, task.signal))) { targetCurrent = false; break; }
          // A target read can invalidate an earlier anchor. Recheck the anchor
          // before accepting its explanation; no source port offers atomic reads.
          if (anchorCurrent && await this.currentEndpoint(trace.anchor, task.signal)) reasons.push(reason);
        }
        if (traceTarget && !(await this.currentEndpoint(traceTarget, task.signal))) targetCurrent = false;
        if (task.signal.aborted) throw new Error('Cancelled.');
        // Indirect explanations add no bonus to direct scores. Pure indirect
        // results disappear if their anchor failed, rather than keeping a score.
        if (!targetCurrent || !reasons.length || (suggestion && !reasons.some(r => r.kind === 'indirect-mechanism'))) return null;
        return { ...result,reasons,fragment:{ ...result.fragment,evidence },...(suggestion ? { group:'indirect-suggestion' as const } : {}) };
      };
      for (const result of ranked) {
        const current = await validate(result); if (current) results.push(current);
        if (results.length >= 7) break;
      }
      const shown = new Set(results.map(r => r.fragment.id)); let suggestions = 0;
      for (const result of ranked.indirectCandidates ?? []) {
        if (shown.has(result.fragment.id)) continue;
        const current = await validate(result,true);
        if (!current) continue;
        results.push(current); shown.add(current.fragment.id);
        if (++suggestions >= 2) break;
      }
      if (task.signal.aborted) throw new Error('Cancelled.');
      const bindings = new Map<Evidence, IndirectMechanism[]>();
      for (const result of results) for (const reason of result.reasons) if (reason.indirect) {
        const trace = structuredClone(reason.indirect);
        for (const e of [...reason.indirect.anchor.evidence,...reason.indirect.target.evidence,...result.fragment.evidence]) {
          bindings.set(e,[...(bindings.get(e) ?? []),trace]);
        }
      }
      for (const [e,traces] of bindings) this.openTraces.set(e,traces);
      this.update('idle');
      if (task.signal.aborted) throw new Error('Cancelled.');
      return results;
    } catch (error) {
      this.update(task.signal.aborted ? 'cancelled' : 'error',this.state.progress,task.signal.aborted ? undefined : 'operation-failed',undefined,task.signal.aborted ? undefined : sourceDiagnostic(error));
      if (task.signal.aborted) { const stopped = abortError(); stopped.message = 'Cancelled.'; throw stopped; }
      throw error;
    }
    finally { this.task = null; }
  }
  private traceMembers(trace: IndirectMechanism): boolean {
    if (trace.steps !== 1 || trace.anchor.privacy !== trace.target.privacy || trace.anchor.fragmentId === trace.target.fragmentId || !trace.sharedMechanisms.length) return false;
    return [trace.anchor,trace.target].every(e => {
      const f = this.indexState.fragments[e.fragmentId];
      return !!f && trace.sharedMechanisms.every(m => f.facets.mechanisms.some(v => facetKey(v) === facetKey(m)));
    });
  }
  private async readAtStep(path: string, signal: AbortSignal): Promise<SourceSnapshot | null> {
    checkAbort(signal); relativePath(path);
    if (this.task?.signal === signal && !signal.aborted) this.update('searching',{ completed:0,total:0,phase:'reading',relativePath:path });
    return cancellable(() => this.sources.read(path,{ signal }),signal);
  }
  private async currentEndpoint(endpoint: RelationEndpoint, signal: AbortSignal): Promise<boolean> {
    const fragment = this.indexState.fragments[endpoint.fragmentId];
    if (!fragment || !endpoint.evidence.length || fragment.privacy !== endpoint.privacy || fragment.title !== endpoint.title
      || JSON.stringify(fragment.conditions) !== JSON.stringify(endpoint.conditions) || JSON.stringify(fragment.caveats) !== JSON.stringify(endpoint.caveats)
      || JSON.stringify(fragment.evidence) !== JSON.stringify(endpoint.evidence)) return false;
    const paths = [...new Set(endpoint.evidence.map(e => e.relativePath))];
    const blocked = await this.sources.excluded(paths);
    const live = new Map<string, SourceSnapshot | null>();
    for (const evidence of endpoint.evidence) {
      if (signal.aborted) throw new Error('Cancelled.');
      const record = this.indexState.sources[evidence.relativePath];
      if (blocked.has(evidence.relativePath) || record?.status !== 'indexed' || record.hash !== evidence.sourceHash || !record.fragmentIds.includes(endpoint.fragmentId)) return false;
      if (!live.has(evidence.relativePath)) live.set(evidence.relativePath, await this.readAtStep(evidence.relativePath,signal));
      const source = live.get(evidence.relativePath);
      if (source?.privacy !== endpoint.privacy || source.path !== evidence.relativePath) return false;
    }
    const evidence = await currentEvidence(endpoint.evidence, this.sources, live);
    const excluded = await this.sources.excluded(paths);
    if (signal.aborted) throw new Error('Cancelled.');
    return evidence.length === endpoint.evidence.length && !paths.some(p => excluded.has(p));
  }
  /** A cloud dictionary entry is only usable while its exact donors are current, ordinary and part of the live library. */
  private async cloudSafe(fragment: Fragment, blocked: Set<string>, live: Map<string, SourceSnapshot | null>, signal: AbortSignal): Promise<boolean> {
    if (fragment.privacy !== 'normal' || !fragment.evidence.length) return false;
    for (const evidence of fragment.evidence) {
      if (signal.aborted) throw new Error('Cancelled.');
      if (blocked.has(evidence.relativePath)) return false;
      if (!live.has(evidence.relativePath)) live.set(evidence.relativePath, await this.readAtStep(evidence.relativePath,signal));
      const source = live.get(evidence.relativePath);
      if (!source || source.privacy !== 'normal' || source.id !== evidence.sourceId || source.hash !== evidence.sourceHash) return false;
    }
    return (await currentEvidence(fragment.evidence, this.sources, live)).length === fragment.evidence.length;
  }
  async verifyOpen(evidence: Evidence): Promise<void> {
    const signal = new AbortController().signal;
    for (const trace of this.openTraces.get(evidence) ?? []) {
      if (!this.traceMembers(trace) || !(await this.currentEndpoint(trace.anchor,signal)) || !(await this.currentEndpoint(trace.target,signal))
        || !(await this.currentEndpoint(trace.anchor,signal)) || !(await this.currentEndpoint(trace.target,signal))) {
        throw new Error('This source changed or is no longer available. Refresh the index before opening this quotation.');
      }
    }
    const paths = [evidence.relativePath];
    const blocked = await this.sources.excluded(paths);
    if (blocked.has(evidence.relativePath) || !(await currentEvidence([evidence], this.sources)).length
      || (await this.sources.excluded(paths)).has(evidence.relativePath)) throw new Error('This source changed or is no longer available. Refresh the index before opening this quotation.');
  }
  async snapshot(path: string): Promise<SourceSnapshot | null> { return this.sources.read(path); }
  dispose(): void { this.cancel(); this.ready = false; this.listeners.clear(); }
}
