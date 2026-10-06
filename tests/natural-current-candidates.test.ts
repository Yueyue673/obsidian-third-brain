// SPDX-License-Identifier: MIT
// Authored synthetic sources / ModelPort only; no model, HTTP or real vault.
import { expect, it, vi } from 'vitest';
import { ThirdBrainController } from '../src/controller';
import { analyzeSource, prepareSource, searchFragments } from '../src/core/index';
import * as network from '../src/core/connections';
import { emptyFacets, emptyIndex, type Breadth, type Fragment, type SourceSnapshot } from '../src/core/types';
import { defaults } from '../src/settings';
import { hash } from '../src/sources';

const query = 'bounded signal';
async function fixture(prefix = 32, local = false) {
  const state = emptyIndex(), files = new Map<string, SourceSnapshot>(), blocked = new Set<string>();
  const add = (id: string, summary: string) => {
    const raw = `Authored independent quotation ${id}: bounded signal is a retrieval marker, not a semantic claim.`;
    const s = prepareSource(`Synthetic/natural-${id}.md`, raw, hash(raw), id);
    const f: Fragment = { id, title:'Independent marker', summary, kind:'observation', privacy:'normal', mode:'ai', updatedAt:'2026-01-01', facets:{ ...emptyFacets(), concepts:[query], mechanisms:[query] }, conditions:[], caveats:[], evidence:[{ sourceId:s.id, relativePath:s.path, sourceHash:s.hash, quote:s.text, start:0, end:s.text.length }] };
    files.set(s.path,structuredClone(s)); state.fragments[id]=f; state.sources[s.path]={ hash:s.hash, status:'indexed', fragmentIds:[id] }; return f;
  };
  for (let n=0;n<prefix;n++) {
    const f=add(`a${String(n).padStart(4,'0')}`,query);
    if (local) { const s=files.get(f.evidence[0].relativePath)!; const a=await analyzeSource(s,{ mode:'local-excerpts', cloudConsent:false, now:'2026-01-01' }); delete state.fragments[f.id]; for (const next of a.fragments) state.fragments[next.id]=next; state.sources[s.path].fragmentIds=a.fragments.map(f=>f.id); }
  }
  const owner=add('z-owner','bounded signal with independent distant context and several unrelated catalog details');
  const read=vi.fn(async(p:string)=>structuredClone(files.get(p)??null)), commit=vi.fn(async()=>{});
  const factory=vi.fn(()=>({ request:vi.fn(async()=>({ version:1,...emptyFacets(),concepts:[query],mechanisms:[query] })) }));
  const c=new ThirdBrainController({ list:async()=>{throw Error('No refresh');}, read, verify:async()=>{}, excluded:async()=>new Set(blocked) },{ load:async()=>state,recover:async()=>{},commit },()=>({ ...defaults,excludes:[],mode:'local-excerpts' }),factory,async()=>{});
  await c.initialize(); return { c,state,files,blocked,owner,read,commit,factory,stale:Object.values(state.fragments).filter(f=>f.id!==owner.id) };
}
const main = (r: Awaited<ReturnType<ThirdBrainController['find']>>) => r.filter(r=>!r.group);
function appendLater(h: Awaited<ReturnType<typeof fixture>>) {
  const id='zz-later',raw='A later independently authored exact donor quotation.',s=prepareSource('Synthetic/natural-later.md',raw,hash(raw),id);
  const f:Fragment={...structuredClone(h.owner),id,summary:h.owner.summary+' additional unique mineral catalog details zeolite mica garnet quartz',evidence:[{sourceId:s.id,relativePath:s.path,sourceHash:s.hash,quote:raw,start:0,end:raw.length}]};
  h.state.fragments[id]=f;h.state.sources[s.path]={hash:s.hash,status:'indexed',fragmentIds:[id]};h.files.set(s.path,structuredClone(s));return s.path;
}

it.each(['removed','excluded','hash','id','privacy','quote','membership','record-hash','record-status','record-missing'] as const)('natural admission continues past32 %s without re-scoring or weakening proof',async mutation=>{
  const h=await fixture();
  for (const f of h.stale) { const e=f.evidence[0],s=h.files.get(e.relativePath)!;
    if(mutation==='removed')h.files.delete(s.path); else if(mutation==='excluded')h.blocked.add(s.path); else if(mutation==='hash')s.hash=hash('Authored revision'); else if(mutation==='id')s.id+='-changed'; else if(mutation==='privacy')s.privacy='private'; else if(mutation==='quote')s.text='A changed quotation.'; else if(mutation==='membership')h.state.sources[s.path].fragmentIds=[]; else if(mutation==='record-hash')h.state.sources[s.path].hash=hash('Different record'); else if(mutation==='record-status')h.state.sources[s.path].status='error'; else delete h.state.sources[s.path]; }
  const before=JSON.stringify(h.state),hits=await h.c.find(query,'medium','normal');
  expect(main(hits).map(r=>r.fragment.id)).toEqual([h.owner.id]); expect(h.factory).not.toHaveBeenCalled(); expect(h.commit).not.toHaveBeenCalled(); expect(JSON.stringify(h.state)).toBe(before); await h.c.verifyOpen(hits[0].fragment.evidence[0]); h.c.dispose();
});
it('genuine local-excerpt analysis and natural query require zero ModelPort requests',async()=>{
  const h=await fixture(32,true); for(const f of h.stale)h.files.delete(f.evidence[0].relativePath);
  const hits=await h.c.find(query,'medium'); expect(hits.some(r=>r.fragment.id===h.owner.id)).toBe(true); expect(h.factory).not.toHaveBeenCalled();
});
it('recovers a directly current rank206 without a200 cap',async()=>{
  const h=await fixture(205); for(const f of h.stale)h.blocked.add(f.evidence[0].relativePath);
  const ranked=searchFragments(Object.values(h.state.fragments),query,{ breadth:'medium',limit:200 }); expect(ranked).toHaveLength(200); expect(ranked.some(r=>r.fragment.id===h.owner.id)).toBe(false);
  expect(main(await h.c.find(query,'medium')).map(r=>r.fragment.id)).toEqual([h.owner.id]);
});
it.each(['low','medium','high'] as Breadth[])('preserves default core head, all-current projections and no-signal abstention: %s',async breadth=>{
  const h=await fixture(),fs=Object.values(h.state.fragments),options={ breadth,limit:30,index:h.state,retainIndirectCandidates:breadth==='high' };
  const ordinary=searchFragments(fs,query,options),requested=searchFragments(fs,query,{ ...options,retainNaturalContinuation:true } as typeof options);
  expect(ordinary).toHaveLength(30); expect(ordinary).not.toHaveProperty('rankedContinuation'); expect(Array.from(requested)).toEqual(Array.from(ordinary)); expect(requested.rankedContinuation).toHaveLength(3); expect(requested.indirectCandidates).toEqual(ordinary.indirectCandidates);
  expect(main(await h.c.find(query,breadth))).toEqual(ordinary.slice(0,7)); expect(await h.c.find('',breadth)).toEqual([]); expect(await h.c.find('zeppelin navigation',breadth)).toEqual([]);
});
it('keeps the existing facet guard and kind branch independent of natural opt-in',async()=>{
  const h=await fixture(),fs=Object.values(h.state.fragments),base={breadth:'medium' as const,limit:30,facets:{concepts:[query]}};
  const oldNaturalFlag=searchFragments(fs,query,{...base,retainRankedContinuation:true}); expect(oldNaturalFlag).not.toHaveProperty('rankedContinuation');
  const typed=searchFragments(fs,'',{...base,retainRankedContinuation:true}); expect(typed.rankedContinuation).toHaveLength(3);
  const naturalOnEmpty=searchFragments(fs,'',{...base,retainNaturalContinuation:true} as typeof base); expect(naturalOnEmpty).not.toHaveProperty('rankedContinuation');
  const kinds=await h.c.find('','high','normal',{channel:'kind',value:'observation'}); expect(kinds).toHaveLength(7); expect(kinds.every(r=>r.reasons.length===1&&r.reasons[0].kind==='kind')).toBe(true);
  expect(await h.c.find('','medium','normal',{channel:'concepts',value:query})).toEqual(typed.slice(0,7)); expect(h.factory).not.toHaveBeenCalled();
});
it('uses one network construction for a natural high continuation',async()=>{
  const h=await fixture(); for(const f of h.stale)h.blocked.add(f.evidence[0].relativePath); const spy=vi.spyOn(network,'buildFragmentNetwork');
  try { expect(main(await h.c.find(query,'high')).map(r=>r.fragment.id)).toEqual([h.owner.id]); expect(spy).toHaveBeenCalledTimes(1); } finally {spy.mockRestore();}
});
it.each(['read','exclusion'] as const)('tail unknown %s preserves the original exception and makes no partial commit',async where=>{
  const h=await fixture(),fault=Object.assign(new Error('Synthetic EIO'),{code:'EIO'}); for(const f of h.stale)h.files.delete(f.evidence[0].relativePath);
  const later=appendLater(h);
  if(where==='read')h.read.mockImplementation(async p=>{if(p===later)throw fault; return structuredClone(h.files.get(p)??null);});
  else (h.c as unknown as {sources:{excluded:(p:string[])=>Promise<Set<string>>}}).sources.excluded=async p=>{if(p.includes(later))throw fault;return new Set();};
  const before=JSON.stringify(h.state); await expect(h.c.find(query,'medium')).rejects.toBe(fault); expect(h.c.status().phase).toBe('error'); expect(JSON.stringify(h.state)).toBe(before); expect(h.commit).not.toHaveBeenCalled();
});
it.each(['resolve','reject'] as const)('tail cancellation rejects before late %s and starts no subsequent candidate read',async ending=>{
  const h=await fixture(); for(const f of h.stale)h.files.delete(f.evidence[0].relativePath);
  const later=appendLater(h);
  let reached!:()=>void,resolve!:(s:SourceSnapshot|null)=>void,reject!:(e:Error)=>void; const started=new Promise<void>(r=>{reached=r;});
  h.read.mockImplementation(async p=>{if(p===h.owner.evidence[0].relativePath){reached(); return new Promise((a,b)=>{resolve=a;reject=b;});}return null;});
  const pending=h.c.find(query,'medium'); await started; h.c.cancel(); await expect(pending).rejects.toMatchObject({name:'AbortError'}); const n=h.read.mock.calls.length;
  if(ending==='resolve')resolve(h.files.get(h.owner.evidence[0].relativePath)!);else reject(Error('Synthetic late rejection')); await new Promise(r=>setImmediate(r)); expect(h.read.mock.calls).toHaveLength(n); expect(h.read.mock.calls.some(([p])=>p===later)).toBe(false); expect(h.c.status().phase).toBe('cancelled'); expect(h.commit).not.toHaveBeenCalled();
});
it.each(['hash','excluded','membership','privacy','id','record-status'] as const)('binds every displayed natural quotation to a complete current endpoint: %s',async change=>{
  const h=await fixture(0),hit=(await h.c.find(query,'medium'))[0],e=hit.fragment.evidence[0],s=h.files.get(e.relativePath)!; await expect(h.c.verifyOpen(e)).resolves.toBeUndefined();
  if(change==='hash')s.hash=hash('Later revision');else if(change==='excluded')h.blocked.add(s.path);else if(change==='membership')h.state.sources[s.path].fragmentIds=[];else if(change==='privacy')s.privacy='private';else if(change==='id')s.id+='-changed';else h.state.sources[s.path].status='error';
  await expect(h.c.verifyOpen(e)).rejects.toThrow('changed');
});
it.each(['deleted','membership','excluded'] as const)('merged natural card rejects opening its still-current donor if another donor is %s',async change=>{
  const h=await fixture(0),raw='A second independently authored donor quotation.',s=prepareSource('Synthetic/natural-second.md',raw,hash(raw),'second'); h.files.set(s.path,s);
  h.owner.evidence.push({sourceId:s.id,relativePath:s.path,sourceHash:s.hash,quote:raw,start:0,end:raw.length});h.state.sources[s.path]={hash:s.hash,status:'indexed',fragmentIds:[h.owner.id]};
  const hit=(await h.c.find(query,'medium'))[0];for(const e of hit.fragment.evidence)await h.c.verifyOpen(e);
  if(change==='deleted')h.files.delete(s.path);else if(change==='membership')h.state.sources[s.path].fragmentIds=[];else h.blocked.add(s.path);
  for(const e of hit.fragment.evidence)await expect(h.c.verifyOpen(e)).rejects.toThrow('changed'); expect(await h.c.find(query,'medium')).toEqual([]);
});
