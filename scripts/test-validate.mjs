// Checks that validate.mjs passes the real programme and fails clearly on broken copies of it.
//
//   node scripts/test-validate.mjs

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from './validate.mjs';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'data', 'programme.json');
const original = JSON.parse(await readFile(file, 'utf8'));

// Each case breaks one thing and names the text the error must contain.
const CASES = [
  ['missing title', (d) => { delete d.events[0].title; }, '"title": is required'],
  ['12-hour time', (d) => { d.events[1].start = '6pm'; }, 'must be 24-hour HH:MM'],
  ['end before start', (d) => { d.events[4].end = '08:30'; }, 'must be after "start"'],
  ['unknown type', (d) => { d.events[2].type = 'talk'; }, '"talk" is not one of the types'],
  ['duplicate id', (d) => { d.events[3].id = d.events[2].id; }, 'is also used by event'],
  ['date outside exhibition', (d) => { d.events[0].date = '2026-12-24'; }, 'outside the exhibition dates'],
  ['impossible date', (d) => { d.events[0].date = '2026-11-31'; }, 'must be a real date'],
  ['http link', (d) => { d.events[0].links = [{ label: 'More', url: 'http://example.com' }]; }, 'must start with https://'],
  ['typo in field name', (d) => { d.events[0].titel = d.events[0].title; }, '"titel": unknown field'],
  ['HTML in description', (d) => { d.events[1].description = '<b>Bold</b>'; }, 'must be plain text'],
  ['bad status', (d) => { d.events[0].status = 'canceled'; }, 'must be one of scheduled, cancelled, changed'],
  ['unknown theme', (d) => { d.events[1].themes = ['build']; }, '"build" is not one of the themes'],
];

let failed = 0;
const ok = (cond, label, detail = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? `\n    ${detail}` : ''}`);
  if (!cond) failed++;
};

const base = validate(original);
ok(base.errors.length === 0, 'real programme passes', base.errors.join('\n    '));

for (const [label, breakIt, expected] of CASES) {
  const copy = structuredClone(original);
  breakIt(copy);
  const { errors } = validate(copy);
  const hit = errors.find((e) => e.includes(expected));
  ok(Boolean(hit), `fails on ${label}`, hit ?? `expected an error containing ${JSON.stringify(expected)}, got: ${errors.join(' | ') || 'no errors'}`);
}

// Two events of our own at the same place and time, so the check doesn't depend on the programme's content.
const overlap = structuredClone(original);
const sameSlot = { date: original.meta.startDate, type: original.types[0].id, title: 'Overlap test' };
overlap.events.push({ ...sameSlot, id: 'overlap-a', start: '10:00', end: '11:00' }, { ...sameSlot, id: 'overlap-b', start: '10:30', end: '11:30' });
ok(validate(overlap).warnings.some((w) => w.includes('overlap')), 'warns on overlapping events at the same location');

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
