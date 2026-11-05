# Data sources register

Produced by `ingest/discover.ts` (Phase 1). It walks the OpenActive data catalogue collection and checks the first page of each candidate feed for real tennis/padel facilities (not table tennis) with a London address. It does not create a database and makes no write of any kind.

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

