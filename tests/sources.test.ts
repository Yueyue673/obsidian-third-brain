import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Evidence } from '../src/core/types';
import { defaults } from '../src/settings';
import { canonicalPath, contextPrivacy, currentEvidence, FileSources } from '../src/sources';

async function source(name: string, text: string) {
  await fs.mkdir('.local', { recursive: true });
  const root = await fs.mkdtemp(path.join(path.resolve('.local'), 'evidence-'));
  await fs.writeFile(path.join(root, name), text, 'utf8');
  const sources = new FileSources(root, () => ({ ...defaults, excludes: [...defaults.excludes] }), async () => new Set());
  const snapshot = await sources.read(name);
  if (!snapshot) throw new Error('Synthetic source missing');
  return { root, sources, snapshot };
}
function evidence(snapshot: Awaited<ReturnType<typeof source>>['snapshot'], quote: string, start = snapshot.text.indexOf(quote), end = start + quote.length): Evidence {
  return { relativePath: snapshot.path, sourceId: snapshot.id, sourceHash: snapshot.hash, quote, start, end };
}

describe('live evidence at the file-system boundary', () => {
  it('rechecks exact Unicode character spans against byte-hashed originals', async () => {
    const fixture = await source('synthetic.md', '# Synthetic note\n\n保留句子中的停顿，让读者补全没有说出的意思。\n');
    const item = evidence(fixture.snapshot, '保留句子中的停顿，让读者补全没有说出的意思。');
    expect(await currentEvidence([item], fixture.sources)).toEqual([item]);
    for (const changed of [{ ...item, start: item.start + 1 }, { ...item, sourceId: 'wrong-synthetic-id' }, { ...item, sourceHash: '0'.repeat(64) }, { ...item, quote: 'This quotation was invented.' }]) {
      expect(await currentEvidence([changed], fixture.sources)).toEqual([]);
    }
  });
  it('opens verified decoded Canvas text without pretending it has a contiguous raw range', async () => {
    const quote = 'The audience reconstructs meaning from a deliberately incomplete statement.';
    const fixture = await source('synthetic.canvas', JSON.stringify({ nodes: [{ id: 'synthetic-text', type: 'text', text: `# Synthetic context\n\n${quote}\nA second line keeps JSON escaping explicit.` }], edges: [] }));
    expect(fixture.snapshot.text.includes(quote)).toBe(true);
    const item = evidence(fixture.snapshot, quote, -1, -1);
    expect(await currentEvidence([item], fixture.sources)).toEqual([item]);
    expect(await currentEvidence([{ ...item, end: 0 }, { ...item, quote: '' }, { ...item, quote: 'Invented Canvas quotation.' }], fixture.sources)).toEqual([]);
  });
  it('does not promote Canvas metadata or hidden code into readable quotation evidence', async () => {
    const fixture = await source('synthetic.canvas', JSON.stringify({ nodes: [{ type: 'text', text: '# Visible\n\nA visible useful statement.\n\n```text\nHidden synthetic code text.\n```' }], metadata: { note: 'Metadata is not original prose.' }, edges: [] }));
    const hidden = [evidence(fixture.snapshot, 'Hidden synthetic code text.', -1, -1), evidence(fixture.snapshot, 'Metadata is not original prose.', -1, -1)];
    expect(await currentEvidence(hidden, fixture.sources)).toEqual([]);
  });
  it('rejects negative-range Markdown evidence even when the literal quote exists', async () => {
    const fixture = await source('synthetic.md', 'A useful, fully synthetic statement.');
    expect(await currentEvidence([evidence(fixture.snapshot, fixture.snapshot.text, -1, -1)], fixture.sources)).toEqual([]);
  });
  it('closes stale links after an original changes or disappears', async () => {
    const fixture = await source('synthetic.md', 'A useful synthetic statement with context.');
    const item = evidence(fixture.snapshot, fixture.snapshot.text);
    await fs.writeFile(path.join(fixture.root, 'synthetic.md'), 'The synthetic source has changed.', 'utf8');
    expect(await currentEvidence([item], fixture.sources)).toEqual([]);
    expect(await currentEvidence([{ ...item, relativePath: 'missing-synthetic.md' }], fixture.sources)).toEqual([]);
  });
  it('inherits unsaved full-draft privacy before selecting a smaller body excerpt', async () => {
    const fixture = await source('synthetic.md', 'An ordinary synthetic statement.');
    const fullDraft = '---\nprivacy: private\n---\nA selected synthetic statement.';
    expect(contextPrivacy(fixture.snapshot, fullDraft)).toBe('private');
    expect(contextPrivacy(fixture.snapshot, '---\nprivacy: local\n---\nA selected synthetic statement.')).toBe('local');
  });
  it('cannot downgrade an already private original by omitting its metadata in the draft', async () => {
    const fixture = await source('synthetic.md', '---\nprivacy: private\n---\nA private synthetic statement.');
    expect(contextPrivacy(fixture.snapshot, 'An ordinary-looking selected excerpt.')).toBe('private');
  });
  it.each(['', '../synthetic.md', '/synthetic.md', 'C:/synthetic.md', 'x\\synthetic.md', 'a//synthetic.md', 'a/./synthetic.md', 'a/../synthetic.md', '\0synthetic.md'])('rejects non-relative or ambiguous source path %s', value => {
    expect(() => canonicalPath(value)).toThrow('Invalid source path');
  });
});
