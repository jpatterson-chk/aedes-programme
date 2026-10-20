// Writes embed/cms-jsonld.html: exhibition-level schema.org data for the CMS page itself.
// Only facts that don't change with the programme (name, dates, venue, organiser, free entry),
// so a copy pasted into the CMS once doesn't go stale. Per-event data lives on the programme page.
//
//   node scripts/cms-snippets.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsonLdScript, programmeJsonLd } from './jsonld.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(join(ROOT, 'site', 'data', 'programme.json'), 'utf8'));

const { subEvent, ...exhibition } = programmeJsonLd(data);
await writeFile(join(ROOT, 'embed', 'cms-jsonld.html'), `${jsonLdScript(exhibition)}\n`);
console.log(`✓ Wrote embed/cms-jsonld.html (exhibition only; ${subEvent.length} events stay on the programme page).`);
