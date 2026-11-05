-- Phase 2: the one function the website calls for a search. See
-- docs/BUILD_GUIDE.md "How a search works".
--
-- security definer: the freshness check needs to read data_sources, which
-- anon can't select directly (see 20261105120000_init_schema.sql). The
-- function itself only ever returns venue/facility/slot columns that are
-- already public, so running it with elevated rights is safe. search_path
-- is pinned to stop anyone hijacking it via a session-level search_path.
create or replace function search_slots(
  lat double precision,
  lng double precision,
  radius_m integer default 3000,
  from_time timestamptz default now(),
  to_time timestamptz default now() + interval '7 days',
  sport_filter sport default 'tennis'
)
returns table (
  venue_id uuid,
  venue_name text,
  venue_booking_url text,
  distance_m double precision,
  facility_id uuid,
  facility_name text,
  slot_id uuid,
  slot_start timestamptz,
  slot_end timestamptz,
  remaining int,
  price_pence int,
  slot_booking_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id as venue_id,
    v.name as venue_name,
    v.booking_url as venue_booking_url,
    ST_Distance(v.location, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) as distance_m,
    f.id as facility_id,
    f.name as facility_name,
    s.id as slot_id,
    s.start_at as slot_start,
    s.end_at as slot_end,
    s.remaining,
    s.price_pence,
    s.booking_url as slot_booking_url
  from venues v
  join facilities f on f.venue_id = v.id
  join slots s on s.facility_id = f.id
  join data_sources ds on ds.provider_id = v.provider_id and ds.kind = 'slots'
  where v.is_active
    and f.sport = sport_filter
    and s.remaining > 0
    and s.start_at >= from_time
    and s.start_at <= to_time
    and ds.last_success_at > now() - interval '90 minutes'
    and ST_DWithin(v.location, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, radius_m)
  order by distance_m asc, s.start_at asc;
$$;

grant execute on function search_slots to anon, authenticated;
