import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root = process.cwd();
const gitFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
const releaseFiles = ['main.js', 'dist/main.js', 'dist/manifest.json', 'dist/styles.css'];
const files = [...new Set([...gitFiles, ...releaseFiles])].filter(x => !/\.(png|jpe?g|gif|webp|ico|zip)$/i.test(x));
const rules = [
  ['private-machine-path', /(?:[A-Z]:[\\/](?:Users|Windows)[\\/]|\/Users\/[^\s/]+\/|\/home\/[^\s/]+\/)/ig],
  ['private-key-block', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['credential-token', /\b(?:sk-|gh[pousr]_|github_pat_)[A-Za-z0-9_-]{20,}/g],
  ['secret-assignment', /\b(?:api[_-]?key|access[_-]?token|password)\s*[:=]\s*["'](?!(?:\[REDACTED\]|synthetic|test|example|mock|placeholder|your|<))[A-Za-z0-9_+\/=-]{24,}["']/ig],
];
let checked = 0; const findings = [];
for (const relative of files) {
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error('Publication scan path escaped the repository.');
  let stat; try { stat = await fs.lstat(target); } catch (e) { if (e.code === 'ENOENT' && releaseFiles.includes(relative)) continue; throw e; }
  if (stat.isSymbolicLink()) { findings.push({ file: relative, category: 'symlink-not-publishable' }); continue; }
  if (!stat.isFile()) continue;
  const text = await fs.readFile(target, 'utf8'); checked++;
  for (const [category, rule] of rules) {
    rule.lastIndex = 0;
    for (const match of text.matchAll(rule)) {
      const isTest = /^(?:tests|fixtures)\//.test(relative.replace(/\\/g, '/'));
      const synthetic = isTest && (/^(?:sk-)?(?:test|synthetic|example|mock)[-_]/i.test(match[0]) || /[\\/]Users[\\/](?:test|synthetic|example)[\\/]/i.test(match[0]));
      if (!synthetic) findings.push({ file: relative, category, line: text.slice(0, match.index).split('\n').length });
    }
  }
  for (const match of text.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)) {
    if (!/^(?:127\.|0\.0\.0\.0$|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(match[0])) findings.push({ file: relative, category: 'non-example-ipv4', line: text.slice(0, match.index).split('\n').length });
  }
}
if (findings.length) { console.error(JSON.stringify({ passed: false, checked, findings }, null, 2)); process.exit(1); }
console.log(JSON.stringify({ passed: true, checked, caveat: 'A conservative pattern scan, not proof that every kind of personal information is absent. Review publication content too.' }, null, 2));
