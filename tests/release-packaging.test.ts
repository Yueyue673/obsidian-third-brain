import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary: string[] = [];
const assetNames = ['main.js', 'manifest.json', 'styles.css', 'LICENSE'];
let fixture: string;
let license: string;

function run(cwd: string, command: string, args: string[]) {
  return execFileSync(command, args, { cwd, windowsHide: true, encoding: 'utf8', stdio: 'pipe', timeout: 20_000 });
}

async function makeFixture(notice: string) {
  // Only synthetic inputs and copied production scripts; never build in the working tree.
  const scratch = path.join(root, '.local');
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(path.join(scratch, 'release-packaging-'));
  temporary.push(directory);
  await mkdir(path.join(directory, 'scripts'));
  await mkdir(path.join(directory, 'src'));
  for (const script of ['build.mjs', 'release.mjs', 'privacy-check.mjs']) {
    await copyFile(path.join(root, 'scripts', script), path.join(directory, 'scripts', script));
  }
  await writeFile(path.join(directory, 'LICENSE'), notice);
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'third-brain', version: '0.1.0', type: 'module' }));
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ id: 'third-brain', version: '0.1.0' }));
  await writeFile(path.join(directory, 'styles.css'), '/* Synthetic packaging fixture. */\n');
  await writeFile(path.join(directory, 'src', 'main.ts'), "export const answer = 42; export const origin = 'synthetic packaging fixture';\n");
  await writeFile(path.join(directory, 'scripts', 'demo-client.ts'), 'export const syntheticDemo = true;\n');
  await writeFile(path.join(directory, '.gitignore'), 'node_modules/\ndist/\nmain.js\n');
  run(directory, 'git', ['init', '-q']);
  run(directory, 'git', ['add', '.']);
  run(directory, process.execPath, ['scripts/build.mjs']);
  run(directory, process.execPath, ['scripts/release.mjs']);
  return directory;
}

function storedZipEntries(zip: Buffer) {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    expect(zip.readUInt16LE(offset + 8)).toBe(0); // Actual release ZIP uses stored entries.
    const size = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    expect(entries.has(name)).toBe(false);
    entries.set(name, zip.subarray(start, start + size));
    offset = start + size;
  }
  expect(zip.readUInt32LE(offset)).toBe(0x02014b50);
  expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  expect(zip.readUInt16LE(zip.length - 12)).toBe(entries.size);
  return entries;
}

async function expectCommentOnly(directory: string, notice: string) {
  const main = await readFile(path.join(directory, 'main.js'), 'utf8');
  const banner = `/*! Third Brain project LICENSE\n${notice.replaceAll('*/', '*\\/')}\n*/\n`;
  expect(main.startsWith(banner), 'standalone main.js must retain the complete project LICENSE').toBe(true);
  const plain = await build({ absWorkingDir: directory, entryPoints: ['src/main.ts'], outfile: 'main.js', bundle: true, format: 'cjs', platform: 'node', target: 'es2022', external: ['obsidian', 'electron', 'node:*'], minify: false, sourcemap: false, write: false, logLevel: 'silent' });
  expect(main.slice(banner.length), 'banner must not change executable bundle bytes').toBe(plain.outputFiles[0].text);
  const module = { exports: {} as { answer?: number; origin?: string } };
  const context = { module, exports: module.exports, noticeExecuted: undefined };
  runInNewContext(main, context, { timeout: 1_000 });
  expect(module.exports.answer).toBe(42);
  expect(module.exports.origin).toBe('synthetic packaging fixture');
  expect(context.noticeExecuted).toBeUndefined();
  expect(await readFile(path.join(directory, 'dist', 'main.js'), 'utf8')).toBe(main);
}

describe('P18 plugin asset licence packaging (actual isolated build/release scripts)', () => {
  beforeAll(async () => {
    license = await readFile(path.join(root, 'LICENSE'), 'utf8');
    fixture = await makeFixture(license);
  }, 30_000);
  afterAll(async () => {
    await Promise.all(temporary.map(directory => rm(directory, { recursive: true, force: true })));
  });

  it('retains the exact MIT grant in standalone main.js without changing executable payload', async () => {
    await expectCommentOnly(fixture, license);
    expect(await readFile(path.join(fixture, 'dist', 'LICENSE'), 'utf8')).toBe(license);
    expect(JSON.parse(await readFile(path.join(fixture, 'dist', 'manifest.json'), 'utf8')).version).toBe('0.1.0');
  });

  it('includes byte-exact LICENSE in deterministic ZIP, loose assets and SHA256SUMS', async () => {
    const dist = path.join(fixture, 'dist');
    const zipName = 'third-brain-0.1.0.zip';
    const zip = await readFile(path.join(dist, zipName));
    const entries = storedZipEntries(zip);
    expect([...entries.keys()]).toEqual(assetNames);
    for (const name of assetNames) expect(entries.get(name)).toEqual(await readFile(path.join(dist, name)));
    expect(entries.get('LICENSE')?.toString('utf8')).toBe(license);
    const inventory = [...assetNames, zipName];
    const expectedSums = await Promise.all(inventory.map(async name => `${createHash('sha256').update(await readFile(path.join(dist, name))).digest('hex')}  ${name}`));
    const sums = await readFile(path.join(dist, 'SHA256SUMS'), 'utf8');
    expect(sums).toBe(expectedSums.join('\n') + '\n');
    run(fixture, process.execPath, ['scripts/build.mjs']);
    run(fixture, process.execPath, ['scripts/release.mjs']);
    expect(await readFile(path.join(dist, zipName))).toEqual(zip);
    expect(await readFile(path.join(dist, 'SHA256SUMS'), 'utf8')).toBe(sums);
  }, 30_000);

  it('escapes comment terminators in notice text without allowing code execution', async () => {
    const adversarialNotice = license + '\n*/\nglobalThis.noticeExecuted = true;\n/*\n';
    const escapedFixture = await makeFixture(adversarialNotice);
    await expectCommentOnly(escapedFixture, adversarialNotice);
    expect(await readFile(path.join(escapedFixture, 'dist', 'LICENSE'), 'utf8')).toBe(adversarialNotice);
  }, 30_000);

  it('uploads LICENSE alongside the loose CI plugin assets', async () => {
    const workflow = await readFile(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
    const upload = workflow.slice(workflow.indexOf('uses: actions/upload-artifact@'));
    for (const name of [...assetNames, 'SHA256SUMS']) expect(upload).toMatch(new RegExp(`^\\s+dist/${name.replaceAll('.', '\\.')}\\s*$`, 'm'));
  });
});
