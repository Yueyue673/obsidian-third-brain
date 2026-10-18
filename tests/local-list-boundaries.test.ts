// SPDX-License-Identifier: MIT
// New synthetic admission cases; no model or native host calls.
import { expect, it } from 'vitest';
import { analyzeSource, prepareSource } from '../src/core/index';
import { hash } from '../src/sources';

const options = { mode: 'local-excerpts' as const, cloudConsent: false };
const source = (text: string) => prepareSource('synthetic.md', text, hash(text), 'synthetic-prose-boundary');

it.each([
  'This synthetic note explains the literal inline code `%%` delimiter.',
  'This synthetic note explains the literal inline code `<!--` delimiter.',
])('retains ordinary visible prose outside lists: %s', async text => {
  const result = await analyzeSource(source(text), options);
  expect(result.fragments.map(fragment => fragment.summary)).toContain(text);
});

it('does not extend a previous list into unrelated prose after a blank line', async () => {
  const text = 'This independent prose explains the inline code `%%` delimiter.';
  const result = await analyzeSource(source('- A separate synthetic reminder.\n\n' + text), options);
  expect(result.fragments.map(fragment => fragment.summary)).toContain(text);
});

it.each(['%% hidden example %%', '<!-- hidden example -->'])(
  'never drops the first parent and emits a bare child around %s', async marker => {
    const text = '- Only in the disconnected synthetic simulator ' + marker + ':\n  - Rotate the amber calibration dial.';
    await expect(analyzeSource(source(text), options)).rejects.toThrow(/Local list context/);
  },
);
