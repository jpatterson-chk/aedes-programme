// Fetch, sort, group, render, filter, now/today.
// Nice-to-haves (phase 4) are each behind a flag below.

const FEATURES = {
  filter: false,
  todayNowPast: false,
  addToCalendar: false,
};

const DATA_URL = 'data/programme.json';
const NARROW_MAX = 736;                    // site breakpoint: @media (max-width: 736px)
const SITE_HOST = 'chybik-kristof.com';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const root = document.documentElement;
const app = document.getElementById('app');

// Two switches, both at the site's 736px breakpoint:
//   .narrow  - type size (18px), from the viewport the reader sees, like the site's html font-size.
//              Embedded, that's the parent page's width, reported by embed-child.js.
//   .stacked - the one-column mobile layout, from the space we actually have (the iframe's own width),
//              so a 576px CMS column on a 768px screen stacks at 24px instead of squeezing four columns.
root.classList.toggle('embedded', window.parent !== window);
let parentWidth = null;
const applyWidth = () => {
  root.classList.toggle('narrow', (parentWidth ?? window.innerWidth) <= NARROW_MAX);
  root.classList.toggle('stacked', window.innerWidth <= NARROW_MAX);
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

function linkTarget(url) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  return host === SITE_HOST ? { target: '_top' } : { target: '_blank', rel: 'noopener' };
}

function render(data, updated) {
  const { meta } = data;
  const types = new Map(data.types.map((t) => [t.id, t]));
  const events = [...data.events].sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));

  const cell = (cls, ...content) => {
    const empty = content.flat().every((c) => c == null || c === false || c === '');
    return h('div', { class: `cell sec ${cls}${empty ? ' empty' : ''}` }, ...content);
  };

  const eventItem = (e) => {
    const status = e.status ?? 'scheduled';
    const hasDetails = Boolean(e.description || e.links?.length || e.registration || e.location);

    const row = h('div', { class: 'row' },
      // .lead is display: contents on desktop (two grid cells) and one line on mobile ("18:30 Title").
      h('div', { class: 'lead' },
        h('div', { class: 'cell time' }, h('time', { datetime: `${e.date}T${e.start}` }, e.start)),  // start only; "end" is kept for calendar/now features
        h('div', { class: 'cell name' },
          h('span', { class: 'title' }, e.title),
          status === 'cancelled' && [' ', h('span', { class: 'dim status' }, 'CANCELLED')],
          status !== 'scheduled' && e.note && [' ', h('span', { class: 'dim note' }, e.note)],
          hasDetails && [' ', h('span', { class: 'dim toggle', 'aria-hidden': 'true' })],  // nbsp keeps "+" with the last word
        ),
      ),
      cell('people', e.people?.join(', ')),
      cell('type', types.get(e.type)?.label),
    );
    if (!hasDetails) return h('li', { id: e.id, class: status, 'data-type': e.type }, row);

    const body = h('div', { class: 'details__body' },
      e.location && h('p', {}, `Location: ${e.location}`),  // only set when it isn't the venue
      (e.description ?? '').split(/\n\s*\n/).filter(Boolean).map((p) => h('p', {}, p)),
      e.links?.length && h('p', { class: 'details__links' },
        e.links.map((l) => h('a', { href: l.url, ...linkTarget(l.url) }, l.label))),
      e.registration && meta.registrationEmail && status !== 'cancelled' && h('p', {},
        h('a', { class: 'btn', href: `mailto:${meta.registrationEmail}?subject=${encodeURIComponent(`Registration: ${e.title}`)}` }, 'Register')),
    );
    return h('li', { id: e.id, class: status, 'data-type': e.type },
      h('details', {}, h('summary', {}, row), h('div', { class: 'details' }, body)));
  };

  // Each day: the date once on its own line (plus any dayLabel), then one <ol> of its events.
  const dates = [...new Set([...events.map((e) => e.date), ...Object.keys(data.dayLabels ?? {})])].sort();
  const days = dates.map((date) => h('section', { class: 'day', 'aria-labelledby': `day-${date}` },
    h('h3', { class: 'row day__date', id: `day-${date}` },
      h('div', { class: 'cell' },
        h('time', { datetime: date, 'aria-label': longDate(date) }, shortDate(date)),
        data.dayLabels?.[date] && [' ', h('span', { class: 'dim' }, data.dayLabels[date])],
      ),
    ),
    h('ol', {}, events.filter((e) => e.date === date).map(eventItem)),
  ));

  app.replaceChildren(
    meta.intro && h('p', { class: 'intro' }, meta.intro),
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
      updated && h('p', {}, `Updated ${updated.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: meta.timezone })}`),
    ),
  );
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
