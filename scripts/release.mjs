import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const manifest = JSON.parse(await fs.readFile('manifest.json', 'utf8'));
const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (manifest.id !== 'third-brain' || manifest.version !== pkg.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('Release metadata is inconsistent.');
execFileSync(process.execPath, ['scripts/privacy-check.mjs'], { stdio: 'inherit', windowsHide: true });
const names = ['main.js', 'manifest.json', 'styles.css', 'LICENSE'];
const files = [];
for (const name of names) files.push({ name, body: await fs.readFile(`dist/${name}`) });
function crc32(body) { let crc = 0xffffffff; for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
const locals = [], central = []; let offset = 0;
for (const file of files) {
  const name = Buffer.from(file.name); const crc = crc32(file.body); const date = ((1980 - 1980) << 9) | (1 << 5) | 1;
  const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(date, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(file.body.length, 18); h.writeUInt32LE(file.body.length, 22); h.writeUInt16LE(name.length, 26);
  locals.push(h, name, file.body);
  const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(date, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(file.body.length, 20); c.writeUInt32LE(file.body.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42); central.push(c, name); offset += h.length + name.length + file.body.length;
}
const directory = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
const zipName = `third-brain-${manifest.version}.zip`; await fs.writeFile(`dist/${zipName}`, Buffer.concat([...locals, directory, end]));
const assets = [...names, zipName]; const sums = [];
for (const name of assets) sums.push(`${createHash('sha256').update(await fs.readFile(`dist/${name}`)).digest('hex')}  ${name}`);
await fs.writeFile('dist/SHA256SUMS', sums.join('\n') + '\n');
console.log(JSON.stringify({ version: manifest.version, assets: [...assets, 'SHA256SUMS'], archiveEntries: names, deterministicArchive: true }, null, 2));
