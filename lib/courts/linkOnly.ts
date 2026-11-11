// Venues we show but can't read live availability for — each one's own
// robots.txt blocks the page that shows times (see decisions.md,
// 10 November 2026). Shown with a link to check and book directly.
import type { LinkOnlyVenue } from "./types.ts";

export const LINK_ONLY_VENUES: LinkOnlyVenue[] = [
  {
    name: "Gunnersbury Park Sports",
    address: "Gunnersbury Park",
    postcode: "TW8 9AG",
    lat: 51.4963608,
    lng: -0.2901200,
    bookingUrl: "https://www.better.org.uk/leisure-centre/london/gunnersbury-park/gunnersbury-park-sports/timetable",
    sport: "tennis",
    note: "Better's own robots.txt disallows the timetable page, so we can't read live times here.",
  },
  {
    name: "Rocks Lane (Bishops Park)",
    address: "Rocks Lane, East Sheen",
    postcode: "SW13 0DB",
    lat: 51.4738168,
    lng: -0.2381853,
    bookingUrl: "https://playtomic.com/clubs/rocks-lane-bishops-park",
    sport: "padel",
    note: "Playtomic's own robots.txt disallows the availability API the page itself calls, so we can't read live times here.",
  },
];
