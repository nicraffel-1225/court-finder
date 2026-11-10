// Phase 3 adapter tests. No network: everything here reads saved fixtures
// in ingest/fixtures/ (CLAUDE.md rule 7).
//
// better-facility-uses.json and better-slots.json are real pages fetched
// from Better's live feed, trimmed down to a handful of items. In
// better-slots.json, two items' "facilityUse" field was pointed at courts
// from the facility-uses fixture (everything else about them is untouched)
// so the fixtures can exercise the full match path together; the third
// slot item and the deleted item are otherwise unmodified / spec-shaped.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isWithinSyncWindow,
  parseFacilityUseItem,
  parseSlotItem,
  type FacilityUseData,
  type SlotData,
} from "./openactive.ts";
import type { RpdeItem } from "../core/rpde.ts";

function loadFixture<T>(name: string): { next: string; items: RpdeItem<T>[] } {
  return JSON.parse(readFileSync(join(__dirname, "../fixtures", name), "utf8"));
}

const facilityUsesFixture = loadFixture<FacilityUseData>("better-facility-uses.json");
const slotsFixture = loadFixture<SlotData>("better-slots.json");

function parsedFor(groupId: string) {
  const item = facilityUsesFixture.items.find((it) => it.id === groupId);
  if (!item) throw new Error(`fixture item ${groupId} not found`);
  return parseFacilityUseItem(item);
}

describe("parseFacilityUseItem", () => {
  it("keeps a tennis facility in Greater London, even when addressRegion isn't literally 'London'", () => {
    // Thornton Heath — addressRegion is "Croydon", not "London".
    const parsed = parsedFor("activity_recurrence_group:12826");
    expect(parsed?.kind).toBe("upsert");
    if (parsed?.kind !== "upsert") return;
    expect(parsed.venue.name).toBe("Thornton Heath Leisure Centre");
    expect(parsed.facilities.every((f) => f.sport === "tennis")).toBe(true);
    expect(parsed.facilities.length).toBeGreaterThan(0);
  });

  it("drops a tennis facility outside Greater London", () => {
    // Same activity name, but in Ely, Cambridgeshire.
    const parsed = parsedFor("activity_recurrence_group:14903");
    expect(parsed).toBeNull();
  });

  it("drops a non-tennis facility (Gym) even though it's in London", () => {
    const parsed = parsedFor("activity_recurrence_group:220");
    expect(parsed).toBeNull();
  });

  it("drops table tennis (name contains 'tennis' but isn't our sport)", () => {
    const parsed = parsedFor("activity_recurrence_group:22254");
    expect(parsed).toBeNull();
  });

  it("keeps a floodlit tennis court and records floodlit", () => {
    const parsed = parsedFor("activity_recurrence_group:11612");
    expect(parsed?.kind).toBe("upsert");
    if (parsed?.kind !== "upsert") return;
    expect(parsed.facilities.every((f) => f.floodlit === true)).toBe(true);
  });

  it("keeps a tennis lesson as a tennis facility", () => {
    const parsed = parsedFor("activity_recurrence_group:2754");
    expect(parsed?.kind).toBe("upsert");
  });

  it("flags a deleted item as unsupported rather than guessing", () => {
    const deletedItem: RpdeItem<FacilityUseData> = {
      state: "deleted",
      kind: "FacilityUse",
      id: "activity_recurrence_group:999",
      modified: 0,
    };
    expect(parseFacilityUseItem(deletedItem)).toEqual({ kind: "delete_unsupported" });
  });
});

describe("parseSlotItem", () => {
  it("parses a real slot, converting price from pounds to pence", () => {
    const item = slotsFixture.items[0] as RpdeItem<SlotData>;
    const parsed = parseSlotItem(item);
    expect(parsed?.kind).toBe("upsert");
    if (parsed?.kind !== "upsert") return;
    expect(parsed.slot.price_pence).toBe(1000); // £10
    expect(parsed.slot.facility_external_id).toContain("activity_recurrence_group:12826");
  });

  it("carries remaining/capacity through from remainingUses/maximumUses", () => {
    const item = slotsFixture.items[1] as RpdeItem<SlotData>;
    const parsed = parseSlotItem(item);
    expect(parsed?.kind).toBe("upsert");
    if (parsed?.kind !== "upsert") return;
    expect(parsed.slot.capacity).toBe(8);
    expect(parsed.slot.remaining).toBe(8);
  });

  it("reports a deleted slot by its own id, with no data needed", () => {
    const item = slotsFixture.items[3] as RpdeItem<SlotData>; // the hand-added deleted item
    const parsed = parseSlotItem(item);
    expect(parsed).toEqual({ kind: "delete", external_id: "activity:99999999" });
  });
});

describe("isWithinSyncWindow", () => {
  const now = new Date("2026-11-09T12:00:00Z");

  it("accepts a slot starting tomorrow", () => {
    expect(isWithinSyncWindow("2026-11-10T12:00:00Z", now)).toBe(true);
  });

  it("accepts a slot starting right at the 8-day edge", () => {
    expect(isWithinSyncWindow("2026-11-17T11:00:00Z", now)).toBe(true);
  });

  it("rejects a slot starting after the 8-day window", () => {
    expect(isWithinSyncWindow("2026-11-18T12:00:00Z", now)).toBe(false);
  });

  it("rejects a slot that already started", () => {
    expect(isWithinSyncWindow("2026-11-09T11:00:00Z", now)).toBe(false);
  });
});
