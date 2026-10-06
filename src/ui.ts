import type { Breadth, Evidence, Privacy, SearchResult } from './core/types';
import type { Status } from './controller';
import { messages } from './i18n';
import { presentExplanation } from './presentation';
export interface PanelPort {
  status(): Status; subscribe(listener: () => void): () => void;
  refresh(): Promise<void>; find(query: string, breadth: Breadth, privacy?: Privacy): Promise<SearchResult[]>;
  cancel(): void; current?(): Promise<{ text: string; privacy: Privacy } | null>;
  open(evidence: Evidence): Promise<void>;
  openFragment?(id: string): Promise<void>;
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
  root.append(heading, status, stats, label, input, options, privacyHint, actions, notice, summary, results); container.replaceChildren(root);
  let queryPrivacy: Privacy = 'normal'; let searchId = 0; let disposed = false; let hasSearched = false;
  const alert = (text: string): void => { notice.textContent = text; notice.hidden = false; };
  const stateBlock = (title: string, body: string): void => { results.replaceChildren(element('h3', 'tb-empty-title', title), element('p', 'tb-muted', body)); };
  const renderState = (): void => {
    if (disposed) return;
    const state = port.status(); const busy = ['indexing', 'searching', 'loading'].includes(state.phase);
    find.disabled = busy || !input.value.trim() || !state.fragmentCount; find.hidden = !state.fragmentCount; refresh.className = state.fragmentCount ? 'tb-secondary' : 'tb-primary'; refresh.disabled = busy; current.disabled = busy; breadth.disabled = busy; cancel.hidden = !busy || state.phase === 'loading';
    const mode = state.mode === 'local-excerpts' ? t.local : state.mode === 'local-model' ? t.localModel : t.cloud;
    let line = t[state.phase]; if (state.progress?.total) line += ` ${state.progress.completed} / ${state.progress.total}`;
    status.textContent = `${line} · ${mode}`;
    stats.textContent = `${state.sourceCount} ${t.sources} · ${state.fragmentCount} ${t.fragments}${state.updatedAt ? ` · ${t.updated} ${new Date(state.updatedAt).toLocaleString()}` : ''}`;
    if (state.phase === 'error') alert(state.errorCode === 'index-unavailable' ? t.unavailable : t.failure);
    if (state.warningCode === 'schedule-not-saved') alert(t.scheduleWarning);
    if (!hasSearched && !busy) { if (!state.fragmentCount) stateBlock(t.first, t.firstBody); else stateBlock(t.initial, ''); }
  };
  const showResults = (items: SearchResult[]): void => {
    results.replaceChildren(); summary.textContent = `${items.length} ${t.results}`;
    if (!items.length) { stateBlock(t.empty, t.emptyBody); return; }
    for (const item of items) {
      const fragment = item.fragment; const article = element('article', 'tb-result');
      const top = element('div', 'tb-result-top'); top.append(element('h3', 'tb-result-title', fragment.title), element('span', 'tb-kind', fragment.mode === 'ai' ? t.ai : t.excerpt));
      article.append(top, element('p', 'tb-fragment', fragment.summary));
      if (port.openFragment) {
        const open = element('button', 'tb-secondary', t.openFragment); open.type = 'button';
        open.addEventListener('click', () => { void port.openFragment!(fragment.id).catch(() => alert(t.failure)); });
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
                open.addEventListener('click', () => { void port.open(source).catch(() => alert(t.failure)); }); side.append(open);
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
      for (const term of [...new Set(Object.values(fragment.facets).flat())].slice(0, 12)) {
        const button = element('button', 'tb-facet', term); button.type = 'button'; button.addEventListener('click', () => { input.value = term; queryPrivacy = fragment.privacy; privacyHint.hidden = queryPrivacy === 'normal'; void executeSearch(); }); facets.append(button);
      }
      if (facets.childElementCount) article.append(facets);
      const evidence = element('details', 'tb-evidence'); evidence.append(element('summary', '', `${t.evidence} · ${fragment.evidence.length}`));
      for (const source of fragment.evidence) {
        const row = element('div', 'tb-evidence-row'); row.append(element('blockquote', 'tb-quote', source.quote));
        const open = element('button', 'tb-source', `${t.source} · ${source.relativePath}`); open.type = 'button'; open.addEventListener('click', () => { void port.open(source).catch(() => alert(t.failure)); }); row.append(open); evidence.append(row);
      }
      article.append(evidence); results.append(article);
    }
  };
  const executeSearch = async (): Promise<void> => {
    if (!input.value.trim()) { stateBlock(t.contextMissing, ''); return; }
    const id = ++searchId; notice.hidden = true; hasSearched = true;
    try { const items = await port.find(input.value.trim(), breadth.value as Breadth, queryPrivacy); if (!disposed && id === searchId) showResults(items); }
    catch { if (!disposed) alert(port.status().phase === 'cancelled' ? t.cancelled : t.failure); }
    finally { renderState(); }
  };
  input.addEventListener('input', () => { renderState(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (!find.disabled) void executeSearch(); } });
  find.addEventListener('click', () => void executeSearch()); breadth.addEventListener('change', () => { if (hasSearched && input.value.trim()) void executeSearch(); });
  refresh.addEventListener('click', () => { notice.hidden = true; void port.refresh().then(() => { hasSearched = false; summary.textContent = ''; renderState(); }).catch(() => alert(port.status().phase === 'cancelled' ? t.cancelled : t.failure)); });
  cancel.addEventListener('click', () => { ++searchId; port.cancel(); });
  current.addEventListener('click', () => { void port.current?.().then(context => { if (!context?.text.trim()) { alert(t.contextMissing); return; } input.value = context.text; queryPrivacy = context.privacy; privacyHint.textContent = t.private; privacyHint.hidden = queryPrivacy === 'normal'; renderState(); input.focus(); }).catch(() => alert(t.contextMissing)); });
  const unsubscribe = port.subscribe(renderState); renderState();
  return () => { disposed = true; ++searchId; unsubscribe(); root.remove(); };
}
