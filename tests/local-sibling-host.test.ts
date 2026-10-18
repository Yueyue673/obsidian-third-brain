// SPDX-License-Identifier: MIT
// Real Main PanelPort and filesystem, synthetic DOM/host only. No native Obsidian clicks.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FileSystemAdapter, MarkdownView } from 'obsidian';
import { expect, it, vi } from 'vitest';
import ThirdBrainPlugin from '../src/main';
import { defaults } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
import type { Evidence, SearchResult } from '../src/core/types';
vi.mock('obsidian',()=>({Plugin:class{constructor(readonly app:unknown){}},ItemView:class{},PluginSettingTab:class{},FileSystemAdapter:class{},MarkdownView:class{},Notice:class{}}));
class Node {
  className='';textContent='';value='';hidden=false;disabled=false;children:Node[]=[];handlers=new Map<string,(()=>void)[]>();
  constructor(readonly tag:string){}append(...n:Node[]){this.children.push(...n);}replaceChildren(...n:Node[]){this.children=n;}setAttribute(){}remove(){}focus(){}get childElementCount(){return this.children.length;}addEventListener(k:string,h:()=>void){this.handlers.set(k,[...this.handlers.get(k)??[],h]);}fire(k:string){for(const h of this.handlers.get(k)??[])h();}all():Node[]{return[this,...this.children.flatMap(n=>n.all())];}
}
const legacy=JSON.parse(await fs.readFile('tests/fixtures/local-sibling-legacy.json','utf8'));
const nextTurn=()=>new Promise<void>(r=>setImmediate(r));
it.each(['md','canvas'])('actual Main %s generated/source buttons refuse a sibling-only stale or excluded donor',async format=>{
  const scope=path.resolve('.local/local-sibling-host');await fs.mkdir(scope,{recursive:true});const root=await fs.mkdtemp(path.join(scope,'vault-'));
  const raw:string=legacy.raw,text=format==='md'?raw:JSON.stringify({nodes:[{type:'text',text:'---\nprivacy: private\n---\n'+raw}],edges:[]});
  const names=['source.'+format,'copy.'+format];for(const name of names)await fs.writeFile(path.join(root,name),text);
  const mtimes=await Promise.all(names.map(async n=>(await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()));
  const opened=Object.assign(Object.create(MarkdownView.prototype),{file:{path:names[0]},getMode:()=> 'source',editor:{getValue:()=>text,setSelection:vi.fn(),scrollIntoView:vi.fn()}});
  const hostOpen=vi.fn(async(file:{path:string})=>{opened.file=file;});
  const plugin=new ThirdBrainPlugin({vault:{adapter:Object.assign(Object.create(FileSystemAdapter.prototype),{getBasePath:()=>root}),getFiles:()=>names.map(n=>({path:n})),getFileByPath:(name:string)=>({path:name,extension:name.split('.').at(-1)})},workspace:{onLayoutReady:()=>{},getLeavesOfType:()=>[],getLeaf:()=>({view:opened,openFile:hostOpen})}} as never,{} as never);
  Object.assign(plugin,{loadData:async()=>({...defaults,outputFolder:'Derived',locale:format==='md'?'en':'zh'}),saveData:async()=>{},registerView:()=>{},addRibbonIcon:()=>{},addSettingTab:()=>{},registerInterval:()=>{},addCommand:()=>{}});
  vi.stubGlobal('window',{setInterval:()=>1});vi.stubGlobal('document',{createElement:(tag:string)=>new Node(tag)});
  let dispose:(()=>void)|undefined,pending:Promise<SearchResult[]>|undefined;const operations:Promise<void>[]=[];
  try{
    await plugin.onload();const port=plugin.panelPort();await port.refresh();const find=port.find.bind(port),open=port.open.bind(port),openFragment=port.openFragment!.bind(port);
    port.find=(...a)=>{pending=find(...a);return pending;};port.open=(e:Evidence)=>{const p=open(e);operations.push(p);return p;};port.openFragment=id=>{const p=openFragment(id);operations.push(p);return p;};
    const container=new Node('main'),locale=format==='md'?'en':'zh';dispose=mountPanel(container as unknown as HTMLElement,port,locale);
    const input=container.all().find(n=>n.className==='tb-idea')!;input.value='violet chamber';input.fire('input');container.all().find(n=>n.tag==='button'&&n.textContent===messages(locale).find)!.fire('click');const result=(await pending)![0];await nextTurn();expect(result).toBeDefined();
    const card=container.all().find(n=>n.className==='tb-result')!,fragmentButton=card.all().find(n=>n.tag==='button'&&n.textContent===messages(locale).openFragment)!;
    for(const button of card.all().filter(n=>n.className==='tb-source')){button.fire('click');await operations.at(-1);}
    fragmentButton.fire('click');await operations.at(-1);expect(hostOpen.mock.calls.at(-1)![0].path).toMatch(/^Derived\/fragment-/u);
    for(const [i,name] of names.entries()){expect(await fs.readFile(path.join(root,name),'utf8')).toBe(text);expect((await fs.stat(path.join(root,name),{bigint:true})).mtimeNs.toString()).toBe(mtimes[i]);}
    const statePath=path.join(root,'Derived/.third-brain/state.json'),state=await fs.readFile(statePath),before=hostOpen.mock.calls.length;
    await fs.writeFile(path.join(root,names[1]),text.replace('Seal the cobalt inlet.','Change only the omitted sibling.'));
    fragmentButton.fire('click');await expect(operations.at(-1)).rejects.toThrow();await nextTurn();expect(hostOpen).toHaveBeenCalledTimes(before);expect(container.all().find(n=>n.className==='tb-notice')!.textContent).toBe(messages(locale).sourceEvidenceUnavailable);
    for(const button of card.all().filter(n=>n.className==='tb-source')){button.fire('click');await expect(operations.at(-1)).rejects.toThrow();}expect(hostOpen).toHaveBeenCalledTimes(before);
    await fs.writeFile(path.join(root,names[1]),text);plugin.settings.excludes=[names[1]];fragmentButton.fire('click');await expect(operations.at(-1)).rejects.toThrow();expect(hostOpen).toHaveBeenCalledTimes(before);
    plugin.settings.excludes=[];fragmentButton.fire('click');await operations.at(-1);expect(hostOpen).toHaveBeenCalledTimes(before+1);expect(await fs.readFile(statePath)).toEqual(state);
  }finally{await pending?.catch(()=>{});await Promise.allSettled(operations);await nextTurn();dispose?.();plugin.onunload();vi.unstubAllGlobals();vi.restoreAllMocks();}
});
