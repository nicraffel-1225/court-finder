"use client";

// Shared client-side state for the day strip, time-of-day chips and every
// venue section below them — no refetching, no URL change: picking a
// different day or time window just re-filters data the server already
// sent down (see lib/courts/cache.ts for why asking the same venues again
// elsewhere on the page, e.g. the next-free headline, doesn't mean extra
// requests to any booking site).
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { CourtSlot } from "@/lib/courts/types";
import { londonDayKey, londonHour } from "./london";

export type TimeWindow = "any" | "before9" | "9to5" | "after5";

function slotHour(slot: CourtSlot): number {
  return londonHour(slot.startAt);
}

export function matchesWindow(slot: CourtSlot, window: TimeWindow): boolean {
  const hour = slotHour(slot);
  switch (window) {
    case "before9":
      return hour < 9;
    case "9to5":
      return hour >= 9 && hour < 17;
    case "after5":
      return hour >= 17;
    default:
      return true;
  }
}

function range(start: number, end: number): number[] {
  if (end < start) return [];
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

// A sensible column range to show before any venue has loaded yet, or when
// nothing in the window is free, so the grid isn't empty. Once real slots
// are registered, the hours they actually span take over (see `hours`
// below) — this never clips a venue's real opening hours.
const DEFAULT_HOURS: Record<TimeWindow, number[]> = {
  any: range(7, 21),
  before9: range(7, 8),
  "9to5": range(9, 16),
  after5: range(17, 21),
};

interface FilterContextValue {
  days: string[]; // the 8 ymd values the page actually fetched, today first
  selectedDay: string;
  setSelectedDay: (day: string) => void;
  selectedWindow: TimeWindow;
  setSelectedWindow: (window: TimeWindow) => void;
  registerVenueSlots: (venueKey: string, slots: CourtSlot[]) => void;
  allSlots: CourtSlot[]; // every registered slot, across every loaded venue
  slotsForSelection: CourtSlot[]; // allSlots matching the selected day + window
  hours: number[]; // grid columns for the current day + window
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ days, children }: { days: string[]; children: ReactNode }) {
  const [selectedDay, setSelectedDay] = useState(days[0]);
  const [selectedWindow, setSelectedWindow] = useState<TimeWindow>("any");
  const [registry, setRegistry] = useState<Record<string, CourtSlot[]>>({});

  const registerVenueSlots = useCallback((venueKey: string, slots: CourtSlot[]) => {
    setRegistry((prev) => (prev[venueKey] === slots ? prev : { ...prev, [venueKey]: slots }));
  }, []);

  const allSlots = useMemo(() => Object.values(registry).flat(), [registry]);

  const slotsForSelection = useMemo(
    () => allSlots.filter((slot) => londonDayKey(slot.startAt) === selectedDay && matchesWindow(slot, selectedWindow)),
    [allSlots, selectedDay, selectedWindow]
  );

  const hours = useMemo(() => {
    if (slotsForSelection.length === 0) return DEFAULT_HOURS[selectedWindow];
    const hoursPresent = slotsForSelection.map(slotHour);
    return range(Math.min(...hoursPresent), Math.max(...hoursPresent));
  }, [slotsForSelection, selectedWindow]);

  const value: FilterContextValue = {
    days,
    selectedDay,
    setSelectedDay,
    selectedWindow,
    setSelectedWindow,
    registerVenueSlots,
    allSlots,
    slotsForSelection,
    hours,
  };

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilters(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be used within a FilterProvider");
  return ctx;
}

// Shared so the hour-label header row (SheetHeader) and every venue's grid
// rows (VenueRows) always line up, however many hour columns there are.
export function gridColumns(hours: number[]): string {
  return `200px repeat(${hours.length}, minmax(44px, 1fr))`;
}
