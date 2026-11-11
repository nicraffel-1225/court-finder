import { LINK_ONLY_VENUES } from "@/lib/courts/linkOnly";
import { getLtaVenues } from "@/lib/courts/lta";
import { getDukesMeadowsVenue } from "@/lib/courts/proagenda";
import type { CourtSlot, CourtVenue } from "@/lib/courts/types";

// Every visit should see real current availability, not a snapshot baked
// in at build/deploy time.
export const dynamic = "force-dynamic";

function formatLondon(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", ...options }).format(new Date(iso));
}

function groupByDay(slots: CourtSlot[]): [string, CourtSlot[]][] {
  const byDay = new Map<string, CourtSlot[]>();
  for (const slot of slots) {
    const dayLabel = formatLondon(slot.startAt, { weekday: "long", day: "numeric", month: "long" });
    byDay.set(dayLabel, [...(byDay.get(dayLabel) ?? []), slot]);
  }
  return [...byDay.entries()];
}

function VenueCard({ venue }: { venue: CourtVenue }) {
  const days = groupByDay(venue.slots);
  return (
    <article className="venue-card">
      <h2>{venue.name}</h2>
      <p className="venue-address">
        {venue.address}
        {venue.postcode ? `, ${venue.postcode}` : ""}
      </p>
      {days.length === 0 ? (
        <p className="venue-empty">No free slots found in the next 8 days.</p>
      ) : (
        days.map(([day, slots]) => (
          <div key={day} className="venue-day">
            <h3>{day}</h3>
            <ul className="slot-list">
              {slots.map((slot) => (
                <li key={`${slot.facilityName}-${slot.startAt}`}>
                  {formatLondon(slot.startAt, { hour: "2-digit", minute: "2-digit" })}–
                  {formatLondon(slot.endAt, { hour: "2-digit", minute: "2-digit" })} — {slot.facilityName}
                  {slot.pricePence != null ? ` — £${(slot.pricePence / 100).toFixed(2)}` : ""}
                  {slot.remaining != null && slot.remaining > 1 ? ` (${slot.remaining} available)` : ""}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      <a className="book-link" href={venue.bookingUrl} target="_blank" rel="noopener noreferrer">
        Book at {venue.name} →
      </a>
    </article>
  );
}

export default async function Home() {
  const [ltaVenues, dukesMeadows] = await Promise.all([getLtaVenues(), getDukesMeadowsVenue()]);
  const liveVenues = [...ltaVenues, dukesMeadows];

  return (
    <main className="page">
      <h1>London Court Finder</h1>
      <p className="intro">Live availability for a handful of courts, checked just now. We never book for you.</p>

      {liveVenues.map((venue) => (
        <VenueCard key={venue.name} venue={venue} />
      ))}

      <h2 className="link-only-heading">Other nearby courts (no live times yet)</h2>
      {LINK_ONLY_VENUES.map((venue) => (
        <article key={venue.name} className="venue-card venue-card--link-only">
          <h2>{venue.name}</h2>
          <p className="venue-address">
            {venue.address}
            {venue.postcode ? `, ${venue.postcode}` : ""}
          </p>
          <p className="venue-empty">{venue.note}</p>
          <a className="book-link" href={venue.bookingUrl} target="_blank" rel="noopener noreferrer">
            Check availability at {venue.name} →
          </a>
        </article>
      ))}
    </main>
  );
}
