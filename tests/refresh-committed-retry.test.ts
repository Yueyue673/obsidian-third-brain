// SPDX-License-Identifier: MIT
// Fresh synthetic notes, real file/core/store/Main/renderer. Host/DOM shells and
// controlled finalization exceptions are not native clicks or real OS faults.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import ThirdBrainPlugin from '../src/main';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore, type StoreIOEvent } from '../src/runtime/store';
import { defaults } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
import type { IndexState, ModelRequest, SearchResult } from '../src/core/types';

vi.mock('obsidian', () => ({ Plugin:class {}, ItemView:class {}, PluginSettingTab:class {}, MarkdownView:class {} }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
class Node {
  className=''; textContent=''; value=''; hidden=false; disabled=false; children:Node[]=[]; handlers=new Map<string,Array<() => void>>();
  constructor(readonly tag:string) {}
  append(...nodes:Node[]) { this.children.push(...nodes); }
  replaceChildren(...nodes:Node[]) { this.children=nodes; }
  setAttribute() {} remove() {} focus() {}
  get childElementCount() { return this.children.length; }
  addEventListener(event:string, handler:() => void) { this.handlers.set(event,[...this.handlers.get(event) ?? [],handler]); }
  fire(event:string) { for (const handler of this.handlers.get(event) ?? []) handler(); }
  all():Node[] { return [this,...this.children.flatMap(node => node.all())]; }
}
const sample = {
  en: { before:'Only on a dry paper model, slide the silver flap over the amber slot. A damp flap tears; never apply this exercise to a powered device.', after:'Only on a dry paper model, rest the jade pin beside the violet rim. A bent pin cannot locate the rim; never apply this exercise to a powered device.', late:'For an upright rehearsal board, a peach envelope holds the dotted guide. A torn envelope needs a rigid replacement.', query:'silver flap amber slot', nextQuery:'jade pin violet rim' },
  zh: { before:'只在干燥纸制模型上，把银色折片滑到琥珀插槽上方。潮湿折片容易撕裂；这个练习绝不能用于通电设备。', after:'只在干燥纸制模型上，把玉色插针放在紫色边沿旁。弯曲插针无法定位边沿；这个练习绝不能用于通电设备。', late:'演练板保持直立时，桃色信封可以收好点状导板。信封破损时必须换成硬质容器。', query:'银色折片琥珀插槽', nextQuery:'玉色插针紫色边沿' },
};
async function fixture(locale:'en'|'zh', syntheticAI=false, seed=true) {
  const s=sample[locale], base=path.resolve('.local/refresh-committed-retry'); await fs.mkdir(base,{recursive:true});
  const root=await fs.mkdtemp(path.join(base,locale+'-')), abs=(n:string) => path.join(root,n);
  await fs.writeFile(abs('original.md'),s.before+'\n\n'+s.late);
  const canvas=(body:string) => JSON.stringify({ nodes:[{ id:'synthetic-fold',type:'text',text:body }],edges:[] });
  await fs.writeFile(abs('copy.canvas'),canvas(s.before));
  await fs.mkdir(abs('Derived')); await fs.writeFile(abs('Derived/manual.txt'),'Synthetic unowned annotation.');
  const settings={ ...defaults,outputFolder:'Derived',excludes:[] as string[],locale,mode:syntheticAI?'local-model' as const:'local-excerpts' as const };
  let hook:(event:Readonly<StoreIOEvent>) => void|Promise<void> = () => {};
  const store=new OwnedStore(root,'Derived',{ io:event => hook(event) });
  const sources=new FileSources(root,() => settings,() => store.managedSourcePaths());
  // Explicit protocol stub only: no SDK/HTTP, inferred facets or semantic grading.
  const request=vi.fn(async (input:ModelRequest) => input.task==='interpret'
    ? {version:1,topics:[],concepts:[],mechanisms:[],atmosphere:[]}
    : {version:1,decision:'extract',fragments:[{title:'Synthetic exact point',summary:input.text,kind:'method',topics:[],concepts:[],mechanisms:[],atmosphere:[],quotes:[input.text],conditions:[],caveats:[]}]});
  const model=vi.fn(() => syntheticAI?{request}:undefined), saved=vi.fn(async () => {});
  const c=new ThirdBrainController(sources,store,() => settings,model,saved); await c.initialize(); if(seed) await c.refresh();
  const previous=await store.load(), opened:string[]=[];
  const app={ vault:{getFileByPath:(name:string) => ({path:name})},workspace:{getLeaf:() => ({openFile:async (file:{path:string}) => { opened.push(file.path); }})} };
  const port=ThirdBrainPlugin.prototype.panelPort.call({ controller:c,store,app } as unknown as ThirdBrainPlugin);
  const refreshes:Promise<void>[]=[], queries:Promise<SearchResult[]>[]=[], actions:Promise<void>[]=[];
  const refresh=port.refresh.bind(port),find=port.find.bind(port),open=port.open.bind(port),generated=port.openFragment!.bind(port);
  vi.spyOn(port,'refresh').mockImplementation(() => {const p=refresh();refreshes.push(p);return p;});
  vi.spyOn(port,'find').mockImplementation((...args) => {const p=find(...args);queries.push(p);return p;});
  vi.spyOn(port,'open').mockImplementation(e => {const p=open(e);actions.push(p);return p;});
  vi.spyOn(port,'openFragment').mockImplementation((...args) => {const p=generated(...args);actions.push(p);return p;});
  vi.stubGlobal('document',{ createElement:(tag:string) => new Node(tag) });
  const container=new Node('main'), t=messages(locale),dispose=mountPanel(container as unknown as HTMLElement,port,locale);
  const button=(text:string) => container.all().find(n => n.tag==='button'&&n.textContent===text)!;
  const start=() => {const before=refreshes.length;button(t.index).fire('click');expect(refreshes).toHaveLength(before+1);return refreshes.at(-1)!;};
  const search=async(query:string) => {const input=container.all().find(n => n.className==='tb-idea')!;input.value=query;input.fire('input');const before=queries.length;button(t.find).fire('click');expect(queries).toHaveLength(before+1);const hits=await queries.at(-1)!;await Promise.resolve();return {hits,cards:container.all().filter(n => n.className==='tb-result')};};
  const click=async(button:Node) => {const before=actions.length;button.fire('click');expect(actions).toHaveLength(before+1);return actions.at(-1)!;};
  const cardActions=(card:Node) => card.all().filter(n => n.className==='tb-source'||n.tag==='button'&&n.textContent===t.openFragment);
  const snapshot=async() => {
    const manifest=JSON.parse(await fs.readFile(abs('Derived/.third-brain/state.json'),'utf8'));
    const names=['Derived/.third-brain/state.json',...Object.keys(manifest.owned).map(n => 'Derived/'+n)];
    return Object.fromEntries(await Promise.all(names.map(async n => [n,{sha256:hash(await fs.readFile(abs(n))),mtimeNs:(await fs.stat(abs(n),{bigint:true})).mtimeNs.toString()}])));
  };
  const protect=async() => Object.fromEntries(await Promise.all(['original.md','copy.canvas','Derived/manual.txt'].map(async n => [n,{sha256:hash(await fs.readFile(abs(n))),mtimeNs:(await fs.stat(abs(n),{bigint:true})).mtimeNs.toString()}])));
  const rewrite=async() => {await fs.writeFile(abs('copy.canvas'),canvas(s.after));};
  const cleanup=async() => {c.cancel();await Promise.allSettled([...refreshes,...queries,...actions]);dispose();c.dispose();};
  return {s,root,abs,c,store,sources,port,t,container,previous,opened,saved,model,request,start,search,click,cardActions,snapshot,protect,rewrite,setHook:(value:typeof hook) => {hook=value;},cleanup};
}

for (const outcome of ['failure','cancelled'] as const) it.each(['en','zh'] as const)(`%s same-session Refresh reuses the committed revision after finalization is ${outcome}`,async locale => {
  const h=await fixture(locale);
  try {
    const old=await h.search(h.s.query),common=old.hits.find(r => r.fragment.summary===h.s.before)!;
    expect(common.fragment.evidence).toHaveLength(2);
    const oldCard=old.cards[old.hits.indexOf(common)];
    await h.rewrite(); const protectedBytes=await h.protect(), savedBefore=h.saved.mock.calls.length;
    let faults=0; h.setHook(event => {if(event.phase==='before-finalize'&&faults++===0) {if(outcome==='cancelled') h.c.cancel();else throw new Error('SYNTHETIC_FINALIZATION_DETAIL');}});
    if(outcome==='cancelled') await expect(h.start()).rejects.toMatchObject({name:'AbortError'});
    else await expect(h.start()).rejects.toThrow('recovery required');
    await Promise.resolve();
    expect(faults).toBe(1);expect(h.saved.mock.calls.length).toBe(savedBefore);
    expect(h.c.status()).toMatchObject({phase:outcome==='cancelled'?'cancelled':'error',commitOutcome:'unknown'});
    const notice=h.container.all().find(n => n.className==='tb-notice')!;
    expect(notice.textContent).toContain(h.t.commitUnknown);expect(notice.textContent).not.toContain(h.t.retainedIndex);expect(notice.textContent).not.toContain('SYNTHETIC_FINALIZATION_DETAIL');
    const stateBytes=await fs.readFile(h.abs('Derived/.third-brain/state.json'));
    const committed=JSON.parse(stateBytes.toString()).index as IndexState, settled=await h.snapshot();
    expect(committed).not.toEqual(h.previous);
    expect(Object.values(committed.fragments).filter(f => f.summary===h.s.before)[0].evidence.map(e => e.relativePath)).toEqual(['original.md']);
    expect(Object.values(committed.fragments).filter(f => f.summary===h.s.after)[0].evidence.map(e => e.relativePath)).toEqual(['copy.canvas']);
    h.setHook(() => {});
    // The user retries the existing Index/Refresh button: deliberately NO initialize.
    await h.start(); await Promise.resolve();
    const reloaded=(await new OwnedStore(h.root,'Derived').load())!;
    expect.soft(reloaded).toEqual(committed);
    expect.soft(await fs.readFile(h.abs('Derived/.third-brain/state.json'))).toEqual(stateBytes);
    expect.soft(await h.snapshot()).toEqual(settled);
    expect(h.c.status()).toMatchObject({phase:'idle',updatedAt:committed.updatedAt,hasCompleteIndex:true});
    expect(notice.hidden).toBe(true);
    const oldOpenCount=h.opened.length;
    for(const button of h.cardActions(oldCard)) await expect(h.click(button)).rejects.toThrow();
    expect(h.opened).toHaveLength(oldOpenCount);
    for(const query of [h.s.query,h.s.nextQuery]) {
      const found=await h.search(query); expect(found.hits.length).toBeGreaterThan(0);
      const wanted=query===h.s.query?h.s.before:h.s.after,position=found.hits.findIndex(r => r.fragment.summary===wanted);expect(position).toBeGreaterThanOrEqual(0);
      const hit=found.hits[position]; expect(hit.fragment.mode).toBe('local');expect(hit.reasons.length).toBeGreaterThan(0);
      for(const evidence of hit.fragment.evidence){const source=(await h.sources.read(evidence.relativePath))!;expect(source.hash).toBe(evidence.sourceHash);expect(source.id).toBe(evidence.sourceId);expect(reloaded.sources[evidence.relativePath].fragmentIds).toContain(hit.fragment.id);expect(source.text).toContain(evidence.quote);}
      for(const button of h.cardActions(found.cards[position])) await h.click(button);
    }
    await h.start();expect(await h.snapshot()).toEqual(settled);expect(await h.protect()).toEqual(protectedBytes);
    expect(h.model.mock.results.every(r => r.type==='return'&&r.value===undefined)).toBe(true);
    for(const name of ['journal.json','write.lock']) await expect(fs.stat(h.abs('Derived/.third-brain/'+name))).rejects.toMatchObject({code:'ENOENT'});
    expect((await fs.readdir(h.abs('Derived/.third-brain/transactions'),{recursive:true,withFileTypes:true})).filter(n => n.isFile())).toHaveLength(0);
  } finally {await h.cleanup();}
},60000);

async function interrupted(h:Awaited<ReturnType<typeof fixture>>) {
  await h.rewrite(); let hits=0;
  h.setHook(event => {if(event.phase==='before-finalize'&&++hits===1) throw new Error('SYNTHETIC_FINALIZATION_DETAIL');});
  await expect(h.start()).rejects.toThrow('recovery required');expect(hits).toBe(1);
  h.setHook(() => {});
  return fs.readFile(h.abs('Derived/.third-brain/state.json'));
}
function latch() {
  let release!:() => void; const promise=new Promise<void>(resolve => {release=resolve;});return {promise,release};
}

it('synthetic ModelPort does not repeat extraction for already committed unchanged sources',async () => {
  const h=await fixture('en',true);
  try {
    const bytes=await interrupted(h), calls=h.request.mock.calls.length, settled=await h.snapshot();
    expect(calls).toBeGreaterThan(0);expect(h.request.mock.calls.every(([input]) => input.task==='extract')).toBe(true);
    await h.start();expect(h.request).toHaveBeenCalledTimes(calls);
    expect(await fs.readFile(h.abs('Derived/.third-brain/state.json'))).toEqual(bytes);
    expect(await h.snapshot()).toEqual(settled);
    // A genuinely new source revision still requires new controlled analysis.
    await fs.appendFile(h.abs('original.md'),'\n\nA fictional ivory bracket needs a dry shelf; cracked brackets are excluded.');
    await h.start();expect(h.request.mock.calls.length).toBeGreaterThan(calls);
    const newCalls=h.request.mock.calls.length;await h.start();expect(h.request).toHaveBeenCalledTimes(newCalls);
  } finally {await h.cleanup();}
},60000);

it('human changes block same-session recovery before source analysis or commit and remain untouched',async () => {
  const h=await fixture('zh');
  try {
    const bytes=await interrupted(h),manifest=JSON.parse(bytes.toString());
    const name='Derived/'+Object.keys(manifest.owned)[0],target=h.abs(name),original=await fs.readFile(target);
    await fs.appendFile(target,'\nSynthetic human amendment.');const edited=await fs.readFile(target),blocked=await h.snapshot(),protectedBytes=await h.protect();
    const list=vi.spyOn(h.sources,'list'),commit=vi.spyOn(h.store,'commit');h.model.mockClear();h.saved.mockClear();
    await expect(h.start()).rejects.toThrow();await Promise.resolve();
    expect(h.c.status()).toMatchObject({phase:'error',commitOutcome:'unknown'});
    const notice=h.container.all().find(n => n.className==='tb-notice')!;
    expect(notice.textContent).toContain(h.t.commitUnknown);expect(notice.textContent).not.toContain(h.t.retainedIndex);
    expect(list).not.toHaveBeenCalled();expect(commit).not.toHaveBeenCalled();expect(h.model).not.toHaveBeenCalled();expect(h.saved).not.toHaveBeenCalled();
    expect(await h.snapshot()).toEqual(blocked);expect(await fs.readFile(target)).toEqual(edited);expect(await h.protect()).toEqual(protectedBytes);
    // Only the author of this disposable fixture restores captured bytes.
    await fs.writeFile(target,original);const restored=await h.snapshot();await h.start();
    expect(await h.snapshot()).toEqual(restored);expect(await fs.readFile(h.abs('Derived/.third-brain/state.json'))).toEqual(bytes);
  } finally {await h.cleanup();}
},60000);

for (const boundary of ['recover','load'] as const) for (const late of ['result','rejection'] as const) it(`cancelled ${boundary} drains a late ${late}, keeps uncertainty, and permits safe retry`,async () => {
  const h=await fixture('en'),entered=latch(),gate=latch();let running:Promise<void>|undefined;
  try {
    const bytes=await interrupted(h),before=await h.snapshot(),failure=new TypeError('SYNTHETIC_RECOVERY_DETAIL');
    const wait=async () => {entered.release();await gate.promise;if(late==='rejection')throw failure;};
    if(boundary==='recover') {
      const actual=h.store.recover.bind(h.store);vi.spyOn(h.store,'recover').mockImplementationOnce(async () => {await wait();await actual();});
    } else {
      const actual=h.store.load.bind(h.store);vi.spyOn(h.store,'load').mockImplementationOnce(async () => {await wait();return actual();});
    }
    const list=vi.spyOn(h.sources,'list'),commit=vi.spyOn(h.store,'commit');h.model.mockClear();h.saved.mockClear();let settled=false;
    running=h.start();const outcome=running.then(() => {settled=true;return null;},error => {settled=true;return error;});
    await entered.promise;h.c.cancel();await Promise.resolve();
    expect(settled).toBe(false);expect(h.c.status()).toMatchObject({phase:'indexing',cancelRequested:true});
    await expect(h.c.refresh()).rejects.toThrow('already running');await expect(h.c.find(h.s.query,'low')).rejects.toThrow('already running');
    expect(list).not.toHaveBeenCalled();expect(commit).not.toHaveBeenCalled();expect(h.model).not.toHaveBeenCalled();
    gate.release();expect(await outcome).toMatchObject({name:'AbortError'});expect(h.c.status()).toMatchObject({phase:'cancelled',commitOutcome:'unknown'});
    expect(list).not.toHaveBeenCalled();expect(commit).not.toHaveBeenCalled();expect(h.saved).not.toHaveBeenCalled();
    expect(await h.snapshot()).toEqual(before);await h.start();expect(await h.snapshot()).toEqual(before);
    expect(await fs.readFile(h.abs('Derived/.third-brain/state.json'))).toEqual(bytes);expect(h.c.status().phase).toBe('idle');
  } finally {gate.release();await running?.catch(() => {});await h.cleanup();}
},60000);

it('an unknown recovery error preserves identity and is not echoed; later retry reconciles',async () => {
  const h=await fixture('en');
  try {
    const bytes=await interrupted(h),failure=new TypeError('SYNTHETIC_RECOVERY_DETAIL');
    vi.spyOn(h.store,'load').mockRejectedValueOnce(failure);const commit=vi.spyOn(h.store,'commit');h.model.mockClear();
    await expect(h.start()).rejects.toBe(failure);await Promise.resolve();
    expect(h.c.status()).toMatchObject({phase:'error',commitOutcome:'unknown'});
    const notice=h.container.all().find(n => n.className==='tb-notice')!;
    expect(notice.textContent).toContain(h.t.commitUnknown);expect(notice.textContent).not.toContain('SYNTHETIC_RECOVERY_DETAIL');
    expect(commit).not.toHaveBeenCalled();expect(h.model).not.toHaveBeenCalled();
    await h.start();expect(await fs.readFile(h.abs('Derived/.third-brain/state.json'))).toEqual(bytes);
  } finally {await h.cleanup();}
},60000);

it('ordinary refresh and pre-commit failure do not introduce recovery reloads',async () => {
  const h=await fixture('en');
  try {
    const recover=vi.spyOn(h.store,'recover'),load=vi.spyOn(h.store,'load'),before=await h.snapshot();
    await h.start();expect(await h.snapshot()).toEqual(before);expect(recover).not.toHaveBeenCalled();expect(load).not.toHaveBeenCalled();
    const failure=new TypeError('SYNTHETIC_SOURCE_LIST_DETAIL');vi.spyOn(h.sources,'list').mockRejectedValueOnce(failure);
    await expect(h.start()).rejects.toBe(failure);expect(h.c.status().commitOutcome).toBeUndefined();
    await h.start();expect(recover).not.toHaveBeenCalled();expect(load).not.toHaveBeenCalled();expect(await h.snapshot()).toEqual(before);
  } finally {await h.cleanup();}
},60000);

it('explicit initialize consumes recovery so the next refresh needs no second reconciliation',async () => {
  const h=await fixture('en');
  try {
    const bytes=await interrupted(h);await h.c.initialize();
    const recover=vi.spyOn(h.store,'recover'),load=vi.spyOn(h.store,'load');
    await h.start();expect(recover).not.toHaveBeenCalled();expect(load).not.toHaveBeenCalled();
    expect(await fs.readFile(h.abs('Derived/.third-brain/state.json'))).toEqual(bytes);
  } finally {await h.cleanup();}
},60000);

it.each([false,true])('a pre-state rollback permits same-session retry (prior complete index: %s)',async seed => {
  const h=await fixture('en',false,seed);
  try {
    const previousBytes=seed?await fs.readFile(h.abs('Derived/.third-brain/state.json')):null;
    await h.rewrite();const protectedBytes=await h.protect();let faults=0;
    h.setHook(event => {if(event.phase==='before-apply'&&event.target==='Derived/.third-brain/state.json'&&++faults===1)throw new Error('SYNTHETIC_PRE_STATE_DETAIL');});
    await expect(h.start()).rejects.toThrow('SYNTHETIC_PRE_STATE_DETAIL');expect(faults).toBe(1);
    expect(h.c.status()).toMatchObject({phase:'error',commitOutcome:'unknown',hasCompleteIndex:seed});
    if(previousBytes) expect(await fs.readFile(h.abs('Derived/.third-brain/state.json'))).toEqual(previousBytes);
    else await expect(fs.stat(h.abs('Derived/.third-brain/state.json'))).rejects.toMatchObject({code:'ENOENT'});
    h.setHook(() => {});await h.start();
    const current=(await new OwnedStore(h.root,'Derived').load())!;
    expect(Object.values(current.fragments).some(f => f.summary===h.s.after)).toBe(true);
    const stable=await h.snapshot();await h.start();expect(await h.snapshot()).toEqual(stable);expect(await h.protect()).toEqual(protectedBytes);
  } finally {await h.cleanup();}
},60000);
