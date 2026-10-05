import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeSource, searchFragments, prepareSource, type Fragment } from '../src/core';
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

describe('short Chinese queries against the shipped synthetic vault', () => {
  const vault = new URL('../fixtures/sample-vault/',import.meta.url);
  const targetPath = '学习/缩小练习变量.md';
  const originals = new Map<string,string>();
  const fragments: Fragment[] = [];
  let targetIds: string[];
  beforeAll(async () => {
    const files = (await fs.readdir(vault,{ recursive:true })).filter(file => /\.(md|canvas)$/u.test(file)).sort();
    for (const file of files) {
      const relativePath = file.replaceAll('\\','/');
      const raw = await fs.readFile(new URL(relativePath,vault),'utf8');
      originals.set(relativePath,raw);
      const source = prepareSource(relativePath,raw,createHash('sha256').update(raw).digest('hex'),`synthetic:${relativePath}`);
      fragments.push(...(await analyzeSource(source,{ mode:'local-excerpts',cloudConsent:false,now:'2026-01-01T00:00:00.000Z' })).fragments);
    }
    const target = fragments.filter(fragment => fragment.evidence.some(item => item.relativePath === targetPath));
    // The keyword occurs only in the declared mechanism, not the excerpt/title.
    expect(target).toHaveLength(2);
    for (const fragment of target) expect(`${fragment.title}\n${fragment.summary}`).not.toContain('变量');
    targetIds = target.map(fragment => fragment.id).sort();
  });
  it.each(['medium','high'] as const)('recalls the real mechanism keyword and short natural queries at %s breadth', breadth => {
    const before = JSON.stringify(fragments);
    for (const query of ['变量','变量？','怎么缩小变量']) {
      const results = searchFragments(fragments,query,{ breadth });
      expect(results.map(result => result.fragment.id).sort()).toEqual(targetIds);
      for (const result of results) {
        expect(result.score).toBeGreaterThan(0);
        expect(result.fragment.mode).toBe('local');
        expect(result.fragment.privacy).toBe('normal');
        expect(result.reasons).toHaveLength(1);
        expect(result.reasons[0]).toMatchObject({ kind:'content' });
        expect(result.reasons[0].label).toContain('Facet keyword match:');
        expect(result.reasons[0].label).toContain('变量');
        expect(result.reasons[0].label).toContain('缩小变量以定位问题');
        expect(result.reasons[0].caveat).toContain('not evidence');
        for (const evidence of result.fragment.evidence) {
          expect(evidence.relativePath).toBe(targetPath);
          expect(originals.get(targetPath)!.slice(evidence.start,evidence.end)).toBe(evidence.quote);
          expect(result.reasons[0].quotes).toContain(evidence.quote);
        }
      }
    }
    expect(JSON.stringify(fragments)).toBe(before);
  });
  it.each(['low','medium','high'] as const)('keeps two-character content recall and top-result ranking at %s breadth', breadth => {
    const results = searchFragments(fragments,'弱点',{ breadth });
    expect(results.map(result => result.fragment.id).sort()).toEqual(targetIds);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    for (const result of results) {
      expect(result.score).toBeGreaterThan(0);
      expect(result.reasons.map(reason => reason.label)).toEqual(['Lexical baseline: 弱点']);
    }
    expect(searchFragments(fragments,'弱点',{ breadth,limit:1 })).toEqual(results.slice(0,1));
    expect(searchFragments(fragments,'变量',{ breadth:'low' })).toEqual([]);
  });
  it.each(['low','medium','high'] as const)('refuses unrelated two-character queries without filling top-K at %s breadth', breadth => {
    for (const query of ['寿司','税率','银河','木马']) expect(searchFragments(fragments,query,{ breadth,limit:200 })).toEqual([]);
  });
  it('keeps full mechanism facets distinct and respects source exclusion', () => {
    const facets = { mechanisms:['缩小变量以定位问题'] };
    const keywords = searchFragments(fragments,'变量',{ breadth:'medium' });
    const exact = searchFragments(fragments,'',{ breadth:'medium',facets });
    expect(exact.map(result => result.fragment.id)).toEqual(keywords.map(result => result.fragment.id));
    for (const result of exact) {
      expect(result.reasons.map(reason => reason.kind)).toEqual(['mechanism']);
      expect(result.reasons[0].label).toBe('Suggested shared mechanism: 缩小变量以定位问题');
      expect(result.score).toBeGreaterThan(keywords.find(keyword => keyword.fragment.id === result.fragment.id)!.score);
    }
    expect(searchFragments(fragments,'',{ breadth:'low',facets })).toEqual([]);
    expect(searchFragments(fragments,'变量',{ breadth:'high',excludeSource:targetPath })).toEqual([]);
    expect(searchFragments(fragments,'',{ breadth:'high',facets,excludeSource:targetPath })).toEqual([]);
  });
});
