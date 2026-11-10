// Dukes Meadows' booking system (dukesmeadowscourts.proagenda.com) — a
// coaching-booking platform (ProAgenda) repurposed for court hire. Its real
// data comes from a separate API host, clientapi.proagenda.com, whose paths
// are literally prefixed "nologin" — approved 10 November 2026 for public
// JSON reads, see docs/decisions.md. One fixed venue, three fixed courts;
// not a general ProAgenda crawler (CLAUDE.md: personal use, smallest useful
// change).
//
// Only this file knows ProAgenda's JSON shape (CLAUDE.md architecture
// rule 2).
import { politeFetchText } from "../core/http.ts";
import { isWithinSyncWindow, londonNaiveToUtcIso, nextNDaysYmd } from "../core/time.ts";
import type { ParsedFacility, ParsedSlot, ParsedVenue } from "../core/types.ts";
import {
  deleteFutureSlotsForFacility,
  upsertFacility,
  upsertSlot,
  upsertVenue,
} from "../core/upsert.ts";

const PROVIDER_ID = "proagenda";
const SYNC_WINDOW_DAYS = 8;
const RESOURCE_TIME_SLOT_URL = "https://clientapi.proagenda.com/api/resource/getResourceTimeSlot";

export const DUKES_MEADOWS_VENUE = {
  externalId: "0875053b-6d1e-49fd-b572-ffd7f19c83d1",
  locationGuid: "0875053b-6d1e-49fd-b572-ffd7f19c83d1",
  name: "Dukes Meadows",
  address: "Dan Mason Drive, Chiswick",
  postcode: "W4 2RY",
  borough: "Hounslow",
  lat: 51.4773951,
  lng: -0.2519156,
  bookingUrl: "https://dukesmeadowscourts.proagenda.com/schedule?location_id=0875053b-6d1e-49fd-b572-ffd7f19c83d1",
};

export interface ProagendaCourt {
  proGuid: string;
  name: string;
  indoor: boolean;
  surface: string;
  floodlit: boolean | null;
}

// Confirmed by hand against dukesmeadows.com: all three are tennis courts
// (Poraflex is an acrylic tennis surface here, not a padel one — checked
// before assuming otherwise, since Poraflex is padel-branded elsewhere).
export const DUKES_MEADOWS_COURTS: ProagendaCourt[] = [
  {
    proGuid: "799cca53-457b-4b42-8ac5-4394b7b9230c",
    name: "Indoor Acrylic Court",
    indoor: true,
    surface: "Acrylic",
    floodlit: null,
  },
  {
    proGuid: "6b81d45c-af46-4b5a-8e99-ae06297fed0f",
    name: "Outdoor Clay Court",
    indoor: false,
    surface: "Clay",
    floodlit: true,
  },
  {
    proGuid: "27d406ef-72a2-486f-bf64-801bbd320fbe",
    name: "Outdoor Poraflex",
    indoor: false,
    surface: "Acrylic (Poraflex)",
    floodlit: true,
  },
];

export function parseProagendaVenue(): ParsedVenue {
  return {
    external_id: DUKES_MEADOWS_VENUE.externalId,
    name: DUKES_MEADOWS_VENUE.name,
    address: DUKES_MEADOWS_VENUE.address,
    postcode: DUKES_MEADOWS_VENUE.postcode,
    borough: DUKES_MEADOWS_VENUE.borough,
    lat: DUKES_MEADOWS_VENUE.lat,
    lng: DUKES_MEADOWS_VENUE.lng,
    booking_url: DUKES_MEADOWS_VENUE.bookingUrl,
  };
}

export function parseProagendaCourt(court: ProagendaCourt): ParsedFacility {
  return {
    external_id: court.proGuid,
    name: court.name,
    sport: "tennis",
    indoor: court.indoor,
    floodlit: court.floodlit,
    surface: court.surface,
  };
}

// The site itself always requests this same 07:00-21:00 window regardless
// of the day, and an hour outside real opening hours just comes back with
// amount 0 (treated as unavailable) rather than an error — so there's no
// need to look up each day's real opening hours first.
const HOURLY_STARTS = Array.from({ length: 15 }, (_, i) => 7 + i);

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

interface ResourceTimeSlotRequestBlock {
  agendaBoxSize: number;
  startDate: string;
  endDate: string;
  proGuid: string;
  locationGuid: string;
}

function buildRequestBody(dateYmd: string, proGuid: string): ResourceTimeSlotRequestBlock[] {
  const [y, m, d] = dateYmd.split("-");
  return HOURLY_STARTS.map((hour) => ({
    agendaBoxSize: 60,
    startDate: `${y}-${m}-${d}T${pad2(hour)}:00:00`,
    endDate: `${y}-${m}-${d}T${pad2(hour + 1)}:00:00`,
    proGuid,
    locationGuid: DUKES_MEADOWS_VENUE.locationGuid,
  }));
}

interface ResourceTimeSlotResponseBlock {
  startDate: string;
  endDate: string;
  resources: { amount: number | null }[];
}

export function parseResourceTimeSlotResponse(
  blocks: ResourceTimeSlotResponseBlock[],
  proGuid: string
): ParsedSlot[] {
  const slots: ParsedSlot[] = [];
  for (const block of blocks) {
    const amount = block.resources[0]?.amount ?? 0;
    if (amount <= 0) continue;
    slots.push({
      facility_external_id: proGuid,
      external_id: `${proGuid}-${block.startDate}`,
      start_at: londonNaiveToUtcIso(block.startDate),
      end_at: londonNaiveToUtcIso(block.endDate),
      remaining: amount,
      capacity: null, // the endpoint gives a remaining count, not a total
      price_pence: null, // not given by this endpoint
    });
  }
  return slots;
}

export async function fetchProagendaDay(court: ProagendaCourt, dateYmd: string): Promise<ParsedSlot[]> {
  const body = JSON.stringify(buildRequestBody(dateYmd, court.proGuid));
  const text = await politeFetchText(RESOURCE_TIME_SLOT_URL, { method: "POST", body });
  const blocks: ResourceTimeSlotResponseBlock[] = JSON.parse(text);
  return parseResourceTimeSlotResponse(blocks, court.proGuid);
}

export async function syncProagendaProvider(): Promise<{ upserted: number; deleted: number }> {
  let upserted = 0;
  let deleted = 0;
  const now = new Date();
  const windowStartIso = now.toISOString();
  const days = nextNDaysYmd(SYNC_WINDOW_DAYS, now);

  const venueId = await upsertVenue(PROVIDER_ID, parseProagendaVenue());

  for (const court of DUKES_MEADOWS_COURTS) {
    const facilityId = await upsertFacility(PROVIDER_ID, venueId, parseProagendaCourt(court));
    deleted += await deleteFutureSlotsForFacility(PROVIDER_ID, facilityId, windowStartIso);
    const knownFacility = { id: facilityId, venue_id: venueId };

    for (const dateYmd of days) {
      const slots = await fetchProagendaDay(court, dateYmd);
      for (const slot of slots) {
        if (!isWithinSyncWindow(slot.start_at, now)) continue; // today's grid includes already-past hours
        await upsertSlot(PROVIDER_ID, knownFacility, slot);
        upserted++;
      }
    }
  }

  return { upserted, deleted };
}
