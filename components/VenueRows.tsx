"use client";

// Draws one venue's slots from the shared day/time filter in FilterProvider.
// The server component above this still does the actual live fetch — this
// only ever filters data it was already handed as a prop, so changing day
// or time window here never triggers a new request to any booking site.
import { useEffect, useMemo } from "react";
import type { CourtSlot, CourtVenue } from "@/lib/courts/types";
import type { HourlyForecastPoint } from "@/lib/weather/openMeteo";
import { weatherAtHour } from "@/lib/weather/openMeteo";
import { parseFacilityLabel } from "./facility";
import { gridColumns, matchesWindow, useFilters } from "./FilterProvider";
import { londonDayKey, londonHour, londonTimeLabel } from "./london";

interface CourtGroup {
  key: string;
  name: string;
  detail: string | null;
  slots: CourtSlot[];
}

function groupByCourt(slots: CourtSlot[]): CourtGroup[] {
  const order: string[] = [];
  const byFacility = new Map<string, CourtSlot[]>();
  for (const slot of slots) {
    if (!byFacility.has(slot.facilityName)) {
      byFacility.set(slot.facilityName, []);
      order.push(slot.facilityName);
    }
    byFacility.get(slot.facilityName)!.push(slot);
  }
  return order.map((facilityName) => {
    const { name, detail } = parseFacilityLabel(facilityName);
    const courtSlots = byFacility.get(facilityName)!.slice().sort((a, b) => a.startAt.localeCompare(b.startAt));
    return { key: facilityName, name, detail, slots: courtSlots };
  });
}

function bucketByHour(slots: CourtSlot[]): Map<number, CourtSlot[]> {
  const map = new Map<number, CourtSlot[]>();
  for (const slot of slots) {
    const hour = londonHour(slot.startAt);
    const bucket = map.get(hour);
    if (bucket) bucket.push(slot);
    else map.set(hour, [slot]);
  }
  return map;
}

function formatPrice(pricePence: number): string {
  const pounds = pricePence / 100;
  return Number.isInteger(pounds) ? `£${pounds}` : `£${pounds.toFixed(2)}`;
}

// "14°C · 10% rain" — just enough to tell a dry slot from a wet one at a
// glance. null (no forecast for this hour, or the forecast couldn't be
// loaded at all) means the slot renders with no weather tag, not an error.
function weatherTag(point: HourlyForecastPoint | null): string | null {
  if (!point) return null;
  return `${Math.round(point.tempC)}°C · ${Math.round(point.rainChancePercent)}% rain`;
}

export function VenueRows({
  venue,
  venueKey,
  providerLabel,
  weather,
}: {
  venue: CourtVenue;
  venueKey: string;
  providerLabel: string;
  weather: HourlyForecastPoint[] | null;
}) {
  const { days, selectedDay, selectedWindow, hours, registerVenueSlots } = useFilters();

  useEffect(() => {
    registerVenueSlots(venueKey, venue.slots);
  }, [venueKey, venue.slots, registerVenueSlots]);

  const filtered = useMemo(
    () => venue.slots.filter((slot) => londonDayKey(slot.startAt) === selectedDay && matchesWindow(slot, selectedWindow)),
    [venue.slots, selectedDay, selectedWindow]
  );

  const courts = useMemo(() => groupByCourt(filtered), [filtered]);

  const minPricePence = useMemo(() => {
    // A real court is never £0 an hour — a slot priced at 0 isn't a usable
    // price to show, so it's treated the same as having no price at all.
    const prices = venue.slots.map((s) => s.pricePence).filter((p): p is number => p != null && p > 0);
    return prices.length ? Math.min(...prices) : null;
  }, [venue.slots]);

  const priceText = minPricePence != null ? `${formatPrice(minPricePence)} an hour` : `price on ${providerLabel}`;
  const metaLine = venue.postcode ? `${venue.postcode}, ${priceText}` : priceText;

  const isToday = selectedDay === days[0];
  const currentHour = useMemo(() => londonHour(new Date().toISOString()), []);

  return (
    <div className="venue-block">
      <div className="venue-desktop">
        <div className="venue-row">
          <div className="venue-row-name">{venue.name}</div>
          <div className="venue-row-meta">{metaLine}</div>
          <a className="venue-row-link" href={venue.bookingUrl} target="_blank" rel="noopener noreferrer">
            Open {providerLabel}
          </a>
        </div>
        {filtered.length === 0 ? (
          <p className="venue-empty">Nothing free here in this window. Try another day or time.</p>
        ) : (
          courts.map((court) => {
            const byHour = bucketByHour(court.slots);
            return (
              <div
                key={court.key}
                className="court-grid-row"
                style={{ gridTemplateColumns: gridColumns(hours) }}
              >
                <div className="court-row-name">
                  <div className="court-row-title">{court.name}</div>
                  {court.detail && <div className="court-row-detail">{court.detail}</div>}
                </div>
                {hours.map((hour) => {
                  const bucket = byHour.get(hour);
                  if (bucket && bucket.length > 0) {
                    const earliest = bucket[0];
                    const label = londonTimeLabel(earliest.startAt);
                    const extra = bucket.length > 1 ? ` (${bucket.length} slots)` : "";
                    const tag = weatherTag(weatherAtHour(weather, earliest.startAt));
                    return (
                      <a
                        key={hour}
                        className="cell cell--free"
                        href={venue.bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${court.name}, ${label}, free${extra}${tag ? `, ${tag}` : ""}. Book on ${providerLabel}`}
                      >
                        <span className="cell-time">{label}</span>
                        {tag && <span className="cell-weather">{tag}</span>}
                      </a>
                    );
                  }
                  const isPast = isToday && hour < currentHour;
                  return (
                    <div
                      key={hour}
                      className={isPast ? "cell cell--past" : "cell cell--taken"}
                      aria-hidden="true"
                    />
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      <div className="venue-phone-card">
        <h3 className="venue-phone-name">{venue.name}</h3>
        <p className="venue-phone-meta">{metaLine}</p>
        {filtered.length === 0 ? (
          <p className="venue-empty">Nothing free here in this window. Try another day or time.</p>
        ) : (
          courts
            .filter((court) => court.slots.length > 0)
            .map((court) => (
              <div key={court.key} className="phone-court">
                <div className="phone-court-name">
                  {court.name}
                  {court.detail ? ` · ${court.detail}` : ""}
                </div>
                <div className="phone-time-buttons">
                  {court.slots.map((slot) => {
                    const label = londonTimeLabel(slot.startAt);
                    const tag = weatherTag(weatherAtHour(weather, slot.startAt));
                    return (
                      <a
                        key={slot.startAt}
                        className="phone-time-button"
                        href={venue.bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${court.name}, ${label}, free${tag ? `, ${tag}` : ""}. Book on ${providerLabel}`}
                      >
                        <span className="cell-time">{label}</span>
                        {tag && <span className="cell-weather">{tag}</span>}
                      </a>
                    );
                  })}
                </div>
              </div>
            ))
        )}
        <a className="venue-phone-link" href={venue.bookingUrl} target="_blank" rel="noopener noreferrer">
          Open {providerLabel}
        </a>
      </div>
    </div>
  );
}
