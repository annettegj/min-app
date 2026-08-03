# Design & Styling System

How the app looks, and how to change it. The goal of this doc is that someone non-expert can
confidently tweak colours, rounding, and hover behaviour without hunting through the code.

## How styling works here

- The UI is **inline-styled React** (`style={{ ... }}` on elements in `app/page.tsx`), not a CSS
  framework for components. Tailwind is installed but used only for a bit of layout (grid/flex).
- A few **global rules** live in `app/globals.css` — these apply to every element of a kind at once
  (e.g. all buttons). This is where site-wide behaviour like hover and default rounding is defined.
- The look is deliberately **flat and calm**: a dark navy header, one teal accent, neutral greys,
  and status colours (green/amber/red) used sparingly.

## Colour palette

The palette is defined once as **CSS variables** in `app/globals.css` (`:root`):

| Variable | Value | Used for |
|---|---|---|
| `--header` | `#0C1C2E` | Top bar / darkest navy, card header bars |
| `--accent` | `#0891B2` | Teal — primary buttons, links, the accent line under the header |
| `--accent-hover` | `#0670A0` | Deeper teal for hover/active |
| `--accent-light` | `#38BDF8` | Lighter cyan for highlights |
| `--ink` | `#334155` | Strong body text |
| `--muted` | `#64748B` | Secondary / dimmed text |
| `--border` | `#CBD5E1` | Borders, dividers |
| `--surface` | `#F1F5F9` | Light raised surfaces |
| `--page` | `#F4F5FA` | Page background |
| `--success` | `#15803D` | Positive / early-mover |
| `--warning` | `#B45309` | Caution |
| `--danger` | `#DC2626` | Destructive actions |

**Design rule that keeps it looking finished:** keep **teal as the only strong accent** — use the
neutrals for everything secondary, and the status colours only for status. Adding more accent
colours makes it look busy.

> **These variables are wired up:** the palette colours are referenced as `var(--name)` throughout
> `page.tsx`, so **changing a variable's value in `globals.css` recolours the whole app** — one place,
> no search-and-replace. A few one-off shades (some specific text greys, badge backgrounds, and a
> couple of lowercase hex values) are still hard-coded; promote them into the palette if you find you
> need to theme them too.

## Buttons — the hierarchy

Three roles, so the eye knows what matters. Two are shared style objects at the top of `page.tsx`:

- **Primary** (`btnPrimary`) — filled teal. The **one** main action on a screen (e.g. *Find
  Companies*, *Search for New Companies*, *Save*).
- **Secondary** (`btnSecondary`) — white with a grey border. Supporting actions (e.g. *Show All*,
  *Export as Excel*, *Cancel*, *Clear Results*).
- **Destructive** — red (`--danger`). Only for *Delete from the company database*.

To restyle all primary or secondary buttons at once, edit `btnPrimary` / `btnSecondary` in
`page.tsx`. To add a shared danger button style, add a `btnDanger` object next to them.

## Hover

Every button gets the same hover feedback from **one global rule** in `globals.css`:

```css
button:not(:disabled):hover { filter: brightness(0.87); }
```

`brightness()` darkens whatever colour the button already is, so it works for teal, white, red, and
grey alike. **To make hover stronger, lower the number** (e.g. `0.82`); to make it subtler, raise it
(e.g. `0.92`). Disabled buttons are excluded so locked/placeholder controls don't react.

## Rounded corners

Corners are **4px** everywhere, for a soft-but-not-bubbly look:

- **Buttons:** a global rule in `globals.css` (`button { border-radius: 4px; }`), plus `borderRadius: 4`
  in the shared button styles and on a few standalone buttons.
- **Boxes / cards:** each white card has `borderRadius: 4` and `overflow: "hidden"` inline (the
  `overflow: hidden` clips the dark header bar to the rounded corner).
- **Inputs / selects:** `borderRadius: 4` via the shared `inputStyle` in `page.tsx`.

**To change the roundness:** edit the value in the `globals.css` button rule **and** the inline
`borderRadius` values (search `borderRadius:` in `page.tsx`). Note a radius reads more strongly on
small elements than large ones — 4px looks clearly rounded on a small button but subtle on a big
card.

## Boxes / cards

The standard card is a white container with a dark header strip:

```
background: #FFFFFF; border: 1px solid #D0D5E8; borderRadius: 4; overflow: hidden;
  └─ header strip:  background: #0C1C2E (navy), white title text
```

Keeping `overflow: hidden` on the card is what makes the square-cornered header strip clip neatly to
the rounded card.

## Quick "how do I…" reference

- **Change the accent colour** → update `--accent` in `globals.css`. That's it — it recolours every
  teal element across the app.
- **Make everything more/less rounded** → change `border-radius` in the `globals.css` button rule and
  the inline `borderRadius: 4` values in `page.tsx`.
- **Make hover stronger/weaker** → change the `brightness()` value in `globals.css`.
- **Add a new button** → spread `btnPrimary` or `btnSecondary`: `style={{ ...btnSecondary, padding: "…" }}`.
  It automatically gets the shared hover and rounding.
