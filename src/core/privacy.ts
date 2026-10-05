import type { Facets } from './types';
import { FACET_KEYS, canonicalFacets } from './util';

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/iu,
  /\b(?:sk-(?:proj-)?[a-z0-9_-]{12,}|gh[pousr]_[a-z0-9]{12,}|github_pat_[a-z0-9_]{12,}|xox[baprs]-[a-z0-9-]{12,}|AKIA[A-Z0-9]{16})\b/iu,
  /\b(?:authorization|cookie|set-cookie)\s*[:=]\s*\S+/iu,
  /\bBearer\s+[a-z0-9._~+\/-]{8,}/iu,
  /(?:["']?\b(?:password|passwd|pwd|api[-_ ]?key|access[-_ ]?(?:token|key)|refresh[-_ ]?token|token|client[-_ ]?secret|(?:aws[-_ ]?)?secret(?:[-_ ]?(?:access[-_ ]?)?key)?|session[-_ ]?key)["']?|密码|口令|密钥)\s*[:=]\s*["']?(?!["']?(?:null|false|none|redacted|placeholder)\b)[^\s"',;}{\]]+/iu,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]+@/iu,
  /[?&](?:api[-_]?key|token|auth|password|secret|access[-_]?token)=[^\s&#]+/iu,
  /\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/iu,
];
export function hasCredentials(text: string): boolean {
  const direct = (value: string) => SECRET_PATTERNS.some(pattern => pattern.test(value));
  if (direct(text)) return true;
  // Canvas JSON can escape a sensitive key/value which is absent from raw regex
  // matches. Inspect every decoded metadata value, not only visible text nodes.
  if (/^\s*[\[{]/u.test(text)) {
    try {
      const stack: unknown[] = [JSON.parse(text.replace(/^\ufeff/u,''))];
      while (stack.length) {
        const value = stack.pop();
        if (typeof value === 'string' && direct(value)) return true;
        if (Array.isArray(value)) { for (const item of value) stack.push(item); }
        else if (value && typeof value === 'object') for (const [key,item] of Object.entries(value)) {
          if (typeof item === 'string' && direct(`${key}: ${item}`)) return true;
          stack.push(item);
        }
      }
    } catch { /* Preparation separately rejects malformed Canvas JSON. */ }
  }
  return false;
}
// Deliberately conservative DLP, not a claim of complete PII detection.
const PRIVATE_PATTERNS = [
  /\b[a-z0-9.!#$%&'*+\/=?^_`{|}~-]{1,64}@[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+\b/giu,
  /(?<!\d)(?:\+?86[\s-]?)?1[3-9]\d{9}(?!\d)/gu,
  /(?<!\d)(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/gu,
  /(?<!\d)\d{17}[\dXx](?!\d)/gu,
  /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/gu,
];
const PATH_PATTERNS = [
  /\[\[[^\]\r\n]+\]\]/gu,
  /!?\[[^\]\r\n]*\]\([^\)\r\n]*\)/gu,
  /(?:[a-z]:[\\/]|file:\/\/)[^\s<>"']+/giu,
  /(?:\/(?:home|users|Users|private|var|mnt|Volumes|tmp)\/)[^\s<>"']+/gu,
  /(?:[\p{L}\p{N}_. -]{1,120}[\\/])+[\p{L}\p{N}_. -]{1,120}\.(?:md|canvas|excalidraw|txt|pdf|json)\b/giu,
  /[\p{L}\p{N}_-]{1,120}\.(?:md|canvas|excalidraw)\b/giu,
];
export interface MappedText { text: string; offsets: number[]; }
export function mapped(text: string, start = 0): MappedText { return { text, offsets: Array.from({ length: text.length }, (_, i) => start < 0 ? -1 : start + i) }; }
export function redact(input: MappedText): MappedText {
  const ranges: { start: number; end: number }[] = [];
  for (const pattern of [...PRIVATE_PATTERNS, ...PATH_PATTERNS]) {
    const regex = new RegExp(pattern.source, pattern.flags);
    for (const hit of input.text.matchAll(regex)) ranges.push({ start: hit.index, end: hit.index + hit[0].length });
  }
  ranges.sort((a,b) => a.start - b.start || b.end - a.end);
  const merged: typeof ranges = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end); else merged.push({ ...range });
  }
  let text = '', offsets: number[] = [], cursor = 0;
  for (const range of merged) {
    text += input.text.slice(cursor, range.start) + '[REDACTED]';
    for (const offset of input.offsets.slice(cursor, range.start)) offsets.push(offset);
    for (let i = 0; i < 10; i++) offsets.push(-1);
    cursor = range.end;
  }
  text += input.text.slice(cursor); for (const offset of input.offsets.slice(cursor)) offsets.push(offset);
  return { text, offsets };
}
export function safeFacet(value: string): boolean {
  // Facets are short plain-text labels, never Markdown, paths or instructions.
  // Check raw text as well as its canonical form so normalization cannot hide
  // a newline, full-width separator, redaction marker or executable markup.
  return value.length <= 120 && !/[\p{C}\r\n]/u.test(value) && /^[\p{L}\p{N}][\p{L}\p{M}\p{N} _+\-–—]*$/u.test(value.trim()) && !hasCredentials(value) && redact(mapped(value)).text === value;
}
export function safeVocabulary(input?: Partial<Facets>): Facets {
  const result = canonicalFacets(input); // Validate the caller's types and bounds first.
  const raw: Partial<Facets> = {};
  for (const key of FACET_KEYS) raw[key] = (input?.[key] ?? []).filter(value => safeFacet(value.replace(/^#+/u,'')));
  const safe = canonicalFacets(raw);
  for (const key of FACET_KEYS) result[key] = safe[key].filter(safeFacet);
  return result;
}
/** Request dictionaries are hints, bounded independently of the local index.
 * Keep existing names first, then add safe canonical discoveries without
 * exceeding the port's 256-per-channel vocabulary contract.
 */
export function extendVocabulary(vocabulary: Facets, ...inputs: Facets[]): Facets {
  const result = safeVocabulary(vocabulary);
  for (const input of inputs) {
    const safe = safeVocabulary(input);
    for (const key of FACET_KEYS) result[key] = [...new Set([...result[key],...safe[key]])].slice(0,256).sort();
  }
  for (const key of FACET_KEYS) result[key] = result[key].filter(safeFacet);
  return result;
}
