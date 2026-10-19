// SPDX-License-Identifier: MIT
// Self-authored synthetic files; offline protocol captures, not model semantics or native host clicks.
// Bounded emphasis syntax: https://spec.commonmark.org/0.31.2/#emphasis-and-strong-emphasis
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { MarkdownView } from 'obsidian';
import ThirdBrainPlugin from '../src/main';
import { analyzeSource, buildIndex, prepareSource } from '../src/core';
import type { IndexState, ModelRequest, SearchResult } from '../src/core/types';
import { hasReadableQuote, textBlocks } from '../src/core/sources';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
vi.mock('obsidian', () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, MarkdownView: class {} }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-emphasis-legacy.json','utf8'));
const options = { mode:'local-excerpts' as const,cloudConsent:false };
const snap = (raw:string,n='synthetic.md') => prepareSource(n,raw,hash(raw),hash(n).slice(0,24));
const action = '- Adjust the synthetic cobalt vane.';
const late = 'Ivory filament ledgers retain the dry paper sleeve restriction.';
const encode = (raw:string,ext:string) => ext === 'md' ? raw : JSON.stringify({ nodes:[{ type:'text',text:'---\nprivacy: private\n---\n'+raw }],edges:[] });
const labels = ['Condition:', '*Condition*:', '**Condition:**', '_Conditions：_', '__Caveat__:', '**CAVEATS:**', '*Limitation:*', '__Limitations:__', '**条件：**', '_前提_：', '__限制：__', '**Example:**', '_Counterexample:_', '__反例：__'];
it.each(labels)('retains a following explicit %s label and its descendants with the action', async label => {
  const group = action+'\n- '+label+' only the inert synthetic rig.\n  - Check the disconnected synthetic cable.';
  const independent = '- Record the independent jade paper texture.';
  const r = await analyzeSource(snap(group+'\n'+independent),options);
  expect(r.fragments.map(f=>f.summary).sort()).toEqual([group,independent].sort());
  expect(r.fragments.find(f=>f.summary===group)!.evidence[0].quote).toBe(group);
});
it('applies emphasized shared labels to every focused point, not as a third standalone point',async()=>{
  for (const label of ['Caveat:', '**Caveat:**', '__条件__：']) {
    const raw='- Only on synthetic equipment:\n  - Adjust the cobalt vane.\n  - Observe the jade indicator.\n  - '+label+' never use powered equipment.';
    const r=await analyzeSource(snap(raw),options); expect(r.fragments).toHaveLength(2);
    for(const f of r.fragments) { expect(f.summary).toContain(label); expect(f.summary).toContain('never use powered equipment.'); expect(f.localContext).not.toContain(label); }
  }
});
it('keeps literal code, escaped/malformed/partial markers, ordinary titles and leading context independent',async()=>{
  for(const label of ['`Condition:`','\\*Condition*:', '***Condition:***', '**Condition:', '**Condition** monitoring:', 'Caveat archive:', '*Condition* monitoring:', '**Condi**tion:', '**条件**判断：']) {
    const r=await analyzeSource(snap(action+'\n- '+label+' separate synthetic observation.'),options);
    expect(r.fragments.find(f=>f.summary.includes(action))!.summary).toBe(action); expect(r.fragments).toHaveLength(2);
  }
  const r=await analyzeSource(snap('- **Condition:** standalone synthetic scope.\n'+action),options);
  expect(r.fragments).toHaveLength(2); expect(r.fragments.find(f=>f.summary.includes(action))!.summary).toBe(action);
});
it('keeps quote prefixes/newlines exact and ends attachment at real outside boundaries and Canvas nodes',async()=>{
  const group=action+'\n- **Caveat:** only the inert copper socket.';
  for(const newline of ['\n','\r\n','\r']) {
    const q=group.split('\n').map(s=>'> '+s).join(newline), r=await analyzeSource(snap(q),options);
    expect(r.fragments).toHaveLength(1); expect(r.fragments[0].summary).toBe(q);
    for(const e of r.fragments[0].evidence) expect(q.slice(e.start,e.end)).toBe(e.quote);
  }
  for(const boundary of ['\n\nIndependent synthetic prose.\n\n','\n# Outside\n','\n```\nSynthetic code.\n```\n','\n<!-- hidden -->\n']) {
    const r=await analyzeSource(snap(action+boundary+'- **Caveat:** unrelated synthetic scope.'),options);
    expect(r.fragments.find(f=>f.summary.includes(action))!.summary).toBe(action);
  }
  const r=await analyzeSource(snap(JSON.stringify({nodes:[{type:'text',text:action},{type:'text',text:'- **Caveat:** unrelated synthetic scope.'}],edges:[]}),'synthetic.canvas'),options);
  expect(r.fragments.find(f=>f.summary.includes(action))!.summary).toBe(action);
  const literal='Literal `<!--` and `%%` remain ordinary inline syntax examples.';
  expect((await analyzeSource(snap(group+'\n\n'+literal),options)).fragments.some(f=>f.summary===literal)).toBe(true);
});
it('retains long restrictions without splitting and refuses hidden/over-limit context',async()=>{
  const prefix=action+'\n- **Caveat:** ',legal=prefix+'合'.repeat(16384-prefix.length);
  expect((await analyzeSource(snap(legal),options)).fragments[0].summary).toBe(legal);
  await expect(analyzeSource(snap(legal+'尾'),options)).rejects.toThrow();
  for(const marker of ['<!-- hidden -->','%% hidden %%']) for(const raw of [action.replace('Adjust',marker+' Adjust')+'\n- **Condition:** only inert rigs.',action+'\n- **Caveat:** '+marker+' no powered rigs.']) await expect(analyzeSource(snap(raw),options)).rejects.toThrow();
});
it('changes only local generation; default AI blocks/signatures and offline requests stay unchanged',async()=>{
  expect(generationSignature({...defaults,outputFolder:'Derived',excludes:[]})).not.toBe(legacy.signatures['local-excerpts']);
  const inputs=Object.entries(legacy.raws as Record<string,string>).map(([n,r])=>snap(r,n));
  expect(inputs.map(s=>textBlocks(s))).toEqual(legacy.aiBlocks);
  for(const mode of ['local-model','cloud-model'] as const) {
    expect(generationSignature({...defaults,outputFolder:'Derived',excludes:[],mode})).toBe(legacy.signatures[mode]);
    const requests:ModelRequest[]=[];
    await analyzeSource(inputs[0],{mode,cloudConsent:true,model:{request:async r=>{requests.push(r);return {version:1,decision:'insufficient-context',fragments:[]};}}});
    expect(requests.map(r=>r.task)).toEqual(['extract','extract','extract','extract']);
    expect(requests).toEqual(legacy.requests[mode]);
  }
});
class Node {
  className='';textContent='';value='';hidden=false;disabled=false;children:Node[]=[];handlers=new Map<string,(()=>void)[]>();
  constructor(readonly tag:string){} append(...n:Node[]){this.children.push(...n);} replaceChildren(...n:Node[]){this.children=n;} setAttribute(){} remove(){} focus(){} get childElementCount(){return this.children.length;}
  addEventListener(k:string,h:()=>void){this.handlers.set(k,[...this.handlers.get(k)??[],h]);} fire(k:string){for(const h of this.handlers.get(k)??[])h();} all():Node[]{return [this,...this.children.flatMap(n=>n.all())];} text():string{return [this.textContent,...this.children.map(n=>n.text())].join('\n');}
}
async function fixture(ext:string,long=true){
  const scope=path.resolve('.local/emphasis-context');await fs.mkdir(scope,{recursive:true});const root=await fs.mkdtemp(path.join(scope,ext+'-'));
  const originals=new Map<string,{text:string;mtime:string}>();
  const put=async(n:string,text:string)=>{await fs.writeFile(path.join(root,n),text);originals.set(n,{text,mtime:(await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()});};
  for(const [n,r] of Object.entries(legacy.raws as Record<string,string>)) {
    const raw=long?'# Synthetic scope\n\n'+('The archive describes the amber paper grain. '.repeat(40)).trim()+'\n\n'+r+'\n\n'+late:r;
    if(long){expect(raw.indexOf(action)).toBeGreaterThan(1400);expect(raw.indexOf(action)).toBeGreaterThan(raw.length/2);}
    await put(n.replace('.md','.'+ext),encode(raw,ext));
  }
  await fs.mkdir(path.join(root,'Derived'));await put('Derived/manual.txt','Synthetic human-authored material.');
  const settings={...defaults,outputFolder:'Derived',excludes:[] as string[]},store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths());
  const factory=vi.fn(()=>undefined),saved=vi.fn(async()=>{}),c=new ThirdBrainController(sources,store,()=>settings,factory,saved);
  const protect=async()=>{for(const [n,v]of originals){expect(await fs.readFile(path.join(root,n),'utf8')).toBe(v.text);expect((await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()).toBe(v.mtime);}expect(factory.mock.results.every(r=>r.value===undefined)).toBe(true);};
  const targets=async()=>{const i=(await store.load())!,names=['Derived/.third-brain/state.json'];for(const id of Object.keys(i.fragments))names.push(await store.fragmentPath(id));return Promise.all(names.map(async n=>({n,bytes:await fs.readFile(path.join(root,n)),mtime:(await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()})));};
  const unchanged=async(before:Awaited<ReturnType<typeof targets>>)=>{for(const v of before){expect(await fs.readFile(path.join(root,v.n))).toEqual(v.bytes);expect((await fs.stat(path.join(root,v.n),{bigint:true})).mtimeNs.toString()).toBe(v.mtime);}};
  return {root,originals,put,settings,store,sources,c,saved,protect,targets,unchanged};
}
it('strict legacy load preserves old bytes, then upgrades opposing contexts once and reruns without writes',async()=>{
  const f=await fixture('md',false);try{
    const inputs=await f.sources.list();await f.store.commit(structuredClone(legacy.old) as IndexState,()=>f.sources.verify(inputs));
    const old=await f.targets();await f.c.initialize();expect(await f.store.load()).toEqual(legacy.old);await f.unchanged(old);
    const commit=vi.spyOn(f.store,'commit');await f.c.refresh();expect(commit).toHaveBeenCalledTimes(1);await f.c.initialize();
    const hits=await f.c.find('cobalt vane','medium');expect(hits).toHaveLength(2);expect(hits.every(r=>r.fragment.summary.includes('__Caveat__:'))).toBe(true);
    expect(new Set(hits.find(r=>r.fragment.summary.includes('inert copper socket'))!.fragment.evidence.map(e=>e.relativePath)).size).toBe(2);
    expect((await f.store.load())!.signature).not.toBe(legacy.old.signature);
    const history=await fs.readdir(path.join(f.root,'Derived/.third-brain/history'),{recursive:true,withFileTypes:true});const bodies=await Promise.all(history.filter(v=>v.isFile()).map(v=>fs.readFile(path.join(v.parentPath,v.name))));
    for(const v of old.filter(v=>v.n.includes('fragment-')))expect(bodies.some(b=>b.equals(v.bytes))).toBe(true);
    const current=await f.targets();await f.c.refresh();await f.unchanged(current);await f.protect();
  }finally{f.c.dispose();}
});
it.each([['md','en'],['md','zh'],['canvas','en'],['canvas','zh']] as const)('actual %s/%s late-note idea → strict store → Main renderer → all original/generated actions',async(ext,locale)=>{
  const f=await fixture(ext),queries:Promise<SearchResult[]>[]=[],operations:Promise<void>[]=[];let dispose:(()=>void)|undefined;
  try{
    await f.c.initialize();await f.c.refresh();await f.c.initialize();const index=(await f.store.load())!;
    const opened:string[]=[],leaf={view:Object.create(MarkdownView.prototype),openFile:async(file:{path:string})=>{opened.push(file.path);leaf.view.file=file;leaf.view.getMode=()=> 'source';leaf.view.editor={getValue:()=>f.originals.get(file.path)?.text??'',setSelection:()=>{},scrollIntoView:()=>{}};}};
    const plugin=Object.assign(Object.create(ThirdBrainPlugin.prototype),{controller:f.c,store:f.store,settings:f.settings,app:{vault:{getFileByPath:(n:string)=>({path:n,extension:path.extname(n).slice(1)})},workspace:{getLeaf:()=>leaf}}}) as ThirdBrainPlugin;
    const port=plugin.panelPort(),find=port.find.bind(port),open=port.open.bind(port),generated=port.openFragment!.bind(port);
    vi.spyOn(port,'find').mockImplementation((...a)=>{const p=find(...a);queries.push(p);return p;});vi.spyOn(port,'open').mockImplementation(e=>{const p=open(e);operations.push(p);return p;});vi.spyOn(port,'openFragment').mockImplementation((...a)=>{const p=generated(...a);operations.push(p);return p;});
    vi.stubGlobal('document',{createElement:(tag:string)=>new Node(tag)});const box=new Node('main'),t=messages(locale);dispose=mountPanel(box as unknown as HTMLElement,port,locale);
    const search=async(q:string)=>{const input=box.all().find(n=>n.className==='tb-idea')!;input.value=q;input.fire('input');box.all().find(n=>n.tag==='button'&&n.textContent===t.find)!.fire('click');const r=await queries.at(-1)!;await Promise.resolve();return r;};
    const actions=(card:Node)=>card.all().filter(n=>n.className==='tb-source'||n.tag==='button'&&n.textContent===t.openFragment);
    const hits=await search('cobalt vane');expect(hits).toHaveLength(2);const cards=box.all().filter(n=>n.className==='tb-result');expect(cards).toHaveLength(2);
    for(const [i,card]of cards.entries()){
      expect(card.text()).toContain('**Condition:**');expect(card.text()).toContain('__Caveat__:');expect(card.text()).toContain('Verify the synthetic cable is disconnected.');expect(card.text()).not.toContain(late);expect(card.text()).toContain(t.excerpt);
      expect(actions(card)).toHaveLength(hits[i].fragment.evidence.length+1);for(const b of actions(card)){b.fire('click');await operations.at(-1);}
      for(const e of hits[i].fragment.evidence){const s=(await f.sources.read(e.relativePath))!;expect(e.sourceId).toBe(s.id);expect(e.sourceHash).toBe(s.hash);expect(index.sources[e.relativePath].fragmentIds).toContain(hits[i].fragment.id);if(e.start>=0)expect(s.text.slice(e.start,e.end)).toBe(e.quote);else expect(hasReadableQuote(s,e.quote)).toBe(true);}
    }
    const old=cards.find(n=>n.text().includes('inert copper socket'))!,name='copy.'+ext,raw=f.originals.get(name)!.text;
    await f.put(name,raw.replace('inert copper socket','changed inert socket'));const count=opened.length;
    for(const b of actions(old)){b.fire('click');await expect(operations.at(-1)).rejects.toThrow();}expect(opened).toHaveLength(count);
    expect((await f.c.find('cobalt vane','medium')).some(r=>r.fragment.summary.includes('inert copper socket'))).toBe(false);
    await f.put(name,raw);f.settings.excludes.push(name);for(const b of actions(old)){b.fire('click');await expect(operations.at(-1)).rejects.toThrow();}f.settings.excludes.pop();
    const tails=await search('Ivory filament');expect(tails).toHaveLength(1);const tail=box.all().find(n=>n.className==='tb-result')!;expect(tail.text()).toContain(late);expect(tail.text()).not.toContain('**Condition:**');for(const b of actions(tail)){b.fire('click');await operations.at(-1);}
    if(ext==='canvas')expect(Object.values(index.fragments).every(f=>f.privacy==='private')).toBe(true);
    const before=await f.targets();await f.c.refresh();await f.unchanged(before);await f.protect();
    expect(opened.some(n=>n.startsWith('Derived/fragment-'))).toBe(true);expect(opened.some(n=>!n.startsWith('Derived/'))).toBe(true);
  }finally{await Promise.allSettled([...queries,...operations]);dispose?.();f.c.dispose();}
});
it.each(['md','canvas'])('actual %s failures/cancel preserve bytes with no commit/success-save; retry and human protection remain closed',async ext=>{
  const f=await fixture(ext);try{
    await f.c.initialize();await f.c.refresh();const before=await f.targets(),commit=vi.spyOn(f.store,'commit'),name='a.'+ext,raw=f.originals.get(name)!.text;f.saved.mockClear();
    for(const body of [action+'\n- **Caveat:** '+'合'.repeat(16384),action+'\n- **Caveat:** %% hidden %% no powered rigs.']){
      await f.put(name,encode(body,ext));await expect(f.c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();expect(f.saved).not.toHaveBeenCalled();await f.unchanged(before);
      await f.put(name,raw);await f.c.refresh();await f.unchanged(before);commit.mockClear();f.saved.mockClear();
    }
    const list=f.sources.list.bind(f.sources);let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>{enter=r;}),latch=new Promise<void>(r=>{release=r;});vi.spyOn(f.sources,'list').mockImplementationOnce(async o=>{enter();await latch;return list(o);});
    const pending=f.c.refresh();await entered;f.c.cancel();release();await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(commit).not.toHaveBeenCalled();expect(f.saved).not.toHaveBeenCalled();await f.unchanged(before);await f.c.refresh();await f.unchanged(before);
    const target=before.find(v=>v.n.includes('fragment-'))!;await fs.writeFile(path.join(f.root,target.n),Buffer.concat([target.bytes,Buffer.from('\nSynthetic human amendment.')]));await expect(f.c.refresh()).rejects.toThrow();expect(await fs.readFile(path.join(f.root,target.n),'utf8')).toContain('Synthetic human amendment.');expect(await fs.readFile(path.join(f.root,'Derived/.third-brain/state.json'))).toEqual(before[0].bytes);
    await fs.writeFile(path.join(f.root,target.n),target.bytes);await f.c.initialize();await f.c.refresh();const repaired=await f.targets();await f.c.refresh();await f.unchanged(repaired);await f.protect();
  }finally{f.c.dispose();}
});
