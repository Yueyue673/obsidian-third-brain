// SPDX-License-Identifier: MIT
import { relativePath } from './util';

/** Known evidence mismatch, not an I/O diagnosis. Never wrap external failures. */
export class SourceEvidenceUnavailableError extends Error {
  constructor() { super('This source changed or is no longer available. Refresh the index before opening this quotation.'); this.name = 'SourceEvidenceUnavailableError'; }
}

/** Ephemeral, program-owned metadata. Never part of v1 or model output. */
export interface SourceDiagnostic {
  relativePath: string;
  stage: 'reading' | 'decoding' | 'parsing' | 'analysis';
  reason: 'read-failed' | 'decode-failed' | 'parse-failed' | 'size-limit' | 'analysis-failed' | 'model-output-rejected';
}
const diagnostics = new WeakMap<object, Readonly<SourceDiagnostic>>();
const globalFailures = new WeakSet<object>();
const key = (error: unknown): error is object => error !== null && (typeof error === 'object' || typeof error === 'function');
export function bindSourceDiagnostic(error: unknown, meta: SourceDiagnostic): void {
  if (!key(error) || diagnostics.has(error) || globalFailures.has(error)) return;
  try { relativePath(meta.relativePath); } catch { return; }
  if (/[\u202a-\u202e\u2066-\u2069]/u.test(meta.relativePath)) return;
  diagnostics.set(error, Object.freeze({ relativePath:meta.relativePath,stage:meta.stage,reason:meta.reason }));
}
export function sourceDiagnostic(error: unknown): SourceDiagnostic | undefined {
  const meta = key(error) ? diagnostics.get(error) : undefined;
  return meta ? { ...meta } : undefined;
}
/** A request-boundary proof error is global, not a format defect of the active source.
 * A previously bound donor I/O failure keeps its exact donor location. */
export function markGlobalSourceFailure(error: unknown): void { if (key(error)) globalFailures.add(error); }
