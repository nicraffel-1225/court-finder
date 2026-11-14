# Court Finder: design guide

Agreed 14 November 2026. The visual mockups are on Nic's design canvas:
https://claude.ai/artifact/Q3rWMHdw4T5k5JFXA1iHqN (logo board, desktop page, phone page).
This file is the spec to build from; the canvas is the picture of it.

The page does one job: answer "where can I play, and when?" at a glance, then send
Nic to the venue's own booking page in one click.

## Logo

- `public/logo.svg`: the full "half court" icon (a half tennis court seen from above,
  net at the top, one service box filled ball-yellow = a free spot). Use it in the header
  at 36–40px next to the wordmark "Court Finder".
- `app/icon.svg`: a simplified version for the browser tab. Next.js picks this up
  automatically as the favicon; delete the default `app/favicon.ico` so it doesn't win.
- In the green header, draw the icon without its own green square (the header is
  already green): the same lines and yellow box on the header background. Inline the SVG
  for this, copying the paths from `public/logo.svg` and dropping the `<rect>` background.

## Colour tokens

Define these as CSS variables in `app/globals.css` and use only these:

| Token | Hex | Use |
|---|---|---|
| `--court` | `#1E4D3A` | Header background, selected day, links |
| `--ball` | `#D9F03A` | ONLY free, bookable slots and the main "Book" button |
| `--ball-hover` | `#C3DA1E` | Hover on anything yellow |
| `--line` | `#FAFBF7` | Page background, text on green |
| `--card` | `#FFFFFF` | Cards |
| `--taken` | `#E3E7E0` | Taken slots, dividers |
| `--rule` | `#D5DBD3` | Card borders, unselected button borders |
| `--ink` | `#13201A` | Body text |
| `--muted` | `#4D5B53` | Secondary text (passes 4.5:1 on `--line` and `--card`) |
| `--on-green-muted` | `#CFE0D6` | Secondary text on the green header |

Rule: yellow means "you can book this". Never use it for decoration.
No purple anywhere (green and purple together is Wimbledon's registered colour mark).
Drop the dark-mode block in globals.css; the site has one light theme.

## Typography

- One family: **Archivo**, loaded with `next/font/google` as a variable font with the
  width axis: `Archivo({ subsets: ["latin"], axes: ["wdth"], display: "swap" })`.
  Put its className / CSS variable on `<html>` in `app/layout.tsx`. Remove Arial.
- Display (venue names, the next-free headline, wordmark): weight 800, `font-stretch: 70%–75%`,
  `letter-spacing: -0.01em`, line-height ~1.02.
- Body: weight 400–650, normal width, 15–17px.
- Times and dates: `font-variant-numeric: tabular-nums` so columns line up.
- Sentence case everywhere. No ALL-CAPS labels.

## Page layout (top to bottom)

Max content width 1200px, side padding 32px desktop / 16px phone.

1. **Header** (full-width green bar): logo + "Court Finder" on the left. On the right,
   "Times checked at 14:52" (the time the page was rendered, Europe/London) and a
   "Check again" button that reloads the page. On phones the button becomes a 44px
   round icon button with a refresh icon and `aria-label="Check times again"`.

2. **Next free court** (the headline): a small muted line "Next free court near W4 and W6",
   then a big display line such as "Today at 16:00, Ravenscourt Park Court 1"
   (use "Today", "Tomorrow", else the weekday name), and a yellow pill button
   "Book on LTA Play" (or "Book on ProAgenda") linking to that venue's booking page.
   If nothing is free in the next 8 days: "Nothing free in the next 8 days".
   This is the earliest free slot across ALL live venues, ignoring the filters below.

3. **Day strip**: 8 buttons in one row (today + 7), each showing "Today"/weekday,
   the date number large, and "12 free" / "None free" for that day under the current
   time filter. The selected day is filled `--court` with white text; others are white
   with a `--rule` border. Real `<button>`s with `aria-pressed`. On phones the strip
   scrolls sideways (72px-wide buttons).

4. **Time-of-day chips**: "Any time" (default), "Before 9am", "9am to 5pm", "After 5pm"
   (a slot belongs to a chip by its start time). Pill buttons, 44px tall, selected = ink
   background with white text. `aria-pressed`.

5. **The court sheet** (one white card, rounded 20px, `--rule` border):
   - Title: "9 free slots, today, Saturday 14 November", with a small legend on the
     right: yellow square "Free, select to book", grey square "Taken".
   - **Desktop (≥ 760px)**: a grid. First column (200px) is the court; then one column per
     hour in the current filter window (e.g. 07…21 for "Any time"); a header row of hour
     labels. For each venue: a venue row with the name (display style), "W6 0UL, £12 an hour"
     (or "price on LTA Play" when we have no price) and a link "Open LTA Play" on the right;
     then one row per court: court name + a small muted line of indoor/outdoor and surface
     (e.g. "Outdoor, tarmac"). Cells are 44px tall, radius 8px, gap 6px:
       - free → yellow `<a>` showing the hour ("17"), linking to the venue's booking page,
         `aria-label="Court 1, 17:00, free. Book on LTA Play"`
       - taken → grey block, `aria-hidden`
       - already past (today, before now) → empty dashed outline, `aria-hidden`
     Wrap the grid in `overflow-x: auto` so it never breaks the layout.
   - **Phone (< 760px)**: no grid. Each venue is its own card: name, postcode/price line,
     then for each court with free slots: "Court 1  Outdoor, tarmac" and a wrapping row of
     yellow time buttons ("17:00"), each 44px tall linking to booking. Courts with nothing
     free in the window are left out. "Open LTA Play" link at the bottom of the card.
   - If a venue has nothing free in the window: "Nothing free here in this window. Try
     another day or time."
   - While a venue is still loading: keep the existing per-venue Suspense streaming; the
     fallback shows the venue name and "Checking live times…" with grey placeholder cells.
   - If a venue's fetch failed: "Couldn't load live times for Dukes Meadows just now.
     Open ProAgenda to check." with the link.

6. **Check these on their own sites**: heading, one muted sentence "These venues don't let
   other sites read their times, so they open in a new tab.", then a compact card per
   link-only venue: name, "TW8 9AG, tennis", and "Open Better" / "Open Playtomic".
   Do not show the robots.txt explanation on the page (it stays in decisions.md).

7. **Footer**: "Court Finder shows free courts. Booking and payment happen on each venue's
   own site."

## Slots that aren't on the hour

The desktop grid has one column per hour. If a provider returns a slot that doesn't start
on the hour, put it in the column of the hour it starts in and show its exact start time
in the cell ("17:30"). If two slots for the same court fall in the same hour, show the
earlier one and add the count in the aria-label. Times are always shown in Europe/London.

## Interaction and accessibility

- Day and time filters are client-side only: no refetching, no URL change needed.
- Every interactive thing is a real `<button>` or `<a>`, at least 44px tall, with a
  visible focus ring: `outline: 3px solid var(--ink); outline-offset: 2px`.
- Booking links open in a new tab (`target="_blank" rel="noopener noreferrer"`).
- Hover on yellow → `--ball-hover`. No other animation; respect `prefers-reduced-motion`.
- Colour is never the only signal: free cells carry the time as text, taken cells are empty.

## Copy

Plain, sentence case, no "we never book for you" disclaimer at the top.
Links say where they go ("Open LTA Play", "Book on ProAgenda"), never just "Book →".
