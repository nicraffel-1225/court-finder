# London Court Finder

A personal website for Nic's own use: a short list of named tennis/padel courts near him,
with free slots fetched live each time the page loads, and a click-through to the venue's
own booking page. The site only shows availability — it never books, holds or resells a
court, and never logs in on anyone's behalf.

There's no database and no postcode search — see docs/decisions.md, 10 November 2026, for
why the project moved away from that larger design to this smaller one.

## Where things are

- **[CLAUDE.md](CLAUDE.md)** — standing rules for Claude Code (stack, architecture,
  how to handle data sources, working style). Read automatically every session.
- **[docs/decisions.md](docs/decisions.md)** — a dated log of choices Nic has made
  (which providers are approved for live reads, and why).
- **[docs/data-sources.md](docs/data-sources.md)** — historical findings from the
  original citywide-search design; kept as reference, not current scope.
- **[docs/BUILD_GUIDE.md](docs/BUILD_GUIDE.md)** — the original ten-phase plan;
  superseded, kept only as a historical record.
- **lib/courts/** — one small module per provider (`lta.ts`, `proagenda.ts`), each
  fetching that provider's real booking site live and returning what to show.
  `linkOnly.ts` lists venues we can't read live (blocked by their own robots.txt).
- **app/page.tsx** — the one page: lists every venue with its live slots (or, for
  link-only ones, a note and a link to check directly).

## Running it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000. The page can take 15-25 seconds to load — it's
fetching real, live availability from each venue's own site as you load it, at a
polite one request per second per site, not reading from a cache.

```bash
npm test     # runs the test suite (Vitest)
npm run lint # checks code style (ESLint)
```

## Adding a venue

1. Check the venue's `robots.txt` and how its real booking page/API behaves by hand
   first (see CLAUDE.md's data sourcing rules).
2. Log what you found in `docs/decisions.md`, dated.
3. If it's readable: add a small module in `lib/courts/` (fixtures + tests, no
   network in tests). If it's blocked: add it to `lib/courts/linkOnly.ts` instead.

## Secrets

None are needed right now — every source this project reads is a genuinely public
endpoint, no API key required. If that ever changes, real values would live in
`.env.local` on your own machine and in Vercel's secret settings, never in this repo.
