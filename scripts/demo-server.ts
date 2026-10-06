import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ThirdBrainController } from '../src/controller';
import { FileSources } from '../src/sources';
import { OwnedStore } from '../src/runtime/store';
import { defaults } from '../src/settings';
import type { Breadth, FacetSelection, Privacy } from '../src/core/types';
const root = path.resolve('.local/demo-vault'); const port = Number(process.env.THIRD_BRAIN_DEMO_PORT ?? 9460);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid demo port.');
await fs.mkdir(root, { recursive: true });
await fs.cp('fixtures/sample-vault', root, { recursive: true, force: false, errorOnExist: false });
const settings = { ...defaults, locale: 'zh' as const };
const store = new OwnedStore(root, settings.outputFolder);
const sources = new FileSources(root, () => settings, () => store.managedSourcePaths());
const controller = new ThirdBrainController(sources, store, () => settings, () => undefined, async when => { settings.lastIndexedAt = when; });
await controller.initialize();
const origin = `http://127.0.0.1:${port}`;
const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Third Brain — synthetic test harness</title><link rel="stylesheet" href="/styles.css"><style>:root{--text-normal:#d8dde5;--text-muted:#98a1b0;--text-faint:#788290;--text-error:#e59c96;--interactive-accent:#99aacd;--text-on-accent:#141821;--background-primary:#191d25;--background-secondary:#232833;--background-modifier-border:#343c49;--font-interface:system-ui,sans-serif}body{margin:0;background:var(--background-primary);color:var(--text-normal);font:14px system-ui,sans-serif}.harness-label{font-size:12px;color:var(--text-muted);padding:14px 16px;border-bottom:1px solid var(--background-modifier-border)}#panel{width:min(100%,540px)}dialog{max-width:90vw;max-height:85vh;background:var(--background-primary);color:var(--text-normal);border:1px solid var(--background-modifier-border);padding:20px}dialog pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}dialog button{margin-bottom:10px}</style><div class="harness-label">合成测试库 · 真实界面渲染器 + 文件系统链路 · 非 Obsidian 截图</div><main id="panel"></main><script type="module" src="/demo-client.js"></script></html>`;
function response(res: import('node:http').ServerResponse, status: number, body: unknown): void { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); }
const server = createServer(async (req, res) => {
  try {
    if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin)) { response(res, 403, { error: 'Origin rejected.' }); return; }
    const url = new URL(req.url ?? '/', origin);
    if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'" }); res.end(html); return; }
    if (req.method === 'GET' && ['/styles.css', '/demo-client.js'].includes(url.pathname)) { const filename = url.pathname === '/styles.css' ? 'styles.css' : 'dist/demo-client.js'; res.writeHead(200, { 'Content-Type': filename.endsWith('css') ? 'text/css' : 'application/javascript' }); res.end(await fs.readFile(filename)); return; }
    if (req.method === 'GET' && url.pathname === '/api/status') { response(res, 200, controller.status()); return; }
    if (req.method === 'GET' && url.pathname === '/api/source') { const source = await sources.read(url.searchParams.get('path') ?? ''); if (!source) { response(res, 404, { error: 'Source unavailable.' }); return; } response(res, 200, { path: source.path, text: source.text }); return; }
    if (req.method !== 'POST' || !url.pathname.startsWith('/api/') || !String(req.headers['content-type'] ?? '').startsWith('application/json')) { response(res, 404, { error: 'Not found.' }); return; }
    let raw = ''; for await (const chunk of req) { raw += chunk.toString(); if (Buffer.byteLength(raw) > 50000) { response(res, 413, { error: 'Request too large.' }); return; } }
    const body = JSON.parse(raw || '{}') as Record<string, unknown>;
    if (url.pathname === '/api/index') { await controller.refresh(); response(res, 200, controller.status()); return; }
    if (url.pathname === '/api/cancel') { controller.cancel(); response(res, 200, { cancelled: true }); return; }
    if (url.pathname === '/api/search') { if (typeof body.query !== 'string' || !['low', 'medium', 'high'].includes(String(body.breadth)) || !['normal', 'local', 'private'].includes(String(body.privacy))) throw new Error('Invalid query.'); response(res, 200, await (body.selection === undefined ? controller.find(body.query, body.breadth as Breadth, body.privacy as Privacy) : controller.find(body.query, body.breadth as Breadth, body.privacy as Privacy, body.selection as FacetSelection))); return; }
    if (url.pathname === '/api/current') { const source = await sources.read('创作/对话留下的空隙.md'); response(res, 200, source ? { text: source.text, privacy: source.privacy } : null); return; }
    if (url.pathname === '/api/open') { const evidence = body.evidence as import('../src/core/types').Evidence; await controller.verifyOpen(evidence); const source = await sources.read(evidence.relativePath); response(res, 200, source ? { path: source.path, text: source.text } : null); return; }
    response(res, 404, { error: 'Not found.' });
  } catch { response(res, 409, { error: 'The operation did not complete. Original notes are unchanged.' }); }
});
server.listen(port, '127.0.0.1', () => console.log(`Synthetic-only test harness: ${origin}`));
process.on('SIGINT', () => { controller.dispose(); server.close(); });
process.on('SIGTERM', () => { controller.dispose(); server.close(); });
