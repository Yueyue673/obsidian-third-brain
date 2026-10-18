// SPDX-License-Identifier: MIT
// Authored synthetic notes. Offline request captures are not semantic-quality evidence.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { analyzeSource, buildIndex, prepareSource } from '../src/core';
import { hasReadableQuote } from '../src/core/sources';
import type { Evidence, IndexState, ModelRequest } from '../src/core/types';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
const legacy=JSON.parse(await fs.readFile('tests/fixtures/local-quoted-points-legacy.json','utf8'));
const opts={mode:'local-excerpts' as const,cloudConsent:false,now:'2026-01-01T00:00:00.000Z'};
const snap=(r:string,n='synthetic.md')=>prepareSource(n,r,hash(r),hash(n).slice(0,24));
const canvas=(r:string)=>JSON.stringify({nodes:[{type:'text',text:r}],edges:[]});

it.each(['md','canvas'])('%s separates explicit quoted list roots without losing common scope or unique descendants',async extension=>{
 const inputs=Object.entries(legacy.raws as Record<string,string>).map(([n,r])=>snap(extension==='md'?r:canvas(r),n.replace('.md','.'+extension)));
 const index=await buildIndex(inputs,{...opts,previous:null,signature:generationSignature(defaults)});const all=Object.values(index.fragments);
 expect(all).toHaveLength(4);const actions=all.filter(f=>f.summary.includes(legacy.action));expect(actions).toHaveLength(2);
 for(const f of actions){expect(f.summary).not.toContain(legacy.other);expect(f.summary).toContain('Counterexample:');expect(f.summary).toContain('simulator:');}
 const copy=actions.find(f=>f.summary.includes('copper'))!;expect(new Set(copy.evidence.map(e=>e.relativePath)).size).toBe(2);
 for(const f of all)for(const e of f.evidence){const s=inputs.find(s=>s.path===e.relativePath)!;if(e.start>=0)expect(s.text.slice(e.start,e.end)).toBe(e.quote);else expect(hasReadableQuote(s,e.quote)).toBe(true);}
});

it.each(['> - ','> 1. ','   > + '])('%s supports quoted roots, descendants, same-level labels, loose rows and full ancestor headings',async marker=>{
 const body='# Only the synthetic disconnected bench\n\n'+['> [!note]+ Synthetic scope','> Only the isolated mock fixture:','>',marker+'Remember the amber calibration point.',(marker.includes('1.')?'>    - ': '>   - ')+'Necessary synthetic substep.','>','> - Caveat: never connect real equipment.','> - File the jade ledger separately.'].join('\n');
 const all=(await analyzeSource(snap(body),opts)).fragments;expect(all).toHaveLength(2);
 const action=all.find(f=>f.summary.includes('amber'))!;expect(action.summary).toContain('# Only the synthetic disconnected bench');expect(action.summary).toContain('Only the isolated mock fixture:');expect(action.summary).toContain('Caveat:');expect(action.summary).not.toContain('jade');
 expect(all.every(f=>f.evidence.some(e=>e.quote==='# Only the synthetic disconnected bench'))).toBe(true);
});

it('preserves CRLF source spans, quoted blank lines and >1400-unit complete subtrees without changing plain lists',async()=>{
 const raw='> Only the synthetic bench:\r\n>\r\n> - Remember the amber point.\r\n>   - '+ '合成例子。'.repeat(300)+'\r\n> - File the jade ledger separately.';
 const all=(await analyzeSource(snap(raw),opts)).fragments;expect(all).toHaveLength(2);const f=all.find(f=>f.summary.includes('amber'))!;expect(f.summary.length).toBeGreaterThan(1400);expect(f.summary).not.toContain('jade');for(const e of f.evidence)expect(raw.slice(e.start,e.end)).toBe(e.quote);
 const plain=raw.replace(/^> ?/gmu,'');const p=(await analyzeSource(snap(plain),opts)).fragments;expect(p.map(f=>f.summary).sort()).toEqual(all.map(f=>f.summary.replace(/^> ?/gmu,'')).sort());
});

it('does not lend quote scope across a following paragraph, Canvas node or outside list',async()=>{
 const raw='> Only the synthetic fixture:\n>\n> - Remember the amber point.\n> - File the jade ledger.\n\nOutside prose is independent.\n\n- Outside action remains independent.';
 const all=(await analyzeSource(snap(raw),opts)).fragments;expect(all.find(f=>f.summary.includes('Outside action'))!.summary).toBe('- Outside action remains independent.');expect(all.find(f=>f.summary.includes('Outside prose'))!.summary).toBe('Outside prose is independent.');
 const nodes=JSON.stringify({nodes:[{type:'text',text:raw.split('\n\nOutside')[0]},{type:'text',text:'- Outside action remains independent.'}],edges:[]});expect((await analyzeSource(snap(nodes,'synthetic.canvas'),opts)).fragments.find(f=>f.summary.includes('Outside action'))!.summary).toBe('- Outside action remains independent.');
 const literal='Literal `<!--` and `%%` remain ordinary inline examples.';expect((await analyzeSource(snap('- Previous synthetic point.\n\n'+literal),opts)).fragments.some(f=>f.summary===literal)).toBe(true);
});

it.each(['<!-- hidden -->','%% hidden %%'])('refuses a hidden first quoted parent or common introduction: %s',async marker=>{
 for(const raw of ['> - Only in '+marker+' the synthetic fixture:\n>   - Remember the amber point.','> [!warning] '+marker+'\n> Only the synthetic fixture:\n>\n> - Remember the amber point.'])await expect(analyzeSource(snap(raw),opts)).rejects.toThrow();
});

it('keeps existing AI signatures and complete primary/background requests unchanged (offline)',async()=>{
 expect(generationSignature({...defaults,outputFolder:'Derived'})).not.toBe(legacy.signatures['local-excerpts']);
 for(const mode of ['local-model','cloud-model'] as const){expect(generationSignature({...defaults,outputFolder:'Derived',mode})).toBe(legacy.signatures[mode]);const requests:ModelRequest[]=[];await analyzeSource(snap(legacy.raws['a.md'],'a.md'),{mode,cloudConsent:true,model:{request:async r=>{requests.push(r);return {version:1,decision:'insufficient-context',fragments:[]};}}});expect(requests).toEqual(legacy.requests[mode]);}
});

it('keeps unrecognised non-colon scope, nested quotes and a quote inside a plain parent conservatively whole',async()=>{
 for(const raw of [
  '> [!warning] Only use the disconnected synthetic fixture.\n>\n> - Remember the amber point.\n> - File the jade ledger.',
  '> > Only the synthetic fixture:\n> > - Remember the amber point.\n> > - File the jade ledger.',
  '- Only the disconnected synthetic fixture:\n  > - Remember the amber point.\n  > - File the jade ledger.',
 ])expect((await analyzeSource(snap(raw),opts)).fragments.map(f=>f.summary)).toEqual([raw]);
});

it('supports Chinese scope and roots, CR-only lines and quote-only lists without a prose preamble',async()=>{
 for(const newline of ['\n','\r\n','\r']){
  const lead='> 仅在离线合成环境中允许：',first='> - 将青铜旋钮调到七档。',last='> - 将翡翠记录按日期归档。';
  const all=(await analyzeSource(snap([lead,'>',first,last].join(newline)),opts)).fragments;
  expect(all.map(f=>f.summary).sort()).toEqual([lead+'\n\n'+first,lead+'\n\n'+last].sort());
 }
 expect((await analyzeSource(snap('> - Remember the amber point.\n> - File the jade ledger.'),opts)).fragments).toHaveLength(2);
});

it('retains quoted heading conditions without leaking them to the following outside section',async()=>{
 const raw='> # Only the disconnected synthetic bench\n> Only this mock fixture:\n>\n> - Remember the amber point.\n> - File the jade ledger.\n\nOutside prose is independent.';
 const all=(await analyzeSource(snap(raw),opts)).fragments;expect(all).toHaveLength(3);
 expect(all.filter(f=>f.summary.includes('amber')||f.summary.includes('jade')).every(f=>f.summary.includes('> # Only the disconnected synthetic bench'))).toBe(true);
 expect(all.find(f=>f.summary.includes('Outside prose'))!.summary).toBe('Outside prose is independent.');
});

it.each(['```\n> synthetic code\n> ```','<!-- hidden -->','%% hidden %%'])('refuses ancestry across quoted structural barriers: %s',async boundary=>{
 await expect(analyzeSource(snap('> - Only the synthetic fixture:\n> '+boundary+'\n>   - Remember the amber point.'),opts)).rejects.toThrow();
});

it('counts restored quote prefixes and outside headings in the unchanged combined 16384-unit bound',async()=>{
 const heading='# Only the synthetic disconnected bench',intro='> Only this synthetic fixture:',action='> - Remember the amber point; ';
 const size=(heading+'\n\n'+intro+'\n\n'+action).length,fill='合'.repeat(16384-size),raw=heading+'\n\n'+intro+'\n>\n'+action+fill;
 const all=(await analyzeSource(snap(raw),opts)).fragments;expect(all).toHaveLength(1);expect(all[0].summary.length).toBe(16384);expect(all[0].summary).toBe(heading+'\n\n'+intro+'\n\n'+action+fill);
 await expect(analyzeSource(snap(raw+'尾'),opts)).rejects.toThrow();
});

it('strictly reloads 256 restored quotations, rejects merged overflow before commit and recovers idempotently',async()=>{
 const scope=path.resolve('.local/local-quoted-points');await fs.mkdir(scope,{recursive:true});const root=await fs.mkdtemp(path.join(scope,'bounds-'));
 const settings={...defaults,outputFolder:'Derived',excludes:[]},store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths());const c=new ThirdBrainController(sources,store,()=>settings,()=>undefined,async()=>{});
 const make=(n:number)=>Array.from({length:n},()=>'> Only the synthetic fixture:\n>\n> - Remember the amber point.').join('\n\n'),file=path.join(root,'source.md'),legal=make(128);
 try{
  await fs.writeFile(file,legal);await c.initialize();await c.refresh();const index=(await store.load())!,fragments=Object.values(index.fragments);expect(fragments).toHaveLength(1);expect(fragments[0].evidence).toHaveLength(256);
  const found=await c.find('amber point','medium');expect(found).toHaveLength(1);for(const e of [found[0].fragment.evidence[0],found[0].fragment.evidence.at(-1)!])await c.verifyOpen(e);
  const state=path.join(root,'Derived/.third-brain/state.json'),bytes=await fs.readFile(state);await c.refresh();expect(await fs.readFile(state)).toEqual(bytes);const commit=vi.spyOn(store,'commit');await fs.writeFile(file,make(129));await expect(c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(state)).toEqual(bytes);await fs.writeFile(file,legal);await c.refresh();expect(await fs.readFile(state)).toEqual(bytes);expect(await fs.readFile(file,'utf8')).toBe(legal);
 }finally{c.dispose();vi.restoreAllMocks();}
});

class Node {className='';textContent='';value='';hidden=false;disabled=false;children:Node[]=[];handlers=new Map<string,(()=>void)[]>();constructor(readonly tag:string){}append(...n:Node[]){this.children.push(...n);}replaceChildren(...n:Node[]){this.children=n;}setAttribute(){}remove(){}focus(){}get childElementCount(){return this.children.length;}addEventListener(k:string,h:()=>void){this.handlers.set(k,[...this.handlers.get(k)??[],h]);}fire(k:string){for(const h of this.handlers.get(k)??[])h();}all():Node[]{return[this,...this.children.flatMap(n=>n.all())];}text():string{return[this.textContent,...this.children.map(n=>n.text())].join('\n');}}

it.each(['md','canvas'])('actual %s files → strict reload → bilingual renderer → all originals, once-only upgrade, current guards and safe recovery',async extension=>{
 const scope=path.resolve('.local/local-quoted-points');await fs.mkdir(scope,{recursive:true});const root=await fs.mkdtemp(path.join(scope,'vault-'));const raws=Object.fromEntries(Object.entries(legacy.raws as Record<string,string>).map(([n,r])=>[n.replace('.md','.'+extension),extension==='md'?r:canvas('---\nprivacy: private\n---\n'+r)]));const mtimes=new Map<string,string>();
 for(const[n,r]of Object.entries(raws)){await fs.writeFile(path.join(root,n),r);mtimes.set(n,(await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString());}
 await fs.mkdir(path.join(root,'Derived'));await fs.writeFile(path.join(root,'Derived/manual.txt'),'Synthetic human-owned file.');const settings={...defaults,outputFolder:'Derived',excludes:[] as string[]},store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths()),request=vi.fn(async()=>{throw Error('Forbidden model request');});const c=new ThirdBrainController(sources,store,()=>settings,()=>({request}),async()=>{});let dispose:(()=>void)|undefined,pending:Promise<unknown>|undefined;
 try{
  let oldId:string|undefined;if(extension==='md'){const inputs=await sources.list();const old:IndexState=structuredClone(legacy.old);await store.commit(old,()=>sources.verify(inputs));oldId=Object.values(old.fragments).find(f=>f.summary.includes(legacy.action))!.id;}
  await c.initialize();await c.refresh();const index=(await store.load())!,all=Object.values(index.fragments);expect(all).toHaveLength(4);if(oldId)expect(index.fragments[oldId]).toBeUndefined();if(extension==='canvas')expect(all.every(f=>f.privacy==='private')).toBe(true);
  const statePath=path.join(root,'Derived/.third-brain/state.json'),bytes=await fs.readFile(statePath);await c.initialize();await c.refresh();expect(await store.load()).toEqual(index);expect(await fs.readFile(statePath)).toEqual(bytes);
  let evidence:Evidence[]=[],openCount=0;
  for(const locale of ['en','zh'] as const){vi.stubGlobal('document',{createElement:(tag:string)=>new Node(tag)});const container=new Node('main'),opens:Promise<void>[]=[];dispose=mountPanel(container as unknown as HTMLElement,{status:()=>c.status(),subscribe:h=>c.subscribe(h),refresh:()=>c.refresh(),cancel:()=>c.cancel(),find:(...args)=>{pending=c.find(...args);return pending as ReturnType<ThirdBrainController['find']>;},open:e=>{const p=c.verifyOpen(e);opens.push(p);return p;}},locale);
   const input=container.all().find(n=>n.className==='tb-idea')!;input.value='cobalt memory dial';input.fire('input');container.all().find(n=>n.tag==='button'&&n.textContent===messages(locale).find)!.fire('click');const result=await pending as Awaited<ReturnType<ThirdBrainController['find']>>;await Promise.resolve();const actions=result.filter(r=>r.fragment.summary.includes(legacy.action));expect(actions).toHaveLength(2);evidence=actions.find(r=>r.fragment.summary.includes('copper'))!.fragment.evidence;const cards=container.all().filter(n=>n.className==='tb-result'&&n.text().includes(legacy.action));expect(cards).toHaveLength(2);for(const card of cards){expect(card.text()).toContain(messages(locale).excerpt);expect(card.text()).not.toContain(legacy.other);expect(card.text()).toContain('simulator:');for(const button of card.all().filter(n=>n.className==='tb-source')){button.fire('click');await opens.at(-1);}}expect(opens).toHaveLength(actions.reduce((n,r)=>n+r.fragment.evidence.length,0));openCount+=opens.length;dispose();dispose=undefined;vi.unstubAllGlobals();
  }
  for(const[n,r]of Object.entries(raws)){expect(hash(await fs.readFile(path.join(root,n)))).toBe(hash(r));expect((await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()).toBe(mtimes.get(n));}
  const name='a.'+extension;await fs.writeFile(path.join(root,name),raws[name].replace('disconnected copper','changed synthetic'));for(const e of evidence)await expect(c.verifyOpen(e)).rejects.toThrow();expect((await c.find('cobalt memory dial','medium')).some(r=>r.fragment.id===all.find(f=>f.summary.includes(legacy.action)&&f.summary.includes('copper'))!.id)).toBe(false);await fs.writeFile(path.join(root,name),raws[name]);settings.excludes.push(name);for(const e of evidence)await expect(c.verifyOpen(e)).rejects.toThrow();settings.excludes.pop();for(const e of evidence)await c.verifyOpen(e);
  const commit=vi.spyOn(store,'commit');const huge='> Only the synthetic fixture:\n>\n> - '+ '合'.repeat(16384);await fs.writeFile(path.join(root,name),extension==='md'?huge:canvas(huge));await expect(c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(bytes);await fs.writeFile(path.join(root,name),raws[name]);await c.refresh();expect(await fs.readFile(statePath)).toEqual(bytes);
  const list=sources.list.bind(sources);let release!:()=>void,entered!:()=>void;const started=new Promise<void>(r=>{entered=r;}),latch=new Promise<void>(r=>{release=r;});vi.spyOn(sources,'list').mockImplementationOnce(async o=>{entered();await latch;return list(o);});commit.mockClear();const refresh=c.refresh();await started;c.cancel();release();await expect(refresh).rejects.toMatchObject({name:'AbortError'});expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(bytes);await c.refresh();expect(await fs.readFile(statePath)).toEqual(bytes);
  const target=path.join(root,await store.fragmentPath(all[0].id)),original=await fs.readFile(target);await fs.writeFile(target,Buffer.concat([original,Buffer.from('\nSynthetic human amendment.')]));await expect(c.refresh()).rejects.toThrow();expect(await fs.readFile(target,'utf8')).toContain('Synthetic human amendment.');expect(await fs.readFile(statePath)).toEqual(bytes);await fs.writeFile(target,original);await c.initialize();await c.refresh();expect(await fs.readFile(statePath)).toEqual(bytes);expect(await fs.readFile(path.join(root,'Derived/manual.txt'),'utf8')).toBe('Synthetic human-owned file.');for(const[n,r]of Object.entries(raws))expect(await fs.readFile(path.join(root,n),'utf8')).toBe(r);expect(request).not.toHaveBeenCalled();
  await fs.writeFile(path.join(scope,extension+'-receipt.json'),JSON.stringify({strictReload:true,separateScopedFragments:4,openCount,upgrade:extension==='md',idempotent:true,realModelRequests:0,nativeHost:false},null,2));
 }finally{await pending?.catch(()=>{});dispose?.();c.dispose();vi.unstubAllGlobals();vi.restoreAllMocks();}
});
