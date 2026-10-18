// SPDX-License-Identifier: MIT
// Authored synthetic material; structural/provenance acceptance, not AI semantics or native clicks.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { analyzeSource, buildIndex, prepareSource, searchFragments } from '../src/core/index';
import { hasReadableQuote, LOCAL_EXCERPT_CONTEXT_LIMIT } from '../src/core/sources';
import { fragmentId } from '../src/core/fragments';
import type { Evidence, Fragment, IndexState, ModelRequest } from '../src/core/types';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-sibling-legacy.json','utf8'));
const raw: string = legacy.raw;
const options = { mode:'local-excerpts' as const,cloudConsent:false,now:'2026-01-01T00:00:00.000Z' };
const snap = (text: string,name='synthetic.md') => prepareSource(name,text,hash(text),hash(name).slice(0,24));
const canvas = (text: string) => JSON.stringify({nodes:[{type:'text',text:'---\nprivacy: private\n---\n'+text},{type:'text',text:'Independent silver node record.'}],edges:[]});
const context = (f: Fragment): unknown => (f as Fragment & {localContext?:unknown}).localContext;
const specimens = [
  ['backward',raw,'Drain the violet chamber.','Seal the cobalt inlet.'],
  ['Chinese',raw.replace('Seal the cobalt inlet.','将青铜阈值设为四格。').replace('Drain the violet chamber.','达到上述阈值才排空紫色腔室。'),'达到上述阈值才排空紫色腔室。','将青铜阈值设为四格。'],
  ['forward',raw.replace('Seal the cobalt inlet.','Apply the mixture described below.').replace('Drain the violet chamber.','The mixture contains two inert pigments.'),'Apply the mixture described below.','The mixture contains two inert pigments.'],
  ['implicit',raw.replace('Seal the cobalt inlet.','The cobalt mix contains two inert pigments.').replace('Drain the violet chamber.','Pour the cobalt mix into the violet chamber.'),'Pour the cobalt mix into the violet chamber.','The cobalt mix contains two inert pigments.'],
  ['independent',raw.replace('Seal the cobalt inlet.','Remember the amber archive point.').replace('Drain the violet chamber.','File the jade ledger.'),'File the jade ledger.','Remember the amber archive point.'],
  ['long-tail',raw.replace('keep the dummy gate closed.','keep the dummy gate closed. '+'Synthetic context. '.repeat(90)).replace('Drain the violet chamber.','File the jade ledger.'),'File the jade ledger.','Seal the cobalt inlet.'],
] as const;

it.each(specimens)('%s retains a focused primary plus same-list context, without promoting it into lexical relevance',async (_name,text,primary,sibling)=>{
  for (const format of ['md','canvas','quoted-md','quoted-canvas']) {
    const body = format.startsWith('quoted') ? text.split('\n').map(line=>'> '+line).join('\n') : text;
    const s = snap(format.endsWith('canvas') ? canvas(body) : body,format.endsWith('canvas') ? 'synthetic.canvas':'synthetic.md');
    const all=(await analyzeSource(s,options)).fragments;
    const focus=all.find(f=>f.summary.includes(primary))!;
    expect(focus).toBeDefined(); expect(focus.summary).not.toContain(sibling);
    expect(context(focus)).toEqual(expect.stringContaining(sibling));
    expect(context(focus)).not.toEqual(expect.stringContaining('Independent white'));
    expect(context(focus)).not.toEqual(expect.stringContaining('silver node'));
    expect(focus.conditions).toEqual([]); expect(focus.facets).toEqual({topics:[],concepts:[],mechanisms:[],atmosphere:[]});
    expect(all.some(f=>f.summary.includes(sibling) && !f.summary.includes(primary))).toBe(true);
    const without=all.map(f=>{const copy={...f} as Fragment & {localContext?:unknown};delete copy.localContext;return copy;});
    const projection=(items:ReturnType<typeof searchFragments>)=>Array.from(items,r=>({id:r.fragment.id,score:r.score,reasons:r.reasons,group:r.group}));
    expect(projection(searchFragments(all,primary,{breadth:'medium'}))).toEqual(projection(searchFragments(without,primary,{breadth:'medium'})));
    for(const f of all) for(const e of f.evidence) { expect(e.sourceHash).toBe(s.hash); if(e.start>=0) expect(s.text.slice(e.start,e.end)).toBe(e.quote); else expect(hasReadableQuote(s,e.quote)).toBe(true); }
    expect(focus.evidence.some(e=>e.quote.includes(sibling))).toBe(true);
  }
});

it('uses sibling context in identity; complete contexts merge while opposite definitions do not',async()=>{
  for(const format of ['md','canvas']) {
    const input=(text:string)=>format==='md'?text:canvas(text);
    const inputs=[snap(input(raw),'a.'+format),snap(input(raw),'b.'+format),snap(input(raw.replace('Seal the cobalt inlet.','Open the cobalt inlet.')),'c.'+format)];
    const index=await buildIndex(inputs,{...options,previous:null,signature:generationSignature(defaults)});
    const targets=Object.values(index.fragments).filter(f=>f.summary.includes('Drain the violet chamber.'));
    expect(targets).toHaveLength(2);
    const sealed=targets.find(f=>String(context(f)).includes('Seal the cobalt'))!;
    expect(new Set(sealed.evidence.map(e=>e.relativePath)).size).toBe(2);
    expect(targets.find(f=>String(context(f)).includes('Open the cobalt'))!.id).not.toBe(sealed.id);
    expect(targets.every(f=>f.summary.length+1+String(context(f)).length<=LOCAL_EXCERPT_CONTEXT_LIMIT)).toBe(true);
  }
});

it('keeps old exact no-field records and AI policies, but rejects model-supplied localContext',async()=>{
  expect(generationSignature({...defaults,outputFolder:'Derived'})).not.toBe(legacy.signatures['local-excerpts']);
  const unchanged=await buildIndex([], {...options,previous:legacy.oldIndex,signature:generationSignature(defaults)}); expect(Object.keys(unchanged.fragments)).toHaveLength(0);
  for(const mode of ['local-model','cloud-model'] as const) {
    expect(generationSignature({...defaults,mode,outputFolder:'Derived'})).toBe(legacy.signatures[mode]);
    const requests:ModelRequest[]=[];
    await analyzeSource(snap(raw,'source.md'),{mode,cloudConsent:true,model:{request:async r=>{requests.push(r);return {version:1,decision:'insufficient-context',fragments:[]};}}});
    expect(requests).toEqual(legacy.requests[mode]);
    const item={title:'Synthetic',summary:'An authored synthetic statement.',kind:'idea',topics:[],concepts:[],mechanisms:[],atmosphere:[],quotes:['An authored synthetic statement.'],conditions:[],caveats:[]};
    const run=(extra:object)=>analyzeSource(snap('An authored synthetic statement.'),{mode,cloudConsent:true,model:{request:async()=>({version:1,decision:'extract',fragments:[{...item,...extra}]})}});
    expect((await run({})).fragments).toHaveLength(1);
    await expect(run({localContext:'Untrusted context'})).rejects.toThrow('schema fields');
  }
});

class Node {
  className='';textContent='';value='';hidden=false;disabled=false;children:Node[]=[];handlers=new Map<string,(()=>void)[]>();
  constructor(readonly tag:string){} append(...nodes:Node[]){this.children.push(...nodes);} replaceChildren(...nodes:Node[]){this.children=nodes;} setAttribute(){} remove(){} focus(){} get childElementCount(){return this.children.length;}
  addEventListener(key:string,fn:()=>void){this.handlers.set(key,[...this.handlers.get(key)??[],fn]);} fire(key:string){for(const fn of this.handlers.get(key)??[]) fn();} all():Node[]{return [this,...this.children.flatMap(n=>n.all())];} text():string{return [this.textContent,...this.children.map(n=>n.text())].join('\n');}
  visible():string{return this.hidden?'':[this.textContent,...(this.tag==='details'?this.children.filter(n=>n.tag==='summary'):this.children).map(n=>n.visible())].join('\n');}
}
async function fixture(format:string) {
  const scope=path.resolve('.local/local-sibling');await fs.mkdir(scope,{recursive:true});const root=await fs.mkdtemp(path.join(scope,'vault-'));
  const raws:Record<string,string>=Object.fromEntries(Object.entries(legacy.raws as Record<string,string>).map(([name,text])=>[name.replace(/md$/u,format),format==='md'?text:canvas(text)]));
  const mtimes=new Map<string,string>();
  for(const [name,text] of Object.entries(raws)){await fs.writeFile(path.join(root,name),text);mtimes.set(name,(await fs.stat(path.join(root,name),{bigint:true})).mtimeNs.toString());}
  await fs.mkdir(path.join(root,'Derived'));await fs.writeFile(path.join(root,'Derived/manual.txt'),'Synthetic human-owned material.');
  const settings={...defaults,outputFolder:'Derived',excludes:[] as string[]},store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths());
  const request=vi.fn(async()=>{throw Error('Forbidden model request');});
  const c=new ThirdBrainController(sources,store,()=>settings,()=>({request}),async()=>{});
  const originals=async()=>{for(const [name,text] of Object.entries(raws)){expect(await fs.readFile(path.join(root,name),'utf8')).toBe(text);expect((await fs.stat(path.join(root,name),{bigint:true})).mtimeNs.toString()).toBe(mtimes.get(name));}expect(await fs.readFile(path.join(root,'Derived/manual.txt'),'utf8')).toBe('Synthetic human-owned material.');expect(request).not.toHaveBeenCalled();};
  return {root,raws,settings,store,sources,c,originals,request};
}

it.each(['md','canvas'])('actual %s upgrade retains legacy bytes in history, visible context and a byte-identical second refresh',async format=>{
  const f=await fixture(format);
  try {
    const history:Buffer[]=[];
    if(format==='md') {
      const inputs=await f.sources.list();await f.store.commit(structuredClone(legacy.oldIndex),()=>f.sources.verify(inputs));
      const marker=JSON.parse(await fs.readFile(path.join(f.root,'Derived/.third-brain/marker.json'),'utf8'));
      for(const id of Object.keys(legacy.oldIndex.fragments)) {
        const bytes=await fs.readFile(path.join(f.root,await f.store.fragmentPath(id)));
        expect(bytes.toString('utf8').replaceAll(marker.storeId,'SYNTHETIC_STORE_ID')).toBe(legacy.rendered[id]);history.push(bytes);
      }
    }
    await f.c.initialize();await f.c.refresh();const index=(await f.store.load())!;
    const targets=Object.values(index.fragments).filter(p=>p.summary.includes('Drain the violet chamber.'));expect(targets).toHaveLength(2);
    for(const p of targets){expect(context(p)).toEqual(expect.any(String));const markdown=await fs.readFile(path.join(f.root,await f.store.fragmentPath(p.id)),'utf8');expect(markdown).toContain('## Same-list source context');expect(markdown).toContain('Conservatively retained');expect(markdown).toContain(String(context(p)).includes('Seal')?'Seal the cobalt':'Open the cobalt');}
    if(format==='canvas') expect(targets.every(p=>p.privacy==='private')).toBe(true);
    const statePath=path.join(f.root,'Derived/.third-brain/state.json'),state=await fs.readFile(statePath);await f.c.initialize();await f.c.refresh();expect(await f.store.load()).toEqual(index);expect(await fs.readFile(statePath)).toEqual(state);
    if(history.length){const base=path.join(f.root,'Derived/.third-brain/history');const backups=(await fs.readdir(base,{recursive:true,withFileTypes:true})).filter(e=>e.isFile());const bytes=await Promise.all(backups.map(e=>fs.readFile(path.join(e.parentPath,e.name))));for(const old of history)expect(bytes.some(b=>b.equals(old))).toBe(true);}
    await f.originals();
  } finally{f.c.dispose();}
});

it.each([['md','en'],['md','zh'],['canvas','en'],['canvas','zh']] as const)('actual %s/%s renders context outside closed evidence and verifies every original/fragment callback',async(format,locale)=>{
  const f=await fixture(format);let dispose:(()=>void)|undefined,pending:Promise<unknown>|undefined;
  try{
    await f.c.initialize();await f.c.refresh();await f.c.initialize();
    vi.stubGlobal('document',{createElement:(tag:string)=>new Node(tag)});const container=new Node('main'),opens:Promise<void>[]=[],fragments:Promise<string>[]=[];
    dispose=mountPanel(container as unknown as HTMLElement,{status:()=>f.c.status(),subscribe:h=>f.c.subscribe(h),refresh:()=>f.c.refresh(),cancel:()=>f.c.cancel(),find:(...a)=>{pending=f.c.find(...a);return pending as ReturnType<ThirdBrainController['find']>;},open:e=>{const p=f.c.verifyOpen(e);opens.push(p);return p;},openFragment:id=>{const p=f.c.verifyFragmentOpen(id).then(()=>f.store.fragmentPath(id));fragments.push(p);return p.then(()=>{});}},locale);
    const input=container.all().find(n=>n.className==='tb-idea')!;input.value='violet chamber';input.fire('input');container.all().find(n=>n.tag==='button'&&n.textContent===messages(locale).find)!.fire('click');
    const results=await pending as Awaited<ReturnType<ThirdBrainController['find']>>;await Promise.resolve();expect(results).toHaveLength(2);
    const cards=container.all().filter(n=>n.className==='tb-result');expect(cards).toHaveLength(2);
    for(const card of cards){const primary=card.all().find(n=>n.className==='tb-fragment')!;expect(primary.text()).not.toContain('the cobalt inlet');const ctx=card.all().find(n=>n.className==='tb-local-context')!;expect(ctx).toBeDefined();expect(ctx.tag).not.toBe('details');expect(card.visible()).toContain('the cobalt inlet');expect(card.visible()).toContain(locale==='zh'?'同组原文语境':'Same-list source context');expect(card.visible()).toContain(locale==='zh'?'保守保留':'Conservatively retained');for(const button of card.all().filter(n=>n.className==='tb-source')){button.fire('click');await opens.at(-1);}card.all().find(n=>n.tag==='button'&&n.textContent===messages(locale).openFragment)!.fire('click');await fragments.at(-1);}
    expect(opens).toHaveLength(results.reduce((n,r)=>n+r.fragment.evidence.length,0));expect(fragments).toHaveLength(2);await f.originals();
  }finally{await pending?.catch(()=>{});dispose?.();f.c.dispose();vi.unstubAllGlobals();}
});

it.each(['md','canvas'])('actual %s rejects every old action after sibling-only change/exclusion and preserves cancel/retry/human amendments',async format=>{
  const f=await fixture(format);
  try{
    await f.c.initialize();await f.c.refresh();const results=await f.c.find('violet chamber','medium'),target=results.find(r=>String(context(r.fragment)).includes('Seal the cobalt'))!;expect(target).toBeDefined();expect(new Set(target.fragment.evidence.map(e=>e.relativePath)).size).toBe(2);
    for(const e of target.fragment.evidence) await f.c.verifyOpen(e);await f.c.verifyFragmentOpen(target.fragment.id);await expect(f.c.verifyFragmentOpen('unknown-fragment')).rejects.toThrow();const name='copy.'+format,statePath=path.join(f.root,'Derived/.third-brain/state.json'),state=await fs.readFile(statePath);
    await fs.writeFile(path.join(f.root,name),f.raws[name].replace('Seal the cobalt inlet.','Change the synthetic sibling.'));
    for(const e of target.fragment.evidence) await expect(f.c.verifyOpen(e)).rejects.toThrow();await expect(f.c.verifyFragmentOpen(target.fragment.id)).rejects.toThrow();expect((await f.c.find('violet chamber','medium')).some(r=>r.fragment.id===target.fragment.id)).toBe(false);
    await fs.writeFile(path.join(f.root,name),f.raws[name]);f.settings.excludes.push(name);for(const e of target.fragment.evidence)await expect(f.c.verifyOpen(e)).rejects.toThrow();await expect(f.c.verifyFragmentOpen(target.fragment.id)).rejects.toThrow();f.settings.excludes.pop();for(const e of target.fragment.evidence)await f.c.verifyOpen(e);await f.c.verifyFragmentOpen(target.fragment.id);
    const commit=vi.spyOn(f.store,'commit'),list=f.sources.list.bind(f.sources);let entered!:()=>void,release!:()=>void;const started=new Promise<void>(r=>{entered=r;}),latch=new Promise<void>(r=>{release=r;});vi.spyOn(f.sources,'list').mockImplementationOnce(async o=>{entered();await latch;return list(o);});const refresh=f.c.refresh();await started;f.c.cancel();release();await expect(refresh).rejects.toMatchObject({name:'AbortError'});expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(state);await f.c.refresh();expect(await fs.readFile(statePath)).toEqual(state);
    const file=path.join(f.root,await f.store.fragmentPath(target.fragment.id)),bytes=await fs.readFile(file);await fs.writeFile(file,Buffer.concat([bytes,Buffer.from('\nSynthetic human amendment.')]));await expect(f.c.refresh()).rejects.toThrow();expect(await fs.readFile(file,'utf8')).toContain('Synthetic human amendment.');expect(await fs.readFile(statePath)).toEqual(state);await fs.writeFile(file,bytes);await f.c.initialize();await f.c.refresh();expect(await fs.readFile(statePath)).toEqual(state);
    for(const [n,text] of Object.entries(f.raws))expect(await fs.readFile(path.join(f.root,n),'utf8')).toBe(text);expect(f.request).not.toHaveBeenCalled();
  }finally{f.c.dispose();vi.restoreAllMocks();}
});

it('strict store and public staging reject illegal local-context shapes without changing saved state',async()=>{
  const f=await fixture('md');try{
    await f.c.initialize();await f.c.refresh();const index=(await f.store.load())!,target=Object.values(index.fragments).find(p=>context(p)!==undefined)!;expect(target).toBeDefined();const statePath=path.join(f.root,'Derived/.third-brain/state.json'),state=await fs.readFile(statePath);
    for(const patch of [{localContext:''},{localContext:null},{localContext:[]},{localContext:{text:'unknown'}},{localContext:'x'.repeat(16384)},{localContext:'bad\0text'},{mode:'ai'},{kind:'idea'},{unexpectedContext:'unknown'}]){
      const bad=structuredClone(index);Object.assign(bad.fragments[target.id],patch);await expect(f.store.commit(bad)).rejects.toThrow();await expect(buildIndex(await f.sources.list(),{...options,previous:bad,signature:generationSignature(f.settings)})).rejects.toThrow();expect(await fs.readFile(statePath)).toEqual(state);
    }
    const unsupported=structuredClone(index),invented={...unsupported.fragments[target.id],localContext:'Invented sibling absent from all quotations.'};
    invented.id=fragmentId(invented);delete unsupported.fragments[target.id];unsupported.fragments[invented.id]=invented;
    for(const source of Object.values(unsupported.sources))source.fragmentIds=source.fragmentIds.map(id=>id===target.id?invented.id:id).sort();
    await expect(f.store.commit(unsupported)).rejects.toThrow('lacks quotation evidence');
    await expect(buildIndex(await f.sources.list(),{...options,previous:unsupported,signature:generationSignature(f.settings)})).rejects.toThrow('lacks quotation evidence');
    expect(await fs.readFile(statePath)).toEqual(state);
    await f.originals();
  }finally{f.c.dispose();}
});

it('strictly reloads a complete identical Markdown/private-Canvas context with restrictive merged privacy',async()=>{
  const f=await fixture('md'),text=canvas(raw);try{
    await fs.writeFile(path.join(f.root,'mixed.canvas'),text);await f.c.initialize();await f.c.refresh();await f.c.initialize();
    const targets=await f.c.find('violet chamber','medium'),target=targets.find(r=>String(context(r.fragment)).includes('Seal the cobalt'))!;
    expect(target.fragment.privacy).toBe('private');expect(new Set(target.fragment.evidence.map(e=>e.relativePath)).size).toBe(3);
    for(const e of target.fragment.evidence)await f.c.verifyOpen(e);await f.c.verifyFragmentOpen(target.fragment.id);
    const statePath=path.join(f.root,'Derived/.third-brain/state.json'),state=await fs.readFile(statePath);await f.c.refresh();expect(await fs.readFile(statePath)).toEqual(state);await f.originals();expect(await fs.readFile(path.join(f.root,'mixed.canvas'),'utf8')).toBe(text);
  }finally{f.c.dispose();}
});

it('bounds primary plus omitted context once, and refuses complete-group overflow rather than truncating',async()=>{
  const group='- Synthetic group:\n  - Amber primary point.\n    - Example: '+ 'x'.repeat(100)+'\n  - Violet later point.\n    - Caveat: inert only.';
  const legal=group.replace('x'.repeat(100),'x'.repeat(100+16384-group.length));expect(legal.length).toBe(16384);
  const all=(await analyzeSource(snap(legal),options)).fragments;expect(all).toHaveLength(2);for(const f of all)expect(f.summary.length+1+String(context(f)).length).toBeLessThanOrEqual(16384);
  await expect(analyzeSource(snap(legal+'x'),options)).rejects.toThrow();await expect(analyzeSource(snap('# Extra heading\n'+legal),options)).rejects.toThrow();
});

it('strictly reloads 256 combined Canvas primary/context quotations; rejects 257 and cross-source merged overflow before commit',async()=>{
  const make=(n:number)=>canvas('- Synthetic group:\n  - Amber primary point.\n'+Array.from({length:n},(_,i)=>'    - Example: tile '+i+'.').join('\n')+'\n  - Violet later point.\n    - Caveat: inert only.');
  const scope=path.resolve('.local/local-sibling');await fs.mkdir(scope,{recursive:true});const root=await fs.mkdtemp(path.join(scope,'bounds-'));const file=path.join(root,'source.canvas'),legal=make(252),settings={...defaults,outputFolder:'Derived',excludes:[] as string[]},store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths()),c=new ThirdBrainController(sources,store,()=>settings,()=>undefined,async()=>{});
  try{await fs.writeFile(file,legal);await c.initialize();await c.refresh();const index=(await store.load())!,targets=Object.values(index.fragments).filter(p=>context(p)!==undefined);expect(targets).toHaveLength(2);expect(targets.every(p=>p.evidence.length===256)).toBe(true);const statePath=path.join(root,'Derived/.third-brain/state.json'),state=await fs.readFile(statePath);await c.refresh();expect(await fs.readFile(statePath)).toEqual(state);const commit=vi.spyOn(store,'commit');await fs.writeFile(file,make(253));await expect(c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(state);await fs.writeFile(file,legal);await c.refresh();expect(await fs.readFile(statePath)).toEqual(state);commit.mockClear();await fs.writeFile(path.join(root,'copy.canvas'),legal);await expect(c.refresh()).rejects.toThrow(/evidence limit/);expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(state);expect(await fs.readFile(file,'utf8')).toBe(legal);}
  finally{c.dispose();vi.restoreAllMocks();}
});
