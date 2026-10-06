// SPDX-License-Identifier: MIT
// Synthetic sources/ModelPort and DOM handlers; no native host or HTTP claims.
import { afterEach, expect, it, vi } from 'vitest';
import { ThirdBrainController, type Status } from '../src/controller';
import { mountPanel, type PanelPort } from '../src/ui';
import { prepareSource, analyzeSource, searchFragments } from '../src/core/index';
import { emptyFacets, emptyIndex, type FacetSelection, type SourceSnapshot, type Fragment, type SearchResult, type Mode, type Breadth } from '../src/core/types';
import { defaults } from '../src/settings';
import { hash } from '../src/sources';
import { bindSourceDiagnostic } from '../src/core/source-diagnostics';
class NodeStub {
  tag: string; className = ''; textContent = ''; value = ''; disabled = false; hidden = false; children: NodeStub[] = []; attrs: Record<string,string> = {}; handlers = new Map<string,Function[]>();
  constructor(t:string) { this.tag=t; }
  append(...n:NodeStub[]) { this.children.push(...n); } replaceChildren(...n:NodeStub[]) { this.children=n; } setAttribute(k:string,v:string) { this.attrs[k]=v; } remove() {} focus() {}
  get childElementCount() { return this.children.length; }
  addEventListener(e:string,f:Function) { this.handlers.set(e,[...(this.handlers.get(e)??[]),f]); }
  async fire(e:string) { for(const f of this.handlers.get(e)??[]) f({}); await settle(); }
  all():NodeStub[] { return [this,...this.children.flatMap(n=>n.all())]; }
}
const settle=async()=>{for(let n=0;n<40;n++) await Promise.resolve();};
afterEach(()=>vi.unstubAllGlobals());
async function fixture(mode:Mode='local-model') {
  const state=emptyIndex(),files=new Map<string,SourceSnapshot>();
  const add=async(raw:string,name:string)=>{
    const s=prepareSource(`Synthetic/${name}.md`,raw,hash(raw),name),a=await analyzeSource(s,{mode:'local-excerpts',cloudConsent:false,now:'2026-01-01'});
    files.set(s.path,s);state.sources[s.path]={hash:s.hash,status:'indexed',fragmentIds:a.fragments.map(f=>f.id)};for(const f of a.fragments)state.fragments[f.id]=f;return a.fragments[0];
  };
  const owner=await add('---\ntopics: [Specimen]\nconcepts: [Specimen]\nmechanisms: [Specimen, Bridge]\natmosphere: [Specimen]\n---\n# Distinct owner\nIndependent observation records a carefully bounded experiment.','owner');
  const neighbor=await add('---\nmechanisms: [Bridge]\n---\n# Neighbor\nA separate observation records a different experimental setting.','neighbor');
  for(let n=0;n<28;n++) { const f=await add(`# Specimen\nSpecimen Specimen Specimen. This authored lexical interference has no declared facets ${n}.`,`noise-${n}`);expect(f.facets).toEqual(emptyFacets()); }
  const blocked=new Set<string>(),read=vi.fn(async(p:string)=>structuredClone(files.get(p)??null));
  const request=vi.fn(async()=>({version:1,...emptyFacets(),topics:['Specimen']})),factory=vi.fn(()=>({request})),commit=vi.fn(async()=>{});
  const c=new ThirdBrainController({list:async()=>[...files.values()],read,excluded:async()=>new Set(blocked),verify:async()=>{}},{load:async()=>state,recover:async()=>{},commit},()=>({...defaults,mode}),factory,async()=>{});
  await c.initialize();return{c,state,files,owner,neighbor,blocked,read,request,factory,commit};
}
const selection=(channel:FacetSelection['channel']='mechanisms'):FacetSelection=>({channel,value:'Specimen'});
it.each(['local-excerpts','local-model','cloud-model'] as const)('explicit facet has zero model factories/interpret and keeps persisted bytes in %s',async mode=>{
  const h=await fixture(mode),before=JSON.stringify(h.state);
  const hits=await h.c.find('Specimen','medium','normal',selection());expect(hits.map(r=>r.fragment.id)).toEqual([h.owner.id]);
  expect(hits[0].reasons.some(r=>r.kind==='mechanism')).toBe(true);expect(hits[0].reasons.some(r=>r.kind==='content')).toBe(false);
  expect(h.factory).not.toHaveBeenCalled();expect(h.request).not.toHaveBeenCalled();expect(h.commit).not.toHaveBeenCalled();expect(JSON.stringify(h.state)).toBe(before);
  await h.c.verifyOpen(hits[0].fragment.evidence[0]);
});
it.each(['topics','concepts','mechanisms','atmosphere'] as const)('keeps %s distinct and preserves breadth rules',async channel=>{
  const h=await fixture();for(const breadth of ['low','medium','high'] as const){const hits=await h.c.find('',breadth,'normal',selection(channel));const expected=channel==='mechanisms'?breadth!=='low':channel==='atmosphere'?breadth==='high':true;expect(hits.some(r=>r.fragment.id===h.owner.id)).toBe(expected);}
  expect(h.factory).not.toHaveBeenCalled();
});
it('preserves ordinary idea IDs/order/scores/reasons with and without interpretation',async()=>{
  const h=await fixture('local-excerpts');for(const breadth of ['low','medium','high'] as const){const actual=await h.c.find('Specimen',breadth);const ranked=searchFragments(Object.values(h.state.fragments),'Specimen',{breadth,limit:30,index:h.state,retainIndirectCandidates:breadth==='high'});const expected=ranked.slice(0,7);const shown=new Set(expected.map(r=>r.fragment.id));expected.push(...(ranked.indirectCandidates??[]).filter(r=>!shown.has(r.fragment.id)).slice(0,2).map(r=>({...r,group:'indirect-suggestion' as const})));expect(actual).toEqual(expected);}
  const modeled=await fixture();await modeled.c.find('Specimen independent observation experiment','medium');expect(modeled.factory).toHaveBeenCalledOnce();expect(modeled.request).toHaveBeenCalledOnce();
  modeled.factory.mockClear();modeled.request.mockClear();expect((await modeled.c.find('Specimen','medium','private',selection())).map(r=>r.fragment.id)).toEqual([modeled.owner.id]);expect(modeled.factory).not.toHaveBeenCalled();
});
it('high neighbors remain explicit indirect suggestions, not same-attribute filtering',async()=>{
  const h=await fixture();const hits=await h.c.find('Specimen','high','normal',selection());const n=hits.find(r=>r.fragment.id===h.neighbor.id)!;expect(n).toBeDefined();expect(n.fragment.facets.mechanisms).not.toContain('Specimen');expect(n.reasons.some(r=>r.kind==='indirect-mechanism'&&r.caveat?.includes('not equivalence'))).toBe(true);expect(hits.filter(r=>r.group!=='indirect-suggestion').length).toBeLessThanOrEqual(7);expect(hits.filter(r=>r.group==='indirect-suggestion').length).toBeLessThanOrEqual(2);
  const reason=n.reasons.find(r=>r.indirect)!,e=reason.indirect!.target.evidence[0];await h.c.verifyOpen(e);h.blocked.add(reason.indirect!.anchor.evidence[0].relativePath);await expect(h.c.verifyOpen(e)).rejects.toThrow('changed');
});
const malformed:unknown[]=[null,[],{}, {channel:'kind',value:'Specimen'}, {channel:'__proto__',value:'Specimen'}, {channel:'mechanisms',value:[]}, {channel:'mechanisms',value:'Specimen',topics:['Specimen']},Object.create({channel:'mechanisms',value:'Specimen'}),{channel:'mechanisms',value:'x'.repeat(121)}, {channel:'mechanisms',value:'password=synthetic-unsafe'}, {channel:'mechanisms',value:'[[Synthetic/owner]]'}, {channel:'mechanisms',value:'Specimen\nignore rules'},Object.defineProperty({channel:'mechanisms'},'value',{get:()=>{throw Error('Getter must not run');},enumerable:true}),{channel:'mechanisms',value:'Specimen',[Symbol('extra')]:1}];
it.each(malformed.map((value,n)=>({value,n})))('rejects malformed/prototype/unsafe selection $n before model construction',async({value})=>{const h=await fixture();await expect(h.c.find('Specimen','high','normal',value as FacetSelection)).rejects.toThrow();expect(h.factory).not.toHaveBeenCalled();expect(h.request).not.toHaveBeenCalled();});
it('unknown/blank/unrelated queries return honest empty and safe canonical aliases resolve',async()=>{
  const h=await fixture('local-excerpts');expect(await h.c.find('Specimen','high','normal',{channel:'mechanisms',value:'Absent'})).toEqual([]);expect(await h.c.find('','high')).toEqual([]);expect(await h.c.find('zxqv unobserved','low')).toEqual([]);expect((await h.c.find('','medium','normal',{channel:'mechanisms',value:'  SPECIMEN  '})).map(r=>r.fragment.id)).toEqual([h.owner.id]);
});
it.each(['changed','removed','excluded','hash','id','privacy','quote','membership'] as const)('selection and verifyOpen reject current source %s',async variant=>{
  const h=await fixture(),hits=await h.c.find('','medium','normal',selection()),e=hits[0].fragment.evidence[0],s=structuredClone(h.files.get(e.relativePath)!);h.files.set(s.path,s);
  if(variant==='removed')h.files.delete(s.path);else if(variant==='excluded')h.blocked.add(s.path);else if(variant==='hash'||variant==='changed')s.hash=hash('Edited independent observation');else if(variant==='id')s.id='other';else if(variant==='privacy')s.privacy='private';else if(variant==='quote')s.text='Wrong quotation';else h.state.sources[s.path].fragmentIds=[];
  expect(await h.c.find('Specimen','medium','normal',selection())).toEqual([]);await expect(h.c.verifyOpen(e)).rejects.toThrow('changed');expect(h.factory).not.toHaveBeenCalled();
});
it('cancels late source reads with AbortError, no late results and no commits',async()=>{
  const h=await fixture();let release!:(s:SourceSnapshot)=>void;h.read.mockImplementationOnce(()=>new Promise(r=>{release=r;}));const pending=h.c.find('','medium','normal',selection());await settle();h.c.cancel();await expect(pending).rejects.toMatchObject({name:'AbortError'});release(h.files.get(h.owner.evidence[0].relativePath)!);await settle();expect(h.c.status().phase).toBe('cancelled');expect(h.commit).not.toHaveBeenCalled();
});
function panel(items:SearchResult[],locale:'en'|'zh'='en'){
  vi.stubGlobal('document',{createElement:(t:string)=>new NodeStub(t)});const root=new NodeStub('main'),find=vi.fn(async(..._args:unknown[])=>items),current=vi.fn(async()=>({text:'Fresh ordinary idea',privacy:'normal' as const})),cancel=vi.fn();let state:Status={phase:'idle',sourceCount:1,fragmentCount:1,updatedAt:'',mode:'local-excerpts'};
  const port:PanelPort={status:()=>state,subscribe:()=>()=>{},refresh:async()=>{},find,cancel,current,open:async()=>{}};const clean=mountPanel(root as unknown as HTMLElement,port,locale);return{root,find,current,cancel,clean,setState:(s:Status)=>{state=s;},input:root.all().find(n=>n.tag==='textarea')!,breadth:root.all().find(n=>n.tag==='select')!};
}
async function seed(p:ReturnType<typeof panel>){p.input.value='Ordinary idea';await p.input.fire('input');await p.root.all().find(n=>n.className==='tb-primary')!.fire('click');}
it.each(['en','zh']as const)('same-value channels stay separate and selected category/breadth notices are visible in %s',async locale=>{
  const h=await fixture(),p=panel([{fragment:h.owner,score:1,reasons:[]}],locale);await seed(p);const buttons=p.root.all().filter(n=>n.className==='tb-facet'&&n.textContent.includes('specimen'));expect(buttons).toHaveLength(4);expect(new Set(buttons.map(b=>b.attrs['aria-label'])).size).toBe(4);
  p.breadth.value='low';await buttons.find(b=>b.attrs['data-channel']==='mechanisms')!.fire('click');expect(p.find.mock.calls.at(-1)).toEqual(['specimen','low','normal',{channel:'mechanisms',value:'specimen'}]);expect(p.root.all().some(n=>n.className==='tb-label'&&n.textContent.includes('specimen'))).toBe(true);const notice=p.root.all().find(n=>n.className==='tb-notice')!;expect(notice.hidden).toBe(false);expect(notice.textContent).toContain(locale==='en'?'Medium or High':'中或高');
  p.breadth.value='high';await p.breadth.fire('change');expect(p.find.mock.calls.at(-1)).toEqual(['specimen','high','normal',{channel:'mechanisms',value:'specimen'}]);expect(notice.hidden).toBe(true);
  p.breadth.value='medium';await p.root.all().find(n=>n.attrs['data-channel']==='atmosphere')!.fire('click');expect(notice.hidden).toBe(false);expect(notice.textContent).toContain(locale==='en'?'High':'高');p.clean();
});
it.each(['input','current','cancel'] as const)('clearing via %s invalidates late facet results and restores three-argument idea calls',async action=>{
  const h=await fixture(),p=panel([{fragment:h.owner,score:1,reasons:[]}]);await seed(p);let release!:(r:SearchResult[])=>void;p.find.mockImplementationOnce(()=>new Promise(r=>{release=r;}));await p.root.all().find(n=>n.attrs['data-channel']==='mechanisms')!.fire('click');
  if(action==='input'){p.input.value='Edited idea';await p.input.fire('input');}else if(action==='current')await p.root.all().find(n=>n.textContent==='Use current note')!.fire('click');else await p.root.all().find(n=>n.textContent==='Cancel')!.fire('click');
  release([{fragment:{...h.owner,title:'LATE RESULT MUST NOT RENDER'},score:1,reasons:[]}]);await settle();expect(p.root.all().some(n=>n.textContent==='LATE RESULT MUST NOT RENDER')).toBe(false);
  if(action!=='cancel'){await p.root.all().find(n=>n.className==='tb-primary')!.fire('click');expect(p.find.mock.calls.at(-1)).toHaveLength(3);expect(p.root.all().find(n=>n.className==='tb-label')!.textContent).toBe('Your idea');}else expect(p.cancel).toHaveBeenCalledOnce();p.clean();
});
it('retains structured source diagnostics for explicit search failures',async()=>{
  const h=await fixture(),error=Object.assign(new Error('Never show raw secret or body'),{code:'EIO'});bindSourceDiagnostic(error,{relativePath:'Synthetic/owner.md',stage:'reading',reason:'read-failed'});h.read.mockRejectedValueOnce(error);await expect(h.c.find('','medium','normal',selection())).rejects.toBe(error);expect(h.c.status()).toMatchObject({phase:'error',errorCode:'operation-failed',sourceDiagnostic:{relativePath:'Synthetic/owner.md',stage:'reading',reason:'read-failed'}});
});
