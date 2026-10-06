import type { Breadth, Evidence, QuerySelection, Privacy, SearchResult } from './core/types';
import { QUERY_KINDS } from './core/types';
import { SourceEvidenceUnavailableError } from './core/source-diagnostics';
import { generatedFileDiagnostic } from './core/generated-diagnostics';
import { storeDiagnostic } from './core/store-diagnostics';
import type { Status } from './controller';
import { messages } from './i18n';
import { presentExplanation, presentFailure } from './presentation';
export interface PanelPort {
  // Host-session feedback only; absent on adapters without automatic maintenance.
  status(): Status & { scheduledRefreshPaused?: boolean }; subscribe(listener: () => void): () => void;
  refresh(): Promise<void>; find(query: string, breadth: Breadth, privacy?: Privacy, selection?: QuerySelection): Promise<SearchResult[]>;
  cancel(): void; current?(): Promise<{ text: string; privacy: Privacy } | null>;
  open(evidence: Evidence): Promise<void>;
  openFragment?(id: string): Promise<void>;
}
// A host-owned recovery signal. Never classify failures by external names/messages.
export class CurrentNoteTooLongError extends Error {
  constructor() { super('Select a shorter excerpt before using current-note context.'); this.name = 'CurrentNoteTooLongError'; }
}
export class SourceLocationUnavailableError extends Error {
  constructor() { super('The opened editor cannot locate this quotation.'); this.name = 'SourceLocationUnavailableError'; }
}
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el;
}
export function mountPanel(container: HTMLElement, port: PanelPort, locale: 'auto' | 'en' | 'zh' = 'auto'): () => void {
  const t = messages(locale); const root = element('section', 'third-brain-panel');
  const heading = element('header', 'tb-heading'); heading.append(element('h2', '', t.title), element('p', 'tb-muted', t.subtitle));
  const status = element('div', 'tb-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const stats = element('p', 'tb-muted tb-stats');
  const label = element('label', 'tb-label', t.idea); const id = `tb-idea-${Math.random().toString(36).slice(2)}`; label.htmlFor = id;
  const input = element('textarea', 'tb-idea'); input.id = id; input.rows = 4; input.placeholder = t.placeholder; input.maxLength = 20000;
  const ideaHint = element('p', 'tb-muted tb-idea-hint', t.ideaHint); ideaHint.id = `${id}-hint`;
  input.setAttribute('aria-describedby', ideaHint.id); input.setAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter');
  const options = element('div', 'tb-options'); const breadthLabel = element('label', 'tb-breadth-label', t.breadth);
  const breadth = element('select', 'tb-select'); breadth.setAttribute('aria-label', t.breadth);
  for (const [value, text] of [['low', t.low], ['medium', t.medium], ['high', t.high]]) { const option = element('option', '', text); option.value = value; breadth.append(option); }
  breadth.value = 'medium'; breadthLabel.append(breadth); options.append(breadthLabel);
  const current = element('button', 'tb-secondary', t.current); current.type = 'button'; if (port.current) options.append(current);
  const privacyHint = element('p', 'tb-muted tb-privacy', t.private); privacyHint.hidden = true;
  const actions = element('div', 'tb-actions'); const find = element('button', 'tb-primary', t.find); find.type = 'button';
  const refresh = element('button', 'tb-secondary', t.index); refresh.type = 'button'; const cancel = element('button', 'tb-secondary', t.cancel); cancel.type = 'button'; cancel.hidden = true; actions.append(find, refresh, cancel);
  const notice = element('p', 'tb-notice'); notice.setAttribute('role', 'alert'); notice.hidden = true;
  const results = element('div', 'tb-results'); const summary = element('p', 'tb-result-summary'); summary.setAttribute('aria-live', 'polite');
  root.append(heading, status, stats, label, input, ideaHint, options, privacyHint, actions, notice, summary, results); container.replaceChildren(root);
  let queryPrivacy: Privacy = 'normal'; let searchId = 0; let disposed = false; let hasSearched = false; let resultsArePrevious = false;
  let currentReadId: number | undefined;
  let previousPhase: Status['phase'] | undefined;
  let selection: QuerySelection | undefined;
  // Old cards remain readable during work, but cannot steal the active query/token.
  let facetButtons: HTMLButtonElement[] = [];
  const isBusy = (phase: Status['phase']): boolean => ['indexing', 'searching', 'loading'].includes(phase);
  const kindLabel = (value: string): string => t[`kind_${value}` as keyof typeof t];
  const selectionHint = (): string => !selection ? '' : selection.channel === 'mechanisms' && breadth.value === 'low' ? t.mechanismBreadth : selection.channel === 'atmosphere' && breadth.value !== 'high' ? t.atmosphereBreadth : '';
  const alert = (text: string): void => { notice.textContent = text; notice.hidden = false; };
  const generatedCopy = { missing: t.generatedFileMissing, changed: t.generatedFileChanged, unavailable: t.generatedFileUnavailable };
  const openResult = (operation: () => Promise<void>, recoveredNotices: string[]): void => {
    const id = searchId, phaseAtOpen = port.status().phase;
    const canReport = (): boolean => {
      if (disposed || id !== searchId) return false;
      const phase = port.status().phase;
      return !isBusy(phase) && phase !== 'error' && (phase !== 'cancelled' || phaseAtOpen === 'cancelled');
    };
    void operation().then(() => {
      // Opening saved Markdown does not prove that its original evidence recovered.
      if (canReport() && [...recoveredNotices,t.storeBusy].includes(notice.textContent ?? '')) notice.hidden = true;
    }).catch(error => {
      // Keep current task diagnostics; a late old-card reply cannot replace them.
      // Only program-owned diagnostics/classes select recovery copy, never messages.
      const generated = generatedFileDiagnostic(error);
      if (canReport()) alert(generated ? generatedCopy[generated] : storeDiagnostic(error) === 'busy' ? t.storeBusy : error instanceof SourceEvidenceUnavailableError ? t.sourceEvidenceUnavailable : error instanceof SourceLocationUnavailableError ? t.sourceLocationUnavailable : t.failure);
    });
  };
  const openSource = (source: Evidence): void => openResult(() => port.open(source), [t.sourceLocationUnavailable, t.sourceEvidenceUnavailable]);
  const stateBlock = (title: string, body: string): void => { facetButtons = []; results.replaceChildren(element('h3', 'tb-empty-title', title), element('p', 'tb-muted', body)); };
  // Keep readable evidence, but do not present it as a reply to the new intent.
  // Only transient display state is kept; no query text or input history is stored.
  const markPreviousResults = (): void => {
    if (summary.textContent && !resultsArePrevious) {
      summary.textContent = `${t.previousResults} · ${summary.textContent}`; resultsArePrevious = true;
    }
  };
  const renderState = (): void => {
    if (disposed) return;
    const state = port.status(); const busy = isBusy(state.phase);
    const cancelling = busy && state.cancelRequested === true;
    // Current-note reads are outside the controller's task. New work retires
    // their delivery token, without invalidating the accepted search itself.
    if (busy || currentReadId !== searchId) currentReadId = undefined;
    const readingCurrent = currentReadId !== undefined;
    // Every refresh entry (panel, command or schedule) reports completion here.
    // Clear only on success, not processing progress, cancellation or failure.
    if (previousPhase === 'indexing' && state.phase === 'idle') {
      ++searchId; hasSearched = false; summary.textContent = ''; resultsArePrevious = false;
    }
    previousPhase = state.phase;
    if (busy || state.phase === 'idle') notice.hidden = true;
    for (const button of facetButtons) button.disabled = busy;
    find.disabled = busy || !input.value.trim() || !state.fragmentCount; find.hidden = !state.fragmentCount; refresh.className = state.fragmentCount ? 'tb-secondary' : 'tb-primary'; refresh.disabled = busy; current.disabled = busy; breadth.disabled = busy; cancel.hidden = !readingCurrent && (!busy || state.phase === 'loading');
    const mode = state.mode === 'local-excerpts' ? t.local : state.mode === 'local-model' ? t.localModel : t.cloud;
    cancel.disabled = cancelling;
    let line = cancelling ? (state.progress?.phase === 'committing' ? t.cancellingCommit : t.cancelling) : readingCurrent ? t.contextReading : t[state.phase];
    if (!readingCurrent && state.progress) line += ` · ${t.lastStep}: ${t[state.progress.phase]}${state.progress.total ? ` ${state.progress.completed} / ${state.progress.total}` : ''}${state.progress.relativePath ? ` · ${state.progress.relativePath}` : ''}`;
    status.textContent = `${line} · ${mode}${state.scheduledRefreshPaused ? ` · ${t.schedulePaused}` : ''}`;
    label.textContent = selection ? `${t.selectedFacet}: ${t[selection.channel]} · ${selection.channel === 'kind' ? kindLabel(selection.value) : selection.value}` : t.idea;
    stats.textContent = `${state.sourceCount} ${t.sources} · ${state.fragmentCount} ${t.fragments}${state.updatedAt ? ` · ${t.updated} ${new Date(state.updatedAt).toLocaleString()}` : ''}`;
    if (state.phase === 'error') alert(presentFailure(state, locale));
    if (state.phase === 'cancelled') alert(`${t.cancelled}.${state.commitOutcome === 'unknown' ? ` ${t.commitUnknown}` : state.hasCompleteIndex === false ? ` ${t.noCompleteIndex}` : ''}`);
    if (state.warningCode === 'schedule-not-saved') alert(t.scheduleWarning);
    if (!busy && state.phase === 'idle' && selectionHint()) alert(selectionHint());
    if (!hasSearched && !busy) {
      if (state.fragmentCount) stateBlock(t.initial, '');
      else if (state.phase !== 'idle') stateBlock(t[state.phase], '');
      // A complete, durably loaded/saved empty index is not a first-use state.
      // Do not infer completion from counts, timestamps or processing progress.
      else if (state.hasCompleteIndex === true) stateBlock(t.emptyIndex, state.sourceCount ? t.emptyIndexBody : t.noSourcesBody);
      else stateBlock(t.first, t.firstBody);
    }
  };
  const showResults = (items: SearchResult[]): void => {
    results.replaceChildren(); facetButtons = []; resultsArePrevious = false;
    const suggestions = items.filter(item => item.group === 'indirect-suggestion');
    summary.textContent = `${items.length - suggestions.length} ${t.results}${suggestions.length ? ` · ${suggestions.length} ${presentExplanation('Additional indirect suggestions',locale)}` : ''}`;
    if (selection?.channel === 'kind') summary.textContent = `${items.length} ${t.sameType} · ${t.kindBudget}`;
    if (!items.length) { stateBlock(selection?.channel === 'kind' ? t.kindEmpty : t.empty, selection?.channel === 'kind' ? t.kindEmptyBody : t.emptyBody); return; }
    const main = element('div','tb-main-results'); results.append(main);
    const indirect = element('section','tb-suggestions');
    if (suggestions.length) {
      indirect.append(element('hr'),element('h3','tb-small-heading',presentExplanation('Indirect suggestions via the existing network',locale)),element('p','tb-muted',presentExplanation('At most two additional one-hop suggestions; not query-mechanism equivalence. Compare both sources and conditions.',locale)));
      results.append(indirect);
    }
    for (const item of items) {
      const fragment = item.fragment; const article = element('article', 'tb-result');
      const top = element('div', 'tb-result-top'); top.append(element('h3', 'tb-result-title', fragment.title), element('span', 'tb-kind', fragment.mode === 'ai' ? t.ai : t.excerpt));
      article.append(top, element('p', 'tb-fragment', fragment.summary));
      if (port.openFragment) {
        const open = element('button', 'tb-secondary', t.openFragment); open.type = 'button';
        open.addEventListener('click', () => openResult(() => port.openFragment!(fragment.id), Object.values(generatedCopy)));
        article.append(open);
      }
      if (item.reasons.length) {
        const why = element('div', 'tb-reasons'); why.append(element('h4', 'tb-small-heading', t.related));
        for (const reason of item.reasons) {
          why.append(element('p', 'tb-reason', presentExplanation(reason.label, locale)));
          if (reason.caveat) why.append(element('p', 'tb-caveat', `${t.caveat}: ${presentExplanation(reason.caveat, locale)}`));
          if (reason.kind === 'indirect-mechanism' && reason.indirect) {
            const trace = element('details', 'tb-indirect-evidence');
            trace.append(element('summary', '', presentExplanation('Compare both original sources', locale)));
            for (const [role, endpoint] of [['Anchor source: ', reason.indirect.anchor], ['Suggested source: ', reason.indirect.target]] as const) {
              const side = element('div', 'tb-evidence-row');
              side.append(element('h4', 'tb-small-heading', presentExplanation(role, locale) + endpoint.title));
              if (endpoint.conditions.length) side.append(element('p', 'tb-muted', `${t.conditions}: ${endpoint.conditions.join(' · ')}`));
              for (const caveat of endpoint.caveats) side.append(element('p', 'tb-caveat', `${t.caveat}: ${presentExplanation(caveat, locale)}`));
              for (const source of endpoint.evidence) {
                side.append(element('blockquote', 'tb-quote', source.quote));
                const open = element('button', 'tb-source', `${t.source} · ${source.relativePath}`); open.type = 'button';
                open.addEventListener('click', () => openSource(source)); side.append(open);
              }
              trace.append(side);
            }
            why.append(trace);
          }
        }
        article.append(why);
      }
      if (fragment.conditions.length) article.append(element('p', 'tb-muted', `${t.conditions}: ${fragment.conditions.join(' · ')}`));
      for (const caveat of fragment.caveats) article.append(element('p', 'tb-caveat', `${t.caveat}: ${presentExplanation(caveat, locale)}`));
      const facets = element('div', 'tb-facets'); facets.setAttribute('aria-label', t.facets);
      if (QUERY_KINDS.includes(fragment.kind as typeof QUERY_KINDS[number])) {
        const chosen = { channel:'kind' as const,value:fragment.kind as typeof QUERY_KINDS[number] };
        const button = element('button','tb-facet',`${t.kind} · ${kindLabel(chosen.value)}`); button.type = 'button';
        button.setAttribute('data-channel','kind'); button.setAttribute('aria-label',`${t.facets}: ${t.kind} · ${kindLabel(chosen.value)}`);
        button.addEventListener('click', () => { if (disposed || isBusy(port.status().phase)) return; selection = chosen; input.value = kindLabel(chosen.value); queryPrivacy = fragment.privacy; privacyHint.textContent = t.private; privacyHint.hidden = queryPrivacy === 'normal'; void executeSearch(); }); facetButtons.push(button); facets.append(button);
      }
      const terms = (['topics','concepts','mechanisms','atmosphere'] as const).flatMap(channel => [...new Set(fragment.facets[channel])].map(value => ({ channel,value })));
      // Keep the compact preview, but never discard later channels or properties.
      const previewLimit = 12;
      const overflow = element('details', 'tb-facet-overflow');
      const moreFacets = element('div', 'tb-facets'); moreFacets.setAttribute('aria-label', t.facets);
      if (terms.length > previewLimit) overflow.append(element('summary', '', `${t.moreFacets} · ${terms.length - previewLimit}`), moreFacets);
      for (const [index, chosen] of terms.entries()) {
        const button = element('button', 'tb-facet', `${t[chosen.channel]} · ${chosen.value}`); button.type = 'button';
        button.setAttribute('aria-label', `${t.facets}: ${t[chosen.channel]} · ${chosen.value}`); button.setAttribute('data-channel', chosen.channel);
        button.addEventListener('click', () => { if (disposed || isBusy(port.status().phase)) return; selection = chosen; input.value = chosen.value; queryPrivacy = fragment.privacy; privacyHint.textContent = t.private; privacyHint.hidden = queryPrivacy === 'normal'; void executeSearch(); }); facetButtons.push(button); (index < previewLimit ? facets : moreFacets).append(button);
      }
      if (facets.childElementCount) article.append(facets);
      if (terms.length > previewLimit) article.append(overflow);
      const evidence = element('details', 'tb-evidence'); evidence.append(element('summary', '', `${t.evidence} · ${fragment.evidence.length}`));
      for (const source of fragment.evidence) {
        const row = element('div', 'tb-evidence-row'); row.append(element('blockquote', 'tb-quote', source.quote));
        const open = element('button', 'tb-source', `${t.source} · ${source.relativePath}`); open.type = 'button'; open.addEventListener('click', () => openSource(source)); row.append(open); evidence.append(row);
      }
      article.append(evidence); (item.group === 'indirect-suggestion' ? indirect : main).append(article);
    }
  };
  const executeSearch = async (): Promise<void> => {
    if (!input.value.trim()) { stateBlock(t.contextMissing, ''); return; }
    markPreviousResults(); const id = ++searchId; notice.hidden = true; hasSearched = true;
    try { const items = await (selection ? port.find(input.value.trim(), breadth.value as Breadth, queryPrivacy, selection) : port.find(input.value.trim(), breadth.value as Breadth, queryPrivacy)); if (!disposed && id === searchId) showResults(items); }
    catch { if (!disposed && id === searchId && !['error','cancelled'].includes(port.status().phase)) alert(t.failure); }
    finally { renderState(); }
  };
  input.addEventListener('input', () => { markPreviousResults(); selection = undefined; ++searchId; renderState(); });
  // Let the IME finish composition without consuming Enter or submitting partial text.
  // Consume held shortcuts, but only a fresh press can submit (including after cancel).
  input.addEventListener('keydown', e => { if (!e.isComposing && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (!e.repeat && !find.disabled) void executeSearch(); } });
  find.addEventListener('click', () => void executeSearch()); breadth.addEventListener('change', () => { if (hasSearched && input.value.trim()) void executeSearch(); });
  refresh.addEventListener('click', () => { notice.hidden = true; void port.refresh().catch(() => { if (!disposed) { if (!['error','cancelled'].includes(port.status().phase)) alert(t.failure); renderState(); } }); });
  // A current-note read is not a controller task. Cancel retires its delivery;
  // an underlying host/OS read may still finish, without replacing the idea.
  cancel.addEventListener('click', () => { ++searchId; port.cancel(); renderState(); });
  current.addEventListener('click', () => {
    if (disposed || isBusy(port.status().phase)) return;
    markPreviousResults(); selection = undefined; const id = ++searchId; currentReadId = id; renderState();
    void port.current?.().then(context => {
      if (disposed || id !== searchId || id !== currentReadId) return;
      currentReadId = undefined;
      if (!context?.text.trim()) { renderState(); alert(t.contextMissing); return; }
      input.value = context.text; queryPrivacy = context.privacy; privacyHint.textContent = t.private; privacyHint.hidden = queryPrivacy === 'normal'; renderState(); input.focus();
    }).catch(error => {
      if (!disposed && id === searchId && id === currentReadId) {
        currentReadId = undefined; renderState();
        alert(error instanceof CurrentNoteTooLongError ? t.contextTooLong : t.contextUnavailable);
      }
    });
  });
  const unsubscribe = port.subscribe(renderState); renderState();
  return () => { disposed = true; ++searchId; unsubscribe(); root.remove(); };
}
