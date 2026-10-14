// Playwright: screenshots, DOM outlines, computed styles and stylesheets of the live site.
// Writes to reference/. Re-run any time the site changes. See PLAN.md §5.
//
//   node scripts/capture-reference.mjs            # everything
//   node scripts/capture-reference.mjs --outline  # DOM outlines only (pass 1, for picking selectors)

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'reference');
const WIDTHS = [1440, 1024, 768, 390];
const OUTLINE_ONLY = process.argv.includes('--outline');

const PAGES = {
  home: 'https://chybik-kristof.com/',
  // Empty until the CMS snippet is pasted in; re-run then to record the real embed column.
  'programme-test': 'https://chybik-kristof.com/programme-test/',
};

// Outlines dumped in pass 1: [page, name, selector]
const OUTLINES = [
  ['home', 'home-table', '#c-other-projects'],
  ['home', 'home-nav', 'nav'],
  ['home', 'home-content', 'section.content'],
  ['programme-test', 'programme-test-content', 'section.content'],
];

// Elements whose computed styles are recorded, per page and width.
const ELEMENTS = {
  home: {
    html: 'html',
    body: 'body',
    nav: 'nav',
    'nav.link': 'nav a',
    'nav.dim': 'nav .dim',
    'table.section': '#c-other-projects',
    'table.heading': '#c-other-projects .row.heading',
    'table.title': '#c-other-projects .row.heading .cell:first-child',
    'table.label': '#c-other-projects .row.heading .cell:nth-child(2)',
    'table.row': '#c-other-projects .table__body .row:nth-child(1)',
    'table.row2': '#c-other-projects .table__body .row:nth-child(2)',
    'table.rowTitle': '#c-other-projects .table__body .row:nth-child(1) .cell:first-child',
    'table.greyCell': '#c-other-projects .table__body .row:nth-child(1) .cell:nth-child(2)',
    'table.year': '#c-other-projects .table__body .row:nth-child(1) .cell.align-right',
    'table.expand': '#c-other-projects .table__expand',
    'table.expandDim': '#c-other-projects .table__expand .dim',
    'content.h2': 'section.content > h2',
    'text.block': '.primitive.text',
    'text.paragraph': '.primitive.text p',
    pill: '.btn',
  },
  'programme-test': {
    html: 'html',
    nav: 'nav',
    'content.h2': 'section.content > h2',
    'text.block': '.primitive.text',
    'text.paragraph': '.primitive.text p',
    iframe: '.primitive.text iframe',
  },
};

const PROPS = [
  'font-family', 'font-size', 'line-height', 'letter-spacing', 'font-weight', 'color', 'opacity',
  'text-transform', 'text-align', 'display', 'padding', 'margin', 'gap', 'grid-template-columns',
  'border-radius', 'background-color', 'height', 'max-width', 'white-space',
];

async function dismissCookies(page) {
  for (const label of ['Accept', 'Accept all', 'OK', 'Agree', 'Allow all']) {
    const btn = page.getByRole('button', { name: label, exact: true });
    if (await btn.count()) { await btn.first().click().catch(() => {}); return; }
  }
}

async function outline(page, selector) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return `(no match for ${sel})`;
    const lines = [];
    const walk = (el, depth) => {
      if (depth > 8) return;
      const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
      const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim().slice(0, 60);
      lines.push('  '.repeat(depth) + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls + (text ? `  "${text}"` : ''));
      [...el.children].slice(0, 12).forEach((c) => walk(c, depth + 1));
    };
    walk(root, 0);
    return lines.join('\n');
  }, selector);
}

async function computed(page, elements) {
  return page.evaluate(({ elements, props }) => {
    const round = (n) => Math.round(n * 10) / 10;
    const out = {};
    for (const [name, sel] of Object.entries(elements)) {
      const el = document.querySelector(sel);
      if (!el) { out[name] = { selector: sel, missing: true }; continue; }
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      out[name] = {
        selector: sel,
        text: (el.innerText || '').trim().slice(0, 60),
        styles: Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)])),
        box: { x: round(r.x), y: round(r.y + scrollY), width: round(r.width), height: round(r.height) },
      };
    }
    // Column x-positions of the first table row, and the pitch between rows.
    const row = document.querySelector('#c-other-projects .table__body .row');
    if (row) {
      out['table.columns'] = [...row.children].map((c) => {
        const r = c.getBoundingClientRect();
        return { class: c.className, display: getComputedStyle(c).display, x: round(r.x), y: round(r.y + scrollY), width: round(r.width), text: c.innerText.trim() };
      });
      const next = row.nextElementSibling;
      if (next) out['table.rowPitch'] = round(next.getBoundingClientRect().y - row.getBoundingClientRect().y);
    }
    const vars = getComputedStyle(document.documentElement);
    out['css.vars'] = Object.fromEntries(['--dim-color', '--text-color', '--background-color'].map((v) => [v, vars.getPropertyValue(v).trim()]));
    return out;
  }, { elements, props: PROPS });
}

const browser = await chromium.launch();
await mkdir(join(OUT, 'screens'), { recursive: true });

const result = { capturedAt: new Date().toISOString(), widths: WIDTHS, pages: {} };
const sheets = new Set();

for (const [pageName, url] of Object.entries(PAGES)) {
  result.pages[pageName] = { url, widths: {} };
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await dismissCookies(page);

    if (width === WIDTHS[0]) {
      for (const [p, name, sel] of OUTLINES) {
        if (p === pageName) await writeFile(join(OUT, `dom-${name}.txt`), (await outline(page, sel)) + '\n');
      }
      for (const href of await page.evaluate(() => [...document.styleSheets].map((s) => s.href).filter(Boolean))) sheets.add(href);
    }

    if (!OUTLINE_ONLY) {
      await page.screenshot({ path: join(OUT, 'screens', `${pageName}-${width}.png`), fullPage: true });
      result.pages[pageName].widths[width] = await computed(page, ELEMENTS[pageName]);
    }
    await page.close();
  }
}
await browser.close();

if (!OUTLINE_ONLY) {
  result.stylesheets = [];
  for (const href of sheets) {
    const css = await (await fetch(href)).text();
    const file = join('css', href.split('/').pop());
    await mkdir(join(OUT, 'css'), { recursive: true });
    await writeFile(join(OUT, file), css);
    const media = [...new Set(css.match(/@media[^{]+/g) || [])].map((m) => m.trim()).sort();
    result.stylesheets.push({ href, file, media });
  }
  await writeFile(join(OUT, 'computed.json'), JSON.stringify(result, null, 2) + '\n');
}

console.log(`Captured ${Object.keys(PAGES).length} pages at ${WIDTHS.join(', ')} → reference/`);
