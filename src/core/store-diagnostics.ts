// SPDX-License-Identifier: MIT
// Only store-owned lock refusals select retry guidance. External error names,
// messages, codes and similarly named properties never establish this diagnosis.
const diagnostics = new WeakMap<object, 'busy'>();
export function storeBusyError(scope: 'operation' | 'writer'): Error {
  const error = new Error(scope === 'operation' ? 'Another store operation is in progress' : 'Another store writer is active');
  diagnostics.set(error, 'busy');
  return error;
}
export function storeDiagnostic(error: unknown): 'busy' | undefined {
  return error !== null && (typeof error === 'object' || typeof error === 'function') ? diagnostics.get(error) : undefined;
}
