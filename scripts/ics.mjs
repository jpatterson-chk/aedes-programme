// iCalendar (.ics) generation for the programme. Used by build.mjs (static files in dist/)
// and serve.mjs (generated on request, so calendar links work locally too).
//
// Times in programme.json are wall-clock times in meta.timezone. They are converted to UTC using
// the offset that applies on that date, so events either side of the 25 Oct DST change are right.

import { registrationText } from '../site/render.js';

const PRODID = '-//CHYBIK + KRISTOF//Aedes programme//EN';
const UID_DOMAIN = 'aedes-programme.jpatterson-chk.github.io';

// Offset of `timeZone` from UTC, in minutes, at the instant `ms`. "GMT+01:00" → 60.
function offsetMinutes(ms, timeZone) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(ms).find((p) => p.type === 'timeZoneName').value;
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === '+' ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

// "2026-10-26", "18:00", "Europe/Berlin" → Date for 17:00Z.
export function wallTimeToUtc(date, time, timeZone) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Guess with the offset at that instant, then correct with the offset at the resulting instant.
  const first = asUtc - offsetMinutes(asUtc, timeZone) * 60000;
  return new Date(asUtc - offsetMinutes(first, timeZone) * 60000);
}

// "2026-10-26", "18:00", "Europe/Berlin" → "2026-10-26T18:00:00+01:00" (ISO 8601 with that date's offset).
export function isoWithOffset(date, time, timeZone) {
  const offset = offsetMinutes(wallTimeToUtc(date, time, timeZone).getTime(), timeZone);
  const abs = Math.abs(offset);
  const hhmm = `${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  return `${date}T${time}:00${offset < 0 ? '-' : '+'}${hhmm}`;
}

const utcStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const escapeText = (s) => String(s)
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// RFC 5545: lines are at most 75 octets; continuation lines start with a space.
const encoder = new TextEncoder();
function fold(line) {
  const parts = [];
  let current = '';
  let octets = 0;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    if (octets + n > (parts.length ? 74 : 75)) { parts.push(current); current = ''; octets = 0; }
    current += ch;
    octets += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

// End as UTC: the event's own "end", else start + meta.defaultDurationMinutes, else none.
function endUtc(e, meta) {
  if (e.end) return wallTimeToUtc(e.date, e.end, meta.timezone);
  if (meta.defaultDurationMinutes) return new Date(wallTimeToUtc(e.date, e.start, meta.timezone).getTime() + meta.defaultDurationMinutes * 60000);
  return null;
}

function vevent(e, data, stamp) {
  const { meta } = data;
  const tz = meta.timezone;
  const end = endUtc(e, meta);
  const type = data.types.find((t) => t.id === e.type);
  const description = [
    e.people?.length && `With ${e.people.join(', ')}`,
    type && `${type.label[0].toUpperCase()}${type.label.slice(1)}`,
    e.note,
    e.description,
    registrationText(e, meta),
  ].filter(Boolean).join('\n\n');

  return [
    'BEGIN:VEVENT',
    `UID:${e.id}@${UID_DOMAIN}`,
    `DTSTAMP:${utcStamp(stamp)}`,
    `DTSTART:${utcStamp(wallTimeToUtc(e.date, e.start, tz))}`,
    // No end and no default duration → no DTEND: the event is a point in time (RFC 5545 §3.6.1).
    end && `DTEND:${utcStamp(end)}`,
    `SUMMARY:${escapeText(e.status === 'cancelled' ? `Cancelled: ${e.title}` : e.title)}`,
    description && `DESCRIPTION:${escapeText(description)}`,
    `LOCATION:${escapeText(e.location ?? meta.defaultLocation)}`,
    `STATUS:${e.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
  ].filter(Boolean);
}

export function calendar(data, events, { name, stamp = new Date() } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    name && `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-TIMEZONE:${data.meta.timezone}`,
    ...events.flatMap((e) => vevent(e, data, stamp)),
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.map(fold).join('\r\n') + '\r\n';
}

// Every file the site serves: ics/<id>.ics per event, programme.ics with all of them.
export function calendarFiles(data, stamp = new Date()) {
  const files = new Map();
  for (const e of data.events) files.set(`ics/${e.id}.ics`, calendar(data, [e], { stamp }));
  files.set('programme.ics', calendar(data, data.events, { name: data.meta.title, stamp }));
  return files;
}
