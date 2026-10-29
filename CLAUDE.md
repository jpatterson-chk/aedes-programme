# CLAUDE.md

Exhibition programme for Chybík + Krištof at Aedes, Berlin (22 Oct – 3 Dec 2026). A static page on GitHub Pages, embedded into chybik-kristof.com via an iframe. Full spec: `PLAN.md` (local only, git-ignored; ask for it if it's missing).

## Editing the programme

- Programme changes touch `site/data/programme.json` only.
- Never rename an existing `id`. It is used for anchors and `.ics` filenames.
- Cancel events with `"status": "cancelled"`; do not delete them. Use `"note"` for a short public line, e.g. "Moved from 12 Nov".
- Times are 24-hour `HH:MM` wall-clock time in Berlin. Never convert time zones.
- `description` is plain text; separate paragraphs with a blank line (`\n\n`). No HTML.
- Never invent missing details (times, names, descriptions). Ask instead.
- Preserve accents in Czech names exactly as written (Chybík, Krištof, Ondřej).
- Private, invitation-only events (press lunches, supper clubs) are never added to the public programme.
- `"registration": true` adds a "Register" button. With `"registrationForm": "<Tally form id>"` (the part after `tally.so/r/`) it opens that event's Tally form inline; without one it falls back to a mailto link to `meta.registrationEmail` with the subject "Registration: <title>". Don't put registration emails or form links in descriptions.
- One Tally form per event, named "Registration: <title>", on the berlin@chybik-kristof.com Tally account (free plan: submissions are emailed to that address). Never reuse a form for two events, and never make forms for private events.
- Each Tally form repeats its event's title, date, time and place (header and thank-you screen). When any of those change for an event with a `registrationForm`, update its Tally form too, and say so in the summary.
- Each Tally form ends with a privacy notice linking to `site/privacy.html` (deployed at `/privacy.html`). If the forms' fields, who receives submissions, or the retention period change, update that page too.
- `"missing"` lists details still to be confirmed (e.g. `["end time", "speaker"]`). It isn't shown on the page. Remove items as they get confirmed; never fill a gap with a guess.
- Events elsewhere that the studio recommends ("CHYBÍK + KRIŠTOF = ARCHITECTS recommend", e.g. ARCHINT at BHROX) use `"type": "recommended"` with their own `"location"`. They show greyed out and stay out of the exhibition's JSON-LD. No registration or Tally form for them.
- `"themes"` uses the ids in `themes` (play, live, adapt, activate). The filter uses `type` only.
- Always run `node scripts/validate.mjs` before committing. It prints the outstanding "to be confirmed" list too.
- Then: show the diff, commit with a descriptive message (e.g. "Move 12 Nov screening to 19:00"), push.

## Building the page

- Plain HTML + CSS + vanilla JS. No framework, no runtime dependencies. Playwright is dev-only. The one exception is Tally's `embed.js`, which `app.js` loads only when a registration form is first opened (it sizes the form); the form still works without it.
- Style tokens in `site/styles.css` come from `reference/computed.json` only. No guessed values.
- Work phase by phase (PLAN.md §12) and stop for review at the end of each phase.
- Items marked **TODO (designer)** in PLAN.md need the designer's input. Ask instead of guessing.
- Dark mode copies the site's rule: `html.dark` from 21:00 to 07:59 local time, set by an inline script in the `<head>` of `index.html` and `privacy.html`. Dark tokens live in the `html.dark` block in `styles.css` (values from `html.dark` in `reference/css`). Keep `color-scheme: light`. Preview it with `?theme=dark` (also works on the dev harness).
- `reference/` is not deployed but the repo is public; source documents there are git-ignored.
- All markup comes from `site/render.js` (an HTML string, no DOM). The build prerenders it into `index.html`, with schema.org JSON-LD (`scripts/jsonld.mjs`), so crawlers and AI tools can read the page without scripts; `app.js` re-renders from fresh data. Change markup in `render.js` only, and keep `npm run test:build` passing.
- `meta.publicUrl` is the public CMS page (`https://chybik-kristof.com/aedes-programme/`). `embed/cms-jsonld.html` can't go in a CMS text block (it breaks the CMS); it's only for the developer to add to the page head, regenerated with `node scripts/cms-snippets.mjs`.
