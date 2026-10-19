// SPDX-License-Identifier: MIT
// Authored synthetic files, actual core/store/Main callbacks; not native clicks or model semantics.
// Bounded complete emphasis: https://spec.commonmark.org/0.31.2/#emphasis-and-strong-emphasis
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { MarkdownView } from 'obsidian';
import ThirdBrainPlugin from '../src/main';
import { analyzeSource, prepareSource } from '../src/core';
import { textBlocks, hasReadableQuote } from '../src/core/sources';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
import type { ModelRequest, SearchResult } from '../src/core/types';
vi.mock('obsidian',()=>({Plugin:class{},ItemView:class{},PluginSettingTab:class{},MarkdownView:class{}}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const legacy=JSON.parse(await fs.readFile('tests/fixtures/local-emphasized-leadin-legacy.json','utf8'));
const {lead,other,action,second,tail}=legacy as Record<string,string>;
const opts={mode:'local-excerpts' as const,cloudConsent:false};
const snap=(raw:string,n='synthetic.md')=>prepareSource(n,raw,hash(raw),hash(n).slice(0,24));
const encode=(raw:string,ext:string)=>ext==='md'?raw:JSON.stringify({nodes:[{type:'text',text:'---\nprivacy: private\n---\n'+raw}],edges:[]});
it.each(['*Only inert rigs:*','**Only inert rigs:**','_Only inert rigs:_','__Only inert rigs:__','**仅限断开的合成空箱：**','Prior synthetic explanation.\n**Only inert rigs:**'])('retains the complete adjacent emphasized introduction %s with every independent action',async intro=>{
 const raw=intro+'\n\n'+action+'\n'+second+'\n\n'+tail;
 const r=await analyzeSource(snap(raw),opts);expect(r.fragments).toHaveLength(3);
 for(const term of ['opal reed','saffron disc']){const f=r.fragments.find(f=>f.summary.includes(term))!;expect(f.summary).toContain(intro);expect(f.evidence.some(e=>e.quote===intro)).toBe(true);}
 expect(r.fragments.find(f=>f.summary.includes('Ivory filament'))!.summary).toBe(tail);
 for(const f of r.fragments)for(const e of f.evidence)expect(raw.slice(e.start,e.end)).toBe(e.quote);
});
it('does not turn code/escapes/partial/unsupported emphasis or ordinary prose into new list scope',async()=>{
 for(const intro of ['`**Only inert rigs:**`','\\**Only inert rigs:**','***Only inert rigs:***','** Only inert rigs:**','**Only inert rigs: **','**Only inert rigs:*','Only **inert rigs:**','**Only inert rigs.**','An independent observation.']){
  const r=await analyzeSource(snap(intro+'\n\n'+action),opts);expect(r.fragments.find(f=>f.summary.includes('opal reed'))!.summary).toBe(action);
 }
 const literal='Literal `<!--` and `%%` syntax examples remain ordinary inline prose.';
 const r=await analyzeSource(snap('- Previous root.\n\n'+literal+'\n\n'+action),opts);expect(r.fragments.some(f=>f.summary===literal)).toBe(true);
});
it('keeps plain colons, exact newlines and fully quoted introductions while outside boundaries end scope',async()=>{
 for(const intro of ['Only inert rigs:','__Only inert rigs__:','> **Only inert rigs:**\n>'])for(const nl of ['\n','\r\n','\r']){
  const raw=(intro+'\n\n'+action).replace(/\n/gu,nl),r=await analyzeSource(snap(raw),opts),f=r.fragments.find(f=>f.summary.includes('opal reed'))!;
  expect(f.summary).toContain(intro.replace(/\n/gu,nl));for(const e of f.evidence)expect(raw.slice(e.start,e.end)).toBe(e.quote);
 }
 for(const boundary of ['Independent prose.\n\n','# Outside\n','```\nSynthetic code\n```\n','<!-- hidden -->\n','%% hidden %%\n','---\n']){
  const r=await analyzeSource(snap(lead+'\n\n'+boundary+action),opts);expect(r.fragments.find(f=>f.summary.includes('opal reed'))!.summary).not.toContain(lead);
 }
 const raw=JSON.stringify({nodes:[{type:'text',text:lead},{type:'text',text:action}],edges:[]});expect((await analyzeSource(snap(raw,'separate.canvas'),opts)).fragments.find(f=>f.summary.includes('opal reed'))!.summary).toBe(action);
});
it('counts the complete emphasized introduction inside the unchanged context limit and refuses hidden scope',async()=>{
 const prefix=lead+'\n\n- ',raw=prefix+'合'.repeat(16384-prefix.length);expect((await analyzeSource(snap(raw),opts)).fragments[0].summary).toBe(raw);
 await expect(analyzeSource(snap(raw+'尾'),opts)).rejects.toThrow();
 for(const marker of ['<!-- hidden -->','%% hidden %%'])await expect(analyzeSource(snap('**Only '+marker+' inert rigs:**\n\n'+action),opts)).rejects.toThrow();
});
it('the shared introduction predicate also keeps a complete adjacent table, without crossing ordinary prose',async()=>{
 const table='| Trial | Restriction |\n| --- | --- |\n| Opal reed | Only an inert socket |';
 const r=await analyzeSource(snap(lead+'\n\n'+table+'\n\n'+tail),opts);
 expect(r.fragments.find(f=>f.summary.includes('| Trial |'))!.summary).toBe(lead+'\n\n'+table);
 expect(r.fragments.find(f=>f.summary.includes('Ivory filament'))!.summary).toBe(tail);
});
it('versions only local generation; exact existing AI primary blocks and offline requests stay unchanged',async()=>{
 const inputs=Object.entries(legacy.raws as Record<string,string>).map(([n,r])=>snap(r,n));expect(inputs.map(s=>textBlocks(s))).toEqual(legacy.aiBlocks);
 expect(generationSignature({...defaults,outputFolder:'Derived',excludes:[]})).not.toBe(legacy.signatures['local-excerpts']);
 for(const mode of ['local-model','cloud-model'] as const){expect(generationSignature({...defaults,outputFolder:'Derived',excludes:[],mode})).toBe(legacy.signatures[mode]);const requests:ModelRequest[]=[];await analyzeSource(inputs[0],{mode,cloudConsent:true,model:{request:async r=>{requests.push(r);return{version:1,decision:'insufficient-context',fragments:[]};}}});expect(requests).toEqual(legacy.requests[mode]);}
});
class Node{
 className='';textContent='';value='';hidden=false;disabled=false;children:Node[]=[];handlers=new Map<string,(()=>void)[]>();constructor(readonly tag:string){}
 append(...n:Node[]){this.children.push(...n);}replaceChildren(...n:Node[]){this.children=n;}setAttribute(){}remove(){}focus(){}get childElementCount(){return this.children.length;}
 addEventListener(k:string,h:()=>void){this.handlers.set(k,[...this.handlers.get(k)??[],h]);}fire(k:string){for(const h of this.handlers.get(k)??[])h();}all():Node[]{return[this,...this.children.flatMap(n=>n.all())];}text():string{return[this.textContent,...this.children.map(n=>n.text())].join('\n');}
}
async function fixture(ext:string,long=true){
 const base=path.resolve('.local/emphasized-leadin');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,ext+'-')),originals=new Map<string,{text:string;mtime:string}>();
 const put=async(n:string,text:string)=>{await fs.writeFile(path.join(root,n),text);originals.set(n,{text,mtime:(await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()});};
 for(const[n,raw]of Object.entries(legacy.raws as Record<string,string>)){const body=long?('The synthetic archive records the amber paper grain. '.repeat(32)).trim()+'\n\n'+raw:raw;if(long){expect(body.indexOf('opal reed')).toBeGreaterThan(1400);expect(body.indexOf('opal reed')).toBeGreaterThan(body.length/2);}await put(n.replace('.md','.'+ext),encode(body,ext));}
 await fs.mkdir(path.join(root,'Derived'));await put('Derived/manual.txt','Synthetic human-authored material.');
 const settings={...defaults,outputFolder:'Derived',excludes:[] as string[]},store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths());
 const factory=vi.fn(()=>undefined),saved=vi.fn(async()=>{}),c=new ThirdBrainController(sources,store,()=>settings,factory,saved);
 const targets=async()=>{const i=(await store.load())!,names=['Derived/.third-brain/state.json'];for(const id of Object.keys(i.fragments))names.push(await store.fragmentPath(id));return Promise.all(names.map(async n=>({n,bytes:await fs.readFile(path.join(root,n)),mtime:(await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()})));};
 const unchanged=async(before:Awaited<ReturnType<typeof targets>>)=>{for(const v of before){expect(await fs.readFile(path.join(root,v.n))).toEqual(v.bytes);expect((await fs.stat(path.join(root,v.n),{bigint:true})).mtimeNs.toString()).toBe(v.mtime);}};
 const protect=async()=>{for(const[n,v]of originals){expect(await fs.readFile(path.join(root,n),'utf8')).toBe(v.text);expect((await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()).toBe(v.mtime);}expect(factory.mock.results.every(v=>v.type==='return'&&v.value===undefined)).toBe(true);};
 return{root,originals,put,settings,store,sources,c,saved,targets,unchanged,protect};
}
it.each([['md','en'],['md','zh'],['canvas','en'],['canvas','zh']] as const)('actual %s/%s long-note idea → strict reload → Main renderer and every original/generated action',async(ext,locale)=>{
 const f=await fixture(ext),queries:Promise<SearchResult[]>[]=[],ops:Promise<void>[]=[];let dispose:(()=>void)|undefined;
 try{
  await f.c.initialize();await f.c.refresh();await f.c.initialize();const index=(await f.store.load())!,opened:string[]=[];
  const leaf={view:Object.create(MarkdownView.prototype),openFile:async(file:{path:string})=>{opened.push(file.path);leaf.view.file=file;leaf.view.getMode=()=> 'source';leaf.view.editor={getValue:()=>f.originals.get(file.path)?.text??'',setSelection:()=>{},scrollIntoView:()=>{}};}};
  const plugin=Object.assign(Object.create(ThirdBrainPlugin.prototype),{controller:f.c,store:f.store,settings:f.settings,app:{vault:{getFileByPath:(n:string)=>({path:n,extension:path.extname(n).slice(1)})},workspace:{getLeaf:()=>leaf}}}) as ThirdBrainPlugin;
  const port=plugin.panelPort(),find=port.find.bind(port),open=port.open.bind(port),gen=port.openFragment!.bind(port);
  vi.spyOn(port,'find').mockImplementation((...a)=>{const p=find(...a);queries.push(p);return p;});vi.spyOn(port,'open').mockImplementation(e=>{const p=open(e);ops.push(p);return p;});vi.spyOn(port,'openFragment').mockImplementation((...a)=>{const p=gen(...a);ops.push(p);return p;});
  vi.stubGlobal('document',{createElement:(tag:string)=>new Node(tag)});const box=new Node('main'),t=messages(locale);dispose=mountPanel(box as unknown as HTMLElement,port,locale);
  const search=async(q:string)=>{const input=box.all().find(n=>n.className==='tb-idea')!;input.value=q;input.fire('input');box.all().find(n=>n.tag==='button'&&n.textContent===t.find)!.fire('click');const hits=await queries.at(-1)!;await Promise.resolve();return hits;};
  const actions=(card:Node)=>card.all().filter(n=>n.className==='tb-source'||n.tag==='button'&&n.textContent===t.openFragment);
  const hits=await search('opal reed');expect(hits).toHaveLength(2);expect(new Set(hits.map(r=>r.fragment.id)).size).toBe(2);
  const cards=box.all().filter(n=>n.className==='tb-result');expect(cards).toHaveLength(2);expect(cards.some(n=>n.text().includes(lead))).toBe(true);expect(cards.some(n=>n.text().includes(other))).toBe(true);
  for(const[i,card]of cards.entries()){expect(card.text()).toContain('warm chalk');expect(card.text()).not.toContain('saffron disc');expect(card.text()).not.toContain(tail);expect(card.text()).toContain(t.excerpt);expect(actions(card)).toHaveLength(hits[i].fragment.evidence.length+1);for(const b of actions(card)){b.fire('click');await ops.at(-1);}for(const e of hits[i].fragment.evidence){const s=(await f.sources.read(e.relativePath))!;expect(e.sourceId).toBe(s.id);expect(e.sourceHash).toBe(s.hash);expect(index.sources[e.relativePath].fragmentIds).toContain(hits[i].fragment.id);if(e.start>=0)expect(s.text.slice(e.start,e.end)).toBe(e.quote);else expect(hasReadableQuote(s,e.quote)).toBe(true);}}
  const merged=hits.find(r=>r.fragment.summary.includes(lead))!.fragment;expect(new Set(merged.evidence.map(e=>e.relativePath))).toEqual(new Set(['a.'+ext,'copy.'+ext]));
  const old=cards.find(n=>n.text().includes(lead))!,oldActions=actions(old),name='copy.'+ext,raw=f.originals.get(name)!.text,count=opened.length;
  await f.put(name,raw.replace(lead,other));for(const b of oldActions){b.fire('click');await expect(ops.at(-1)).rejects.toThrow();}expect(opened).toHaveLength(count);expect((await f.c.find('opal reed','medium')).some(r=>r.fragment.id===merged.id)).toBe(false);
  await f.c.refresh();await f.c.initialize();for(const b of oldActions){b.fire('click');await expect(ops.at(-1)).rejects.toThrow();}expect(opened).toHaveLength(count);
  const fresh=await search('opal reed');expect(fresh).toHaveLength(2);const now=box.all().filter(n=>n.className==='tb-result');for(const card of now)for(const b of actions(card)){b.fire('click');await ops.at(-1);}
  f.settings.excludes.push('a.'+ext);const a=now.find(n=>n.text().includes(lead))!,before=opened.length;for(const b of actions(a)){b.fire('click');await expect(ops.at(-1)).rejects.toThrow();}expect(opened).toHaveLength(before);f.settings.excludes.pop();
  expect(await search('Ivory filament')).toHaveLength(1);const lateCard=box.all().find(n=>n.className==='tb-result')!;expect(lateCard.text()).toContain(tail);expect(lateCard.text()).not.toContain(lead);for(const b of actions(lateCard)){b.fire('click');await ops.at(-1);}
  if(ext==='canvas')expect(Object.values(index.fragments).every(v=>v.privacy==='private')).toBe(true);
  const bytes=await f.targets();await f.c.refresh();await f.unchanged(bytes);await f.protect();expect(opened.some(n=>n.startsWith('Derived/fragment-'))).toBe(true);expect(opened.some(n=>!n.startsWith('Derived/'))).toBe(true);
 }finally{await Promise.allSettled([...queries,...ops]);dispose?.();f.c.dispose();}
});
it('strict frozen legacy load keeps old bytes, upgrades once, retains history and is idempotent',async()=>{
 const f=await fixture('md',false);try{const inputs=await f.sources.list();await f.store.commit(structuredClone(legacy.old),()=>f.sources.verify(inputs));const old=await f.targets();await f.c.initialize();expect(await f.store.load()).toEqual(legacy.old);await f.unchanged(old);
 const commit=vi.spyOn(f.store,'commit');await f.c.refresh();expect(commit).toHaveBeenCalledTimes(1);await f.c.initialize();expect(await f.c.find('opal reed','medium')).toHaveLength(2);expect((await f.store.load())!.signature).not.toBe(legacy.old.signature);
 const files=await fs.readdir(path.join(f.root,'Derived/.third-brain/history'),{recursive:true,withFileTypes:true}),history=await Promise.all(files.filter(v=>v.isFile()).map(v=>fs.readFile(path.join(v.parentPath,v.name))));for(const v of old.filter(v=>v.n.includes('fragment-')))expect(history.some(b=>b.equals(v.bytes))).toBe(true);
 const next=await f.targets();await f.c.refresh();await f.unchanged(next);await f.protect();}finally{f.c.dispose();}
});
it('counts the retained Canvas introduction in exact 256/257 evidence and merged-donor limits before commit',async()=>{
 const f=await fixture('canvas',false);try{
  const body=(n:number)=>encode(lead+'\n\n- Ordered synthetic trial:\n'+Array.from({length:n},(_,i)=>'  '+(i+1)+'. Synthetic inert step '+i+'.').join('\n'),'canvas');
  // Exclude the other freshly authored fixtures; never alter an existing vault.
  f.settings.excludes.push('copy.canvas','c.canvas');await f.put('a.canvas',body(254));await f.c.initialize();await f.c.refresh();await f.c.initialize();
  let index=(await f.store.load())!;expect(Object.values(index.fragments)).toHaveLength(1);expect(Object.values(index.fragments)[0].evidence).toHaveLength(256);
  const before=await f.targets(),commit=vi.spyOn(f.store,'commit');await f.put('a.canvas',body(255));await expect(f.c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();await f.unchanged(before);
  await f.put('a.canvas',body(254));await f.c.refresh();await f.unchanged(before);commit.mockClear();
  f.settings.excludes.splice(0,1);await f.put('a.canvas',body(127));await f.put('copy.canvas',body(127));await expect(f.c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();await f.unchanged(before);
  await f.put('a.canvas',body(126));await f.put('copy.canvas',body(126));await f.c.refresh();await f.c.initialize();index=(await f.store.load())!;expect(Object.values(index.fragments)).toHaveLength(1);expect(Object.values(index.fragments)[0].evidence).toHaveLength(256);
  const next=await f.targets();await f.c.refresh();await f.unchanged(next);await f.protect();
 }finally{f.c.dispose();}
});
it.each(['md','canvas'])('actual %s refusal/cancellation makes no commit or success-save; repaired retry and human ownership remain safe',async ext=>{
 const f=await fixture(ext);try{await f.c.initialize();await f.c.refresh();const before=await f.targets(),commit=vi.spyOn(f.store,'commit'),name='a.'+ext,raw=f.originals.get(name)!.text;f.saved.mockClear();
 for(const bad of ['**Only <!-- hidden --> inert rigs:**\n\n'+action,'**Only inert rigs:**\n\n- '+'合'.repeat(16384)]){await f.put(name,encode(bad,ext));await expect(f.c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();expect(f.saved).not.toHaveBeenCalled();await f.unchanged(before);await f.put(name,raw);await f.c.refresh();await f.unchanged(before);commit.mockClear();f.saved.mockClear();}
 const list=f.sources.list.bind(f.sources);let enter!:()=>void,release!:()=>void;const started=new Promise<void>(r=>{enter=r;}),latch=new Promise<void>(r=>{release=r;});vi.spyOn(f.sources,'list').mockImplementationOnce(async o=>{enter();await latch;return list(o);});const pending=f.c.refresh();await started;f.c.cancel();release();await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(commit).not.toHaveBeenCalled();expect(f.saved).not.toHaveBeenCalled();await f.unchanged(before);await f.c.refresh();await f.unchanged(before);
 const target=before.find(v=>v.n.includes('fragment-'))!;await fs.writeFile(path.join(f.root,target.n),Buffer.concat([target.bytes,Buffer.from('\nSynthetic human amendment.')]));await expect(f.c.refresh()).rejects.toThrow();expect(await fs.readFile(path.join(f.root,target.n),'utf8')).toContain('Synthetic human amendment.');expect(await fs.readFile(path.join(f.root,'Derived/.third-brain/state.json'))).toEqual(before[0].bytes);await f.protect();
 }finally{f.c.dispose();}
});
