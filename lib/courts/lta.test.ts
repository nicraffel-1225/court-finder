// No network: the fixture stands in for www.lta.org.uk's real JSON response
// (CLAUDE.md rule 7).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LTA_VENUES, parseLtaSlot } from "./lta.ts";

interface LtaFixtureSlot {
  slotId: string;
  startTime: string;
  endTime: string;
  price: number;
}
interface LtaFixtureCourt {
  id: string;
  name: string;
  type: string;
  surface: string | null;
  availableSlots: LtaFixtureSlot[];
}

const fixture: { venueDetails: LtaFixtureCourt[] } = JSON.parse(
  readFileSync(join(__dirname, "fixtures/lta-ravenscourt-availability.json"), "utf8")
);

const court1 = fixture.venueDetails[0];
const court2 = fixture.venueDetails[1];

describe("parseLtaSlot", () => {
  it("converts price to pence and the naive local time to UTC", () => {
    const slot = parseLtaSlot(court1.availableSlots[0], "Court 1 (Tarmac)");
    expect(slot).toEqual({
      facilityName: "Court 1 (Tarmac)",
      startAt: "2026-11-11T09:00:00.000Z",
      endAt: "2026-11-11T10:00:00.000Z",
      remaining: 1,
      pricePence: 1200,
    });
  });

  it("handles a court with no available slots", () => {
    expect(court2.availableSlots).toEqual([]);
  });
});

describe("LTA_VENUES", () => {
  it("has exactly the two venues Nic asked about", () => {
    expect(LTA_VENUES.map((v) => v.name)).toEqual(["Ravenscourt Park", "Southfield Rec"]);
  });
});
