// schema.org structured data (JSON-LD) for the programme: one ExhibitionEvent with an Event per entry.
// Search engines and AI tools read this to show and quote events (name, time, place, free entry).
// Generated from programme.json at build time by prerender.mjs; never edited by hand.

import { endOf } from '../site/render.js';
import { isoWithOffset } from './ics.mjs';
import { ORGANIZER, PAGES_URL, pageDescription, venueName } from './page-meta.mjs';

const OFFLINE = 'https://schema.org/OfflineEventAttendanceMode';
const STATUS = {
  scheduled: 'https://schema.org/EventScheduled',
  cancelled: 'https://schema.org/EventCancelled',
  changed: 'https://schema.org/EventRescheduled',
};

// "Aedes – Architecture and Space, Christinenstrasse 18–19, 10119 Berlin" → Place with a PostalAddress.
function venuePlace(meta) {
  const [, street, cityLine] = meta.defaultLocation.split(',').map((s) => s.trim());
  const [, postalCode, locality] = cityLine?.match(/^(\d{4,5})\s+(.+)$/) ?? [];
  return {
    '@type': 'Place',
    name: venueName(meta),
    address: street && postalCode
      ? { '@type': 'PostalAddress', streetAddress: street, postalCode, addressLocality: locality, addressCountry: 'DE' }  // Berlin venue
      : meta.defaultLocation,
  };
}

const organizer = { '@type': 'Organization', name: ORGANIZER.name, url: ORGANIZER.url };

export function programmeJsonLd(data) {
  const { meta } = data;
  const tz = meta.timezone;
  const venue = venuePlace(meta);
  const pageUrl = meta.publicUrl ?? PAGES_URL;
  const types = new Map(data.types.map((t) => [t.id, t]));
  const events = [...data.events].sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));

  const subEvent = events.map((e) => {
    const end = endOf(e, meta);
    const type = types.get(e.type)?.label ?? '';
    const description = [
      e.people?.length && `With ${e.people.join(', ')}.`,
      e.description ?? `${type[0]?.toUpperCase() ?? ''}${type.slice(1)} at ${venueName(meta)}.`,
    ].filter(Boolean).join(' ');
    return {
      '@type': 'Event',
      name: e.title,
      description,
      startDate: isoWithOffset(e.date, e.start, tz),
      ...(end && { endDate: isoWithOffset(end.date, end.time, tz) }),
      eventStatus: STATUS[e.status ?? 'scheduled'],
      eventAttendanceMode: OFFLINE,
      location: e.location ? { '@type': 'Place', name: e.location, address: e.location } : venue,
      organizer,
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: `${pageUrl}#${e.id}` },
      url: `${pageUrl}#${e.id}`,
    };
  });

  return {
    '@context': 'https://schema.org',
    '@type': 'ExhibitionEvent',
    name: meta.title,
    description: pageDescription(data),
    startDate: meta.startDate,
    endDate: meta.endDate,
    eventStatus: STATUS.scheduled,
    eventAttendanceMode: OFFLINE,
    location: venue,
    organizer,
    isAccessibleForFree: true,
    url: pageUrl,
    subEvent,
  };
}

// As a <script> tag; "<" is escaped so text in the data can never close the tag early.
export const jsonLdScript = (obj) =>
  `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
