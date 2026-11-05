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
