import { build } from 'esbuild';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
const pluginBuild = await build({ entryPoints: ['src/main.ts'], outfile: 'main.js', bundle: true, format: 'cjs', platform: 'node', target: 'es2022', external: ['obsidian', 'electron', 'node:*'], minify: false, sourcemap: false, metafile: true, logLevel: 'info' });
if (Object.keys(pluginBuild.metafile.inputs).some(input => !input.replaceAll('\\', '/').startsWith('src/'))) throw new Error('Unexpected runtime bundle input: review dependency licensing and publication scope before shipping.');
await writeFile('dist/build-meta.json', JSON.stringify(pluginBuild.metafile, null, 2));
for (const name of ['main.js', 'manifest.json', 'styles.css']) await copyFile(name, `dist/${name}`);
await build({ entryPoints: ['scripts/demo-client.ts'], outfile: 'dist/demo-client.js', bundle: true, platform: 'browser', target: 'es2022', format: 'esm', logLevel: 'info' });
console.log('Production plugin and faithful UI harness built.');
