-- Two new providers found by hand-checking specific venues Nic asked about
-- (10 November 2026, see docs/decisions.md): LTA's own court-booking widget
-- and ProAgenda (Dukes Meadows). Both are clean public JSON endpoints, no
-- login, not blocked by robots.txt — approved for public JSON reads at the
-- same terms as existing approvals.
insert into providers (id, name, access_method, terms_url, licence, attribution, enabled) values
  ('lta', 'LTA court booking (lta.org.uk)', 'public_json', 'https://www.lta.org.uk/', null, 'LTA', true),
  ('proagenda', 'Dukes Meadows (ProAgenda)', 'public_json', 'https://dukesmeadowscourts.proagenda.com/', null, 'Dukes Meadows', true);

-- 'venue_list' sources read a small fixed set of venues directly (no RPDE
-- paging); url here is just a reference for /sources, not something the
-- ingest job pages through.
insert into data_sources (provider_id, kind, url, enabled) values
  ('lta', 'venue_list', 'https://www.lta.org.uk/api/courtdetail/availability', true),
  ('proagenda', 'venue_list', 'https://clientapi.proagenda.com/api/resource/getResourceTimeSlot', true);
