// No network: the fixture stands in for api.open-meteo.com's real
// multi-location /v1/forecast response (CLAUDE.md rule 7).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOpenMeteoResponse, summariseDailyAcrossVenues, weatherAtHour } from "./openMeteo.ts";

const fixture = JSON.parse(readFileSync(join(__dirname, "fixtures/open-meteo-forecast.json"), "utf8"));

describe("parseOpenMeteoResponse", () => {
  it("maps each location's own hourly points back by request order", () => {
    const [first, second] = parseOpenMeteoResponse(fixture, 2);
    expect(first.hourly).toEqual([
      { timeIso: "2026-11-19T00:00:00.000Z", tempC: 9.4, rainChancePercent: 100 },
      { timeIso: "2026-11-19T01:00:00.000Z", tempC: 9.3, rainChancePercent: 100 },
      { timeIso: "2026-11-19T02:00:00.000Z", tempC: 9.0, rainChancePercent: 92 },
      { timeIso: "2026-11-19T03:00:00.000Z", tempC: 9.0, rainChancePercent: 78 },
    ]);
    expect(second.hourly![0]).toEqual({ timeIso: "2026-11-19T00:00:00.000Z", tempC: 9.1, rainChancePercent: 95 });
  });

  it("maps each location's own daily points back by request order", () => {
    const [first, second] = parseOpenMeteoResponse(fixture, 2);
    expect(first.daily).toEqual([
      { dateYmd: "2026-11-19", tempMaxC: 10.1, tempMinC: 7.0, rainChanceMaxPercent: 100 },
      { dateYmd: "2026-11-20", tempMaxC: 10.3, tempMinC: 7.2, rainChanceMaxPercent: 10 },
      { dateYmd: "2026-11-21", tempMaxC: 7.2, tempMinC: 1.1, rainChanceMaxPercent: 4 },
    ]);
    expect(second.daily![0]).toEqual({ dateYmd: "2026-11-19", tempMaxC: 9.9, tempMinC: 6.8, rainChanceMaxPercent: 100 });
  });

  it("normalises a single-location response (a bare object, not an array)", () => {
    const [only] = parseOpenMeteoResponse(fixture[0], 1);
    expect(only.hourly![0].tempC).toBe(9.4);
    expect(only.daily![0].tempMaxC).toBe(10.1);
  });

  it("returns hourly/daily null for a location missing both, instead of throwing", () => {
    const [, missing] = parseOpenMeteoResponse([fixture[0], { latitude: 1, longitude: 1 }], 2);
    expect(missing).toEqual({ hourly: null, daily: null });
  });

  it("returns hourly null but keeps daily when only the hourly arrays don't line up", () => {
    const malformed = {
      hourly: { time: ["2026-11-19T00:00"], temperature_2m: [9.4, 9.3], precipitation_probability: [100] },
      daily: fixture[0].daily,
    };
    const [result] = parseOpenMeteoResponse([malformed], 1);
    expect(result.hourly).toBeNull();
    expect(result.daily).not.toBeNull();
  });

  it("asked for more locations than the response has: the extra ones come back null", () => {
    const result = parseOpenMeteoResponse([fixture[0]], 2);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ hourly: null, daily: null });
  });
});

describe("weatherAtHour", () => {
  const [{ hourly }] = parseOpenMeteoResponse(fixture, 1);

  it("finds the forecast point for the hour a slot starts in", () => {
    expect(weatherAtHour(hourly, "2026-11-19T02:00:00.000Z")).toEqual({
      timeIso: "2026-11-19T02:00:00.000Z",
      tempC: 9.0,
      rainChancePercent: 92,
    });
  });

  it("floors a slot starting mid-hour down to its enclosing hour", () => {
    expect(weatherAtHour(hourly, "2026-11-19T02:30:00.000Z")).toEqual({
      timeIso: "2026-11-19T02:00:00.000Z",
      tempC: 9.0,
      rainChancePercent: 92,
    });
  });

  it("returns null for an hour outside the forecast window", () => {
    expect(weatherAtHour(hourly, "2026-11-25T02:00:00.000Z")).toBeNull();
  });

  it("returns null when there's no weather data at all for this venue", () => {
    expect(weatherAtHour(null, "2026-11-19T02:00:00.000Z")).toBeNull();
  });
});

describe("summariseDailyAcrossVenues", () => {
  const forecasts = parseOpenMeteoResponse(fixture, 2);
  const days = ["2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];

  it("pools the highest high, lowest low and highest rain chance across venues for each day", () => {
    const summary = summariseDailyAcrossVenues(forecasts, days);
    expect(summary["2026-11-19"]).toEqual({ tempMaxC: 10.1, tempMinC: 6.8, rainChanceMaxPercent: 100 });
    expect(summary["2026-11-20"]).toEqual({ tempMaxC: 10.3, tempMinC: 7.2, rainChanceMaxPercent: 10 });
  });

  it("leaves out a day no venue has daily data for, instead of a fabricated entry", () => {
    const summary = summariseDailyAcrossVenues(forecasts, days);
    expect(summary["2026-11-22"]).toBeUndefined();
  });

  it("skips a null forecast (venue load failed) rather than throwing", () => {
    const summary = summariseDailyAcrossVenues([forecasts[0], null], days);
    expect(summary["2026-11-19"]).toEqual({ tempMaxC: 10.1, tempMinC: 7.0, rainChanceMaxPercent: 100 });
  });
});
