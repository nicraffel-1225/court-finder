// No network: the fixture stands in for clientapi.proagenda.com's real
// getResourceTimeSlot response (CLAUDE.md rule 7).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DUKES_MEADOWS_COURTS, DUKES_MEADOWS_VENUE, parseResourceTimeSlotResponse } from "./proagenda.ts";

interface FixtureBlock {
  startDate: string;
  endDate: string;
  resources: { name: string; amount: number | null }[];
}

const fixtureBlocks: FixtureBlock[] = JSON.parse(
  readFileSync(join(__dirname, "fixtures/proagenda-resource-timeslot.json"), "utf8")
);

describe("parseResourceTimeSlotResponse", () => {
  it("only keeps hours with amount > 0, using the amount as remaining", () => {
    const slots = parseResourceTimeSlotResponse(fixtureBlocks, "Outdoor Clay Court (Clay)");
    expect(slots).toEqual([
      {
        facilityName: "Outdoor Clay Court (Clay)",
        startAt: "2026-11-13T07:00:00.000Z",
        endAt: "2026-11-13T08:00:00.000Z",
        remaining: 4,
        pricePence: null,
      },
      {
        facilityName: "Outdoor Clay Court (Clay)",
        startAt: "2026-11-13T09:00:00.000Z",
        endAt: "2026-11-13T10:00:00.000Z",
        remaining: 3,
        pricePence: null,
      },
    ]);
  });
});

describe("DUKES_MEADOWS_COURTS", () => {
  it("marks Poraflex as an acrylic tennis surface, not padel", () => {
    const poraflex = DUKES_MEADOWS_COURTS.find((c) => c.name === "Outdoor Poraflex")!;
    expect(poraflex.surface).toBe("Acrylic (Poraflex)");
  });
});

describe("DUKES_MEADOWS_VENUE", () => {
  it("points at the real Dukes Meadows schedule page", () => {
    expect(DUKES_MEADOWS_VENUE.bookingUrl).toBe(
      "https://dukesmeadowscourts.proagenda.com/schedule?location_id=0875053b-6d1e-49fd-b572-ffd7f19c83d1"
    );
  });
});
