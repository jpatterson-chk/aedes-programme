// Prerenders site/index.html: the programme as plain HTML inside #app (via the same site/render.js the
// browser uses), plus the page title, description, canonical and Open Graph tags. Used by build.mjs for
// dist/ and by serve.mjs locally, so local pages match production.

import { FEATURES, renderProgramme } from '../site/render.js';

export const PAGES_URL = 'https://jpatterson-chk.github.io/aedes-programme/';
export const ORGANIZER = { name: 'CHYBÍK + KRIŠTOF', url: 'https://chybik-kristof.com/' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayMonth = (date) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fill(html, marker, content) {
  if (!html.includes(marker)) throw new Error(`prerender: marker "${marker}" not found in index.html`);
  return html.replace(marker, () => content);
}

// "Events programme for … at Aedes – Architecture and Space, Berlin, 22 Oct – 3 Dec 2026: lectures, … Free entry. …"
export function pageDescription(data) {
  const { meta } = data;
  const groups = data.types.filter((t) => data.events.some((e) => e.type === t.id)).map((t) => (t.group ?? t.label).toLowerCase());
  const range = `${dayMonth(meta.startDate)} – ${dayMonth(meta.endDate)} ${meta.endDate.slice(0, 4)}`;
  const venue = meta.defaultLocation.split(',')[0];
  return `Events programme for ${meta.title}, an exhibition by ${ORGANIZER.name} at ${venue}, Berlin, ${range}: ${groups.join(', ')}.${meta.footer ? ` ${meta.footer}` : ''}`;
}

export function pageTitle(data) {
  return `${data.meta.title}: programme | ${ORGANIZER.name} at ${data.meta.defaultLocationShort ?? 'Aedes'}, Berlin`;
}

// template: site/index.html; baseUrl: where this copy is served (canonical + calendar links).
export function prerender(template, data, { baseUrl = PAGES_URL, updated = new Date(), headExtra = '' } = {}) {
  const title = pageTitle(data);
  const description = pageDescription(data);
  const head = [
    `<meta name="description" content="${escape(description)}">`,
    `<link rel="canonical" href="${escape(baseUrl)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escape(ORGANIZER.name)}">`,
    `<meta property="og:title" content="${escape(title)}">`,
    `<meta property="og:description" content="${escape(description)}">`,
    `<meta property="og:url" content="${escape(baseUrl)}">`,
    headExtra,
  ].filter(Boolean).join('\n  ');

  let html = template.replace(/<title>[^<]*<\/title>/, () => `<title>${escape(title)}</title>`);
  html = fill(html, '<!-- build: page metadata -->', head);
  html = fill(html, '<!-- build: programme -->', renderProgramme(data, { features: FEATURES, updated, baseUrl }));
  return html;
}
