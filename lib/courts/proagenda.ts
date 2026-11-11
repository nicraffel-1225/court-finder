// Dukes Meadows' booking system (dukesmeadowscourts.proagenda.com) — a
// coaching-booking platform (ProAgenda) repurposed for court hire. Its real
// data comes from a separate API host, clientapi.proagenda.com, whose paths
// are literally prefixed "nologin" — approved 10 November 2026 for public
// JSON reads, see docs/decisions.md. One fixed venue, three fixed courts;
// not a general ProAgenda crawler.
//
// Fetched live on each page load — there's no database (see decisions.md,
// 10 November 2026) — so this returns what to show right now rather than
// writing anything anywhere.
import { politeFetchText } from "./http.ts";
import { isWithinSyncWindow, londonNaiveToUtcIso, nextNDaysYmd } from "./time.ts";
import type { CourtSlot, CourtVenue } from "./types.ts";

const SYNC_WINDOW_DAYS = 8;
const RESOURCE_TIME_SLOT_URL = "https://clientapi.proagenda.com/api/resource/getResourceTimeSlot";

export const DUKES_MEADOWS_VENUE = {
  locationGuid: "0875053b-6d1e-49fd-b572-ffd7f19c83d1",
  name: "Dukes Meadows",
  address: "Dan Mason Drive, Chiswick",
  postcode: "W4 2RY",
  lat: 51.4773951,
  lng: -0.2519156,
  bookingUrl: "https://dukesmeadowscourts.proagenda.com/schedule?location_id=0875053b-6d1e-49fd-b572-ffd7f19c83d1",
};

export interface ProagendaCourt {
  proGuid: string;
  name: string;
  surface: string;
}

// Confirmed by hand against dukesmeadows.com: all three are tennis courts
// (Poraflex is an acrylic tennis surface here, not a padel one — checked
// before assuming otherwise, since Poraflex is padel-branded elsewhere).
export const DUKES_MEADOWS_COURTS: ProagendaCourt[] = [
  { proGuid: "799cca53-457b-4b42-8ac5-4394b7b9230c", name: "Indoor Acrylic Court", surface: "Acrylic" },
  { proGuid: "6b81d45c-af46-4b5a-8e99-ae06297fed0f", name: "Outdoor Clay Court", surface: "Clay" },
  { proGuid: "27d406ef-72a2-486f-bf64-801bbd320fbe", name: "Outdoor Poraflex", surface: "Acrylic (Poraflex)" },
];

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
  facilityName: string
): CourtSlot[] {
  const slots: CourtSlot[] = [];
  for (const block of blocks) {
    const amount = block.resources[0]?.amount ?? 0;
    if (amount <= 0) continue;
    slots.push({
      facilityName,
      startAt: londonNaiveToUtcIso(block.startDate),
      endAt: londonNaiveToUtcIso(block.endDate),
      remaining: amount,
      pricePence: null, // not given by this endpoint
    });
  }
  return slots;
}

export async function fetchProagendaDaySlots(court: ProagendaCourt, dateYmd: string): Promise<CourtSlot[]> {
  const body = JSON.stringify(buildRequestBody(dateYmd, court.proGuid));
  const text = await politeFetchText(RESOURCE_TIME_SLOT_URL, { method: "POST", body });
  const blocks: ResourceTimeSlotResponseBlock[] = JSON.parse(text);
  if (!Array.isArray(blocks)) {
    console.warn(`ProAgenda: unexpected response shape for ${court.name} on ${dateYmd}, skipping that day`);
    return [];
  }
  return parseResourceTimeSlotResponse(blocks, `${court.name} (${court.surface})`);
}

export async function getDukesMeadowsVenue(): Promise<CourtVenue> {
  const now = new Date();
  const days = nextNDaysYmd(SYNC_WINDOW_DAYS, now);

  const perCourt = await Promise.all(
    DUKES_MEADOWS_COURTS.map(async (court) => {
      const perDay = await Promise.all(
        days.map(async (dateYmd) => {
          try {
            return await fetchProagendaDaySlots(court, dateYmd);
          } catch (err) {
            console.warn(`ProAgenda: failed to fetch ${court.name} on ${dateYmd}:`, err);
            return [];
          }
        })
      );
      return perDay.flat();
    })
  );

  const slots = perCourt
    .flat()
    .filter((slot) => isWithinSyncWindow(slot.startAt, now)) // today's grid includes already-past hours
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  return {
    name: DUKES_MEADOWS_VENUE.name,
    address: DUKES_MEADOWS_VENUE.address,
    postcode: DUKES_MEADOWS_VENUE.postcode,
    lat: DUKES_MEADOWS_VENUE.lat,
    lng: DUKES_MEADOWS_VENUE.lng,
    bookingUrl: DUKES_MEADOWS_VENUE.bookingUrl,
    sport: "tennis",
    slots,
  };
}
