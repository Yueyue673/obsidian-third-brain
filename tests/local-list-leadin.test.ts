// SPDX-License-Identifier: MIT
// Authored synthetic list introductions; offline protocol capture is not semantic/model evidence.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { analyzeSource, buildIndex, prepareSource } from '../src/core';
import { hasReadableQuote } from '../src/core/sources';
import type { Evidence, IndexState, ModelRequest } from '../src/core/types';
import { sourceDiagnostic } from '../src/core/source-diagnostics';
import { ThirdBrainController } from '../src/controller';
import { FileSources, currentEvidence, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
const legacy=JSON.parse(await fs.readFile('tests/fixtures/local-list-leadin-legacy.json','utf8'));
const opts={mode:'local-excerpts' as const,cloudConsent:false,now:'2026-01-01T00:00:00.000Z'};
const snap=(raw:string,name='synthetic.md')=>prepareSource(name,raw,hash(raw),hash(name).slice(0,24));
const canvas=(raw:string,extra='')=>JSON.stringify({nodes:[{type:'text',text:raw},...(extra?[{type:'text',text:extra}]:[])],edges:[]});

it.each(['md','canvas'])('%s keeps explicit colon lead-ins with every root group; opposing introductions never collapse',async extension=>{
 const inputs=Object.entries(legacy.raws as Record<string,string>).map(([n,r])=>snap(extension==='md'?r:canvas(r),n.replace('.md','.'+extension)));
 const index=await buildIndex(inputs,{...opts,previous:null,signature:generationSignature(defaults)});
 const fragments=Object.values(index.fragments);
 expect(fragments).toHaveLength(2);
 const allowed=fragments.find(f=>f.summary.includes(legacy.lead))!,forbidden=fragments.find(f=>f.summary.includes(legacy.opposite))!;
 expect(allowed.summary).toContain(legacy.body);expect(forbidden.summary).toContain(legacy.body);expect(allowed.id).not.toBe(forbidden.id);
 expect(new Set(allowed.evidence.map(e=>e.relativePath)).size).toBe(2);expect(new Set(forbidden.evidence.map(e=>e.relativePath)).size).toBe(1);
 for(const f of fragments)for(const p of new Set(f.evidence.map(e=>e.relativePath))){
  const source=inputs.find(s=>s.path===p)!;const evidence=f.evidence.filter(e=>e.relativePath===p);
  expect(evidence.some(e=>e.quote===legacy.lead||e.quote===legacy.opposite)).toBe(true);
  const port={read:async()=>source,list:async()=>[source],verify:async()=>{},excluded:async()=>new Set<string>()};expect(await currentEvidence(evidence,port)).toEqual(evidence);
  for(const e of evidence)if(e.start>=0)expect(source.text.slice(e.start,e.end)).toBe(e.quote);else expect(hasReadableQuote(source,e.quote)).toBe(true);
 }
});

it.each([':', '：'])('retains a multi-line %s introduction for loose ordered sequences and independent unordered roots',async colon=>{
 const lead='仅在断开连接的合成模拟器中\n且隔离真实设备时才允许'+colon;
 const first='1. 将合成赭石旋钮调到四档。\n   - 例子：离线沙盒。\n   - 反例：真实设备不适用。';
 const second='2. 检查合成白银测试灯。';
 for(const ordered of [true,false]){
  const a=ordered?first:first.replace(/^1\./u,'-'),b=ordered?second:second.replace(/^2\./u,'-');
  const raw=lead+'\n\n'+a+'\n\n'+b+'\n\n独立蓝鲸笔记按日期整理。';
  const r=await analyzeSource(snap(raw),opts);
  const actions=r.fragments.filter(f=>f.summary.includes('旋钮')||f.summary.includes('测试灯'));
  expect(actions).toHaveLength(ordered?1:2);for(const f of actions){expect(f.summary).toContain(lead);for(const e of f.evidence)expect(raw.slice(e.start,e.end)).toBe(e.quote);}
  if(ordered)expect(actions[0].summary).toBe(lead+'\n\n'+a+'\n\n'+b);
  else expect(actions.find(f=>f.summary.includes('旋钮'))!.summary).not.toContain('测试灯');
  expect(r.fragments.find(f=>f.summary.includes('独立蓝鲸'))!.summary).toBe('独立蓝鲸笔记按日期整理。');
  expect(actions.some(f=>f.summary.includes('反例'))).toBe(true);
 }
});

it('ends lead-in scope at ordinary prose, a new heading, code/hidden boundaries or a Canvas node; ordinary literal examples survive',async()=>{
 const lead='Only in the synthetic offline simulator:';
 for(const boundary of ['Independent prose without an introduction.\n\n','# Independent section\n','```\nSynthetic code.\n```\n','<!-- Synthetic hidden comment. -->\n','%% Synthetic hidden comment. %%\n','---\n']){
  const r=await analyzeSource(snap(lead+'\n\n'+boundary+'- Independent synthetic amber action.'),opts);
  expect(r.fragments.find(f=>f.summary.includes('amber action'))!.summary).not.toContain(lead);
 }
 const ordinary='Literal `<!--` and `%%` syntax examples remain ordinary prose.';
 const parsed=await analyzeSource(snap('- Previous synthetic root.\n\n'+ordinary+'\n\n- Independent next root.'),opts);
 expect(parsed.fragments.some(f=>f.summary===ordinary)).toBe(true);
 const nodes=await analyzeSource(snap(canvas(lead,'- Independent synthetic blue action.'),'synthetic.canvas'),opts);
 expect(nodes.fragments.find(f=>f.summary.includes('blue action'))!.summary).not.toContain(lead);
 const noColon=await analyzeSource(snap('An independent synthetic observation.\n\n- Independent synthetic action.'),opts);
 expect(noColon.fragments.find(f=>f.summary.includes('- Independent'))!.summary).not.toContain('observation');
});

it.each(['<!-- hidden -->','%% hidden %%'])('refuses a hidden-marker %s introduction instead of dropping it and exposing bare actions',async marker=>{
 await expect(analyzeSource(snap('Only '+marker+' in the synthetic simulator:\n\n- Rotate the synthetic amber ring.'),opts)).rejects.toThrow();
});

it('keeps >1400-unit introductions whole and counts headings/introduction/body in the existing 16384 limit',async()=>{
 const lead='Only in the offline synthetic simulator '+ 'with isolated synthetic fixtures '.repeat(55)+':';
 const r=await analyzeSource(snap(lead+'\n\n- Rotate the synthetic amber ring.'),opts);
 expect(r.fragments).toHaveLength(1);expect(r.fragments[0].summary).toContain(lead);
 const prefix='# Synthetic scope\n\nOnly in the synthetic simulator:\n\n';
 const raw=prefix+'- '+'合'.repeat(16384-prefix.length-2);
 expect((await analyzeSource(snap(raw),opts)).fragments[0].summary).toBe(raw);
 let failure:unknown;try{await analyzeSource(snap(raw+'尾'),opts)}catch(e){failure=e}
 expect(sourceDiagnostic(failure)).toEqual({relativePath:'synthetic.md',stage:'analysis',reason:'local-context-size-limit'});
});

it('versions only local caches and preserves existing AI primary text/background and signatures exactly (offline only)',async()=>{
 expect(generationSignature({...defaults,outputFolder:'Derived'})).not.toBe(legacy.signatures['local-excerpts']);
 for(const mode of ['local-model','cloud-model'] as const){
  expect(generationSignature({...defaults,outputFolder:'Derived',mode})).toBe(legacy.signatures[mode]);
  const requests:ModelRequest[]=[];
  await analyzeSource(snap(legacy.raws['a.md'],'a.md'),{mode,cloudConsent:true,model:{request:async r=>{requests.push(r);return{version:1,decision:'insufficient-context',fragments:[]}}}});
  expect(requests).toEqual(legacy.requests[mode]);
 }
});

class N{
 className='';textContent='';value='';hidden=false;disabled=false;children:N[]=[];handlers=new Map<string,(()=>void)[]>();
 constructor(readonly tag:string){}append(...n:N[]){this.children.push(...n)}replaceChildren(...n:N[]){this.children=n}setAttribute(){}remove(){}focus(){}get childElementCount(){return this.children.length}
 addEventListener(k:string,h:()=>void){this.handlers.set(k,[...this.handlers.get(k)??[],h])}fire(k:string){for(const h of this.handlers.get(k)??[])h()}all():N[]{return[this,...this.children.flatMap(n=>n.all())]}text():string{return[this.textContent,...this.children.map(n=>n.text())].join('\n')}
}

it.each(['md','canvas'])('actual %s files → controller → strict reload → bilingual panel → originals; cache upgrade, stale merged donors, cancel/retry and human edits',async extension=>{
 const scope=path.resolve('.local/local-list-leadin');await fs.mkdir(scope,{recursive:true});const root=await fs.mkdtemp(path.join(scope,'vault-'));
 const raws=Object.fromEntries(Object.entries(legacy.raws as Record<string,string>).map(([n,r])=>[n.replace('.md','.'+extension),extension==='md'?r:canvas('---\nprivacy: private\n---\n'+r)]));
 const mtimes=new Map<string,string>();for(const[n,r]of Object.entries(raws)){await fs.writeFile(path.join(root,n),r);mtimes.set(n,(await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString())}
 await fs.mkdir(path.join(root,'Derived'));await fs.writeFile(path.join(root,'Derived/manual.txt'),'Synthetic human-owned material.');
 const settings={...defaults,outputFolder:'Derived',excludes:[] as string[]};const store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths());
 let oldPath:string|undefined;
 if(extension==='md'){const old:IndexState=structuredClone(legacy.old);const inputs=await sources.list();await store.commit(old,()=>sources.verify(inputs));const bare=Object.values(old.fragments).find(f=>f.summary.includes(legacy.body))!;oldPath=path.join(root,await store.fragmentPath(bare.id))}
 const model=vi.fn(async()=>{throw Error('Forbidden model request')});const c=new ThirdBrainController(sources,store,()=>settings,()=>({request:model}),async()=>{});
 let dispose:(()=>void)|undefined,pending:Promise<unknown>|undefined;
 try{
  await c.initialize();await c.refresh();const next=(await store.load())!;expect(Object.values(next.fragments)).toHaveLength(2);
  if(oldPath){expect(next.signature).not.toBe(legacy.old.signature);await expect(fs.stat(oldPath)).rejects.toMatchObject({code:'ENOENT'})}
  const statePath=path.join(root,'Derived/.third-brain/state.json'),state=await fs.readFile(statePath);await c.initialize();await c.refresh();expect(await fs.readFile(statePath)).toEqual(state);expect(await store.load()).toEqual(next);
  let oldEvidence:Evidence[]=[];let verifiedActions=0;
  for(const locale of ['en','zh'] as const){
   vi.stubGlobal('document',{createElement:(tag:string)=>new N(tag)});const container=new N('main'),opens:Promise<void>[]=[];
   dispose=mountPanel(container as unknown as HTMLElement,{status:()=>c.status(),subscribe:f=>c.subscribe(f),refresh:()=>c.refresh(),cancel:()=>c.cancel(),find:(...args)=>{pending=c.find(...args);return pending as ReturnType<ThirdBrainController['find']>},open:e=>{const p=c.verifyOpen(e);opens.push(p);return p}},locale);
   const input=container.all().find(n=>n.className==='tb-idea')!;input.value='amber calibration ring';input.fire('input');container.all().find(n=>n.tag==='button'&&n.textContent===messages(locale).find)!.fire('click');
   const results=await pending as Awaited<ReturnType<ThirdBrainController['find']>>;await Promise.resolve();expect(results).toHaveLength(2);oldEvidence=results.flatMap(r=>r.fragment.evidence);
   const cards=container.all().filter(n=>n.className==='tb-result');expect(cards).toHaveLength(2);expect(cards.some(n=>n.text().includes(legacy.lead))).toBe(true);expect(cards.some(n=>n.text().includes(legacy.opposite))).toBe(true);
   for(const card of cards){expect(card.text()).toContain(messages(locale).excerpt);for(const b of card.all().filter(n=>n.className==='tb-source')){b.fire('click');await opens.at(-1)}}await Promise.all(opens);verifiedActions+=opens.length;
   dispose();dispose=undefined;vi.unstubAllGlobals();
  }
  for(const[n,r]of Object.entries(raws)){expect(hash(await fs.readFile(path.join(root,n)))).toBe(hash(r));expect((await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()).toBe(mtimes.get(n))}
  const allowed=Object.values(next.fragments).find(f=>f.summary.includes(legacy.lead))!;const evidence=oldEvidence.filter(e=>allowed.evidence.some(a=>a.relativePath===e.relativePath));expect(evidence).toHaveLength(allowed.evidence.length);
  const name='a.'+extension;await fs.writeFile(path.join(root,name),raws[name].replace(legacy.lead,legacy.opposite));for(const e of evidence)await expect(c.verifyOpen(e)).rejects.toThrow();
  expect((await c.find('amber calibration ring','medium')).some(r=>r.fragment.id===allowed.id)).toBe(false);
  await fs.writeFile(path.join(root,name),raws[name]);settings.excludes.push(name);for(const e of evidence)await expect(c.verifyOpen(e)).rejects.toThrow();settings.excludes.pop();for(const e of evidence)await c.verifyOpen(e);
  const commit=vi.spyOn(store,'commit');const oversized='Only '+ '合'.repeat(16384)+':\n\n- Synthetic amber ring.';
  await fs.writeFile(path.join(root,name),extension==='md'?oversized:canvas(oversized));await expect(c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(state);
  await fs.writeFile(path.join(root,name),raws[name]);await c.refresh();expect(await fs.readFile(statePath)).toEqual(state);
  const list=sources.list.bind(sources);let release!:()=>void,entered!:()=>void;const started=new Promise<void>(r=>{entered=r}),latch=new Promise<void>(r=>{release=r});
  vi.spyOn(sources,'list').mockImplementationOnce(async options=>{entered();await latch;return list(options)});commit.mockClear();const refresh=c.refresh();await started;c.cancel();release();await expect(refresh).rejects.toMatchObject({name:'AbortError'});expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(state);await c.refresh();expect(await fs.readFile(statePath)).toEqual(state);
  const generated=path.join(root,await store.fragmentPath(allowed.id)),bytes=await fs.readFile(generated);await fs.writeFile(generated,Buffer.concat([bytes,Buffer.from('\nSynthetic human amendment.')]));await expect(c.refresh()).rejects.toThrow();expect(await fs.readFile(generated,'utf8')).toContain('Synthetic human amendment.');expect(await fs.readFile(statePath)).toEqual(state);
  await fs.writeFile(generated,bytes);await c.initialize();await c.refresh();expect(await fs.readFile(statePath)).toEqual(state);
  for(const[n,r]of Object.entries(raws))expect(await fs.readFile(path.join(root,n),'utf8')).toBe(r);
  for(const n of Object.keys(raws).filter(n=>n!==name))expect((await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()).toBe(mtimes.get(n));expect(await fs.readFile(path.join(root,'Derived/manual.txt'),'utf8')).toBe('Synthetic human-owned material.');expect(model).not.toHaveBeenCalled();
  await fs.writeFile(path.join(scope,extension+'-receipt.json'),JSON.stringify({strictReload:true,opposingIntroductions:2,verifiedActions,legacyUpgrade:extension==='md',idempotentStateBytes:true,realModelRequests:0,nativeHost:false},null,2));
 }finally{await pending?.catch(()=>{});dispose?.();c.dispose();vi.unstubAllGlobals();vi.restoreAllMocks()}
});

it('counts the lead-in inside the unchanged Canvas 256-quotation bound before commit',async()=>{
 const encode=(children:number)=>canvas('# Synthetic calibration\nOnly in a disconnected synthetic simulator:\n\n- Calibration instructions:\n'+Array.from({length:children},(_,i)=>'  - Synthetic amber step '+i+'.').join('\n'));
 const scope=path.resolve('.local/local-list-leadin');await fs.mkdir(scope,{recursive:true});const root=await fs.mkdtemp(path.join(scope,'limit-'));const original=path.join(root,'source.canvas');await fs.writeFile(original,encode(253));
 const settings={...defaults,outputFolder:'Derived',excludes:[]};const store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths());const c=new ThirdBrainController(sources,store,()=>settings,()=>undefined,async()=>{});
 try{await c.initialize();await c.refresh();const index=(await store.load())!;const f=Object.values(index.fragments)[0];expect(Object.values(index.fragments)).toHaveLength(1);expect(f.evidence).toHaveLength(256);expect(f.summary).toContain('Only in a disconnected');expect(await currentEvidence(f.evidence,sources)).toEqual(f.evidence);
 for(const e of [f.evidence[0],f.evidence.at(-1)!])await c.verifyOpen(e);const statePath=path.join(root,'Derived/.third-brain/state.json'),state=await fs.readFile(statePath);await c.refresh();expect(await fs.readFile(statePath)).toEqual(state);
 const commit=vi.spyOn(store,'commit');await fs.writeFile(original,encode(254));await expect(c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(state);await fs.writeFile(original,encode(253));await c.refresh();expect(await fs.readFile(statePath)).toEqual(state);
 }finally{c.dispose();vi.restoreAllMocks()}
});
