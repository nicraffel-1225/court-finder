// No network: the fixture stands in for chiswick.parksports.co.uk's real
// GetVenueSessions response (CLAUDE.md rule 7).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHISWICK_VENUE, parseClubSparkDaySessions } from "./clubspark.ts";

const fixture = JSON.parse(
  readFileSync(join(__dirname, "fixtures/clubspark-chiswick-sessions.json"), "utf8")
);

const tennisCourt = fixture.Resources[0];
const daySessions = tennisCourt.Days[0].Sessions;

describe("parseClubSparkDaySessions", () => {
  it("splits a merged free block into its Interval-sized bookable hours", () => {
    const slots = parseClubSparkDaySessions("2026-11-17", daySessions, "Tennis Court 2");
    expect(slots).toEqual([
      {
        facilityName: "Tennis Court 2",
        startAt: "2026-11-17T08:00:00.000Z",
        endAt: "2026-11-17T09:00:00.000Z",
        remaining: 1,
        pricePence: 1300,
      },
      {
        facilityName: "Tennis Court 2",
        startAt: "2026-11-17T09:00:00.000Z",
        endAt: "2026-11-17T10:00:00.000Z",
        remaining: 1,
        pricePence: 1300,
      },
    ]);
  });

  it("skips booked sessions, coaching classes and closed hours", () => {
    const slots = parseClubSparkDaySessions("2026-11-17", daySessions, "Tennis Court 2");
    expect(slots).toHaveLength(2); // only the two free hours above
  });
});

describe("CHISWICK_VENUE", () => {
  it("is the one venue Nic asked for", () => {
    expect(CHISWICK_VENUE.name).toBe("Chiswick");
  });
});
