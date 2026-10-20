// SPDX-License-Identifier: MIT
// Independent authored corpora; synthetic AI-shaped fragments are not model output.
import { expect, it } from 'vitest';
import { analyzeSource, prepareSource, searchFragments } from '../src/core';
import { lexicalTokens } from '../src/core/retrieval';
import { presentExplanation } from '../src/presentation';
import { hash } from '../src/sources';
import type { Fragment, SearchResult } from '../src/core/types';
const project=(results:SearchResult[]) => Array.from(results,r => ({ id:r.fragment.id,score:r.score,reasons:r.reasons,group:r.group }));
async function excerpt(text:string,name='synthetic.md') {
  const source=prepareSource(name,text,hash(text),hash(name).slice(0,24));
  return (await analyzeSource(source,{ mode:'local-excerpts',cloudConsent:false,now:'2026-01-01T00:00:00.000Z' })).fragments[0];
}
// Full-document content-only reference: preserve the previous TF-IDF arithmetic,
// frequency corpus, reason grammar, stable order and default cutoff exactly.
function fullDocument(fragments:Fragment[],query:string):ReturnType<typeof project> {
  const count=(tokens:string[]) => { const m=new Map<string,number>();for (const t of tokens) m.set(t,(m.get(t) ?? 0)+1);return m; };
  const q=count(lexicalTokens(query)),docs=fragments.map(f => count(lexicalTokens(f.title+'\n'+f.summary))),freq=new Map<string,number>();
  for (const doc of docs) for (const token of doc.keys()) freq.set(token,(freq.get(token) ?? 0)+1);
  const weight=(token:string,tf:number) => (1+Math.log(tf))*(Math.log((docs.length+1)/((freq.get(token) ?? 0)+1))+1);
  return fragments.flatMap((f,i) => {
    let numerator=0,qNorm=0,dNorm=0;
    for (const [t,tf] of q) { const w=weight(t,tf);qNorm+=w*w;numerator+=w*(docs[i].has(t) ? weight(t,docs[i].get(t)!):0); }
    for (const [t,tf] of docs[i]) { const w=weight(t,tf);dNorm+=w*w; }
    const score=qNorm && dNorm ? numerator/Math.sqrt(qNorm*dNorm):0;
    return score>0 ? [{ id:f.id,score,reasons:[{ kind:'content' as const,label:'Lexical baseline: '+[...q.keys()].filter(t => docs[i].has(t)).slice(0,6).join(' · '),quotes:[...new Set(f.evidence.map(e => e.quote))].slice(0,3) }],group:undefined }] : [];
  }).sort((a,b) => b.score-a.score || a.id.localeCompare(b.id)).slice(0,20);
}
it.each([0,120,320])('a query-only matching window retrieves a point at token position %s without changing a stored fragment',async position => {
  const point='Cerulean plate support pads prevent sliding through sharp trolley turns.',query='cerulean plate support pads prevent sliding sharp trolley turns';
  const padding=Array.from({ length:480 },(_,i) => 'syntheticbackground'+i);
  const body=[...padding.slice(0,position),point,...padding.slice(position)].join(' '),target=await excerpt(body,'long.md');
  const foils=await Promise.all(Array.from({ length:9 },(_,i) => excerpt('A cerulean plate rests beside a wide wooden rack, a linen cover, and a painted shelf. Synthetic specimen '+i+'.','foil-'+i+'.md')));
  const fragments=[target,...foils],before=JSON.stringify(fragments),hits=searchFragments(fragments,query,{ breadth:'low' });
  expect(hits.slice(0,7).some(r => r.fragment.id === target.id)).toBe(true);
  const match=hits.find(r => r.fragment.id === target.id)!;expect(match.reasons[0].label).toMatch(/^Local passage keyword match: /u);expect(match.reasons[0].caveat).toContain('full excerpt');
  expect(match.fragment.summary).toBe(body);expect(match.fragment.evidence[0].quote).toBe(body);expect(JSON.stringify(fragments)).toBe(before);
  expect(match.score).toBeGreaterThan(fullDocument(fragments,query).find(r => r.id === target.id)!.score);
  for (const reason of match.reasons) expect(reason.quotes).toEqual(target.evidence.map(e => e.quote));
  expect(searchFragments(fragments,'unmatchedgalacticquery',{ breadth:'high' })).toEqual([]);
});
it.each(['low','medium','high'] as const)('all-short and all-AI full rankings remain exactly the old baseline at %s',async breadth => {
  const short=await Promise.all(['Cobalt supports hold the mock plate on its cart.','The synthetic linen cover is beside a cobalt tray.','浅色支架托住模拟薄板，保持边角平整。','木制推车转弯时核验托盘的固定点。'].map((s,i) => excerpt(s,'short-'+i+'.md')));
  const long=await excerpt('Synthetic background observation. '.repeat(100)+'Cobalt supports hold the mock plate on its cart.','long.md');
  const ai=[...short,long].map(f => ({ ...f,mode:'ai' as const,kind:'idea' }));
  const mixed=[...short,{ ...long,mode:'ai' as const,kind:'idea' }];
  for (const fragments of [short,ai,mixed]) for (const query of ['cobalt supports plate cart','薄板平整','synthetic tray','银河税率']) {
    expect(project(searchFragments(fragments,query,{ breadth }))).toEqual(fullDocument(fragments,query));
  }
});
it.each([127,128,129])('local matching preserves the whole-document fallback and exact short-side boundary at %s tokens',async length => {
  const base=await excerpt('A synthetic fixed shell.');
  const title='Shell',body=Array.from({ length:length-1 },(_,i) => i===length-3 ? 'cerulean':'background'+i).join(' ');
  const f={ ...base,title,summary:body },tokens=lexicalTokens(title+'\n'+body);expect(tokens).toHaveLength(length);
  const result=searchFragments([f],'cerulean',{ breadth:'low' });
  expect(result[0].score).toBeGreaterThanOrEqual(fullDocument([f],'cerulean')[0].score);
  if (length<=128) expect(project(result)).toEqual(fullDocument([f],'cerulean'));
  expect(result[0].fragment.summary).toBe(body);
});
it('does not start matching filenames, local sibling context or hidden source text',async () => {
  const f=await excerpt('Visible synthetic cedar shelf.\n\n<!-- passagehidden -->','filenameonly.md');
  const context={ ...f,localContext:'siblingonly '.repeat(100) };
  for (const query of ['filenameonly','passagehidden','siblingonly']) expect(searchFragments([context],query,{ breadth:'high' })).toEqual([]);
});
it('local passage hints explain the lexical limitation in English and Chinese without changing quotation context',async () => {
  const f=await excerpt('Synthetic background. '.repeat(100)+'Cerulean support pads keep the plate steady.');
  const reason=searchFragments([f],'cerulean support pads steady',{ breadth:'medium' })[0].reasons[0];
  expect(reason.label).toMatch(/^Local passage keyword match: /u);expect(reason.caveat).toContain('not semantic equivalence');
  expect(presentExplanation(reason.label,'zh')).toContain('局部关键词匹配：');
  expect(presentExplanation(reason.caveat!,'zh')).toContain('完整摘录');expect(presentExplanation(reason.caveat!,'zh')).toContain('条件和反例');
  expect(presentExplanation(reason.caveat!,'en')).toBe(reason.caveat);
  expect(reason.quotes).toEqual([f.summary]);
});
