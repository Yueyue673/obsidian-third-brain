// SPDX-License-Identifier: MIT
// Authored synthetic untagged material; local lexical recall, not AI/semantic grading.
// Production file/core/store/Main/renderer callbacks; host/DOM shells, not native clicks.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { MarkdownView } from 'obsidian';
import ThirdBrainPlugin from '../src/main';
import { ThirdBrainController } from '../src/controller';
import { FileSources } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults } from '../src/settings';
import { hasReadableQuote } from '../src/core/sources';
import { searchFragments } from '../src/core';
import type { Breadth, SearchResult } from '../src/core/types';
import { mountPanel } from '../src/ui';
import { messages } from '../src/i18n';
vi.mock('obsidian', () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, MarkdownView: class {} }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
class Node {
  className = ''; textContent = ''; value = ''; hidden = false; disabled = false;
  children: Node[] = []; handlers = new Map<string, (() => void)[]>();
  constructor(readonly tag: string) {} append(...n: Node[]) { this.children.push(...n); }
  replaceChildren(...n: Node[]) { this.children = n; } setAttribute() {} remove() {} focus() {}
  get childElementCount() { return this.children.length; }
  addEventListener(k: string, h: () => void) { this.handlers.set(k, [...this.handlers.get(k) ?? [], h]); }
  fire(k: string) { for (const h of this.handlers.get(k) ?? []) h(); }
  all(): Node[] { return [this, ...this.children.flatMap(n => n.all())]; }
  text(): string { return [this.textContent, ...this.children.map(n => n.text())].join('\n'); }
}
const specimens = {
  en: {
    opening: 'These are tabletop conservation rehearsals with inert paper replicas, never handling advice for real collections. ',
    background: 'The synthetic log records the orientation of the beige tile and the chalk tray before each dummy rehearsal. ',
    point: 'The indigo paper seal stays flat only in a dry felt sleeve inside the dark cabinet; a damp glass pocket curls its corners.',
    contrary: 'In the contrasting synthetic humid-room rehearsal, a dry felt sleeve curls the indigo paper seal; the damp glass pocket keeps its corners flat.',
    foil: 'The indigo paper seal rests beside a broad display shelf and a chalk tray, far from the warm glass case.', count: 'Synthetic independent shelf specimen',
    queries: ['I want to keep the indigo paper seal flat in a dry felt sleeve', 'dry felt sleeve dark cabinet', 'damp glass pocket curls corners', 'dry felt sleeve', 'humid-room rehearsal'],
    negative: 'unmatchedzxqv pulsar',
  },
  zh: {
    opening: '这些只是惰性纸制复制品的桌面保护演练，不能作为真实藏品的处理建议。',
    background: '合成记录在每次模拟演练前核对米色方片和粉笔托盘的朝向，并记下那次摆放。',
    point: '靛蓝纸质封签只有放在暗柜里的干燥毛毡套中才保持平整；潮湿玻璃袋会卷起它的边角。',
    contrary: '在相反的合成潮湿室演练中，干燥毛毡套会让靛蓝纸质封签卷边；潮湿玻璃袋反而使它的边角保持平整。',
    foil: '靛蓝纸质封签放在宽展示架和粉笔托盘旁，远离温热玻璃盒。', count: '合成独立架位标本',
    queries: ['我想把靛蓝纸质封签放进干燥毛毡套里保持平整', '干燥毛毡套暗柜', '潮湿玻璃袋卷起边角', '毛毡', '潮湿室演练'], negative: '银河税率',
  },
};
const projection = (items: SearchResult[]) => Array.from(items, r => ({ id:r.fragment.id,score:r.score,reasons:r.reasons,group:r.group }));
it.each([['en','md'],['en','canvas'],['zh','md'],['zh','canvas']] as const)('%s/%s natural idea retrieves the late point with complete conditions, all donors and working source/generated actions', async (locale, ext) => {
  const s = specimens[locale], scope = path.resolve('.local/local-passage-recall'); await fs.mkdir(scope,{ recursive:true });
  const root = await fs.mkdtemp(path.join(scope,'vault-')), originals = new Map<string,{ text:string;mtime:string }>();
  const put = async (name:string,body:string,privacy:string) => {
    const text = `---\nprivacy: ${privacy}\n---\n${body}`, raw = ext === 'canvas' ? JSON.stringify({ nodes:[{ type:'text',text }],edges:[] }) : text;
    await fs.writeFile(path.join(root,name),raw); originals.set(name,{ text:raw,mtime:(await fs.stat(path.join(root,name),{ bigint:true })).mtimeNs.toString() });
  };
  const paragraph = s.opening + s.background.repeat(locale === 'zh' ? 65 : 24) + s.point;
  expect(paragraph.indexOf(s.point)).toBeGreaterThan(1400); expect(paragraph.indexOf(s.point)).toBeGreaterThan(paragraph.length/2);
  await put('long.'+ext,paragraph,'normal'); await put('copy.'+ext,paragraph,'private'); await put('contrary.'+ext,s.contrary,'local');
  for (let i=0;i<8;i++) await put(`foil-${i}.`+ext,s.foil+' '+s.count+' '+i+'.',i%2 ? 'local':'normal');
  await put('empty.'+ext,'','normal'); await fs.mkdir(path.join(root,'Derived'));
  const human = 'Synthetic human-authored material, never generated.', humanPath = path.join(root,'Derived/manual.txt'); await fs.writeFile(humanPath,human);
  const humanTime = (await fs.stat(humanPath,{ bigint:true })).mtimeNs.toString();
  const settings = { ...defaults,outputFolder:'Derived',excludes:[] as string[],locale }, store = new OwnedStore(root,'Derived');
  const sources = new FileSources(root,() => settings,() => store.managedSourcePaths());
  const factory = vi.fn(() => undefined), controller = new ThirdBrainController(sources,store,() => settings,factory,async () => {});
  const queries:Promise<SearchResult[]>[] = [], operations:Promise<void>[] = [], opened:string[] = [], selections:string[] = [];
  let dispose:(() => void)|undefined;
  try {
    await controller.initialize(); await controller.refresh(); await controller.initialize(); const index = (await store.load())!;
    const fragments = Object.values(index.fragments), target = fragments.find(f => f.summary === paragraph)!, contrary = fragments.find(f => f.summary === s.contrary)!;
    expect(Object.keys(index.sources)).toHaveLength(12); expect(fragments).toHaveLength(10);
    expect(fragments.every(f => f.mode === 'local' && Object.values(f.facets).every(v => !v.length))).toBe(true);
    expect(target).toBeDefined(); expect(target.localContext).toBeUndefined(); expect(target.privacy).toBe('private'); expect(contrary.privacy).toBe('local'); expect(contrary.id).not.toBe(target.id);
    expect(new Set(target.evidence.map(e => e.relativePath))).toEqual(new Set(['long.'+ext,'copy.'+ext])); expect(target.evidence.every(e => e.quote === paragraph)).toBe(true);
    const frozen = JSON.stringify(index);
    const leaf = { view:Object.create(MarkdownView.prototype),openFile:async (file:{ path:string }) => {
      opened.push(file.path); leaf.view.file=file; leaf.view.getMode=() => 'source'; const raw=originals.get(file.path)?.text ?? '';
      leaf.view.editor={ getValue:() => raw,setSelection:(a:{ line:number;ch:number },b:{ line:number;ch:number }) => {
        const offset=(p:{ line:number;ch:number }) => raw.split('\n').slice(0,p.line).reduce((n,line) => n+line.length+1,0)+p.ch;
        selections.push(raw.slice(offset(a),offset(b)));
      },scrollIntoView:() => {} };
    } };
    const plugin=Object.assign(Object.create(ThirdBrainPlugin.prototype),{ settings,controller,store,app:{ vault:{ getFileByPath:(n:string) => ({ path:n,extension:path.extname(n).slice(1) }) },workspace:{ getLeaf:() => leaf } } }) as ThirdBrainPlugin;
    const port=plugin.panelPort(),find=port.find.bind(port),open=port.open.bind(port),generated=port.openFragment!.bind(port);
    vi.spyOn(port,'find').mockImplementation((...a) => { const p=find(...a);queries.push(p);return p; });
    vi.spyOn(port,'open').mockImplementation(e => { const p=open(e);operations.push(p);return p; });
    vi.spyOn(port,'openFragment').mockImplementation((...a) => { const p=generated(...a);operations.push(p);return p; });
    vi.stubGlobal('document',{ createElement:(tag:string) => new Node(tag) }); const container=new Node('main'),t=messages(locale);
    dispose=mountPanel(container as unknown as HTMLElement,port,locale);
    const query=async (text:string,breadth:Breadth,allCurrent=true) => {
      const input=container.all().find(n => n.className === 'tb-idea')!;input.value=text;input.fire('input');
      const select=container.all().find(n => n.tag === 'select')!;select.value=breadth;select.fire('change');
      container.all().find(n => n.tag === 'button' && n.textContent === t.find)!.fire('click');const hits=await queries.at(-1)!;await Promise.resolve();
      if (allCurrent && !settings.excludes.length) expect(projection(hits)).toEqual(projection(searchFragments(fragments,text,{ breadth,index,limit:30 }).slice(0,7)));
      const cards=container.all().filter(n => n.className === 'tb-result');expect(cards).toHaveLength(hits.length);
      for (const [i,r] of hits.entries()) {
        expect(cards[i].text()).toContain(r.fragment.summary);expect(cards[i].text()).toContain(t.excerpt);expect(r.score).toBeGreaterThan(0);
        for (const reason of r.reasons) { expect(reason.kind).toBe('content');expect(reason.quotes.every(q => r.fragment.evidence.some(e => e.quote === q))).toBe(true); }
        for (const e of r.fragment.evidence) {
          const current=(await sources.read(e.relativePath))!;expect(e.sourceId).toBe(current.id);expect(e.sourceHash).toBe(current.hash);expect(index.sources[e.relativePath].fragmentIds).toContain(r.fragment.id);
          if (e.start>=0) expect(current.text.slice(e.start,e.end)).toBe(e.quote); else expect(hasReadableQuote(current,e.quote)).toBe(true);
        }
      }
      return { hits,cards };
    };
    for (const breadth of ['low','medium','high'] as const) for (const text of s.queries) {
      const { hits }=await query(text,breadth);expect(hits.some(r => r.fragment.id === target.id)).toBe(true);
      // Opposing conditions remain lexical candidates: this change does not infer which condition applies.
      expect(hits.some(r => r.fragment.id === contrary.id)).toBe(true);
    }
    const { hits,cards }=await query(s.queries[0],'medium'),i=hits.findIndex(r => r.fragment.id === target.id),hit=hits[i],card=cards[i];
    expect(i).toBeGreaterThanOrEqual(0);expect(card.text()).toContain(s.opening);expect(card.text()).toContain(s.point);
    expect(hit.reasons[0].label).toMatch(/^Local passage keyword match: /u);
    expect(card.text()).toContain(locale === 'zh' ? '完整摘录' : 'full excerpt');
    const actions=card.all().filter(n => n.className === 'tb-source' || n.tag === 'button' && n.textContent === t.openFragment);expect(actions).toHaveLength(3);
    for (const [j,button] of actions.filter(n => n.className === 'tb-source').entries()) {
      button.fire('click');await operations.at(-1)!;expect(opened.at(-1)).toBe(hit.fragment.evidence[j].relativePath);
      if (ext === 'md') expect(selections.at(-1)).toBe(paragraph);
    }
    actions.find(n => n.textContent === t.openFragment)!.fire('click');await operations.at(-1)!;expect(opened.at(-1)).toBe(await store.fragmentPath(target.id));
    expect((await query(s.negative,'high')).hits).toEqual([]);expect(JSON.stringify(index)).toBe(frozen);
    const statePath=path.join(root,'Derived/.third-brain/state.json'),bytes=await fs.readFile(statePath),stateTime=(await fs.stat(statePath,{ bigint:true })).mtimeNs.toString();
    await controller.refresh();expect(await fs.readFile(statePath)).toEqual(bytes);expect((await fs.stat(statePath,{ bigint:true })).mtimeNs.toString()).toBe(stateTime);expect(await store.load()).toEqual(index);
    for (const [name,v] of originals) { expect(await fs.readFile(path.join(root,name),'utf8')).toBe(v.text);expect((await fs.stat(path.join(root,name),{ bigint:true })).mtimeNs.toString()).toBe(v.mtime); }
    expect(await fs.readFile(humanPath,'utf8')).toBe(human);expect((await fs.stat(humanPath,{ bigint:true })).mtimeNs.toString()).toBe(humanTime);
    const refuse=async () => { const before=opened.length;for (const action of actions) { action.fire('click');await expect(operations.at(-1)).rejects.toThrow(); }expect(opened).toHaveLength(before); };
    settings.excludes.push('copy.'+ext);await refuse();expect((await query(s.queries[0],'medium')).hits.some(r => r.fragment.id === target.id)).toBe(false);settings.excludes.pop();
    // Mutate/restore only this newly authored synthetic donor, never a user original.
    const copy=path.join(root,'copy.'+ext),raw=originals.get('copy.'+ext)!.text;await fs.writeFile(copy,raw.replace(s.point,s.point+' synthetic changed donor'));
    await refuse();expect((await query(s.queries[0],'medium',false)).hits.some(r => r.fragment.id === target.id)).toBe(false);expect(await fs.readFile(statePath)).toEqual(bytes);
    await fs.writeFile(copy,raw);await controller.refresh();expect(await fs.readFile(statePath)).toEqual(bytes);expect(await store.load()).toEqual(index);
    const generatedPath=path.join(root,(await store.fragmentPath(target.id))!),generatedBytes=await fs.readFile(generatedPath);
    await fs.writeFile(generatedPath,Buffer.concat([generatedBytes,Buffer.from('\nSynthetic human edit.')]));
    const edited=await fs.readFile(generatedPath);await refuse();await expect(controller.find(s.queries[0],'medium')).rejects.toThrow();await expect(controller.refresh()).rejects.toThrow();
    expect(await fs.readFile(generatedPath)).toEqual(edited);expect(await fs.readFile(statePath)).toEqual(bytes);
    // Controlled test-only repair back to our exact authored generated bytes.
    await fs.writeFile(generatedPath,generatedBytes);await controller.refresh();expect(await fs.readFile(statePath)).toEqual(bytes);
    const inventory=(await fs.readdir(path.join(root,'Derived'),{ recursive:true,withFileTypes:true })).filter(n => n.isFile()).map(n => path.relative(path.join(root,'Derived'),path.join(n.parentPath,n.name)).replace(/\\/gu,'/')).sort();
    expect(inventory).toHaveLength(13);expect(inventory.filter(n => n.startsWith('.third-brain/'))).toEqual(['.third-brain/marker.json','.third-brain/state.json']);expect(factory.mock.results.every(r => r.type === 'return' && r.value === undefined)).toBe(true);
  } finally { await Promise.allSettled([...queries,...operations]);dispose?.();controller.dispose(); }
},90000);
