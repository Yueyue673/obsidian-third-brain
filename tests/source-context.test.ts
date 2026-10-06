// SPDX-License-Identifier: MIT
// Every note and model response in this file is explicitly synthetic.
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { analyzeSource, buildIndex, emptyFacets, prepareSource } from '../src/core/index';
import { buildIndex as legacyBuildIndex } from '../src/core/engine';
import type { ModelRequest, RunOptions } from '../src/core/types';

type ContextRequest = ModelRequest & { context?: { heading: string; before: string } };
const now = '2026-01-02T03:04:05.000Z';
const source = (raw: string, path = 'synthetic/metadata-only.md') => prepareSource(path, raw, createHash('sha256').update(raw).digest('hex'), 'synthetic-context-id');
const abstain = () => ({ version: 1, decision: 'insufficient-context', fragments: [] });
const extract = (text: string, changes: Record<string, unknown> = {}) => ({ version: 1, decision: 'extract', fragments: [{
  title: 'Synthetic supported idea', summary: text, kind: 'excerpt', ...emptyFacets(), quotes: [text], conditions: [], caveats: [], ...changes,
}] });
const options = (): RunOptions => ({ mode: 'cloud-model', cloudConsent: true, signature: 'synthetic-context-generation', previous: null, now });

async function requestsFor(raw: string, path?: string): Promise<ContextRequest[]> {
  const requests: ContextRequest[] = [];
  await analyzeSource(source(raw, path), { ...options(), model: { request: async input => { requests.push(structuredClone(input)); return abstain(); } } });
  return requests;
}

describe('bounded source context, separate from primary quotation evidence', () => {
  it('keeps a section and the previous paragraph when a later paragraph uses a referent', async () => {
    const opening = 'Synthetic definition: a short feedback loop means checking each small change.';
    const later = 'This reduces the cost of discovering mistakes late.';
    const snapshot = source(`# Small synthetic changes\n${opening}\n\n${later}`);
    const requests: ContextRequest[] = [];
    const result = await analyzeSource(snapshot, { ...options(), model: { request: async input => { requests.push(structuredClone(input)); return extract(input.text); } } });
    expect(requests[0].context).toEqual({ heading: 'Small synthetic changes', before: '' });
    expect(requests[1].text).toBe(later);
    expect(requests[1].context).toEqual({ heading: 'Small synthetic changes', before: opening });
    expect(requests[1].text).not.toContain(opening);
    for (const fragment of result.fragments) for (const evidence of fragment.evidence) expect(snapshot.text.slice(evidence.start, evidence.end)).toBe(evidence.quote);
    expect(result.fragments.find(f => f.summary === later)!.evidence.map(e => e.quote)).toEqual([later]);
  });
  it('keeps the immediately preceding chunk without enlarging primary text or dropping the tail', async () => {
    const raw = '# Synthetic long section\n' + 'Synthetic practical knowledge remains useful across chunks. '.repeat(230) + 'Terminal synthetic idea survives the final chunk.';
    const requests = await requestsFor(raw);
    expect(requests.length).toBeGreaterThan(2);
    for (let i = 0; i < requests.length; i++) {
      expect(requests[i].text.length).toBeLessThanOrEqual(6000);
      expect(requests[i].context?.heading).toBe('Synthetic long section');
      expect(requests[i].context?.before.length).toBeLessThanOrEqual(400);
      if (i) expect(requests[i].context?.before).toBe(requests[i - 1].text.slice(-400));
    }
    expect(requests.at(-1)!.text).toContain('Terminal synthetic idea');
  });
  it('redacts headings and neighbors before bounding and never supplies paths, IDs, metadata, code or comments', async () => {
    const opening = 'Synthetic contact synthetic@example.invalid and Synthetic/neighbor.md followed by useful introductory context.';
    const raw = `---\ntitle: metadata title must not be sent\n---\n# Synthetic contact synthetic@example.invalid\n${opening}\n\n\`\`\`text\nHidden synthetic code must not be sent.\n\`\`\`\n<!-- Hidden synthetic comment must not be sent. -->\nLater synthetic source statement remains independently useful.`;
    const requests = await requestsFor(raw);
    const wire = JSON.stringify(requests);
    expect(requests[1].context?.heading).toContain('[REDACTED]');
    expect(requests[1].context?.before).toContain('[REDACTED]');
    for (const forbidden of ['synthetic@example.invalid', 'Synthetic/neighbor.md', 'metadata title', 'Hidden synthetic', 'synthetic/metadata-only.md', 'synthetic-context-id']) expect(wire).not.toContain(forbidden);
  });
  it('does not carry neighboring prose across a section boundary, even when headings repeat', async () => {
    const requests = await requestsFor('# Synthetic repeated section\nFirst synthetic topic describes feedback.\n\n# Synthetic repeated section\nSecond synthetic topic describes rest.');
    expect(requests[1].context).toEqual({ heading: 'Synthetic repeated section', before: '' });
  });
  it('does not infer adjacency between distinct Canvas text nodes', async () => {
    const requests = await requestsFor(JSON.stringify({ nodes: [
      { type: 'text', text: '# First synthetic card\nFirst synthetic independent card.' },
      { type: 'text', text: '# Second synthetic card\nSecond synthetic independent card.' },
    ], edges: [] }), 'synthetic/cards.canvas');
    expect(requests[1].context).toEqual({ heading: 'Second synthetic card', before: '' });
  });
  it('omits headings already clipped by the source parser instead of disclosing an incomplete PII token', async () => {
    const requests = await requestsFor(`# ${'x'.repeat(156)} synthetic@example.invalid\nFirst synthetic useful paragraph.\n\nSecond synthetic useful paragraph.`);
    expect(requests[1].context?.heading).toBe('');
    expect(JSON.stringify(requests)).not.toContain('x'.repeat(156));
  });
  it.each(['quotes', 'conditions', 'caveats'])('rejects context-only %s as evidence for the current primary text', async field => {
    let count = 0;
    const opening = 'Synthetic background claim is not primary evidence.';
    await expect(analyzeSource(source(`# Synthetic section\n${opening}\n\nCurrent synthetic paragraph supplies its own claim.`), { ...options(), model: { request: async input => {
      if (++count === 1) return abstain();
      return extract(input.text, { [field]: [opening] });
    } } })).rejects.toThrow();
    expect(count).toBe(2);
  });
  it('rechecks the full same-source snapshot before every contextual request', async () => {
    const snapshot = source('# Synthetic section\nSynthetic definition explains the previous referent.\n\nThis synthetic effect follows the earlier definition.');
    let live = snapshot;
    const request = vi.fn(async () => { live = source('---\nprivacy: private\n---\n' + snapshot.text); return abstain(); });
    await expect(buildIndex([snapshot], { ...options(), recheck: async () => live, model: { request } })).rejects.toThrow(/Source notes changed/);
    expect(request).toHaveBeenCalledOnce();
  });
  it('invalidates legacy AI generations once while leaving local generations and subsequent cache hits unchanged', async () => {
    const snapshot = source('# Synthetic section\nSynthetic useful extraction remains source-grounded.');
    const request = vi.fn(async (input: ModelRequest) => extract(input.text));
    const opts = { ...options(), model: { request } };
    const legacy = await legacyBuildIndex([snapshot], opts);
    request.mockClear();
    const updated = await buildIndex([snapshot], { ...opts, previous: legacy });
    expect(request).toHaveBeenCalledOnce(); expect(updated.signature).not.toBe(legacy.signature); expect(updated.version).toBe(1);
    request.mockClear();
    const cached = await buildIndex([snapshot], { ...opts, previous: updated });
    expect(request).not.toHaveBeenCalled(); expect(cached).toEqual(updated);
    const localOpts = { ...options(), mode: 'local-excerpts' as const, cloudConsent: false };
    expect(await buildIndex([snapshot], localOpts)).toEqual(await legacyBuildIndex([snapshot], localOpts));
  });
  it.each(['local', 'private'])('never discloses %s source context to a cloud port', async privacy => {
    const request = vi.fn(async () => abstain());
    expect((await analyzeSource(source(`---\nprivacy: ${privacy}\n---\n# Synthetic title\nSynthetic contextual source paragraph.`), { ...options(), model: { request } })).status).toBe('local-only');
    expect(request).not.toHaveBeenCalled();
  });
});
