// Embed checks shared by test-embed.mjs (local harness) and check-embed.mjs (live CMS test page).

export const TOLERANCE = 2;

export function reporter() {
  let failed = 0;
  const check = (cond, label, detail = '') => {
    console.log(`  ${cond ? '✓' : '✗'} ${label}${!cond && detail ? `  (${detail})` : ''}`);
    if (!cond) failed++;
  };
  return { check, get failed() { return failed; } };
}

export async function until(fn, timeout = 8000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, 50));
  }
  return last;
}

// Opens the parent page and waits for the programme to render inside the iframe.
export async function openEmbed(browser, url, frameOrigin, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  const iframe = page.locator(`iframe[src^="${frameOrigin}"]`).first();
  await iframe.waitFor({ state: 'attached', timeout: 15000 });
  await iframe.scrollIntoViewIfNeeded();          // the snippet uses loading="lazy"
  const frame = await until(async () => page.frames().find((f) => f.url().startsWith(frameOrigin)), 15000);
  if (!frame) throw new Error(`No iframe from ${frameOrigin} on ${url}`);
  await frame.waitForSelector('.day li', { timeout: 15000 });
  return { page, iframe, frame };
}

// The iframe's height vs the programme's content height, and whether anything is hidden or scrollable inside.
export async function measure({ iframe, frame }) {
  const iframeHeight = (await iframe.boundingBox()).height;
  const inner = await frame.evaluate(() => {
    const root = document.documentElement;
    return {
      content: document.getElementById('app').getBoundingClientRect().height,
      scrollHeight: root.scrollHeight,
      clientHeight: root.clientHeight,
      autoheight: root.classList.contains('is-autoheight'),
      narrow: root.classList.contains('narrow'),
      stacked: root.classList.contains('stacked'),
      frameWidth: innerWidth,
      fontSize: getComputedStyle(root).fontSize,
    };
  });
  const matches = Math.abs(iframeHeight - inner.content) <= TOLERANCE && inner.scrollHeight <= inner.clientHeight;
  return { iframeHeight, ...inner, matches };
}

export const settled = (ctx) => until(async () => { const m = await measure(ctx); return m.matches && m; }).then((m) => m || measure(ctx));

// Handshake, height, layout, expand and resize at one width.
export async function checkAtWidth(browser, { url, frameOrigin, width, check, screenshot }) {
  const ctx = await openEmbed(browser, url, frameOrigin, width);
  const m = await settled(ctx);
  check(m.autoheight, 'hello/height handshake happened (is-autoheight)');
  check(m.matches, `iframe height matches content within ${TOLERANCE}px, no inner scroll`, `iframe ${m.iframeHeight}, content ${m.content}, scroll ${m.scrollHeight}/${m.clientHeight}`);

  const parentFont = await ctx.page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  check(m.fontSize === parentFont, `type size matches the page around it (${parentFont})`, `programme ${m.fontSize}`);
  const expectStacked = m.frameWidth < 860;   // STACK_MAX in site/app.js
  check(m.stacked === expectStacked, `${expectStacked ? 'stacked' : 'table'} layout for a ${m.frameWidth}px column`, `stacked=${m.stacked}`);

  const bg = await ctx.frame.evaluate(() => [getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.body).backgroundColor]);
  check(bg.every((c) => c === 'rgba(0, 0, 0, 0)'), 'iframe background is transparent', bg.join(' / '));

  if (screenshot) await ctx.page.screenshot({ path: screenshot, fullPage: true });

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
