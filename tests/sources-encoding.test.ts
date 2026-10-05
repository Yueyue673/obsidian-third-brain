import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FileSources, hash } from '../src/sources';
import { defaults } from '../src/settings';

async function withBytes(bytes: Buffer, check: (sources: FileSources) => Promise<void>) {
  await fs.mkdir('.local', { recursive: true });
  const root = await fs.mkdtemp(path.join(path.resolve('.local'), 'synthetic-encoding-'));
  try {
    await fs.writeFile(path.join(root, 'synthetic.md'), bytes);
    await check(new FileSources(root, () => ({ ...defaults, excludes: [] }), async () => new Set()));
    expect(await fs.readFile(path.join(root, 'synthetic.md'))).toEqual(bytes);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

describe('strict original-byte decoding', () => {
  it.each(['utf8', 'utf16le', 'utf16be'])('preserves valid %s text, Unicode pairs and the original-byte revision', async encoding => {
    const text = '# Synthetic 原文\n\nA valid replacement glyph � and musical mark 🎵 stay literal.';
    let bytes = Buffer.from(text, encoding === 'utf8' ? 'utf8' : 'utf16le');
    if (encoding === 'utf16be') bytes.swap16();
    if (encoding !== 'utf8') bytes = Buffer.concat([Buffer.from(encoding === 'utf16le' ? [0xff, 0xfe] : [0xfe, 0xff]), bytes]);
    await withBytes(bytes, async sources => {
      const snapshot = await sources.read('synthetic.md');
      expect(snapshot?.text).toBe(text); expect(snapshot?.hash).toBe(hash(bytes));
    });
  });
  it.each([
    [0xff, 0xfe, 0x61], // UTF-16 LE odd trailing byte previously disappeared.
    [0xfe, 0xff, 0x61],
    [0xff, 0xfe, 0x00, 0xd8], // Lone high surrogate.
    [0xff, 0xfe, 0x00, 0xdc], // Lone low surrogate.
    [0xfe, 0xff, 0xd8, 0x00],
    [0xc3, 0x28], // Malformed UTF-8.
  ])('rejects malformed encoding instead of silently dropping original bytes %#', async (...values) => {
    await withBytes(Buffer.from(values), async sources => {
      await expect(sources.read('synthetic.md')).rejects.toThrow('invalid text encoding');
    });
  });
});
