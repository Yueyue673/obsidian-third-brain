// SPDX-License-Identifier: MIT
// Authored synthetic notes. Offline request captures are not model-quality evidence.
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
const legacy = JSON.parse(await fs.readFile('tests/fixtures/local-quoted-introduction-legacy.json', 'utf8'));
const opts = { mode: 'local-excerpts' as const, cloudConsent: false, now: '2026-01-01T00:00:00.000Z' };
const snap = (raw: string, name = 'synthetic.md') => prepareSource(name, raw, hash(raw), hash(name).slice(0, 24));
const canvas = (raw: string, extra = '') => JSON.stringify({ nodes: [{ type: 'text', text: raw }, ...(extra ? [{ type: 'text', text: extra }] : [])], edges: [] });
const action: string = legacy.action;

it.each(['md', 'canvas'])('%s retains an explicit quoted introduction, not a bare action merged across opposing scopes', async extension => {
  const inputs = Object.entries(legacy.raws as Record<string, string>).map(([n, r]) => snap(extension === 'md' ? r : canvas(r), n.replace('.md', '.' + extension)));
  const index = await buildIndex(inputs, { ...opts, previous: null, signature: generationSignature(defaults) });
  const actions = Object.values(index.fragments).filter(f => f.summary.includes(action));
  expect(actions).toHaveLength(2);
  for (const f of actions) {
    expect(f.summary).toContain('> [!warning] Synthetic scope'); expect(f.summary).toContain('simulator:\n>');
    expect(f.summary).toContain('- Example:'); expect(f.summary).not.toContain(legacy.other);
    for (const e of f.evidence) {
      const source = inputs.find(s => s.path === e.relativePath)!;
      if (e.start >= 0) expect(source.text.slice(e.start, e.end)).toBe(e.quote);
      else expect(hasReadableQuote(source, e.quote)).toBe(true);
    }
  }
  const original = actions.find(f => f.summary.includes(legacy.lead))!;
  expect(new Set(original.evidence.map(e => e.relativePath)).size).toBe(2);
  expect(original.evidence.filter(e => e.quote === legacy.lead)).toHaveLength(2);
  const others = Object.values(index.fragments).filter(f => f.summary.includes(legacy.other));
  expect(others).toHaveLength(2); expect(others.every(f => !f.summary.includes(action))).toBe(true);
  expect(Object.values(index.fragments).some(f => f.summary.includes('simulator:') && !f.summary.includes('- '))).toBe(false);
});

it.each([
  ['plain quote', '> Only the disconnected synthetic rig:\n>'],
  ['Chinese', '> 只在断开连接的合成装置中：\n>'],
  ['folded callout', '> [!warning]- Synthetic restriction\n> Only the isolated synthetic rig:\n>\n>'],
  ['open callout', '> [!info]+ Only the isolated synthetic rig:\n> '],
  ['nested quote', '> > Only the isolated synthetic rig:\n> >\n>'],
  ['compact nesting', '>> Only the isolated synthetic rig:\n>>'],
  ['indented quote', '   > Only the isolated synthetic rig:\n   >'],
  ['blank before terminal markers', '> Only the isolated synthetic rig:\n>\n> \t'],
])('%s keeps the full exact quoted introduction with every independent root', async (_label, lead) => {
  for (const gap of ['\n', '\n\n']) {
    const other = '- Record the independent synthetic reading.';
    const r = await analyzeSource(snap(lead + gap + action + '\n' + other), opts);
    expect(r.fragments.map(f => f.summary).sort()).toEqual([lead.trim() + '\n\n' + action, lead.trim() + '\n\n' + other].sort());
    expect(r.fragments.every(f => f.evidence.some(e => e.quote === lead.trim()))).toBe(true);
  }
});

it('keeps original CRLF quotation bytes rather than fabricating a contiguous assembled span', async () => {
  const lead = '> [!warning] Synthetic scope\r\n> Only the disconnected rig:\r\n>';
  const raw = lead + '\r\n\r\n' + action, s = snap(raw);
  const r = await analyzeSource(s, opts); expect(r.fragments).toHaveLength(1);
  expect(r.fragments[0].summary).toBe(lead + '\n\n' + action);
  expect(r.fragments[0].evidence.map(e => e.quote).sort()).toEqual([lead, action].sort());
  for (const e of r.fragments[0].evidence) expect(s.text.slice(e.start, e.end)).toBe(e.quote);
});

it('retains the existing no-trailing-marker colon behavior and leaves unrelated prose/quotes alone', async () => {
  const lead = '> Only the disconnected synthetic rig:';
  expect((await analyzeSource(snap(lead + '\n\n' + action), opts)).fragments[0].summary).toBe(lead + '\n\n' + action);
  for (const unrelated of ['> [!warning] A standalone synthetic observation.\n>', '> Only the isolated rig.\n>', 'Ordinary prose mentions a literal > marker:\n>', 'The literal `>` is an ordinary syntax example.\n>', '>']) {
    const r = await analyzeSource(snap(unrelated + '\n\n' + action), opts);
    expect(r.fragments.find(f => f.summary.includes(action))!.summary).toBe(action);
  }
  const ordinary = 'Literal `<!--` and `%%` remain ordinary inline examples.';
  const r = await analyzeSource(snap('- Previous synthetic point.\n\n' + ordinary), opts);
  expect(r.fragments.some(f => f.summary === ordinary)).toBe(true);
});

it('does not carry an introduction across prose, a heading, hidden/code boundaries or Canvas nodes', async () => {
  for (const boundary of ['\n\nIndependent synthetic prose.\n\n', '\n# Separate synthetic section\n', '\n```\nSynthetic code.\n```\n', '\n<!-- hidden -->\n', '\n%% hidden %%\n', '\n---\n']) {
    const r = await analyzeSource(snap(legacy.lead + boundary + action), opts);
    expect(r.fragments.find(f => f.summary.includes(action))!.summary).not.toContain('simulator:');
  }
  const r = await analyzeSource(snap(canvas(legacy.lead, action), 'synthetic.canvas'), opts);
  expect(r.fragments.find(f => f.summary.includes(action))!.summary).toBe(action);
});

it.each(['<!-- hidden -->', '%% hidden %%'])('refuses hidden %s inside an introduction instead of publishing a bare action', async marker => {
  await expect(analyzeSource(snap('> [!warning] ' + marker + '\n> Only the isolated synthetic rig:\n>\n\n' + action), opts)).rejects.toThrow();
});

it('keeps long quoted context whole and includes it in the existing combined 16384-unit bound', async () => {
  const suffix = '\n>\n\n' + action, prefix = '# Synthetic scope\n\n> Only the disconnected synthetic rig; ';
  const raw = prefix + '合'.repeat(16384 - prefix.length - suffix.length - 1) + ':' + suffix;
  const r = await analyzeSource(snap(raw), opts);
  expect(r.fragments).toHaveLength(1); expect(r.fragments[0].summary).toBe(raw);
  expect(r.fragments[0].summary.length).toBe(16384);
  let error: unknown; try { await analyzeSource(snap(raw + '尾'), opts); } catch (e) { error = e; }
  expect(sourceDiagnostic(error)).toEqual({ relativePath: 'synthetic.md', stage: 'analysis', reason: 'local-context-size-limit' });
});

it('invalidates only local generation; AI signatures and primary/background requests stay unchanged (offline)', async () => {
  expect(generationSignature({ ...defaults, outputFolder: 'Derived' })).not.toBe(legacy.signatures['local-excerpts']);
  for (const mode of ['local-model', 'cloud-model'] as const) {
    expect(generationSignature({ ...defaults, outputFolder: 'Derived', mode })).toBe(legacy.signatures[mode]);
    const requests: ModelRequest[] = [];
    await analyzeSource(snap(legacy.raws['a.md'], 'a.md'), { mode, cloudConsent: true, model: { request: async r => { requests.push(r); return { version: 1, decision: 'insufficient-context', fragments: [] }; } } });
    expect(requests).toEqual(legacy.requests[mode]);
  }
});

class Node {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false; children: Node[] = []; handlers = new Map<string, (() => void)[]>();
  constructor(readonly tag: string) {} append(...n: Node[]) { this.children.push(...n); } replaceChildren(...n: Node[]) { this.children = n; }
  setAttribute() {} remove() {} focus() {} get childElementCount() { return this.children.length; }
  addEventListener(k: string, h: () => void) { this.handlers.set(k, [...this.handlers.get(k) ?? [], h]); } fire(k: string) { for (const h of this.handlers.get(k) ?? []) h(); }
  all(): Node[] { return [this, ...this.children.flatMap(n => n.all())]; } text(): string { return [this.textContent, ...this.children.map(n => n.text())].join('\n'); }
}
async function fixture(extension: string) {
  const scope = path.resolve('.local/local-quoted-introduction'); await fs.mkdir(scope, { recursive: true }); const root = await fs.mkdtemp(path.join(scope, 'vault-'));
  const raws = Object.fromEntries(Object.entries(legacy.raws as Record<string, string>).map(([n, r]) => [n.replace('.md', '.' + extension), extension === 'md' ? r : canvas('---\nprivacy: private\n---\n' + r)]));
  const mtimes = new Map<string, string>();
  for (const [n,r] of Object.entries(raws)) { await fs.writeFile(path.join(root,n),r); mtimes.set(n,(await fs.stat(path.join(root,n),{bigint:true})).mtimeNs.toString()); }
  await fs.mkdir(path.join(root,'Derived')); await fs.writeFile(path.join(root,'Derived/manual.txt'),'Synthetic human-owned file.');
  const settings = { ...defaults, outputFolder:'Derived', excludes:[] as string[] }, store = new OwnedStore(root,'Derived'), sources = new FileSources(root,()=>settings,()=>store.managedSourcePaths());
  const request = vi.fn(async()=>{throw Error('Forbidden request');});
  const c = new ThirdBrainController(sources,store,()=>settings,()=>({request}),async()=>{});
  return { root,raws,mtimes,settings,store,sources,request,c,statePath:path.join(root,'Derived/.third-brain/state.json') };
}
it.each(['md','canvas'])('actual %s files → strict reload → bilingual renderer → every original; safe upgrade, refusal and recovery', async extension => {
  const f = await fixture(extension); let pending: Promise<unknown> | undefined, dispose: (()=>void) | undefined;
  try {
    let oldPath: string | undefined;
    if (extension === 'md') { const inputs=await f.sources.list(); const old:IndexState=structuredClone(legacy.old); await f.store.commit(old,()=>f.sources.verify(inputs)); oldPath=path.join(f.root,await f.store.fragmentPath(Object.values(old.fragments).find(x=>x.summary.includes(action))!.id)); }
    await f.c.initialize(); await f.c.refresh(); const index=(await f.store.load())!, actions=Object.values(index.fragments).filter(x=>x.summary.includes(action));
    expect(actions).toHaveLength(2); if(oldPath){expect(index.signature).not.toBe(legacy.old.signature);await expect(fs.stat(oldPath)).rejects.toMatchObject({code:'ENOENT'});}
    if(extension==='canvas')expect(Object.values(index.fragments).every(x=>x.privacy==='private')).toBe(true);
    const state=await fs.readFile(f.statePath); await f.c.initialize(); await f.c.refresh(); expect(await f.store.load()).toEqual(index); expect(await fs.readFile(f.statePath)).toEqual(state);
    let evidence:Evidence[]=[],verifiedActions=0;
    for(const locale of ['en','zh'] as const){
      vi.stubGlobal('document',{createElement:(tag:string)=>new Node(tag)}); const container=new Node('main'),opens:Promise<void>[]=[];
      dispose=mountPanel(container as unknown as HTMLElement,{status:()=>f.c.status(),subscribe:h=>f.c.subscribe(h),refresh:()=>f.c.refresh(),cancel:()=>f.c.cancel(),find:(...args)=>{pending=f.c.find(...args);return pending as ReturnType<ThirdBrainController['find']>;},open:e=>{const p=f.c.verifyOpen(e);opens.push(p);return p;}},locale);
      const input=container.all().find(n=>n.className==='tb-idea')!;input.value='cobalt memory dial';input.fire('input');container.all().find(n=>n.tag==='button'&&n.textContent===messages(locale).find)!.fire('click');
      const results=await pending as Awaited<ReturnType<ThirdBrainController['find']>>;await Promise.resolve();const found=results.filter(r=>r.fragment.summary.includes(action));expect(found).toHaveLength(2);
      const original=found.find(r=>r.fragment.summary.includes(legacy.lead))!;evidence=original.fragment.evidence;expect(new Set(evidence.map(e=>e.relativePath)).size).toBe(2);
      const cards=container.all().filter(n=>n.className==='tb-result'&&n.text().includes(action));expect(cards).toHaveLength(2);
      for(const card of cards){expect(card.text()).toContain('simulator:\n>');expect(card.text()).toContain(messages(locale).excerpt);for(const b of card.all().filter(n=>n.className==='tb-source')){b.fire('click');await opens.at(-1);}}
      expect(opens).toHaveLength(found.reduce((count,r)=>count+r.fragment.evidence.length,0));await Promise.all(opens);verifiedActions+=opens.length;dispose();dispose=undefined;vi.unstubAllGlobals();
    }
    for(const[n,r]of Object.entries(f.raws)){expect(hash(await fs.readFile(path.join(f.root,n)))).toBe(hash(r));expect((await fs.stat(path.join(f.root,n),{bigint:true})).mtimeNs.toString()).toBe(f.mtimes.get(n));}
    expect(await currentEvidence(evidence,f.sources)).toEqual(evidence);
    const name='a.'+extension;await fs.writeFile(path.join(f.root,name),f.raws[name].replace('disconnected copper simulator:','changed synthetic simulator:'));
    for(const e of evidence)await expect(f.c.verifyOpen(e)).rejects.toThrow();expect((await f.c.find('cobalt memory dial','medium')).some(r=>r.fragment.id===actions.find(x=>x.summary.includes(legacy.lead))!.id)).toBe(false);
    await fs.writeFile(path.join(f.root,name),f.raws[name]);f.settings.excludes.push(name);for(const e of evidence)await expect(f.c.verifyOpen(e)).rejects.toThrow();f.settings.excludes.pop();for(const e of evidence)await f.c.verifyOpen(e);
    const commit=vi.spyOn(f.store,'commit'),oversized='> Only the synthetic rig; '+'合'.repeat(16384)+':\n>\n\n'+action;
    await fs.writeFile(path.join(f.root,name),extension==='md'?oversized:canvas(oversized));await expect(f.c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(f.statePath)).toEqual(state);await fs.writeFile(path.join(f.root,name),f.raws[name]);await f.c.refresh();expect(await fs.readFile(f.statePath)).toEqual(state);
    const list=f.sources.list.bind(f.sources);let release!:()=>void,entered!:()=>void;const started=new Promise<void>(r=>{entered=r;}),latch=new Promise<void>(r=>{release=r;});
    vi.spyOn(f.sources,'list').mockImplementationOnce(async options=>{entered();await latch;return list(options);});commit.mockClear();const refresh=f.c.refresh();await started;f.c.cancel();release();await expect(refresh).rejects.toMatchObject({name:'AbortError'});expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(f.statePath)).toEqual(state);await f.c.refresh();expect(await fs.readFile(f.statePath)).toEqual(state);
    const target=path.join(f.root,await f.store.fragmentPath(actions[0].id)),bytes=await fs.readFile(target);await fs.writeFile(target,Buffer.concat([bytes,Buffer.from('\nSynthetic human amendment.')]));await expect(f.c.refresh()).rejects.toThrow();expect(await fs.readFile(target,'utf8')).toContain('Synthetic human amendment.');expect(await fs.readFile(f.statePath)).toEqual(state);await fs.writeFile(target,bytes);await f.c.initialize();await f.c.refresh();expect(await fs.readFile(f.statePath)).toEqual(state);
    for(const[n,r]of Object.entries(f.raws))expect(await fs.readFile(path.join(f.root,n),'utf8')).toBe(r);expect(await fs.readFile(path.join(f.root,'Derived/manual.txt'),'utf8')).toBe('Synthetic human-owned file.');expect(f.request).not.toHaveBeenCalled();
    await fs.writeFile(path.resolve('.local/local-quoted-introduction',extension+'-receipt.json'),JSON.stringify({strictReload:true,contextualActions:2,verifiedActions,legacyUpgrade:extension==='md',idempotentStateBytes:true,realModelRequests:0,nativeHost:false},null,2));
  } finally {await pending?.catch(()=>{});dispose?.();f.c.dispose();vi.unstubAllGlobals();vi.restoreAllMocks();}
});

it('counts quoted Canvas introductions in the unchanged 256-evidence limit; overflow never commits and repaired input recovers',async()=>{
  const f=await fixture('canvas');f.settings.excludes.push(...Object.keys(f.raws));
  const encode=(count:number)=>canvas(legacy.lead+'\n\n'+action+'\n'+Array.from({length:count},(_,i)=>'- Condition: synthetic tile '+i+'.').join('\n'));
  const source=path.join(f.root,'boundary.canvas');
  try{
    await fs.writeFile(source,encode(254));await f.c.initialize();await f.c.refresh();const index=(await f.store.load())!;expect(Object.values(index.fragments)).toHaveLength(1);const fragment=Object.values(index.fragments)[0];expect(fragment.evidence).toHaveLength(256);
    expect(await currentEvidence(fragment.evidence,f.sources)).toEqual(fragment.evidence);for(const e of [fragment.evidence[0],fragment.evidence.at(-1)!])await f.c.verifyOpen(e);
    const state=await fs.readFile(f.statePath);await f.c.refresh();expect(await fs.readFile(f.statePath)).toEqual(state);const commit=vi.spyOn(f.store,'commit');await fs.writeFile(source,encode(255));await expect(f.c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(f.statePath)).toEqual(state);await fs.writeFile(source,encode(254));await f.c.refresh();expect(await fs.readFile(f.statePath)).toEqual(state);expect(f.request).not.toHaveBeenCalled();
  }finally{f.c.dispose();vi.restoreAllMocks();}
});
