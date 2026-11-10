// No network: the fixture stands in for clientapi.proagenda.com's real
// getResourceTimeSlot response (CLAUDE.md rule 7).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DUKES_MEADOWS_COURTS,
  parseProagendaCourt,
  parseProagendaVenue,
  parseResourceTimeSlotResponse,
} from "./proagenda.ts";

interface FixtureBlock {
  startDate: string;
  endDate: string;
  resources: { name: string; amount: number | null }[];
}

const fixtureBlocks: FixtureBlock[] = JSON.parse(
  readFileSync(join(__dirname, "../fixtures/proagenda-resource-timeslot.json"), "utf8")
);

const clayCourt = DUKES_MEADOWS_COURTS.find((c) => c.name === "Outdoor Clay Court")!;

describe("parseResourceTimeSlotResponse", () => {
  it("only keeps hours with amount > 0, using the amount as remaining", () => {
    const slots = parseResourceTimeSlotResponse(fixtureBlocks, clayCourt.proGuid);
    expect(slots).toEqual([
      {
        facility_external_id: clayCourt.proGuid,
        external_id: `${clayCourt.proGuid}-2026-11-13T07:00:00`,
        start_at: "2026-11-13T07:00:00.000Z",
        end_at: "2026-11-13T08:00:00.000Z",
        remaining: 4,
        capacity: null,
        price_pence: null,
      },
      {
        facility_external_id: clayCourt.proGuid,
        external_id: `${clayCourt.proGuid}-2026-11-13T09:00:00`,
        start_at: "2026-11-13T09:00:00.000Z",
        end_at: "2026-11-13T10:00:00.000Z",
        remaining: 3,
        capacity: null,
        price_pence: null,
      },
    ]);
  });
});

describe("parseProagendaCourt", () => {
  it("marks Poraflex as an acrylic tennis surface, not padel", () => {
    const poraflex = DUKES_MEADOWS_COURTS.find((c) => c.name === "Outdoor Poraflex")!;
    expect(parseProagendaCourt(poraflex).sport).toBe("tennis");
  });
});

describe("parseProagendaVenue", () => {
  it("points at the real Dukes Meadows schedule page", () => {
    expect(parseProagendaVenue().booking_url).toBe(
      "https://dukesmeadowscourts.proagenda.com/schedule?location_id=0875053b-6d1e-49fd-b572-ffd7f19c83d1"
    );
  });
});
