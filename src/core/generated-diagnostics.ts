// SPDX-License-Identifier: MIT
// Only exact, program-detected ownership/member refusals get recovery copy.
// External I/O failures retain their identity; names/messages/properties are ignored.
type GeneratedFileDiagnostic = 'missing' | 'changed' | 'unavailable';
const diagnostics = new WeakMap<object, GeneratedFileDiagnostic>();
export function generatedFileError(reason: GeneratedFileDiagnostic): Error {
  const error = new Error(reason === 'unavailable' ? 'Fragment is not in the current owned layer' : 'Owned generated file is missing or human-edited');
  diagnostics.set(error, reason);
  return error;
}
export function generatedFileDiagnostic(error: unknown): GeneratedFileDiagnostic | undefined {
  return error !== null && (typeof error === 'object' || typeof error === 'function') ? diagnostics.get(error) : undefined;
}
