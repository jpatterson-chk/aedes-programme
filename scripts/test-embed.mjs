// Playwright: checks the embed in the local cross-origin harness (dev/embed-test.html).
// Starts its own servers on :8000 and :8001, so stop `node scripts/serve.mjs` first.
//
//   node scripts/test-embed.mjs

import { chromium } from 'playwright';
import { startDevServers } from './serve.mjs';
import { checkAtWidth, measure, openEmbed, reporter, settled } from './embed-checks.mjs';

const HARNESS = 'http://localhost:8001/dev/embed-test.html';
const FRAME_ORIGIN = 'http://localhost:8000';
const WIDTHS = [1440, 1024, 768, 390];

const { check, ...result } = reporter();
const servers = await startDevServers();
const browser = await chromium.launch();

for (const width of WIDTHS) {
  console.log(`\n${width}px`);
  await checkAtWidth(browser, { url: HARNESS, frameOrigin: FRAME_ORIGIN, width, check });
}

console.log('\ntoday / now / past at 17 Nov 10:30, 1440px');
{
  const ctx = await openEmbed(browser, `${HARNESS}?now=2026-11-17T10:30`, FRAME_ORIGIN, 1440);
  const before = await settled(ctx);
  const s = await ctx.frame.evaluate(() => ({
    toggle: document.querySelector('.controls button')?.textContent,
    today: [...document.querySelectorAll('.label-today:not([hidden])')].map((l) => l.closest('.day').dataset.date),
    now: [...document.querySelectorAll('.label-now:not([hidden])')].map((l) => l.closest('li').id),
    firstVisible: document.querySelector('.day:not([hidden])')?.dataset.date,
  }));
  check(/^Show past events \(\d+\)$/.test(s.toggle ?? ''), 'past events folded behind the toggle', s.toggle);
  check(s.firstVisible === '2026-11-17', 'list starts at today', s.firstVisible);
  check(s.today.join() === '2026-11-17', 'TODAY on today’s date only', s.today.join());
  check(s.now.join() === '2026-11-17-school-workshop', 'NOW on the running event only (10:00–12:00)', s.now.join());
  await ctx.frame.locator('.controls button').click();
  const after = await settled(ctx);
  check(after.iframeHeight > before.iframeHeight && after.matches, 'height follows "Show past events"', `${before.iframeHeight} → ${after.iframeHeight}`);
  await ctx.page.close();
}

console.log('\nfallback (onload stripped), 1440px');
{
  const ctx = await openEmbed(browser, `${HARNESS}?fallback`, FRAME_ORIGIN, 1440);
  await ctx.page.waitForTimeout(500);
  const m = await measure(ctx);
  check(!m.autoheight, 'no handshake');
  check(Math.round(m.iframeHeight) === 900, 'iframe keeps its fixed 900px height', `${m.iframeHeight}`);
  check(m.scrollHeight > m.clientHeight, 'programme scrolls inside the iframe', `scroll ${m.scrollHeight}/${m.clientHeight}`);
  await ctx.page.close();
}

await browser.close();
for (const s of servers) s.close();

console.log(result.failed ? `\n${result.failed} check(s) failed.` : '\nAll embed checks passed.');
process.exit(result.failed ? 1 : 0);
