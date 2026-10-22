// Playwright: checks the embed in the local cross-origin harness (dev/embed-test.html).
// Starts its own servers on :8000 and :8001, so stop `node scripts/serve.mjs` first.
//
//   node scripts/test-embed.mjs

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { startDevServers } from './serve.mjs';
import { checkAtWidth, measure, openEmbed, reporter, settled } from './embed-checks.mjs';

const HARNESS = 'http://localhost:8001/dev/embed-test.html';
const FRAME_ORIGIN = 'http://localhost:8000';
const WIDTHS = [1440, 1024, 768, 390];
const data = JSON.parse(readFileSync(new URL('../site/data/programme.json', import.meta.url), 'utf8'));

// For today / now / past: the middle event with its own end time, 30 minutes after it starts.
const timed = data.events.filter((e) => e.end).sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
const probe = timed[Math.floor(timed.length / 2)];
const probeAt = `${probe.date}T${String(Number(probe.start.slice(0, 2)) + (Number(probe.start.slice(3)) + 30 >= 60 ? 1 : 0)).padStart(2, '0')}:${String((Number(probe.start.slice(3)) + 30) % 60).padStart(2, '0')}`;

const report = reporter();   // read report.failed at the end (a copied value would stay 0)
const { check } = report;
const servers = await startDevServers();
const browser = await chromium.launch();

for (const width of WIDTHS) {
  console.log(`\n${width}px`);
  await checkAtWidth(browser, { url: HARNESS, frameOrigin: FRAME_ORIGIN, width, check });
}

console.log(`\ntoday / now / past at ${probeAt} (during "${probe.title}"), 1440px`);
{
  const ctx = await openEmbed(browser, `${HARNESS}?now=${probeAt}`, FRAME_ORIGIN, 1440);
  const before = await settled(ctx);
  const s = await ctx.frame.evaluate(() => ({
    toggle: document.querySelector('.controls button')?.textContent,
    today: [...document.querySelectorAll('.label-today:not([hidden])')].map((l) => l.closest('.day').dataset.date),
    now: [...document.querySelectorAll('.label-now:not([hidden])')].map((l) => l.closest('li').id),
    firstVisible: document.querySelector('.day:not([hidden])')?.dataset.date,
  }));
  check(/^Show past events \(\d+\)$/.test(s.toggle ?? ''), 'past events folded behind the toggle', s.toggle);
  check(s.firstVisible === probe.date, 'list starts at today', s.firstVisible);
  check(s.today.join() === probe.date, 'TODAY on today’s date only', s.today.join());
  check(s.now.join() === probe.id, `NOW on the running event only (${probe.start}–${probe.end})`, s.now.join());
  await ctx.frame.locator('.controls button').click();
  const after = await settled(ctx);
  check(after.iframeHeight > before.iframeHeight && after.matches, 'height follows "Show past events"', `${before.iframeHeight} → ${after.iframeHeight}`);
  await ctx.page.close();
}

console.log('\nprerendered programme (crawlers, slow or failed scripts), 1440px');
{
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(HARNESS.replace(':8001/dev/embed-test.html', ':8000/'), { waitUntil: 'networkidle' });
  const staticHtml = await page.locator('.programme').evaluate((e) => e.outerHTML);
  const events = await page.locator('.day li').count();
  check(events === data.events.length && await page.locator('.day li .title').first().isVisible(), 'programme readable with JavaScript off', `${events} events`);
  await ctx.close();

  // Before the exhibition, so no TODAY / NOW / past state is added on top of the prerendered markup.
  const live = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await live.goto(HARNESS.replace(':8001/dev/embed-test.html', ':8000/?now=2000-01-01T12:00'), { waitUntil: 'networkidle' });
  const liveHtml = await live.locator('.programme').evaluate((e) => e.outerHTML);
  check(liveHtml === staticHtml, 're-render from fresh data matches the prerendered markup (no flash)');
  await live.close();
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

console.log(report.failed ? `\n${report.failed} check(s) failed.` : '\nAll embed checks passed.');
process.exit(report.failed ? 1 : 0);
