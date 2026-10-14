// Playwright: checks the embed in the local cross-origin harness (dev/embed-test.html).
// Starts its own servers on :8000 and :8001, so stop `node scripts/serve.mjs` first.
//
//   node scripts/test-embed.mjs

import { chromium } from 'playwright';
import { startDevServers } from './serve.mjs';

const HARNESS = 'http://localhost:8001/dev/embed-test.html';
const WIDTHS = [1440, 1024, 768, 390];
const TOLERANCE = 2;

let failed = 0;
const check = (cond, label, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${!cond && detail ? `  (${detail})` : ''}`);
  if (!cond) failed++;
};

async function until(fn, timeout = 5000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, 50));
  }
  return last;
}

async function open(browser, width, query = '') {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(HARNESS + query, { waitUntil: 'networkidle' });
  const iframe = page.locator('#embed iframe');
  const frame = await until(async () => page.frames().find((f) => f.url().startsWith('http://localhost:8000')));
  await frame.waitForSelector('.day li');
  return { page, iframe, frame };
}

// The iframe's height vs the programme's content height, and whether anything is hidden or scrollable inside.
async function measure({ iframe, frame }) {
  const iframeHeight = (await iframe.boundingBox()).height;
  const inner = await frame.evaluate(() => ({
    content: document.getElementById('app').getBoundingClientRect().height,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    autoheight: document.documentElement.classList.contains('is-autoheight'),
    narrow: document.documentElement.classList.contains('narrow'),
    stacked: document.documentElement.classList.contains('stacked'),
    frameWidth: innerWidth,
    fontSize: getComputedStyle(document.documentElement).fontSize,
  }));
  return { iframeHeight, ...inner, matches: Math.abs(iframeHeight - inner.content) <= TOLERANCE && inner.scrollHeight <= inner.clientHeight };
}

const settled = (ctx) => until(async () => { const m = await measure(ctx); return m.matches && m; }).then((m) => m || measure(ctx));

const servers = await startDevServers();
const browser = await chromium.launch();

for (const width of WIDTHS) {
  console.log(`\n${width}px`);
  const ctx = await open(browser, width);
  const m = await settled(ctx);
  check(m.autoheight, 'hello/height handshake happened (is-autoheight)');
  check(m.matches, `iframe height matches content within ${TOLERANCE}px, no inner scroll`, `iframe ${m.iframeHeight}, content ${m.content}, scroll ${m.scrollHeight}/${m.clientHeight}`);
  const expectNarrow = width <= 736;
  check(m.fontSize === (expectNarrow ? '18px' : '24px'), `type size ${expectNarrow ? '18' : '24'}px from the parent's viewport, like the page around it`, m.fontSize);
  const expectStacked = m.frameWidth <= 736;
  check(m.stacked === expectStacked, `${expectStacked ? 'stacked' : 'table'} layout for a ${m.frameWidth}px column`, `stacked=${m.stacked}`);

  await ctx.frame.locator('details summary').first().click();
  const opened = await settled(ctx);
  check(opened.iframeHeight > m.iframeHeight && opened.matches, 'height follows when an event is opened', `${m.iframeHeight} → ${opened.iframeHeight}`);

  const other = width <= 736 ? 1024 : 390;
  await ctx.page.setViewportSize({ width: other, height: 900 });
  await until(async () => (await measure(ctx)).narrow === other <= 736);
  const resized = await settled(ctx);
  check(resized.narrow === other <= 736 && resized.matches, `height and layout follow a resize to ${other}px`, `narrow=${resized.narrow}, iframe ${resized.iframeHeight}, content ${resized.content}`);
  await ctx.page.close();
}

console.log('\nfallback (onload stripped), 1440px');
{
  const ctx = await open(browser, 1440, '?fallback');
  await ctx.page.waitForTimeout(500);
  const m = await measure(ctx);
  check(!m.autoheight, 'no handshake');
  check(Math.round(m.iframeHeight) === 900, 'iframe keeps its fixed 900px height', `${m.iframeHeight}`);
  check(m.scrollHeight > m.clientHeight, 'programme scrolls inside the iframe', `scroll ${m.scrollHeight}/${m.clientHeight}`);
  await ctx.page.close();
}

await browser.close();
for (const s of servers) s.close();

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll embed checks passed.');
process.exit(failed ? 1 : 0);
