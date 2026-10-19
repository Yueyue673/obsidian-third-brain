// SPDX-License-Identifier: MIT
// Synthetic authored tables, real file/store/controller and Main renderer events.
// No real model, semantic grading, link fetching or native GUI acceptance.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { MarkdownView } from 'obsidian';
import ThirdBrainPlugin from '../src/main';
import { ThirdBrainController } from '../src/controller';
import { analyzeSource, buildIndex, emptyIndex, prepareSource } from '../src/core';
import { hasReadableQuote } from '../src/core/sources';
import { FileSources, hash } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults, generationSignature } from '../src/settings';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
import type { ModelRequest, SearchResult } from '../src/core/types';
vi.mock('obsidian', () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, MarkdownView: class {}, Notice: class {} }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const caption = 'Only inside the disconnected synthetic enclosure:';
const opposite = 'Never inside the disconnected synthetic enclosure:';
const table = '| Observation | Applicability |\n| :--- | ---: |\n| The indigo latch records the late trial. | A warm rim is the counterexample. |';
const body = '# Synthetic inspection\n\n## Earlier independent register\n' + 'A paper gauge records mock wheel orientation. '.repeat(50) + '\n\n## Late independent point\n' + caption + '\n\n' + table + '\n\nAn unrelated mint gauge stays independent.';
const opts = { mode: 'local-excerpts' as const, cloudConsent: false, now: '2026-01-01T00:00:00.000Z' };
const snap = (text: string, name = 'synthetic.md') => prepareSource(name, text, hash(text), hash(name).slice(0, 24));
const wrap = (text: string, ext: string) => ext === 'canvas' ? JSON.stringify({ nodes: [{ type: 'text', text: '---\nprivacy: private\n---\n' + text }], edges: [] }) : '---\nprivacy: local\n---\n' + text;
it.each(['md', 'canvas'])('%s table retains its explicit introduction/header/rows; opposing conditions differ and complete copies merge', async ext => {
  const sources = [snap(wrap(body, ext), 'a.' + ext), snap(wrap(body, ext), 'b.' + ext), snap(wrap(body.replace(caption, opposite), ext), 'c.' + ext)];
  const index = await buildIndex(sources, { ...opts, previous: emptyIndex(), signature: generationSignature(defaults) });
  const hits = Object.values(index.fragments).filter(f => f.summary.includes('indigo latch')); expect(hits).toHaveLength(2);
  const allowed = hits.find(f => f.summary.includes(caption))!; expect(allowed).toBeDefined(); expect(allowed.summary).toContain(table); expect(allowed.summary).not.toContain('mint gauge');
  expect(new Set(allowed.evidence.map(e => e.relativePath))).toEqual(new Set(['a.' + ext, 'b.' + ext]));
  expect(hits.some(f => f.summary.includes(opposite))).toBe(true);
  for (const f of hits) for (const e of f.evidence) { const s = sources.find(s => s.path === e.relativePath)!; expect(e.sourceHash).toBe(s.hash); if (e.start >= 0) expect(s.text.slice(e.start, e.end)).toBe(e.quote); else { expect(ext).toBe('canvas'); expect(hasReadableQuote(s, e.quote)).toBe(true); } }
});
class Node {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false; children: Node[] = []; attrs: Record<string, string> = {}; handlers = new Map<string, (() => void)[]>();
  constructor(readonly tag: string) {} append(...nodes: Node[]) { this.children.push(...nodes); } replaceChildren(...nodes: Node[]) { this.children = nodes; }
  setAttribute(k: string, v: string) { this.attrs[k] = v; } remove() {} focus() {} get childElementCount() { return this.children.length; }
  addEventListener(k: string, fn: () => void) { this.handlers.set(k, [...this.handlers.get(k) ?? [], fn]); } fire(k: string) { for (const fn of this.handlers.get(k) ?? []) fn(); }
  all(): Node[] { return [this, ...this.children.flatMap(n => n.all())]; } text(): string { return [this.textContent, ...this.children.map(n => n.text())].join('\n'); }
}
async function fixture(ext: string, locale: 'en' | 'zh') {
  const base = path.resolve('.local/local-tables'); await fs.mkdir(base, { recursive: true }); const root = await fs.mkdtemp(path.join(base, ext + '-'));
  const expected = new Map<string, { text: string; mtime: string }>();
  const put = async (name: string, text: string) => { await fs.writeFile(path.join(root, name), text); expected.set(name, { text, mtime: (await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString() }); };
  await put('a.' + ext, wrap(body, ext)); await put('b.' + ext, wrap(body, ext)); await fs.mkdir(path.join(root, 'Derived')); await put('Derived/manual.txt', 'Synthetic human-owned table material.');
  const settings = { ...defaults, outputFolder: 'Derived', excludes: [] as string[], locale }, store = new OwnedStore(root, 'Derived'), sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
  const request = vi.fn(async () => { throw Error('Forbidden model request'); }), c = new ThirdBrainController(sources, store, () => settings, () => ({ request }), async () => {});
  const hostOpens: string[] = [], selections: unknown[] = [];
  const leaf = { view: Object.create(MarkdownView.prototype), openFile: async (file: { path: string }) => { hostOpens.push(file.path); leaf.view.file = file; leaf.view.getMode = () => 'source'; leaf.view.editor = { getValue: () => expected.get(file.path)?.text ?? '', setSelection: (...args: unknown[]) => selections.push(args), scrollIntoView: () => {} }; } };
  const plugin = Object.assign(Object.create(ThirdBrainPlugin.prototype), { settings, controller: c, store, app: { vault: { getFileByPath: (p: string) => ({ path: p, extension: path.extname(p).slice(1) }) }, workspace: { getLeaf: () => leaf } } }) as ThirdBrainPlugin;
  const port = plugin.panelPort(), finds: Promise<SearchResult[]>[] = [], opens: Promise<void>[] = [], generated: Promise<void>[] = [];
  const find = port.find.bind(port), open = port.open.bind(port), fragment = port.openFragment!.bind(port);
  vi.spyOn(port, 'find').mockImplementation((...args) => { const p = find(...args); finds.push(p); return p; }); vi.spyOn(port, 'open').mockImplementation(e => { const p = open(e); opens.push(p); return p; }); vi.spyOn(port, 'openFragment').mockImplementation(id => { const p = fragment(id); generated.push(p); return p; });
  vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) }); const container = new Node('main'), dispose = mountPanel(container as unknown as HTMLElement, port, locale);
  const query = async () => { const input = container.all().find(n => n.className === 'tb-idea')!; input.value = 'indigo latch'; input.fire('input'); container.all().find(n => n.tag === 'button' && n.textContent === messages(locale).find)!.fire('click'); const hits = await finds.at(-1)!; await Promise.resolve(); return hits; };
  const originals = async () => { for (const [name, e] of expected) { expect(hash(await fs.readFile(path.join(root, name)))).toBe(hash(e.text)); expect((await fs.stat(path.join(root, name), { bigint: true })).mtimeNs.toString()).toBe(e.mtime); } expect(request).not.toHaveBeenCalled(); };
  const close = async () => { await Promise.allSettled([...finds, ...opens, ...generated]); dispose(); c.dispose(); };
  return { root, put, settings, store, sources, c, container, port, query, opens, generated, hostOpens, selections, originals, close };
}
it.each([['md', 'en'], ['md', 'zh'], ['canvas', 'en'], ['canvas', 'zh']] as const)('actual %s/%s idea → contextual table → strict reload → all Main renderer original/generated callbacks', async (ext, locale) => {
  const f = await fixture(ext, locale); try {
    await f.c.initialize(); await f.c.refresh(); await f.c.initialize(); const hits = await f.query(); expect(hits).toHaveLength(1);
    const card = hits[0].fragment; expect(card.summary).toContain(caption); expect(card.summary).toContain(table); expect(new Set(card.evidence.map(e => e.relativePath)).size).toBe(2);
    const visible = f.container.all().find(n => n.className === 'tb-fragment')!; expect(visible.text()).toContain(caption); expect(visible.text()).toContain('counterexample');
    for (const b of f.container.all().filter(n => n.className === 'tb-source')) { b.fire('click'); await f.opens.at(-1); }
    f.container.all().find(n => n.tag === 'button' && n.textContent === messages(locale).openFragment)!.fire('click'); await f.generated.at(-1);
    expect(f.opens).toHaveLength(card.evidence.length); expect(f.generated).toHaveLength(1); expect(f.hostOpens.at(-1)).toBe(await f.store.fragmentPath(card.id)); if (ext === 'md') expect(f.selections).toHaveLength(card.evidence.length);
    const rendered = await fs.readFile(path.join(f.root, await f.store.fragmentPath(card.id)), 'utf8'); expect(rendered).toContain(caption); expect(rendered).toContain('counterexample');
    const statePath = path.join(f.root, 'Derived/.third-brain/state.json'), state = await fs.readFile(statePath); await f.c.refresh(); expect(await fs.readFile(statePath)).toEqual(state);
    await f.put('b.' + ext, wrap(body.replace(caption, opposite), ext)); for (const e of card.evidence) await expect(f.c.verifyOpen(e)).rejects.toThrow(); expect(await f.c.find('indigo latch', 'medium')).toHaveLength(0); expect(await fs.readFile(statePath)).toEqual(state);
    await f.c.refresh(); await f.c.initialize(); const current = await f.query(); expect(current).toHaveLength(2); expect(current.some(r => r.fragment.summary.includes(opposite))).toBe(true); for (const r of current) for (const e of r.fragment.evidence) await f.port.open(e);
    const unique = body.replace('The indigo latch records the late trial.', 'The jade rotor reports a distinct late observation.'); await f.put('b.' + ext, wrap(unique, ext)); await f.c.refresh(); await f.c.initialize(); expect(await f.c.find('jade rotor', 'medium')).toHaveLength(1); expect(await f.c.find('indigo latch', 'medium')).toHaveLength(1);
    f.settings.excludes.push('a.' + ext); for (const e of (await f.c.find('jade rotor', 'medium'))[0].fragment.evidence) await f.port.open(e); expect(await f.c.find('indigo latch', 'medium')).toHaveLength(0); f.settings.excludes.pop(); await f.originals();
  } finally { await f.close(); }
});
it('retains optional outer pipes, alignment, escaped pipes, Chinese/CRLF and quoted introductions without splitting rows', async () => {
  for (const nl of ['\n', '\r\n', '\r']) for (const t of [table, 'Observation | Applicability\n:-- | --:\nThe indigo latch records the trial. | A warm rim is the counterexample.', '| Observation \\| label | Applicability |\n| -- | :--: |\n| The indigo latch records the trial. | A warm rim is the counterexample. |']) {
    const raw = ('仅限断开的合成箱：\n\n' + t).replace(/\n/gu, nl), all = (await analyzeSource(snap(raw), opts)).fragments; expect(all).toHaveLength(1); expect(all[0].summary).toContain('仅限断开的合成箱：'); expect(all[0].summary).toContain(t.replace(/\n/gu,nl)); for (const e of all[0].evidence) expect(raw.slice(e.start,e.end)).toBe(e.quote);
  }
  const q = '> [!warning]\n> Only the disconnected synthetic enclosure:\n>\n\n' + table;
  expect((await analyzeSource(snap(q),opts)).fragments.find(f => f.summary.includes('indigo latch'))!.summary).toContain('> Only');
});
it('does not infer scope for non-colon prose, plain pipe text, invalid headers, boundaries, quoted/nested tables or other Canvas nodes', async () => {
  for (const raw of [caption.slice(0,-1) + '\n\n' + table, caption + '\n\nObservation | Applicability\nNo delimiter row\nThe indigo latch records the trial.', caption + '\n\n| Observation | Applicability |\n| -- |\n| The indigo latch records the trial. |', caption + '\n\n---\n\n' + table, caption + '\n\n```\nSynthetic code\n```\n\n' + table, caption + '\n\n## Another section\n\n' + table, caption + '\n\n' + table.split('\n').map(v => '> ' + v).join('\n'), caption + '\n\n' + table.split('\n').map(v => '    ' + v).join('\n')]) {
    const hit = (await analyzeSource(snap(raw),opts)).fragments.find(f => f.summary.includes('indigo latch'))!; expect(hit).toBeDefined(); expect(hit.summary).not.toContain(caption); expect(hit.summary).not.toContain(caption.slice(0,-1));
  }
  const c = JSON.stringify({nodes:[{type:'text',text:caption},{type:'text',text:table}],edges:[]}); expect((await analyzeSource(snap(c,'synthetic.canvas'),opts)).fragments.find(f => f.summary.includes('indigo latch'))!.summary).not.toContain(caption);
  const plain = caption + '\n\nA mint gauge records an unrelated trial.'; expect((await analyzeSource(snap(plain),opts)).fragments.find(f=>f.summary.includes('mint gauge'))!.summary).not.toContain(caption);
});
it('includes reference and footnote restrictions from the attached introduction and rejects hidden introductions', async () => {
  const raw = 'Only [boundary][scope] applies[^a]:\n\n' + table + '\n\n[scope]: <synthetic.md> "Only inert enclosures."\n\n[^a]: A warm rim is outside this trial.';
  const f = (await analyzeSource(snap(raw),opts)).fragments.find(f=>f.summary.includes('indigo latch'))!; expect(f.summary).toContain('Only inert'); expect(f.summary).toContain('outside this trial'); for (const e of f.evidence) expect(raw.slice(e.start,e.end)).toBe(e.quote);
  for (const hidden of ['Only <!-- secret --> inert trials:', 'Only %%secret%% inert trials:']) await expect(analyzeSource(snap(hidden + '\n\n' + table),opts)).rejects.toThrow();
});
it('actual failure/cancel/repaired retry and human edits preserve state bytes and originals', async () => {
  const f = await fixture('md','en'); try {
    await f.c.initialize(); await f.c.refresh(); const statePath = path.join(f.root,'Derived/.third-brain/state.json'), state = await fs.readFile(statePath), commit = vi.spyOn(f.store,'commit');
    for (const text of [body.replace(caption,'Only <!-- hidden --> inert trials:'), body.replace(caption,'Only ' + '合'.repeat(16384) + ':')]) {
      await f.put('b.md',wrap(text,'md')); await expect(f.c.refresh()).rejects.toThrow(); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    }
    await f.put('b.md',wrap(body,'md')); const list = f.sources.list.bind(f.sources); let entered!:()=>void, release!:()=>void; const started=new Promise<void>(r=>{entered=r;}), latch=new Promise<void>(r=>{release=r;}); vi.spyOn(f.sources,'list').mockImplementationOnce(async o=>{entered();await latch;return list(o);});
    const cancelled=f.c.refresh(); await started; f.c.cancel(); release(); await expect(cancelled).rejects.toMatchObject({name:'AbortError'}); expect(commit).not.toHaveBeenCalled(); expect(await fs.readFile(statePath)).toEqual(state);
    await f.c.refresh(); await f.c.initialize(); const target=(await f.c.find('indigo latch','medium'))[0].fragment; expect(target.summary).toContain(caption); const stable=await fs.readFile(statePath); await f.c.refresh(); expect(await fs.readFile(statePath)).toEqual(stable);
    const file=path.join(f.root,await f.store.fragmentPath(target.id)); await fs.appendFile(file,'\nSynthetic human amendment.'); await expect(f.c.refresh()).rejects.toThrow(); expect(await fs.readFile(statePath)).toEqual(stable); expect(await fs.readFile(file,'utf8')).toContain('Synthetic human amendment.'); await f.originals();
  } finally {await f.close();}
});
it.each(['md','canvas'])('actual %s combined intro/table/definitions retain the unchanged 256/257 quotation bound including merged donors',async ext=>{
  const base=path.resolve('.local/local-tables'); await fs.mkdir(base,{recursive:true}); const root=await fs.mkdtemp(path.join(base,'bounds-'));
  const make=(count:number)=>wrap(caption+'\n\n'+table.replace('late trial.','late trial '+Array.from({length:count},(_,i)=>'[n'+i+']').join(' ')+'.')+'\n\n'+Array.from({length:count},(_,i)=>'[n'+i+']: <synthetic-'+i+'.md>').join('\n'),ext);
  const settings={...defaults,outputFolder:'Derived',excludes:[]},store=new OwnedStore(root,'Derived'),sources=new FileSources(root,()=>settings,()=>store.managedSourcePaths()),c=new ThirdBrainController(sources,store,()=>settings,()=>undefined,async()=>{});
  try {await fs.writeFile(path.join(root,'a.'+ext),make(254));await c.initialize();await c.refresh();await c.initialize();expect(Object.values((await store.load())!.fragments)[0].evidence).toHaveLength(256);
    const statePath=path.join(root,'Derived/.third-brain/state.json'),saved=await fs.readFile(statePath),commit=vi.spyOn(store,'commit');await fs.writeFile(path.join(root,'a.'+ext),make(255));await expect(c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(saved);
    await fs.writeFile(path.join(root,'a.'+ext),make(127));await fs.writeFile(path.join(root,'b.'+ext),make(127));await expect(c.refresh()).rejects.toThrow();expect(commit).not.toHaveBeenCalled();expect(await fs.readFile(statePath)).toEqual(saved);
    await fs.writeFile(path.join(root,'a.'+ext),make(126));await fs.writeFile(path.join(root,'b.'+ext),make(126));await c.refresh();await c.initialize();expect(Object.values((await store.load())!.fragments)[0].evidence).toHaveLength(256);const stable=await fs.readFile(statePath);await c.refresh();expect(await fs.readFile(statePath)).toEqual(stable);
  } finally {c.dispose();}
});
it('complete introduction plus table shares the unchanged 16384 bound and line-ending copies merge',async()=>{
  const prefix='Only inert trials:',tail='\n\n'+table,legal=prefix.slice(0,-1)+'合'.repeat(16384-prefix.length-tail.length)+':'+tail;
  expect((await analyzeSource(snap(legal),opts)).fragments[0].summary).toHaveLength(16384);await expect(analyzeSource(snap(legal.replace(':','合:')),opts)).rejects.toThrow();
  const index=await buildIndex([snap(body,'a.md'),snap(body.replace(/\n/gu,'\r\n'),'b.md')],{...opts,signature:generationSignature(defaults),previous:emptyIndex()});expect(Object.values(index.fragments).filter(f=>f.summary.includes('indigo latch'))).toHaveLength(1);
});
it('AI primary/background/vocabulary and both AI generation signatures remain identical offline',async()=>{
  const legacy=JSON.parse(await fs.readFile('tests/fixtures/local-table-legacy.json','utf8'));for(const mode of ['local-model','cloud-model'] as const){expect(generationSignature({...defaults,mode})).toBe(legacy.signatures[mode]);const requests:ModelRequest[]=[];await analyzeSource(snap(body),{mode,cloudConsent:true,model:{request:async r=>{requests.push(r);return {version:1,decision:'insufficient-context',fragments:[]};}}});expect(requests).toEqual(legacy.requests[mode]);}expect(generationSignature(defaults)).not.toBe(legacy.signatures['local-excerpts']);
});
it('actual frozen old bytes strictly load unchanged, upgrade once through Controller, retain history and then refresh idempotently',async()=>{
  const legacy=JSON.parse(await fs.readFile('tests/fixtures/local-table-legacy.json','utf8')),f=await fixture('md','en');try{
    const snapshots=await f.sources.list();await f.store.commit(structuredClone(legacy.oldIndex),()=>f.sources.verify(snapshots));const statePath=path.join(f.root,'Derived/.third-brain/state.json'),state=await fs.readFile(statePath),marker=JSON.parse(await fs.readFile(path.join(f.root,'Derived/.third-brain/marker.json'),'utf8')),oldFiles:Buffer[]=[];
    for(const id of Object.keys(legacy.oldIndex.fragments)){const bytes=await fs.readFile(path.join(f.root,await f.store.fragmentPath(id)));expect(bytes.toString().replaceAll(marker.storeId,'SYNTHETIC_STORE_ID')).toBe(legacy.rendered[id]);oldFiles.push(bytes);}await f.c.initialize();expect(await f.store.load()).toEqual(legacy.oldIndex);expect(await fs.readFile(statePath)).toEqual(state);await f.c.refresh();await f.c.initialize();expect((await f.query())[0].fragment.summary).toContain(caption);expect((await f.store.load())!.signature).not.toBe(legacy.oldIndex.signature);const saved=await fs.readFile(statePath);await f.c.refresh();expect(await fs.readFile(statePath)).toEqual(saved);
    const history=await fs.readdir(path.join(f.root,'Derived/.third-brain/history'),{recursive:true,withFileTypes:true}),backups=await Promise.all(history.filter(e=>e.isFile()).map(e=>fs.readFile(path.join(e.parentPath,e.name))));for(const b of oldFiles)expect(backups.some(v=>v.equals(b))).toBe(true);await f.originals();
  }finally{await f.close();}
});
