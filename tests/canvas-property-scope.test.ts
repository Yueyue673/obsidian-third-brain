// SPDX-License-Identifier: MIT
// Self-authored synthetic declared properties, not AI-discovered semantics.
// Real FileSources/Controller/OwnedStore/Main/renderer; DOM/host shells, not native clicks.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { MarkdownView } from 'obsidian';
import ThirdBrainPlugin from '../src/main';
import { ThirdBrainController } from '../src/controller';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { analyzeSource, buildIndex, emptyIndex, prepareSource } from '../src/core';
import { buildFragmentNetwork } from '../src/core/connections';
import { sourceFacets, hasReadableQuote } from '../src/core/sources';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
import type { SearchResult } from '../src/core/types';
vi.mock('obsidian', () => ({ Plugin:class {}, ItemView:class {}, PluginSettingTab:class {}, MarkdownView:class {} }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const a = 'Only in the inert paper rehearsal, a cobalt seal rests flat in a felt cradle; a damp tray curls its corners.';
const b = 'The unrelated synthetic sundial trial uses a copper pointer to read the afternoon shadow; clouds prevent that reading.';
const facetA = 'felt cradle', facetB = 'shadow reading';
const text = (body:string,label:string,privacy='normal') => `---\nprivacy: ${privacy}\nconcepts: [${label}]\n---\n${body}`;
const canvas = (...texts:string[]) => JSON.stringify({ nodes:texts.map((t,i) => ({ id:'n'+i,type:'text',x:i*400,y:0,width:320,height:240,text:t })),edges:[] });
const raw = canvas(text(a,facetA),text(b,facetB));
it('Canvas local declarations belong to their own text node, not unrelated nodes; document privacy still aggregates', async () => {
  const s=prepareSource('synthetic.canvas',raw,'hash','source');
  expect(sourceFacets(s).concepts).toEqual([facetA,facetB]); // Whole-source vocabulary hints remain available.
  const result=await analyzeSource(s,{ mode:'local-excerpts',cloudConsent:false });
  expect(result.fragments).toHaveLength(2);
  expect(result.fragments.find(f => f.summary===a)!.facets.concepts).toEqual([facetA]);
  expect(result.fragments.find(f => f.summary===b)!.facets.concepts).toEqual([facetB]);
  const mixed=prepareSource('synthetic.canvas',canvas(text(a,facetA),text(b,facetB,'private')),'mixed','source');
  expect(mixed.privacy).toBe('private');expect((await analyzeSource(mixed,{ mode:'local-excerpts',cloudConsent:false })).fragments.every(f => f.privacy==='private')).toBe(true);
});
class Node {
  className='';textContent='';value='';hidden=false;disabled=false;children:Node[]=[];attrs:Record<string,string>={};handlers=new Map<string,(()=>void)[]>();
  constructor(readonly tag:string){} append(...n:Node[]){this.children.push(...n);}replaceChildren(...n:Node[]){this.children=n;}setAttribute(k:string,v:string){this.attrs[k]=v;}remove(){}focus(){}get childElementCount(){return this.children.length;}
  addEventListener(k:string,f:()=>void){this.handlers.set(k,[...this.handlers.get(k)??[],f]);}fire(k:string){for(const f of this.handlers.get(k)??[])f();}all():Node[]{return [this,...this.children.flatMap(n=>n.all())];}
}
it.each(['en','zh'] as const)('actual %s idea → node property → saved links does not attribute the unrelated node', async locale => {
  const a = locale==='en' ? 'Only in the inert paper rehearsal, a cobalt seal rests flat in a felt cradle; a damp tray curls its corners.' : '只在惰性纸制演练中，钴蓝封签放进毛毡托座才保持平整；潮湿托盘会卷起它的边角。';
  const b = locale==='en' ? 'The unrelated synthetic sundial trial uses a copper pointer to read the afternoon shadow; clouds prevent that reading.' : '另一份无关的合成日晷演练用铜指针读取午后影线；云层遮挡时不能读数。';
  const facetA=locale==='en'?'felt cradle':'毛毡托座',facetB=locale==='en'?'shadow reading':'影线读数';
  const raw=canvas(text(a,facetA),text(b,facetB));
  const base=path.resolve('.local/canvas-property-scope');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'vault-'));
  await fs.writeFile(path.join(root,'board.canvas'),raw);await fs.mkdir(path.join(root,'Derived'));const human='Synthetic human-owned note stays intact.';await fs.writeFile(path.join(root,'Derived/manual.txt'),human);
  const before=(await fs.stat(path.join(root,'board.canvas'),{bigint:true})).mtimeNs.toString();
  const settings={...defaults,outputFolder:'Derived',excludes:[] as string[],locale},store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths());
  const factory=vi.fn(()=>undefined),c=new ThirdBrainController(sources,store,()=>settings,factory,async()=>{});let dispose:(()=>void)|undefined;
  const pending:Promise<SearchResult[]>[]=[],operations:Promise<void>[]=[],opened:string[]=[];
  try {
    await c.initialize();await c.refresh();await c.initialize();const index=(await store.load())!;
    const left=Object.values(index.fragments).find(f=>f.summary===a)!,right=Object.values(index.fragments).find(f=>f.summary===b)!;
    const leaf={view:Object.create(MarkdownView.prototype),openFile:async(f:{path:string})=>{opened.push(f.path);}};
    const plugin=Object.assign(Object.create(ThirdBrainPlugin.prototype),{settings,store,controller:c,app:{vault:{getFileByPath:(n:string)=>({path:n,extension:path.extname(n).slice(1)})},workspace:{getLeaf:()=>leaf}}}) as ThirdBrainPlugin;
    const port=plugin.panelPort(),find=port.find.bind(port),open=port.open.bind(port),generated=port.openFragment!.bind(port);
    const findSpy=vi.spyOn(port,'find').mockImplementation((...args)=>{const p=find(...args);pending.push(p);return p;});
    vi.spyOn(port,'open').mockImplementation(e=>{const p=open(e);operations.push(p);return p;});vi.spyOn(port,'openFragment').mockImplementation((...args)=>{const p=generated(...args);operations.push(p);return p;});
    vi.stubGlobal('document',{createElement:(tag:string)=>new Node(tag)});const container=new Node('main');dispose=mountPanel(container as unknown as HTMLElement,port,locale);
    const input=container.all().find(n=>n.className==='tb-idea')!;input.value=locale==='en'?'I want to keep a cobalt seal flat in a felt cradle':'我想让毛毡托座里的钴蓝封签保持平整';input.fire('input');container.all().find(n=>n.tag==='button'&&n.textContent===messages(locale).find)!.fire('click');
    const first=await pending.at(-1)!;await Promise.resolve();expect(first.some(r=>r.fragment.id===left.id)).toBe(true);
    const property=container.all().find(n=>n.attrs['data-channel']==='concepts'&&n.textContent.endsWith(facetA))!;expect(property).toBeDefined();property.fire('click');const selected=await pending.at(-1)!;await Promise.resolve();
    expect(findSpy.mock.calls.at(-1)?.[3]).toEqual({channel:'concepts',value:facetA});
    // Even with exact quotations and one source file, the unrelated node must not be a facet member.
    expect(selected.map(r=>r.fragment.id)).toEqual([left.id]);
    expect(buildFragmentNetwork(index).connections.get(left.id)).toEqual([]);
    const saved=await fs.readFile(path.join(root,await store.fragmentPath(left.id)),'utf8');expect(saved).not.toContain('](<'+path.basename(await store.fragmentPath(right.id))+'>)');
    for(const e of left.evidence){const current=(await sources.read(e.relativePath))!;expect(e.sourceHash).toBe(current.hash);expect(hasReadableQuote(current,e.quote)).toBe(true);}
    const actions=container.all().filter(n=>n.className==='tb-source'||n.tag==='button'&&n.textContent===messages(locale).openFragment);
    for(const button of actions){button.fire('click');await operations.at(-1)!;}
    expect(opened).toHaveLength(left.evidence.length+1);
    const statePath=path.join(root,'Derived/.third-brain/state.json'),bytes=await fs.readFile(statePath),mtime=(await fs.stat(statePath,{bigint:true})).mtimeNs.toString();await c.refresh();await c.initialize();expect(await store.load()).toEqual(index);expect(await fs.readFile(statePath)).toEqual(bytes);expect((await fs.stat(statePath,{bigint:true})).mtimeNs.toString()).toBe(mtime);
    expect(await fs.readFile(path.join(root,'board.canvas'),'utf8')).toBe(raw);expect((await fs.stat(path.join(root,'board.canvas'),{bigint:true})).mtimeNs.toString()).toBe(before);expect(await fs.readFile(path.join(root,'Derived/manual.txt'),'utf8')).toBe(human);
    expect(factory.mock.results.every(r=>r.type==='return'&&r.value===undefined)).toBe(true);
    const refuse=async()=>{const count=opened.length;for(const button of actions){button.fire('click');await expect(operations.at(-1)).rejects.toThrow();}expect(opened).toHaveLength(count);};
    settings.excludes.push('board.canvas');await refuse();expect(await c.find('', 'medium', 'normal', {channel:'concepts',value:facetA})).toEqual([]);settings.excludes.pop();
    // Only our newly authored synthetic source is edited. Even an unrelated
    // node's metadata revision retires all old whole-file endpoint proofs.
    await fs.writeFile(path.join(root,'board.canvas'),raw.replace(facetB,facetB+' revised'));await refuse();expect(await fs.readFile(statePath)).toEqual(bytes);
    await fs.writeFile(path.join(root,'board.canvas'),raw);await c.refresh();expect(await fs.readFile(statePath)).toEqual(bytes);
    const generatedPath=path.join(root,await store.fragmentPath(left.id)),owned=await fs.readFile(generatedPath);await fs.appendFile(generatedPath,'\nSynthetic human amendment.');const edited=await fs.readFile(generatedPath);
    await refuse();await expect(c.refresh()).rejects.toThrow();expect(await fs.readFile(generatedPath)).toEqual(edited);expect(await fs.readFile(statePath)).toEqual(bytes);
    await fs.writeFile(generatedPath,owned);await c.initialize();await c.refresh();expect(await fs.readFile(statePath)).toEqual(bytes);
  } finally {await Promise.allSettled([...pending,...operations]);dispose?.();c.dispose();}
},20000);

it.each(['topics','concepts','mechanisms','atmosphere'] as const)('scopes declared %s after local list/footnote fan-out and leaves untagged nodes empty', async channel=>{
  const body='# Only inert replicas\n\n- Separate workshop points:\n  - The cobalt seal rests in a felt cradle.[^limit]\n  - The scarlet hinge stays folded.\n\n[^limit]: Limitation: Only dry paper replicas.';
  const left=`---\n${channel}: [woven witness]\n---\n${body}`,right=`---\n${channel}: [shadow pointer]\n---\n${b}`;
  const input=canvas(left,right,'An untagged synthetic chalk tablet stays readable.'),s=prepareSource('synthetic.canvas',input,hash(input),'source');
  const r=await analyzeSource(s,{mode:'local-excerpts',cloudConsent:false});expect(r.fragments).toHaveLength(4);
  for(const f of r.fragments){expect(f.facets[channel]).toEqual(f.summary.includes('Only inert replicas')?['woven witness']:f.summary===b?['shadow pointer']:[]);expect(f.mode).toBe('local');for(const e of f.evidence)expect(hasReadableQuote(s,e.quote)).toBe(true);}
  const focused=r.fragments.find(f=>f.summary.includes('cobalt seal'))!;expect(focused.summary).toContain('Only dry paper replicas.');expect(focused.localContext).toContain('scarlet hinge');
});
it('whole Markdown properties and exact duplicate Canvas node declarations retain their existing meaning',async()=>{
  const md=text(a+'\n\n'+b,facetA),r=await analyzeSource(prepareSource('synthetic.md',md,hash(md),'md'),{mode:'local-excerpts',cloudConsent:false});expect(r.fragments).toHaveLength(2);expect(r.fragments.every(f=>f.facets.concepts[0]===facetA)).toBe(true);
  const input=canvas(text(a,facetA),text(a,facetB),text(b,'unrelated dial'));
  const c=await analyzeSource(prepareSource('synthetic.canvas',input,hash(input),'canvas'),{mode:'local-excerpts',cloudConsent:false});expect(c.fragments).toHaveLength(2);expect(c.fragments.find(f=>f.summary===a)!.facets.concepts).toEqual([facetA,facetB]);expect(c.fragments.find(f=>f.summary===b)!.facets.concepts).toEqual(['unrelated dial']);
});
it('AI Canvas primary inputs, file-wide vocabulary hints and AI cache signatures stay unchanged offline',async()=>{
  const s=prepareSource('synthetic.canvas',raw,hash(raw),'canvas'),request=vi.fn(async(input:unknown)=>({version:1,decision:'insufficient-context',fragments:[]}));
  for(const mode of ['local-model','cloud-model'] as const){request.mockClear();await analyzeSource(s,{mode,cloudConsent:true,model:{request}});expect(request.mock.calls.map(c=>(c[0] as {text:string}).text)).toEqual([a,b]);for(const call of request.mock.calls)expect((call[0] as {vocabulary:{concepts:string[]}}).vocabulary.concepts).toEqual([facetA,facetB]);
    const settings={...defaults,mode,outputFolder:'Derived'};expect(generationSignature(settings)).toBe(JSON.stringify({version:1,mode,endpoint:defaults.endpoint,model:defaults.model,excludes:[],maxFileBytes:defaults.maxFileBytes}));
    const first=await buildIndex([s],{mode,cloudConsent:true,signature:generationSignature(settings),previous:emptyIndex(),model:{request}});request.mockClear();expect(await buildIndex([s],{mode,cloudConsent:true,signature:generationSignature(settings),previous:first,model:{request}})).toEqual(first);expect(request).not.toHaveBeenCalled();
  }
  request.mockClear();const protectedRaw=canvas(text(a,facetA),text(b,facetB,'private'));await analyzeSource(prepareSource('synthetic.canvas',protectedRaw,hash(protectedRaw),'canvas'),{mode:'cloud-model',cloudConsent:true,model:{request}});expect(request).not.toHaveBeenCalled();
});

it('actual mixed-format duplicate donors reconcile node properties without keeping a removed donor label',async()=>{
  const scope=path.resolve('.local/canvas-property-scope');await fs.mkdir(scope,{recursive:true});const root=await fs.mkdtemp(path.join(scope,'duplicates-'));
  const originals=new Map<string,{bytes:Buffer;mtime:string}>();const put=async(n:string,body:string)=>{await fs.writeFile(path.join(root,n),body);originals.set(n,{bytes:await fs.readFile(path.join(root,n)),mtime:(await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()});};
  await put('board.canvas',canvas(text(a,facetA),text(a,'woven duplicate'),text(b,facetB)));await put('copy.md',text(a,'paper duplicate','private'));await put('same-node-peer.md',text('A separate inert swatch records the felt cradle shape.',facetA,'private'));
  const settings={...defaults,outputFolder:'Derived',excludes:[] as string[]},store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths()),c=new ThirdBrainController(sources,store,()=>settings,()=>undefined,async()=>{});
  try{await c.initialize();await c.refresh();await c.initialize();const first=(await store.load())!,merged=Object.values(first.fragments).find(f=>f.summary===a)!,other=Object.values(first.fragments).find(f=>f.summary===b)!;
    expect(merged.facets.concepts).toEqual([facetA,'paper duplicate','woven duplicate'].sort());expect(merged.privacy).toBe('private');expect(new Set(merged.evidence.map(e=>e.relativePath))).toEqual(new Set(['board.canvas','copy.md']));expect(other.facets.concepts).toEqual([facetB]);
    expect(buildFragmentNetwork(first).connections.get(merged.id)!.some(v=>v.targetId!==other.id&&v.shared.some(s=>s.value===facetA))).toBe(true);
    const statePath=path.join(root,'Derived/.third-brain/state.json'),bytes=await fs.readFile(statePath);await c.refresh();expect(await store.load()).toEqual(first);expect(await fs.readFile(statePath)).toEqual(bytes);
    const card=(await c.find('cobalt seal','medium'))[0];expect(card.fragment.id).toBe(merged.id);
    settings.excludes.push('copy.md');for(const e of card.fragment.evidence)await expect(c.verifyOpen(e)).rejects.toThrow();await c.refresh();await c.initialize();const next=(await store.load())!;
    expect(next.fragments[merged.id].facets.concepts).toEqual([facetA,'woven duplicate']);expect(next.fragments[merged.id].privacy).toBe('normal');expect(next.fragments[other.id].facets.concepts).toEqual([facetB]);
    settings.excludes.pop();await put('copy.md',text(a,'changed paper','private'));await c.refresh();await c.initialize();const changed=(await store.load())!;expect(changed.fragments[merged.id].facets.concepts).toEqual(['changed paper',facetA,'woven duplicate'].sort());expect(changed.fragments[other.id].facets.concepts).toEqual([facetB]);
    await put('board.canvas',canvas(text(a,'new cradle'),text(b,facetB)));await c.refresh();await c.initialize();const changedNode=(await store.load())!;expect(changedNode.fragments[merged.id].facets.concepts).toEqual(['changed paper','new cradle']);expect(changedNode.fragments[other.id].facets.concepts).toEqual([facetB]);
    const after=await fs.readFile(statePath);await c.refresh();expect(await fs.readFile(statePath)).toEqual(after);for(const[n,v]of originals){expect(await fs.readFile(path.join(root,n))).toEqual(v.bytes);expect((await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()).toBe(v.mtime);}
  }finally{c.dispose();}
},20000);

it('actual old store bytes load unchanged; explicit local refresh upgrades once, archives old links and preserves cancel/human/original safety',async()=>{
  const legacy=JSON.parse(await fs.readFile('tests/fixtures/canvas-property-legacy.json','utf8'));
  const scope=path.resolve('.local/canvas-property-scope');await fs.mkdir(scope,{recursive:true});const root=await fs.mkdtemp(path.join(scope,'upgrade-'));await fs.writeFile(path.join(root,'board.canvas'),legacy.raw);const originalTime=(await fs.stat(path.join(root,'board.canvas'),{bigint:true})).mtimeNs.toString();
  await fs.mkdir(path.join(root,'Derived'));const human='Synthetic human-authored material inside the derived folder.';await fs.writeFile(path.join(root,'Derived/manual.txt'),human);
  const settings={...defaults,outputFolder:'Derived',excludes:[]},store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths()),c=new ThirdBrainController(sources,store,()=>settings,()=>undefined,async()=>{});
  try{const snapshots=await sources.list();await store.commit(structuredClone(legacy.index),()=>sources.verify(snapshots));const marker=JSON.parse(await fs.readFile(path.join(root,'Derived/.third-brain/marker.json'),'utf8'));const oldFiles:Buffer[]=[];
    for(const id of Object.keys(legacy.index.fragments)){const body=await fs.readFile(path.join(root,await store.fragmentPath(id)));expect(body.toString().replaceAll(marker.storeId,'SYNTHETIC_STORE_ID')).toBe(legacy.rendered[id]);oldFiles.push(body);}
    const statePath=path.join(root,'Derived/.third-brain/state.json'),old=await fs.readFile(statePath);await c.initialize();expect(await store.load()).toEqual(legacy.index);expect(await fs.readFile(statePath)).toEqual(old);expect(buildFragmentNetwork(legacy.index).connections.values().next().value).toHaveLength(1);
    const list=sources.list.bind(sources);let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>{enter=r;}),latch=new Promise<void>(r=>{release=r;});vi.spyOn(sources,'list').mockImplementationOnce(async options=>{enter();await latch;return list(options);});const commit=vi.spyOn(store,'commit'),pending=c.refresh();await entered;c.cancel();release();await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(old);
    await c.refresh();await c.initialize();const repaired=(await store.load())!;expect(repaired.signature).not.toBe(legacy.index.signature);expect(Object.keys(repaired.fragments)).toEqual(Object.keys(legacy.index.fragments));expect(Object.values(repaired.fragments).find(f=>f.summary===a)!.facets.concepts).toEqual([facetA]);expect(Object.values(repaired.fragments).find(f=>f.summary===b)!.facets.concepts).toEqual([facetB]);expect([...buildFragmentNetwork(repaired).connections.values()].every(v=>!v.length)).toBe(true);
    const history=await fs.readdir(path.join(root,'Derived/.third-brain/history'),{recursive:true,withFileTypes:true}),archived=await Promise.all(history.filter(e=>e.isFile()).map(e=>fs.readFile(path.join(e.parentPath,e.name))));for(const body of oldFiles)expect(archived.some(v=>v.equals(body))).toBe(true);
    const names=['Derived/.third-brain/state.json'];for(const id of Object.keys(repaired.fragments))names.push(await store.fragmentPath(id));const before=await Promise.all(names.map(async n=>({n,bytes:await fs.readFile(path.join(root,n)),mtime:(await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()})));
    await c.refresh();for(const v of before){expect(await fs.readFile(path.join(root,v.n))).toEqual(v.bytes);expect((await fs.stat(path.join(root,v.n),{bigint:true})).mtimeNs.toString()).toBe(v.mtime);}
    const owned=before[1],file=path.join(root,owned.n);await fs.appendFile(file,'\nSynthetic human addition.');await expect(c.refresh()).rejects.toThrow();expect(await fs.readFile(file,'utf8')).toContain('Synthetic human addition.');expect(await fs.readFile(statePath)).toEqual(before[0].bytes);await fs.writeFile(file,owned.bytes);await c.initialize();await c.refresh();expect(await store.load()).toEqual(repaired);
    expect(await fs.readFile(path.join(root,'board.canvas'),'utf8')).toBe(legacy.raw);expect((await fs.stat(path.join(root,'board.canvas'),{bigint:true})).mtimeNs.toString()).toBe(originalTime);expect(await fs.readFile(path.join(root,'Derived/manual.txt'),'utf8')).toBe(human);
    const inventory=(await fs.readdir(path.join(root,'Derived'),{recursive:true,withFileTypes:true})).filter(n=>n.isFile()).map(n=>path.relative(path.join(root,'Derived'),path.join(n.parentPath,n.name)).replace(/\\/gu,'/'));expect(inventory.some(n=>/\/(?:stage|work|backup)\//u.test(n))).toBe(false);expect(inventory.filter(n=>!n.startsWith('.third-brain/')).sort()).toEqual([...names.slice(1).map(n=>n.slice('Derived/'.length)),'manual.txt'].sort());
  }finally{c.dispose();}
},20000);
