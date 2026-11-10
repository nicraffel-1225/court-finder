import { describe, expect, it } from "vitest";
import { londonNaiveToUtcIso, nextNDaysYmd } from "./time.ts";

describe("londonNaiveToUtcIso", () => {
  it("treats a winter (GMT) time as already UTC", () => {
    expect(londonNaiveToUtcIso("2026-01-15T09:00:00")).toBe("2026-01-15T09:00:00.000Z");
  });

  it("subtracts an hour for a summer (BST) time", () => {
    expect(londonNaiveToUtcIso("2026-07-15T09:00:00")).toBe("2026-07-15T08:00:00.000Z");
  });

  it("is correct the day after the spring-forward (last Sunday of March)", () => {
    // 2026's clocks go forward on 29 March; 30 March is a normal BST day.
    expect(londonNaiveToUtcIso("2026-03-30T10:00:00")).toBe("2026-03-30T09:00:00.000Z");
  });

  it("is correct the day after the autumn clocks change (last Sunday of October)", () => {
    // 2026's clocks go back on 25 October; 26 October is a normal GMT day.
    expect(londonNaiveToUtcIso("2026-10-26T10:00:00")).toBe("2026-10-26T10:00:00.000Z");
  });

  it("rejects a string that isn't a naive local datetime", () => {
    expect(() => londonNaiveToUtcIso("2026-01-15T09:00:00+01:00")).toThrow();
  });
});

describe("nextNDaysYmd", () => {
  it("returns n consecutive calendar days starting today", () => {
    const now = new Date("2026-11-10T12:00:00.000Z");
    expect(nextNDaysYmd(4, now)).toEqual(["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
  });

  it("rolls over a month boundary", () => {
    const now = new Date("2026-11-29T00:00:00.000Z");
    expect(nextNDaysYmd(3, now)).toEqual(["2026-11-29", "2026-11-30", "2026-12-01"]);
  });
});
