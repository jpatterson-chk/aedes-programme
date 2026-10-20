// Prerenders site/index.html: the programme as plain HTML inside #app (via the same site/render.js the
// browser uses), plus the page title, description, canonical, Open Graph tags and schema.org JSON-LD.
// Used by build.mjs for dist/ and by serve.mjs locally, so local pages match production.

import { FEATURES, renderProgramme } from '../site/render.js';
import { jsonLdScript, programmeJsonLd } from './jsonld.mjs';
import { ORGANIZER, PAGES_URL, pageDescription, pageTitle } from './page-meta.mjs';

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fill(html, marker, content) {
  if (!html.includes(marker)) throw new Error(`prerender: marker "${marker}" not found in index.html`);
  return html.replace(marker, () => content);
}

// template: site/index.html; baseUrl: where this copy is served (canonical + calendar links).
export function prerender(template, data, { baseUrl = PAGES_URL, updated = new Date() } = {}) {
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
    jsonLdScript(programmeJsonLd(data)),
  ].join('\n  ');

  let html = template.replace(/<title>[^<]*<\/title>/, () => `<title>${escape(title)}</title>`);
  html = fill(html, '<!-- build: page metadata -->', head);
  html = fill(html, '<!-- build: programme -->', renderProgramme(data, { features: FEATURES, updated, baseUrl }));
  return html;
}
