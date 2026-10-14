// Copies site/ → dist/ and stamps the commit SHA into index.html (styles.css?v=SHA, app.js?v=SHA, …)
// so a deploy never mixes old cached code with new. programme.json is fetched with ?t=<now> by app.js.
// Phase 4 adds .ics files here.
//
//   node scripts/build.mjs

import { execSync } from 'node:child_process';
import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const DIST = join(ROOT, 'dist');

function commitSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try { return execSync('git rev-parse --short=7 HEAD', { cwd: ROOT }).toString().trim(); }
  catch { return 'dev'; }
}

const sha = commitSha();
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
await writeFile(indexFile, out);

console.log(`✓ Built dist/ at ${sha} (${stamped} assets stamped).`);
