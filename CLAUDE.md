# London Court Finder: instructions for Claude Code

## What this is
A personal website (Nic's own use): a short list of named tennis/padel courts near him, with
free slots fetched live each time the page loads, and a click-through to the official booking
page. We show availability only. We never book, hold or resell courts, and never log in on
anyone's behalf.

This isn't a citywide "any postcode in London" search — see docs/decisions.md,
10 November 2026, for why that was dropped in favour of this smaller, simpler design.

## Owner
Nic is not a programmer. Show the plan before writing code. Keep changes small.
Explain what changed in plain English and say exactly how to check it by hand.

## Stack (do not change without asking)
- TypeScript everywhere. Next.js (App Router) hosted on Vercel.
- No database. Every page load fetches each venue's real booking site live — see
  "Architecture rules" below.
- Tests: Vitest.
- No paid services and no new frameworks without asking.

## Architecture rules
1. One small module per provider in lib/courts/ (e.g. lta.ts, proagenda.ts), each outputting
   the shared `CourtVenue`/`CourtSlot` shape in lib/courts/types.ts. Nothing outside that
   module knows the provider's own JSON/HTML format.
2. A venue we can't read live (blocked by robots.txt, no usable feed, etc.) goes in
   lib/courts/linkOnly.ts instead: shown with a link to check and book directly, no live times.
3. Store times in UTC internally and display them in Europe/London. Naive local timestamps
   from a provider (no UTC offset) need explicit conversion — see lib/courts/time.ts's
   `londonNaiveToUtcIso`, which handles the GMT/BST boundary correctly. Store money as
   integer pence.
4. A page that fetches live data is dynamic (`export const dynamic = "force-dynamic"`), not
   prerendered — provider results change constantly and must never be baked in at build time.
5. Treat every provider response as an untrusted boundary: check the shape before using it
   (e.g. confirm an expected array really is one), and let one bad day/court/venue fail
   gracefully (skip it, don't crash the whole page) rather than throwing.
6. Secrets live in .env.local and Vercel env vars, never in code or git.
7. Every provider module has tests against saved fixtures in its own fixtures/ folder. Tests
   never touch the network.

## Data sourcing rules
- Preference order: OpenActive feed > official/partner API > public JSON endpoint
  > HTML scraping > link-only listing.
- Public JSON and page reading only for providers marked approved in
  docs/decisions.md (currently: Park Sports, ClubSpark, LTA, ProAgenda).
  Public pages only, at most one request every 2 seconds, and no runs between
  06:55 and 07:15 (slot release).
- Never log in, never use anyone's credentials, never bypass CAPTCHAs, rate limits
  or robots.txt. If a provider's own robots.txt blocks the only page/endpoint that shows
  availability, that venue is link-only — don't look for a workaround.
- Polite fetching: User-Agent "LondonCourtFinder/0.1 (+mailto:courtwatch.ldn@gmail.com)",
  at most 1 request per second per host, back off on 429/5xx. A page fetches several
  venues/days concurrently, not one at a time, so the per-host throttle (lib/courts/http.ts)
  has to stay correct under concurrent calls, not just sequential ones — it reserves each
  host's next free slot the instant it's asked for, before any wait, specifically so this
  holds.
- Record each provider's name/terms URL somewhere visible to Nic (currently docs/decisions.md;
  a /sources page can come later if this grows).

## Working style
- This project is not run in numbered phases any more (see docs/decisions.md,
  10 November 2026) — docs/BUILD_GUIDE.md is kept only as a historical record of the
  original, larger design.
- Adding a new venue: check its robots.txt and real page/API behaviour by hand first,
  log the finding in docs/decisions.md, then add a small module (or a link-only entry).
- Before saying a task is done: run tests and lint, then list manual checks for Nic.
- Log any decision Nic makes in docs/decisions.md with the date.
