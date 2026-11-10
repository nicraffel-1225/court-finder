// The LTA's own court-booking widget (www.lta.org.uk/play/book-a-tennis-court)
// calls a clean public JSON endpoint with no login — approved 10 November
// 2026, see docs/decisions.md. Scoped to the specific venues Nic asked
// about, not a general crawl of every LTA venue (CLAUDE.md: personal use,
// smallest useful change).
//
// Only this file knows the LTA widget's JSON shape (CLAUDE.md architecture
// rule 2).
import { politeFetchJson } from "../core/http.ts";
import { isWithinSyncWindow, londonNaiveToUtcIso, nextNDaysYmd } from "../core/time.ts";
import type { ParsedFacility, ParsedSlot, ParsedVenue } from "../core/types.ts";
import {
  deleteFutureSlotsForFacility,
  upsertFacility,
  upsertSlot,
  upsertVenue,
} from "../core/upsert.ts";

const PROVIDER_ID = "lta";
const SYNC_WINDOW_DAYS = 8;

export interface LtaVenueConfig {
  venueId: string;
  name: string;
  address: string;
  postcode: string;
  borough: string;
  lat: number;
  lng: number;
  bookingUrl: string;
}

export const LTA_VENUES: LtaVenueConfig[] = [
  {
    venueId: "13496b8a-fc3f-4d46-b396-1bc11dc105c3",
    name: "Ravenscourt Park",
    address: "Ravenscourt Park",
    postcode: "W6 0UL",
    borough: "Hammersmith and Fulham",
    lat: 51.4970754,
    lng: -0.2385688,
    bookingUrl:
      "https://www.lta.org.uk/play/book-a-tennis-court/courts/ravenscourt-park_13496b8a-fc3f-4d46-b396-1bc11dc105c3/",
  },
  {
    venueId: "02ede91d-f847-442b-ae79-0744941d4e59",
    name: "Southfield Rec",
    address: "Southfield Recreation Ground",
    postcode: "W4 5LD",
    borough: "Hounslow",
    lat: 51.5026387,
    lng: -0.2636881,
    bookingUrl:
      "https://www.lta.org.uk/play/book-a-tennis-court/courts/southfield-rec_02ede91d-f847-442b-ae79-0744941d4e59/",
  },
];

export function parseLtaVenue(venue: LtaVenueConfig): ParsedVenue {
  return {
    external_id: venue.venueId,
    name: venue.name,
    address: venue.address,
    postcode: venue.postcode,
    borough: venue.borough,
    lat: venue.lat,
    lng: venue.lng,
    booking_url: venue.bookingUrl,
  };
}

interface LtaAvailableSlot {
  slotId: string;
  startTime: string; // naive Europe/London, e.g. "2026-11-11T09:00:00"
  endTime: string;
  price: number; // pounds
}

interface LtaCourtDetail {
  id: string;
  name: string;
  type: string; // "Outdoor" | "Indoor"
  surface: string | null;
  availableSlots: LtaAvailableSlot[];
}

interface LtaAvailabilityResponse {
  venueDetails: LtaCourtDetail[];
}

export function parseLtaCourt(court: LtaCourtDetail): ParsedFacility {
  return {
    external_id: court.id,
    name: court.name,
    sport: "tennis",
    indoor: court.type.toLowerCase() === "indoor",
    floodlit: null, // not given by this endpoint
    surface: court.surface ?? null,
  };
}

export function parseLtaSlot(slot: LtaAvailableSlot, facilityExternalId: string): ParsedSlot {
  return {
    facility_external_id: facilityExternalId,
    external_id: slot.slotId,
    start_at: londonNaiveToUtcIso(slot.startTime),
    end_at: londonNaiveToUtcIso(slot.endTime),
    remaining: 1, // the endpoint only lists bookable slots, not a spare count
    capacity: 1,
    price_pence: Math.round(slot.price * 100),
  };
}

export async function fetchLtaDay(
  venue: LtaVenueConfig,
  dateYmd: string
): Promise<{ facilities: ParsedFacility[]; slots: ParsedSlot[] }> {
  const url = `https://www.lta.org.uk/api/courtdetail/availability?venueid=${venue.venueId}&date=${dateYmd}`;
  const data = await politeFetchJson<LtaAvailabilityResponse>(url);
  const facilities: ParsedFacility[] = [];
  const slots: ParsedSlot[] = [];
  for (const court of data.venueDetails) {
    facilities.push(parseLtaCourt(court));
    for (const slot of court.availableSlots) {
      slots.push(parseLtaSlot(slot, court.id));
    }
  }
  return { facilities, slots };
}

export async function syncLtaProvider(): Promise<{ upserted: number; deleted: number }> {
  let upserted = 0;
  let deleted = 0;
  const now = new Date();
  const windowStartIso = now.toISOString();
  const days = nextNDaysYmd(SYNC_WINDOW_DAYS, now);

  for (const venueConfig of LTA_VENUES) {
    const venueId = await upsertVenue(PROVIDER_ID, parseLtaVenue(venueConfig));

    const facilitiesByExternalId = new Map<string, ParsedFacility>();
    const slotsByFacility = new Map<string, ParsedSlot[]>();

    for (const dateYmd of days) {
      const { facilities, slots } = await fetchLtaDay(venueConfig, dateYmd);
      for (const facility of facilities) facilitiesByExternalId.set(facility.external_id, facility);
      for (const slot of slots) {
        if (!isWithinSyncWindow(slot.start_at, now)) continue; // today's grid includes already-past hours
        const list = slotsByFacility.get(slot.facility_external_id) ?? [];
        list.push(slot);
        slotsByFacility.set(slot.facility_external_id, list);
      }
    }

    for (const facility of facilitiesByExternalId.values()) {
      const facilityId = await upsertFacility(PROVIDER_ID, venueId, facility);
      deleted += await deleteFutureSlotsForFacility(PROVIDER_ID, facilityId, windowStartIso);
      const knownFacility = { id: facilityId, venue_id: venueId };
      for (const slot of slotsByFacility.get(facility.external_id) ?? []) {
        await upsertSlot(PROVIDER_ID, knownFacility, slot);
        upserted++;
      }
    }
  }

  return { upserted, deleted };
}
