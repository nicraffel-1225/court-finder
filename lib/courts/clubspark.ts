// Chiswick's ClubSpark-powered booking system (chiswick.parksports.co.uk) serves
// a public JSON endpoint directly: no login, robots.txt fully open, and (checked
// by hand, 14 November 2026) no Cloudflare challenge on this endpoint, unlike the
// clubspark.lta.org.uk check on 5 November that needed Playwright page-reading.
// See docs/decisions.md. One fixed venue, tennis courts only (Nic's choice —
// Chiswick also has pickleball courts on the same system, not shown here).
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

export const CHISWICK_VENUE = {
  venueSlug: "chiswick_parksports_co_uk",
  name: "Chiswick",
  address: "Chiswick House Grounds, A4 entrance",
  postcode: "W4 2RP",
  lat: 51.4862,
  lng: -0.2616,
  bookingUrl: "https://chiswick.parksports.co.uk/Booking/BookByDate",
};

// Confirmed by hand against the real booking page's own rendering (its session
// title reads "Booked Category: Booking" for occupied hours): Category 0 is the
// only one that means free/bookable. 1000 ("Booking") is already booked, 8000 is
// outside opening hours, 2000 is a coaching class — none of those are available.
const FREE_SESSION_CATEGORY = 0;

interface ClubSparkSession {
  Category: number;
  StartTime: number; // minutes from midnight, naive Europe/London
  EndTime: number;
  Interval: number;
  Capacity: number;
  CourtCost: number; // pounds, per Interval-sized chunk
}

interface ClubSparkDay {
  Date: string; // naive Europe/London midnight, e.g. "2026-11-14T00:00:00"
  Sessions: ClubSparkSession[];
}

interface ClubSparkResource {
  Name: string;
  ResourceGroupID: string;
  Days: ClubSparkDay[];
}

interface ClubSparkResourceGroup {
  ID: string;
  Name: string;
}

interface ClubSparkVenueSessionsResponse {
  ResourceGroups: ClubSparkResourceGroup[];
  Resources: ClubSparkResource[];
}

function minutesToNaiveIso(dateYmd: string, minutesFromMidnight: number): string {
  const hh = Math.floor(minutesFromMidnight / 60).toString().padStart(2, "0");
  const mm = (minutesFromMidnight % 60).toString().padStart(2, "0");
  return `${dateYmd}T${hh}:${mm}:00`;
}

// A free session can cover several bookable hours in one entry (e.g. a single
// 08:00-16:00 block at Interval 60, seen in practice) — split it into the
// Interval-sized chunks it actually represents, each at the same per-chunk price.
export function parseClubSparkDaySessions(
  dateYmd: string,
  sessions: ClubSparkSession[],
  facilityName: string
): CourtSlot[] {
  const slots: CourtSlot[] = [];
  for (const session of sessions) {
    if (session.Category !== FREE_SESSION_CATEGORY) continue;
    const interval = session.Interval > 0 ? session.Interval : session.EndTime - session.StartTime;
    for (let start = session.StartTime; start < session.EndTime; start += interval) {
      const end = Math.min(start + interval, session.EndTime);
      slots.push({
        facilityName,
        startAt: londonNaiveToUtcIso(minutesToNaiveIso(dateYmd, start)),
        endAt: londonNaiveToUtcIso(minutesToNaiveIso(dateYmd, end)),
        remaining: session.Capacity,
        pricePence: Math.round(session.CourtCost * 100),
      });
    }
  }
  return slots;
}

export async function fetchClubSparkVenueSessions(
  venueSlug: string,
  startYmd: string,
  endYmd: string
): Promise<ClubSparkVenueSessionsResponse> {
  const url = `https://chiswick.parksports.co.uk/v0/VenueBooking/${venueSlug}/GetVenueSessions?resourceID=&startDate=${startYmd}&endDate=${endYmd}&roleId=`;
  return politeFetchJson<ClubSparkVenueSessionsResponse>(url);
}

export async function getChiswickVenue(): Promise<CourtVenue> {
  return cached(`clubspark:${CHISWICK_VENUE.venueSlug}`, CACHE_TTL_MS, fetchChiswickVenueLive);
}

function venueWithSlots(slots: CourtSlot[]): CourtVenue {
  return {
    name: CHISWICK_VENUE.name,
    address: CHISWICK_VENUE.address,
    postcode: CHISWICK_VENUE.postcode,
    lat: CHISWICK_VENUE.lat,
    lng: CHISWICK_VENUE.lng,
    bookingUrl: CHISWICK_VENUE.bookingUrl,
    sport: "tennis",
    slots,
  };
}

async function fetchChiswickVenueLive(): Promise<CourtVenue> {
  const now = new Date();
  const days = nextNDaysYmd(SYNC_WINDOW_DAYS, now);
  // One request covers every court for the whole window — this endpoint doesn't
  // need the per-day/per-court fetching LTA's and ProAgenda's do.
  const data = await fetchClubSparkVenueSessions(CHISWICK_VENUE.venueSlug, days[0], days[days.length - 1]);

  if (!Array.isArray(data.ResourceGroups) || !Array.isArray(data.Resources)) {
    throw new Error("ClubSpark (Chiswick): GetVenueSessions response wasn't shaped as expected");
  }
  const tennisGroup = data.ResourceGroups.find((g) => g.Name === "Tennis");
  if (!tennisGroup) {
    throw new Error("ClubSpark (Chiswick): no 'Tennis' resource group in the response");
  }

  const slots: CourtSlot[] = [];
  for (const resource of data.Resources) {
    if (resource.ResourceGroupID !== tennisGroup.ID) continue;
    if (!Array.isArray(resource.Days)) continue;
    for (const day of resource.Days) {
      if (!Array.isArray(day.Sessions)) continue;
      slots.push(...parseClubSparkDaySessions(day.Date.slice(0, 10), day.Sessions, resource.Name));
    }
  }

  const filtered = slots
    .filter((slot) => isWithinSyncWindow(slot.startAt, now))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  return venueWithSlots(filtered);
}
