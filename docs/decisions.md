# Decisions log

Dated record of choices Nic has made about this project. Newest entries at the bottom.

## 29 October 2026 — Data sourcing: Park Sports approved for page reading

This is a personal-use tool. Reading public availability pages (rung 3–4) is
approved for Park Sports: public pages only, no login, hourly at most. Better
stays on its open feed.

## 5 November 2026 — ClubSpark decision gate: link-only for now

Phase 1 (`ingest/discover.ts`, see `docs/data-sources.md`) found no open feed
for ClubSpark court slots — their only public feed covers participation
courses, not availability. ClubSpark venues (~207 in London, the single
biggest chunk of coverage) launch as link-only: shown on the map with a
"check availability" link, no live times. No scraping of ClubSpark's booking
pages without a separate decision gate of its own.

## 5 November 2026 — ClubSpark approved for page reading

Checked `clubspark.lta.org.uk` by hand (see `docs/data-sources.md`): booking
pages show a full court-by-court, hour-by-hour availability grid with no
login (`role=guest` in the URL). The JSON API behind the page is protected
by Cloudflare and will not be called directly — no bypassing that. Approved:
page reading only, via a real rendered browser (Playwright), same terms as
Park Sports — public pages only, no login, no bypassing rate limits or bot
protection. ClubSpark's terms restrict passing *bookings* to third parties;
this project only ever shows read-only availability and links out to book,
never books on anyone's behalf.

## 9 November 2026 — Phase 3 finding: Better's Slot feed doesn't currently cross-reference its own FacilityUse feed for tennis

Built the Better/GLL adapter (`ingest/adapters/openactive.ts`) and ran a real
sync. It correctly found 38 London venues and 307 tennis/padel courts from
Better's `facility-uses` feed — that part works as Phase 1 expected.

But matching those courts against the `slots` feed (to get actual bookable
times) found almost nothing: across the whole slots history (back to 2022,
~47,000 entries), only 9 ever reference one of our 307 known courts, and all
9 are in the past. Meanwhile a real, live, future tennis slot we spot-checked
by hand ("Highbury Tennis", Islington Parks, booking page confirms it's real)
references a facility-use group that doesn't exist anywhere in the
`facility-uses` feed at all. So right now, for tennis specifically, Better's
two feeds don't reliably link up — not a bug in our code, a gap in their
public data as published today.

Net effect: Better venues/courts are in the database (good for the map), but
essentially no live slots for them yet. No decision made here — surfaced to
Nic to decide how to proceed (wait and re-sync later, investigate further,
or reconsider priority versus ClubSpark/Park Sports page reading).

## 10 November 2026 — Five specific venues: LTA and ProAgenda approved for public JSON reads; Gunnersbury and Bishops Park blocked

Nic asked to park the general Better investigation and focus on five named
venues instead: Gunnersbury (Better), Ravenscourt Park + Southfield Rec
(LTA), Bishops Park (Playtomic) and Dukes Meadows (ProAgenda). Checked each
one's robots.txt and real page behaviour by hand before building anything.

- **LTA's own court-booking widget** (`www.lta.org.uk/play/book-a-tennis-court`)
  calls a clean public JSON endpoint, `www.lta.org.uk/api/courtdetail/availability`
  — no login, not blocked by robots.txt, returns exact start/end times and
  prices. Approved for public JSON reads, same terms as existing approvals.
  This is a different, newer system from the `clubspark` provider already in
  the database (that one is the older Cloudflare-protected page-reading
  path) — kept as a separate provider id, `lta`.
- **ProAgenda** (Dukes Meadows' booking system, really a coaching-booking
  platform repurposed for court hire) calls a public JSON endpoint on a
  separate API host, `clientapi.proagenda.com`, whose paths are literally
  prefixed `nologin`. No robots.txt on either host. Approved for public JSON
  reads, same terms. Checked by hand against dukesmeadows.com first: all
  three courts there are tennis (the "Poraflex" one is an acrylic tennis
  surface at this venue specifically, not padel — Poraflex is a padel brand
  elsewhere, so this was worth checking rather than assuming).
- **Gunnersbury (Better)**: blocked. Better's own robots.txt disallows the
  timetable page Nic linked (`Disallow: */timetable?*`), and this is the
  same Better/GLL whose OpenActive feed is already known broken for tennis
  (see the entry above) — no live-data path for Gunnersbury right now.
  Link-only for now.
- **Bishops Park (Playtomic)**: blocked. Playtomic's robots.txt disallows
  `/api` outright, and simply loading the public club page as a normal
  browser immediately calls that exact disallowed endpoint
  (`/api/clubs/availability?...`) to render the grid — so even plain page
  reading would mean touching what they've blocked. Link-only for now.
- **Chiswick** needs no new approval: `chiswick.parksports.co.uk` turned out
  to be the same ClubSpark system already approved on 5 November (the page
  itself is titled "Clubspark / Chiswick"). Not built yet — still needs the
  Playwright page-reader that approval was for.

Built `ingest/adapters/lta.ts` and `ingest/adapters/proagenda.ts`, covering
only these specific venues (not a general crawl of either platform). Ran a
real sync: 317 slots across Ravenscourt Park + Southfield Rec, 169 across
Dukes Meadows' three courts, all for the next 8 days. Spot-checked several
by hand against the real booking pages — they match.

One bug found and fixed during verification: both new adapters' day-by-day
JSON grids include hours that have already passed today (unlike Better's
OpenActive feed, which only ever lists genuinely future slots), and the
first sync run stored a few dozen of today's already-past hours as if they
were bookable. Moved the existing 8-day/no-past-slots check
(`isWithinSyncWindow`) out of `ingest/adapters/openactive.ts` into
`ingest/core/time.ts` so every adapter shares it, applied it to both new
adapters, and cleaned up the leftover past-dated rows from the first run.

## 10 November 2026 — Dropped the database: direct live fetch instead of Supabase/Postgres/PostGIS

Also decided today: the repo is going public, as part of Nic's portfolio. The
git commit author was auto-generated from his real name and Mac hostname
(never configured) — fixed by setting a throwaway identity
(`courtwatch-ldn` / `courtwatch.ldn@gmail.com`) for this repo, used the same
way in the `User-Agent` string sent to every provider (previously a link to
Nic's own GitHub repo, which also doesn't help a site operator once the
repo's gone private-to-public either way).

Supabase also flagged `spatial_ref_sys` (a table PostGIS creates automatically,
not one we made) as publicly readable/writable with no RLS. Confirmed via
Supabase's own docs this can't actually be fixed at our access level — the
table is owned by `supabase_admin`, not the project's own `postgres` role, so
neither a migration nor the dashboard's own "Resolve issue" button can enable
RLS on it. The only real fix is reinstalling PostGIS in a non-public schema,
which would drop the `geography` type our `venues.location` column depends
on — a bigger, riskier change than justified for a table holding only public
map-projection reference data.

That prompted a bigger question: with the scope now just five named venues
(not "any postcode in London"), did the project still need a database and
PostGIS geospatial search at all? No. The whole Supabase/scheduled-ingestion
design existed to solve "search hundreds of courts across London fast" — for
a handful of courts Nic already knows by name, it's a lot of machinery that
mainly produces things like the RLS email above.

**Decision: drop Supabase entirely.** The website now fetches each venue's
real booking site live, on every page load, and shows what's free right now
— no database, no scheduled ingestion, no migrations, no RLS. Concretely:

- Removed `supabase/` (all migrations), `ingest/core/db.ts`, `upsert.ts`,
  `run.ts`, the Better/GLL OpenActive adapter and RPDE reader (built for a
  citywide crawl that no longer fits; Gunnersbury, the one Better venue in
  scope, is link-only anyway), `tests/database.test.ts`, and `@supabase/supabase-js`.
- Moved the LTA and ProAgenda logic from `ingest/adapters/` into `lib/courts/`,
  stripped of anything DB-shaped: each now exposes a `getXVenue()` function
  that fetches live and returns a venue to display, instead of upserting rows.
- `lib/courts/types.ts` replaces `lib/types.ts` and `ingest/core/types.ts`
  with simpler display-only shapes (no ids, no `updated_at` — nothing here is
  a database row any more).
- Built `app/page.tsx`: a single page listing the 3 live venues (Ravenscourt
  Park, Southfield Rec, Dukes Meadows) with their real upcoming slots and
  "Book at ___" links, plus Gunnersbury and Bishops Park shown link-only.
  Marked `export const dynamic = "force-dynamic"` — this page must never be
  prerendered, since a snapshot baked in at build time would go stale
  immediately.
- `docs/BUILD_GUIDE.md` is kept only as a historical record (marked as
  superseded at the top); CLAUDE.md rewritten to describe the current,
  simpler architecture instead of the ten-phase plan.

**Two real bugs turned up while building and checking this live, not just in
a sense-check of the code:**

1. The LTA and ProAgenda JSON grids include hours that have already passed
   today (unlike Better's OpenActive feed, which only ever lists future
   slots) — the first page load briefly showed a handful of this morning's
   already-elapsed hours as "available". Fixed by applying the existing
   8-day/no-past-slots check (already written for the Better adapter) to
   both of these too.
2. Fetching a venue's 8 days concurrently (`Promise.all`, for page-load
   speed) broke the "at most 1 request per second per host" politeness rule:
   the throttle only recorded a host's last-request time *after* that
   request's own wait finished, so several concurrent calls could all read
   the same stale timestamp and fire together instead of a second apart —
   confirmed by instrumenting it directly (concurrent calls landed
   1-2ms apart, not ~1000ms). Fixed `lib/courts/http.ts` to reserve each
   host's next free slot the instant it's asked for, before any wait, which
   stays correct under concurrent calls; added a regression test for this
   specific case so it can't silently reappear.

Also found and fixed during the same pass: the LTA endpoint occasionally
returns a response that isn't shaped like its usual one for a single day out
of several requested concurrently (not something in our control) — now
checked and skipped gracefully (treated as "nothing found" for that day)
rather than crashing the whole page.
