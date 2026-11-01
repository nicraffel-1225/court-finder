# Build guide

Build one phase at a time. Each phase ends with tests/lint passing and a short list of
manual checks for Nic. Don't start a later phase until the current one is confirmed working.

## Phase 0 — Project skeleton
- Next.js (App Router, TypeScript) app, deployed to Vercel.
- Supabase project wired up (env vars in `.env.local`, anon key only on public pages).
- Repo scaffolding: `lib/types.ts`, `ingest/`, `supabase/migrations/`, `docs/`.
- Vitest configured and running (even with a placeholder test).
- Manual check: `npm run dev` shows a blank homepage; `npm test` passes.

## Phase 1 — Database schema
- `supabase/migrations`: `providers`, `courts` (with PostGIS location), `slots`
  (times in UTC, price in integer pence), `sync_runs` (last successful sync per provider).
- Seed one fake provider/court/slot row for local testing.
- Manual check: Nic can see the tables in the Supabase dashboard.

## Phase 2 — Postcode search + map (static data)
- Postcode → lat/lon via postcodes.io.
- Leaflet map centered on postcode, showing courts from the seed data within a radius.
- Manual check: entering a real London postcode shows the seeded court on the map.

## Phase 3 — First adapter: Park Sports
- `ingest/adapters/park-sports.ts`, output shaped to `lib/types.ts`.
- Saved fixtures in `ingest/fixtures/`; adapter tests run against fixtures only, no network.
- Upsert logic on `(provider_id, external_id)`; writes a `sync_runs` row.
- Polite fetching: 1 req/sec/host, backoff on 429/5xx, no runs 06:55–07:15.
- Manual check: running the ingest script locally populates real Park Sports slots.

## Phase 4 — Scheduled ingestion
- GitHub Actions workflow runs the ingest script on a schedule, using GitHub secrets.
- Manual check: a scheduled run shows up green in the Actions tab and updates slots.

## Phase 5 — Live site on real data
- Homepage shows real courts/slots for a postcode, hiding anything not synced in the
  last 90 minutes ("availability unknown" instead).
- Click-through link to the provider's official booking page for each slot.
- Manual check: searching a postcode near a real court shows live, current slots.

## Phase 6 — Sources & attribution
- `/sources` page listing each provider's licence/attribution from the `providers` table.
- Manual check: `/sources` lists Park Sports with correct attribution text.

## Phase 7 — More providers
- Add providers in the sourcing-rules preference order (OpenActive feed first).
- Each new provider needs Nic's approval logged in `docs/decisions.md` before any
  public-JSON/scraping adapter is written.
