import type { Mode } from './core/types';
export type Schedule = 'manual' | 'daily' | 'weekly';
export type Locale = 'auto' | 'en' | 'zh';
export interface Settings {
  mode: Mode; schedule: Schedule; locale: Locale; outputFolder: string;
  endpoint: string; model: string; secretId: string; cloudConsent: boolean;
  excludes: string[]; maxNotes: number; maxFileBytes: number; lastIndexedAt: string;
}
export const defaults: Settings = {
  mode: 'local-excerpts', schedule: 'manual', locale: 'auto', outputFolder: 'Third Brain/Fragments',
  endpoint: 'http://127.0.0.1:11434/v1', model: '', secretId: '', cloudConsent: false,
  excludes: [], maxNotes: 20000, maxFileBytes: 2 * 1024 * 1024, lastIndexedAt: '',
};
export function safeFolder(value: string): string {
  const path = value.replace(/\\/g, '/');
  if (!path.trim() || path.startsWith('/') || /^[A-Za-z]:/.test(path) || /[\x00-\x1f:*?"<>|]/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..' || p.startsWith('.') || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw new Error('Invalid generated folder.');
  return path;
}
export function loadSettings(value: unknown): Settings {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const s = { ...defaults, excludes: [...defaults.excludes] };
  if (['local-excerpts', 'local-model', 'cloud-model'].includes(String(v.mode))) s.mode = v.mode as Mode;
  if (['manual', 'daily', 'weekly'].includes(String(v.schedule))) s.schedule = v.schedule as Schedule;
  if (['auto', 'en', 'zh'].includes(String(v.locale))) s.locale = v.locale as Locale;
  if (typeof v.outputFolder === 'string') s.outputFolder = safeFolder(v.outputFolder);
  for (const k of ['endpoint', 'model', 'secretId', 'lastIndexedAt'] as const) if (typeof v[k] === 'string' && (v[k] as string).length <= 2000) s[k] = v[k] as string;
  s.cloudConsent = v.cloudConsent === true;
  if (Array.isArray(v.excludes)) s.excludes = v.excludes.filter((x): x is string => typeof x === 'string' && x.length < 500).map(x => x.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')).filter(x => x && !x.split('/').includes('..'));
  for (const k of ['maxNotes', 'maxFileBytes'] as const) if (Number.isSafeInteger(v[k]) && Number(v[k]) >= 1 && Number(v[k]) <= (k === 'maxNotes' ? 100000 : 20000000)) s[k] = Number(v[k]);
  return s;
}
export function isDue(settings: Settings, now = Date.now()): boolean {
  if (settings.schedule === 'manual') return false;
  const last = Date.parse(settings.lastIndexedAt);
  return !Number.isFinite(last) || now - last >= (settings.schedule === 'daily' ? 86400000 : 604800000);
}
export function generationSignature(s: Settings): string {
  return JSON.stringify({ version: 1, mode: s.mode, endpoint: s.mode === 'local-excerpts' ? '' : s.endpoint, model: s.model, excludes: [...s.excludes].sort(), maxFileBytes: s.maxFileBytes });
}
