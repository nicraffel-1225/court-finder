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

**Phase 0 and Phase 1 are done.** Phase 2 (the database) is in progress: the
schema exists as migrations in `supabase/migrations/`, but needs a real
Supabase project to apply them to — see below.

## Database setup (Phase 2)

1. Create a free project at [supabase.com](https://supabase.com) (region:
   **London**, so the database is close to where the site runs).
2. In the new project, open **SQL Editor** and run each file in
   `supabase/migrations/` in order (they're numbered) — paste one in, hit
   Run, then the next.
3. In **Settings -> API**, copy the Project URL, the `anon` `public` key and
   the `service_role` key.
4. Copy `.env.local.example` to `.env.local` and paste those three values in.
   Never paste the `service_role` key anywhere else (not in chat, not in
   git) — it bypasses all the read-only restrictions.
5. Run `npm test` — the Phase 2 database tests (in `tests/database.test.ts`)
   will now run for real instead of skipping, checking that search finds a
   nearby test venue, doesn't find a far-away one, and that the public key
   can't write to the database.

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
