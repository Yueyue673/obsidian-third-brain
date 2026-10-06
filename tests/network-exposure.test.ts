// SPDX-License-Identifier: MIT
// Synthetic only; the optional actual Sol cache and authored interference are read-only.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ThirdBrainController } from '../src/controller';
import { searchFragments } from '../src/core/retrieval';
import { prepareSource } from '../src/core/index';
import { emptyFacets, emptyIndex, type Fragment, type IndexState, type SourceSnapshot, type SearchResult } from '../src/core/types';
import { defaults } from '../src/settings';
import { hash } from '../src/sources';

const group = (r: SearchResult) => (r as SearchResult & { group?: string }).group;
const main = (r: SearchResult[]) => r.filter(r => group(r) !== 'indirect-suggestion');
const extra = (r: SearchResult[]) => r.filter(r => group(r) === 'indirect-suggestion');
function fixture(weak = true, targets = 1) {
  const state = emptyIndex(), files = new Map<string,SourceSnapshot>();
  const add = (id: string, summary: string, mechanisms: string[]) => {
    const source = prepareSource(`Synthetic/${id}.md`,`Exact synthetic quotation for ${id}.`,hash(`Exact synthetic quotation for ${id}.`),id);
    const fragment: Fragment = { id,privacy:'normal',title:id,summary,kind:'method',facets:{ ...emptyFacets(),mechanisms },evidence:[{ sourceId:id,relativePath:source.path,sourceHash:source.hash,quote:source.text,start:0,end:source.text.length }],mode:'ai',updatedAt:'2026-01-01',conditions:[`${id} condition`],caveats:[`${id} caveat`] };
    state.fragments[id] = fragment; state.sources[source.path] = { hash:source.hash,status:'indexed',fragmentIds:[id] }; files.set(source.path,source);
  };
  add('anchor','needle',['needle','bridge']);
  for (let i=0;i<35;i++) add(`distractor-${i}`,'needle',[]);
  for (let i=0;i<targets;i++) add(`target-${i}`,weak ? 'needle distant sparse material with many unrelated words and details' : 'distant sparse material',['bridge']);
  return { state,files };
}
async function harness(state: IndexState, files: Map<string,SourceSnapshot>, facets?: unknown) {
  const blocked = new Set<string>(); let hook: (p: string) => void = () => {}; let reads = 0;
  const controller = new ThirdBrainController({ list:async()=>{throw Error('No refresh');},read:async p=>{reads++;hook(p);return structuredClone(files.get(p) ?? null);},excluded:async()=>new Set(blocked),verify:async()=>{throw Error('No write');} },{ load:async()=>state,recover:async()=>{},commit:async()=>{throw Error('No commit');} },()=>({ ...defaults,excludes:[],mode:facets ? 'local-model' : 'local-excerpts' }),()=>facets ? {request:async()=>({ version:1,...facets as object })} : undefined,async()=>{});
  await controller.initialize();
  return { controller,blocked,hook:(fn: typeof hook)=>{hook=fn;},reads:()=>reads };
}

describe('production high-breadth exposure without ranking displacement', () => {
  it.each([true,false])('exposes an offscreen %s weak-direct/pure target beyond unified 30 without changing main', async weak => {
    const {state,files} = fixture(weak), h = await harness(state,files);
    try {
      const old = searchFragments(Object.values(state.fragments),'needle',{ breadth:'high',index:state,limit:30 }).slice(0,7);
      const hits = await h.controller.find('needle','high');
      expect(main(hits)).toEqual(old); expect(extra(hits).map(r=>r.fragment.id)).toEqual(['target-0']);
      expect(extra(hits)[0].reasons.some(r=>r.kind==='content')).toBe(weak);
      expect(extra(hits)[0].reasons.some(r=>r.kind==='indirect-mechanism')).toBe(true);
      expect(new Set(hits.map(r=>r.fragment.id)).size).toBe(hits.length);
    } finally { h.controller.dispose(); }
  });
  it('caps extra suggestions at two, never duplicates visible targets, and does not fill empty searches', async () => {
    const {state,files} = fixture(false,3), h = await harness(state,files);
    try {
      expect(extra(await h.controller.find('needle','high'))).toHaveLength(2);
      expect(await h.controller.find('quasar','high')).toEqual([]);
      expect(await h.controller.find('','high')).toEqual([]);
      for (const breadth of ['low','medium'] as const) expect(await h.controller.find('needle',breadth)).toEqual(searchFragments(Object.values(state.fragments),'needle',{ breadth,index:state,limit:30 }).slice(0,7));
      for (const id of Object.keys(state.fragments)) if (id.startsWith('distractor')) delete state.fragments[id];
      const visible = await h.controller.find('needle','high'); expect(extra(visible)).toEqual([]); expect(new Set(visible.map(r=>r.fragment.id)).size).toBe(visible.length);
    } finally { h.controller.dispose(); }
  });
  for (const endpoint of ['anchor','target-0']) it.each(['hash','identity','quote','privacy','deleted','excluded','membership'])('drops extra weak-direct target with stale '+endpoint+' %s', async variant => {
    const {state,files} = fixture(), path = `Synthetic/${endpoint}.md`, source = files.get(path)!, h = await harness(state,files);
    if (variant==='hash') files.set(path,{...source,hash:'b'.repeat(64)});
    if (variant==='identity') files.set(path,{...source,id:'other'});
    if (variant==='quote') files.set(path,{...source,text:'missing quote'});
    if (variant==='privacy') files.set(path,{...source,privacy:'private'});
    if (variant==='deleted') files.delete(path);
    if (variant==='excluded') h.blocked.add(path);
    if (variant==='membership') state.sources[path].fragmentIds=[];
    try { expect(extra(await h.controller.find('needle','high'))).toEqual([]); }
    finally { h.controller.dispose(); }
  });
  it.each(['anchor','target-0'])('checks both complete endpoints even when clicking the other side after %s changes', async endpoint => {
    const {state,files} = fixture(), h = await harness(state,files);
    try {
      const suggestion = extra(await h.controller.find('needle','high'))[0]; expect(suggestion).toBeDefined();
      const trace = suggestion.reasons.find(r=>r.indirect)!.indirect!;
      for (const e of [...trace.anchor.evidence,...trace.target.evidence]) await expect(h.controller.verifyOpen(e)).resolves.toBeUndefined();
      const source = files.get(`Synthetic/${endpoint}.md`)!; files.set(source.path,{...source,privacy:'private'});
      for (const e of [...trace.anchor.evidence,...trace.target.evidence]) await expect(h.controller.verifyOpen(e)).rejects.toThrow();
    } finally { h.controller.dispose(); }
  });
  it('does not return late suggestions after cancellation during extra endpoint reads', async () => {
    const {state,files} = fixture(), h = await harness(state,files);
    h.hook(p=>{if(p==='Synthetic/target-0.md')h.controller.cancel();});
    try { await expect(h.controller.find('needle','high')).rejects.toThrow('Cancelled'); expect(h.controller.status().phase).toBe('cancelled'); }
    finally { h.controller.dispose(); }
  });
  it('removes an extra weak-direct suggestion rather than downgrading it after a late anchor change', async () => {
    const {state,files}=fixture(), h=await harness(state,files);let reads=0;
    h.hook(p=>{if(p==='Synthetic/target-0.md'&&++reads===3){const s=files.get('Synthetic/anchor.md')!;files.set(s.path,{...s,hash:'b'.repeat(64)});}});
    try { const hits=await h.controller.find('needle','high');expect(reads).toBeGreaterThanOrEqual(3);expect(extra(hits)).toEqual([]);expect(hits.some(r=>r.fragment.id==='target-0')).toBe(false); }
    finally {h.controller.dispose();}
  });
  it.each(['anchor','target-0'])('checks all merged %s donors, exclusions and membership again on opposite-side clicks', async endpoint => {
    const {state,files}=fixture(), f=state.fragments[endpoint];
    const s=prepareSource(`Synthetic/${endpoint}-second.md`,'Second exact synthetic donor quotation.',hash('Second exact synthetic donor quotation.'),`${endpoint}-second`);
    files.set(s.path,s);f.evidence.push({sourceId:s.id,relativePath:s.path,sourceHash:s.hash,quote:s.text,start:0,end:s.text.length});state.sources[s.path]={hash:s.hash,status:'indexed',fragmentIds:[f.id]};
    const h=await harness(state,files);
    try {
      const r=extra(await h.controller.find('needle','high'))[0];expect(r).toBeDefined();const trace=r.reasons.find(r=>r.indirect)!.indirect!;
      const opposite=endpoint==='anchor'?trace.target.evidence[0]:trace.anchor.evidence[0];
      await expect(h.controller.verifyOpen(opposite)).resolves.toBeUndefined();
      h.blocked.add(s.path);await expect(h.controller.verifyOpen(opposite)).rejects.toThrow();h.blocked.clear();
      state.sources[s.path].fragmentIds=[];await expect(h.controller.verifyOpen(opposite)).rejects.toThrow();state.sources[s.path].fragmentIds=[f.id];
      files.set(s.path,{...s,text:'No complete donor quotation'});await expect(h.controller.verifyOpen(opposite)).rejects.toThrow();
    }finally{h.controller.dispose();}
  });
});

const cacheRoot = resolve(process.env.THIRDBRAIN_EXPOSURE_ROOT ?? '.');
const cache = resolve(cacheRoot,'.local/live-ai/direct/index.json');
it.skipIf(!existsSync(cache))('keeps actual cached Sol main IDs/scores/reasons under 0/5/28 original empty-facet interference', async () => {
  const index: IndexState = JSON.parse(readFileSync(cache,'utf8'));
  const journey = JSON.parse(readFileSync(resolve(cacheRoot,'.local/live-ai/direct/journey.json'),'utf8'));
  const report = JSON.parse(readFileSync(resolve(cacheRoot,'.local/network-activation/exposure/evidence.json'),'utf8'));
  const before = JSON.stringify(index), query = journey.naturalQuery.query;
  for (const count of [0,5,28]) {
    const state = structuredClone(index), files = new Map<string,SourceSnapshot>();
    for (const path of Object.keys(state.sources)) {
      const raw = readFileSync(resolve(cacheRoot,'.local/live-ai/direct/synthetic-vault',path),'utf8');
      const e = Object.values(state.fragments).flatMap(f=>f.evidence).find(e=>e.relativePath===path)!;
      files.set(path,prepareSource(path,raw,hash(raw),e.sourceId));
    }
    for (const item of report.addedExcerpts.slice(0,count)) {
      const f: Fragment = structuredClone(item.fragment), raw = readFileSync(resolve(cacheRoot,`.local/network-activation/exposure/authored-excerpts-b/${String(Number(f.id.slice(-2))).padStart(2,'0')}.md`),'utf8');
      expect(hash(raw)).toBe(item.hash); expect(Object.values(f.facets).flat()).toEqual([]);
      files.set(f.evidence[0].relativePath,prepareSource(f.evidence[0].relativePath,raw,hash(raw),f.evidence[0].sourceId));
      state.fragments[f.id]=f; state.sources[f.evidence[0].relativePath]={hash:f.evidence[0].sourceHash,status:'indexed',fragmentIds:[f.id]};
    }
    const h = await harness(state,files,journey.naturalQuery.facets);
    try {
      const expected = searchFragments(Object.values(state.fragments),query,{breadth:'high',facets:journey.naturalQuery.facets,index:state,limit:30}).slice(0,7);
      const visible = await h.controller.find(query,'high'); expect(main(visible)).toEqual(expected);
      const target = visible.find(r=>r.fragment.evidence.some(e=>e.relativePath==='Synthetic/02-rehearsal.md') && r.reasons.some(r=>r.indirect));
      expect(target).toBeDefined(); expect(extra(visible)).toHaveLength(count ? 1 : 0);
      expect(target!.reasons.some(r=>r.kind==='content')).toBe(true);
    } finally { h.controller.dispose(); }
  }
  expect(JSON.stringify(index)).toBe(before);
});
