// SPDX-License-Identifier: MIT
// A deliberately small DOM harness; verifies real mountPanel handlers, not a GUI/Obsidian click.
import { afterEach, expect, it, vi } from 'vitest';
import { mountPanel } from '../src/ui';
import { presentExplanation } from '../src/presentation';
import { INDIRECT_MECHANISM_CAVEAT, searchFragments } from '../src/core/retrieval';
import { emptyFacets, emptyIndex, type Fragment, type Evidence } from '../src/core/types';

class NodeStub {
  tag: string; className = ''; textContent = ''; children: NodeStub[] = []; value = ''; disabled = false; hidden = false;
  handlers = new Map<string,Array<(e: unknown) => void>>();
  constructor(tag: string) { this.tag = tag; }
  append(...nodes: NodeStub[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: NodeStub[]) { this.children = nodes; }
  setAttribute() {} remove() {} focus() {}
  get childElementCount() { return this.children.length; }
  addEventListener(event: string, fn: (e: unknown) => void) { this.handlers.set(event,[...(this.handlers.get(event) ?? []),fn]); }
  async fire(event: string) { for (const fn of this.handlers.get(event) ?? []) fn({}); for (let i=0;i<8;i++) await Promise.resolve(); }
  all(): NodeStub[] { return [this,...this.children.flatMap(n => n.all())]; }
}
afterEach(() => vi.unstubAllGlobals());
const evidence = (id: string): Evidence => ({ sourceId:id,relativePath:`Synthetic/${id}.md`,sourceHash:'a'.repeat(64),quote:`Exact ${id} quote`,start:0,end:`Exact ${id} quote`.length });
const fragment = (id: string, mechanisms: string[]): Fragment => ({ id,title:`Title ${id}`,summary:`Summary ${id}`,privacy:'normal',facets:{ ...emptyFacets(),mechanisms },evidence:[evidence(id)],conditions:[`${id} condition`],caveats:[`${id} caveat`],mode:'ai',updatedAt:'2026-01-01',kind:'method' });

it.each(['en','zh'] as const)('shows two separately openable original sources, conditions and uncertainty in %s', async locale => {
  const a = fragment('anchor',['needle','bridge']), b = fragment('target',['bridge']), index = emptyIndex();
  for (const f of [a,b]) { index.fragments[f.id] = f; index.sources[f.evidence[0].relativePath] = { hash:'a'.repeat(64),status:'indexed',fragmentIds:[f.id] }; }
  const results = searchFragments([a,b],'needle',{ breadth:'high',index });
  const target = results.find(r => r.fragment.id === 'target')!; expect(target).toBeDefined();
  vi.stubGlobal('document',{ createElement:(tag: string) => new NodeStub(tag) });
  const root = new NodeStub('main'), open = vi.fn(async () => undefined), find = vi.fn(async () => [target]);
  const dispose = mountPanel(root as unknown as HTMLElement,{
    status:() => ({ phase:'idle',sourceCount:2,fragmentCount:2,updatedAt:'',mode:'local-excerpts' }),subscribe:() => () => {},refresh:async () => {},find,cancel:() => {},open,
  },locale);
  const input = root.all().find(n => n.tag === 'textarea')!; input.value = 'needle'; await input.fire('input');
  await root.all().find(n => n.className === 'tb-primary')!.fire('click');
  const trace = root.all().find(n => n.className === 'tb-indirect-evidence')!; expect(trace).toBeDefined();
  const text = trace.all().map(n => n.textContent).join('\n');
  expect(text).toContain('anchor condition'); expect(text).toContain('target condition'); expect(text).toContain('Exact anchor quote'); expect(text).toContain('Exact target quote');
  const buttons = trace.all().filter(n => n.tag === 'button'); expect(buttons).toHaveLength(2);
  await buttons[0].fire('click'); await buttons[1].fire('click');
  expect(open.mock.calls).toEqual([[a.evidence[0]],[b.evidence[0]]]);
  expect(root.all().some(n => n.textContent === presentExplanation(INDIRECT_MECHANISM_CAVEAT,locale))).toBe(false); // localized caveat has its labelled prefix
  expect(root.all().map(n => n.textContent).join('\n')).toContain(presentExplanation(INDIRECT_MECHANISM_CAVEAT,locale));
  dispose();
});

it('translates only program-owned uncertainty, leaving source/model text intact', () => {
  expect(presentExplanation('Indirect association suggestion via: 原作者标题 → bridge','zh')).toBe('间接关联建议，经由：原作者标题 → bridge');
  expect(presentExplanation(INDIRECT_MECHANISM_CAVEAT,'zh')).toContain('不代表它与查询机制等价');
  expect(presentExplanation('原作者：只在冷却后比较','zh')).toBe('原作者：只在冷却后比较');
});

it.each(['zh','en'] as const)('separates additional suggestions with no extra search control in %s', async locale => {
  const a=fragment('anchor',['needle','bridge']), b=fragment('target',['bridge']), index=emptyIndex();
  for(const f of [a,b]){index.fragments[f.id]=f;index.sources[f.evidence[0].relativePath]={hash:'a'.repeat(64),status:'indexed',fragmentIds:[f.id]};}
  const hits=searchFragments([a,b],'needle',{breadth:'high',index});
  hits[1]={...hits[1],group:'indirect-suggestion'};
  vi.stubGlobal('document',{createElement:(tag:string)=>new NodeStub(tag)});
  const root=new NodeStub('main'), open=vi.fn(async()=>{}), openFragment=vi.fn(async()=>{});
  const dispose=mountPanel(root as unknown as HTMLElement,{status:()=>({phase:'idle',sourceCount:2,fragmentCount:2,updatedAt:'',mode:'local-excerpts'}),subscribe:()=>()=>{},refresh:async()=>{},find:async()=>hits,cancel:()=>{},open,openFragment},locale);
  const input=root.all().find(n=>n.tag==='textarea')!;input.value='needle';await input.fire('input');await root.all().find(n=>n.className==='tb-primary')!.fire('click');
  const main=root.all().find(n=>n.className==='tb-main-results')!, lane=root.all().find(n=>n.className==='tb-suggestions')!;
  expect(main.all().filter(n=>n.className==='tb-result')).toHaveLength(1);expect(lane.all().filter(n=>n.className==='tb-result')).toHaveLength(1);
  expect(lane.all().map(n=>n.textContent).join('\n')).toContain(presentExplanation('Indirect suggestions via the existing network',locale));
  expect(root.all().filter(n=>n.tag==='select')).toHaveLength(1);expect(lane.all().some(n=>n.tag==='hr')).toBe(true);
  expect(main.all().filter(n=>n.tag==='button'&&n.className==='tb-secondary')).toHaveLength(1);expect(lane.all().filter(n=>n.tag==='button'&&n.className==='tb-secondary')).toHaveLength(1);
  await main.all().find(n=>n.tag==='button'&&n.className==='tb-secondary')!.fire('click');
  await lane.all().find(n=>n.tag==='button'&&n.className==='tb-secondary')!.fire('click');
  expect(openFragment.mock.calls).toEqual([[a.id],[b.id]]);
  const trace=lane.all().find(n=>n.className==='tb-indirect-evidence')!;
  for(const button of trace.all().filter(n=>n.tag==='button'))await button.fire('click');
  expect(open.mock.calls).toEqual([[a.evidence[0]],[b.evidence[0]]]);dispose();
});

it('ignores late results from a cancelled renderer search', async () => {
  vi.stubGlobal('document',{createElement:(tag:string)=>new NodeStub(tag)});
  let resolve!: (r: any[])=>void;
  const root=new NodeStub('main'), cancel=vi.fn(), pending=new Promise<any[]>(r=>{resolve=r;});
  const dispose=mountPanel(root as unknown as HTMLElement,{status:()=>({phase:'idle',sourceCount:1,fragmentCount:1,updatedAt:'',mode:'local-excerpts'}),subscribe:()=>()=>{},refresh:async()=>{},find:()=>pending,cancel,open:async()=>{}},'en');
  const input=root.all().find(n=>n.tag==='textarea')!;input.value='needle';await input.fire('input');await root.all().find(n=>n.className==='tb-primary')!.fire('click');
  await root.all().find(n=>n.textContent==='Cancel')!.fire('click');resolve([{fragment:fragment('late',[]),score:1,reasons:[],group:'indirect-suggestion'}]);
  for(let i=0;i<12;i++)await Promise.resolve();expect(cancel).toHaveBeenCalledOnce();expect(root.all().filter(n=>n.className==='tb-result')).toEqual([]);dispose();
});

// Restoring a transient selection is not permission to automatically submit it.
it.each([
  ['en','mechanisms','medium','This mechanism requires Medium or High breadth. Your selection is retained; change breadth, then click Find connections.'],
  ['en','atmosphere','high','This atmosphere requires High breadth. Your selection is retained; change breadth, then click Find connections.'],
  ['zh','mechanisms','medium','此机制需中或高关联发散度。已保留选择；调整后请点击“寻找关联”。'],
  ['zh','atmosphere','high','此氛围需高关联发散度。已保留选择；调整后请点击“寻找关联”。'],
] as const)('explains the explicit search required by a restored %s %s selection', async (locale, channel, allowedBreadth, hint) => {
  vi.stubGlobal('document',{createElement:(tag:string)=>new NodeStub(tag)});
  const root=new NodeStub('main'), find=vi.fn(async()=>[]);
  const selection={channel,value:'Synthetic retained facet'};
  const dispose=mountPanel(root as unknown as HTMLElement,{
    status:()=>({phase:'idle',sourceCount:1,fragmentCount:1,updatedAt:'',mode:'local-excerpts'}),
    subscribe:()=>()=>{},refresh:async()=>{},find,cancel:()=>{},open:async()=>{},
  },locale,{text:selection.value,privacy:'private',breadth:'low',selection});
  const input=root.all().find(n=>n.tag==='textarea')!;
  const breadth=root.all().find(n=>n.tag==='select')!;
  const notice=root.all().find(n=>n.className==='tb-notice')!;
  expect(notice.hidden).toBe(false);expect(notice.textContent).toBe(hint);
  expect(input.value).toBe(selection.value);expect(find).not.toHaveBeenCalled();
  breadth.value=allowedBreadth;await breadth.fire('change');
  expect(find).not.toHaveBeenCalled();expect(notice.hidden).toBe(true);
  expect(dispose.draft()).toEqual({text:selection.value,privacy:'private',breadth:allowedBreadth,selection});
  await root.all().find(n=>n.className==='tb-primary')!.fire('click');
  expect(find.mock.calls).toEqual([[selection.value,allowedBreadth,'private',selection]]);
  // After an explicit submission the existing automatic-refine contract remains.
  breadth.value='low';await breadth.fire('change');
  expect(find).toHaveBeenCalledTimes(2);
  expect(notice.textContent).toContain(locale==='zh'?'调整发散度即可重新寻找':'change breadth to search again');
  input.value='A new unsent idea';await input.fire('input');
  breadth.value=allowedBreadth;await breadth.fire('change');
  expect(find).toHaveBeenCalledTimes(2);expect(dispose.draft().selection).toBeUndefined();
  expect(dispose.draft().privacy).toBe('private');dispose();
});
