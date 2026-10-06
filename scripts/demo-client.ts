import { mountPanel, type PanelPort } from '../src/ui';
import type { Status } from '../src/controller';
import type { Breadth, Evidence, QuerySelection, Privacy, SearchResult } from '../src/core/types';
async function post<T>(route: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`/api/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('Operation failed.'); return res.json() as Promise<T>;
}
let currentStatus = await (await fetch('/api/status')).json() as Status;
const listeners = new Set<() => void>();
let pendingPhase: 'indexing' | 'searching' | undefined;
function notify(): void { listeners.forEach(cb => cb()); }
async function poll(): Promise<void> {
  const res = await fetch('/api/status'); if (!res.ok) throw new Error('Status is unavailable.');
  const serverStatus = await res.json() as Status;
  currentStatus = pendingPhase ? { ...serverStatus, phase: pendingPhase } : serverStatus; notify();
}
async function requested<T>(phase: 'indexing' | 'searching', run: () => Promise<T>): Promise<T> {
  if (pendingPhase) throw new Error('A task is already running.');
  pendingPhase = phase; currentStatus = { ...currentStatus, phase }; notify();
  try { return await run(); }
  finally { pendingPhase = undefined; await poll(); }
}
const port: PanelPort = {
  status: () => currentStatus, subscribe: cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
  refresh: () => requested('indexing', () => post<void>('index')),
  find: (query: string, breadth: Breadth, privacy: Privacy = 'normal', selection?: QuerySelection) => requested('searching', () => post<SearchResult[]>('search', { query, breadth, privacy, ...(selection === undefined ? {} : { selection }) })),
  cancel: () => { void post('cancel').then(poll); },
  current: () => post<{ text: string; privacy: Privacy } | null>('current'),
  open: async (evidence: Evidence) => {
    const source = await post<{ path: string; text: string }>('open', { evidence });
    const dialog = document.createElement('dialog'); const close = document.createElement('button'); close.textContent = '关闭原文';
    const title = document.createElement('h2'); title.textContent = source.path; const text = document.createElement('pre'); text.textContent = source.text;
    const before = document.activeElement as HTMLElement | null; dialog.append(close, title, text); document.body.append(dialog);
    close.addEventListener('click', () => dialog.close()); dialog.addEventListener('close', () => { dialog.remove(); before?.focus(); }); dialog.showModal(); close.focus();
  },
};
mountPanel(document.querySelector<HTMLElement>('#panel')!, port, new URL(location.href).searchParams.get('lang') === 'en' ? 'en' : 'zh');
window.setInterval(() => { void poll().catch(() => { currentStatus = { ...currentStatus, phase: 'error', errorCode: 'operation-failed' }; listeners.forEach(cb => cb()); }); }, 700);
