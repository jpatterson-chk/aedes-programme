// Shared renderer: programme.json → HTML string for #app.
// Used in the browser by app.js and at build time by scripts/prerender.mjs, so the prerendered page
// (what crawlers and AI tools read) and the live page are the same markup. No DOM access, so it runs in Node.

// Phase 4 features, each behind a flag: set one to false to turn it off (build and browser both read this).
export const FEATURES = {
  filter: true,          // "Filter" pill with a native <select> of event types, like the site's
  todayNowPast: true,    // TODAY / NOW labels; past days folded behind "Show past events (n)"
  addToCalendar: true,   // 📅 menu per event (Google Calendar / .ics); subscribe to all in the footer
};

const SITE_HOST = 'chybik-kristof.com';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Tiny HTML helper: text and attribute values are always escaped; only h() output is trusted markup.
class Html {
  constructor(html) { this.html = html; }
  toString() { return this.html; }
}
const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const VOID = new Set(['br']);

export function h(tag, attrs, ...children) {
  let attributes = '';
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    attributes += v === true ? ` ${k}` : ` ${k}="${escape(v)}"`;
  }
  const inner = children.flat(Infinity)
    .filter((c) => c != null && c !== false && c !== '')
    .map((c) => (c instanceof Html ? c.html : escape(c)))
    .join('');
  return new Html(VOID.has(tag) ? `<${tag}${attributes}>` : `<${tag}${attributes}>${inner}</${tag}>`);
}

const noon = (date) => new Date(`${date}T12:00:00Z`);
export const shortDate = (date) => `${WEEKDAYS[noon(date).getUTCDay()]} ${date.slice(8, 10)}.${date.slice(5, 7)}.`;
export const longDate = (date) => `${WEEKDAYS_LONG[noon(date).getUTCDay()]} ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

// Wall-clock arithmetic, e.g. ('2026-10-26', '18:00', 90) → { date: '2026-10-26', time: '19:30' }.
export function addMinutes(date, time, minutes) {
  const [y, mo, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, hh, mm + minutes)).toISOString();
  return { date: t.slice(0, 10), time: t.slice(11, 16) };
}

// The event's own end, else start + meta.defaultDurationMinutes, else null.
export function endOf(e, meta) {
  if (e.end) return { date: e.date, time: e.end };
  return meta.defaultDurationMinutes ? addMinutes(e.date, e.start, meta.defaultDurationMinutes) : null;
}

// Google Calendar's "add event" page, pre-filled. Times are wall-clock with ctz, so no UTC conversion
// is needed and Google applies the right offset either side of the DST change.
function googleCalendarUrl(e, meta, types) {
  const end = endOf(e, meta) ?? { date: e.date, time: e.start };
  const stamp = (date, time) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
  const type = types.get(e.type)?.label;
  const details = [
    e.people?.length && `With ${e.people.join(', ')}`,
    type && type[0].toUpperCase() + type.slice(1),
    e.description,
    e.registration && meta.registrationEmail && `Registration: ${meta.registrationEmail} (subject: Registration: ${e.title})`,
  ].filter(Boolean).join('\n\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${stamp(e.date, e.start)}/${stamp(end.date, end.time)}`,
    ctz: meta.timezone,
    details,
    location: e.location ?? meta.defaultLocation,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

// 📅 with an invisible native <select> over it, like the site's Filter pill (.btn.select).
// app.js opens the chosen option in a new tab (a static .ics is more reliable than a blob in an iframe on iOS).
function calendarPicker(googleUrl, icsUrl) {
  return h('span', { class: 'btn select icon calendar-picker', title: 'Add to calendar' },
    h('span', { class: 'select__label', 'aria-hidden': 'true' }, '📅'),
    h('select', { 'aria-label': 'Add to calendar' },
      h('option', { value: '' }, 'Add to calendar'),
      h('option', { value: googleUrl }, 'Add to Google Calendar'),
      h('option', { value: icsUrl }, 'Add to Apple / Outlook Calendar'),
    ),
  );
}

function linkTarget(url) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  return host === SITE_HOST ? { target: '_top' } : { target: '_blank', rel: 'noopener' };
}

// options.baseUrl: absolute URL of the programme page (for the webcal:// subscription link).
// options.updated: Date shown as "Updated 16 Oct", or null.
export function renderProgramme(data, { features = FEATURES, updated = null, baseUrl } = {}) {
  const { meta } = data;
  const types = new Map(data.types.map((t) => [t.id, t]));
  const events = [...data.events].sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
  // webcal:// makes calendar apps subscribe to programme.ics (and keep it updated) rather than import it once.
  const subscribeUrl = new URL('programme.ics', baseUrl).href.replace(/^https?:/, 'webcal:');

  const cell = (cls, ...content) => {
    const empty = content.flat().every((c) => c == null || c === false || c === '');
    return h('div', { class: `cell sec ${cls}${empty ? ' empty' : ''}` }, ...content);
  };

  const eventItem = (e) => {
    const status = e.status ?? 'scheduled';
    const calendar = features.addToCalendar && status !== 'cancelled';
    const hasDetails = Boolean(e.description || e.links?.length || e.registration || e.location || calendar);
    const end = endOf(e, meta);
    const attrs = { id: e.id, class: status, 'data-type': e.type, 'data-date': e.date, 'data-start': e.start, 'data-end-at': end && `${end.date} ${end.time}` };

    const row = h('div', { class: 'row' },
      // .lead is display: contents on desktop (two grid cells) and one line on mobile ("18:30 Title").
      h('div', { class: 'lead' },
        h('div', { class: 'cell time' }, h('time', { datetime: `${e.date}T${e.start}` }, e.start)),  // start only; "end" is kept for calendar/now features
        h('div', { class: 'cell name' },
          h('span', { class: 'title' }, e.title),
          status === 'cancelled' && [' ', h('span', { class: 'dim status' }, 'CANCELLED')],
          status !== 'scheduled' && e.note && [' ', h('span', { class: 'dim note' }, e.note)],
          features.todayNowPast && h('span', { class: 'label-now', hidden: true }, ' NOW'),
          hasDetails && [' ', h('span', { class: 'dim toggle', 'aria-hidden': 'true' })],  // nbsp keeps "+" with the last word
        ),
      ),
      cell('people', e.people?.join(', ')),
      cell('type', types.get(e.type)?.label),
    );
    if (!hasDetails) return h('li', attrs, row);

    const register = e.registration && meta.registrationEmail && status !== 'cancelled'
      && h('a', { class: 'btn', href: `mailto:${meta.registrationEmail}?subject=${encodeURIComponent(`Registration: ${e.title}`)}` }, 'Register');

    const body = h('div', { class: 'details__body' },
      e.location && h('p', {}, `Location: ${e.location}`),  // only set when it isn't the venue
      (e.description ?? '').split(/\n\s*\n/).filter(Boolean).map((p) => h('p', {}, p)),
      e.links?.length && h('p', { class: 'details__links' },
        e.links.map((l) => h('a', { href: l.url, ...linkTarget(l.url) }, l.label))),
      (register || calendar) && h('p', { class: 'details__actions' },
        register,
        calendar && calendarPicker(googleCalendarUrl(e, meta, types), `ics/${e.id}.ics`)),
    );
    return h('li', attrs,
      h('details', {}, h('summary', {}, row), h('div', { class: 'details' }, body)));
  };

  // Each day: the date once on its own line (plus any dayLabel), then one <ol> of its events.
  const dates = [...new Set([...events.map((e) => e.date), ...Object.keys(data.dayLabels ?? {})])].sort();
  const days = dates.map((date) => h('section', { class: 'day', 'aria-labelledby': `day-${date}`, 'data-date': date },
    h('h3', { class: 'row day__date', id: `day-${date}` },
      h('div', { class: 'cell' },
        h('time', { datetime: date, 'aria-label': longDate(date) }, shortDate(date)),
        data.dayLabels?.[date] && [' ', h('span', { class: 'dim' }, data.dayLabels[date])],
        features.todayNowPast && h('span', { class: 'dim label-today', hidden: true }, ' TODAY'),
      ),
    ),
    h('ol', {}, events.filter((e) => e.date === date).map(eventItem)),
  ));

  // Controls: the type filter and the past-events toggle, as pills in the flow (nothing fixed inside an iframe).
  const usedTypes = data.types.filter((t) => events.some((e) => e.type === t.id));
  const filter = features.filter && h('div', { class: 'btn select filter' },
    h('span', { class: 'select__label' }, 'Filter'),
    h('select', { 'aria-label': 'Filter by type' },
      h('option', { value: '' }, 'All events'),
      usedTypes.map((t) => h('option', { value: t.id, 'data-label': t.group ?? t.label }, `${t.group ?? t.label} ${events.filter((e) => e.type === t.id).length}`)),
    ),
  );
  const pastToggle = features.todayNowPast && h('button', { type: 'button', class: 'btn dim past-toggle', 'aria-expanded': 'false', hidden: true });

  return [
    // A line break ("\n") in meta.intro starts a new line, as in the printed programme.
    meta.intro && h('p', { class: 'intro' }, meta.introTitle && [h('strong', {}, meta.introTitle), h('br')],
      meta.intro.split('\n').flatMap((line, i) => (i ? [h('br'), line] : [line]))),
    (filter || pastToggle) && h('div', { class: 'controls' }, filter, pastToggle),
    h('section', { class: 'programme', 'aria-label': meta.title ?? 'Programme', 'data-timezone': meta.timezone },
      h('h2', { class: 'row heading' },
        h('div', { class: 'cell programme__title' }, 'Programme'),
        h('div', { class: 'cell people' }, 'With'),
        h('div', { class: 'cell type' }, 'Type'),
      ),
      days,
    ),
    h('footer', { class: 'footer dim' },
      meta.footer && h('p', {}, meta.footer),
      // Subscriptions, not one-off imports, so later changes to the programme reach people's calendars.
      features.addToCalendar && h('p', {}, 'Subscribe to the whole programme: ',
        h('a', { href: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(subscribeUrl)}`, target: '_blank', rel: 'noopener' }, 'Google Calendar'),
        ', ',
        h('a', { href: subscribeUrl }, 'Apple / Outlook'),   // webcal: hands off to the calendar app, like mailto:
        '.'),
      updated && h('p', {}, `Updated ${updated.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: meta.timezone })}`),
      // Back to the studio's page; hidden when embedded (it would link to itself), kept for crawlers and direct visits.
      meta.publicUrl && h('p', { class: 'footer__home' }, h('a', { href: meta.publicUrl, target: '_top' }, 'CHYBÍK + KRIŠTOF at Aedes')),
    ),
  ].filter(Boolean).join('');
}
