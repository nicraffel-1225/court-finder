"use client";

import { gridColumns, useFilters } from "./FilterProvider";
import { sheetDayLabel } from "./london";

export function SheetHeader() {
  const { days, selectedDay, slotsForSelection, hours } = useFilters();
  const count = slotsForSelection.length;
  const label = sheetDayLabel(selectedDay, days[0], days[1]);

  return (
    <div className="sheet-header">
      <div className="sheet-header-top">
        <h2 className="sheet-title">
          {count} free slot{count === 1 ? "" : "s"}, {label}
        </h2>
        <div className="sheet-legend" aria-hidden="true">
          <span className="legend-item">
            <span className="legend-swatch legend-swatch--free" /> Free, select to book
          </span>
          <span className="legend-item">
            <span className="legend-swatch legend-swatch--taken" /> Taken
          </span>
        </div>
      </div>
      <div className="hour-header-row" style={{ gridTemplateColumns: gridColumns(hours) }} aria-hidden="true">
        <div />
        {hours.map((hour) => (
          <div key={hour} className="hour-header-cell">
            {String(hour).padStart(2, "0")}
          </div>
        ))}
      </div>
    </div>
  );
}
