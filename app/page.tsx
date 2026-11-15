import Link from "next/link";
import { Suspense } from "react";
import { DayStrip } from "@/components/DayStrip";
import { parseFacilityLabel } from "@/components/facility";
import { FilterProvider } from "@/components/FilterProvider";
import { joinWithAnd, londonTimeLabel, postcodeOutcode, relativeDayLabelFromIso } from "@/components/london";
import { Logo } from "@/components/Logo";
import { SheetHeader } from "@/components/SheetHeader";
import { TimeChips } from "@/components/TimeChips";
import { VenueRows } from "@/components/VenueRows";
import { CHISWICK_VENUE, getChiswickVenue } from "@/lib/courts/clubspark";
import { LINK_ONLY_VENUES } from "@/lib/courts/linkOnly";
import { getLtaVenue, LTA_VENUES, type LtaVenueConfig } from "@/lib/courts/lta";
import { DUKES_MEADOWS_VENUE, getDukesMeadowsVenue } from "@/lib/courts/proagenda";
import { nextNDaysYmd } from "@/lib/courts/time";
import type { CourtSlot } from "@/lib/courts/types";

// Every visit should see real current availability, not a snapshot baked
// in at build/deploy time.
export const dynamic = "force-dynamic";

const LIVE_VENUE_META = [...LTA_VENUES, DUKES_MEADOWS_VENUE, CHISWICK_VENUE];

function siteNameFromUrl(url: string): string {
  if (url.includes("better.org.uk")) return "Better";
  if (url.includes("playtomic")) return "Playtomic";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "this site";
  }
}

function RefreshIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 4v6h6M20 20v-6h-6M5.5 15a7 7 0 0 0 12.3 2.5M18.5 9A7 7 0 0 0 6.2 6.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface EarliestSlot {
  slot: CourtSlot;
  venueName: string;
  bookingUrl: string;
  providerLabel: string;
}

async function findEarliestSlot(): Promise<EarliestSlot | null> {
  const candidates: EarliestSlot[] = [];

  await Promise.all([
    ...LTA_VENUES.map(async (cfg) => {
      try {
        const venue = await getLtaVenue(cfg);
        if (venue.slots[0]) {
          candidates.push({ slot: venue.slots[0], venueName: venue.name, bookingUrl: venue.bookingUrl, providerLabel: "LTA Play" });
        }
      } catch (err) {
        console.warn(`Next free court: couldn't load ${cfg.name}:`, err);
      }
    }),
    (async () => {
      try {
        const venue = await getDukesMeadowsVenue();
        if (venue.slots[0]) {
          candidates.push({ slot: venue.slots[0], venueName: venue.name, bookingUrl: venue.bookingUrl, providerLabel: "ProAgenda" });
        }
      } catch (err) {
        console.warn("Next free court: couldn't load Dukes Meadows:", err);
      }
    })(),
    (async () => {
      try {
        const venue = await getChiswickVenue();
        if (venue.slots[0]) {
          candidates.push({ slot: venue.slots[0], venueName: venue.name, bookingUrl: venue.bookingUrl, providerLabel: "Park Sports" });
        }
      } catch (err) {
        console.warn("Next free court: couldn't load Chiswick:", err);
      }
    })(),
  ]);

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.slot.startAt.localeCompare(b.slot.startAt));
  return candidates[0];
}

async function NextFreeCourt() {
  const earliest = await findEarliestSlot();
  const areas = joinWithAnd(
    Array.from(new Set(LIVE_VENUE_META.map((v) => postcodeOutcode(v.postcode)).filter((a): a is string => !!a)))
  );

  if (!earliest) {
    return (
      <section className="next-free">
        <p className="next-free-kicker">{areas ? `Near ${areas}` : "Nearby courts"}</p>
        <p className="next-free-headline">Nothing free in the next 8 days.</p>
      </section>
    );
  }

  const days = nextNDaysYmd(2);
  const dayLabel = relativeDayLabelFromIso(earliest.slot.startAt, days[0], days[1]);
  const timeLabel = londonTimeLabel(earliest.slot.startAt);
  const { name: courtName } = parseFacilityLabel(earliest.slot.facilityName);

  return (
    <section className="next-free">
      <p className="next-free-kicker">{areas ? `Next free court near ${areas}` : "Next free court"}</p>
      <p className="next-free-headline">
        {dayLabel} at {timeLabel}, {earliest.venueName} {courtName}
      </p>
      <a className="next-free-button" href={earliest.bookingUrl} target="_blank" rel="noopener noreferrer">
        Book on {earliest.providerLabel} →
      </a>
    </section>
  );
}

function NextFreeSkeleton() {
  return (
    <section className="next-free next-free--loading">
      <p className="next-free-kicker">Checking live times…</p>
      <p className="next-free-headline">Finding the next free court…</p>
    </section>
  );
}

function VenueSkeleton({ name }: { name: string }) {
  return (
    <div className="venue-block venue-block--loading">
      <div className="venue-row">
        <div className="venue-row-name">{name}</div>
        <div className="venue-row-meta">Checking live times…</div>
      </div>
      <div className="skeleton-cells" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="skeleton-cell" />
        ))}
      </div>
    </div>
  );
}

function VenueLoadError({ name, providerLabel, bookingUrl }: { name: string; providerLabel: string; bookingUrl: string }) {
  return (
    <div className="venue-block venue-block--error">
      <p>
        Couldn&apos;t load live times for {name} just now.{" "}
        <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
          Open {providerLabel}
        </a>{" "}
        to check.
      </p>
    </div>
  );
}

async function LtaVenueSection({ venueConfig }: { venueConfig: LtaVenueConfig }) {
  let venue;
  try {
    venue = await getLtaVenue(venueConfig);
  } catch (err) {
    console.warn(`Couldn't load ${venueConfig.name}:`, err);
    return <VenueLoadError name={venueConfig.name} providerLabel="LTA Play" bookingUrl={venueConfig.bookingUrl} />;
  }
  return <VenueRows venue={venue} venueKey={venue.name} providerLabel="LTA Play" />;
}

async function DukesMeadowsSection() {
  let venue;
  try {
    venue = await getDukesMeadowsVenue();
  } catch (err) {
    console.warn("Couldn't load Dukes Meadows:", err);
    return (
      <VenueLoadError name={DUKES_MEADOWS_VENUE.name} providerLabel="ProAgenda" bookingUrl={DUKES_MEADOWS_VENUE.bookingUrl} />
    );
  }
  return <VenueRows venue={venue} venueKey={venue.name} providerLabel="ProAgenda" />;
}

async function ChiswickSection() {
  let venue;
  try {
    venue = await getChiswickVenue();
  } catch (err) {
    console.warn("Couldn't load Chiswick:", err);
    return <VenueLoadError name={CHISWICK_VENUE.name} providerLabel="Park Sports" bookingUrl={CHISWICK_VENUE.bookingUrl} />;
  }
  return <VenueRows venue={venue} venueKey={venue.name} providerLabel="Park Sports" />;
}

export default function Home() {
  const days = nextNDaysYmd(8);
  const checkedAt = londonTimeLabel(new Date().toISOString());

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <Logo />
          <div className="site-header-meta">
            <span className="checked-at">Times checked at {checkedAt}</span>
            <Link className="check-again" href="/" aria-label="Check times again">
              <RefreshIcon />
              <span className="check-again-label">Check again</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="page">
        <Suspense fallback={<NextFreeSkeleton />}>
          <NextFreeCourt />
        </Suspense>

        <FilterProvider days={days}>
          <DayStrip />
          <TimeChips />
          <div className="court-sheet">
            <SheetHeader />
            {LTA_VENUES.map((venueConfig) => (
              <Suspense key={venueConfig.venueId} fallback={<VenueSkeleton name={venueConfig.name} />}>
                <LtaVenueSection venueConfig={venueConfig} />
              </Suspense>
            ))}
            <Suspense fallback={<VenueSkeleton name="Dukes Meadows" />}>
              <DukesMeadowsSection />
            </Suspense>
            <Suspense fallback={<VenueSkeleton name="Chiswick" />}>
              <ChiswickSection />
            </Suspense>
          </div>
        </FilterProvider>

        <section className="link-only">
          <h2 className="link-only-heading">Check these on their own sites</h2>
          <p className="link-only-intro">
            These venues don&apos;t let other sites read their times, so they open in a new tab.
          </p>
          {LINK_ONLY_VENUES.map((venue) => (
            <article key={venue.name} className="link-only-card">
              <div>
                <h3>{venue.name}</h3>
                <p className="link-only-meta">
                  {venue.postcode ? `${venue.postcode}, ` : ""}
                  {venue.sport}
                </p>
              </div>
              <a className="link-only-link" href={venue.bookingUrl} target="_blank" rel="noopener noreferrer">
                Open {siteNameFromUrl(venue.bookingUrl)} →
              </a>
            </article>
          ))}
        </section>

        <footer className="site-footer">
          <p>Court Finder shows free courts. Booking and payment happen on each venue&apos;s own site.</p>
        </footer>
      </main>
    </>
  );
}
