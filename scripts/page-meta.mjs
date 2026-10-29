// Page-level facts shared by the prerendered head (prerender.mjs) and the structured data (jsonld.mjs).

import { isRecommended } from '../site/render.js';

export const PAGES_URL = 'https://jpatterson-chk.github.io/aedes-programme/';
export const ORGANIZER = { name: 'CHYBÍK + KRIŠTOF', url: 'https://chybik-kristof.com/' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayMonth = (date) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

export const venueName = (meta) => meta.defaultLocation.split(',')[0].trim();

// "Building the Existing City: programme | CHYBÍK + KRIŠTOF at Aedes, Berlin"
export function pageTitle(data) {
  return `${data.meta.title}: programme | ${ORGANIZER.name} at ${data.meta.defaultLocationShort ?? venueName(data.meta)}, Berlin`;
}

// "Events programme for …, an exhibition by … at Aedes – Architecture and Space, Berlin, 22 Oct – 3 Dec 2026: lectures, … Free entry. …"
export function pageDescription(data) {
  const { meta } = data;
  const groups = data.types.filter((t) => data.events.some((e) => e.type === t.id && !isRecommended(e))).map((t) => (t.group ?? t.label).toLowerCase());
  const range = `${dayMonth(meta.startDate)} – ${dayMonth(meta.endDate)} ${meta.endDate.slice(0, 4)}`;
  return `Events programme for ${meta.title}, an exhibition by ${ORGANIZER.name} at ${venueName(meta)}, Berlin, ${range}: ${groups.join(', ')}.${meta.footer ? ` ${meta.footer}` : ''}`;
}
