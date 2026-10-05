import { buildIndex, interpretQuery, searchFragments, vocabularyOf } from './core/index';
import { emptyIndex } from './core/types';
import type { Breadth, Evidence, IndexState, ModelPort, Privacy, RunProgress, SearchResult, SourceSnapshot, StorePort } from './core/types';
import { currentEvidence, type SourcePort } from './sources';
import { generationSignature, type Settings } from './settings';
export interface Status {
  phase: 'loading' | 'idle' | 'indexing' | 'searching' | 'error' | 'cancelled';
  sourceCount: number; fragmentCount: number; updatedAt: string; mode: Settings['mode'];
  progress?: RunProgress; errorCode?: 'operation-failed' | 'index-unavailable'; warningCode?: 'schedule-not-saved';
}
export class ThirdBrainController {
  private indexState: IndexState = emptyIndex();
  private task: AbortController | null = null;
  private ready = false;
  private taskMode: Settings['mode'] = 'local-excerpts';
  private listeners = new Set<() => void>();
  private state: Status;
  constructor(private readonly sources: SourcePort, private readonly store: StorePort,
    private readonly settings: () => Settings, private readonly model: (settings: Readonly<Settings>) => ModelPort | undefined,
    private readonly saved: (when: string) => Promise<void>) {
    this.state = { phase: 'loading', sourceCount: 0, fragmentCount: 0, updatedAt: '', mode: settings().mode };
  }
  status(): Status { return { ...this.state, mode: this.task ? this.taskMode : this.settings().mode }; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private update(phase: Status['phase'], progress?: RunProgress, errorCode?: Status['errorCode'], warningCode?: Status['warningCode']): void {
    this.state = { phase, sourceCount: Object.keys(this.indexState.sources).length, fragmentCount: Object.keys(this.indexState.fragments).length, updatedAt: this.indexState.updatedAt, mode: this.task ? this.taskMode : this.settings().mode, progress, errorCode, warningCode };
    this.listeners.forEach(listener => listener());
  }
  async initialize(): Promise<void> {
    this.ready = false;
    try { await this.store.recover(); this.indexState = await this.store.load() ?? emptyIndex(); this.ready = true; this.update('idle'); }
    catch { this.update('error', undefined, 'index-unavailable'); throw new Error('The generated index needs review before it can be used. Original notes are untouched.'); }
  }
  cancel(): void { this.task?.abort(); }
  async refresh(): Promise<void> {
    if (!this.ready) throw new Error('Review the generated index before refreshing.');
    if (this.task) throw new Error('A task is already running.');
    const options = { ...this.settings(), excludes: [...this.settings().excludes] };
    const task = new AbortController(); this.task = task; this.taskMode = options.mode; this.update('indexing', { completed: 0, total: 0, phase: 'reading' });
    try {
      const model = this.model(options);
      const sources = await this.sources.list();
      const next = await buildIndex(sources, { mode: options.mode, cloudConsent: options.cloudConsent, model, previous: this.indexState, signature: generationSignature(options), signal: task.signal, onProgress: p => this.update('indexing', p) });
      if (task.signal.aborted) throw new Error('Cancelled.');
      await this.store.commit(next, () => this.sources.verify(sources), task.signal);
      this.indexState = next;
      let warning: Status['warningCode'];
      try { await this.saved(new Date().toISOString()); } catch { warning = 'schedule-not-saved'; }
      this.update('idle', undefined, undefined, warning);
    } catch { this.update(task.signal.aborted ? 'cancelled' : 'error', undefined, task.signal.aborted ? undefined : 'operation-failed'); throw new Error(task.signal.aborted ? 'Cancelled. The previous complete index remains available.' : 'Indexing did not complete. The previous complete index remains available; review configuration, model availability and protected-file conflicts.'); }
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
      const fragments = Object.values(this.indexState.fragments);
      let facets;
      if (settings.mode !== 'local-excerpts' && !(settings.mode === 'cloud-model' && privacy !== 'normal')) {
        let vocabularyFragments = fragments;
        if (settings.mode === 'cloud-model') {
          const live = new Map<string, SourceSnapshot | null>(); vocabularyFragments = [];
          for (const fragment of fragments) {
            if (fragment.privacy !== 'normal' || !fragment.evidence.length) continue;
            let safe = true;
            for (const evidence of fragment.evidence) {
              if (task.signal.aborted) throw new Error('Cancelled.');
              if (!live.has(evidence.relativePath)) live.set(evidence.relativePath, await this.sources.read(evidence.relativePath));
              const source = live.get(evidence.relativePath);
              if (!source || source.privacy !== 'normal' || source.id !== evidence.sourceId || source.hash !== evidence.sourceHash) { safe = false; break; }
            }
            if (safe && (await currentEvidence(fragment.evidence, this.sources)).length === fragment.evidence.length) vocabularyFragments.push(fragment);
          }
        }
        const port = this.model(settings); if (port) facets = await interpretQuery(query, port, vocabularyOf(vocabularyFragments, settings.mode === 'cloud-model'), task.signal);
      }
      const ranked = searchFragments(fragments, query, { breadth, limit: 30, facets });
      const results: SearchResult[] = [];
      for (const result of ranked) {
        if (task.signal.aborted) throw new Error('Cancelled.');
        const evidence = await currentEvidence(result.fragment.evidence, this.sources);
        // Facets and editorial text are unioned without per-donor attribution.
        // Partial provenance cannot establish that the remaining donor supports
        // every cached label, so stale merged claims wait for a full refresh.
        if (evidence.length === result.fragment.evidence.length) results.push({ ...result, fragment: { ...result.fragment, evidence } });
        if (results.length >= 7) break;
      }
      this.update('idle'); return results;
    } catch { this.update(task.signal.aborted ? 'cancelled' : 'error', undefined, task.signal.aborted ? undefined : 'operation-failed'); throw new Error(task.signal.aborted ? 'Cancelled.' : 'Search did not complete. Check the configured model or switch to local excerpts.'); }
    finally { this.task = null; }
  }
  async verifyOpen(evidence: Evidence): Promise<void> {
    if (!(await currentEvidence([evidence], this.sources)).length) throw new Error('This source changed or is no longer available. Refresh the index before opening this quotation.');
  }
  async snapshot(path: string): Promise<SourceSnapshot | null> { return this.sources.read(path); }
  dispose(): void { this.cancel(); this.ready = false; this.listeners.clear(); }
}
