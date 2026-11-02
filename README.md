# London Court Finder

A personal website for Nic's own use: type a London postcode, see nearby tennis
(and later padel) courts with free slots, and click through to the venue's own
booking page. The site only shows availability — it never books, holds or
resells a court, and never logs in on anyone's behalf.

## Where things are

- **[docs/BUILD_GUIDE.md](docs/BUILD_GUIDE.md)** — the full ten-phase plan. This is
  the source of truth for what gets built, in what order, and how to check each
  phase. Claude Code works through it one phase at a time.
- **[CLAUDE.md](CLAUDE.md)** — standing rules for Claude Code (stack, architecture,
  how to handle data sources, working style). Read automatically every session.
- **[docs/decisions.md](docs/decisions.md)** — a dated log of choices Nic has made
  (e.g. which providers are approved for page reading).
- **[docs/data-sources.md](docs/data-sources.md)** — register of every court
  provider and which free data feed (if any) it has. Filled in during Phase 1.

## Status

**Phase 0 (project skeleton) is done.** The site is a working, empty Next.js app —
there's no real court data or search yet. That starts in Phase 1.

## Running it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

```bash
npm test     # runs the test suite (Vitest)
npm run lint # checks code style (ESLint)
```

## Secrets

Real API keys and database credentials live in `.env.local` on your own machine,
and in GitHub/Vercel's secret settings once those are set up — never in this
repo. `.env.local` is listed in `.gitignore` so it's never pushed by accident.
