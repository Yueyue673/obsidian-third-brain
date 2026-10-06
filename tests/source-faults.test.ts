// SPDX-License-Identifier: MIT
// Synthetic filesystem + real renderer/Controller/core/OwnedStore. No real model or HTTP.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import { FileSources, hash, type SourcePort } from '../src/sources';
import { ThirdBrainController } from '../src/controller';
import { OwnedStore } from '../src/runtime/store';
import { defaults } from '../src/settings';
import { mountPanel } from '../src/ui';
import type { ModelRequest } from '../src/core/types';

const scope = path.resolve('.local/source-fault-implementation');
const records: unknown[] = []; let mockRequests = 0;
let networkAttempts = 0;
const denyNetwork = () => { networkAttempts++; throw new Error('Synthetic tests forbid network'); };
const realRead = fs.readFile;
class NodeStub {
  tag: string; className=''; textContent=''; children: NodeStub[]=[]; value=''; hidden=false; disabled=false;
  handlers=new Map<string, Array<()=>void>>(); constructor(tag:string){this.tag=tag;}
  append(...n:NodeStub[]){this.children.push(...n);} replaceChildren(...n:NodeStub[]){this.children=n;}
  setAttribute(){} remove(){} focus(){} get childElementCount(){return this.children.length;}
  addEventListener(e:string,fn:()=>void){this.handlers.set(e,[...(this.handlers.get(e)??[]),fn]);}
  fire(e:string){for(const fn of this.handlers.get(e)??[])fn();}
  all():NodeStub[]{return [this,...this.children.flatMap(n=>n.all())];}
}
async function tree(root:string):Promise<Record<string,string>>{ const r:Record<string,string>={}; async function walk(p:string,rel=''){for(const e of await fs.readdir(p,{withFileTypes:true})){const n=rel?`${rel}/${e.name}`:e.name;if(e.isDirectory())await walk(path.join(p,e.name),n);else r[n]=hash(await realRead(path.join(p,e.name)));}} await walk(root);return r;}
async function fixture(canvas=false, ai=false){
  vi.stubGlobal('fetch',denyNetwork); vi.spyOn(http,'request').mockImplementation(denyNetwork); vi.spyOn(https,'request').mockImplementation(denyNetwork);
  await fs.mkdir(scope,{recursive:true});const root=await fs.mkdtemp(path.join(scope,'case-'));
  const names=['a.md',canvas?'b.canvas':'b.md','c.md'];
  const text=(p:string)=>`Synthetic ${p.startsWith('a')?'AlphaMarker':p.startsWith('b')?'BetaMarker':'GammaMarker'} grounded knowledge stays independently useful.`;
  for(const n of names)await fs.writeFile(path.join(root,n),n.endsWith('canvas')?JSON.stringify({nodes:[{type:'text',text:text(n)}],edges:[]}):text(n));
  const settings={...defaults,excludes:[],outputFolder:'Derived',mode:ai?'local-model' as const:'local-excerpts' as const};
  let bad=false; const store=new OwnedStore(root,'Derived');const sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths());
  const commit=vi.spyOn(store,'commit');const events:any[]=[];
  const request=vi.fn(async(input:ModelRequest)=>{mockRequests++;if(bad&&input.text.includes('BetaMarker'))return {version:1,decision:'extract',fragments:[],unknown:'MODEL_SECRET_SENTINEL'};return {version:1,decision:'extract',fragments:[{title:'Synthetic excerpt',summary:input.text,kind:'excerpt',topics:[],concepts:[],mechanisms:[],atmosphere:[],quotes:[input.text],conditions:[],caveats:[]}]};});
  const controller=new ThirdBrainController(sources,store,()=>settings,()=>ai?{request}:undefined,async()=>{});
  controller.subscribe(()=>events.push(structuredClone(controller.status())));await controller.initialize();
  return {root,names,store,sources,controller,commit,events,request,setBad:()=>{bad=true;}};
}
afterEach(async()=>{fs.readFile=realRead;vi.unstubAllGlobals();vi.restoreAllMocks();expect(networkAttempts).toBe(0);await fs.mkdir(scope,{recursive:true});await fs.writeFile(path.join(scope,'test-evidence.json'),JSON.stringify({cases:records,caseCount:records.length,mockRequests,networkAttempts,realModelRequests:0,httpRequests:0},null,2));});

for(const incremental of [false,true])for(const kind of ['canvas','encoding','eio','schema'] as const)it(`locates ${kind} with real pipeline (${incremental?'incremental':'initial'})`,async()=>{
  const h=await fixture(kind==='canvas',kind==='schema');if(incremental)await h.controller.refresh();
  const baseline=await h.store.load();if(kind==='canvas')await fs.writeFile(path.join(h.root,h.names[1]),'{"nodes":[');
  if(kind==='encoding')await fs.writeFile(path.join(h.root,h.names[1]),Buffer.from([0xc3,0x28]));
  if(kind==='schema'){h.setBad();await fs.appendFile(path.join(h.root,h.names[1]),' Synthetic changed paragraph.');}
  const before=await tree(h.root),commits=h.commit.mock.calls.length;
  const injected=Object.assign(new Error('BODY_SECRET_SENTINEL C:/absolute SECRET'),{code:'EIO',sourceDiagnostic:{relativePath:'evil.md',reason:'forged'}});
  if(kind==='eio')fs.readFile=(async(...args:any[])=>{if(String(args[0])===path.join(h.root,h.names[1]))throw injected;return (realRead as any)(...args);}) as typeof fs.readFile;
  const error=await h.controller.refresh().catch(e=>e);const status=h.controller.status() as any;
  expect(status.sourceDiagnostic).toEqual({relativePath:h.names[1],stage:kind==='canvas'?'parsing':kind==='encoding'?'decoding':kind==='schema'?'analysis':'reading',reason:kind==='canvas'?'parse-failed':kind==='encoding'?'decode-failed':kind==='schema'?'model-output-rejected':'read-failed'});
  expect(status.hasCompleteIndex).toBe(incremental);expect(status.commitOutcome).toBe('not-started');expect(status.progress.completed).toBe(1);expect(status.progress.total).toBe(3);
  if(kind==='eio')expect(error).toBe(injected);
  expect(h.commit.mock.calls.length).toBe(commits);expect(await h.store.load()).toEqual(baseline);expect(await tree(h.root)).toEqual(before);
  for(const locale of ['en','zh'] as const){vi.stubGlobal('document',{createElement:(tag:string)=>new NodeStub(tag)});const root=new NodeStub('main');const dispose=mountPanel(root as unknown as HTMLElement,{status:()=>h.controller.status(),subscribe:fn=>h.controller.subscribe(fn),refresh:()=>h.controller.refresh(),find:(...a)=>h.controller.find(...a),cancel:()=>h.controller.cancel(),open:async()=>{}},locale);const text=root.all().map(n=>n.textContent).join('\n');expect(text).toContain(h.names[1]);expect(text).toContain('1 / 3');expect(text).not.toMatch(/BODY_SECRET_SENTINEL|MODEL_SECRET_SENTINEL|evil.md|C:\/absolute/);expect(text).toContain(incremental?(locale==='en'?'Last complete index retained':'保留上次完整索引'):(locale==='en'?'No complete index yet':'尚未建立完整索引'));dispose();}
  records.push({kind,incremental,status,sourceAndCacheHashesBefore:before,sourceAndCacheHashesAfter:await tree(h.root),commits:h.commit.mock.calls.length-commits,mockRequests:h.request.mock.calls.length});h.controller.dispose();
});

it('cancels a blocked real file read without starting c or accepting late state',async()=>{
 const h=await fixture();let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>release=r),start=new Promise<void>(r=>entered=r);const reads:string[]=[];
 fs.readFile=(async(...a:any[])=>{const n=path.basename(String(a[0]));reads.push(n);if(n==='b.md'){entered();await gate;}return (realRead as any)(...a);}) as typeof fs.readFile;
 const p=h.controller.refresh().catch(e=>e);await start;h.controller.cancel();const result=await Promise.race([p,new Promise(r=>setTimeout(()=>r('timeout'),200))]);expect(result).not.toBe('timeout');const status=structuredClone(h.controller.status());expect(status.phase).toBe('cancelled');release();await new Promise(r=>setTimeout(r,20));expect(reads).not.toContain('c.md');expect(h.controller.status()).toEqual(status);expect(h.commit).not.toHaveBeenCalled();records.push({kind:'blocked-read-cancel',status,reads,commits:0});h.controller.dispose();
});
it.each(['resolve','reject'] as const)('legacy list late %s cannot update status or commit',async kind=>{
 const h=await fixture();let finish!:(v?:any)=>void;const pending=new Promise<any[]>((resolve,reject)=>{finish=kind==='resolve'?resolve:reject;});const old=h.sources.list.bind(h.sources);(h.sources as SourcePort).list=()=>pending;
 const p=h.controller.refresh().catch(e=>e);await Promise.resolve();h.controller.cancel();const result=await Promise.race([p,new Promise(r=>setTimeout(()=>r('timeout'),200))]);expect(result).not.toBe('timeout');const status=structuredClone(h.controller.status());finish(kind==='resolve'?await old():new Error('LATE_SECRET'));await new Promise(r=>setTimeout(r,10));expect(h.controller.status()).toEqual(status);expect(h.commit).not.toHaveBeenCalled();h.controller.dispose();
});
it('renderer refresh catch retains structured diagnostics and repaired rerun is complete/idempotent',async()=>{
 const h=await fixture(true);vi.stubGlobal('document',{createElement:(tag:string)=>new NodeStub(tag)});const root=new NodeStub('main');let operation:Promise<void>=Promise.resolve();
 const dispose=mountPanel(root as unknown as HTMLElement,{status:()=>h.controller.status(),subscribe:fn=>h.controller.subscribe(fn),refresh:()=>operation=h.controller.refresh(),find:(...a)=>h.controller.find(...a),cancel:()=>h.controller.cancel(),open:async()=>{}},'zh');
 let releaseCommit=()=>{};
 try {
  await fs.writeFile(path.join(h.root,'b.canvas'),'{');root.all().find(n=>n.textContent==='更新笔记')!.fire('click');await expect(operation).rejects.toBeInstanceOf(Error);await Promise.resolve();expect(h.controller.status().phase).toBe('error');expect(root.all().find(n=>n.className==='tb-notice')!.textContent).toContain('b.canvas');
  await fs.writeFile(path.join(h.root,'b.canvas'),JSON.stringify({nodes:[{type:'text',text:'Repaired synthetic independent knowledge.'}],edges:[]}));const repairedBefore=await tree(h.root);
  // Own the actual operation through real commit, not a one-second status poll.
  let commitStarted!:()=>void;const started=new Promise<void>(resolve=>commitStarted=resolve),gate=new Promise<void>(resolve=>releaseCommit=resolve);
  h.commit.mockImplementationOnce(async(...args)=>{commitStarted();await gate;return OwnedStore.prototype.commit.apply(h.store,args);});
  root.all().find(n=>n.textContent==='更新笔记')!.fire('click');await started;expect(h.controller.status().phase).toBe('indexing');expect(h.controller.status().progress?.phase).toBe('committing');releaseCommit();await operation;await Promise.resolve();
  expect(h.controller.status().phase).toBe('idle');expect(h.controller.status().sourceCount).toBe(3);const complete=await tree(h.root);await h.controller.refresh();expect(await tree(h.root)).toEqual(complete);for(const n of h.names)expect(complete[n]).toBe(repairedBefore[n]);expect(h.events.some(e=>e.progress?.phase==='committing')).toBe(true);expect(h.events.filter(e=>e.phase==='indexing').some(e=>e.progress?.phase==='done')).toBe(false);records.push({kind:'explicit-synthetic-repair-rerun',repairedBefore,complete,unchanged:await tree(h.root),controlledCommitWait:true,realModelRequests:0,httpRequests:0});
 } finally {releaseCommit();await operation.catch(()=>{});await Promise.resolve();dispose();h.controller.dispose();}
});
it('legal Canvas text:42 keeps its existing empty-source behavior',async()=>{const h=await fixture(true);await fs.writeFile(path.join(h.root,'b.canvas'),'{"nodes":[{"type":"text","text":42}],"edges":[]}');await h.controller.refresh();expect((await h.store.load())!.sources['b.canvas'].status).toBe('empty');expect(h.controller.status().phase).toBe('idle');h.controller.dispose();});

it.each(['en','zh'] as const)('real find event shows read fault without refresh/availability claims in %s',async locale=>{
 const h=await fixture();await h.controller.refresh();const before=await tree(h.root);const injected=Object.assign(new Error('ARBITRARY_BODY_SECRET'),{code:'EIO',sourceDiagnostic:{relativePath:'forged.md',stage:'analysis',reason:'decode-failed'}});
 fs.readFile=(async(...a:any[])=>{if(String(a[0])===path.join(h.root,'b.md'))throw injected;return (realRead as any)(...a);}) as typeof fs.readFile;
 vi.stubGlobal('document',{createElement:(tag:string)=>new NodeStub(tag)});const root=new NodeStub('main');let operation:ReturnType<ThirdBrainController['find']>=Promise.resolve([]);const dispose=mountPanel(root as unknown as HTMLElement,{status:()=>h.controller.status(),subscribe:fn=>h.controller.subscribe(fn),refresh:()=>h.controller.refresh(),find:(...a)=>operation=h.controller.find(...a),cancel:()=>h.controller.cancel(),open:e=>h.controller.verifyOpen(e)},locale);
 try {
  const input=root.all().find(n=>n.tag==='textarea')!;input.value='BetaMarker';input.fire('input');root.all().find(n=>n.className==='tb-primary')!.fire('click');await expect(operation).rejects.toBe(injected);await Promise.resolve();expect(h.controller.status().phase).toBe('error');const text=root.all().map(n=>n.textContent).join('\n');expect(text).toContain('b.md');expect(text).toContain(locale==='en'?'Source could not be read':'无法读取来源');expect(text).not.toMatch(/ARBITRARY_BODY_SECRET|forged.md|本轮未提交|This run was not committed|remains available|仍在/);expect(h.controller.status().progress?.relativePath).toBe('b.md');expect(await tree(h.root)).toEqual(before);const original=Object.values((await h.store.load())!.fragments).flatMap(f=>f.evidence).find(e=>e.relativePath==='b.md')!;await expect(h.controller.verifyOpen(original)).rejects.toBe(injected);fs.readFile=realRead;expect((await h.controller.find('GammaMarker','low')).length).toBe(1);records.push({kind:'real-find-event',locale,hashesBefore:before,hashesAfter:await tree(h.root),sourceDiagnostic:h.controller.status().sourceDiagnostic});
 } finally {await operation.catch(()=>{});await Promise.resolve();dispose();h.controller.dispose();}
});
it('does not trust diagnostic-shaped properties on an external failure',async()=>{
 const h=await fixture();const injected=Object.assign(new Error('UNTRUSTED_BODY C:/secret-location'),{sourceDiagnostic:{relativePath:'evil.md',stage:'parsing',reason:'parse-failed'}});h.sources.list=async()=>{throw injected;};await expect(h.controller.refresh()).rejects.toBe(injected);expect(h.controller.status().sourceDiagnostic).toBeUndefined();expect(h.controller.status().commitOutcome).toBeUndefined();expect(h.commit).not.toHaveBeenCalled();h.controller.dispose();
});
it('a known dictionary donor read failure is not relabelled as the active source',async()=>{
 const h=await fixture(false,true);await fs.writeFile(path.join(h.root,'a.md'),'---\ntopics: [synthetic-proof]\n---\nAlphaMarker supplies a grounded dictionary proof.');const read=h.sources.read.bind(h.sources);let reads=0;const injected=Object.assign(new Error('DONOR_BODY_SECRET'),{code:'EIO'});
 h.sources.read=async(p,o)=>{if(p==='a.md'&&++reads===3)fs.readFile=(async(...a:any[])=>{if(String(a[0])===path.join(h.root,'a.md'))throw injected;return (realRead as any)(...a);}) as typeof fs.readFile;return read(p,o);};
 await expect(h.controller.refresh()).rejects.toBe(injected);expect(h.controller.status().sourceDiagnostic).toEqual({relativePath:'a.md',stage:'reading',reason:'read-failed'});expect(h.controller.status().progress?.relativePath).toBe('b.md');expect(h.request).toHaveBeenCalledTimes(1);expect(h.commit).not.toHaveBeenCalled();records.push({kind:'dictionary-donor-read-failure',status:h.controller.status(),mockRequests:1,commits:0});h.controller.dispose();
});
it('controller-driven retry clears the old failure notice after a complete repair',async()=>{
 const h=await fixture(true);vi.stubGlobal('document',{createElement:(tag:string)=>new NodeStub(tag)});const root=new NodeStub('main');const dispose=mountPanel(root as unknown as HTMLElement,{status:()=>h.controller.status(),subscribe:fn=>h.controller.subscribe(fn),refresh:()=>h.controller.refresh(),find:(...a)=>h.controller.find(...a),cancel:()=>h.controller.cancel(),open:async()=>{}},'zh');
 await fs.writeFile(path.join(h.root,'b.canvas'),'{');await h.controller.refresh().catch(()=>{});const notice=root.all().find(n=>n.className==='tb-notice')!;expect(notice.hidden).toBe(false);expect(notice.textContent).toContain('b.canvas');
 await fs.writeFile(path.join(h.root,'b.canvas'),JSON.stringify({nodes:[{type:'text',text:'Explicitly repaired synthetic knowledge.'}],edges:[]}));await h.controller.refresh();expect(h.controller.status().phase).toBe('idle');expect(notice.hidden).toBe(true);dispose();h.controller.dispose();
});

it('late legacy progress cannot replace cancelled status',async()=>{
 const h=await fixture();let complete!:()=>void;const gate=new Promise<void>(r=>complete=r);h.sources.list=async options=>{await gate;options?.onProgress?.({completed:999,total:999,phase:'done',relativePath:'C:/SECRET_LATE'});throw new Error('LATE_BODY');};const p=h.controller.refresh().catch(e=>e);await Promise.resolve();await Promise.resolve();h.controller.cancel();await p;const status=structuredClone(h.controller.status());complete();await new Promise(r=>setTimeout(r,10));expect(h.controller.status()).toEqual(status);expect(h.commit).not.toHaveBeenCalled();h.controller.dispose();
});
