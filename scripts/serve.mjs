// Local static servers, no dependencies. Two origins, so the embed runs cross-origin like production:
//   http://localhost:8000/                     site/ (the programme)
//   http://localhost:8001/dev/embed-test.html  repo root (the CMS-like harness, which reads embed/cms-snippet.html)
//
//   node scripts/serve.mjs

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { calendarFiles } from './ics.mjs';
import { prerender } from './prerender.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// The .ics files and the prerendered index.html are build output, so locally they're generated
// on request from the current data, the same way build.mjs does it.
const readData = async () => JSON.parse(await readFile(join(ROOT, 'site', 'data', 'programme.json'), 'utf8'));

async function calendarFile(pathname) {
  if (!/^\/(ics\/[\w-]+\.ics|programme\.ics)$/.test(pathname)) return null;
  return calendarFiles(await readData()).get(pathname.slice(1)) ?? null;
}

// programme: serve site/ like the deployed dist/ (prerendered index.html, generated calendar files).
export function serve(dir, port, { programme = false } = {}) {
  const root = resolve(dir);
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const ics = programme && await calendarFile(pathname);
      if (ics) {
        res.writeHead(200, { 'content-type': TYPES['.ics'], 'cache-control': 'no-store' }).end(ics);
        return;
      }
      let file = resolve(join(root, pathname));
      if (file !== root && !file.startsWith(root + sep)) throw new Error('outside root');
      let info = await stat(file);
      if (info.isDirectory()) { file = join(file, 'index.html'); info = await stat(file); }
      res.writeHead(200, {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        'last-modified': info.mtime.toUTCString(),
        'cache-control': 'no-store',
      });
      const isIndex = programme && file === join(root, 'index.html');
      res.end(isIndex
        ? prerender(await readFile(file, 'utf8'), await readData(), { baseUrl: `http://${req.headers.host}/` })
        : await readFile(file));
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    }
  });
  return new Promise((ok, fail) => server.once('error', fail).listen(port, () => ok(server)));
}

export const startDevServers = () => Promise.all([serve(join(ROOT, 'site'), 8000, { programme: true }), serve(ROOT, 8001)]);

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startDevServers();
  console.log('Programme:  http://localhost:8000/');
  console.log('Harness:    http://localhost:8001/dev/embed-test.html');
  console.log('Fallback:   http://localhost:8001/dev/embed-test.html?fallback');
}
