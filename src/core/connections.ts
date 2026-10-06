// SPDX-License-Identifier: MIT
import type { Facets, Fragment, IndexState } from './types';
import { facetKey } from './util';

export const NETWORK_LIMITS = Object.freeze({ facetsPerChannel: 8, postingSize: 32, candidates: 96, links: 6 });
type Channel = 'topics' | 'concepts' | 'mechanisms';
export interface SharedAttribute { channel: Channel; value: string; }
export interface FragmentConnection { targetId: string; shared: SharedAttribute[]; }
export interface FragmentNetwork {
  connections: Map<string, FragmentConnection[]>;
  stats: { fragments: number; postingVisits: number; candidatePairs: number; links: number; ignoredPostings: number };
}
const CHANNELS: Channel[] = ['mechanisms', 'concepts', 'topics'];
const GENERIC = new Set(['general', 'misc', 'miscellaneous', 'other', 'unknown', 'idea', 'ideas', 'note', 'notes', 'thought', 'thoughts', 'knowledge', '一般', '其他', '其它', '杂项', '想法', '笔记', '知识', '思考', '生活']);
const order = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
function current(f: Fragment, index: IndexState, memberships: Map<string, Set<string>>): boolean {
  return !!f.evidence.length && f.evidence.every(e => {
    const s = index.sources[e.relativePath];
    return s?.status === 'indexed' && s.hash === e.sourceHash && memberships.get(e.relativePath)?.has(f.id);
  });
}
function labels(facets: Facets, channel: Channel): string[] {
  return [...new Set(facets[channel].map(facetKey))]
    .filter(s => s.length >= 2 && !GENERIC.has(s) && /[\p{L}\p{N}]/u.test(s))
    .sort(order).slice(0, NETWORK_LIMITS.facetsPerChannel);
}
/** Exact existing attributes, never a semantic model or a kind/title match.
 * Privacy-separated inverted postings bound work to N * 24 * 32 visits and
 * N * 96 candidates, with at most six directed links per fragment. Oversized
 * or ubiquitous postings abstain rather than form dense generic cliques.
 * Canonical labels, ID ordering and fixed caps are part of render version 2;
 * changing these rules requires a new store render version.
 */
export function buildFragmentNetwork(index: IndexState): FragmentNetwork {
  const memberships = new Map(Object.entries(index.sources).map(([p, s]) => [p, new Set(s.fragmentIds)]));
  const fragments = Object.values(index.fragments).filter(f => current(f, index, memberships)).sort((a, b) => order(a.id, b.id));
  if (fragments.length > 10000) throw new Error('Fragment network exceeds index limit');
  const population = new Map<string, number>();
  for (const f of fragments) population.set(f.privacy, (population.get(f.privacy) ?? 0) + 1);
  const postings = new Map<string, { channel: Channel; value: string; ids: string[]; count: number }>();
  const byId = new Map<string, string[]>();
  for (const f of fragments) {
    const keys: string[] = [];
    for (const channel of CHANNELS) for (const value of labels(f.facets, channel)) {
      const key = JSON.stringify([f.privacy, channel, value]);
      keys.push(key);
      let p = postings.get(key);
      if (!p) { p = { channel, value, ids: [], count: 0 }; postings.set(key, p); }
      p.count++;
      if (p.ids.length < NETWORK_LIMITS.postingSize) p.ids.push(f.id);
    }
    byId.set(f.id, keys);
  }
  const stats = { fragments: fragments.length, postingVisits: 0, candidatePairs: 0, links: 0, ignoredPostings: 0 };
  const connections = new Map<string, FragmentConnection[]>();
  for (const f of fragments) {
    const threshold = Math.max(4, Math.min(NETWORK_LIMITS.postingSize, Math.floor((population.get(f.privacy) ?? 0) * 0.1)));
    const useful = byId.get(f.id)!.map(key => postings.get(key)!).filter(p => {
      if (p.count > threshold) { stats.ignoredPostings++; return false; }
      return p.count > 1;
    }).sort((a, b) => a.count - b.count || CHANNELS.indexOf(a.channel) - CHANNELS.indexOf(b.channel) || order(a.value, b.value));
    const candidates = new Map<string, { score: number; shared: SharedAttribute[] }>();
    for (const p of useful) for (const targetId of p.ids) {
      stats.postingVisits++;
      if (targetId === f.id) continue;
      let candidate = candidates.get(targetId);
      if (!candidate) {
        if (candidates.size >= NETWORK_LIMITS.candidates) continue;
        candidate = { score: 0, shared: [] }; candidates.set(targetId, candidate);
      }
      candidate.score += (p.channel === 'mechanisms' ? 4 : p.channel === 'concepts' ? 3 : 2) / p.count;
      candidate.shared.push({ channel: p.channel, value: p.value });
    }
    stats.candidatePairs += candidates.size;
    const selected = [...candidates].sort(([a, x], [b, y]) => y.score - x.score || order(a, b))
      .slice(0, NETWORK_LIMITS.links).map(([targetId, candidate]) => ({ targetId, shared: candidate.shared.slice(0, 6) }));
    connections.set(f.id, selected); stats.links += selected.length;
  }
  return { connections, stats };
}
