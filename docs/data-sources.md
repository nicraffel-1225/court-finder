# Data sources register

Historical record from the original citywide-search design (superseded 10 November 2026, see
docs/decisions.md — the project now covers a short, named list of courts instead; `ingest/discover.ts`
and the script that produced this no longer exist). Kept because the findings below are still
accurate reference material if a new provider ever needs checking.

Produced by `ingest/discover.ts` (Phase 1). It walked the OpenActive data catalogue collection and checked the first page of each candidate feed for real tennis/padel facilities (not table tennis) with a London address. It created no database and made no write of any kind.

Last run: 2026-11-05

## Providers from the build guide's table

| Provider | Feed found? | London tennis/padel seen? | Rung | Evidence |
| --- | --- | --- | --- | --- |
| ClubSpark (LTA) | no | no | link-only (for now) | no FacilityUse feed in this dataset site's distribution |
| Better (GLL) | [yes](https://better-admin.org.uk/api/openactive/better/facility-uses) | yes | 1 — OpenActive feed | e.g. "Tennis Lesson 121" at Queensmead Sports Centre (South Ruislip, HA4 OJE) |
| Park Sports (Royal Parks) | no | no | link-only (for now) | not present anywhere in the OpenActive data catalogue |
| Courtside (Tower Hamlets) | [yes](https://opendata.leisurecloud.live/api/feeds/TowerHamletsCouncil-live-facility-uses) | yes | 1 — OpenActive feed | e.g. "Tennis" at John Orwell Sports Centre (Tower Hamlets, E1W 2QD) |
| All Star / Enable (Wandsworth) | no | no | link-only (for now) | not present anywhere in the OpenActive data catalogue |
| Camden Active | no | no | link-only (for now) | not present anywhere in the OpenActive data catalogue |

## Notes

- **ClubSpark court slots**: the LTA's own feed (`lawntennisassociation.github.io`) only distributes `https://api.clubspark.uk/odi/public/courses` — participation courses, not court availability. No separate ClubSpark court-slot feed was found in the OpenActive catalogue.
- **Courtside (Tower Hamlets)**: found a real OpenActive feed from the London Borough of Tower Hamlets' own leisure centres (e.g. tennis at John Orwell Sports Centre, E1W), via their LeisureCloud/Gladstone system. It's not confirmed whether this is the same system as the "Courtside" branded outdoor park courts — worth checking by hand before relying on it.
- **Park Sports**: no dataset site in the catalogue matches Park Sports or the Royal Parks. Confirms the guide's plan to read their public pages in Phase 7a.
- **Playtomic**: not present in the OpenActive catalogue at all.
- This only checked Bookteq-hosted sites whose hostname names a London borough (Bookteq hosts ~80 small clubs nationwide; checking every one of them for every provider would be impolite for a one-off discovery pass).

## Hand-checked findings (5 November 2026)

Two specific venues Nic pointed at, checked by hand rather than by the script above.

- **Park Sports / Royal Parks has moved booking platforms.** Their site
  (`sportsandleisure.royalparks.org.uk`) now books through a SaaS called Flow
  (`sportsandleisureroyalparks.bookings.flow.onl`), not `parksports.co.uk` as
  this guide assumed. Confirmed in a real browser, no login needed: Hyde Park
  Courts showed real court-by-court tennis slots ("Tennis-60min", "2 spaces
  available" / "Fully booked") for a date a week out. The page loads this
  from `https://flow.onl/api/activities/venue/<slug>/activity/<sport>/v2/times`,
  but that endpoint 404s unless the request looks like it's coming from the
  booking page itself — it appears to check the browser is real, so we won't
  spoof headers to call it directly (same rule as not bypassing a CAPTCHA).
  Phase 7a's plan — read the rendered page with Playwright — is still the
  right approach; it just needs the new site, not the old one.
- **Everyone Active has a real tennis court at Paddington Recreation
  Ground** (W9 1PF, Maida Vale): "Tennis - Floodlit 50 Minutes" and "Tennis -
  Synthetic Court 50 Minutes", confirmed in their live OpenActive feed
  (`https://opendata.leisurecloud.live/api/feeds/EveryoneActive-live-facility-uses`).
  It didn't show up in the automated check above because that only reads the
  feed's first page (politeness budget for a one-off sweep); Paddington only
  appeared after paging in a few pages further. Everyone Active isn't in the
  build guide's original provider table, but this is a second real, open,
  London tennis source alongside Better and Tower Hamlets Council.
- **ClubSpark's booking pages are readable without logging in.** Checked
  `clubspark.lta.org.uk/WestHamPark/Booking/BookByDate` (and the LTA's own
  "Book a court" search links to several more London park venues: Queen's
  Park/Brent, Larkhall Park/Lambeth, Greenwich parks, Sheen Common, Brook
  Green). The page shows a full grid, every court, every hour, price vs.
  "Booked" — URL even says `role=guest`. **But** the JSON endpoint behind it
  (`clubspark.lta.org.uk/v0/VenueBooking/<venue>/GetVenueSessions`) is
  protected by Cloudflare: a direct request gets a 403 "Sorry, you have been
  blocked" page, not data. We won't try to get past that (same rule as not
  bypassing a CAPTCHA). A real browser (Playwright) rendering the actual
  page is the only approach that works here — same as Park Sports — it
  just needs its own decision-gate sign-off in `docs/decisions.md`, since
  only Park Sports is currently approved for page reading. ClubSpark's own
  terms also restrict passing *bookings* to third parties; read-only
  availability display is different, but worth knowing before approving it.

