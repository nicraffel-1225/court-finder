"use client";

import { useFilters, type TimeWindow } from "./FilterProvider";

const CHIPS: { value: TimeWindow; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "before9", label: "Before 9am" },
  { value: "9to5", label: "9am to 5pm" },
  { value: "after5", label: "After 5pm" },
];

export function TimeChips() {
  const { selectedWindow, setSelectedWindow } = useFilters();
  return (
    <div className="time-chips" role="group" aria-label="Choose a time of day">
      {CHIPS.map((chip) => (
        <button
          key={chip.value}
          type="button"
          className="time-chip"
          aria-pressed={selectedWindow === chip.value}
          onClick={() => setSelectedWindow(chip.value)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
