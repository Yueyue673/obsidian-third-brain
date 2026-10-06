// SPDX-License-Identifier: MIT
// Authored synthetic sources and strict-parser replies; no live model or HTTP.
import { expect, it, vi } from 'vitest';
import { ThirdBrainController } from '../src/controller';
import { analyzeSource, prepareSource, searchFragments } from '../src/core/index';
import * as network from '../src/core/connections';
import { emptyFacets, emptyIndex, type Breadth, type FacetSelection, type SourceSnapshot } from '../src/core/types';
import { defaults } from '../src/settings';
import { hash } from '../src/sources';
const selection=(channel:FacetSelection['channel']):FacetSelection=>({channel,value:'Synthetic bounded signal'});
const routes: {channel:FacetSelection['channel'];breadth:Breadth}[]=[...(['topics','concepts'] as const).flatMap(channel=>(['low','medium','high'] as const).map(breadth=>({channel,breadth}))),{channel:'mechanisms',breadth:'medium'},{channel:'mechanisms',breadth:'high'},{channel:'atmosphere',breadth:'high'}];
async function fixture(prefix=31){
 const state=emptyIndex(),files=new Map<string,SourceSnapshot>(),blocked=new Set<string>();
 const add=async(n:number)=>{const raw=`Independent authored specimen ${n} records a bounded observation, without asserting semantic equivalence.`,s=prepareSource(`Synthetic/facet-tail-${n}.md`,raw,hash(raw),'synthetic-tail-'+n);const response={version:1,decision:'extract',fragments:[{title:'Independent marker',summary:raw,kind:'observation',topics:['Synthetic bounded signal'],concepts:['Synthetic bounded signal'],mechanisms:['Synthetic bounded signal'],atmosphere:['Synthetic bounded signal'],quotes:[raw],conditions:[],caveats:[]}]};const a=await analyzeSource(s,{mode:'local-model',cloudConsent:false,model:{request:async()=>response},now:'2026-01-01'});files.set(s.path,structuredClone(s));state.sources[s.path]={hash:s.hash,status:'indexed',fragmentIds:a.fragments.map(f=>f.id)};for(const f of a.fragments)state.fragments[f.id]=f;};
 for(let n=0;n<prefix+9;n++)await add(n);
 const ordered=Object.values(state.fragments).sort((a,b)=>a.id.localeCompare(b.id)),stale=ordered.slice(0,prefix),owner=ordered[prefix];
 const read=vi.fn(async(p:string)=>structuredClone(files.get(p)??null)),factory=vi.fn(()=>{throw Error('Selection must not construct model');}),commit=vi.fn(async()=>{});
 const c=new ThirdBrainController({list:async()=>[...files.values()],read,verify:async()=>{},excluded:async()=>new Set(blocked)},{load:async()=>state,recover:async()=>{},commit},()=>({...defaults,mode:'local-model'}),factory,async()=>{});await c.initialize();return{c,state,files,blocked,stale,owner,read,factory,commit};
}
it.each(routes)('continues beyond31 removed/excluded/hash/id/privacy/evidence/membership $channel/$breadth',async({channel,breadth})=>{
 for(const mutation of ['removed','excluded','hash','id','privacy','evidence','membership'] as const){const h=await fixture();for(const f of h.stale){const e=f.evidence[0],s=h.files.get(e.relativePath)!;if(mutation==='removed')h.files.delete(s.path);else if(mutation==='excluded')h.blocked.add(s.path);else if(mutation==='hash')s.hash=hash('Authored changed bytes');else if(mutation==='id')s.id+='-changed';else if(mutation==='privacy')s.privacy='private';else if(mutation==='evidence')s.text='An independently authored changed quotation.';else h.state.sources[s.path].fragmentIds=[];}
 const before=JSON.stringify(h.state),hits=await h.c.find('',breadth,'normal',selection(channel));expect(hits[0].fragment.id).toBe(h.owner.id);expect(hits.filter(r=>!r.group)).toHaveLength(7);expect(hits.filter(r=>r.group).length).toBeLessThanOrEqual(2);expect(h.factory).not.toHaveBeenCalled();expect(h.commit).not.toHaveBeenCalled();expect(JSON.stringify(h.state)).toBe(before);await h.c.verifyOpen(hits[0].fragment.evidence[0]);h.c.dispose();}
});
it('has no hardcoded200 cap, stops reading once seven current cards fill the budget, and old open rechecks',async()=>{
 const h=await fixture(205);for(const f of h.stale)h.blocked.add(f.evidence[0].relativePath);const hits=await h.c.find('','medium','normal',selection('mechanisms'));expect(hits[0].fragment.id).toBe(h.owner.id);expect(hits).toHaveLength(7);
 const untouched=Object.values(h.state.fragments).sort((a,b)=>a.id.localeCompare(b.id)).slice(212);expect(untouched).toHaveLength(2);for(const f of untouched)expect(h.read.mock.calls.some(([p])=>p===f.evidence[0].relativePath)).toBe(false);
 const e=hits[0].fragment.evidence[0];await h.c.verifyOpen(e);h.files.get(e.relativePath)!.hash=hash('Authored later revision');await expect(h.c.verifyOpen(e)).rejects.toThrow('changed');expect(h.commit).not.toHaveBeenCalled();
});
it.each(routes)('opt-in preserves core head/ranks/reasons and all-current7 $channel/$breadth',async({channel,breadth})=>{
 const h=await fixture(),fragments=Object.values(h.state.fragments),options={breadth,limit:30,facets:{[channel]:[selection(channel).value]},index:h.state,retainIndirectCandidates:breadth==='high'};
 const old=searchFragments(fragments,'',options),next=searchFragments(fragments,'',{...options,retainRankedContinuation:true});expect(Array.from(next)).toEqual(Array.from(old));expect(next.indirectCandidates).toEqual(old.indirectCandidates);expect(old).not.toHaveProperty('rankedContinuation');expect(next.rankedContinuation).toHaveLength(10);expect([...next,...next.rankedContinuation!]).toEqual(Array.from(searchFragments(fragments,'',{...options,limit:200})));expect(await h.c.find('',breadth,'normal',selection(channel))).toEqual(old.slice(0,7));
 const natural=searchFragments(fragments,'bounded signal',options),naturalOpt=searchFragments(fragments,'bounded signal',{...options,retainRankedContinuation:true});expect(naturalOpt).toEqual(natural);expect(naturalOpt).not.toHaveProperty('rankedContinuation');
});
it('builds network once per search, not for continuation consumption, and kind remains separate',async()=>{
 const h=await fixture();for(const f of h.stale)h.blocked.add(f.evidence[0].relativePath);const spy=vi.spyOn(network,'buildFragmentNetwork');try{await h.c.find('','high','normal',selection('mechanisms'));expect(spy).toHaveBeenCalledTimes(1);spy.mockClear();const kinds=await h.c.find('','high','normal',{channel:'kind',value:'observation'});expect(kinds[0].fragment.id).toBe(h.owner.id);expect(kinds.every(r=>r.reasons.length===1&&r.reasons[0].kind==='kind'&&!r.group)).toBe(true);expect(spy).not.toHaveBeenCalled();}finally{spy.mockRestore();}
});
it.each(['EIO','source-format','unknown-safety'] as const)('tail $0 propagates exact error, not a partial result or commit',async code=>{
 const h=await fixture();for(const f of h.stale)h.blocked.add(f.evidence[0].relativePath);const ordered=Object.values(h.state.fragments).sort((a,b)=>a.id.localeCompare(b.id)),fault=ordered[33].evidence[0].relativePath,error=Object.assign(new Error('Synthetic '+code),{code});h.read.mockImplementation(async p=>{if(p===fault)throw error;return structuredClone(h.files.get(p)??null);});await expect(h.c.find('','medium','normal',selection('mechanisms'))).rejects.toBe(error);expect(h.c.status().phase).toBe('error');expect(h.commit).not.toHaveBeenCalled();
});
it.each(['resolve','reject'] as const)('cancels in the tail, ignores late read $0, preserves state and makes no commit',async ending=>{
 const h=await fixture();for(const f of h.stale)h.blocked.add(f.evidence[0].relativePath);const fault=h.owner.evidence[0].relativePath;let started!:()=>void,release!:(s:SourceSnapshot)=>void,fail!:(e:Error)=>void;const reached=new Promise<void>(r=>{started=r;});let reads=0;h.read.mockImplementation(async p=>{if(p===fault&&++reads===2){started();return new Promise<SourceSnapshot>((resolve,reject)=>{release=resolve;fail=reject;});}return structuredClone(h.files.get(p)??null);});const before=JSON.stringify(h.state),pending=h.c.find('','medium','normal',selection('mechanisms'));await reached;h.c.cancel();await expect(pending).rejects.toMatchObject({name:'AbortError'});if(ending==='resolve')release(h.files.get(fault)!);else fail(Error('Synthetic late failure'));await new Promise(r=>setImmediate(r));expect(h.c.status().phase).toBe('cancelled');expect(JSON.stringify(h.state)).toBe(before);expect(h.commit).not.toHaveBeenCalled();
});
it('mechanism low and atmosphere low/medium remain disabled',async()=>{const h=await fixture();for(const [channel,breadth] of [['mechanisms','low'],['atmosphere','low'],['atmosphere','medium']] as const)expect(await h.c.find('',breadth,'normal',selection(channel))).toEqual([]);});
