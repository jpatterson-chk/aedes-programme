# Reference notes

Captured from https://chybik-kristof.com/ by `scripts/capture-reference.mjs` (see `computed.json` for raw values, `screens/` for full-page shots, `css/index-fabe6ffa.css` for the source).

## Global

From `html` in the site CSS:

| Token | Value |
|---|---|
| font | `Arial, sans-serif`, weight 400 (also on `h1–h3`) |
| root size | `24px`; `18px` at `max-width: 736px` |
| line-height | `1.2` |
| `--text-color` | `black` |
| `--dim-color` | `#808080` (also written as `gray`) |
| `--background-color` | `#F5F5F5` |
| page gutter | `.6rem` (14.4px desktop, 10.8px mobile): `nav`, `.primitive.text` padding |
| links | no underline, `color: inherit`, `opacity: .6`, `opacity: 1` on hover |

Key breakpoints: **736/737px** (mobile vs desktop: root size, table layout, pill size), **768px** (`.primitive.text` gets `max-width: 75vw`), **737–1220px** (projects table drops to 16px).

## "Other projects" table (`#c-other-projects`)

Markup: `section.table > .table__heading > h2.row.heading > .cell×5`, then `.table__body > .row > .cell×5`, then `button.table__expand` ("View more" + `span.dim` "+"). Empty cells are `div.cell.empty`. The row number is `[data-index]:before { content: attr(data-index) " "; color: gray }` on the first cell.

### Desktop (≥737px)

- Section padding `0 .3rem`; cells padding `0 .3rem` (so text starts at .6rem).
- Section colour `--dim-color`; first cell `--text-color`.
- `.row` is a grid: `2fr 1fr 1fr 1.25fr .75fr`. Last cell right-aligned.
- Cells `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` (no wrapping, ever).
- Heading row: `1rem` (24px), margin `5vh 0` (45px at 900px tall). Title black, labels grey.
- Body rows: `padding: .21em 0`, no margin, no rules. Row pitch 38.9px at 1440.
- Font size: **24px at ≥1221px, 16px at 737–1220px** (`font-size: 16px !important`); the heading stays 24px.
- "View more +" sits `5vh` below. The paged body has a 12vh fade to the background colour at the bottom.

| Width | Row size | Row pitch | Column x (px) |
|---|---|---|---|
| 1440 | 24 / 28.8 | 38.9 | 7.2 · 482.4 · 720 · 957.6 · 1254.6 |
| 1024 | 16 / 19.2 | 25.9 | 7.2 · 343.7 · 512 · 680.3 · 890.6 |
| 768 | 16 / 19.2 | 25.9 | 7.2 · 258.4 · 384 · 509.6 · 666.6 |

### Mobile (≤736px)

- Root 18px. Section padding `0 .6rem`.
- Heading: only the title shows, at `2.6667em` (48px); column labels are hidden.
- Each row is a block with `margin: 1.2rem 0` (row pitch 64.8px).
- First cell (number + title) on its own line; the other cells are `inline-block` and follow on line 2, joined by a `,` (`.cell + .cell:not(:last-child):after`). Empty cells are hidden.
- **Line 2 is black, not grey.** The grey `--dim-color` on the section applies only on desktop. The number stays grey.

## Pills (`.btn`)

- Black background, white text, `font-size: 1rem`, `height` / `line-height: 2rem`, `border-radius: 1rem`, `padding: 0 .8rem`, no border.
- Mobile: `height` / `line-height: 2.6667rem` (48px), `border-radius: 1.3333rem`, `padding: 0 1.0667rem`.
- Variants: `.btn.dim` (grey background, e.g. "Back to top"), `.btn.inverse` (white bg, black text).
- **Filter precedent.** The homepage's fixed bottom bar (`.sub-nav`) has a `.btn.select` pill labelled "Filter". It wraps an invisible native `<select>` (options like "Cultural 21", label + count). Filtered rows get `display: none`.

## Breadcrumb (`nav`)

Uppercase, grey (`--dim-color`), padding `.6rem`, sticky. Links black. Operators (`+`, `=`, `;`) are `span.op` in grey. Example: `CHYBÍK + KRIŠTOF = ARCHITECTS`.

## CMS text block (where the iframe will sit)

- `.primitive.text { padding: .6rem }`, and `max-width: 75vw` at ≥768px. Appendix A of the plan shows embeds are wrapped in `div.primitive.text`.
- `/programme-test/` is still empty, so the real column is **not measured yet**. Re-run the capture after pasting the snippet.

## Implications for the embed

1. **Iframe width ≠ viewport width.** Media queries inside the iframe see the iframe's width. At a 1024px window the column is about 740px (75vw − padding), so a plain `max-width: 736px` query would wrongly switch to the 18px mobile type while the page around it is 24px. The parent needs to tell the child the real viewport width; the hello/height handshake can carry it.
2. **The 16px mid-range rule** is specific to `#c-other-projects` at 737–1220px. Decide whether the programme copies it (consistent with the projects table) or stays 24px (consistent with the CMS text around it).
3. **Nothing fixed inside the iframe.** The site's `.sub-nav` pill bar is `position: fixed` to the window, which won't work inside an auto-height iframe. A filter pill has to sit in the flow, e.g. above the table.
4. **The `.dim` "+"** on "View more" is the model for "Show past events +".
