// SPDX-License-Identifier: MIT
// Authored synthetic heading contexts; offline protocol snapshots are not model-quality evidence.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { analyzeSource, buildIndex, prepareSource } from '../src/core';
import { sourceDiagnostic } from '../src/core/source-diagnostics';
import type { Evidence, ModelRequest } from '../src/core/types';
import { ThirdBrainController } from '../src/controller';
import { FileSources, currentEvidence, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-heading-legacy.json', 'utf8'));
const opts = { mode: 'local-excerpts' as const, cloudConsent: false, now: '2026-01-01T00:00:00.000Z' };
const snap = (raw: string, name = 'synthetic.md') => prepareSource(name, raw, hash(raw), hash(name).slice(0,24));
const canvas = (raw: string, extra = '') => JSON.stringify({ nodes: [{ type: 'text', text: raw }, ...(extra ? [{ type: 'text', text: extra }] : [])], edges: [] });
const body: string = legacy.body;

it.each(['md', 'canvas'])('%s retains full ancestor headings and distinguishes opposing contexts while merging exact copies', async extension => {
  const encode = (raw: string) => extension === 'md' ? raw : canvas(raw);
  const inputs = Object.entries(legacy.raws as Record<string,string>).map(([name,raw]) => snap(encode(raw), name.replace('.md', '.' + extension)));
  const next = await buildIndex(inputs, { ...opts, previous: null, signature: generationSignature(defaults) });
  const fragments = Object.values(next.fragments);
  expect(fragments).toHaveLength(2);
  const allowed = fragments.find(f => f.summary.includes('Only in a disconnected'))!;
  const forbidden = fragments.find(f => f.summary.includes('Forbidden on connected'))!;
  expect(allowed.summary).toContain('## Calibration action'); expect(allowed.summary).toContain(body);
  expect(forbidden.summary).toContain(body); expect(allowed.id).not.toBe(forbidden.id);
  expect(new Set(allowed.evidence.map(e => e.relativePath)).size).toBe(2);
  expect(new Set(forbidden.evidence.map(e => e.relativePath)).size).toBe(1);
  for (const f of fragments) {
    for (const p of new Set(f.evidence.map(e => e.relativePath))) {
      const source = inputs.find(s => s.path === p)!;
      const evidence = f.evidence.filter(e => e.relativePath === p);
      expect(evidence.map(e => e.quote)).toContain(body);
      expect(evidence.map(e => e.quote)).toContain('## Calibration action');
      expect(evidence.some(e => e.quote.startsWith('# Only') || e.quote.startsWith('# Forbidden'))).toBe(true);
      const port = { read: async () => source, list: async () => [source], verify: async () => {}, excluded: async () => new Set<string>() };
      expect(await currentEvidence(evidence, port)).toEqual(evidence);
      for (const e of evidence) if (e.start >= 0) expect(source.text.slice(e.start,e.end)).toBe(e.quote);
    }
  }
});

it('keeps Chinese restrictions above a neutral child title, without inheriting sibling, hidden, code or Canvas-node headings', async () => {
  const raw = '# 仅限离线合成演练\n### 中性操作名\n调节合成赭石控制杆。\n\n## 独立同级分支\n整理合成白鲸资料。\n\n# 完全独立章节\n记录合成雪松笔记。';
  const result = await analyzeSource(snap(raw), opts);
  const action = result.fragments.find(f => f.summary.includes('调节'))!;
  expect(action.summary).toContain('# 仅限离线合成演练'); expect(action.summary).toContain('### 中性操作名');
  expect(result.fragments.find(f => f.summary.includes('白鲸'))!.summary).not.toContain('中性操作名');
  expect(result.fragments.find(f => f.summary.includes('雪松'))!.summary).not.toContain('仅限');
  const clean = await analyzeSource(snap('```\n# Hidden code heading\n```\n<!--\n# Hidden comment heading\n-->\nVisible synthetic paragraph.'), opts);
  expect(clean.fragments[0].summary).toBe('Visible synthetic paragraph.');
  const nodes = await analyzeSource(snap(canvas('# 只限第一节点\n第一节点的合成材料。', '第二节点不继承前一节点的条件。'), 'nodes.canvas'), opts);
  expect(nodes.fragments.find(f => f.summary.includes('第二节点'))!.summary).not.toContain('只限');
  expect((await analyzeSource(snap('# Only heading, no body\n'), opts)).fragments).toHaveLength(0);
});

it('retains a restriction beyond the old 160-unit heading title cap; refuses full context overflow rather than clipping', async () => {
  const heading = '# ' + 'Synthetic context '.repeat(20) + 'ONLY AFTER DISCONNECTION 🧠';
  const result = await analyzeSource(snap(heading + '\n\n' + body), opts);
  expect(result.fragments[0].summary).toContain(heading);
  expect(result.fragments[0].evidence.some(e => e.quote === heading)).toBe(true);
  const prefix = '# Only in a synthetic simulator\n\n';
  const bounded = prefix + '合'.repeat(16384 - prefix.length);
  const boundary = await analyzeSource(snap(bounded),opts);
  expect(boundary.fragments[0].summary).toBe(bounded);
  await expect(analyzeSource(snap(bounded + '尾'),opts)).rejects.toThrow();
  let failure: unknown;
  try { await analyzeSource(snap('# ' + '合'.repeat(16380) + '\n' + body), opts); } catch (error) { failure = error; }
  expect(failure).toBeDefined();
  expect(sourceDiagnostic(failure)).toEqual({ relativePath: 'synthetic.md', stage: 'analysis', reason: 'local-context-size-limit' });
});

it.each(['<!-- hidden -->', '%% hidden %%'])('fails closed when a heading intersects %s instead of publishing a bare child', async marker => {
  await expect(analyzeSource(snap('# Only ' + marker + '\n## Neutral action\n' + body), opts)).rejects.toThrow();
});

it('keeps existing AI primary text/background/signatures byte-equivalent (offline protocol only)', async () => {
  for (const mode of ['local-model', 'cloud-model'] as const) {
    expect(generationSignature({ ...defaults, outputFolder: 'Derived', mode })).toBe(legacy.signatures[mode]);
    const requests: ModelRequest[] = [];
    await analyzeSource(snap(legacy.raws['a.md'], 'a.md'), { mode, cloudConsent: true, model: { request: async input => { requests.push(input); return { version: 1, decision: 'insufficient-context', fragments: [] }; } } });
    expect(requests).toEqual(legacy.requests[mode]);
  }
});

class NodeStub {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false;
  children: NodeStub[] = []; handlers = new Map<string, (() => void)[]>();
  constructor(readonly tag: string) {}
  append(...nodes: NodeStub[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: NodeStub[]) { this.children = nodes; }
  setAttribute() {} remove() {} focus() {}
  get childElementCount() { return this.children.length; }
  addEventListener(event: string, handler: () => void) { this.handlers.set(event, [...this.handlers.get(event) ?? [], handler]); }
  fire(event: string) { for (const handler of this.handlers.get(event) ?? []) handler(); }
  all(): NodeStub[] { return [this, ...this.children.flatMap(n => n.all())]; }
  text(): string { return [this.textContent, ...this.children.map(n => n.text())].join('\n'); }
}

it.each(['md', 'canvas'])('actual %s source → controller → strict reload → bilingual panel → all originals; upgrade, cancellation and protection', async extension => {
  const scope = path.resolve('.local/local-heading-context'); await fs.mkdir(scope, { recursive: true });
  const root = await fs.mkdtemp(path.join(scope, 'vault-'));
  const raws = Object.fromEntries(Object.entries(legacy.raws as Record<string,string>).map(([n,raw]) => [n.replace('.md','.'+extension), extension === 'md' ? raw : canvas('---\nprivacy: private\n---\n' + raw)]));
  const stats = new Map<string,string>();
  for (const [n,raw] of Object.entries(raws)) { await fs.writeFile(path.join(root,n),raw); stats.set(n,(await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()); }
  await fs.mkdir(path.join(root,'Derived')); await fs.writeFile(path.join(root,'Derived/manual.txt'),'Synthetic human-authored material.');
  const settings = { ...defaults, outputFolder:'Derived', excludes:[] as string[] };
  const store = new OwnedStore(root,'Derived'), sources = new FileSources(root,()=>settings,()=>store.managedSourcePaths());
  if (extension === 'md') { const inputs = await sources.list(); await store.commit(structuredClone(legacy.old),()=>sources.verify(inputs)); }
  const request = vi.fn(async () => { throw new Error('Forbidden model request'); });
  const controller = new ThirdBrainController(sources,store,()=>settings,()=>({request}),async()=>{});
  let dispose: (()=>void)|undefined, pending: Promise<unknown>|undefined;
  try {
    await controller.initialize(); await controller.refresh();
    const next = (await store.load())!; expect(Object.values(next.fragments)).toHaveLength(2);
    if(extension==='md') { expect(next.signature).not.toBe(legacy.old.signature); for(const id of Object.keys(legacy.old.fragments))expect(next.fragments[id]).toBeUndefined(); }
    const statePath = path.join(root,'Derived/.third-brain/state.json'), state = await fs.readFile(statePath);
    await controller.initialize(); await controller.refresh(); expect(await fs.readFile(statePath)).toEqual(state); expect(await store.load()).toEqual(next);
    let oldEvidence: Evidence[] = []; let verifiedActions = 0;
    for(const locale of ['en','zh'] as const) {
      vi.stubGlobal('document',{createElement:(tag:string)=>new NodeStub(tag)});
      const container = new NodeStub('main'), opens:Promise<void>[]=[];
      dispose=mountPanel(container as unknown as HTMLElement,{
        status:()=>controller.status(),subscribe:fn=>controller.subscribe(fn),refresh:()=>controller.refresh(),cancel:()=>controller.cancel(),
        find:(...args)=>{const op=controller.find(...args);pending=op;return op;},
        open:e=>{const op=controller.verifyOpen(e);opens.push(op);return op;},
      },locale);
      const input=container.all().find(n=>n.className==='tb-idea')!;input.value='amber calibration ring';input.fire('input');
      container.all().find(n=>n.tag==='button'&&n.textContent===messages(locale).find)!.fire('click');
      const results=await pending as Awaited<ReturnType<ThirdBrainController['find']>>;await Promise.resolve();expect(results).toHaveLength(2);
      oldEvidence=results.flatMap(r=>r.fragment.evidence);
      const cards=container.all().filter(n=>n.className==='tb-result');expect(cards).toHaveLength(2);
      expect(cards.some(c=>c.text().includes('Only in a disconnected'))).toBe(true);expect(cards.some(c=>c.text().includes('Forbidden on connected'))).toBe(true);
      for(const c of cards)for(const button of c.all().filter(n=>n.className==='tb-source')){button.fire('click');await opens.at(-1);}
      await Promise.all(opens);verifiedActions+=opens.length;
      dispose();dispose=undefined;vi.unstubAllGlobals();
    }
    for(const [n,raw] of Object.entries(raws)){expect(hash(await fs.readFile(path.join(root,n)))).toBe(hash(raw));expect((await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()).toBe(stats.get(n));}
    const allowed=Object.values(next.fragments).find(f=>f.summary.includes('Only in'))!;
    const commit=vi.spyOn(store,'commit'); const name='a.'+extension;
    await fs.writeFile(path.join(root,name),raws[name].replace('disconnected offline simulator','connected production equipment'));
    const allowedEvidence=oldEvidence.filter(e=>allowed.evidence.some(a=>a.relativePath===e.relativePath));
    expect(allowedEvidence).toHaveLength(allowed.evidence.length);
    for(const e of allowedEvidence)await expect(controller.verifyOpen(e)).rejects.toThrow();
    await fs.writeFile(path.join(root,name),raws[name]);
    settings.excludes.push(name);for(const e of allowedEvidence)await expect(controller.verifyOpen(e)).rejects.toThrow();settings.excludes.pop();
    for(const e of allowedEvidence)await controller.verifyOpen(e);
    await fs.writeFile(path.join(root,name),extension==='md'?'# '+'合'.repeat(16384)+'\n'+body:canvas('# '+'合'.repeat(16384)+'\n'+body));
    commit.mockClear();await expect(controller.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(state);
    await fs.writeFile(path.join(root,name),raws[name]);await controller.refresh();expect(await fs.readFile(statePath)).toEqual(state);
    const actualList=sources.list.bind(sources);let release!:()=>void,entered!:()=>void;
    const started=new Promise<void>(r=>{entered=r;}),latch=new Promise<void>(r=>{release=r;});
    vi.spyOn(sources,'list').mockImplementationOnce(async options=>{entered();await latch;return actualList(options);});
    commit.mockClear();const op=controller.refresh();await started;controller.cancel();release();await expect(op).rejects.toMatchObject({name:'AbortError'});
    expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(state);await controller.refresh();expect(await fs.readFile(statePath)).toEqual(state);
    const generated=path.join(root,await store.fragmentPath(allowed.id)),generatedBytes=await fs.readFile(generated);
    await fs.writeFile(generated,Buffer.concat([generatedBytes,Buffer.from('\nSynthetic human amendment.')]));await expect(controller.refresh()).rejects.toThrow();
    expect(await fs.readFile(generated,'utf8')).toContain('Synthetic human amendment.');expect(await fs.readFile(statePath)).toEqual(state);
    await fs.writeFile(generated,generatedBytes);await controller.initialize();await controller.refresh();expect(await fs.readFile(statePath)).toEqual(state);
    for(const [n,raw] of Object.entries(raws))expect(await fs.readFile(path.join(root,n),'utf8')).toBe(raw);
    // Only the deliberately changed synthetic a source has a new mtime; all others remain untouched.
    for(const n of Object.keys(raws).filter(n=>n!==name))expect((await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()).toBe(stats.get(n));
    expect(await fs.readFile(path.join(root,'Derived/manual.txt'),'utf8')).toBe('Synthetic human-authored material.');expect(request).not.toHaveBeenCalled();
    await fs.writeFile(path.join(scope,extension+'-receipt.json'),JSON.stringify({extension,strictReload:true,oppositeContexts:2,verifiedActions,byteIdempotent:true,oldCacheUpgrade:extension==='md',realModelRequests:0,nativeHost:false},null,2));
  } finally { await pending?.catch(()=>{});dispose?.();controller.dispose();vi.unstubAllGlobals();vi.restoreAllMocks(); }
});

it('counts heading quotations inside the unchanged 256-evidence limit before committing Canvas lists', async () => {
  const raw=(children:number)=>canvas('# Only in a disconnected synthetic simulator\n- Calibration instructions:\n'+Array.from({length:children},(_,i)=>'  - Synthetic amber step '+i+'.').join('\n'));
  const scope=path.resolve('.local/local-heading-context');await fs.mkdir(scope,{recursive:true});const root=await fs.mkdtemp(path.join(scope,'limit-'));
  const original=path.join(root,'list.canvas');await fs.writeFile(original,raw(254));
  const settings={...defaults,outputFolder:'Derived',excludes:[]};const store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths());
  const c=new ThirdBrainController(sources,store,()=>settings,()=>undefined,async()=>{});
  try {
    await c.initialize();await c.refresh();const index=(await store.load())!;const f=Object.values(index.fragments)[0];expect(f.evidence).toHaveLength(256);
    expect(await currentEvidence(f.evidence,sources)).toEqual(f.evidence);
    for(const e of [f.evidence[0],f.evidence.at(-1)!])await c.verifyOpen(e);
    const statePath=path.join(root,'Derived/.third-brain/state.json'),state=await fs.readFile(statePath);await c.refresh();expect(await fs.readFile(statePath)).toEqual(state);
    const commit=vi.spyOn(store,'commit');await fs.writeFile(original,raw(255));await expect(c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(state);
    await fs.writeFile(original,raw(254));await c.refresh();expect(await fs.readFile(statePath)).toEqual(state);
  }finally{c.dispose();vi.restoreAllMocks();}
});
