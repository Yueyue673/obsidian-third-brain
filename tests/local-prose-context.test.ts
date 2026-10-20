// SPDX-License-Identifier: MIT
// Authored synthetic prose; offline model-port captures and DOM/host shells only.
// This tests bounded authored context, not semantic applicability or native clicks.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { MarkdownView } from 'obsidian';
import ThirdBrainPlugin from '../src/main';
import { analyzeSource, buildIndex, prepareSource } from '../src/core';
import { hasReadableQuote, textBlocks } from '../src/core/sources';
import type { IndexState, ModelRequest, SearchResult } from '../src/core/types';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
vi.mock('obsidian', () => ({ Plugin:class {},ItemView:class {},PluginSettingTab:class {},MarkdownView:class {} }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-prose-legacy.json','utf8'));
const local = { mode:'local-excerpts' as const, cloudConsent:false };
const snap = (raw:string,name='synthetic.md') => prepareSource(name,raw,hash(raw),hash(name).slice(0,24));
const unit = (s:typeof legacy.en,opposed=false) => [opposed?s.opposite:s.condition,s.point,opposed?s.otherCounter:s.counter].join('\n\n');
const second = (s:typeof legacy.en) => [s.secondCondition,s.second,s.secondCounter].join('\n\n');
const encode = (raw:string,ext:string) => ext==='md'?raw:JSON.stringify({nodes:[{type:'text',text:raw}],edges:[]});
it.each(['en','zh'])('%s keeps exactly the explicit adjacent condition / point / counterexample unit, not other prose',async lang => {
 const s=legacy[lang],raw=[s.independent,unit(s),second(s),s.independent].join('\n\n');
 const r=await analyzeSource(snap(raw),local),first=r.fragments.find(f=>f.summary.includes(s.point))!,next=r.fragments.find(f=>f.summary.includes(s.second))!;
 expect(first.summary).toBe(unit(s));expect(next.summary).toBe(second(s));expect(first.summary).not.toContain(s.second);expect(first.summary).not.toContain(s.independent);
 expect(r.fragments.some(f=>f.summary===s.independent)).toBe(true);for(const f of r.fragments)for(const e of f.evidence)expect(raw.slice(e.start,e.end)).toBe(e.quote);
});
it.each(['\n','\r\n','\r'])('retains exact multiline/emphasised Unicode spans with %j line endings',async newline => {
 const s=legacy.zh,raw=('**条件：** 离线合成练习。🧠\n只适用于纸制道具。\n\n'+s.point+'\n\n__反例__：潮湿道具不适用。').replace(/\n/gu,newline);
 const r=await analyzeSource(snap(raw),local);expect(r.fragments).toHaveLength(1);expect(r.fragments[0].summary).toContain('只适用于纸制道具。');expect(r.fragments[0].summary).toContain('__反例__：');for(const e of r.fragments[0].evidence)expect(raw.slice(e.start,e.end)).toBe(e.quote);
});
it('distinguishes opposing applicability and merges only complete copies without source/path salts',async()=>{
 const s=legacy.en,raw=unit(s),other=unit(s,true),i=await buildIndex([snap(raw,'a.md'),snap(raw,'copy.md'),snap(other,'opposed.md')],{...local,previous:null,signature:'synthetic'});
 const hits=Object.values(i.fragments).filter(f=>f.summary.includes(s.point));expect(hits).toHaveLength(2);expect(hits.find(f=>f.summary===raw)!.evidence).toHaveLength(6);expect(hits.find(f=>f.summary===other)!.evidence).toHaveLength(3);
});
it.each(['\n\n# New scope\n\n','\n\n```text\nnot prose\n```\n\n','\n\n<!-- hidden -->\n\n','\n\n%% hidden %%\n\n','\n\n---\n\n'])('does not bridge a structural/hidden barrier %j',async barrier=>{
 const s=legacy.en,r=await analyzeSource(snap(s.condition+barrier+s.point+'\n\n'+s.counter),local);expect(r.fragments.find(f=>f.summary.includes(s.point))!.summary).not.toContain(s.condition);expect(JSON.stringify(r)).not.toContain('not prose');
});
it('does not borrow from another Canvas node, literal labels, lists or ordinary inline syntax',async()=>{
 const s=legacy.en,raw=JSON.stringify({nodes:[{type:'text',text:s.condition},{type:'text',text:s.point+'\n\n'+s.counter}],edges:[]});
 const r=await analyzeSource(snap(raw,'synthetic.canvas'),local);expect(r.fragments.find(f=>f.summary.includes(s.point))!.summary).not.toContain(s.condition);
 for(const label of ['`Conditions:` literal syntax.','\\Conditions: escaped syntax.','A Conditions: inline label.','**Condi**tions: partial markup.']){const a=await analyzeSource(snap(label+'\n\n'+s.point+'\n\n'+s.counter),local);expect(a.fragments.find(f=>f.summary.includes(s.point))!.summary).not.toContain(label);}
 const literal='Literal `<!--` and `%%` syntax examples remain ordinary prose.';
 const a=await analyzeSource(snap(unit(s)+'\n\n'+literal+'\n\n- Separate list item.'),local);expect(a.fragments.some(f=>f.summary===literal)).toBe(true);expect(a.fragments.find(f=>f.summary.includes(s.point))!.summary).toBe(unit(s));
});
it('requires a complete unambiguous labelled sandwich rather than guessing scope for every paragraph',async()=>{
 const s=legacy.en;
 for(const raw of [s.condition+'\n\n'+s.point,s.point+'\n\n'+s.counter,s.condition+'\n\n'+s.point+'\n\n'+s.second+'\n\n'+s.counter]){const r=await analyzeSource(snap(raw),local);expect(r.fragments.find(f=>f.summary.includes(s.point))!.summary).toBe(s.point);}
 const whole=s.condition+' '+s.point+' '+s.counter,r=await analyzeSource(snap(whole+'\n\n'+s.independent),local);expect(r.fragments.find(f=>f.summary.includes(s.point))!.summary).toBe(whole);expect(r.fragments.some(f=>f.summary===s.independent)).toBe(true);
});
it('retains unchanged AI primary/background/wire and cache signatures offline; only local generation changes',async()=>{
 const source=snap(legacy.raws['a.md'],'a.md');expect(textBlocks(source)).toEqual(legacy.aiBlocks);expect(generationSignature({...defaults,outputFolder:'Derived'})).not.toBe(legacy.signatures['local-excerpts']);
 for(const mode of ['local-model','cloud-model'] as const){expect(generationSignature({...defaults,mode,outputFolder:'Derived'})).toBe(legacy.signatures[mode]);const requests:ModelRequest[]=[];await analyzeSource(source,{mode,cloudConsent:true,model:{request:async r=>{requests.push(r);return{version:1,decision:'insufficient-context',fragments:[]};}}});expect(requests).toEqual(legacy.requests[mode]);}
});
it('counts all prose plus headings inside the existing 16384-unit bound without splitting or truncation',async()=>{
 const prefix='# Synthetic scope\n\nConditions: Offline mockup.\n\n',suffix='\n\nCounterexample: Live use is excluded.';
 const raw=prefix+'合'.repeat(16384-prefix.length-suffix.length)+suffix,good=await analyzeSource(snap(raw),local);expect(good.fragments).toHaveLength(1);expect(good.fragments[0].summary).toHaveLength(16384);await expect(analyzeSource(snap(raw+'尾'),local)).rejects.toThrow();
});
async function fixture(ext:string,lang='en',long=true){
 const scope=path.resolve('.local/prose-context');await fs.mkdir(scope,{recursive:true});const root=await fs.mkdtemp(path.join(scope,ext+'-')),s=legacy[lang],originals=new Map<string,{raw:string;mtime:string}>();
 const put=async(name:string,raw:string)=>{await fs.writeFile(path.join(root,name),raw);originals.set(name,{raw,mtime:(await fs.stat(path.join(root,name),{bigint:true})).mtimeNs.toString()});};
 const body=(opposed=false)=>long?[legacy.background,unit(s,opposed),second(s),s.independent].join('\n\n'):unit(s,opposed);
 if(long){expect(body().indexOf(s.point)).toBeGreaterThan(1400);expect(body().indexOf(s.point)).toBeGreaterThan(body().length/2);expect(body().indexOf(s.second)).toBeGreaterThan(body().length/2);}
 for(const[name,privacy]of [['a','normal'],['copy','private'],['opposed','local']])await put(name+'.'+ext,encode((long?'---\nprivacy: '+privacy+'\n---\n':'')+body(name==='opposed'),ext));
 await fs.mkdir(path.join(root,'Derived'));await put('Derived/manual.txt','Synthetic human-owned material.');
 const settings={...defaults,outputFolder:'Derived',excludes:[] as string[]},store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths()),factory=vi.fn(()=>undefined),c=new ThirdBrainController(sources,store,()=>settings,factory,async()=>{});
 const protect=async()=>{for(const[n,v]of originals){expect(await fs.readFile(path.join(root,n),'utf8')).toBe(v.raw);expect((await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()).toBe(v.mtime);}expect(factory.mock.results.every(r=>r.type==='return'&&r.value===undefined)).toBe(true);};
 const targets=async()=>{const i=(await store.load())!,names=['Derived/.third-brain/state.json'];for(const id of Object.keys(i.fragments))names.push(await store.fragmentPath(id));return Promise.all(names.map(async n=>({n,bytes:await fs.readFile(path.join(root,n)),mtime:(await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()})));};
 const unchanged=async(before:Awaited<ReturnType<typeof targets>>)=>{for(const v of before){expect(await fs.readFile(path.join(root,v.n))).toEqual(v.bytes);expect((await fs.stat(path.join(root,v.n),{bigint:true})).mtimeNs.toString()).toBe(v.mtime);}};
 return{root,s,put,originals,settings,store,sources,factory,c,protect,targets,unchanged};
}
it('strictly loads exact baseline state/bytes, upgrades local prose once, retains old render history and reruns without writes',async()=>{
 const f=await fixture('md','en',false);try{const inputs=await f.sources.list();await f.store.commit(structuredClone(legacy.old) as IndexState,()=>f.sources.verify(inputs));await f.c.initialize();expect(await f.store.load()).toEqual(legacy.old);const old=await f.targets();await f.unchanged(old);const commit=vi.spyOn(f.store,'commit');await f.c.refresh();expect(commit).toHaveBeenCalledTimes(1);await f.c.initialize();const i=(await f.store.load())!;expect(i.signature).not.toBe(legacy.old.signature);expect(Object.values(i.fragments).filter(v=>v.summary.includes(f.s.point))).toHaveLength(2);
 const entries=await fs.readdir(path.join(f.root,'Derived/.third-brain/history'),{recursive:true,withFileTypes:true}),bodies=await Promise.all(entries.filter(v=>v.isFile()).map(v=>fs.readFile(path.join(v.parentPath,v.name))));for(const file of old.filter(v=>v.n.includes('fragment-')))expect(bodies.some(b=>b.equals(file.bytes))).toBe(true);const next=await f.targets();await f.c.refresh();await f.unchanged(next);expect(commit).toHaveBeenCalledTimes(2);/* Controller also requests a no-op commit; byte/nsmtime checks prove no rewrite. */await f.protect();}finally{f.c.dispose();}
});
class Node {
 className='';textContent='';value='';hidden=false;disabled=false;children:Node[]=[];handlers=new Map<string,(()=>void)[]>();
 constructor(readonly tag:string){}append(...n:Node[]){this.children.push(...n);}replaceChildren(...n:Node[]){this.children=n;}setAttribute(){}remove(){}focus(){}get childElementCount(){return this.children.length;}
 addEventListener(k:string,h:()=>void){this.handlers.set(k,[...this.handlers.get(k)??[],h]);}fire(k:string){for(const h of this.handlers.get(k)??[])h();}all():Node[]{return[this,...this.children.flatMap(n=>n.all())];}text():string{return[this.textContent,...this.children.map(n=>n.text())].join('\n');}
}
it.each([['md','en'],['md','zh'],['canvas','en'],['canvas','zh']] as const)('actual %s/%s late points → strict store → Main renderer → all current original/generated actions',async(ext,lang)=>{
 const f=await fixture(ext,lang),queries:Promise<SearchResult[]>[]=[],operations:Promise<void>[]=[];let dispose:(()=>void)|undefined;
 try{await f.c.initialize();await f.c.refresh();await f.c.initialize();const index=(await f.store.load())!,s=f.s,opened:string[]=[],selected:string[]=[];
 const leaf={view:Object.create(MarkdownView.prototype),openFile:async(file:{path:string})=>{opened.push(file.path);leaf.view.file=file;leaf.view.getMode=()=>'source';const raw=f.originals.get(file.path)?.raw??'';leaf.view.editor={getValue:()=>raw,setSelection:(a:{line:number;ch:number},b:{line:number;ch:number})=>{const offset=(v:{line:number;ch:number})=>raw.split('\n').slice(0,v.line).reduce((n,l)=>n+l.length+1,0)+v.ch;selected.push(raw.slice(offset(a),offset(b)));},scrollIntoView:()=>{}};}};
 const plugin=Object.assign(Object.create(ThirdBrainPlugin.prototype),{controller:f.c,store:f.store,settings:f.settings,app:{vault:{getFileByPath:(n:string)=>({path:n,extension:path.extname(n).slice(1)})},workspace:{getLeaf:()=>leaf}}}) as ThirdBrainPlugin;
 const port=plugin.panelPort(),find=port.find.bind(port),open=port.open.bind(port),generated=port.openFragment!.bind(port);vi.spyOn(port,'find').mockImplementation((...a)=>{const p=find(...a);queries.push(p);return p;});vi.spyOn(port,'open').mockImplementation(e=>{const p=open(e);operations.push(p);return p;});vi.spyOn(port,'openFragment').mockImplementation((...a)=>{const p=generated(...a);operations.push(p);return p;});
 vi.stubGlobal('document',{createElement:(tag:string)=>new Node(tag)});const box=new Node('main'),t=messages(lang);dispose=mountPanel(box as unknown as HTMLElement,port,lang);
 const search=async(q:string)=>{const input=box.all().find(n=>n.className==='tb-idea')!;input.value=q;input.fire('input');box.all().find(n=>n.tag==='button'&&n.textContent===t.find)!.fire('click');const hits=await queries.at(-1)!;await Promise.resolve();return hits;};
 const actions=(card:Node)=>card.all().filter(n=>n.className==='tb-source'||n.tag==='button'&&n.textContent===t.openFragment);const old:Node[]=[];
 for(const[q,point,condition,counter]of [[s.query,s.point,s.condition,s.counter],[s.secondQuery,s.second,s.secondCondition,s.secondCounter]]){
 const hits=await search(q),cards=box.all().filter(n=>n.className==='tb-result'),at=hits.findIndex(r=>r.fragment.summary.includes(point)&&r.fragment.summary.includes(condition));expect(at).toBeGreaterThanOrEqual(0);const card=cards[at],fragment=hits[at].fragment;
 expect(card.text()).toContain(condition);expect(card.text()).toContain(counter);expect(card.text()).toContain(t.excerpt);expect(card.text()).not.toContain(s.independent);expect(fragment.mode).toBe('local');expect(Object.values(fragment.facets).every(v=>v.length===0)).toBe(true);expect(hits[at].reasons.every(r=>r.kind==='content')).toBe(true);
 expect(new Set(fragment.evidence.map(e=>e.relativePath))).toEqual(new Set(point===s.point?['a.'+ext,'copy.'+ext]:['a.'+ext,'copy.'+ext,'opposed.'+ext]));expect(fragment.privacy).toBe('private');
 for(const e of fragment.evidence){const source=(await f.sources.read(e.relativePath))!;expect(source.id).toBe(e.sourceId);expect(source.hash).toBe(e.sourceHash);expect(index.sources[e.relativePath].fragmentIds).toContain(fragment.id);if(e.start>=0)expect(source.text.slice(e.start,e.end)).toBe(e.quote);else expect(hasReadableQuote(source,e.quote)).toBe(true);}
 for(const[j,button]of actions(card).filter(n=>n.className==='tb-source').entries()){button.fire('click');await operations.at(-1);expect(opened.at(-1)).toBe(fragment.evidence[j].relativePath);if(ext==='md')expect(selected.at(-1)).toBe(fragment.evidence[j].quote);}
 actions(card).find(n=>n.textContent===t.openFragment)!.fire('click');await operations.at(-1);const target=await f.store.fragmentPath(fragment.id);expect(opened.at(-1)).toBe(target);const text=await fs.readFile(path.join(f.root,target),'utf8');expect(text).toContain(condition);expect(text).toContain(counter);old.push(card);
 }
 const opposite=Object.values(index.fragments).find(v=>v.summary.includes(s.point)&&v.summary.includes(s.opposite))!;expect(opposite).toBeDefined();expect(opposite.summary).toContain(s.otherCounter);expect(opposite.privacy).toBe('local');expect(opposite.evidence.every(e=>e.relativePath==='opposed.'+ext)).toBe(true);
 expect(await search('unmatchedzxqv galactic tax')).toEqual([]);const before=await f.targets();await f.c.refresh();await f.unchanged(before);await f.protect();
 const refuse=async()=>{const n=opened.length;for(const card of old)for(const button of actions(card)){button.fire('click');await expect(operations.at(-1)).rejects.toThrow();}expect(opened).toHaveLength(n);};
 f.settings.excludes.push('copy.'+ext);await refuse();f.settings.excludes.pop();const name='copy.'+ext,raw=f.originals.get(name)!.raw;await f.put(name,raw.replace(s.condition,s.condition+' Synthetic changed qualifier.'));await refuse();expect((await f.c.find(s.query,'medium')).every(r=>!r.fragment.evidence.some(e=>e.relativePath===name))).toBe(true);await f.unchanged(before);await f.put(name,raw);await f.c.refresh();await f.unchanged(before);await f.protect();
 const inventory=(await fs.readdir(path.join(f.root,'Derived'),{recursive:true,withFileTypes:true})).filter(n=>n.isFile()).map(n=>path.relative(path.join(f.root,'Derived'),path.join(n.parentPath,n.name)).replace(/\\/gu,'/'));expect(inventory.filter(n=>n.startsWith('.third-brain/')).sort()).toEqual(['.third-brain/marker.json','.third-brain/state.json']);expect(inventory).toHaveLength(Object.keys(index.fragments).length+3);
 }finally{await Promise.allSettled([...queries,...operations]);dispose?.();f.c.dispose();}
});
it.each(['md','canvas'])('actual %s overflow/hidden, cooperative cancel and human edit retain old bytes; repair is idempotent',async ext=>{
 const f=await fixture(ext);try{await f.c.initialize();await f.c.refresh();const before=await f.targets(),commit=vi.spyOn(f.store,'commit'),name='a.'+ext,raw=f.originals.get(name)!.raw;
 for(const bad of [f.s.condition+'\n\n'+'合'.repeat(16384)+'\n\n'+f.s.counter,f.s.condition+' <!-- hidden -->\n\n'+f.s.point+'\n\n'+f.s.counter]){await f.put(name,encode(bad,ext));await expect(f.c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();await f.unchanged(before);await f.put(name,raw);await f.c.refresh();await f.unchanged(before);commit.mockClear();}
 const list=f.sources.list.bind(f.sources);let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>{enter=r;}),latch=new Promise<void>(r=>{release=r;});vi.spyOn(f.sources,'list').mockImplementationOnce(async o=>{enter();await latch;return list(o);});const pending=f.c.refresh();await entered;f.c.cancel();release();await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(commit).not.toHaveBeenCalled();await f.unchanged(before);await f.c.refresh();await f.unchanged(before);
 const target=before.find(v=>v.n.includes('fragment-'))!;await fs.writeFile(path.join(f.root,target.n),Buffer.concat([target.bytes,Buffer.from('\nSynthetic human amendment.')]));await expect(f.c.refresh()).rejects.toThrow();expect(await fs.readFile(path.join(f.root,target.n),'utf8')).toContain('Synthetic human amendment.');expect(await fs.readFile(path.join(f.root,before[0].n))).toEqual(before[0].bytes);await fs.writeFile(path.join(f.root,target.n),target.bytes);await f.c.initialize();await f.c.refresh();const repaired=await f.targets();await f.c.refresh();await f.unchanged(repaired);await f.protect();
 }finally{f.c.dispose();}
});
it('actual store accepts 256 complete prose quotations, refuses 257 before commit and permits a repaired retry',async()=>{
 const f=await fixture('md','en',false);try{const raw=['Conditions: Only inert paper replicas.','A blue paper hinge holds the replica open.',...Array.from({length:254},(_,i)=>'Example: Synthetic pad '+i+'.')].join('\n\n');for(const n of ['a.md','copy.md','opposed.md'])await f.put(n,n==='a.md'?raw:'');await f.c.initialize();await f.c.refresh();const index=(await f.store.load())!;expect(Object.values(index.fragments)).toHaveLength(1);expect(Object.values(index.fragments)[0].evidence).toHaveLength(256);const before=await f.targets(),commit=vi.spyOn(f.store,'commit');await f.put('a.md',raw+'\n\nExample: Synthetic overflow pad.');await expect(f.c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();await f.unchanged(before);await f.put('a.md',raw);await f.c.refresh();await f.unchanged(before);await f.protect();}finally{f.c.dispose();}
});
