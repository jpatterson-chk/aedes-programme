// Checks the built page (run after build.mjs): the programme is readable as plain HTML, the
// structured data is valid and DST-correct, and text from the data is always escaped.
//
//   node scripts/build.mjs && node scripts/test-build.mjs

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderProgramme } from '../site/render.js';
import { jsonLdScript, programmeJsonLd } from './jsonld.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(ROOT, 'dist', 'index.html'), 'utf8');
const data = JSON.parse(await readFile(join(ROOT, 'site', 'data', 'programme.json'), 'utf8'));

let failed = 0;
const ok = (cond, label, detail = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? `\n    ${detail}` : ''}`);
  if (!cond) failed++;
};
const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Readable without scripts
const app = html.match(/<main id="app">([\s\S]*?)<\/main>/)?.[1] ?? '';
const ids = [...app.matchAll(/<li id="([^"]+)"/g)].map((m) => m[1]);
ok(ids.length === data.events.length, `all ${data.events.length} events are in the HTML`, `found ${ids.length}`);
const missingTitles = data.events.filter((e) => !app.includes(escape(e.title)));
ok(missingTitles.length === 0, 'every event title is in the HTML as text', missingTitles.map((e) => e.id).join(', '));
ok(typeof document === 'undefined', 'render.js runs in Node (no DOM needed)');

// Head
ok(/<title>[^<]*Building the Existing City[^<]*<\/title>/.test(html), 'page has a real <title>');
ok(/<meta name="description" content="[^"]{80,}">/.test(html), 'page has a meta description');
ok(/<link rel="canonical" href="https:\/\/[^"]+">/.test(html), 'page has a canonical URL');
ok(/(href|src)="(styles\.css|app\.js|embed-child\.js)\?v=\w+"/.test(html), 'styles and scripts are version-stamped');

// Structured data
const ldText = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
let ld = null;
try { ld = JSON.parse(ldText); } catch (err) { ok(false, 'JSON-LD parses', err.message); }
if (ld) {
  ok(ld['@type'] === 'ExhibitionEvent' && ld.subEvent?.length === data.events.length, `JSON-LD: ExhibitionEvent with ${data.events.length} events`, `${ld['@type']}, ${ld.subEvent?.length}`);
  // Summer time ends 25 Oct 2026: every event before is CEST (+02:00), every event after is CET (+01:00).
  const wrongOffset = ld.subEvent.filter((e) => !e.startDate.endsWith(e.startDate < '2026-10-25' ? '+02:00' : '+01:00'));
  ok(wrongOffset.length === 0, 'every event has the right offset either side of the 25 Oct DST change', wrongOffset.map((e) => e.startDate).join(', '));
  const dst = programmeJsonLd({ ...data, events: [
    { ...data.events[0], id: 'a', date: '2026-10-24', start: '18:00' },
    { ...data.events[0], id: 'b', date: '2026-10-26', start: '18:00' },
  ] }).subEvent.map((e) => e.startDate);
  ok(dst[0] === '2026-10-24T18:00:00+02:00' && dst[1] === '2026-10-26T18:00:00+01:00', '24 Oct is +02:00 and 26 Oct is +01:00', dst.join(', '));
  ok(ld.subEvent.every((e) => e.endDate && e.endDate > e.startDate), 'every event has an end after its start (own end or default duration)');
  ok(ld.subEvent.every((e) => e.location && e.eventStatus && e.offers?.price === 0), 'every event has location, status and free offer');
}

// Escaping: text from the data can never become markup
const tricky = structuredClone(data);
tricky.events = [{ ...data.events[0], id: 'x', title: 'A & B <script>alert(1)</script> "quoted"', description: 'x </script><b>y</b>' }];
const out = renderProgramme(tricky, { baseUrl: 'https://example.com/' });
ok(out.includes('A &amp; B &lt;script&gt;alert(1)&lt;/script&gt; &quot;quoted&quot;') && !out.includes('<script>'), 'titles and descriptions are HTML-escaped');
ok(!jsonLdScript(programmeJsonLd(tricky)).slice(0, -'</script>'.length).includes('</script'), 'JSON-LD can’t be closed early by text in the data');

// Registration: a Tally form when the event has one, else the email as before
const reg = structuredClone(data);
reg.events = [
  { ...data.events[0], id: 'with-form', status: undefined, registration: true, registrationForm: 'wzeAYa' },
  { ...data.events[0], id: 'by-email', status: undefined, registration: true, registrationForm: undefined },
];
const regHtml = renderProgramme(reg, { baseUrl: 'https://example.com/' });
const item = (id) => regHtml.slice(regHtml.indexOf(`<li id="${id}"`)).split('</li>')[0];
ok(item('with-form').includes('href="https://tally.so/r/wzeAYa"') && !item('with-form').includes('mailto:'), 'with a form, Register links to the form, not email');
ok(item('with-form').includes('data-tally-src="https://tally.so/embed/wzeAYa?') && !/<iframe/.test(regHtml), 'the inline form is prepared but not prerendered as an iframe');
ok(item('by-email').includes(`href="mailto:${data.meta.registrationEmail}?subject=`), 'without a form, Register still emails');
const regLd = programmeJsonLd(reg).subEvent;
ok(regLd[0].offers.url === 'https://tally.so/r/wzeAYa' && regLd[1].offers.url.endsWith('#by-email'), 'JSON-LD: offer URL is the form, or the event on the page', regLd.map((e) => e.offers.url).join(', '));

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll build checks passed.');
process.exit(failed ? 1 : 0);
