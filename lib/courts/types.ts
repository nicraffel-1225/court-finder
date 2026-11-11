// The shapes the website displays. No database involved (see decisions.md,
// 10 November 2026): every page load fetches each venue's real booking
// site live, so there's nothing here shaped like a database row — no ids,
// no "last synced" timestamps, just what to show right now.
export type Sport = "tennis" | "padel" | "pickleball";

export interface CourtSlot {
  facilityName: string;
  startAt: string; // ISO, UTC
  endAt: string; // ISO, UTC
  remaining: number | null;
  pricePence: number | null;
}

export interface CourtVenue {
  name: string;
  address: string | null;
  postcode: string | null;
  lat: number;
  lng: number;
  bookingUrl: string;
  sport: Sport;
  slots: CourtSlot[];
}

// A venue we show on the map/list but can't read live availability for
// (its own robots.txt blocks it — see decisions.md, 10 November 2026).
export interface LinkOnlyVenue {
  name: string;
  address: string | null;
  postcode: string | null;
  lat: number;
  lng: number;
  bookingUrl: string;
  sport: Sport;
  note: string;
}
