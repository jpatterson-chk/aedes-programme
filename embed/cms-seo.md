# CMS page: text and snippets for search engines

Paste these on the public programme page (https://chybik-kristof.com/aedes-programme/), around the iframe from `cms-snippet.html`. Text in the CMS page itself is the only programme content that counts for chybik-kristof.com in search; the iframe's content is credited to the github.io page.

Copy taken from the final programme (22 Oct 2026). Check it before publishing.

## 1. Text block above the iframe

> **Building the Existing City**
> 22 October – 3 December 2026
> Aedes – Architecture and Space, Christinenstrasse 18–19, 10119 Berlin
>
> For six weeks, CHYBÍK + KRIŠTOF run an open studio at Aedes, investigating four sites in Berlin through the themes PLAY, LIVE, ACTIVATE and ADAPT. Open Studio: Monday to Friday, 09:00–17:00.
>
> The public programme brings guest lectures by 51N4E, Amin Taha (GROUPWORK), NP2F, Space Popular and Adam Štěch, a conversation between Aileen Iverson and Ralf Pasel, film screenings on Czech and Czechoslovak architecture, family workshops and weekly Archi Breakfasts. Free entry to all events.

## 2. Link under the iframe

A plain link that crawlers can follow to the full programme page:

```html
<p><a href="https://jpatterson-chk.github.io/aedes-programme/" target="_blank" rel="noopener">Open programme in a new tab</a></p>
```

## 3. Structured data (optional, test once)

Paste the contents of `cms-jsonld.html` into a text block, then ask for the live page to be checked: the CMS may strip `<script>` tags. If it does, leave it out; the programme page carries the full event data either way.

Regenerate it after changing the exhibition name, dates or venue with `node scripts/cms-snippets.mjs`.
