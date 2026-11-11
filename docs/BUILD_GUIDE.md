# London Court Finder: Build Guide for Claude Code

Last updated: 1 November 2026 · Nic

> **Superseded, 10 November 2026.** The project moved away from this plan — see
> docs/decisions.md's "10 November 2026" entries. Instead of a citywide, postcode-searchable
> database (Phases 2, 4, 5 below), Nic narrowed the scope to a short, named list of courts near
> him, and the site now fetches each one's live availability directly on every page load — no
> database, no scheduled ingestion, no PostGIS. CLAUDE.md describes the current, much simpler
> architecture. This file is kept only as a historical record of the original ten-phase design;
> don't follow it for new work.

## How to use this guide

The site gets its availability data from free open data feeds wherever they exist, and scrapes only as a last resort. It is built in ten phases, each one working and tested before the next starts. You do not write code. Claude Code writes it, and you check each phase against a "done when" list you can verify by looking at the site, the database or a log.

**What we are building:** a personal London website, for your own occasional use, where you type a postcode, pick a date and time, and see which tennis (and later padel) courts nearby have free slots. Each slot links to the venue's official booking page. The site shows availability; it never books, holds or resells courts.

**How to work with Claude Code:**

1. Run Phase 0 yourself. It sets up accounts and a project folder and puts this guide in that folder as `docs/BUILD_GUIDE.md`.
2. Start each phase in a fresh Claude Code session. Paste that phase's prompt. Ask Claude Code to show its plan before it writes anything (Plan mode, Shift+Tab).
3. When it says it has finished, work through the "done when" list yourself. If anything fails, paste the failing item back and ask it to fix that.
4. Once a phase passes, ask Claude Code to commit and push to GitHub with a message naming the phase. That gives you a save point to roll back to.
5. Don't skip ahead. Each phase depends on the data shape the earlier ones set up.

**Ground rules for any session:**

- Ask "explain what you just did in plain English" whenever you're unsure. You own this codebase, so you need to understand its shape even if you can't read every line.
- Never paste passwords or secret keys into the chat. They go in `.env.local` on your computer and in GitHub and Vercel secret settings, never in git.
- If Claude Code proposes something this guide doesn't cover (a new framework, a paid service, logging into a booking site), tell it to stop and explain why first.
- Keep `docs/decisions.md` up to date. Every choice you make at a decision gate gets one dated line there.

## Data sourcing: free APIs first

Free, published data feeds come first. Because this is a personal tool you'll open occasionally, reading public availability pages is approved where no feed exists, starting with Park Sports. The UK has a standard for exactly this: **OpenActive**, a Sport England-backed open data standard. Leisure operators publish their bookable facility slots in it for anyone to reuse. GLL (Better) already publishes OpenActive datasets ([GLL announcement](https://www.healthclubmanagement.co.uk/health-club-management-news/GLL-Data/332363); catalogue listing in the [openactive Python package docs](https://pypi.org/project/openactive/2.0.0/)). ClubSpark supports OpenActive: in Australia, venues tick a box to share court availability through it ([Tennis Australia](https://support.tennis.com.au/?p=9956)). The LTA's own UK open feed, though, covers only coaching courses, not court slots ([LTA opendata](https://github.com/LawnTennisAssociation/opendata)).

**The single biggest unknown:** whether ClubSpark's UK court slots, which cover about 85% of London venues, are in any open feed. Phase 1 answers this before we build anything else.

### Source hierarchy (every provider uses the highest rung available)

1. **Open data feed (OpenActive).** Free, published for reuse, and stable. Use it whenever it exists.
2. **Official or partner API by agreement.** Free if granted. Email the LTA/ClubSpark asking for court-slot feed access, citing the Australian precedent.
3. **Unofficial public JSON.** This is the data endpoint a booking page itself calls, with no login. Use it only after reading that site's terms, and only with your written sign-off in `decisions.md`.
4. **HTML scraping / page reading.** Last resort, with the same sign-off.
5. **Link-only listing.** The venue appears on the map with a "check availability" link. There is no risk, and it is always available as a fallback.

**Decision, 29 October 2026:** this is a personal-use tool. Reading public availability pages (rung 3–4) is approved for Park Sports: public pages only, no login, hourly at most. Better stays on its open feed. Copy this line into `docs/decisions.md` in Phase 0.

### What we know per provider (London venue counts from the project research)

| Provider | London venues | Open feed known? | Starting plan |
| --- | --- | --- | --- |
| ClubSpark (LTA) | ~207 | Not confirmed for UK court slots | Phase 1 check + email the LTA; decision gate |
| Better (GLL) | 19 | Yes, OpenActive | Build first (Phase 3); no page reading needed |
| Park Sports (Hyde Park, Regent's Park, Greenwich Park, Ealing) | ~5 | Unknown | Read public availability pages (Phase 7a) |
| Courtside (Tower Hamlets) | 7 | Unknown | Phase 1 check, else link-only |
| All Star / Enable (Wandsworth) | 5+ | Unknown | Phase 1 check, else link-only |
| Camden Active | 3 | Unknown | Phase 1 check, else link-only |

Park Sports runs the Royal Parks courts and West London sites such as Pitshanger Park in Ealing ([Park Sports](https://parksports.co.uk/activities/pay-and-play-tennis)). It releases new court times at 7am each morning, up to 7 days ahead ([Regent's Park booking](https://parksports.co.uk/activities/pay-and-play-tennis/regents-park)).

**Be ready for this outcome:** if ClubSpark slots aren't open, free feeds alone may cover under 15% of London venues at launch. The ClubSpark decision gate at the end of Phase 1 is therefore the most important decision in the project.

### Other free APIs the build uses

- **postcodes.io:** turns a postcode into latitude/longitude and borough. Free, no key needed.
- **OpenStreetMap tiles via Leaflet:** the map. Fine for light traffic; move to a free-tier tile provider if usage grows.
- **OpenActive data catalogue:** the master list of every publisher's feeds, used to discover sources automatically.

### How an OpenActive feed works, in plain English

Each publisher has a "dataset site" listing its feeds. A feed is a long list of changes (RPDE) that you read page by page, each page ending with a link to the next. You keep that link as a bookmark, so each later run fetches only what changed since. Two kinds of item matter here:

- a **FacilityUse:** the bookable thing, e.g. "Tennis court hire, Highbury Fields", with its address and coordinates;
- a **Slot:** one dated time window on that facility, with how many spaces remain and the price.

Our database is shaped around these two ideas, so every other source gets translated into the same shape.

## Architecture

The system has two independent halves joined by one database: a scheduled ingest job writes availability in, and the website reads it out. Everything runs on free tiers.

```text
  SOURCES                  INGEST JOB                DATABASE               WEBSITE
+--------------------+   +--------------------+   +-------------------+   +---------------------+
| OpenActive feeds   |-->| GitHub Actions     |   | Supabase Postgres |   | Next.js on Vercel   |--> postcodes.io
| (Better/GLL)       |   | hourly + on demand |-->| + PostGIS         |-->| reads database only |    (postcode -> lat/lng)
+--------------------+   |                    |   |                   |   | postcode search     |
| Park Sports pages  |-->| one adapter per    |   | venues,           |   +----------+----------+
+--------------------+   | provider -> shared |   | facilities,       |              |
| ClubSpark (Ph. 1)  |-->| data shape ->      |   | slots, sync_runs  |              |
+--------------------+   | upserts, logs runs |   +-------------------+              |
| Venue list (CSV)   |-->|                    |                                      |
+--------------------+   +--------------------+                                      |
          ^                                                                          |
          +------------ booking buttons link out to each provider's own site --------+
```

Read it left to right. Each source has its own adapter, all adapters write the same shape into the database, and the website only ever reads that database. The bottom line is the one place a visitor leaves us: the booking button opens the provider's own site.

| Layer | Choice | Why this one |
| --- | --- | --- |
| Language | TypeScript throughout | One language for site and ingestion; Claude Code writes it well |
| Website | Next.js on Vercel | Pages and the search API in one project, free hosting |
| Database | Supabase: Postgres + PostGIS | Free tier, distance search built in, row-level security |
| Ingestion | TypeScript scripts on a GitHub Actions schedule | Free, runs apart from the site, every run logged; hourly plus a manual refresh |
| Page reader | Playwright (headless Chrome) | Reads Park Sports' public availability pages inside the ingest job |
| Map | Leaflet + OpenStreetMap | Free, no API key |
| Postcodes | postcodes.io | Free, no API key |
| Tests | Vitest | Checks every adapter against saved feed and page samples |

**Why ingestion is separate from the website:**

- **Speed:** a search takes milliseconds because it reads pre-collected data instead of calling six booking systems while the visitor waits.
- **Resilience:** if a provider is down, the site still works and marks that provider's slots as stale.
- **Politeness:** providers get one light, predictable request pattern an hour, however often you search.

## Data model

Seven tables hold everything. They form one chain, **provider → venue → facility → slot**, plus bookkeeping tables for feeds, sync runs and postcode lookups. Every source, whether an open feed, an API or a hand-made list, is translated into this one shape. That is what lets you add a new provider without touching the website.

| Table | One row is | Unique key | Why it exists |
| --- | --- | --- | --- |
| `providers` | A booking system (Better, ClubSpark…) | `id` text slug | Access method, licence and attribution live in one place |
| `data_sources` | One feed or endpoint we read | provider + kind + url | Holds the feed bookmark (`next_url`) and health |
| `venues` | A place with courts | provider + external id | Location for the postcode search |
| `facilities` | A bookable court or court type | provider + external id | Sport, indoor, floodlit |
| `slots` | One time window on one facility | provider + external id | The availability itself |
| `sync_runs` | One ingestion run of one source | id | Debugging and the status page |
| `postcode_cache` | A postcode already looked up | postcode | Avoids repeat calls to postcodes.io |

This sketch is the contract for Claude Code in Phase 2. It may refine the details but must keep the names, keys and rules:

```sql
create extension if not exists postgis;
create type access_method as enum ('openactive','partner_api','public_json','html','link_only');
create type sport as enum ('tennis','padel','pickleball');

create table providers (
  id text primary key,              -- 'better', 'clubspark', 'courtside'
  name text not null,
  access_method access_method not null,
  terms_url text,
  licence text,                     -- e.g. 'CC BY 4.0'
  attribution text,                 -- shown on the /sources page
  enabled boolean not null default false
);

create table data_sources (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null references providers(id),
  kind text not null,               -- 'facility_uses' | 'slots' | 'venue_list'
  url text not null,
  next_url text,                    -- RPDE bookmark; null = start from url
  last_success_at timestamptz,
  consecutive_failures int not null default 0,
  enabled boolean not null default true,
  unique (provider_id, kind, url)
);

create table venues (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null references providers(id),
  external_id text not null,
  name text not null,
  address text, postcode text, borough text,
  location geography(Point, 4326) not null,
  booking_url text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (provider_id, external_id)
);
create index on venues using gist (location);

create table facilities (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  provider_id text not null references providers(id),
  external_id text not null,
  name text not null,               -- 'Court 3' or 'Tennis court hire'
  sport sport not null,
  indoor boolean, floodlit boolean, surface text,
  unique (provider_id, external_id)
);

create table slots (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id) on delete cascade,
  venue_id uuid not null references venues(id) on delete cascade, -- copied for fast search
  provider_id text not null references providers(id),
  external_id text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  remaining int,                    -- spaces left; 0 = fully booked
  capacity int,
  price_pence int,                  -- null = unknown, 0 = free
  booking_url text,
  source_modified_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (provider_id, external_id)
);
create index on slots (venue_id, start_at);
create index on slots (start_at) where remaining > 0;

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references data_sources(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,             -- 'running' | 'ok' | 'failed'
  items_upserted int default 0, items_deleted int default 0,
  error text
);

create table postcode_cache (
  postcode text primary key,        -- normalised: upper case, no spaces
  lat double precision not null, lng double precision not null,
  borough text,
  fetched_at timestamptz not null default now()
);
```

### Rules the whole codebase follows

- **Times:** stored in UTC, shown in London time. The clock change on 25 October 2026 makes a good test case.
- **Money:** stored as whole pence (`470`, not `4.70`), so there are no rounding errors.
- **Upserts only:** every write inserts or updates on `provider + external_id`. Re-running any job is always safe.
- **Deletions:** an item the feed marks deleted is removed. A nightly job removes slots that ended more than a day ago.
- **Adapters translate, nothing else knows:** each provider gets one adapter file that turns its data into the shared shape. Nothing downstream ever checks which provider a row came from.
- **The website never contacts booking sites.** It reads only our database, so a slow or broken provider can't break the site.
- **Freshness beats completeness:** slots are shown only if their source last synced successfully within 90 minutes. Otherwise the venue shows "availability unknown, check the venue's site".
- **Security:** row-level security is on. The public key can only read `providers`, `venues`, `facilities` and `slots`. Only the ingestion job, holding the secret service key, can write.

### How a search works

1. The postcode is normalised (`n5 1ab` → `N51AB`) and looked up in `postcode_cache`. On a miss it is fetched from postcodes.io and saved.
2. The site calls one database function, `search_slots(lat, lng, radius_m, from, to, sport)`. Defaults are a 3 km radius and tennis.
3. That function finds venues within the radius (PostGIS `ST_DWithin`), joins their future slots with `remaining > 0` in the time window from fresh sources, and returns venues sorted by distance, each with its list of free times.
4. The page lists venues, shows them on the map, and turns each free time into a button linking to the official booking page.

## Project structure and CLAUDE.md

The project has two halves that never call each other: `ingest/` fetches data into the database, and `app/` reads it out to visitors. Phase 0 creates this layout; later phases fill it in.

```text
court-finder/
├── CLAUDE.md                     # standing instructions for Claude Code (below)
├── docs/
│   ├── BUILD_GUIDE.md            # this guide
│   ├── data-sources.md           # register of every provider and feed (Phase 1)
│   └── decisions.md              # dated log of your decisions
├── app/                          # Next.js pages: home, results, venue, sources, status
├── components/                   # map, search form, slot buttons
├── lib/
│   ├── db.ts                     # Supabase client (read-only key)
│   ├── postcode.ts               # postcodes.io lookup + cache
│   └── types.ts                  # shared Venue / Facility / Slot types
├── ingest/
│   ├── run.ts                    # entry point: runs every enabled source
│   ├── core/
│   │   ├── rpde.ts               # generic OpenActive feed reader
│   │   ├── upsert.ts             # writes normalised rows to the database
│   │   └── http.ts               # polite fetch: user agent, delays, retries
│   ├── adapters/
│   │   ├── openactive.ts         # FacilityUse/Slot -> our shape (serves many providers)
│   │   ├── parksports.ts         # Park Sports page reader (Phase 7a)
│   │   └── link-only.ts          # venues from a CSV, no availability
│   ├── seeds/venues-link-only.csv
│   └── fixtures/                 # saved sample responses used by tests
├── supabase/migrations/          # numbered SQL files; the only way the schema changes
├── tests/
└── .github/workflows/ingest.yml  # the scheduled sync
```

Save the block below as `CLAUDE.md` in the project root. Claude Code reads it automatically at the start of every session, so these rules hold even when you forget to repeat them. Replace the contact email placeholder with an address you're happy for booking sites to see.

```markdown
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
```

## Build phases

There are ten phases, each ending in something you can see working. Phase 1 matters most: it finds out which free feeds exist before any product code is written. It ends at the ClubSpark decision gate. Expect Phases 0–6 to take a few evenings each at a non-coder's pace.

### Phase 0: Set up (you, 1–2 hours)

**Goal:** accounts, tools and an empty project on GitHub.

Do these yourself first:

1. Create free accounts at GitHub, Supabase and Vercel (sign in to Vercel with GitHub).
2. Install Claude Code using the official instructions at docs.claude.com, plus Git and Node.js (LTS version).
3. Make a folder called `court-finder`, open a terminal in it, and run `claude`.
4. Save this file as `docs/BUILD_GUIDE.md` inside the folder.

Then paste:

```text
Read docs/BUILD_GUIDE.md. We are doing Phase 0 only.
Create CLAUDE.md from the guide's "Project structure and CLAUDE.md" section.
Scaffold a Next.js TypeScript app (App Router) with the folder layout shown;
empty placeholder files are fine. Add Vitest and ESLint. Create docs/decisions.md
(with the dated decision from the guide's Data sourcing section as its first entry)
and docs/data-sources.md as an empty template. Add a .gitignore that excludes .env*
and node_modules. Initialise git, then help me create a private GitHub repo and
push. Explain each step before you run it.
```

**Done when:**

- [ ] `npm run dev` shows a starter page at http://localhost:3000
- [ ] The repo is on GitHub and contains `CLAUDE.md` and `docs/`
- [ ] No `.env` file appears on GitHub

### Phase 1: Find the free data sources (no product code)

**Goal:** a written register of exactly which providers have free feeds, and how good they are.

```text
Phase 1. Write a one-off script ingest/discover.ts. It reads the OpenActive data
catalogue collection (https://openactive.io/data-catalogs/data-catalog-collection.jsonld)
and follows catalogues -> dataset sites -> feeds. Find every feed relating to ClubSpark/LTA,
Better/GLL, Courtside, Park Sports/Royal Parks, Camden Active, Enable, All Star Tennis,
Everyone Active, Playfinder/Bookteq or Playtomic, plus any feed containing tennis or
padel facility slots in London. For each candidate, fetch only the first page and
record: publisher, feed URL, item type (FacilityUse, Slot...), licence, whether it
includes tennis/padel, whether items have London coordinates or postcodes, and one
sample item. Write the results to docs/data-sources.md: one row per provider in the
guide's provider table, with the highest sourcing rung we can use and the evidence.
Fetch politely (1 request per second). Do not create any database.
```

**While that runs, email the LTA** (and ClubSpark) asking whether London park court availability can be shared through an OpenActive feed for a free, non-booking discovery site. Mention that ClubSpark already offers this to Tennis Australia venues.

**Done when:**

- [ ] `docs/data-sources.md` has a row for each provider, with a rung and the evidence
- [ ] You have read it and understand which venues will have live times at launch
- [ ] The LTA/ClubSpark email has been sent

**Decision gate: ClubSpark route.** Record your choice in `decisions.md`.

- **Open feed found** → handle it like Better in Phase 3. This is the best case.
- **No feed yet** → launch ClubSpark venues as link-only (on the map, no times) while you wait for the LTA. This is the recommended default: no legal risk, and the map is complete.
- **Use the public JSON endpoint** the ClubSpark booking page calls → only after reading the terms and taking advice. Council terms on ClubSpark already restrict passing bookings to third parties. Read-only availability is different, but the terms still apply.

### Phase 2: Database

**Goal:** the seven tables live in Supabase, locked down, with a working search function.

First, create a Supabase project yourself (region: London). Copy its URL, anon key and service role key into `.env.local`. Claude Code can tell you the variable names.

```text
Phase 2. Turn the guide's Data model section into migrations in supabase/migrations:
enable PostGIS, then create the types, tables and indexes. Enable row-level security,
with read-only policies for the anon role on providers, venues, facilities and slots,
and nothing on the other tables. Seed providers from docs/data-sources.md with
enabled = false. Write the search_slots(lat, lng, radius_m, from, to, sport) function
as described in "How a search works". Walk me through applying the migrations to my
Supabase project. Add tests: a fake venue and slot near N5 1AB is found within 3 km,
is not found from a postcode 10 km away, and the anon key cannot insert rows.
```

**Done when:**

- [ ] All seven tables appear in Supabase's Table Editor
- [ ] The tests pass, including "anon cannot insert"
- [ ] `providers` lists every provider from Phase 1

### Phase 3: First live feed, end to end

**Goal:** real Better/GLL court slots flowing into your database from the OpenActive feed.

```text
Phase 3. Build ingest/core/http.ts, ingest/core/rpde.ts, ingest/core/upsert.ts and
ingest/adapters/openactive.ts, using the Better/GLL feeds in docs/data-sources.md.
From FacilityUse items, keep only tennis and padel facilities in Greater London and
create their venues and facilities. From Slot items, upsert slots for those facilities
for the next 8 days. Save the RPDE bookmark to data_sources.next_url after every page,
so a crash resumes where it stopped. Handle deleted items. Write a sync_runs row per run.
Save a few real response pages into ingest/fixtures and test against them.
Add an "npm run ingest" command that runs everything once.
```

**Done when:**

- [ ] `npm run ingest` finishes without errors
- [ ] Supabase shows London Better venues (e.g. Islington's) with slots for the coming week
- [ ] A second run creates no duplicates
- [ ] You've checked 5 slots against Better's own booking site and they match

### Phase 4: Run it on a schedule

**Goal:** data refreshes by itself, and you hear about it when something breaks.

```text
Phase 4. Add .github/workflows/ingest.yml to run "npm run ingest" hourly from 07:30 to 22:30 London time
and on demand (the "Run workflow" button, so I can refresh from my phone),
with the Supabase service key as a GitHub secret. Add a nightly job
that deletes slots that ended more than a day ago. When a source fails 3 runs in a
row, record it on data_sources and alert me using the simplest free option (e.g. a
GitHub issue that emails me). Keep each run under 2 minutes and tell me the expected
monthly Actions minutes.
```

**Done when:**

- [ ] The GitHub Actions tab shows a day of green runs
- [ ] `sync_runs` fills up and slot `updated_at` times keep moving
- [ ] You break a feed URL on purpose, get the alert, then restore it

### Phase 5: Search API

**Goal:** a web address that answers "free courts near this postcode" as data.

```text
Phase 5. Build lib/postcode.ts: normalise and validate UK postcodes, check
postcode_cache, otherwise call postcodes.io and save the result. Build an API route
/api/search?postcode=&date=&from=&to=&radius=&sport= that returns search_slots results,
applying the 90-minute freshness rule. Handle an invalid postcode, a postcode outside
London (search anyway, but note that coverage is London only) and no results (suggest
a wider radius). Write tests for each case.
```

**Done when:**

- [ ] `/api/search?postcode=N51AB&date=<tomorrow>` in your browser returns venues sorted by distance, with free times
- [ ] A made-up postcode returns a friendly error, not a crash
- [ ] The tests pass

### Phase 6: The website

**Goal:** a live site you can use on your phone.

```text
Phase 6. Build the pages. Home: postcode, date (default today), time of day
(any/morning/afternoon/evening), radius (1/3/5 km), sport. Results: venues by distance,
each with name, distance, provider, "updated X min ago" and free times as buttons
linking to booking_url; a Leaflet map beside the list on desktop and behind a toggle
on mobile. Link-only venues show a "Check availability" button and no times. Also add
a venue page, /sources (every provider with its licence and attribution) and /about
(we show availability; we don't take bookings). Mobile-first and accessible.
Then deploy to Vercel with the environment variables.
```

**Done when:**

- [ ] On your phone, searching your own postcode gives sensible results
- [ ] Each time button opens the right booking page
- [ ] The site is live at its Vercel address

### Phase 7: Add providers one at a time

**Goal:** full London coverage, built one provider per session. Start with the link-only CSV for every venue without a feed, so the map is complete early. Then add each feed or approved endpoint.

```text
Phase 7: add provider <NAME> using the rung recorded in docs/decisions.md. Follow
the adapter pattern: save fixtures and write tests first, and change nothing outside
ingest/adapters, ingest/seeds and (if needed) a new migration. Leave the provider
disabled until I have checked 5 of its slots against its own booking site.
```

**Done when (per provider):**

- [ ] 5 slots spot-checked against the provider's own site
- [ ] Provider enabled, with attribution showing on /sources

### Phase 7a: Park Sports page reader

**Goal:** live Park Sports times for Hyde Park, The Regent's Park, Greenwich Park, Pitshanger Park and Lammas Park, read from their public availability pages.

```text
Phase 7a: add Park Sports (approved in docs/decisions.md for page reading, personal use).
Investigate first, build nothing yet: open one venue's public availability page
(start from https://parksports.co.uk/activities/pay-and-play-tennis/regents-park) in
Playwright without logging in. Tell me whether court times are visible without an
account, and whether the page loads them from a background data request. If times
need a login, stop there and tell me. If there is a background data request, read
that instead of the page layout. Then build ingest/adapters/parksports.ts: one venue
per Park Sports site and free slots for the next 7 days, at most one request every
2 seconds, no runs between 06:55 and 07:15 London time, using our User-Agent. Save
fixtures and test against them. If parsing suddenly returns nothing, alert me rather
than showing zero courts.
```

**Done when:**

- [ ] Claude Code has confirmed the times are visible without logging in
- [ ] 5 Park Sports slots spot-checked against parksports.co.uk
- [ ] A deliberately broken page triggers an alert instead of silently showing no courts

### Phase 8: Status page and polish

```text
Phase 8. Add /status showing each source's last success, recent runs and slot counts.
Add privacy-friendly analytics that need no cookie banner, and a "report a wrong time"
link on each venue. Generate borough pages ("Tennis courts in Hackney") from the
venues table for search engines. Help me connect a custom domain.
```

**Done when:**

- [ ] `/status` is all green
- [ ] Borough pages exist for every borough with venues
- [ ] The site loads on your domain

### Phase 9: After launch, only once people use it

At this point the product questions from the research take over from the build questions. Candidate next steps, each its own mini-project:

- **Free-court alerts** ("tell me when a court frees up near me"). This needs user accounts, email sending and UK GDPR compliance.
- **Padel as a first-class sport**, the bigger spending pool.
- **A partner-finding / matchmaking layer.** The research's strongest standalone bet if booking access stays closed.

## Rules of the road and running costs

Until launch the site can run for about the price of a domain, and building on open feeds avoids most legal risk. These are practical guardrails, not legal advice. Take proper advice before using any unofficial endpoint.

**Terms and licences**

- OpenActive datasets each carry a licence, commonly an open one that requires attribution. Record it per provider in Phase 1 and display it on `/sources`.
- For any non-feed source, read that site's terms and `robots.txt` before writing an adapter. Several council ClubSpark terms ban passing bookings to third parties and allow one account per person. Our design never books, logs in or resells, which keeps us clear of those clauses.
- If a provider asks you to stop, disable it the same day (`providers.enabled = false`) and log it in `decisions.md`.

**Being a polite guest:** at most one request per second per host, a User-Agent with your contact email, backing off when a site says slow down (HTTP 429), no faster than hourly (plus the odd manual refresh), and nothing during the 7am slot releases.

**Privacy:** until Phase 9 the site stores no personal data. The only thing to get right is analytics that needs no cookie banner. Alerts and accounts in Phase 9 bring UK GDPR duties: a privacy notice, consent and the right to deletion.

**Running costs.** Free-tier limits change, so check each one when you sign up.

| Service | Use | Expected cost | Watch out for |
| --- | --- | --- | --- |
| Supabase (free) | Database + PostGIS | £0 | Free projects pause after a week of inactivity; the scheduled sync keeps it awake |
| GitHub (free) | Code + scheduled sync | £0 | Private repos get a limited monthly Actions allowance; an hourly schedule should fit; check usage after the first week |
| Vercel Hobby | Website hosting | £0 | Hobby is for non-commercial use; move to a paid plan if you add ads or charge |
| postcodes.io, OpenStreetMap | Postcodes, map | £0 | Tile usage policy at high traffic |
| Domain name | e.g. a .co.uk | ~£10 a year | — |

## Sources

- [LTA opendata repository](https://github.com/LawnTennisAssociation/opendata): the LTA's OpenActive feed covers participation courses only
- [Tennis Australia: ClubSpark OpenActive setting](https://support.tennis.com.au/?p=9956): ClubSpark venues share court availability via OpenActive
- [GLL publishes open data (Health Club Management)](https://www.healthclubmanagement.co.uk/health-club-management-news/GLL-Data/332363)
- [openactive Python package docs](https://pypi.org/project/openactive/2.0.0/): catalogue walk-through listing GLL/Better datasets
- [OpenActive data catalogues](https://github.com/groop-moray/data-catalogs): structure of the catalogue collection
- [Park Sports pay & play tennis](https://parksports.co.uk/activities/pay-and-play-tennis): venues and booking rules
- Provider venue counts, booking rules and terms: project research doc *London tennis court booking market*
