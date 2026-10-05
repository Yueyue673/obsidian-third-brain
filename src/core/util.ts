import type { Facets, Privacy } from './types';
import { emptyFacets } from './types';

export const FACET_KEYS = ['topics', 'concepts', 'mechanisms', 'atmosphere'] as const;
export const CORE_REVISION = 'editorial-core-2';
export const MODEL_TEXT_LIMIT = 6000;
export const RESPONSE_LIMIT = 160_000;
export const LOCAL_LABEL = 'Local excerpt · lexical baseline';

export class CoreError extends Error {
  constructor(message: string) { super(message); this.name = 'CoreError'; }
}
export function abortError(): Error { const error = new Error('Operation cancelled'); error.name = 'AbortError'; return error; }
export function checkAbort(signal?: AbortSignal): void { if (signal?.aborted) throw abortError(); }
/** A port which ignores AbortSignal still cannot commit a late result. */
export async function cancellable<T>(action: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  checkAbort(signal);
  if (!signal) return action();
  return new Promise<T>((resolve, reject) => {
    const stop = () => { signal.removeEventListener('abort', stop); reject(abortError()); };
    signal.addEventListener('abort', stop, { once: true });
    Promise.resolve().then(() => { checkAbort(signal); return action(); }).then(
      value => { signal.removeEventListener('abort', stop); if (signal.aborted) reject(abortError()); else resolve(value); },
      error => { signal.removeEventListener('abort', stop); reject(signal.aborted ? abortError() : error); },
    );
  });
}
export async function yieldToHost(signal?: AbortSignal): Promise<void> {
  checkAbort(signal); await new Promise<void>(resolve => setTimeout(resolve,0)); checkAbort(signal);
}
export function restrictive(a: Privacy, b: Privacy): Privacy {
  const rank = { normal: 0, local: 1, private: 2 };
  return rank[a] >= rank[b] ? a : b;
}
export function isPrivacy(value: unknown): value is Privacy { return value === 'normal' || value === 'local' || value === 'private'; }
export function relativePath(value: string): void {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\\\x00-\x1f\x7f:]/u.test(value) || value.startsWith('/') || value.split('/').some(s => !s || s === '.' || s === '..')) {
    throw new CoreError('Invalid relative source path');
  }
}
export function plainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
export function exactKeys(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!plainObject(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !keys.includes(key))) throw new CoreError('Invalid schema fields');
}
export function boundedString(value: unknown, limit: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > limit || (!allowEmpty && !value.trim()) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value)) throw new CoreError('Invalid schema string');
  return value;
}
export function stringList(value: unknown, max = 24, itemLimit = 120): string[] {
  if (!Array.isArray(value) || value.length > max) throw new CoreError('Invalid schema list');
  return value.map(item => boundedString(item, itemLimit));
}
export function uniq(values: string[]): string[] { return [...new Set(values)]; }
export function canonicalText(text: string): string { return text.normalize('NFC').replace(/\s+/gu, ' ').trim(); }
const ALIASES: Record<string, string> = {
  'feedback loop': '反馈循环', 'feedback loops': '反馈循环', '反馈回路': '反馈循环',
  'reduce friction': '减少摩擦', 'lower friction': '减少摩擦', '降低摩擦': '减少摩擦',
  'spaced repetition': '间隔重复', 'cognitive load': '认知负荷',
};
export function facetKey(value: string): string {
  const key = value.normalize('NFKC').replace(/^#+/u, '').trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');
  return ALIASES[key] ?? key;
}
export function canonicalFacets(input?: Partial<Facets>): Facets {
  const out = emptyFacets();
  if (!input) return out;
  for (const key of FACET_KEYS) {
    const list = input[key] ?? [];
    if (!Array.isArray(list) || list.length > 256 || list.some(v => typeof v !== 'string' || v.length > 120)) throw new CoreError('Invalid facet vocabulary');
    const names = new Map<string, string>();
    for (const item of list) { const normalized = facetKey(item); if (normalized) names.set(normalized, ALIASES[normalized] ?? normalized); }
    out[key] = [...names.values()].sort();
  }
  return out;
}
export function unionFacets(...inputs: Partial<Facets>[]): Facets {
  const result = emptyFacets();
  for (const key of FACET_KEYS) result[key] = uniq(inputs.flatMap(input => input[key] ?? [])).sort();
  return result;
}
export function parseCompleteJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    const stack: { object: boolean; key: boolean; keys: Set<string> }[] = [];
    for (const token of text.match(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]/gu) ?? []) {
      if (token === '{' || token === '[') stack.push({ object:token === '{',key:token === '{',keys:new Set() });
      else if (token === '}' || token === ']') stack.pop();
      else {
        const top = stack.at(-1);
        if (token === ',' && top?.object) top.key = true;
        if (token.startsWith('"') && top?.object && top.key) {
          const key = JSON.parse(token) as string;
          if (top.keys.has(key)) throw new CoreError('Duplicate JSON field');
          top.keys.add(key); top.key = false;
        }
      }
    }
    return parsed;
  } catch { throw new CoreError('Expected one complete JSON object without duplicate fields'); }
}
export function parseResponse(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.length > RESPONSE_LIMIT) throw new CoreError('Model response too large');
    return parseCompleteJson(value);
  }
  let text: string;
  try { text = JSON.stringify(value); } catch { throw new CoreError('Invalid model response'); }
  if (!text! || text.length > RESPONSE_LIMIT) throw new CoreError('Invalid or oversized model response');
  return value;
}
export function timestamp(now?: string): string {
  if (now !== undefined && (typeof now !== 'string' || now.length > 40 || !Number.isFinite(Date.parse(now)))) throw new CoreError('Invalid generation timestamp');
  return now ?? new Date().toISOString();
}
// Synchronous browser-compatible SHA-256 for stable derived identifiers only.
// Source hashes are supplied by the immutable byte-reading host, never recomputed here.
export function digest(text: string): string {
  const k = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const bytes = new TextEncoder().encode(text);
  const data = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  data.set(bytes); data[bytes.length] = 0x80;
  const view = new DataView(data.buffer), bits = bytes.length * 8;
  view.setUint32(data.length - 8, Math.floor(bits / 0x100000000)); view.setUint32(data.length - 4, bits >>> 0);
  const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const r = (n: number, s: number) => (n >>> s) | (n << (32 - s));
  for (let offset = 0; offset < data.length; offset += 64) {
    const w = new Uint32Array(64);
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) w[i] = (w[i-16] + (r(w[i-15],7)^r(w[i-15],18)^(w[i-15]>>>3)) + w[i-7] + (r(w[i-2],17)^r(w[i-2],19)^(w[i-2]>>>10))) >>> 0;
    let [a,b,c,d,e,f,g,z] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (z + (r(e,6)^r(e,11)^r(e,25)) + ((e&f)^(~e&g)) + k[i] + w[i]) >>> 0;
      const t2 = ((r(a,2)^r(a,13)^r(a,22)) + ((a&b)^(a&c)^(b&c))) >>> 0;
      z=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    [a,b,c,d,e,f,g,z].forEach((value, i) => { h[i] = (h[i] + value) >>> 0; });
  }
  return h.map(n => n.toString(16).padStart(8,'0')).join('');
}
