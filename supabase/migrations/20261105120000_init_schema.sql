-- Phase 2: core schema. See docs/BUILD_GUIDE.md "Data model" for the full
-- explanation of each table. provider -> venue -> facility -> slot, plus
-- bookkeeping tables for feeds, sync runs and postcode lookups.

create extension if not exists postgis;

create type access_method as enum ('openactive', 'partner_api', 'public_json', 'html', 'link_only');
create type sport as enum ('tennis', 'padel', 'pickleball');

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
  address text,
  postcode text,
  borough text,
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
  indoor boolean,
  floodlit boolean,
  surface text,
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
  items_upserted int default 0,
  items_deleted int default 0,
  error text
);

create table postcode_cache (
  postcode text primary key,        -- normalised: upper case, no spaces
  lat double precision not null,
  lng double precision not null,
  borough text,
  fetched_at timestamptz not null default now()
);

-- Row-level security: the anon (public, read-only) key can read providers,
-- venues, facilities and slots, and nothing else. Only the service role
-- (used solely by the ingestion job) can write anywhere, or read
-- data_sources / sync_runs / postcode_cache at all.
alter table providers enable row level security;
alter table data_sources enable row level security;
alter table venues enable row level security;
alter table facilities enable row level security;
alter table slots enable row level security;
alter table sync_runs enable row level security;
alter table postcode_cache enable row level security;

create policy "Public read access" on providers for select using (true);
create policy "Public read access" on venues for select using (true);
create policy "Public read access" on facilities for select using (true);
create policy "Public read access" on slots for select using (true);
-- data_sources, sync_runs and postcode_cache get no policy at all, so RLS
-- denies every row to anon/authenticated. The service role bypasses RLS
-- entirely (Supabase's default behaviour), so the ingestion job is unaffected.
