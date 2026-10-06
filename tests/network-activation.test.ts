// SPDX-License-Identifier: MIT
// All fixtures are synthetic. Optional local Sol cache is read-only, never a model/HTTP replay.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { ACTIVATION_LIMITS, searchFragments } from '../src/core/retrieval';
import { emptyFacets, emptyIndex, type Fragment, type IndexState, type Privacy } from '../src/core/types';

function fragment(id: string, mechanisms: string[], privacy: Privacy = 'normal'): Fragment {
  return { id,privacy,title:`Title ${id}`,summary:`Summary ${id}`,kind:'method',facets:{ ...emptyFacets(),mechanisms },mode:'ai',updatedAt:'2026-01-01',conditions:[`Condition ${id}`],caveats:[`Caveat ${id}`],
    evidence:[{ sourceId:id,relativePath:`Synthetic/${id}.md`,sourceHash:'a'.repeat(64),quote:`Evidence ${id}`,start:0,end:`Evidence ${id}`.length }] };
}
function indexOf(...fragments: Fragment[]): IndexState {
  const index = emptyIndex();
  for (const f of fragments) { index.fragments[f.id] = f; for (const e of f.evidence) index.sources[e.relativePath] = { hash:e.sourceHash,status:'indexed',fragmentIds:[f.id] }; }
  return index;
}
const search = (index: IndexState, query = 'needle', breadth: 'low'|'medium'|'high' = 'high', extra = {}) => searchFragments(Object.values(index.fragments),query,{ breadth,index,facets:{ mechanisms:['needle'] },...extra });
const indirect = (results: ReturnType<typeof search>) => results.flatMap(r => r.reasons.filter(reason => reason.kind === 'indirect-mechanism'));

describe('bounded query activation of the existing mechanism network', () => {
  it('uses one hop only, preserves direct scores, carries both endpoints and does not mutate the index', () => {
    const index = indexOf(fragment('anchor',['needle','shared']),fragment('neighbor',['shared','second-hop']),fragment('far',['second-hop']));
    const before = JSON.stringify(index), results = search(index), reason = indirect(results)[0];
    expect(results.map(r => r.fragment.id)).toEqual(['anchor','neighbor']);
    expect(reason.indirect).toEqual({ steps:1,sharedMechanisms:['shared'],anchor:{ fragmentId:'anchor',title:'Title anchor',privacy:'normal',evidence:index.fragments.anchor.evidence,conditions:['Condition anchor'],caveats:['Caveat anchor'] },target:{ fragmentId:'neighbor',title:'Title neighbor',privacy:'normal',evidence:index.fragments.neighbor.evidence,conditions:['Condition neighbor'],caveats:['Caveat neighbor'] } });
    expect(reason.caveat).toContain('not equivalence to the query mechanism');
    expect(results[1].score).toBeLessThan(results[0].score); expect(results[1].score).toBeLessThanOrEqual(0.12);
    expect(JSON.stringify(index)).toBe(before);
    index.fragments.neighbor.summary = 'needle';
    const direct = searchFragments(Object.values(index.fragments),'needle',{ breadth:'high',facets:{ mechanisms:['needle'] } });
    expect(search(index).find(r => r.fragment.id === 'neighbor')!.score).toBe(direct.find(r => r.fragment.id === 'neighbor')!.score);
  });
  it.each(['low','medium'] as const)('%s keeps the old scope and explanation bytes', breadth => {
    const index = indexOf(fragment('anchor',['needle','shared']),fragment('neighbor',['shared']));
    expect(search(index,'needle',breadth)).toEqual(searchFragments(Object.values(index.fragments),'needle',{ breadth,facets:{ mechanisms:['needle'] } }));
    expect(indirect(search(index,'needle',breadth))).toEqual([]);
  });
  it('abstains on no match, empty context, no mechanism seed and topic/atmosphere-only edges', () => {
    const a = fragment('anchor',['needle']), b = fragment('neighbor',[]);
    a.facets.topics = b.facets.topics = ['shared topic']; a.facets.atmosphere = b.facets.atmosphere = ['quiet'];
    const index = indexOf(a,b);
    expect(indirect(search(index))).toEqual([]);
    expect(searchFragments(Object.values(index.fragments),'',{ breadth:'high',index })).toEqual([]);
    expect(searchFragments(Object.values(index.fragments),'quasar',{ breadth:'high',index })).toEqual([]);
    a.summary = 'needle'; a.facets.mechanisms = b.facets.mechanisms = ['shared'];
    expect(indirect(searchFragments(Object.values(index.fragments),'needle',{ breadth:'high',index }))).toEqual([]);
  });
  it.each(['general','知识','dense'])('rejects generic or overly dense mechanism postings: %s', shared => {
    const index = indexOf(fragment('anchor',['needle',shared]),...Array.from({ length:40 },(_,i) => fragment(`n${i}`,[shared])));
    expect(indirect(search(index))).toEqual([]);
  });
  it('respects exclusions, full provenance, indexed membership and privacy partitions', () => {
    const index = indexOf(fragment('anchor',['needle','shared']),fragment('neighbor',['shared']),fragment('local',['shared'],'local'),fragment('private',['shared'],'private'));
    expect(search(index).map(r => r.fragment.id)).toEqual(['anchor','neighbor']);
    expect(indirect(search(index,'needle','high',{ excludeSource:'anchor' }))).toEqual([]);
    expect(indirect(search(index,'needle','high',{ excludeSource:'Synthetic/neighbor.md' }))).toEqual([]);
    index.sources['Synthetic/anchor.md'].hash = 'b'.repeat(64);
    expect(indirect(search(index))).toEqual([]);
    index.sources['Synthetic/anchor.md'].hash = 'a'.repeat(64); index.sources['Synthetic/neighbor.md'].fragmentIds = [];
    expect(indirect(search(index))).toEqual([]);
  });
  it.each(['normal','local','private'] as const)('allows a one-hop suggestion within the same %s privacy partition', privacy => {
    const index = indexOf(fragment('anchor',['needle','shared'],privacy),fragment('neighbor',['shared'],privacy));
    expect(indirect(search(index))[0].indirect!.target.privacy).toBe(privacy);
  });
  it('can start from a direct analogy but never presents the neighbor as query-mechanism equivalence', () => {
    const index = indexOf(fragment('anchor',['needle','shared']),fragment('neighbor',['shared']));
    const hits = search(index,'unmentioned','high',{ facets:{ topics:['different requested topic'],mechanisms:['needle'] } });
    expect(hits[0].reasons.some(r => r.kind === 'analogy')).toBe(true);
    expect(hits[1].reasons.map(r => r.kind)).toEqual(['indirect-mechanism']);
  });
  it('abstains if any donor was filtered out of a merged endpoint', () => {
    const a = fragment('anchor',['needle','shared']), b = fragment('neighbor',['shared']);
    a.evidence.push({ ...a.evidence[0],sourceId:'second',relativePath:'Synthetic/second.md' });
    const index = indexOf(a,b);
    expect(indirect(search(index,'needle','high',{ excludeSource:'second' }))).toEqual([]);
  });
  it('keeps stable seed/neighbor/total caps and at most one reason per target', () => {
    const fs = Array.from({ length:4 },(_,i) => fragment(`s${i}`,['needle',...Array.from({ length:4 },(_,j) => `bridge-${i}-${j}`)]));
    for (let i=0;i<4;i++) for (let j=0;j<4;j++) fs.push(fragment(`n${i}-${j}`,[`bridge-${i}-${j}`]));
    const index = indexOf(...fs), results = search(index,'needle','high',{ limit:200 }), reasons = indirect(results);
    expect(reasons).toHaveLength(ACTIVATION_LIMITS.targets);
    const seeds = new Set(reasons.map(r => r.indirect!.anchor.fragmentId)); expect(seeds.size).toBeLessThanOrEqual(ACTIVATION_LIMITS.seeds);
    for (const id of seeds) expect(reasons.filter(r => r.indirect!.anchor.fragmentId === id).length).toBeLessThanOrEqual(ACTIVATION_LIMITS.neighborsPerSeed);
    expect(new Set(reasons.map(r => r.indirect!.target.fragmentId)).size).toBe(reasons.length);
    index.fragments = Object.fromEntries(Object.entries(index.fragments).reverse()); expect(search(index,'needle','high',{ limit:200 })).toEqual(results);
    expect(search(index,'needle','high',{ limit:1 })).toHaveLength(1);
  });
  it('retains the same controlled targets before a caller limit without changing ordinary limit semantics', () => {
    const index = indexOf(fragment('anchor',['needle','bridge']),fragment('target',['bridge']));
    const original = search(index,'needle','high',{limit:1});
    const retained = searchFragments(Object.values(index.fragments),'needle',{breadth:'high',index,limit:1,facets:{mechanisms:['needle']},retainIndirectCandidates:true});
    expect([...retained]).toEqual(original); expect(retained.indirectCandidates?.map(r=>r.fragment.id)).toEqual(['target']);
    expect(original).not.toHaveProperty('indirectCandidates');
    for (const breadth of ['low','medium'] as const) expect(searchFragments(Object.values(index.fragments),'needle',{breadth,index,retainIndirectCandidates:true})).not.toHaveProperty('indirectCandidates');
    expect(searchFragments(Object.values(index.fragments),'needle',{breadth:'high',index,limit:0,retainIndirectCandidates:true})).toEqual([]);
  });
});

const cache = '.local/live-ai/direct/index.json';
it.skipIf(!existsSync(cache))('activates the actual cached Sol kiln → rehearsal edge using its unchanged actual query facets', () => {
  const index = JSON.parse(readFileSync(cache,'utf8')) as IndexState;
  const journey = JSON.parse(readFileSync('.local/live-ai/direct/journey.json','utf8'));
  const before = JSON.stringify(index);
  const results = searchFragments(Object.values(index.fragments),journey.naturalQuery.query,{ breadth:'high',index,facets:journey.naturalQuery.facets });
  const reason = indirect(results).find(r => r.indirect!.target.evidence.some(e => e.relativePath === 'Synthetic/02-rehearsal.md'))!;
  expect(reason).toBeDefined(); expect(reason.indirect!.sharedMechanisms).toEqual(['一次只改一个因素']);
  expect(reason.indirect!.anchor.evidence[0].relativePath).toBe('Synthetic/01-kiln.md');
  expect(JSON.stringify(index)).toBe(before);
  expect(searchFragments(Object.values(index.fragments),journey.unrelatedQuery.query,{ breadth:'high',index })).toEqual([]);
});
