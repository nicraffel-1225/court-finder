"use client";

import type { DaySummary } from "@/lib/weather/openMeteo";
import { matchesWindow, useFilters } from "./FilterProvider";
import { dayNumber, londonDayKey, relativeDayLabel } from "./london";

// "9–15°C · 20% rain" — the day's range and the worst rain chance seen
// anywhere in the forecast window, not just a snapshot at one moment.
function dayWeatherTag(summary: DaySummary | undefined): string | null {
  if (!summary) return null;
  return `${Math.round(summary.tempMinC)}–${Math.round(summary.tempMaxC)}°C · ${Math.round(summary.rainChanceMaxPercent)}% rain`;
}

export function DayStrip({ dailyWeatherByDay }: { dailyWeatherByDay: Record<string, DaySummary> | null }) {
  const { days, selectedDay, setSelectedDay, allSlots, selectedWindow } = useFilters();
  const todayYmd = days[0];
  const tomorrowYmd = days[1];

  return (
    <div className="day-strip" role="group" aria-label="Choose a day">
      {days.map((day) => {
        const count = allSlots.filter(
          (slot) => londonDayKey(slot.startAt) === day && matchesWindow(slot, selectedWindow)
        ).length;
        const selected = day === selectedDay;
        const weatherTag = dayWeatherTag(dailyWeatherByDay?.[day]);
        return (
          <button
            key={day}
            type="button"
            className="day-button"
            aria-pressed={selected}
            onClick={() => setSelectedDay(day)}
          >
            <span className="day-button-label">{relativeDayLabel(day, todayYmd, tomorrowYmd)}</span>
            <span className="day-button-number">{dayNumber(day)}</span>
            <span className="day-button-count">{count > 0 ? `${count} free` : "None free"}</span>
            {weatherTag && <span className="day-button-weather">{weatherTag}</span>}
          </button>
        );
      })}
    </div>
  );
}
