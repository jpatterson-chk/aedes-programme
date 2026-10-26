// Checks .ics generation: UTC conversion either side of the 25 Oct 2026 DST change, escaping,
// line folding and cancelled events.
//
//   node scripts/test-ics.mjs

import { calendar, wallTimeToUtc } from './ics.mjs';

let failed = 0;
const ok = (cond, label, detail = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? `\n    ${detail}` : ''}`);
  if (!cond) failed++;
};
const iso = (d) => d.toISOString().slice(0, 16) + 'Z';

// Summer time (CEST, UTC+2) ends at 03:00 on Sunday 25 Oct 2026.
ok(iso(wallTimeToUtc('2026-10-22', '18:30', 'Europe/Berlin')) === '2026-10-22T16:30Z', '22 Oct 18:30 Berlin = 16:30 UTC (CEST)');
ok(iso(wallTimeToUtc('2026-10-24', '18:00', 'Europe/Berlin')) === '2026-10-24T16:00Z', '24 Oct 18:00 Berlin = 16:00 UTC (CEST)');
ok(iso(wallTimeToUtc('2026-10-26', '18:00', 'Europe/Berlin')) === '2026-10-26T17:00Z', '26 Oct 18:00 Berlin = 17:00 UTC (CET)');
ok(iso(wallTimeToUtc('2026-12-03', '18:30', 'Europe/Berlin')) === '2026-12-03T17:30Z', '3 Dec 18:30 Berlin = 17:30 UTC (CET)');

const data = {
  meta: { title: 'Test', timezone: 'Europe/Berlin', defaultLocation: 'Aedes – Architecture and Space, Christinenstrasse 18–19, 10119 Berlin', registrationEmail: 'berlin@chybik-kristof.com' },
  types: [{ id: 'lecture', label: 'lecture' }],
  events: [
    { id: 'a', date: '2026-10-26', start: '18:00', end: '19:30', type: 'lecture', title: 'Ondřej Chybík: Building, the; Existing City', people: ['Ondřej Chybík'], description: 'Line one.\n\nŠrámková, Chytilová — ' + 'long text '.repeat(20), registration: true },
    { id: 'b', date: '2026-10-27', start: '18:30', type: 'lecture', title: 'Gone', status: 'cancelled' },
    { id: 'c', date: '2026-10-28', start: '18:30', type: 'lecture', title: 'With a form', registration: true, registrationForm: 'wzeAYa' },
  ],
};
const ics = calendar(data, data.events, { name: 'Test', stamp: new Date('2026-10-15T12:00:00Z') });
const lines = ics.split('\r\n');

ok(!/[^\r]\n/.test(ics), 'all line endings are CRLF');
ok(lines.every((l) => new TextEncoder().encode(l).length <= 75), 'no line longer than 75 octets (UTF-8)');
const unfolded = ics.replace(/\r\n /g, '');
ok(unfolded.includes('DTSTART:20261026T170000Z') && unfolded.includes('DTEND:20261026T183000Z'), 'start and end converted to UTC');
ok(unfolded.includes('SUMMARY:Ondřej Chybík: Building\\, the\\; Existing City'), 'commas and semicolons escaped, accents kept');
ok(unfolded.includes('Line one.\\n\\nŠrámková'), 'paragraph breaks become \\n');
ok(/BEGIN:VEVENT\r\nUID:b@[^]*?STATUS:CANCELLED/.test(ics), 'cancelled event has STATUS:CANCELLED');
ok(!/UID:b@[^]*?DTEND/.test(ics.split('BEGIN:VEVENT')[2]), 'no end and no default duration → no DTEND');
ok(unfolded.includes('Registration: berlin@chybik-kristof.com (subject: Registration: Ondřej Chybík'), 'registration by email: address and subject');
ok(unfolded.includes('Register: https://tally.so/r/wzeAYa') && !ics.split('BEGIN:VEVENT')[3].replace(/\r\n /g, '').includes('berlin@'), 'registration with a form: the form link, no email');

const withDefault = { ...data, meta: { ...data.meta, defaultDurationMinutes: 90 } };
const ics90 = calendar(withDefault, withDefault.events, { stamp: new Date('2026-10-15T12:00:00Z') }).replace(/\r\n /g, '');
ok(ics90.includes('DTSTART:20261027T173000Z\r\nDTEND:20261027T190000Z'), 'no end → start + defaultDurationMinutes (18:30 CET → 20:00)');
ok(ics90.includes('DTEND:20261026T183000Z'), 'an event’s own end time wins over the default');

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll .ics checks passed.');
process.exit(failed ? 1 : 0);
