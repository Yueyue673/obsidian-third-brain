// SPDX-License-Identifier: MIT
// Authored synthetic nested headings; no real model or native GUI grading.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, it, vi, afterEach } from 'vitest';
import { MarkdownView } from 'obsidian';
import ThirdBrainPlugin from '../src/main';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
import type { ModelRequest, SearchResult } from '../src/core/types';
vi.mock('obsidian',()=>({Plugin:class{},ItemView:class{},PluginSettingTab:class{},MarkdownView:class{},Notice:class{}}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
import { analyzeSource, buildIndex, emptyIndex, prepareSource } from '../src/core';
import { hasReadableQuote } from '../src/core/sources';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { ThirdBrainController } from '../src/controller';
import { defaults, generationSignature } from '../src/settings';
const legacy=JSON.parse(await fs.readFile('tests/fixtures/local-inner-heading-legacy.json','utf8'));
const {parent,other,point,raw}=legacy as {parent:string;other:string;point:string;raw:string};
const opts={mode:'local-excerpts' as const,cloudConsent:false,now:'2026-01-01T00:00:00.000Z'};
const snap=(text:string,name='synthetic.md')=>prepareSource(name,text,hash(text),hash(name).slice(0,24));
const wrap=(text:string,ext:string)=>ext==='canvas'?JSON.stringify({nodes:[{type:'text',text:'---\nprivacy: private\n---\n'+text}],edges:[]}):'---\nprivacy: local\n---\n'+text;
it.each([['md','atx'],['canvas','atx'],['md','dash'],['canvas','dash'],['md','equal'],['canvas','equal']])('%s/%s nested heading retains parent and does not leak scope to independent points',async(ext,style)=>{
  const body=raw.replace('  ### Collar routine',style==='atx'?'  ### Collar routine': '  Collar routine\n  '+(style==='dash'?'---':'==='));
  const inputs=[snap(wrap(body,ext),'a.'+ext),snap(wrap(body,ext),'b.'+ext),snap(wrap(body.replace(parent,other),ext),'c.'+ext)];
  const index=await buildIndex(inputs,{...opts,previous:emptyIndex(),signature:generationSignature(defaults)});
  const all=Object.values(index.fragments),targets=all.filter(f=>f.summary.includes(point));expect(targets).toHaveLength(2);
  const allowed=targets.find(f=>f.summary.includes(parent))!;expect(allowed).toBeDefined();expect(allowed.summary).toContain('Collar routine');expect(allowed.summary).toContain('warm chalk');expect(allowed.summary).not.toContain('mint observation');
  expect(new Set(allowed.evidence.map(e=>e.relativePath))).toEqual(new Set(['a.'+ext,'b.'+ext]));expect(targets.some(f=>f.summary.includes(other))).toBe(true);
  const independent=all.find(f=>f.summary.includes('mint observation'))!;expect(independent.summary).not.toContain('Collar routine');expect(independent.summary).not.toContain(parent);
  expect(all.find(f=>f.summary.includes('violet ledger'))!.summary).not.toContain('Collar routine');
  for(const f of targets)for(const e of f.evidence){const source=inputs.find(s=>s.path===e.relativePath)!;expect(e.sourceHash).toBe(source.hash);if(e.start>=0)expect(source.text.slice(e.start,e.end)).toBe(e.quote);else expect(hasReadableQuote(source,e.quote)).toBe(true);}
});
it.each(['md','canvas'])('actual %s FileSources → Controller → strict OwnedStore reload → late idea retains opposing parents',async ext=>{
  const scope=path.resolve('.local/inner-headings');await fs.mkdir(scope,{recursive:true});const root=await fs.mkdtemp(path.join(scope,ext+'-'));
  for(const [name,text]of Object.entries({a:raw,b:raw,c:raw.replace(parent,other)}))await fs.writeFile(path.join(root,name+'.'+ext),wrap(text,ext));
  const settings={...defaults,outputFolder:'Derived',excludes:[]},store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths()),request=vi.fn(async()=>{throw Error('Forbidden model request');}),c=new ThirdBrainController(sources,store,()=>settings,()=>({request}),async()=>{});
  try{await c.initialize();await c.refresh();await c.initialize();const saved=(await store.load())!,hits=await c.find('coral collar','medium');expect(hits).toHaveLength(2);expect(hits.every(r=>r.fragment.summary.includes('disconnected synthetic chest'))).toBe(true);expect(Object.keys(saved.fragments)).toContain(hits[0].fragment.id);for(const r of hits)for(const e of r.fragment.evidence)await c.verifyOpen(e);expect(request).not.toHaveBeenCalled();}finally{c.dispose();}
});

it('retains indented ATX/setext, Chinese, newline and quoted-list context with complete line evidence',async()=>{
  for(const heading of ['  ### 只在惰性箱内','   ### Only inert chests','    ### Only inert chests','  只在惰性箱内\n  ---','  Only inert chests\n  ==='])for(const nl of ['\n','\r\n','\r'])for(const quoted of [false,true]){
    let text=(parent+'\n\n'+heading+'\n\n  - '+point+'\n    Example: chalk is not equivalent.').replace(/\n/gu,nl);
    if(quoted)text=text.split(nl).map(line=>'> '+line).join(nl);
    const source=snap(text),all=(await analyzeSource(source,opts)).fragments;expect(all).toHaveLength(1);expect(all[0].summary).toContain(parent);expect(all[0].summary).toContain(point);
    for(const row of text.split(nl).map(s=>s.trim()).filter(Boolean))expect(all[0].evidence.some(e=>e.quote.includes(row))).toBe(true);
    for(const e of all[0].evidence)expect(text.slice(e.start,e.end)).toBe(e.quote);
  }
});
it('dedented headings end the old list before classification; top-level scope and literal syntax remain intact',async()=>{
  for(const prefix of ['', ' ', '  ', '   ']){
    const text=parent+'\n\n  ### Internal collar routine\n\n  - '+point+'\n\n'+prefix+'# Independent archive\n'+(prefix.length>=2?'  ':'')+'A mint observation belongs only to the archive.';
    // Two/three-space headings remain inside this item; zero/one space ends it.
    const all=(await analyzeSource(snap(text),opts)).fragments,independent=all.find(f=>f.summary.includes('mint observation'))!;
    if(prefix.length<2){expect(independent.summary).toBe('# Independent archive\n\nA mint observation belongs only to the archive.');expect(independent.summary).not.toContain(parent);}
    else {expect(all.find(f=>f.summary.includes(point))!.summary).toContain('# Independent archive');expect(independent.summary).toContain(parent);expect(independent.summary).toContain('Internal collar routine');}
  }
  const ordinary='Literal `<!-- marker -->`, `%%`, `###` and `---` examples remain ordinary prose.';
  const all=(await analyzeSource(snap(parent+'\n  - '+point+'\n\n'+ordinary+'\n\nOnly inert archives\n===\n## Neutral child\nThe violet ledger is independent.'),opts)).fragments;
  expect(all.some(f=>f.summary===ordinary)).toBe(true);const tail=all.find(f=>f.summary.includes('violet ledger'))!;expect(tail.summary).toContain('Only inert archives\n===\n## Neutral child');expect(tail.summary).not.toContain(parent);
});
it('cannot use a nested heading to cross code/hidden/thematic boundaries or expose a hidden parent',async()=>{
  for(const boundary of ['  ```\n  Synthetic code\n  ```','  <!-- hidden -->','  %%hidden%%','  ---','  ***'])await expect(analyzeSource(snap(parent+'\n\n'+boundary+'\n\n  ### Collar routine\n\n  - '+point),opts)).rejects.toThrow();
  for(const marker of ['<!-- hidden -->','%%hidden%%'])for(const body of ['- Only '+marker+' inert chests:\n\n  ### Collar routine\n\n  - '+point,parent+'\n\n  ### Only '+marker+' inert chests\n\n  - '+point])await expect(analyzeSource(snap(body),opts)).rejects.toThrow();
  const canvas=JSON.stringify({nodes:[{type:'text',text:parent+'\n\n  ### Collar routine\n\n  - '+point},{type:'text',text:'A second node keeps its mint observation independent.'}],edges:[]});
  expect((await analyzeSource(snap(canvas,'nodes.canvas'),opts)).fragments.find(f=>f.summary.includes('second node'))!.summary).not.toContain(parent);
});
it('keeps the complete list/heading inside the unchanged 16384 bound rather than clipping conditions',async()=>{
  const prefix=parent+'\n\n  ### Collar routine\n\n  - ',text=prefix+'合'.repeat(16384-prefix.length);
  const all=(await analyzeSource(snap(text),opts)).fragments;expect(all).toHaveLength(1);expect(all[0].summary).toHaveLength(16384);
  await expect(analyzeSource(snap(text+'尾'),opts)).rejects.toThrow();
});
it('keeps both AI signatures and complete offline primary/background/vocabulary captures unchanged',async()=>{
  expect(generationSignature({...defaults,outputFolder:'Derived'})).not.toBe(legacy.signatures['local-excerpts']);
  for(const mode of ['local-model','cloud-model']as const){expect(generationSignature({...defaults,outputFolder:'Derived',mode})).toBe(legacy.signatures[mode]);const requests:ModelRequest[]=[];await analyzeSource(snap(raw),{mode,cloudConsent:true,model:{request:async r=>{requests.push(r);return {version:1,decision:'insufficient-context',fragments:[]};}}});expect(requests).toEqual(legacy.requests[mode]);}
});

class Node {
  className='';textContent='';value='';hidden=false;disabled=false;children:Node[]=[];handlers=new Map<string,(()=>void)[]>();
  constructor(readonly tag:string){}append(...nodes:Node[]){this.children.push(...nodes);}replaceChildren(...nodes:Node[]){this.children=nodes;}
  setAttribute(){}remove(){}focus(){}get childElementCount(){return this.children.length;}
  addEventListener(k:string,fn:()=>void){this.handlers.set(k,[...this.handlers.get(k)??[],fn]);}fire(k:string){for(const fn of this.handlers.get(k)??[])fn();}
  all():Node[]{return [this,...this.children.flatMap(n=>n.all())];}text():string{return [this.textContent,...this.children.map(n=>n.text())].join('\n');}
}
async function fixture(ext:string,locale:'en'|'zh'='en'){
  const base=path.resolve('.local/inner-headings');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'ui-'+ext+'-'));
  const expected=new Map<string,{text:string;mtime:string}>();
  const put=async(name:string,text:string)=>{await fs.writeFile(path.join(root,name),text);expected.set(name,{text,mtime:(await fs.stat(path.join(root,name),{bigint:true})).mtimeNs.toString()});};
  for(const [name,text]of Object.entries({a:raw,b:raw,c:raw.replace(parent,other)}))await put(name+'.'+ext,wrap(text,ext));
  await fs.mkdir(path.join(root,'Derived'));await put('Derived/manual.txt','Synthetic human-owned nested-heading material.');
  const settings={...defaults,outputFolder:'Derived',excludes:[] as string[],locale},store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths()),request=vi.fn(async()=>{throw Error('Forbidden model request');}),c=new ThirdBrainController(sources,store,()=>settings,()=>({request}),async()=>{});
  const hostOpens:string[]=[],selections:unknown[]=[];
  const leaf={view:Object.create(MarkdownView.prototype),openFile:async(file:{path:string})=>{hostOpens.push(file.path);leaf.view.file=file;leaf.view.getMode=()=>'source';leaf.view.editor={getValue:()=>expected.get(file.path)?.text??'',setSelection:(...args:unknown[])=>selections.push(args),scrollIntoView:()=>{}};}};
  const plugin=Object.assign(Object.create(ThirdBrainPlugin.prototype),{settings,controller:c,store,app:{vault:{getFileByPath:(p:string)=>({path:p,extension:path.extname(p).slice(1)})},workspace:{getLeaf:()=>leaf}}})as ThirdBrainPlugin;
  const port=plugin.panelPort(),finds:Promise<SearchResult[]>[]=[],opens:Promise<void>[]=[],generated:Promise<void>[]=[];
  const find=port.find.bind(port),open=port.open.bind(port),fragment=port.openFragment!.bind(port);
  vi.spyOn(port,'find').mockImplementation((...args)=>{const p=find(...args);finds.push(p);return p;});vi.spyOn(port,'open').mockImplementation(e=>{const p=open(e);opens.push(p);return p;});vi.spyOn(port,'openFragment').mockImplementation(id=>{const p=fragment(id);generated.push(p);return p;});
  vi.stubGlobal('document',{createElement:(tag:string)=>new Node(tag)});const container=new Node('main'),dispose=mountPanel(container as unknown as HTMLElement,port,locale);
  const query=async()=>{const input=container.all().find(n=>n.className==='tb-idea')!;input.value='coral collar';input.fire('input');container.all().find(n=>n.tag==='button'&&n.textContent===messages(locale).find)!.fire('click');const hits=await finds.at(-1)!;await Promise.resolve();return hits;};
  const originals=async()=>{for(const [name,e]of expected){expect(hash(await fs.readFile(path.join(root,name)))).toBe(hash(e.text));expect((await fs.stat(path.join(root,name),{bigint:true})).mtimeNs.toString()).toBe(e.mtime);}expect(request).not.toHaveBeenCalled();};
  const close=async()=>{await Promise.allSettled([...finds,...opens,...generated]);dispose();c.dispose();};
  return {root,settings,store,sources,c,port,container,query,opens,generated,hostOpens,selections,put,originals,close};
}
it.each([['md','en'],['md','zh'],['canvas','en'],['canvas','zh']]as const)('actual %s/%s idea → scoped late card → every Main original/generated renderer action',async(ext,locale)=>{
  const f=await fixture(ext,locale);try{
    await f.c.initialize();await f.c.refresh();await f.c.initialize();const hits=await f.query();expect(hits).toHaveLength(2);
    const cards=f.container.all().filter(n=>n.className==='tb-result');expect(cards).toHaveLength(2);
    for(const card of cards){expect(card.all().find(n=>n.className==='tb-fragment')!.text()).toContain('disconnected synthetic chest');expect(card.text()).toContain(messages(locale).excerpt);for(const b of card.all().filter(n=>n.className==='tb-source')){b.fire('click');await f.opens.at(-1);}card.all().find(n=>n.tag==='button'&&n.textContent===messages(locale).openFragment)!.fire('click');await f.generated.at(-1);}
    expect(f.opens).toHaveLength(hits.reduce((n,r)=>n+r.fragment.evidence.length,0));expect(f.generated).toHaveLength(2);expect(f.hostOpens).toHaveLength(f.opens.length+2);if(ext==='md')expect(f.selections).toHaveLength(f.opens.length);
    for(const r of hits){const text=await fs.readFile(path.join(f.root,await f.store.fragmentPath(r.fragment.id)),'utf8');expect(text).toContain('disconnected synthetic chest');expect(text).toContain(point);expect(text).toContain('warm chalk');}
    await f.originals();await fs.writeFile(path.join(f.root,'../'+path.basename(f.root)+'-receipt.json'),JSON.stringify({ext,locale,originalCallbacks:f.opens.length,generatedCallbacks:f.generated.length,hostCallbacks:f.hostOpens.length,strictReload:true,realModels:0,nativeGUI:false}));
  }finally{await f.close();}
});
it('actual old stored bytes load unchanged, upgrade once, retain history and rerun byte-idempotently',async()=>{
  const f=await fixture('md');try{
    const inputs=await f.sources.list();await f.store.commit(structuredClone(legacy.oldIndex),()=>f.sources.verify(inputs));const statePath=path.join(f.root,'Derived/.third-brain/state.json'),oldState=await fs.readFile(statePath),marker=JSON.parse(await fs.readFile(path.join(f.root,'Derived/.third-brain/marker.json'),'utf8')),oldFiles:Buffer[]=[];
    for(const id of Object.keys(legacy.oldIndex.fragments)){const bytes=await fs.readFile(path.join(f.root,await f.store.fragmentPath(id)));expect(bytes.toString().replaceAll(marker.storeId,'SYNTHETIC_STORE_ID')).toBe(legacy.rendered[id]);oldFiles.push(bytes);}
    await f.c.initialize();expect(await f.store.load()).toEqual(legacy.oldIndex);expect(await fs.readFile(statePath)).toEqual(oldState);await f.c.refresh();await f.c.initialize();const next=(await f.store.load())!;expect(next.signature).not.toBe(legacy.oldIndex.signature);const hits=await f.query();expect(hits).toHaveLength(2);expect(hits.every(r=>r.fragment.summary.includes('disconnected synthetic chest'))).toBe(true);
    const stable=await fs.readFile(statePath);await f.c.refresh();expect(await fs.readFile(statePath)).toEqual(stable);
    const history=await fs.readdir(path.join(f.root,'Derived/.third-brain/history'),{recursive:true,withFileTypes:true}),saved=await Promise.all(history.filter(e=>e.isFile()).map(e=>fs.readFile(path.join(e.parentPath,e.name))));for(const bytes of oldFiles)if(bytes.toString().includes(point)||bytes.toString().includes('Only inside'))expect(saved.some(v=>v.equals(bytes))).toBe(true);await f.originals();
  }finally{await f.close();}
});
it.each(['md','canvas'])('actual %s donor-only condition edits/exclusion refuse all old originals and retain unique late information',async ext=>{
  const f=await fixture(ext);try{
    await f.c.initialize();await f.c.refresh();const hits=await f.query(),old=hits.find(r=>r.fragment.summary.includes(parent))!;expect(new Set(old.fragment.evidence.map(e=>e.relativePath)).size).toBe(2);const statePath=path.join(f.root,'Derived/.third-brain/state.json'),bytes=await fs.readFile(statePath);
    await f.put('b.'+ext,wrap(raw.replace(parent,other),ext));for(const e of old.fragment.evidence)await expect(f.port.open(e)).rejects.toThrow();expect(await fs.readFile(statePath)).toEqual(bytes);expect((await f.c.find('coral collar','medium')).some(r=>r.fragment.id===old.fragment.id)).toBe(false);
    await f.c.refresh();await f.c.initialize();expect(await f.query()).toHaveLength(2);const unique=raw.replace(parent,other).replace(point,'The jade spindle records a distinct final observation.');await f.put('b.'+ext,wrap(unique,ext));await f.c.refresh();await f.c.initialize();const late=await f.c.find('jade spindle','medium');expect(late).toHaveLength(1);expect(late[0].fragment.summary).toContain(other);expect(late[0].fragment.summary).toContain('counterexample');for(const e of late[0].fragment.evidence)await f.port.open(e);
    expect((await f.c.find('coral collar','medium')).filter(r=>r.fragment.summary.includes(point))).toHaveLength(2);f.settings.excludes.push('b.'+ext);for(const e of late[0].fragment.evidence)await expect(f.port.open(e)).rejects.toThrow();f.settings.excludes.pop();const saved=await fs.readFile(statePath);await f.c.refresh();expect(await fs.readFile(statePath)).toEqual(saved);await f.originals();
  }finally{await f.close();}
});
it('actual hidden/oversized failures, cancellation and human edits preserve prior bytes and originals',async()=>{
  const f=await fixture('md');try{
    await f.c.initialize();await f.c.refresh();const statePath=path.join(f.root,'Derived/.third-brain/state.json'),state=await fs.readFile(statePath),commit=vi.spyOn(f.store,'commit');
    for(const invalid of [raw.replace('  ### Collar routine','  ### Only <!-- hidden --> inert chests'),raw.replace(point,'合'.repeat(16384))]){await f.put('b.md',wrap(invalid,'md'));await expect(f.c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(state);}
    await f.put('b.md',wrap(raw,'md'));const list=f.sources.list.bind(f.sources);let entered!:()=>void,release!:()=>void;const started=new Promise<void>(r=>{entered=r;}),latch=new Promise<void>(r=>{release=r;});vi.spyOn(f.sources,'list').mockImplementationOnce(async o=>{entered();await latch;return list(o);});const pending=f.c.refresh();await started;f.c.cancel();release();await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(state);
    await f.c.refresh();await f.c.initialize();expect(await fs.readFile(statePath)).toEqual(state);const target=(await f.query())[0].fragment,file=path.join(f.root,await f.store.fragmentPath(target.id));await fs.appendFile(file,'\nSynthetic human amendment.');await expect(f.c.refresh()).rejects.toThrow();expect(await fs.readFile(statePath)).toEqual(state);expect(await fs.readFile(file,'utf8')).toContain('Synthetic human amendment.');await f.originals();
  }finally{await f.close();}
});
it('actual Canvas counts nested heading evidence in the unchanged 256/257 bound and merged donor total',async()=>{
  const base=path.resolve('.local/inner-headings');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'bounds-'));
  const make=(count:number)=>wrap(parent+'\n\n  ### Collar routine\n\n'+Array.from({length:count},(_,i)=>'  '+(i+1)+'. Synthetic step '+i+'.').join('\n'),'canvas');
  const settings={...defaults,outputFolder:'Derived',excludes:[]},store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths()),c=new ThirdBrainController(sources,store,()=>settings,()=>undefined,async()=>{});
  try{await fs.writeFile(path.join(root,'a.canvas'),make(254));await c.initialize();await c.refresh();await c.initialize();let index=(await store.load())!;expect(Object.values(index.fragments)).toHaveLength(1);expect(Object.values(index.fragments)[0].evidence).toHaveLength(256);const statePath=path.join(root,'Derived/.third-brain/state.json'),state=await fs.readFile(statePath),commit=vi.spyOn(store,'commit');
    await fs.writeFile(path.join(root,'a.canvas'),make(255));await expect(c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(state);
    await fs.writeFile(path.join(root,'a.canvas'),make(127));await fs.writeFile(path.join(root,'b.canvas'),make(127));await expect(c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(state);
    await fs.writeFile(path.join(root,'a.canvas'),make(126));await fs.writeFile(path.join(root,'b.canvas'),make(126));await c.refresh();await c.initialize();index=(await store.load())!;expect(Object.values(index.fragments)[0].evidence).toHaveLength(256);const saved=await fs.readFile(statePath);await c.refresh();expect(await fs.readFile(statePath)).toEqual(saved);
  }finally{c.dispose();}
});
