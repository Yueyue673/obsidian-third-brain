// SPDX-License-Identifier: MIT
// Authored synthetic examples. Offline protocol capture is not model/semantic evidence.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { analyzeSource, buildIndex, prepareSource } from '../src/core';
import { hasReadableQuote } from '../src/core/sources';
import { sourceDiagnostic } from '../src/core/source-diagnostics';
import type { Evidence, IndexState, ModelRequest } from '../src/core/types';
import { ThirdBrainController } from '../src/controller';
import { FileSources, currentEvidence, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
const legacy=JSON.parse(await fs.readFile('tests/fixtures/local-list-examples-legacy.json','utf8'));
const opts={mode:'local-excerpts' as const,cloudConsent:false,now:'2026-01-01T00:00:00.000Z'};
const snap=(raw:string,name='synthetic.md')=>prepareSource(name,raw,hash(raw),hash(name).slice(0,24));
const canvas=(raw:string,extra='')=>JSON.stringify({nodes:[{type:'text',text:raw},...(extra?[{type:'text',text:extra}]:[])],edges:[]});

it.each(['md','canvas'])('%s action retains following same-level labelled examples; different contexts stay distinct and complete copies merge',async extension=>{
 const inputs=Object.entries(legacy.raws as Record<string,string>).map(([n,r])=>snap(extension==='md'?r:canvas(r),n.replace('.md','.'+extension)));
 const index=await buildIndex(inputs,{...opts,previous:null,signature:generationSignature(defaults)});
 const actions=Object.values(index.fragments).filter(f=>f.summary.includes(legacy.action));expect(actions).toHaveLength(2);
 for(const f of actions){expect(f.summary).toContain(legacy.lead);expect(f.summary).toContain(legacy.example);expect(f.summary).toContain('Counterexample:');expect(f.summary).not.toContain(legacy.other);
  for(const e of f.evidence){const s=inputs.find(s=>s.path===e.relativePath)!;if(e.start>=0)expect(s.text.slice(e.start,e.end)).toBe(e.quote);else expect(hasReadableQuote(s,e.quote)).toBe(true)}
 }
 const original=actions.find(f=>f.summary.includes(legacy.counter))!;expect(new Set(original.evidence.map(e=>e.relativePath)).size).toBe(2);
 expect(Object.values(index.fragments).filter(f=>f.summary.includes(legacy.other))).toHaveLength(1);
});

it.each([
 ['Chinese','- 调节合成青铜旋钮。\n- 例子：离线沙盒。\n- 反例：真实设备禁止。'],
 ['Chinese alternative','+ 调节合成青铜旋钮。\n+ 示例：离线沙盒。'],
 ['English','* Rotate the synthetic copper ring.\n* Examples: disconnected sandbox.\n* Counterexamples: connected equipment.'],
 ['numbered','9. Rotate the synthetic copper ring.\n\n10. Example: disconnected sandbox.\n    - Keep the synthetic cable isolated.\n\n11. Counterexample: connected equipment.'],
 ['numbered parenthesis','1) Rotate the synthetic copper ring.\n2) example： disconnected sandbox.\n3) COUNTEREXAMPLE: connected equipment.'],
 ['nested subtree','- Rotate the synthetic copper ring.\n  - Keep the synthetic cable isolated.\n- Example: disconnected sandbox.\n  - Another nested synthetic observation.'],
])('%s keeps the exact bounded root-plus-example group without swallowing the next reusable point',async(_label,raw)=>{
 const other='- Record an independent synthetic blue reading.';const r=await analyzeSource(snap(raw+'\n'+other),opts);
 expect(r.fragments).toHaveLength(2);expect(r.fragments.map(f=>f.summary).sort()).toEqual([raw,other].sort());expect(r.fragments.find(f=>f.summary===raw)!.evidence[0].quote).toBe(raw);
});

it('does not attach standalone leading labels, unlabelled siblings, embedded labels or ordinary label-like titles',async()=>{
 const cases=[
  '- Example: a standalone synthetic illustration.\n- Counterexample: a standalone synthetic exception.\n- Rotate the synthetic copper ring.',
  '- Rotate the synthetic copper ring.\n- A separate synthetic reading.\n- Counterexample: this belongs to the separate reading.',
  '- Rotate the synthetic copper ring.\n- Example notebook contains independent observations.\n- Counterexample archive is an independent subject.',
  '- Rotate the synthetic copper ring.\n- An independent sentence contains Example: as ordinary text.',
 ];
 for(const raw of cases){const r=await analyzeSource(snap(raw),opts);const action=r.fragments.find(f=>f.summary.includes('Rotate'))!;expect(action.summary).toBe('- Rotate the synthetic copper ring.')}
 expect((await analyzeSource(snap(cases[0]),opts)).fragments).toHaveLength(3);
 const ordinary='Literal `<!--` and `%%` examples are ordinary prose.';
 expect((await analyzeSource(snap('- Previous synthetic root.\n\n'+ordinary+'\n\n- Example: an independent illustration.'),opts)).fragments.some(f=>f.summary===ordinary)).toBe(true);
});

it('ends attachment at prose, headings, code/hidden boundaries or a different Canvas node',async()=>{
 const action='- Rotate the synthetic copper ring.',example='- Example: an unrelated synthetic illustration.';
 for(const boundary of ['\n\nIndependent synthetic prose.\n\n','\n# Separate synthetic section\n','\n```\nSynthetic code.\n```\n','\n<!-- hidden synthetic text -->\n','\n%% hidden synthetic text %%\n','\n---\n']){
  const r=await analyzeSource(snap(action+boundary+example),opts);expect(r.fragments.find(f=>f.summary.includes('Rotate'))!.summary).toBe(action);
 }
 const r=await analyzeSource(snap(canvas(action,example),'synthetic.canvas'),opts);expect(r.fragments.find(f=>f.summary.includes('Rotate'))!.summary).toBe(action);
});

it.each(['<!-- hidden -->','%% hidden %%'])('refuses hidden %s in the first root and in an attached example before partial publication',async marker=>{
 for(const raw of ['- Rotate '+marker+' the synthetic ring.\n- Example: offline sandbox.','- Rotate the synthetic ring.\n- Example: '+marker+' offline sandbox.'])await expect(analyzeSource(snap(raw),opts)).rejects.toThrow();
});

it('keeps >1400-unit sibling examples intact and counts them inside the unchanged 16384 combined bound',async()=>{
 const prefix='# Synthetic calibration\n\nOnly in a disconnected synthetic rig:\n\n- Rotate the synthetic copper ring.\n- Example: ';
 const raw=prefix+'合'.repeat(16384-prefix.length);const r=await analyzeSource(snap(raw),opts);expect(r.fragments).toHaveLength(1);expect(r.fragments[0].summary).toBe(raw);
 let error:unknown;try{await analyzeSource(snap(raw+'尾'),opts)}catch(e){error=e}
 expect(sourceDiagnostic(error)).toEqual({relativePath:'synthetic.md',stage:'analysis',reason:'local-context-size-limit'});
});

it('invalidates only local caches and preserves old AI primary/background/signatures exactly (offline only)',async()=>{
 expect(generationSignature({...defaults,outputFolder:'Derived'})).not.toBe(legacy.signatures['local-excerpts']);
 for(const mode of ['local-model','cloud-model'] as const){expect(generationSignature({...defaults,outputFolder:'Derived',mode})).toBe(legacy.signatures[mode]);const requests:ModelRequest[]=[];
  await analyzeSource(snap(legacy.raws['a.md'],'a.md'),{mode,cloudConsent:true,model:{request:async r=>{requests.push(r);return{version:1,decision:'insufficient-context',fragments:[]}}}});expect(requests).toEqual(legacy.requests[mode]);
 }
});

class N{
 className='';textContent='';value='';hidden=false;disabled=false;children:N[]=[];handlers=new Map<string,(()=>void)[]>();
 constructor(readonly tag:string){}append(...n:N[]){this.children.push(...n)}replaceChildren(...n:N[]){this.children=n}setAttribute(){}remove(){}focus(){}get childElementCount(){return this.children.length}
 addEventListener(k:string,h:()=>void){this.handlers.set(k,[...this.handlers.get(k)??[],h])}fire(k:string){for(const h of this.handlers.get(k)??[])h()}all():N[]{return[this,...this.children.flatMap(n=>n.all())]}text():string{return[this.textContent,...this.children.map(n=>n.text())].join('\n')}
}

it.each(['md','canvas'])('actual %s files → Controller → strict reload → bilingual panel → original checks; upgrade/idempotency/stale/cancel/human edits',async extension=>{
 const scope=path.resolve('.local/local-list-examples');await fs.mkdir(scope,{recursive:true});const root=await fs.mkdtemp(path.join(scope,'vault-'));
 const raws=Object.fromEntries(Object.entries(legacy.raws as Record<string,string>).map(([n,r])=>[n.replace('.md','.'+extension),extension==='md'?r:canvas('---\nprivacy: private\n---\n'+r)]));
 const mtimes=new Map<string,string>();for(const[n,r]of Object.entries(raws)){await fs.writeFile(path.join(root,n),r);mtimes.set(n,(await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString())}
 await fs.mkdir(path.join(root,'Derived'));await fs.writeFile(path.join(root,'Derived/manual.txt'),'Synthetic human-owned file.');
 const settings={...defaults,outputFolder:'Derived',excludes:[] as string[]};const store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths());
 let oldPath:string|undefined;if(extension==='md'){const inputs=await sources.list();const old:IndexState=structuredClone(legacy.old);await store.commit(old,()=>sources.verify(inputs));const bare=Object.values(old.fragments).find(f=>f.summary.includes(legacy.action))!;oldPath=path.join(root,await store.fragmentPath(bare.id))}
 const request=vi.fn(async()=>{throw Error('Forbidden model request')});const c=new ThirdBrainController(sources,store,()=>settings,()=>({request}),async()=>{});
 let dispose:(()=>void)|undefined,pending:Promise<unknown>|undefined;
 try{
  await c.initialize();await c.refresh();const next=(await store.load())!,actions=Object.values(next.fragments).filter(f=>f.summary.includes(legacy.action));expect(actions).toHaveLength(2);
  if(oldPath){expect(next.signature).not.toBe(legacy.old.signature);await expect(fs.stat(oldPath)).rejects.toMatchObject({code:'ENOENT'})}
  const statePath=path.join(root,'Derived/.third-brain/state.json'),state=await fs.readFile(statePath);await c.initialize();await c.refresh();expect(await store.load()).toEqual(next);expect(await fs.readFile(statePath)).toEqual(state);
  let oldEvidence:Evidence[]=[];let verifiedActions=0;
  for(const locale of ['en','zh'] as const){
   vi.stubGlobal('document',{createElement:(tag:string)=>new N(tag)});const container=new N('main'),opens:Promise<void>[]=[];
   dispose=mountPanel(container as unknown as HTMLElement,{status:()=>c.status(),subscribe:f=>c.subscribe(f),refresh:()=>c.refresh(),cancel:()=>c.cancel(),find:(...args)=>{pending=c.find(...args);return pending as ReturnType<ThirdBrainController['find']>},open:e=>{const p=c.verifyOpen(e);opens.push(p);return p}},locale);
   const input=container.all().find(n=>n.className==='tb-idea')!;input.value='amber calibration ring';input.fire('input');container.all().find(n=>n.tag==='button'&&n.textContent===messages(locale).find)!.fire('click');
   const results=await pending as Awaited<ReturnType<ThirdBrainController['find']>>;await Promise.resolve();const found=results.filter(r=>r.fragment.summary.includes(legacy.action));expect(found).toHaveLength(2);oldEvidence=found.flatMap(r=>r.fragment.evidence);
   const cards=container.all().filter(n=>n.className==='tb-result'&&n.text().includes(legacy.action));expect(cards).toHaveLength(2);
   for(const card of cards){expect(card.text()).toContain(legacy.example);expect(card.text()).toContain('Counterexample:');expect(card.text()).toContain(messages(locale).excerpt);for(const b of card.all().filter(n=>n.className==='tb-source')){b.fire('click');await opens.at(-1)}}await Promise.all(opens);verifiedActions+=opens.length;
   dispose();dispose=undefined;vi.unstubAllGlobals();
  }
  for(const[n,r]of Object.entries(raws)){expect(hash(await fs.readFile(path.join(root,n)))).toBe(hash(r));expect((await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()).toBe(mtimes.get(n))}
  const original=actions.find(f=>f.summary.includes(legacy.counter))!,evidence=oldEvidence.filter(e=>original.evidence.some(a=>a.relativePath===e.relativePath));expect(evidence).toHaveLength(original.evidence.length);expect(await currentEvidence(evidence,sources)).toEqual(evidence);
  const name='a.'+extension;await fs.writeFile(path.join(root,name),raws[name].replace('a connected production rig is forbidden.','a changed synthetic exception.'));
  for(const e of evidence)await expect(c.verifyOpen(e)).rejects.toThrow();expect((await c.find('amber calibration ring','medium')).some(r=>r.fragment.id===original.id)).toBe(false);
  await fs.writeFile(path.join(root,name),raws[name]);settings.excludes.push(name);for(const e of evidence)await expect(c.verifyOpen(e)).rejects.toThrow();settings.excludes.pop();for(const e of evidence)await c.verifyOpen(e);
  const commit=vi.spyOn(store,'commit'),oversized='- Rotate the synthetic ring.\n- Example: '+'合'.repeat(16384);
  await fs.writeFile(path.join(root,name),extension==='md'?oversized:canvas(oversized));await expect(c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(state);await fs.writeFile(path.join(root,name),raws[name]);await c.refresh();expect(await fs.readFile(statePath)).toEqual(state);
  const list=sources.list.bind(sources);let release!:()=>void,entered!:()=>void;const started=new Promise<void>(r=>{entered=r}),latch=new Promise<void>(r=>{release=r});
  vi.spyOn(sources,'list').mockImplementationOnce(async options=>{entered();await latch;return list(options)});commit.mockClear();const refresh=c.refresh();await started;c.cancel();release();await expect(refresh).rejects.toMatchObject({name:'AbortError'});expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(state);await c.refresh();expect(await fs.readFile(statePath)).toEqual(state);
  const generated=path.join(root,await store.fragmentPath(original.id)),bytes=await fs.readFile(generated);await fs.writeFile(generated,Buffer.concat([bytes,Buffer.from('\nSynthetic human amendment.')]));await expect(c.refresh()).rejects.toThrow();expect(await fs.readFile(generated,'utf8')).toContain('Synthetic human amendment.');expect(await fs.readFile(statePath)).toEqual(state);await fs.writeFile(generated,bytes);await c.initialize();await c.refresh();expect(await fs.readFile(statePath)).toEqual(state);
  for(const[n,r]of Object.entries(raws))expect(await fs.readFile(path.join(root,n),'utf8')).toBe(r);for(const n of Object.keys(raws).filter(n=>n!==name))expect((await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()).toBe(mtimes.get(n));expect(await fs.readFile(path.join(root,'Derived/manual.txt'),'utf8')).toBe('Synthetic human-owned file.');expect(request).not.toHaveBeenCalled();
  await fs.writeFile(path.join(scope,extension+'-receipt.json'),JSON.stringify({strictReload:true,contextualActions:2,verifiedActions,legacyUpgrade:extension==='md',idempotentStateBytes:true,realModelRequests:0,nativeHost:false},null,2));
 }finally{await pending?.catch(()=>{});dispose?.();c.dispose();vi.unstubAllGlobals();vi.restoreAllMocks()}
});

it('counts attached Canvas siblings inside the unchanged 256-evidence limit; overflow never commits and retry recovers',async()=>{
 const encode=(count:number)=>canvas('# Synthetic calibration\n- Rotate the synthetic ring.\n'+Array.from({length:count},(_,i)=>'- Example: synthetic tile '+i+'.').join('\n'));
 const scope=path.resolve('.local/local-list-examples');await fs.mkdir(scope,{recursive:true});const root=await fs.mkdtemp(path.join(scope,'limit-'));const source=path.join(root,'source.canvas');await fs.writeFile(source,encode(254));
 const settings={...defaults,outputFolder:'Derived',excludes:[]};const store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths());const c=new ThirdBrainController(sources,store,()=>settings,()=>undefined,async()=>{});
 try{await c.initialize();await c.refresh();const index=(await store.load())!;expect(Object.values(index.fragments)).toHaveLength(1);const f=Object.values(index.fragments)[0];expect(f.evidence).toHaveLength(256);expect(await currentEvidence(f.evidence,sources)).toEqual(f.evidence);for(const e of [f.evidence[0],f.evidence.at(-1)!])await c.verifyOpen(e);
  const statePath=path.join(root,'Derived/.third-brain/state.json'),state=await fs.readFile(statePath);await c.refresh();expect(await fs.readFile(statePath)).toEqual(state);const commit=vi.spyOn(store,'commit');await fs.writeFile(source,encode(255));await expect(c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(state);await fs.writeFile(source,encode(254));await c.refresh();expect(await fs.readFile(statePath)).toEqual(state);
 }finally{c.dispose();vi.restoreAllMocks()}
});
