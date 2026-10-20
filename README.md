# Exhibition programme

The events programme for the Chybík + Krištof exhibition at Aedes – Architecture and Space, Berlin, embedded on chybik-kristof.com.

> **Status:** under construction.

Live page: https://jpatterson-chk.github.io/aedes-programme/

## Updating the programme

Everything lives in one file: [`site/data/programme.json`](site/data/programme.json).

### Quick fix from anywhere

1. Open `site/data/programme.json` on github.com and click the pencil icon.
2. Make the change and click **Commit changes**.
3. Wait 1–2 minutes. The change is checked automatically and goes live.

If the commit gets a red ✗, **nothing changed on the live page**. Open the run log (Actions tab) to see which event and field is wrong, fix it and commit again.

### Rules

- Each event is one `{ … }` block. Order doesn't matter, but keep it chronological for readability.
- Times are 24-hour Berlin time, e.g. `"18:30"`. Dates are `"2026-11-03"`.
- **Don't delete cancelled events.** Set `"status": "cancelled"` instead, so they show struck through.
- For a changed event, set `"status": "changed"` and add a short `"note"`, e.g. `"Moved from 12 Nov"`.
- Never change an event's `"id"` once it is published.
- Descriptions are plain text. A blank line (`\n\n`) starts a new paragraph.
- Links must start with `https://`.
- `"registration": true` shows a "Register" link that opens an email to berlin@chybik-kristof.com, with the subject "Registration: <event title>".
- `"missing": ["end time", "speaker"]` notes details still to be confirmed. It isn't shown on the page. The validator lists all of them, so delete each item once it's filled in.
- Private, invitation-only events (press lunches, supper clubs) don't go in this file. Nor do partner events elsewhere: only our own programme.
- Only start times are shown on the page. `"end"` is optional and isn't displayed. Calendar entries use it when it's there; otherwise they last `meta.defaultDurationMinutes` (90).

### Via an AI agent

Ask for the change in plain language, e.g. "Move the 12 Nov screening to 19:00 and mark the 20 Nov workshop as cancelled." The agent follows the rules in [CLAUDE.md](CLAUDE.md): it edits only `programme.json`, runs the validator, shows you the diff, then commits and pushes.

## Development

```sh
npm run validate      # check programme.json, list details still to be confirmed
npm test              # check the validator catches broken data, and the .ics calendar files
npm run serve         # programme on :8000, CMS-like harness on http://localhost:8001/dev/embed-test.html
npm run test:embed    # Playwright: auto-height, layout, filter, past/now and fallback in the harness (stop `serve` first)
```

To see the programme as it will look on a given day, add `?now=2026-11-17T10:30` to the page or harness address.

Features can be switched off one by one at the top of `site/render.js` (`FEATURES`): the type filter, today / now / past, and add to calendar.
