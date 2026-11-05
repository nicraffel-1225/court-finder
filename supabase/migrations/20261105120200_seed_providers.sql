-- Phase 2: seed providers from docs/data-sources.md. All disabled — Phase 7
-- turns each one on once its adapter is built and spot-checked.
insert into providers (id, name, access_method, terms_url, licence, attribution, enabled) values
  ('clubspark', 'ClubSpark (LTA)', 'html', 'https://www.lta.org.uk/', null, null, false),
  ('better', 'Better (GLL)', 'openactive', 'https://www.better.org.uk/', 'CC BY 4.0', 'Better (GLL)', false),
  ('park_sports', 'Park Sports (Royal Parks)', 'html', 'https://sportsandleisure.royalparks.org.uk/', null, null, false),
  ('tower_hamlets', 'Tower Hamlets Council leisure centres', 'openactive', null, 'CC BY 4.0', 'London Borough of Tower Hamlets', false),
  ('all_star_enable', 'All Star / Enable (Wandsworth)', 'link_only', null, null, null, false),
  ('camden_active', 'Camden Active', 'link_only', null, null, null, false),
  ('everyone_active', 'Everyone Active', 'openactive', 'https://www.everyoneactive.com/', 'CC BY 4.0', 'Everyone Active', false);
