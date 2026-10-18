// SPDX-License-Identifier: MIT
// Authored synthetic hierarchy/dedup regressions; not AI semantic grading or native clicks.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect,it,vi } from 'vitest';
import { analyzeSource,buildIndex,emptyIndex,prepareSource } from '../src/core/index';
import { hasReadableQuote } from '../src/core/sources';
import { canonicalText,digest } from '../src/core/util';
import { CANVAS_OFFSET_CAVEAT,fragmentId } from '../src/core/fragments';
import type { ModelRequest } from '../src/core/types';
import { ThirdBrainController } from '../src/controller';
import { FileSources,hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults,generationSignature } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
const legacy=JSON.parse(await fs.readFile('tests/fixtures/local-structure-legacy.json','utf8'));
const raws:Record<string,string>=legacy.raws;
const point='Seal the cobalt vial.';
const opts={mode:'local-excerpts' as const,cloudConsent:false,now:'2026-01-01T00:00:00.000Z'};
const wrap=(text:string,format:string)=>format.endsWith('canvas')?JSON.stringify({nodes:[{type:'text',text:'---\nprivacy: private\n---\n'+text}],edges:[]}):text;
const source=(text:string,name:string)=>prepareSource(name,text,hash(text),hash(name).slice(0,24));

it.each(['md','canvas','quoted-md','quoted-canvas'])('%s retains distinct authored scope when only list indentation differs, while complete copies still merge',async format=>{
  const inputs=Object.entries(raws).map(([n,t])=>{if(format.startsWith('quoted')){const [heading,...lines]=t.split('\n');t=heading+'\n'+lines.map(line=>'> '+line).join('\n');}return source(wrap(t,format),n.replace(/md$/u,format.endsWith('canvas')?'canvas':'md'));});
  const index=await buildIndex(inputs,{...opts,signature:generationSignature({...defaults,outputFolder:'Derived'}),previous:emptyIndex()});
  const targets=Object.values(index.fragments).filter(f=>f.summary.includes(point));
  expect(targets).toHaveLength(2);expect(Object.keys(index.fragments)).toHaveLength(4);
  expect(new Set(targets.map(f=>canonicalText(f.summary))).size).toBe(1);
  expect(new Set(targets.map(f=>f.id)).size).toBe(2);
  const shared=targets.find(f=>f.evidence.some(e=>e.relativePath.startsWith('copy.')))!;
  expect(new Set(shared.evidence.map(e=>e.relativePath)).size).toBe(2);
  for(const f of targets){expect(f.localContext).toContain('Cool the synthetic tray.');for(const e of f.evidence){const s=inputs.find(s=>s.path===e.relativePath)!;if(e.start>=0)expect(s.text.slice(e.start,e.end)).toBe(e.quote);else expect(hasReadableQuote(s,e.quote)).toBe(true);}}
});

it.each(['numbered','task','plain-parent'])('%s whole groups also retain indentation in local identity, not only focused cards',async kind=>{
  const adjust=(t:string)=>kind==='numbered'?t.replace('  - Handle','  1. Handle').replace('  - Cool','  2. Cool'):kind==='task'?t.replace('  - Handle','  - [ ] Handle'):t.replace('experiment:','experiment.');
  const inputs=[source(adjust(raws['a.md']),'a.md'),source(adjust(raws['b.md']),'b.md')];
  const index=await buildIndex(inputs,{...opts,signature:generationSignature(defaults),previous:emptyIndex()});
  expect(Object.values(index.fragments)).toHaveLength(2);expect(Object.values(index.fragments).every(f=>f.localContext===undefined)).toBe(true);
});

it('preserves newline-versus-space boundaries in local prose and merges line-ending-only copies',async()=>{
  const a='Only the offline synthetic bench:\nSeal the cobalt vial.',b=a.replace('\n',' ');
  const inputs=[source(a,'a.md'),source(a.replace(/\n/gu,'\r\n'),'copy.md'),source(b,'b.md')];
  const index=await buildIndex(inputs,{...opts,signature:generationSignature(defaults),previous:emptyIndex()});
  expect(Object.values(index.fragments)).toHaveLength(2);
  expect(Object.values(index.fragments).some(f=>new Set(f.evidence.map(e=>e.relativePath)).size===2)).toBe(true);
});

it('changes only local generation/identity; exact AI request bodies and generation signatures stay unchanged',async()=>{
  expect(generationSignature({...defaults,outputFolder:'Derived'})).not.toBe(legacy.signatures['local-excerpts']);
  for(const mode of ['local-model','cloud-model'] as const){expect(generationSignature({...defaults,outputFolder:'Derived',mode})).toBe(legacy.signatures[mode]);const requests:ModelRequest[]=[];await analyzeSource(source(raws['a.md'],'a.md'),{mode,cloudConsent:true,model:{request:async r=>{requests.push(r);return{version:1,decision:'insufficient-context',fragments:[]};}}});expect(requests).toEqual(legacy.requests[mode]);}
});

it('retains the exact AI identity algorithm',async()=>{
  const f=(await analyzeSource(source(raws['a.md'],'a.md'),opts)).fragments[0];
  const ai={...f,mode:'ai' as const};delete ai.localContext;
  const oldBody=[canonicalText(ai.summary),ai.kind,ai.conditions.map(canonicalText).sort(),ai.caveats.filter(v=>v!==CANVAS_OFFSET_CAVEAT).map(canonicalText).sort()];
  expect(fragmentId(ai)).toBe('f_'+digest(JSON.stringify(oldBody)));

});

async function fixture(format:string){
  const scope=path.resolve('.local/local-structure');await fs.mkdir(scope,{recursive:true});const root=await fs.mkdtemp(path.join(scope,format+'-'));
  const expected=new Map<string,{text:string,mtime:string}>();const put=async(n:string,t:string)=>{await fs.writeFile(path.join(root,n),t);expected.set(n,{text:t,mtime:(await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()});};
  for(const[n,t]of Object.entries(raws))await put(n.replace(/md$/u,format),wrap(t,format));
  await fs.mkdir(path.join(root,'Derived'));await fs.writeFile(path.join(root,'Derived/manual.txt'),'Synthetic human-owned text.');
  const settings={...defaults,outputFolder:'Derived',excludes:[] as string[]},store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths());
  const request=vi.fn(async()=>{throw Error('Forbidden model request');}),c=new ThirdBrainController(sources,store,()=>settings,()=>({request}),async()=>{});
  const originals=async()=>{for(const[n,v]of expected){expect(await fs.readFile(path.join(root,n),'utf8')).toBe(v.text);expect((await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()).toBe(v.mtime);}expect(await fs.readFile(path.join(root,'Derived/manual.txt'),'utf8')).toBe('Synthetic human-owned text.');expect(request).not.toHaveBeenCalled();};
  return{root,settings,store,sources,c,put,originals};
}

it('actual store rejects a forged contextual identity without committing or changing originals',async()=>{
  const f=await fixture('md');try{
    await f.c.initialize();await f.c.refresh();const index=(await f.store.load())!,bad=structuredClone(index),oldId=Object.keys(bad.fragments).find(id=>bad.fragments[id].localContext)!;
    const badId='f_'+'0'.repeat(64),fragment=bad.fragments[oldId];delete bad.fragments[oldId];bad.fragments[badId]={...fragment,id:badId};
    for(const record of Object.values(bad.sources))record.fragmentIds=record.fragmentIds.map(id=>id===oldId?badId:id).sort();
    const statePath=path.join(f.root,'Derived/.third-brain/state.json'),bytes=await fs.readFile(statePath);
    await expect(f.store.commit(bad)).rejects.toThrow('Invalid contextual fragment identity');expect(await fs.readFile(statePath)).toEqual(bytes);expect(await f.store.load()).toEqual(index);await f.originals();
  }finally{f.c.dispose();}
});

it('actual old file store retains exact old bytes, upgrades both distinct hierarchies once, strictly reloads and stays byte-idempotent',async()=>{
  const f=await fixture('md');try{
    const snapshots=await f.sources.list();await f.store.commit(structuredClone(legacy.oldIndex),()=>f.sources.verify(snapshots));const marker=JSON.parse(await fs.readFile(path.join(f.root,'Derived/.third-brain/marker.json'),'utf8')),oldFiles:Buffer[]=[];
    for(const id of Object.keys(legacy.oldIndex.fragments)){const bytes=await fs.readFile(path.join(f.root,await f.store.fragmentPath(id)));expect(bytes.toString().replaceAll(marker.storeId,'SYNTHETIC_STORE_ID')).toBe(legacy.rendered[id]);oldFiles.push(bytes);}
    await f.c.initialize();expect((await f.store.load())!).toEqual(legacy.oldIndex);await f.c.refresh();await f.c.initialize();const index=(await f.store.load())!;expect(Object.keys(index.fragments)).toHaveLength(4);const found=await f.c.find('seal cobalt vial','medium');expect(found).toHaveLength(2);for(const r of found){for(const e of r.fragment.evidence)await f.c.verifyOpen(e);await f.c.verifyFragmentOpen(r.fragment.id);}
    const statePath=path.join(f.root,'Derived/.third-brain/state.json'),state=await fs.readFile(statePath);await f.c.refresh();expect(await fs.readFile(statePath)).toEqual(state);expect(await f.store.load()).toEqual(index);
    const entries=await fs.readdir(path.join(f.root,'Derived/.third-brain/history'),{recursive:true,withFileTypes:true}),backups=await Promise.all(entries.filter(e=>e.isFile()).map(e=>fs.readFile(path.join(e.parentPath,e.name))));for(const bytes of oldFiles)expect(backups.some(b=>b.equals(bytes))).toBe(true);await f.originals();
  }finally{f.c.dispose();}
});

class Node{
  className='';textContent='';value='';hidden=false;disabled=false;children:Node[]=[];handlers=new Map<string,(()=>void)[]>();constructor(readonly tag:string){}append(...ns:Node[]){this.children.push(...ns);}replaceChildren(...ns:Node[]){this.children=ns;}setAttribute(){}remove(){}focus(){}get childElementCount(){return this.children.length;}addEventListener(k:string,fn:()=>void){this.handlers.set(k,[...this.handlers.get(k)??[],fn]);}fire(k:string){for(const fn of this.handlers.get(k)??[])fn();}all():Node[]{return[this,...this.children.flatMap(n=>n.all())];}text():string{return[this.textContent,...this.children.map(n=>n.text())].join('\n');}
}
it.each([['md','en'],['md','zh'],['canvas','en'],['canvas','zh']]as const)('actual %s/%s panel search shows both hierarchies and opens every original/generated fragment',async(format,locale)=>{
  const f=await fixture(format);let dispose:(()=>void)|undefined,pending:Promise<unknown>|undefined;try{
    await f.c.initialize();await f.c.refresh();await f.c.initialize();vi.stubGlobal('document',{createElement:(t:string)=>new Node(t)});const container=new Node('main'),opens:Promise<void>[]=[],generated:Promise<string>[]=[];
    dispose=mountPanel(container as unknown as HTMLElement,{status:()=>f.c.status(),subscribe:h=>f.c.subscribe(h),refresh:()=>f.c.refresh(),cancel:()=>f.c.cancel(),find:(...a)=>{pending=f.c.find(...a);return pending as ReturnType<ThirdBrainController['find']>;},open:e=>{const p=f.c.verifyOpen(e);opens.push(p);return p;},openFragment:id=>{const p=f.c.verifyFragmentOpen(id).then(()=>f.store.fragmentPath(id));generated.push(p);return p.then(()=>{});}},locale);
    const input=container.all().find(n=>n.className==='tb-idea')!;input.value='seal cobalt vial';input.fire('input');container.all().find(n=>n.tag==='button'&&n.textContent===messages(locale).find)!.fire('click');const found=await pending as Awaited<ReturnType<ThirdBrainController['find']>>;await Promise.resolve();const cards=container.all().filter(n=>n.className==='tb-result');expect(cards).toHaveLength(2);expect(found).toHaveLength(2);expect(new Set(cards.map(n=>n.all().find(n=>n.className==='tb-fragment')!.text())).size).toBe(2);
    for(const card of cards){expect(card.text()).toContain(messages(locale).excerpt);for(const b of card.all().filter(n=>n.className==='tb-source')){b.fire('click');await opens.at(-1);}card.all().find(n=>n.tag==='button'&&n.textContent===messages(locale).openFragment)!.fire('click');await generated.at(-1);}expect(opens).toHaveLength(found.reduce((n,r)=>n+r.fragment.evidence.length,0));expect(generated).toHaveLength(2);await f.originals();
  }finally{await pending?.catch(()=>{});dispose?.();f.c.dispose();vi.unstubAllGlobals();}
});

it.each(['md','canvas'])('actual %s indentation edit reconciles merged donor membership, rejects old evidence, and cancels/retries without human-file loss',async format=>{
  const f=await fixture(format);try{
    await f.c.initialize();await f.c.refresh();const old=await f.c.find('seal cobalt vial','medium');expect(old).toHaveLength(2);const merged=old.find(r=>new Set(r.fragment.evidence.map(e=>e.relativePath)).size===2)!;const statePath=path.join(f.root,'Derived/.third-brain/state.json'),state=await fs.readFile(statePath);
    await f.put('copy.'+format,wrap(raws['b.md'],format));for(const e of merged.fragment.evidence)await expect(f.c.verifyOpen(e)).rejects.toThrow();await expect(f.c.verifyFragmentOpen(merged.fragment.id)).rejects.toThrow();
    const list=f.sources.list.bind(f.sources);let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>{enter=r;}),latch=new Promise<void>(r=>{release=r;});vi.spyOn(f.sources,'list').mockImplementationOnce(async o=>{enter();await latch;return list(o);});const commit=vi.spyOn(f.store,'commit');const cancelled=f.c.refresh();await entered;f.c.cancel();release();await expect(cancelled).rejects.toMatchObject({name:'AbortError'});expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(state);
    await f.c.refresh();await f.c.initialize();const fresh=await f.c.find('seal cobalt vial','medium');expect(fresh).toHaveLength(2);expect(fresh.some(r=>r.fragment.evidence.every(e=>e.relativePath!=='a.'+format)&&new Set(r.fragment.evidence.map(e=>e.relativePath)).size===2)).toBe(true);
    for(const r of fresh){for(const e of r.fragment.evidence)await f.c.verifyOpen(e);await f.c.verifyFragmentOpen(r.fragment.id);}const saved=await fs.readFile(statePath);await f.c.refresh();expect(await fs.readFile(statePath)).toEqual(saved);
    const file=path.join(f.root,await f.store.fragmentPath(fresh[0].fragment.id)),bytes=await fs.readFile(file);await fs.writeFile(file,Buffer.concat([bytes,Buffer.from('\nSynthetic human amendment.')]));await expect(f.c.refresh()).rejects.toThrow();expect(await fs.readFile(statePath)).toEqual(saved);expect(await fs.readFile(file,'utf8')).toContain('Synthetic human amendment.');await f.originals();
  }finally{f.c.dispose();vi.restoreAllMocks();}
});
