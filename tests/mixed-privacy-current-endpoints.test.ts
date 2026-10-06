// SPDX-License-Identifier: MIT
// Authored synthetic sources only. No HTTP, provider, cache, or native GUI.
import { expect, it, vi } from 'vitest';
import { ThirdBrainController } from '../src/controller';
import { buildIndex, prepareSource, searchFragments } from '../src/core/index';
import { emptyFacets, emptyIndex, type Privacy, type QuerySelection, type SourceSnapshot } from '../src/core/types';
import { defaults, generationSignature } from '../src/settings';
import { hash } from '../src/sources';
import { restrictive } from '../src/core/util';
const body='Shorter cycles of checking and correcting reduce wasted effort. Repeated feedback from a bounded experiment identifies a useful next adjustment.';
const query='checking and correcting';
async function fixture(pa:Privacy='private',pb:Privacy='normal') {
  const files=new Map<string,SourceSnapshot>();
  for(const [i,privacy] of [pa,pb].entries()) {const raw=`---\nprivacy: ${privacy}\ntopics: [bounded experiment]\nmechanisms: [bounded feedback]\n---\n${body}\n`;const p=`Synthetic/mixed-${i}.md`;files.set(p,prepareSource(p,raw,hash(raw),hash(p).slice(0,24)));}
  const state=await buildIndex([...files.values()],{mode:'local-excerpts',cloudConsent:false,previous:emptyIndex(),signature:generationSignature(defaults),now:'2026-01-01'});
  for(const [p,s] of files)files.set(p,structuredClone(s));
  const owner=Object.values(state.fragments)[0],blocked=new Set<string>();
  expect(Object.values(state.fragments)).toHaveLength(1);expect(owner.evidence).toHaveLength(2);
  const read=vi.fn(async(p:string):Promise<SourceSnapshot|null>=>structuredClone(files.get(p)??null));
  const excluded=vi.fn(async(_p:string[])=>new Set(blocked));
  const commit=vi.fn(async()=>{}),request=vi.fn(async()=>({version:1,...emptyFacets()})),factory=vi.fn(()=>({request}));
  const settings={...defaults,excludes:[] as string[]};
  const c=new ThirdBrainController({list:async()=>[...files.values()],read,excluded,verify:async()=>{}},{load:async()=>state,recover:async()=>{},commit},()=>settings,factory,async()=>{});
  await c.initialize();return{c,state,owner,files,read,excluded,blocked,commit,factory,request,settings};
}
it.each([['normal','normal'],['private','private'],['local','local'],['normal','private'],['normal','local'],['private','local']] as [Privacy,Privacy][])('all-current %s/%s keeps full merged evidence, strict privacy and identical ranking',async(pa,pb)=>{
  const h=await fixture(pa,pb),before=JSON.stringify(h.state);
  const expected=searchFragments(Object.values(h.state.fragments),query,{breadth:'low',limit:30,index:h.state,retainNaturalContinuation:true});
  const hits=await h.c.find(query,'low',restrictive(pa,pb));expect(hits).toEqual(Array.from(expected));expect(hits).toHaveLength(1);expect(hits[0].fragment.privacy).toBe(restrictive(pa,pb));
  for(const e of hits[0].fragment.evidence)await expect(h.c.verifyOpen(e)).resolves.toBeUndefined();
  expect(JSON.stringify(h.state)).toBe(before);expect(h.commit).not.toHaveBeenCalled();expect(h.factory).not.toHaveBeenCalled();expect(h.request).not.toHaveBeenCalled();h.c.dispose();
});
it.each([{channel:'topics',value:'bounded experiment'},{channel:'mechanisms',value:'bounded feedback'},{channel:'kind',value:'excerpt'}] as QuerySelection[])('explicit $channel authenticates mixed complete donor without a model',async selection=>{
  const h=await fixture();const hits=await h.c.find('','medium','private',selection);expect(hits).toHaveLength(1);expect(hits[0].fragment.evidence).toHaveLength(2);for(const e of hits[0].fragment.evidence)await h.c.verifyOpen(e);expect(h.factory).not.toHaveBeenCalled();expect(h.commit).not.toHaveBeenCalled();
});
for(const donor of [0,1])it.each(['hash','id','quote','range','excluded','membership','record-hash','record-status','record-missing','removed','privacy-bytes','own-source','own-fragment'] as const)('mixed old card donor '+donor+' %s fails display and both old opens',async mutation=>{
  const h=await fixture(),hit=(await h.c.find(query,'low','private'))[0];expect(hit).toBeDefined();
  const e=hit.fragment.evidence[donor],s=h.files.get(e.relativePath)!;
  if(mutation==='hash')s.hash=hash('authored changed bytes');else if(mutation==='id')s.id+='changed';else if(mutation==='quote')s.text='Changed source quotation';else if(mutation==='range'){s.text='X'+s.text;}
  else if(mutation==='excluded')h.blocked.add(s.path);else if(mutation==='membership')h.state.sources[s.path].fragmentIds=[];else if(mutation==='record-hash')h.state.sources[s.path].hash=hash('other record');else if(mutation==='record-status')h.state.sources[s.path].status='error';else if(mutation==='record-missing')delete h.state.sources[s.path];else if(mutation==='removed')h.files.delete(s.path);
  else if(mutation==='privacy-bytes'){const raw=`---\nprivacy: ${donor===0?'local':'local'}\n---\n${body}`;h.files.set(s.path,prepareSource(s.path,raw,hash(raw),s.id));}
  else if(mutation==='own-source'){const r=h.state.sources[s.path];delete h.state.sources[s.path];Object.setPrototypeOf(h.state.sources,{[s.path]:r});}
  else {const f=h.state.fragments[h.owner.id];delete h.state.fragments[f.id];Object.setPrototypeOf(h.state.fragments,{[f.id]:f});}
  for(const old of hit.fragment.evidence)await expect(h.c.verifyOpen(old)).rejects.toThrow('changed');expect(await h.c.find(query,'low','private')).toEqual([]);expect(h.commit).not.toHaveBeenCalled();
});
it.each([undefined,null,'unknown','Private','NORMAL',' local ',0,{},'__proto__'] as unknown[])('rejects noncanonical source privacy %s before restrictive fallback',async privacy=>{
  const h=await fixture(),hit=(await h.c.find(query,'low','private'))[0];expect(hit).toBeDefined();(h.files.get(hit.fragment.evidence[1].relativePath)! as unknown as {privacy:unknown}).privacy=privacy;
  expect(await h.c.find(query,'low','private')).toEqual([]);for(const e of hit.fragment.evidence)await expect(h.c.verifyOpen(e)).rejects.toThrow('changed');
});
it.each(['read','exclusion'] as const)('unknown %s preserves exact exception, state and no partial result/commit',async where=>{
  const h=await fixture(),before=JSON.stringify(h.state),fault=Object.assign(Error('Synthetic EIO'),{code:'EIO'});
  if(where==='read')h.read.mockRejectedValueOnce(fault);else h.excluded.mockRejectedValueOnce(fault);
  await expect(h.c.find(query,'low','private')).rejects.toBe(fault);expect(h.c.status().phase).toBe('error');expect(JSON.stringify(h.state)).toBe(before);expect(h.commit).not.toHaveBeenCalled();
});
it.each(['resolve','reject'] as const)('cancellation filters late %s without further reads or updates',async ending=>{
  const h=await fixture();let release!:(s:SourceSnapshot|null)=>void,reject!:(e:Error)=>void,reached!:()=>void;
  const started=new Promise<void>(r=>reached=r);h.read.mockImplementationOnce(()=>{reached();return new Promise((a,b)=>{release=a;reject=b;});});
  const before=JSON.stringify(h.state),pending=h.c.find(query,'low','private');await started;h.c.cancel();await expect(pending).rejects.toMatchObject({name:'AbortError'});const count=h.read.mock.calls.length,status=JSON.stringify(h.c.status());
  if(ending==='resolve')release([...h.files.values()][0]);else reject(Error('Synthetic late failure'));await new Promise(r=>setImmediate(r));expect(h.read.mock.calls).toHaveLength(count);expect(JSON.stringify(h.c.status())).toBe(status);expect(JSON.stringify(h.state)).toBe(before);expect(h.commit).not.toHaveBeenCalled();
});
it.each(['private','local'] as const)('cloud %s query bypasses factory and its vocabulary donors remain unsent',async privacy=>{
  const h=await fixture(privacy,'normal');h.settings.mode='cloud-model';h.settings.cloudConsent=true;
  expect(await h.c.find(query,'low',privacy)).toHaveLength(1);expect(h.factory).not.toHaveBeenCalled();
  await h.c.find(query,'low','normal');expect(h.factory).toHaveBeenCalledOnce();expect(h.request).not.toHaveBeenCalled();expect(h.commit).not.toHaveBeenCalled();
});
it('empty evidence and aggregate downgrade never authenticate a current mixed endpoint',async()=>{
  const h=await fixture(),hit=(await h.c.find(query,'low','private'))[0];expect(hit).toBeDefined();h.owner.privacy='normal';expect(await h.c.find(query,'low','private')).toEqual([]);for(const e of hit.fragment.evidence)await expect(h.c.verifyOpen(e)).rejects.toThrow('changed');h.owner.privacy='private';h.owner.evidence=[];expect(await h.c.find(query,'low','private')).toEqual([]);
});
