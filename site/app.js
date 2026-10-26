// Browser side of the programme: layout switches, fresh data, filter / today / now / past.
// The markup itself comes from render.js, which the build also uses to prerender index.html,
// so the page reads fine before (or without) this script. Feature flags live in render.js.

import { FEATURES, renderProgramme } from './render.js';

const DATA_URL = 'data/programme.json';
const NARROW_MAX = 736;                    // site breakpoint: @media (max-width: 736px)
const STACK_MAX = 860;                     // below this our own width, four columns at 24px get too cramped
const CLOCK_INTERVAL = 60_000;             // re-evaluate today / now / past every minute
const TALLY_SCRIPT = 'https://tally.so/widgets/embed.js';
const FORM_HEIGHT = 600;                   // registration form before Tally sizes it (or for good, if its script fails)

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

// Filter, past and now are applied by toggling classes and [hidden] on the rendered rows, reading
// everything from the markup (data-* attributes), so it works on the prerendered page as well and
// open <details> stay open when the filter changes or the clock ticks.
const state = { type: '', showPast: false };

function update() {
  const programme = app.querySelector('.programme');
  if (!programme) return;
  const now = venueNow(programme.dataset.timezone);
  const nowAt = `${now.date} ${now.time}`;
  let pastCount = 0;

  for (const li of app.querySelectorAll('.day li')) {
    const { type, date, start, endAt } = li.dataset;
    const past = FEATURES.todayNowPast && date < now.date;
    // NOW runs from the start to the event's end, or start + defaultDurationMinutes. With neither, never.
    const running = FEATURES.todayNowPast && Boolean(endAt) && `${date} ${start}` <= nowAt && nowAt < endAt;
    const matches = !state.type || type === state.type;
    if (past && matches) pastCount++;
    li.hidden = !matches || (past && !state.showPast);
    li.classList.toggle('is-past', past);
    li.classList.toggle('is-now', running);
    const nowLabel = li.querySelector('.label-now');
    if (nowLabel) nowLabel.hidden = !running;
  }

  for (const day of app.querySelectorAll('.day')) {
    const { date } = day.dataset;
    const lis = [...day.querySelectorAll('li')];
    const past = FEATURES.todayNowPast && date < now.date;
    day.hidden = lis.length ? lis.every((li) => li.hidden) : (past && !state.showPast);
    day.classList.toggle('is-past', past);
    const today = day.querySelector('.label-today');
    if (today) today.hidden = date !== now.date;
  }

  const pastToggle = app.querySelector('.past-toggle');
  if (pastToggle) {
    pastToggle.hidden = pastCount === 0;
    pastToggle.textContent = state.showPast ? 'Hide past events' : `Show past events (${pastCount})`;
    pastToggle.setAttribute('aria-expanded', String(state.showPast));
  }
}

// Registration forms (Tally). Register opens the event's form inline, in its .register-form, and closes it again.
// Tally's script is the one runtime dependency, loaded only when a form is first opened: it sizes the form to
// its content (iframe-resizer inside), #app grows, and embed-child.js passes the new height on to the CMS page.
// If the script fails, the form still loads at FORM_HEIGHT and scrolls inside its frame.
let tallyScript = null;
const loadTally = () => (tallyScript ??= new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = TALLY_SCRIPT;
  s.onload = resolve;
  s.onerror = reject;
  document.head.append(s);
}));

function toggleForm(button) {
  const box = document.getElementById(button.getAttribute('aria-controls'));
  const open = box.hidden;
  box.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
  if (!open || box.firstElementChild) return;

  const iframe = document.createElement('iframe');
  iframe.title = `Registration: ${button.closest('li').querySelector('.title').textContent}`;
  iframe.width = '100%';
  iframe.height = String(FORM_HEIGHT);
  iframe.dataset.tallySrc = box.dataset.tallySrc;
  box.append(iframe);
  loadTally()
    .then(() => window.Tally.loadEmbeds())
    .catch(() => { if (!iframe.src) iframe.src = iframe.dataset.tallySrc; });
}

// Event wiring by delegation, so it survives the re-render from fresh data.
app.addEventListener('change', (e) => {
  const select = e.target;
  if (select.matches('.filter select')) {
    state.type = select.value;
    select.previousElementSibling.textContent = select.selectedOptions[0]?.dataset.label ?? 'Filter';
    update();
  } else if (select.matches('.calendar-picker select')) {
    const url = select.value;
    select.value = '';
    if (url) window.open(url, '_blank', 'noopener');
  }
});
app.addEventListener('click', (e) => {
  const register = e.target.closest('.register[aria-controls]');
  if (register) {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;   // ⌘/Ctrl/Shift-click: the form's own page in a new tab or window
    e.preventDefault();
    toggleForm(register);
    return;
  }
  if (!e.target.closest('.past-toggle')) return;
  state.showPast = !state.showPast;
  update();
});

// Re-render from fresh data (programme.json?t= bypasses the CDN cache, so edits show as soon as they deploy).
// If that fails, the prerendered programme stays in place.
async function load() {
  try {
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const modified = res.headers.get('last-modified');
    app.innerHTML = renderProgramme(data, {
      features: FEATURES,
      updated: modified ? new Date(modified) : null,
      baseUrl: new URL('.', location.href).href,
    });
  } catch (err) {
    console.error('Programme failed to load:', err);
    if (!app.querySelector('.programme')) {
      app.innerHTML = '<p class="dim">The programme could not be loaded. Please reload the page.</p>';
    }
  }
  update();
  if (FEATURES.todayNowPast) setInterval(update, CLOCK_INTERVAL);
}

load();
