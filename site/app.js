// Fetch, sort, group, render, filter, now/today.
// Phase 4 features are each behind a flag: set one to false to turn it off.

const FEATURES = {
  filter: true,          // "Filter" pill with a native <select> of event types, like the site's
  todayNowPast: true,    // TODAY / NOW labels; past days folded behind "Show past events (n)"
  addToCalendar: true,   // Google Calendar + Apple/Outlook (.ics) per event; subscribe to all in the footer
};

const DATA_URL = 'data/programme.json';
const NARROW_MAX = 736;                    // site breakpoint: @media (max-width: 736px)
const STACK_MAX = 860;                     // below this our own width, four columns at 24px get too cramped
const CLOCK_INTERVAL = 60_000;             // re-evaluate today / now / past every minute
const SITE_HOST = 'chybik-kristof.com';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const root = document.documentElement;
const app = document.getElementById('app');

// Two switches:
//   .narrow  - type size (18px) at the site's 736px breakpoint, from the viewport the reader sees,
//              like the site's html font-size. Embedded, that's the parent page's width (embed-child.js).
//   .stacked - the one-column mobile layout, from the space we actually have (our own width). The site's
//              table copes at 737–1220px by dropping to 16px; we stay at 24px, so we stack below 860px instead.
root.classList.toggle('embedded', window.parent !== window);
let parentWidth = null;
const applyWidth = () => {
  root.classList.toggle('narrow', (parentWidth ?? window.innerWidth) <= NARROW_MAX);
  root.classList.toggle('stacked', window.innerWidth < STACK_MAX);
};
window.ckProgramme = { setViewportWidth(width) { parentWidth = width; applyWidth(); } };
addEventListener('resize', applyWidth);
applyWidth();

// Tiny DOM helper: text is always set as text, never parsed as HTML.
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false && c !== ''));
  return el;
}

const noon = (date) => new Date(`${date}T12:00:00Z`);
const shortDate = (date) => `${WEEKDAYS[noon(date).getUTCDay()]} ${date.slice(8, 10)}.${date.slice(5, 7)}.`;
const longDate = (date) => noon(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

// Wall-clock arithmetic, e.g. ('2026-10-26', '18:00', 90) → { date: '2026-10-26', time: '19:30' }.
function addMinutes(date, time, minutes) {
  const [y, mo, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, hh, mm + minutes)).toISOString();
  return { date: t.slice(0, 10), time: t.slice(11, 16) };
}

// The event's own end, else start + meta.defaultDurationMinutes, else null.
function endOf(e, meta) {
  if (e.end) return { date: e.date, time: e.end };
  return meta.defaultDurationMinutes ? addMinutes(e.date, e.start, meta.defaultDurationMinutes) : null;
}

// Google Calendar's "add event" page, pre-filled. Times are wall-clock with ctz, so no UTC conversion
// is needed in the browser and Google applies the right offset either side of the DST change.
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

// 📅 pill with an invisible native <select> over it, like the site's Filter pill (.btn.select).
// Choosing an option opens that calendar in a new tab, then the menu resets.
// A static .ics file in a new tab is more reliable than a blob download inside an iframe, especially on iOS Safari.
function calendarPicker(googleUrl, icsUrl) {
  const select = h('select', { 'aria-label': 'Add to calendar' },
    h('option', { value: '' }, 'Add to calendar'),
    h('option', { value: googleUrl }, 'Add to Google Calendar'),
    h('option', { value: icsUrl }, 'Add to Apple / Outlook Calendar'),
  );
  select.addEventListener('change', () => {
    const url = select.value;
    select.value = '';
    if (url) window.open(url, '_blank', 'noopener');
  });
  return h('span', { class: 'btn select icon', title: 'Add to calendar' },
    h('span', { class: 'select__label', 'aria-hidden': 'true' }, '📅'), select);
}

function linkTarget(url) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  return host === SITE_HOST ? { target: '_top' } : { target: '_blank', rel: 'noopener' };
}

// Current wall-clock date and time at the venue, e.g. { date: '2026-11-03', time: '18:45' }.
// Never uses the viewer's own time zone. For testing, ?now=2026-11-17T10:30 pretends it's that moment.
function venueNow(timeZone) {
  const override = new URLSearchParams(location.search).get('now');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(override ?? '')) {
    const [date, time] = override.split('T');
    return { date, time };
  }
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

function render(data, updated) {
  const { meta } = data;
  const types = new Map(data.types.map((t) => [t.id, t]));
  const events = [...data.events].sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
  const state = { type: '', showPast: false };
  // webcal:// makes calendar apps subscribe to programme.ics (and keep it updated) rather than import it once.
  const subscribeUrl = new URL('programme.ics', location.href).href.replace(/^https?:/, 'webcal:');

  const cell = (cls, ...content) => {
    const empty = content.flat().every((c) => c == null || c === false || c === '');
    return h('div', { class: `cell sec ${cls}${empty ? ' empty' : ''}` }, ...content);
  };

  const eventItem = (e) => {
    const status = e.status ?? 'scheduled';
    const calendar = FEATURES.addToCalendar && status !== 'cancelled';
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
          FEATURES.todayNowPast && h('span', { class: 'label-now', hidden: true }, ' NOW'),
          hasDetails && [' ', h('span', { class: 'dim toggle', 'aria-hidden': 'true' })],  // nbsp keeps "+" with the last word
        ),
      ),
      cell('people', e.people?.join(', ')),
      cell('type', types.get(e.type)?.label),
    );
    if (!hasDetails) return h('li', attrs, row);

    const register = e.registration && meta.registrationEmail && status !== 'cancelled'
      && h('a', { class: 'btn', href: `mailto:${meta.registrationEmail}?subject=${encodeURIComponent(`Registration: ${e.title}`)}` }, 'Register');
    const calendarMenu = calendar && calendarPicker(googleCalendarUrl(e, meta, types), new URL(`ics/${e.id}.ics`, location.href).href);

    const body = h('div', { class: 'details__body' },
      e.location && h('p', {}, `Location: ${e.location}`),  // only set when it isn't the venue
      (e.description ?? '').split(/\n\s*\n/).filter(Boolean).map((p) => h('p', {}, p)),
      e.links?.length && h('p', { class: 'details__links' },
        e.links.map((l) => h('a', { href: l.url, ...linkTarget(l.url) }, l.label))),
      (register || calendar) && h('p', { class: 'details__actions' }, register, calendarMenu),
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
        FEATURES.todayNowPast && h('span', { class: 'dim label-today', hidden: true }, ' TODAY'),
      ),
    ),
    h('ol', {}, events.filter((e) => e.date === date).map(eventItem)),
  ));

  // Controls: the type filter and the past-events toggle, as pills in the flow (nothing fixed inside an iframe).
  const usedTypes = data.types.filter((t) => events.some((e) => e.type === t.id));
  const filterLabel = h('span', { class: 'select__label' }, 'Filter');
  // null (not false) when a feature is off, so the ?. calls below skip it.
  const filterSelect = FEATURES.filter ? h('select', { 'aria-label': 'Filter by type' },
    h('option', { value: '' }, 'All events'),
    usedTypes.map((t) => h('option', { value: t.id }, `${t.group ?? t.label} ${events.filter((e) => e.type === t.id).length}`)),
  ) : null;
  const pastToggle = FEATURES.todayNowPast ? h('button', { type: 'button', class: 'btn dim', 'aria-expanded': 'false', hidden: true }) : null;
  const controls = (filterSelect || pastToggle) && h('div', { class: 'controls' },
    filterSelect && h('div', { class: 'btn select' }, filterLabel, filterSelect),
    pastToggle,
  );

  app.replaceChildren(
    meta.intro && h('p', { class: 'intro' }, meta.intro),
    controls,
    h('section', { class: 'programme', 'aria-label': meta.title ?? 'Programme' },
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
      FEATURES.addToCalendar && h('p', {}, 'Subscribe to the whole programme: ',
        h('a', { href: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(subscribeUrl)}`, target: '_blank', rel: 'noopener' }, 'Google Calendar'),
        ', ',
        h('a', { href: subscribeUrl }, 'Apple / Outlook'),   // webcal: hands off to the calendar app, like mailto:
        '.'),
      updated && h('p', {}, `Updated ${updated.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: meta.timezone })}`),
    ),
  );

  // Filter, past and now are applied by toggling classes and [hidden] on the rendered rows,
  // so open <details> stay open when the filter changes or the clock ticks.
  const items = [...app.querySelectorAll('.day li')];
  const daySections = [...app.querySelectorAll('.day')];

  function update() {
    const now = venueNow(meta.timezone);
    let pastCount = 0;

    for (const li of items) {
      const { type, date, start, endAt } = li.dataset;
      const past = FEATURES.todayNowPast && date < now.date;
      // NOW runs from the start to the event's end, or start + defaultDurationMinutes. With neither, never.
      const nowAt = `${now.date} ${now.time}`;
      const running = FEATURES.todayNowPast && Boolean(endAt) && `${date} ${start}` <= nowAt && nowAt < endAt;
      const matches = !state.type || type === state.type;
      if (past && matches) pastCount++;
      li.hidden = !matches || (past && !state.showPast);
      li.classList.toggle('is-past', past);
      li.classList.toggle('is-now', running);
      const nowLabel = li.querySelector('.label-now');
      if (nowLabel) nowLabel.hidden = !running;
    }

    for (const day of daySections) {
      const { date } = day.dataset;
      const lis = [...day.querySelectorAll('li')];
      const past = FEATURES.todayNowPast && date < now.date;
      day.hidden = lis.length ? lis.every((li) => li.hidden) : (past && !state.showPast);
      day.classList.toggle('is-past', past);
      const today = day.querySelector('.label-today');
      if (today) today.hidden = date !== now.date;
    }

    if (pastToggle) {
      pastToggle.hidden = pastCount === 0;
      pastToggle.textContent = state.showPast ? 'Hide past events' : `Show past events (${pastCount})`;
      pastToggle.setAttribute('aria-expanded', String(state.showPast));
    }
  }

  filterSelect?.addEventListener('change', () => {
    state.type = filterSelect.value;
    filterLabel.textContent = state.type ? (types.get(state.type).group ?? types.get(state.type).label) : 'Filter';
    update();
  });
  pastToggle?.addEventListener('click', () => {
    state.showPast = !state.showPast;
    update();
  });

  update();
  if (FEATURES.todayNowPast) setInterval(update, CLOCK_INTERVAL);
}

async function load() {
  try {
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const modified = res.headers.get('last-modified');
    render(data, modified ? new Date(modified) : null);
  } catch (err) {
    console.error('Programme failed to load:', err);
    app.replaceChildren(h('p', { class: 'dim' }, 'The programme could not be loaded. Please reload the page.'));
  }
}

load();
