// Shared types matching supabase/migrations/20261105120000_init_schema.sql.
// Every ingest adapter outputs Venue/Facility/Slot shapes; nothing outside
// ingest/adapters knows a provider's own data format.

export type AccessMethod = "openactive" | "partner_api" | "public_json" | "html" | "link_only";
export type Sport = "tennis" | "padel" | "pickleball";

export interface Provider {
  id: string;
  name: string;
  access_method: AccessMethod;
  terms_url: string | null;
  licence: string | null;
  attribution: string | null;
  enabled: boolean;
}

export interface Venue {
  id: string;
  provider_id: string;
  external_id: string;
  name: string;
  address: string | null;
  postcode: string | null;
  borough: string | null;
  lat: number;
  lng: number;
  booking_url: string | null;
  is_active: boolean;
  updated_at: string;
}

export interface Facility {
  id: string;
  venue_id: string;
  provider_id: string;
  external_id: string;
  name: string;
  sport: Sport;
  indoor: boolean | null;
  floodlit: boolean | null;
  surface: string | null;
}

export interface Slot {
  id: string;
  facility_id: string;
  venue_id: string;
  provider_id: string;
  external_id: string;
  start_at: string;
  end_at: string;
  remaining: number | null;
  capacity: number | null;
  price_pence: number | null;
  booking_url: string | null;
  source_modified_at: string | null;
  updated_at: string;
}

// One row returned by the search_slots() database function.
export interface SearchSlotRow {
  venue_id: string;
  venue_name: string;
  venue_booking_url: string | null;
  distance_m: number;
  facility_id: string;
  facility_name: string;
  slot_id: string;
  slot_start: string;
  slot_end: string;
  remaining: number | null;
  price_pence: number | null;
  slot_booking_url: string | null;
}
