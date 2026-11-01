# London Court Finder: instructions for Claude Code

## What this is
A personal London website (Nic's own use): enter a postcode, see nearby tennis/padel courts with free slots,
and click through to the official booking page. We show availability only. We never
book, hold or resell courts, and never log in on anyone's behalf.

## Owner
Nic is not a programmer. Show the plan before writing code. Keep changes small.
Explain what changed in plain English and say exactly how to check it by hand.

## Stack (do not change without asking)
- TypeScript everywhere. Next.js (App Router) hosted on Vercel.
- Supabase Postgres with PostGIS. Schema changes only via supabase/migrations.
- Ingestion: TypeScript in /ingest, run on a schedule by GitHub Actions.
- Map: Leaflet + OpenStreetMap. Postcodes: postcodes.io. Tests: Vitest.
- Playwright (headless browser), only for providers approved for page reading.
- No paid services and no new frameworks without asking.

## Architecture rules
1. The website reads only our database and never calls provider sites.
2. Each provider has one adapter in ingest/adapters that outputs the shared types
   in lib/types.ts. Nothing outside adapters knows provider-specific formats.
3. All writes are upserts on (provider_id, external_id). Every job is safe to re-run.
4. Store times in UTC and display them in Europe/London. Store money as integer pence.
5. Hide slots from any source not synced successfully in the last 90 minutes;
   show "availability unknown" instead.
6. Secrets live in .env.local, GitHub secrets and Vercel env vars, never in code or
   git. Public pages use the anon (read-only) key only.
7. Every adapter has tests against saved fixtures in ingest/fixtures. Tests never
   touch the network.

## Data sourcing rules
- Preference order: OpenActive feed > official/partner API > public JSON endpoint
  > HTML scraping > link-only listing.
- Public JSON and page reading only for providers marked approved in
  docs/decisions.md (currently: Park Sports). Public pages only, at most one
  request every 2 seconds, and no runs between 06:55 and 07:15 (slot release).
- Never log in, never use anyone's credentials, never bypass CAPTCHAs, rate limits
  or robots.txt.
- Polite fetching: User-Agent "LondonCourtFinder/0.1 (+<your contact email>)",
  at most 1 request per second per host, back off on 429/5xx, cache responses.
- Record each provider's licence and attribution in `providers` and show it on /sources.

## Working style
- Follow docs/BUILD_GUIDE.md one phase at a time. Don't start later phases early.
- Before saying a task is done: run tests and lint, then list manual checks for Nic.
- Log any decision Nic makes in docs/decisions.md with the date.
