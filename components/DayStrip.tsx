"use client";

import { matchesWindow, useFilters } from "./FilterProvider";
import { dayNumber, londonDayKey, relativeDayLabel } from "./london";

export function DayStrip() {
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
          </button>
        );
      })}
    </div>
  );
}
