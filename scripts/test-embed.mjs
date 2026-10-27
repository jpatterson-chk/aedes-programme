// Playwright: checks the embed in the local cross-origin harness (dev/embed-test.html).
// Starts its own servers on :8000 and :8001, so stop `node scripts/serve.mjs` first.
//
//   node scripts/test-embed.mjs

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { startDevServers } from './serve.mjs';
import { checkAtWidth, measure, openEmbed, reporter, settled, until } from './embed-checks.mjs';

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

console.log('\nregistration form (Tally stubbed), 1440px');
{
  // Two registrable events get forms (the real data may not have any yet); tally.so is faked, so this runs offline.
  const withForms = structuredClone(data);
  const registrable = withForms.events.filter((e) => e.registration && e.status !== 'cancelled').slice(0, 2);
  registrable.forEach((e, i) => { e.registrationForm = `test${i}A`; });
  let scriptLoads = 0;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route('**/data/programme.json*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(withForms) }));
  await context.route('https://tally.so/widgets/embed.js', (r) => {
    scriptLoads++;
    // Like Tally's script: load the waiting embeds, then size them to their content.
    r.fulfill({ contentType: 'text/javascript', body: `window.Tally = { loadEmbeds() {
      document.querySelectorAll('iframe[data-tally-src]:not([src])').forEach((f) => { f.src = f.dataset.tallySrc; f.style.height = '800px'; });
    } };` });
  });
  await context.route('https://tally.so/embed/**', (r) => r.fulfill({ contentType: 'text/html', body: '<p>Form</p>' }));

  // Before the exhibition, so no event is folded away as past.
  const ctx = await openEmbed({ newPage: () => context.newPage() }, `${HARNESS}?now=2000-01-01T12:00`, FRAME_ORIGIN, 1440);
  const [a, b] = registrable.map((e) => ({
    summary: ctx.frame.locator(`li[id="${e.id}"] summary`),
    button: ctx.frame.locator(`li[id="${e.id}"] .register`),
    box: ctx.frame.locator(`#register-${e.id}`),
    id: e.registrationForm,
  }));
  await until(async () => (await a.button.count()) > 0);   // after the re-render from the (routed) fresh data
  await a.summary.click();
  const closed = await settled(ctx);

  await a.button.click();
  await until(async () => (await a.box.locator('iframe[src]').count()) > 0);
  const opened = await settled(ctx);
  const frameSrc = await a.box.locator('iframe').getAttribute('src');
  check(await a.box.isVisible() && await a.button.getAttribute('aria-expanded') === 'true', 'Register opens the form inline');
  check(frameSrc?.startsWith(`https://tally.so/embed/${a.id}?`) && frameSrc.includes('dynamicHeight=1'), 'the form is the event’s own Tally embed', frameSrc);
  check(opened.iframeHeight > closed.iframeHeight + 700 && opened.matches, 'height follows when Tally sizes the form', `${closed.iframeHeight} → ${opened.iframeHeight}`);

  await a.button.click();
  const shut = await settled(ctx);
  check(await a.box.isHidden() && await a.button.getAttribute('aria-expanded') === 'false' && Math.abs(shut.iframeHeight - closed.iframeHeight) <= 2, 'Register again closes it', `${shut.iframeHeight}`);

  await b.summary.click();
  await b.button.click();
  await until(async () => (await b.box.locator('iframe[src]').count()) > 0);
  check(scriptLoads === 1, 'Tally’s script loads once, on first use', `${scriptLoads} loads`);
  await context.close();

  // Tally's script blocked (e.g. by a content blocker): the form still loads, at a fixed height.
  const blocked = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await blocked.route('**/data/programme.json*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(withForms) }));
  await blocked.route('https://tally.so/widgets/embed.js', (r) => r.abort());
  await blocked.route('https://tally.so/embed/**', (r) => r.fulfill({ contentType: 'text/html', body: '<p>Form</p>' }));
  const ctx2 = await openEmbed({ newPage: () => blocked.newPage() }, `${HARNESS}?now=2000-01-01T12:00`, FRAME_ORIGIN, 1440);
  const li = ctx2.frame.locator(`li[id="${registrable[0].id}"]`);
  await until(async () => (await li.locator('.register').count()) > 0);
  await li.locator('summary').click();
  await li.locator('.register').click();
  const src = await until(() => li.locator('.register-form iframe').getAttribute('src'));
  check(src?.startsWith(`https://tally.so/embed/${registrable[0].registrationForm}?`), 'without Tally’s script, the form still loads', src);
  await blocked.close();
}

console.log('\ndark mode (the site’s html.dark, 21:00–07:59 local), 1440px');
{
  // The browser clock is faked; ?now keeps the programme before the exhibition, so nothing is folded away.
  const withForm = structuredClone(data);
  const registrable = withForm.events.find((e) => e.registration && e.status !== 'cancelled');
  if (registrable) registrable.registrationForm = 'testDark';
  const colours = (frame) => frame.evaluate(() => {
    const css = (sel, prop) => { const el = document.querySelector(sel); return el && getComputedStyle(el)[prop]; };
    return {
      dark: document.documentElement.classList.contains('dark'),
      text: css('.cell.name', 'color'),
      pill: css('.btn.filter', 'backgroundColor'),
      page: css('html', 'backgroundColor'),
    };
  });
  const at = async (time, url) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Europe/Berlin' });
    await context.clock.setFixedTime(new Date(`2026-11-10T${time}:00+01:00`));
    await context.route('**/data/programme.json*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(withForm) }));
    await context.route('https://tally.so/**', (r) => r.fulfill({ contentType: 'text/html', body: '<p>Form</p>' }));
    return { context, ctx: url ? null : await openEmbed({ newPage: () => context.newPage() }, `${HARNESS}?now=2000-01-01T12:00`, FRAME_ORIGIN, 1440) };
  };

  const night = await at('22:00');
  const n = await colours(night.ctx.frame);
  check(n.dark && n.text === 'rgb(255, 255, 255)', 'at 22:00 the text is white', JSON.stringify(n));
  check(n.pill === 'rgb(255, 255, 255)', 'pills are white, as html.dark .btn', n.pill);
  check(n.page === 'rgba(0, 0, 0, 0)', 'the embedded page stays transparent', n.page);
  check((await settled(night.ctx)).matches, 'height still matches');
  if (registrable) {
    const li = night.ctx.frame.locator(`li[id="${registrable.id}"]`);
    await until(async () => (await li.locator('.register').count()) > 0);
    await li.locator('summary').click();
    await li.locator('.register').click();
    const panel = await li.locator('.register-form').evaluate((e) => getComputedStyle(e).backgroundColor);
    check(panel === 'rgb(245, 245, 245)', 'an open Tally form sits on a light panel', panel);
  }
  await night.context.close();

  const morning = await at('08:00');
  const m = await colours(morning.ctx.frame);
  check(!m.dark && m.text === 'rgb(0, 0, 0)', 'at 08:00 the text is black again', JSON.stringify(m));
  await morning.context.close();

  const noon = await at('12:00', true);
  const page = await noon.context.newPage();
  await page.goto(`${FRAME_ORIGIN}/?theme=dark`, { waitUntil: 'networkidle' });
  const s = await colours(page.mainFrame());
  check(s.dark && s.page === 'rgb(10, 10, 10)', 'standalone ?theme=dark at noon: dark, on #0a0a0a', JSON.stringify(s));
  await noon.context.close();
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
