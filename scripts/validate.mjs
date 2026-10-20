// Schema + sanity checks for site/data/programme.json. Exits non-zero on error.
//
//   node scripts/validate.mjs [path/to/programme.json]
//
// Errors block the deploy. Warnings (overlaps, empty descriptions, details still
// to be confirmed) are printed but don't block anything.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'data', 'programme.json');

const EVENT_FIELDS = new Set([
  'id', 'date', 'start', 'end', 'type', 'title', 'people', 'location', 'description',
  'links', 'status', 'note', 'registration', 'themes', 'missing',
]);
const STATUSES = ['scheduled', 'cancelled', 'changed'];
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^\s@]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i; // ASCII domain only: catches "krištof.com"
const HTML = /<\/?[a-z!][^>]*>/i;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim() !== '';

function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

export function validate(data) {
  const errors = [];
  const warnings = [];
  const tbc = [];

  if (!isObject(data)) return { errors: ['The file must contain a single { … } object.'], warnings, tbc };

  // meta
  const meta = data.meta;
  if (!isObject(meta)) {
    errors.push('"meta" is missing or not an object.');
  } else {
    if (!isText(meta.timezone)) errors.push('meta: "timezone" is required, e.g. "Europe/Berlin".');
    else {
      try { new Intl.DateTimeFormat('en', { timeZone: meta.timezone }); }
      catch { errors.push(`meta: "timezone" "${meta.timezone}" is not a valid time zone.`); }
    }
    for (const f of ['startDate', 'endDate']) {
      if (!isDate(meta[f])) errors.push(`meta: "${f}" must be a real date as YYYY-MM-DD, got ${JSON.stringify(meta[f])}.`);
    }
    if (isDate(meta.startDate) && isDate(meta.endDate) && meta.endDate < meta.startDate) {
      errors.push('meta: "endDate" is before "startDate".');
    }
    if (!isText(meta.defaultLocation)) errors.push('meta: "defaultLocation" is required.');
    if (meta.registrationEmail !== undefined && !EMAIL.test(meta.registrationEmail)) {
      errors.push(`meta: "registrationEmail" is not a valid email address: ${JSON.stringify(meta.registrationEmail)}.`);
    }
    const dur = meta.defaultDurationMinutes;
    if (dur !== undefined && !(Number.isInteger(dur) && dur > 0 && dur <= 24 * 60)) {
      errors.push(`meta: "defaultDurationMinutes" must be a whole number of minutes (e.g. 90), got ${JSON.stringify(dur)}.`);
    }
    for (const f of ['title', 'introTitle', 'intro', 'footer', 'defaultLocationShort']) {
      if (meta[f] !== undefined && typeof meta[f] !== 'string') errors.push(`meta: "${f}" must be text.`);
    }
  }
  const inRange = (d) => !isObject(meta) || !isDate(meta.startDate) || !isDate(meta.endDate) || (d >= meta.startDate && d <= meta.endDate);

  // types and themes
  const idList = (key, required) => {
    const ids = new Set();
    const list = data[key];
    if (list === undefined && !required) return ids;
    if (!Array.isArray(list) || (required && list.length === 0)) {
      errors.push(`"${key}" must be a list of { "id": …, "label": … } entries.`);
      return ids;
    }
    list.forEach((t, i) => {
      const where = `${key}[${i}]`;
      if (!isObject(t)) return errors.push(`${where} must be an object.`);
      if (!isText(t.id) || !KEBAB.test(t.id)) errors.push(`${where}: "id" must be lowercase-with-hyphens, got ${JSON.stringify(t.id)}.`);
      else if (ids.has(t.id)) errors.push(`${where}: "id" "${t.id}" is used twice.`);
      else ids.add(t.id);
      if (!isText(t.label)) errors.push(`${where} ("${t.id}"): "label" is required.`);
      if (t.group !== undefined && !isText(t.group)) errors.push(`${where} ("${t.id}"): "group" must be text.`);
    });
    return ids;
  };
  const typeIds = idList('types', true);
  const themeIds = idList('themes', false);

  // day labels
  if (data.dayLabels !== undefined) {
    if (!isObject(data.dayLabels)) errors.push('"dayLabels" must be an object of "YYYY-MM-DD": "label" pairs.');
    else for (const [d, label] of Object.entries(data.dayLabels)) {
      if (!isDate(d)) errors.push(`dayLabels: "${d}" is not a real date as YYYY-MM-DD.`);
      else if (!inRange(d)) errors.push(`dayLabels: ${d} is outside the exhibition dates.`);
      if (!isText(label)) errors.push(`dayLabels: the label for ${d} is empty.`);
    }
  }

  // events
  if (!Array.isArray(data.events)) {
    errors.push('"events" must be a list.');
    return { errors, warnings, tbc };
  }

  const seen = new Map();
  const valid = [];
  data.events.forEach((e, i) => {
    const name = isObject(e) && isText(e.id) ? `"${e.id}"` : isObject(e) && isText(e.title) ? `#${i + 1} ("${e.title}")` : `#${i + 1}`;
    const err = (field, msg) => errors.push(`Event ${name}, ${field}: ${msg}`);
    if (!isObject(e)) return errors.push(`Event #${i + 1} must be a { … } object.`);
    const before = errors.length;

    for (const k of Object.keys(e)) {
      if (!EVENT_FIELDS.has(k)) err(`"${k}"`, `unknown field. Allowed: ${[...EVENT_FIELDS].join(', ')}.`);
    }

    // required
    if (!isText(e.id)) err('"id"', 'is required.');
    else if (!KEBAB.test(e.id)) err('"id"', 'must be lowercase-with-hyphens, e.g. "2026-11-03-opening-lecture".');
    else if (seen.has(e.id)) err('"id"', `is also used by event #${seen.get(e.id) + 1}. Every id must be unique.`);
    else seen.set(e.id, i);

    if (!isDate(e.date)) err('"date"', `must be a real date as YYYY-MM-DD, got ${JSON.stringify(e.date)}.`);
    else if (!inRange(e.date)) err('"date"', `${e.date} is outside the exhibition dates (${meta.startDate} to ${meta.endDate}).`);

    if (!TIME.test(e.start ?? '')) err('"start"', `must be 24-hour HH:MM, e.g. "18:30", got ${JSON.stringify(e.start)}.`);
    if (e.end !== undefined) {
      if (!TIME.test(e.end)) err('"end"', `must be 24-hour HH:MM, e.g. "20:00", got ${JSON.stringify(e.end)}.`);
      else if (TIME.test(e.start ?? '') && minutes(e.end) <= minutes(e.start)) err('"end"', `(${e.end}) must be after "start" (${e.start}).`);
    }

    if (!isText(e.type)) err('"type"', 'is required.');
    else if (!typeIds.has(e.type)) err('"type"', `"${e.type}" is not one of the types: ${[...typeIds].join(', ')}.`);

    if (!isText(e.title)) err('"title"', 'is required.');
    else if (HTML.test(e.title)) err('"title"', 'must be plain text, without HTML.');

    // optional
    if (e.people !== undefined && (!Array.isArray(e.people) || !e.people.every(isText))) err('"people"', 'must be a list of names, e.g. ["Ondřej Chybík"].');
    if (e.location !== undefined && !isText(e.location)) err('"location"', 'must be text, or left out to use the default venue.');
    if (e.description !== undefined) {
      if (typeof e.description !== 'string') err('"description"', 'must be text.');
      else if (HTML.test(e.description)) err('"description"', 'must be plain text, without HTML. Use a blank line (\\n\\n) for a new paragraph.');
    }
    if (e.links !== undefined) {
      if (!Array.isArray(e.links)) err('"links"', 'must be a list of { "label": …, "url": … }.');
      else e.links.forEach((l, j) => {
        if (!isObject(l) || !isText(l.label)) err(`"links" #${j + 1}`, 'needs a "label".');
        if (!isObject(l) || typeof l.url !== 'string' || !/^https:\/\/[^\s]+\.[^\s]+$/.test(l.url)) err(`"links" #${j + 1}`, `"url" must start with https://, got ${JSON.stringify(l?.url)}.`);
      });
    }
    if (e.status !== undefined && !STATUSES.includes(e.status)) err('"status"', `must be one of ${STATUSES.join(', ')}, got ${JSON.stringify(e.status)}.`);
    if (e.note !== undefined && typeof e.note !== 'string') err('"note"', 'must be text.');
    if (e.registration !== undefined && typeof e.registration !== 'boolean') err('"registration"', 'must be true or false (no quotes).');
    if (e.registration === true && isObject(meta) && !meta.registrationEmail) err('"registration"', 'is true but meta has no "registrationEmail".');
    if (e.themes !== undefined) {
      if (!Array.isArray(e.themes)) err('"themes"', 'must be a list of theme ids.');
      else e.themes.forEach((t) => { if (!themeIds.has(t)) err('"themes"', `"${t}" is not one of the themes: ${[...themeIds].join(', ') || '(none defined)'}.`); });
    }
    if (e.missing !== undefined && (!Array.isArray(e.missing) || !e.missing.every(isText))) err('"missing"', 'must be a list of short notes, e.g. ["end time"].');

    // warnings
    if (e.status === 'changed' && !isText(e.note)) warnings.push(`Event ${name}: status is "changed" but there is no "note" saying what changed.`);
    if (!isText(e.description)) warnings.push(`Event ${name}: no description.`);
    if (Array.isArray(e.missing) && e.missing.length) tbc.push(`${e.date ?? '?'} ${e.start ?? ''}  ${e.title ?? name}: ${e.missing.join('; ')}`);

    if (errors.length === before) valid.push(e);
  });

  // overlaps at the same location (only events with both start and end, not cancelled)
  const byPlace = new Map();
  for (const e of valid) {
    if (!e.end || e.status === 'cancelled') continue;
    const key = `${e.date}|${e.location ?? meta.defaultLocation}`;
    if (!byPlace.has(key)) byPlace.set(key, []);
    byPlace.get(key).push(e);
  }
  for (const list of byPlace.values()) {
    list.sort((a, b) => minutes(a.start) - minutes(b.start));
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      if (minutes(b.start) < minutes(a.end)) warnings.push(`Events "${a.id}" and "${b.id}" overlap at the same location (${a.start}–${a.end} and ${b.start}–${b.end}).`);
    }
  }

  return { errors, warnings, tbc };
}

async function main() {
  const file = process.argv[2] ?? DEFAULT_FILE;
  let data;
  try {
    data = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    console.error(`✗ ${file} could not be read as JSON:\n  ${e.message}\n  Check for a missing comma, quote or bracket near that position.`);
    process.exit(1);
  }

  const { errors, warnings, tbc } = validate(data);
  const events = Array.isArray(data.events) ? data.events.length : 0;

  if (warnings.length) {
    console.log(`Warnings (${warnings.length}, not blocking):`);
    for (const w of warnings) console.log(`  ! ${w}`);
  }
  if (tbc.length) {
    console.log(`\nTo be confirmed (${tbc.length} events, from "missing"):`);
    for (const t of tbc) console.log(`  ? ${t}`);
  }
  if (errors.length) {
    console.error(`\n✗ ${errors.length} error${errors.length > 1 ? 's' : ''}. Nothing will be deployed until ${errors.length > 1 ? 'they are' : 'it is'} fixed:`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`\n✓ programme.json is valid: ${events} events.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
