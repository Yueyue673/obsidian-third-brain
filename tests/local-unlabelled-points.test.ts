// SPDX-License-Identifier: MIT
// Authored synthetic sources; structural retrieval, not AI semantic grading or native clicks.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { analyzeSource, prepareSource, searchFragments } from '../src/core/index';
import { hasReadableQuote } from '../src/core/sources';
import type { Fragment, ModelRequest } from '../src/core/types';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-unlabelled-legacy.json', 'utf8'));
const raw: string = legacy.raw;
const primary = 'Archive the jade ledger by date.';
const sibling = 'The amber prism scatters daylight.';
const opts = { mode:'local-excerpts' as const, cloudConsent:false, now:'2026-01-01T00:00:00.000Z' };
const snap = (text:string, name='synthetic.md') => prepareSource(name,text,hash(text),hash(name).slice(0,24));
const canvas = (text:string) => JSON.stringify({nodes:[{type:'text',text:'---\nprivacy: private\n---\n'+text},{type:'text',text:'Independent silver-node observation.'}],edges:[]});
const group = '- Only the synthetic bench:\n  - '+sibling+'\n  - '+primary;

it.each(['md','canvas','quoted-md','quoted-canvas'])('%s focuses unlabelled children and preserves all omitted sibling subtrees as exact visible context', async format => {
  const text = format.startsWith('quoted') ? raw.split('\n').map(line=>'> '+line).join('\n') : raw;
  const s = snap(format.endsWith('canvas')?canvas(text):text,format.endsWith('canvas')?'synthetic.canvas':'synthetic.md');
  const all = (await analyzeSource(s,opts)).fragments, f = all.find(f=>f.summary.includes(primary))!;
  expect(f).toBeDefined(); expect(f.summary).not.toContain(sibling);
  for (const common of ['# Synthetic observations','Only the isolated practice archive:','Notes from the disconnected bench:']) expect(f.summary).toContain(common);
  expect(f.localContext).toContain(sibling); expect(f.localContext).toContain('The cobalt dial remains at three marks.');
  expect(f.localContext).not.toContain('Independent white'); expect(f.localContext).not.toContain('silver-node');
  expect(all.filter(f=>f.localContext)).toHaveLength(3);
  expect(f.conditions).toEqual([]); expect(f.facets).toEqual({topics:[],concepts:[],mechanisms:[],atmosphere:[]});
  for(const e of f.evidence) { expect(e.sourceHash).toBe(s.hash); expect(e.sourceId).toBe(s.id); if(e.start>=0)expect(s.text.slice(e.start,e.end)).toBe(e.quote);else expect(hasReadableQuote(s,e.quote)).toBe(true); }
  const removed=all.map(f=>{const c={...f};delete c.localContext;return c;});
  const project=(items:ReturnType<typeof searchFragments>)=>Array.from(items,r=>({id:r.fragment.id,score:r.score,reasons:r.reasons,group:r.group}));
  expect(project(searchFragments(all,primary,{breadth:'medium'}))).toEqual(project(searchFragments(removed,primary,{breadth:'medium'})));
});

it.each([
  ['back-reference',group.replace(primary,'Only after that preparation, archive the jade ledger.')],
  ['forward-reference',group.replace(sibling,'Use the mixture specified below.').replace(primary,'The mixture contains two inert pigments.')],
  ['implicit-definition',group.replace(sibling,'The amber mix contains two inert pigments.').replace(primary,'Pour the amber mix into the jade container.')],
  ['Chinese','- 仅在离线合成环境：\n  - 青铜阈值设为四格。\n  - 达到上述阈值才归档翡翠记录。'],
  ['partly-qualified',group+'\n    - Caveat: no real identities.'],
  ['tabs',group.replace(/  - /gu,'\t- ')],
  ['loose',group.replace(/\n  - /gu,'\n\n  - ')],
  ['long-tail',group.replace(sibling,sibling+' '+'Synthetic observation. '.repeat(75))],
])('%s does not infer independence or lose dependency text when focusing',async(_name,text)=>{
  for(const newline of ['\n','\r\n','\r']) {
    const input=text.replace(/\n/gu,newline), all=(await analyzeSource(snap(input),opts)).fragments;
    expect(all).toHaveLength(2);
    for(const f of all){expect(f.localContext).toBeTruthy();for(const e of f.evidence)expect(input.slice(e.start,e.end)).toBe(e.quote);}
    for(const line of input.split(newline).filter(line=>line.trim()))expect(all.every(f=>(f.summary+'\n'+f.localContext).includes(line.trim()))).toBe(true);
  }
});

it('retains whole ordered/task/ambiguous groups and does not recursively split a branch',async()=>{
  for(const text of [
    group.replace('  - '+sibling,'  1. '+sibling).replace('  - '+primary,'  2. '+primary),
    group.replace('  - '+sibling,'  - [x] '+sibling),
    group.replace('- Only','- [ ] Only'),
    group.replace('bench:','bench.'),
    group.replace('bench:\n','bench:\n  Both observations belong to one context.\n'),
    group+'\n  Both items must finish together.',
    '- Only the synthetic bench:\n  - A coupled sequence:\n    - '+sibling+'\n    - '+primary,
  ])expect((await analyzeSource(snap(text),opts)).fragments.map(f=>f.summary)).toEqual([text]);
  await expect(analyzeSource(snap(group.replace('  - '+primary,' - '+primary)),opts)).rejects.toThrow('ambiguous indentation');
  const shared=group+'\n  - Condition: keep the synthetic bench isolated.\n    - Never use production data.\n- Caveat: no real equipment.';
  for(const f of (await analyzeSource(snap(shared),opts)).fragments)for(const c of ['Condition:','Never use production data.','Caveat:'])expect(f.summary).toContain(c);
  const literal='Literal `<!--` and `%%` examples are ordinary prose.';
  expect((await analyzeSource(snap(group+'\n\n'+literal),opts)).fragments.some(f=>f.summary===literal)).toBe(true);
  for(const marker of ['<!-- hidden -->','%% hidden %%'])await expect(analyzeSource(snap(group.replace('bench:',marker+' bench:')),opts)).rejects.toThrow();
});

it('changes only local generation; both AI signatures and complete offline requests remain exact',async()=>{
  expect(generationSignature({...defaults,outputFolder:'Derived'})).not.toBe(legacy.signatures['local-excerpts']);
  for(const mode of ['local-model','cloud-model'] as const){
    expect(generationSignature({...defaults,outputFolder:'Derived',mode})).toBe(legacy.signatures[mode]);
    const requests:ModelRequest[]=[];
    await analyzeSource(snap(raw,'a.md'),{mode,cloudConsent:true,model:{request:async r=>{requests.push(r);return{version:1,decision:'insufficient-context',fragments:[]};}}});
    expect(requests).toEqual(legacy.requests[mode]);
  }
});

class Node {
  className='';textContent='';value='';hidden=false;disabled=false;children:Node[]=[];handlers=new Map<string,(()=>void)[]>();
  constructor(readonly tag:string){}append(...ns:Node[]){this.children.push(...ns);}replaceChildren(...ns:Node[]){this.children=ns;}setAttribute(){}remove(){}focus(){}get childElementCount(){return this.children.length;}
  addEventListener(k:string,fn:()=>void){this.handlers.set(k,[...this.handlers.get(k)??[],fn]);}fire(k:string){for(const fn of this.handlers.get(k)??[])fn();}all():Node[]{return[this,...this.children.flatMap(n=>n.all())];}text():string{return[this.textContent,...this.children.map(n=>n.text())].join('\n');}
  visible():string{return this.hidden?'':[this.textContent,...(this.tag==='details'?this.children.filter(n=>n.tag==='summary'):this.children).map(n=>n.visible())].join('\n');}
}
async function fixture(format:string){
  const scope=path.resolve('.local/local-unlabelled');await fs.mkdir(scope,{recursive:true});const root=await fs.mkdtemp(path.join(scope,'vault-'));
  const raws:Record<string,string>=Object.fromEntries(Object.entries(legacy.raws as Record<string,string>).map(([n,t])=>[n.replace(/md$/u,format),format==='md'?t:canvas(t)]));
  const mtimes=new Map<string,string>();for(const[n,t]of Object.entries(raws)){await fs.writeFile(path.join(root,n),t);mtimes.set(n,(await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString());}
  await fs.mkdir(path.join(root,'Derived'));await fs.writeFile(path.join(root,'Derived/manual.txt'),'Synthetic human-owned file.');
  const settings={...defaults,outputFolder:'Derived',excludes:[] as string[]},store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths());
  const request=vi.fn(async()=>{throw Error('Forbidden model request');}),c=new ThirdBrainController(sources,store,()=>settings,()=>({request}),async()=>{});
  const originals=async()=>{for(const[n,t]of Object.entries(raws)){expect(await fs.readFile(path.join(root,n),'utf8')).toBe(t);expect((await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()).toBe(mtimes.get(n));}expect(await fs.readFile(path.join(root,'Derived/manual.txt'),'utf8')).toBe('Synthetic human-owned file.');expect(request).not.toHaveBeenCalled();};
  return{root,raws,settings,store,sources,c,request,originals};
}

it.each(['md','canvas'])('actual %s upgrade → strict reload → focused later point, complete duplicates and byte-idempotent refresh',async format=>{
  const f=await fixture(format);try{
    const oldBytes:Buffer[]=[];
    if(format==='md'){
      const inputs=await f.sources.list();await f.store.commit(structuredClone(legacy.oldIndex),()=>f.sources.verify(inputs));
      const marker=JSON.parse(await fs.readFile(path.join(f.root,'Derived/.third-brain/marker.json'),'utf8'));
      for(const id of Object.keys(legacy.oldIndex.fragments)){const bytes=await fs.readFile(path.join(f.root,await f.store.fragmentPath(id)));expect(bytes.toString().replaceAll(marker.storeId,'SYNTHETIC_STORE_ID')).toBe(legacy.rendered[id]);oldBytes.push(bytes);}
    }
    await f.c.initialize();await f.c.refresh();await f.c.initialize();const index=(await f.store.load())!,found=await f.c.find('jade ledger by date','medium');
    const targets=found.filter(r=>r.fragment.summary.includes(primary));expect(targets).toHaveLength(2);
    for(const r of targets){expect(r.fragment.summary).not.toContain(sibling);expect(r.fragment.localContext).toContain(sibling);expect(r.reasons.some(reason=>reason.kind==='content')).toBe(true);for(const e of r.fragment.evidence)await f.c.verifyOpen(e);await f.c.verifyFragmentOpen(r.fragment.id);expect(await fs.readFile(path.join(f.root,await f.store.fragmentPath(r.fragment.id)),'utf8')).toContain('## Same-list source context');}
    const merged=targets.find(r=>r.fragment.summary.includes('disconnected'))!;expect(new Set(merged.fragment.evidence.map(e=>e.relativePath)).size).toBe(2);expect(new Set(targets.map(r=>r.fragment.id)).size).toBe(2);
    if(format==='canvas')expect(targets.every(r=>r.fragment.privacy==='private')).toBe(true);
    const statePath=path.join(f.root,'Derived/.third-brain/state.json'),bytes=await fs.readFile(statePath);await f.c.refresh();expect(await fs.readFile(statePath)).toEqual(bytes);expect(await f.store.load()).toEqual(index);
    if(oldBytes.length){const base=path.join(f.root,'Derived/.third-brain/history');const files=(await fs.readdir(base,{recursive:true,withFileTypes:true})).filter(e=>e.isFile());const history=await Promise.all(files.map(e=>fs.readFile(path.join(e.parentPath,e.name))));for(const old of oldBytes)expect(history.some(b=>b.equals(old))).toBe(true);}
    await f.originals();
  }finally{f.c.dispose();}
});

it.each([['md','en'],['md','zh'],['canvas','en'],['canvas','zh']] as const)('actual %s/%s panel event finds a later focused point, shows context immediately, verifies every source and fragment callback',async(format,locale)=>{
  const f=await fixture(format);let dispose:(()=>void)|undefined,pending:Promise<unknown>|undefined;
  try{
    await f.c.initialize();await f.c.refresh();await f.c.initialize();
    vi.stubGlobal('document',{createElement:(tag:string)=>new Node(tag)});const container=new Node('main'),opens:Promise<void>[]=[],fragments:Promise<string>[]=[];
    dispose=mountPanel(container as unknown as HTMLElement,{status:()=>f.c.status(),subscribe:h=>f.c.subscribe(h),refresh:()=>f.c.refresh(),cancel:()=>f.c.cancel(),find:(...a)=>{pending=f.c.find(...a);return pending as ReturnType<ThirdBrainController['find']>;},open:e=>{const p=f.c.verifyOpen(e);opens.push(p);return p;},openFragment:id=>{const p=f.c.verifyFragmentOpen(id).then(()=>f.store.fragmentPath(id));fragments.push(p);return p.then(()=>{});}},locale);
    const input=container.all().find(n=>n.className==='tb-idea')!;input.value='jade ledger by date';input.fire('input');container.all().find(n=>n.tag==='button'&&n.textContent===messages(locale).find)!.fire('click');const found=await pending as Awaited<ReturnType<ThirdBrainController['find']>>;await Promise.resolve();
    const cards=container.all().filter(n=>n.className==='tb-result');expect(cards).toHaveLength(2);expect(found).toHaveLength(2);
    for(const card of cards){expect(card.all().find(n=>n.className==='tb-fragment')!.text()).not.toContain(sibling);expect(card.visible()).toContain(sibling);expect(card.visible()).toContain(locale==='zh'?'同组原文语境':'Same-list source context');expect(card.visible()).toContain(locale==='zh'?'保守保留':'Conservatively retained');expect(card.text()).toContain(messages(locale).excerpt);for(const b of card.all().filter(n=>n.className==='tb-source')){b.fire('click');await opens.at(-1);}card.all().find(n=>n.tag==='button'&&n.textContent===messages(locale).openFragment)!.fire('click');await fragments.at(-1);}
    expect(opens).toHaveLength(found.reduce((n,r)=>n+r.fragment.evidence.length,0));expect(fragments).toHaveLength(2);await f.originals();
  }finally{await pending?.catch(()=>{});dispose?.();f.c.dispose();vi.unstubAllGlobals();}
});

it.each(['md','canvas'])('actual %s rejects all old actions after omitted-sibling change/exclusion; cancel and human edits preserve saved state',async format=>{
  const f=await fixture(format);try{
    await f.c.initialize();await f.c.refresh();const found=await f.c.find('jade ledger by date','medium'),target=found.find(r=>r.fragment.summary.includes('disconnected'))!;
    expect(target.fragment.summary).not.toContain(sibling);for(const e of target.fragment.evidence)await f.c.verifyOpen(e);await f.c.verifyFragmentOpen(target.fragment.id);await f.originals();
    const name='copy.'+format,statePath=path.join(f.root,'Derived/.third-brain/state.json'),state=await fs.readFile(statePath);
    await fs.writeFile(path.join(f.root,name),f.raws[name].replace(sibling,'The synthetic amber prism is now opaque.'));
    for(const e of target.fragment.evidence)await expect(f.c.verifyOpen(e)).rejects.toThrow();await expect(f.c.verifyFragmentOpen(target.fragment.id)).rejects.toThrow();expect((await f.c.find('jade ledger by date','medium')).some(r=>r.fragment.id===target.fragment.id)).toBe(false);
    await fs.writeFile(path.join(f.root,name),f.raws[name]);f.settings.excludes.push(name);for(const e of target.fragment.evidence)await expect(f.c.verifyOpen(e)).rejects.toThrow();await expect(f.c.verifyFragmentOpen(target.fragment.id)).rejects.toThrow();f.settings.excludes.pop();
    const commit=vi.spyOn(f.store,'commit'),list=f.sources.list.bind(f.sources);let enter!:()=>void,release!:()=>void;const started=new Promise<void>(r=>{enter=r;}),latch=new Promise<void>(r=>{release=r;});vi.spyOn(f.sources,'list').mockImplementationOnce(async o=>{enter();await latch;return list(o);});const refresh=f.c.refresh();await started;f.c.cancel();release();await expect(refresh).rejects.toMatchObject({name:'AbortError'});expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(state);await f.c.refresh();expect(await fs.readFile(statePath)).toEqual(state);
    const file=path.join(f.root,await f.store.fragmentPath(target.fragment.id)),bytes=await fs.readFile(file);await fs.writeFile(file,Buffer.concat([bytes,Buffer.from('\nSynthetic human amendment.')]));await expect(f.c.refresh()).rejects.toThrow();expect(await fs.readFile(file,'utf8')).toContain('Synthetic human amendment.');expect(await fs.readFile(statePath)).toEqual(state);await fs.writeFile(file,bytes);await f.c.initialize();await f.c.refresh();expect(await fs.readFile(statePath)).toEqual(state);
    for(const[n,t]of Object.entries(f.raws))expect(await fs.readFile(path.join(f.root,n),'utf8')).toBe(t);expect(f.request).not.toHaveBeenCalled();
  }finally{f.c.dispose();vi.restoreAllMocks();}
});

it('keeps whole-group bounds before focusing and does not truncate parent or omitted context',async()=>{
  const legal=group.replace(sibling,sibling+'x'.repeat(16384-group.length));expect(legal.length).toBe(16384);const all=(await analyzeSource(snap(legal),opts)).fragments;expect(all).toHaveLength(2);for(const f of all)expect(f.summary.length+1+f.localContext!.length).toBeLessThanOrEqual(16384);
  await expect(analyzeSource(snap(legal+'x'),opts)).rejects.toThrow();await expect(analyzeSource(snap('# Extra heading\n'+legal),opts)).rejects.toThrow();
});

it('bounds focused copies at sixteen branches; wider groups stay complete rather than multiplying all sibling evidence',async()=>{
  const make=(n:number)=>'- Synthetic wide group:\n'+Array.from({length:n},(_,i)=>'  - Synthetic observation '+i+'.').join('\n');
  const focused=(await analyzeSource(snap(make(16)),opts)).fragments;
  expect(focused).toHaveLength(16);expect(focused.every(f=>f.localContext?.split('\n').length===15)).toBe(true);
  for(const n of [17,255])expect((await analyzeSource(snap(make(n)),opts)).fragments.map(f=>f.summary)).toEqual([make(n)]);
});

it('actual Canvas reload accepts 256 combined quotes, refuses 257/merged overflow before commit and retries byte-idempotently',async()=>{
  const make=(n:number)=>canvas('- Synthetic group:\n  - Amber primary point.\n'+Array.from({length:n},(_,i)=>'    - Synthetic tile '+i+'.').join('\n')+'\n  - Violet later point.');
  const scope=path.resolve('.local/local-unlabelled');await fs.mkdir(scope,{recursive:true});const root=await fs.mkdtemp(path.join(scope,'bounds-'));const file=path.join(root,'source.canvas'),legal=make(253),settings={...defaults,outputFolder:'Derived',excludes:[] as string[]},store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths()),c=new ThirdBrainController(sources,store,()=>settings,()=>undefined,async()=>{});
  try{
    await fs.writeFile(file,legal);await c.initialize();await c.refresh();const index=(await store.load())!,targets=Object.values(index.fragments).filter(f=>f.localContext);expect(targets).toHaveLength(2);expect(targets.every(f=>f.evidence.length===256)).toBe(true);
    const statePath=path.join(root,'Derived/.third-brain/state.json'),state=await fs.readFile(statePath);await c.refresh();expect(await fs.readFile(statePath)).toEqual(state);const commit=vi.spyOn(store,'commit');await fs.writeFile(file,make(254));await expect(c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(state);
    await fs.writeFile(file,legal);await c.refresh();expect(await fs.readFile(statePath)).toEqual(state);commit.mockClear();await fs.writeFile(path.join(root,'copy.canvas'),legal);await expect(c.refresh()).rejects.toThrow(/evidence limit/);expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(state);expect(await fs.readFile(file,'utf8')).toBe(legal);
  }finally{c.dispose();vi.restoreAllMocks();}
});
