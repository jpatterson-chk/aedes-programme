// Copies site/ → dist/, stamps the commit SHA into index.html (styles.css?v=SHA, app.js?v=SHA, …)
// so a deploy never mixes old cached code with new, prerenders the programme into index.html
// (readable without scripts), and writes the calendar files (ics/<id>.ics per event, programme.ics for all).
// programme.json is fetched with ?t=<now> by app.js.
//
//   node scripts/build.mjs

import { execSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calendarFiles } from './ics.mjs';
import { prerender } from './prerender.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const DIST = join(ROOT, 'dist');

function commitSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try { return execSync('git rev-parse --short=7 HEAD', { cwd: ROOT }).toString().trim(); }
  catch { return 'dev'; }
}

const sha = commitSha();
const data = JSON.parse(await readFile(join(SITE, 'data', 'programme.json'), 'utf8'));
await rm(DIST, { recursive: true, force: true });
await cp(SITE, DIST, { recursive: true });

const indexFile = join(DIST, 'index.html');
const html = await readFile(indexFile, 'utf8');
let stamped = 0;
const out = html.replace(/(href|src)="([\w-]+\.(?:css|js))"/g, (_, attr, file) => {
  stamped++;
  return `${attr}="${file}?v=${sha}"`;
});
if (stamped === 0) throw new Error('build.mjs: no styles/scripts found to stamp in index.html');
// Stamp first, then prerender, so links inside the programme are never touched by the stamping.
await writeFile(indexFile, prerender(out, data));

// Module imports inside app.js get the same stamp, so a cached old render.js can't pair with new app.js.
const appFile = join(DIST, 'app.js');
const appJs = await readFile(appFile, 'utf8');
const stampedApp = appJs.replace(/from '\.\/([\w-]+\.js)'/g, (_, file) => `from './${file}?v=${sha}'`);
if (stampedApp === appJs) throw new Error('build.mjs: no module imports found to stamp in app.js');
await writeFile(appFile, stampedApp);

const files = calendarFiles(data);
await mkdir(join(DIST, 'ics'), { recursive: true });
for (const [path, body] of files) await writeFile(join(DIST, path), body);

console.log(`✓ Built dist/ at ${sha} (${stamped} assets stamped, programme prerendered, ${files.size} calendar files).`);
