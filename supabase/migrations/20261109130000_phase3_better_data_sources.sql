-- Phase 3: register Better/GLL's two OpenActive feeds (see
-- docs/data-sources.md) so ingest/run.ts has something to sync. Enabled
-- immediately — providers.enabled for 'better' stays false until Nic has
-- spot-checked 5 real slots against better.org.uk (see BUILD_GUIDE.md
-- Phase 3 "done when").
insert into data_sources (provider_id, kind, url, enabled) values
  ('better', 'facility_uses', 'https://better-admin.org.uk/api/openactive/better/facility-uses', true),
  ('better', 'slots', 'https://better-admin.org.uk/api/openactive/better/slots', true);
