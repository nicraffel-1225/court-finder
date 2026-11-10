// The shared "parsed" shape every adapter outputs (a subset of lib/types.ts
// that ingestion fills in). Lives here, not in any one adapter file, so a
// non-OpenActive adapter (lta.ts, proagenda.ts) doesn't have to import types
// out of openactive.ts to match ingest/core/upsert.ts's function signatures.
import type { Sport } from "../../lib/types.ts";

export interface ParsedVenue {
  external_id: string;
  name: string;
  address: string | null;
  postcode: string | null;
  borough: string | null;
  lat: number;
  lng: number;
  booking_url: string | null;
}

export interface ParsedFacility {
  external_id: string;
  name: string;
  sport: Sport;
  indoor: boolean | null;
  floodlit: boolean | null;
  surface: string | null;
}

export interface ParsedSlot {
  facility_external_id: string;
  external_id: string;
  start_at: string;
  end_at: string;
  remaining: number | null;
  capacity: number | null;
  price_pence: number | null;
}

export type ParsedFacilityUseItem =
  | { kind: "upsert"; venue: ParsedVenue; facilities: ParsedFacility[] }
  // A deleted FacilityUse carries no data, so there's no way to tell which
  // of its individual courts to remove (our facility rows are keyed by the
  // individual court's own id, not the group id RPDE gives us here). We
  // skip these rather than guess; a court that disappears this way just
  // stops getting fresh slots, so the 90-minute freshness rule still hides
  // it from search.
  | { kind: "delete_unsupported" };

export type ParsedSlotItem =
  | { kind: "upsert"; slot: ParsedSlot }
  | { kind: "delete"; external_id: string };
