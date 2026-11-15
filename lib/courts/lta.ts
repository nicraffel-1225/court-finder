// The LTA's own court-booking widget (www.lta.org.uk/play/book-a-tennis-court)
// calls a clean public JSON endpoint with no login — approved 10 November
// 2026, see docs/decisions.md. Scoped to the specific venues Nic asked
// about, not a general crawl of every LTA venue.
//
// Fetched live on each page load — there's no database (see decisions.md,
// 10 November 2026) — so this returns what to show right now rather than
// writing anything anywhere.
import { cached } from "./cache.ts";
import { politeFetchJson } from "./http.ts";
import { isWithinSyncWindow, londonNaiveToUtcIso, nextNDaysYmd } from "./time.ts";
import type { CourtSlot, CourtVenue } from "./types.ts";

const SYNC_WINDOW_DAYS = 8;
const CACHE_TTL_MS = 2 * 60 * 1000;

export interface LtaVenueConfig {
  venueId: string;
  name: string;
  address: string;
  postcode: string;
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
    lat: 51.5026387,
    lng: -0.2636881,
    bookingUrl:
      "https://www.lta.org.uk/play/book-a-tennis-court/courts/southfield-rec_02ede91d-f847-442b-ae79-0744941d4e59/",
  },
  {
    venueId: "62a33f54-1bff-49ac-9e26-67154ef07728",
    name: "Queen's Park",
    address: "Queen's Park",
    postcode: "NW6 6SG",
    lat: 51.5292819,
    lng: -0.2072933,
    bookingUrl:
      "https://www.lta.org.uk/play/book-a-tennis-court/courts/queens-park-tennis-courts_62a33f54-1bff-49ac-9e26-67154ef07728/",
  },
];

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

export function parseLtaSlot(slot: LtaAvailableSlot, facilityName: string): CourtSlot {
  return {
    facilityName,
    startAt: londonNaiveToUtcIso(slot.startTime),
    endAt: londonNaiveToUtcIso(slot.endTime),
    remaining: 1, // the endpoint only lists bookable slots, not a spare count
    pricePence: Math.round(slot.price * 100),
  };
}

export async function fetchLtaDaySlots(venue: LtaVenueConfig, dateYmd: string): Promise<CourtSlot[]> {
  const url = `https://www.lta.org.uk/api/courtdetail/availability?venueid=${venue.venueId}&date=${dateYmd}`;
  const data = await politeFetchJson<LtaAvailabilityResponse>(url);
  if (!Array.isArray(data.venueDetails)) {
    // Seen in practice: the real endpoint occasionally returns something
    // else (not shaped like its usual response) for one day out of several
    // requested concurrently. Not something we control — treat that one
    // day as "nothing found" rather than failing the whole venue.
    console.warn(`LTA: unexpected response shape for ${venue.name} on ${dateYmd}, skipping that day`);
    return [];
  }
  const slots: CourtSlot[] = [];
  for (const court of data.venueDetails) {
    const courtLabel = `${court.name} (${court.surface ?? court.type})`;
    for (const slot of court.availableSlots) {
      slots.push(parseLtaSlot(slot, courtLabel));
    }
  }
  return slots;
}

export async function getLtaVenue(venueConfig: LtaVenueConfig): Promise<CourtVenue> {
  return cached(`lta:${venueConfig.venueId}`, CACHE_TTL_MS, () => fetchLtaVenueLive(venueConfig));
}

async function fetchLtaVenueLive(venueConfig: LtaVenueConfig): Promise<CourtVenue> {
  const now = new Date();
  const days = nextNDaysYmd(SYNC_WINDOW_DAYS, now);
  const perDay = await Promise.all(
    days.map(async (dateYmd) => {
      try {
        return await fetchLtaDaySlots(venueConfig, dateYmd);
      } catch (err) {
        console.warn(`LTA: failed to fetch ${venueConfig.name} on ${dateYmd}:`, err);
        return [];
      }
    })
  );
  const slots = perDay
    .flat()
    .filter((slot) => isWithinSyncWindow(slot.startAt, now)) // today's grid includes already-past hours
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  return {
    name: venueConfig.name,
    address: venueConfig.address,
    postcode: venueConfig.postcode,
    lat: venueConfig.lat,
    lng: venueConfig.lng,
    bookingUrl: venueConfig.bookingUrl,
    sport: "tennis",
    slots,
  };
}

export async function getLtaVenues(): Promise<CourtVenue[]> {
  return Promise.all(LTA_VENUES.map(getLtaVenue));
}
