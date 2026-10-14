// Playwright: checks the live embed on the CMS test page and saves sign-off screenshots.
// Run after deploying and pasting embed/cms-snippet.html into the page. See PLAN.md §8 "Live test".
//
//   node scripts/check-embed.mjs [page-url]

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAtWidth, reporter } from './embed-checks.mjs';

const PAGE = process.argv[2] ?? 'https://chybik-kristof.com/programme-test/';
const FRAME_ORIGIN = 'https://jpatterson-chk.github.io';
const WIDTHS = [1440, 768, 390];
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'reference', 'live');

const { check, ...result } = reporter();
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

for (const width of WIDTHS) {
  console.log(`\n${width}px  ${PAGE}`);
  try {
    await checkAtWidth(browser, { url: PAGE, frameOrigin: FRAME_ORIGIN, width, check, screenshot: join(OUT, `programme-test-${width}.png`) });
  } catch (err) {
    check(false, 'embed loaded', err.message);
  }
}

await browser.close();
console.log(result.failed ? `\n${result.failed} check(s) failed.` : `\nAll live checks passed. Screenshots in reference/live/.`);
process.exit(result.failed ? 1 : 0);
