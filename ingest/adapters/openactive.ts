// Phase 3: FacilityUse/Slot (OpenActive) -> our shared shape. Serves Better/GLL
// and any other provider that publishes the same standard.
//
// Only this file knows Better's JSON shape (CLAUDE.md architecture rule 2).
// Everything it returns is already in the Venue/Facility/Slot shape from
// lib/types.ts, so ingest/core/upsert.ts never has to know where a row came
// from.
import type { RpdeItem } from "../core/rpde.ts";
import type { Sport } from "../../lib/types.ts";
import type {
  ParsedFacility,
  ParsedFacilityUseItem,
  ParsedSlot,
  ParsedSlotItem,
  ParsedVenue,
} from "../core/types.ts";

export type { ParsedFacility, ParsedFacilityUseItem, ParsedSlot, ParsedSlotItem, ParsedVenue };

// -- The slice of OpenActive's FacilityUse/Slot JSON-LD we actually read --
// (the real responses have many more fields we don't need: opening hours,
// accessibility amenities, telephone numbers, etc.)

interface GeoCoordinatesData {
  latitude: number;
  longitude: number;
}

interface PostalAddressData {
  streetAddress?: string;
  postalCode?: string;
  addressRegion?: string;
}

interface PlaceData {
  "@id": string;
  name: string;
  address?: PostalAddressData;
  geo?: GeoCoordinatesData;
}

interface IndividualFacilityUseData {
  "@id": string;
  name: string;
  url?: string;
}

interface FacilityTypeConcept {
  prefLabel?: string;
}

export interface FacilityUseData {
  name: string;
  url?: string;
  facilityType?: FacilityTypeConcept[];
  location?: PlaceData;
  individualFacilityUse?: IndividualFacilityUseData[];
}

interface OfferData {
  price?: number;
}

export interface SlotData {
  startDate: string;
  endDate: string;
  facilityUse: string; // the IndividualFacilityUse's "@id" this slot is on
  offers?: OfferData[];
  remainingUses?: number;
  maximumUses?: number;
}

// A rough Greater London bounding box. Better's own addressRegion field
// isn't reliable for this (e.g. Croydon addresses say region "Croydon", not
// "London"), but every FacilityUse carries real coordinates, so a bounding
// box on those is simpler and more accurate. Good enough for a personal
// tool; tighten with a proper boundary polygon later if it ever matters.
const GREATER_LONDON_BBOX = {
  minLat: 51.28,
  maxLat: 51.7,
  minLng: -0.51,
  maxLng: 0.33,
};

function isGreaterLondon(lat: number, lng: number): boolean {
  return (
    lat >= GREATER_LONDON_BBOX.minLat &&
    lat <= GREATER_LONDON_BBOX.maxLat &&
    lng >= GREATER_LONDON_BBOX.minLng &&
    lng <= GREATER_LONDON_BBOX.maxLng
  );
}

// The name is the primary signal (facilityType is a secondary hint, not
// fully trusted on its own — Better's own data sometimes puts unrelated
// activities under a shared facilityType). Table tennis is excluded
// explicitly, since "tennis" alone would otherwise match it too.
function detectSport(name: string, facilityTypeLabels: string[]): Sport | null {
  const haystack = `${name} ${facilityTypeLabels.join(" ")}`;
  if (/table\s*tennis/i.test(haystack)) return null;
  if (/padel/i.test(haystack)) return "padel";
  if (/pickleball/i.test(haystack)) return "pickleball";
  if (/tennis/i.test(haystack)) return "tennis";
  return null;
}

function detectFloodlit(facilityName: string, individualName: string): boolean | null {
  return /floodlit/i.test(facilityName) || /floodlit/i.test(individualName) ? true : null;
}

function detectIndoor(individualName: string): boolean | null {
  if (/indoor/i.test(individualName)) return true;
  if (/outdoor/i.test(individualName)) return false;
  return null;
}

export function parseFacilityUseItem(
  item: RpdeItem<FacilityUseData>
): ParsedFacilityUseItem | null {
  if (item.state === "deleted" || !item.data) {
    return { kind: "delete_unsupported" };
  }

  const data = item.data;
  const typeLabels = (data.facilityType ?? [])
    .map((t) => t.prefLabel)
    .filter((label): label is string => Boolean(label));
  const sport = detectSport(data.name, typeLabels);
  if (!sport) return null;

  const location = data.location;
  const geo = location?.geo;
  if (!location || !geo) return null; // can't place it without coordinates
  if (!isGreaterLondon(geo.latitude, geo.longitude)) return null;

  const individualUses = data.individualFacilityUse ?? [];
  if (individualUses.length === 0) return null;

  const venue: ParsedVenue = {
    external_id: location["@id"],
    name: location.name,
    address: location.address?.streetAddress ?? null,
    postcode: location.address?.postalCode ?? null,
    borough: location.address?.addressRegion ?? null,
    lat: geo.latitude,
    lng: geo.longitude,
    booking_url: individualUses[0]?.url ?? data.url ?? null,
  };

  const facilities: ParsedFacility[] = individualUses.map((ifu) => ({
    external_id: ifu["@id"],
    name: ifu.name,
    sport,
    indoor: detectIndoor(ifu.name),
    floodlit: detectFloodlit(data.name, ifu.name),
    surface: null,
  }));

  return { kind: "upsert", venue, facilities };
}

export function parseSlotItem(item: RpdeItem<SlotData>): ParsedSlotItem | null {
  if (item.state === "deleted") {
    return { kind: "delete", external_id: item.id };
  }

  const data = item.data;
  if (!data?.facilityUse || !data.startDate || !data.endDate) return null;

  const priceGbp = data.offers?.[0]?.price;
  const price_pence = priceGbp != null ? Math.round(priceGbp * 100) : null;

  return {
    kind: "upsert",
    slot: {
      facility_external_id: data.facilityUse,
      external_id: item.id,
      start_at: new Date(data.startDate).toISOString(),
      end_at: new Date(data.endDate).toISOString(),
      remaining: data.remainingUses ?? null,
      capacity: data.maximumUses ?? null,
      price_pence,
    },
  };
}

// Moved to core/time.ts (every "venue_list" adapter needs the same
// 8-day/no-past-slots check, not just this one); re-exported so nothing
// importing it from here needs to change.
export { isWithinSyncWindow } from "../core/time.ts";
