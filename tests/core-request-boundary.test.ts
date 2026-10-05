import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { buildIndex, emptyFacets, prepareSource } from '../src/core';
import type { ModelRequest, RunOptions, SourceSnapshot } from '../src/core';

const now = '2026-01-02T03:04:05.000Z';
function source(path: string, raw: string): SourceSnapshot {
  return prepareSource(path, raw, createHash('sha256').update(raw).digest('hex'), createHash('sha256').update(path).digest('hex'));
}
const base = (): RunOptions => ({ mode: 'cloud-model', cloudConsent: true, signature: 'synthetic-request-boundary', previous: null, now });
const abstain = () => ({ version: 1, decision: 'insufficient-context', fragments: [] });
function extraction(input: ModelRequest, topic: string) {
  return { version: 1, decision: 'extract', fragments: [{ title: 'Synthetic supported idea', summary: input.text, kind: 'excerpt', topics: [topic], concepts: [], mechanisms: [], atmosphere: [], quotes: [input.text], conditions: [], caveats: [] }] };
}
function changed(snapshot: SourceSnapshot, kind: string): SourceSnapshot | null {
  if (kind === 'deleted' || kind === 'excluded') return null;
  if (kind === 'edited') return source(snapshot.path, snapshot.text + '\nAn independent synthetic edit.');
  if (kind === 'credential') return source(snapshot.path, snapshot.text + '\npassword: synthetic-boundary-test-only');
  return source(snapshot.path, `---\nprivacy: ${kind}\n---\n` + snapshot.text);
}

describe('fresh privacy at every extraction request', () => {
  it.each(['private', 'local', 'deleted', 'excluded', 'edited', 'credential'])('blocks later paragraphs after the live source becomes %s', async kind => {
    const snapshot = source('synthetic/long.md', 'Synthetic opening paragraph explains feedback loops.\n\nSynthetic later confidential paragraph explains a different mechanism.');
    let live: SourceSnapshot | null = snapshot;
    const requests: ModelRequest[] = [];
    await expect(buildIndex([snapshot], { ...base(), recheck: async () => live, model: { request: async input => {
      requests.push(structuredClone(input)); live = changed(snapshot, kind); return abstain();
    } } })).rejects.toThrow(/Source notes changed/);
    expect(requests).toHaveLength(1);
    expect(requests[0].text).not.toContain('later confidential');
  });
  it('blocks later chunks of a single oversized paragraph', async () => {
    const snapshot = source('synthetic/long.md', 'Synthetic useful planning material preserves source context. '.repeat(160));
    let live: SourceSnapshot | null = snapshot; const request = vi.fn(async () => { live = changed(snapshot, 'private'); return abstain(); });
    await expect(buildIndex([snapshot], { ...base(), recheck: async () => live, model: { request } })).rejects.toThrow(/Source notes changed/);
    expect(request).toHaveBeenCalledOnce();
  });
  it.each(['private', 'local', 'deleted', 'excluded', 'edited', 'credential'])('blocks a newly protected explicit vocabulary donor: %s', async kind => {
    const donor = source('synthetic/a-donor.md', '---\ntags: [synthetic donor marker]\n---\nSynthetic donor explains useful practice.');
    const target = source('synthetic/b-target.md', 'Synthetic target explains a different routine.');
    let liveDonor: SourceSnapshot | null = donor; const requests: ModelRequest[] = [];
    await expect(buildIndex([donor, target], { ...base(), recheck: async snapshot => snapshot.path === donor.path ? liveDonor : target,
      model: { request: async input => { requests.push(structuredClone(input)); liveDonor = changed(donor, kind); return abstain(); } } })).rejects.toThrow(/Source notes changed/);
    expect(requests).toHaveLength(1); expect(requests[0].vocabulary.topics).toContain('synthetic donor marker');
  });
  it('rechecks freshly inferred vocabulary before it enters a different source request', async () => {
    const donor = source('synthetic/a-donor.md', 'Synthetic donor explains useful practice.');
    const target = source('synthetic/b-target.md', 'Synthetic target explains a different routine.');
    let liveDonor: SourceSnapshot | null = donor; const requests: ModelRequest[] = [];
    await expect(buildIndex([donor, target], { ...base(), recheck: async snapshot => snapshot.path === donor.path ? liveDonor : target,
      model: { request: async input => { requests.push(structuredClone(input)); liveDonor = changed(donor, 'private'); return extraction(input, 'synthetic learned marker'); } } })).rejects.toThrow(/Source notes changed/);
    expect(requests).toHaveLength(1);
  });
  it('rechecks a cached vocabulary donor even when that source is skipped as unchanged', async () => {
    const donor = source('synthetic/a-donor.md', 'Synthetic donor explains useful practice.');
    const target = source('synthetic/b-target.md', 'Synthetic target explains a different routine.');
    const previous = await buildIndex([donor], { ...base(), model: { request: async input => extraction(input, 'synthetic cached marker') } });
    const before = JSON.stringify(previous); let liveDonor: SourceSnapshot | null = donor;
    const request = vi.fn(async () => abstain());
    await expect(buildIndex([donor, target], { ...base(), previous,
      onProgress: event => { if (event.phase === 'processing' && event.completed === 1) liveDonor = changed(donor, 'private'); },
      recheck: async snapshot => snapshot.path === donor.path ? liveDonor : target, model: { request } })).rejects.toThrow(/Source notes changed/);
    expect(request).not.toHaveBeenCalled(); expect(JSON.stringify(previous)).toBe(before);
  });
  it('rechecks a later-listed donor between requests of an earlier target', async () => {
    const target = source('synthetic/a-target.md', 'Synthetic target opening explains one routine.\n\nSynthetic target later explains another routine.');
    const donor = source('synthetic/z-donor.md', '---\ntags: [synthetic future donor]\n---\nSynthetic donor explains useful practice.');
    let liveDonor: SourceSnapshot | null = donor; const request = vi.fn(async () => { liveDonor = changed(donor, 'private'); return abstain(); });
    await expect(buildIndex([target, donor], { ...base(), recheck: async snapshot => snapshot.path === donor.path ? liveDonor : target,
      model: { request } })).rejects.toThrow(/Source notes changed/);
    expect(request).toHaveBeenCalledOnce();
  });
  it('checks the active source after dictionary donors finish asynchronous reads', async () => {
    const target = source('synthetic/a-target.md', 'Synthetic target describes meaningful practice.');
    const donor = source('synthetic/z-donor.md', '---\ntags: [synthetic future donor]\n---\nSynthetic donor explains useful practice.');
    let liveTarget: SourceSnapshot | null = target; const request = vi.fn(async () => abstain());
    await expect(buildIndex([target, donor], { ...base(), recheck: async snapshot => {
      if (snapshot.path === donor.path) { liveTarget = changed(target, 'private'); return donor; }
      return liveTarget;
    }, model: { request } })).rejects.toThrow(/Source notes changed/);
    expect(request).not.toHaveBeenCalled();
  });
  it('requires all donors of a cached merged fragment, not just the first source', async () => {
    const a = source('synthetic/a.md', 'Synthetic identical practice preserves two independent sources.');
    const b = source('synthetic/b.md', a.text), target = source('synthetic/c.md', 'Synthetic target has different meaningful context.');
    const previous = await buildIndex([a, b], { ...base(), model: { request: async input => extraction(input, 'synthetic merged marker') } });
    expect(Object.values(previous.fragments)).toHaveLength(1);
    let liveB: SourceSnapshot | null = b; const request = vi.fn(async () => abstain());
    await expect(buildIndex([a, b, target], { ...base(), previous,
      onProgress: event => { if (event.phase === 'processing' && event.completed === 2) liveB = changed(b, 'private'); },
      recheck: async snapshot => snapshot.path === b.path ? liveB : snapshot, model: { request } })).rejects.toThrow(/Source notes changed/);
    expect(request).not.toHaveBeenCalled();
  });
  it('cancels during an asynchronous boundary check without invoking the model later', async () => {
    const snapshot = source('synthetic/note.md', 'Synthetic target describes meaningful practice.');
    const abort = new AbortController(); const request = vi.fn(async () => abstain());
    await expect(buildIndex([snapshot], { ...base(), signal: abort.signal, recheck: async () => { abort.abort(); return snapshot; }, model: { request } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).not.toHaveBeenCalled();
  });
  it('does not reread the whole library for each dictionary hint', async () => {
    const notes = Array.from({ length: 30 }, (_, i) => source(`synthetic/note-${String(i).padStart(2, '0')}.md`, '---\ntags: [synthetic shared topic]\n---\nSynthetic source keeps independent useful context.'));
    const request = vi.fn(async () => abstain()), recheck = vi.fn(async (snapshot: SourceSnapshot) => snapshot);
    await buildIndex(notes, { ...base(), recheck, model: { request } });
    expect(request).toHaveBeenCalledTimes(notes.length);
    expect(recheck.mock.calls.length).toBeLessThanOrEqual(notes.length * 2);
  });
  it('adds no outgoing-model boundary work to local excerpts', async () => {
    const snapshot = source('synthetic/note.md', 'Synthetic target describes meaningful practice.');
    const recheck = vi.fn(async () => { throw new Error('Should not be called'); }), request = vi.fn(async () => abstain());
    await buildIndex([snapshot], { ...base(), mode: 'local-excerpts', cloudConsent: false, recheck, model: { request }, vocabulary: emptyFacets() });
    expect(recheck).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
  });
});
