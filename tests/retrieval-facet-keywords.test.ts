import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { analyzeSource, searchFragments, prepareSource } from '../src/core';
import { presentExplanation } from '../src/presentation';

async function fixture(frontmatter: string) {
  const raw = `---\n${frontmatter}\n---\n# One observable weakness\nEach attempt changes only one observable weakness and receives immediate feedback.`;
  return (await analyzeSource(prepareSource('synthetic/filename-only-quasar.md',raw,createHash('sha256').update(raw).digest('hex'),'synthetic-keyword-source'),{ mode:'local-excerpts',cloudConsent:false })).fragments;
}

describe('local lexical recall within existing facet labels', () => {
  it.each(['变量','variables'])('retrieves a partial mechanism keyword without inventing an intent: %s', async query => {
    const fragments = await fixture('mechanisms: [缩小变量以定位问题, controlled variables]');
    const before = JSON.stringify(fragments);
    const results = searchFragments(fragments,query,{ breadth:'medium' });
    expect(results).toHaveLength(1);
    expect(results[0].reasons[0].label).toContain('Facet keyword match:');
    expect(results[0].reasons[0].label).toContain(query);
    expect(results[0].reasons[0].quotes).toContain(fragments[0].summary);
    expect(results[0].reasons[0].caveat).toContain('not evidence');
    expect(JSON.stringify(fragments)).toBe(before);
    expect(presentExplanation(results[0].reasons[0].label,'zh')).toContain('属性关键词匹配：');
  });
  it('does not widen mechanism or atmosphere scope at low breadth', async () => {
    const fragments = await fixture('mechanisms: [缩小变量以定位问题]\natmosphere: [calm evening]');
    expect(searchFragments(fragments,'变量',{ breadth:'low' })).toEqual([]);
    expect(searchFragments(fragments,'evening',{ breadth:'medium' })).toEqual([]);
    expect(searchFragments(fragments,'evening',{ breadth:'high' })).toHaveLength(1);
  });
  it('keeps a requested topic boundary at medium and widens at high', async () => {
    const fragments = await fixture('topics: [learning]\nmechanisms: [controlled variables]');
    expect(searchFragments(fragments,'variables',{ breadth:'medium',facets:{ topics:['garden'] } })).toEqual([]);
    expect(searchFragments(fragments,'variables',{ breadth:'high',facets:{ topics:['garden'] } })).toHaveLength(1);
  });
  it('recalls a partial concept at low breadth and leaves unrelated input empty', async () => {
    const fragments = await fixture('concepts: [deliberate practice]');
    expect(searchFragments(fragments,'deliberate',{ breadth:'low' })).toHaveLength(1);
    expect(searchFragments(fragments,'unmatchedzxqv',{ breadth:'high' })).toEqual([]);
    expect(searchFragments(fragments,'filename-only-quasar',{ breadth:'high' })).toEqual([]);
  });
  it('keeps exact facet explanations separate instead of duplicating their scores', async () => {
    const fragments = await fixture('topics: [learning]');
    const results = searchFragments(fragments,'learning',{ breadth:'low' });
    expect(results[0].reasons.map(reason => reason.kind)).toEqual(['topic']);
  });
});
