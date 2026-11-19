// Open-Meteo's free forecast API (api.open-meteo.com) — no account, no API
// key. Free for non-commercial use under 10,000 calls/day (this site has no
// ads or subscriptions, so it qualifies) — see docs/decisions.md,
// 19 November 2026. For a UK coordinate it automatically blends in the UK
// Met Office's own model, so this gets Met Office-quality forecasts without
// ever touching their account/pricing. Data is CC BY 4.0 — credited in the
// site footer (app/page.tsx).
//
// One request covers every venue, and both the per-slot hourly figures and
// the day-strip's daily summary — Open-Meteo accepts several comma-separated
// coordinates (one result per location, in the order they were requested)
// and an "hourly" and a "daily" parameter in the same call. Kinder to them
// than several smaller requests, and keeps us far under the free-tier limit
// either way.
import { cached } from "../courts/cache.ts";
import { politeFetchJson } from "../courts/http.ts";

const CACHE_TTL_MS = 2 * 60 * 1000;
const FORECAST_DAYS = 8; // matches the court providers' own sync window

export interface HourlyForecastPoint {
  timeIso: string; // ISO, UTC, on the hour
  tempC: number;
  rainChancePercent: number;
}

export interface DailyForecastPoint {
  dateYmd: string; // "YYYY-MM-DD", UTC calendar day — same convention as lib/courts/time.ts's nextNDaysYmd
  tempMaxC: number;
  tempMinC: number;
  rainChanceMaxPercent: number;
}

export interface LocationForecast {
  hourly: HourlyForecastPoint[] | null;
  daily: DailyForecastPoint[] | null;
}

interface OpenMeteoLocationResult {
  hourly?: {
    time?: unknown;
    temperature_2m?: unknown;
    precipitation_probability?: unknown;
  };
  daily?: {
    time?: unknown;
    temperature_2m_max?: unknown;
    temperature_2m_min?: unknown;
    precipitation_probability_max?: unknown;
  };
}

function parseHourly(hourly: OpenMeteoLocationResult["hourly"]): HourlyForecastPoint[] | null {
  if (
    !hourly ||
    !Array.isArray(hourly.time) ||
    !Array.isArray(hourly.temperature_2m) ||
    !Array.isArray(hourly.precipitation_probability)
  ) {
    return null;
  }
  const { time, temperature_2m: temps, precipitation_probability: rain } = hourly;
  if (time.length !== temps.length || time.length !== rain.length) return null;

  const points: HourlyForecastPoint[] = [];
  for (let i = 0; i < time.length; i++) {
    const t = time[i];
    const tempC = temps[i];
    const rainChancePercent = rain[i];
    if (typeof t !== "string" || typeof tempC !== "number" || typeof rainChancePercent !== "number") continue;
    // Requested with timezone=UTC, so Open-Meteo's naive "YYYY-MM-DDTHH:mm"
    // already is the UTC instant — no London-offset conversion needed.
    points.push({ timeIso: `${t}:00.000Z`, tempC, rainChancePercent });
  }
  return points;
}

function parseDaily(daily: OpenMeteoLocationResult["daily"]): DailyForecastPoint[] | null {
  if (
    !daily ||
    !Array.isArray(daily.time) ||
    !Array.isArray(daily.temperature_2m_max) ||
    !Array.isArray(daily.temperature_2m_min) ||
    !Array.isArray(daily.precipitation_probability_max)
  ) {
    return null;
  }
  const {
    time,
    temperature_2m_max: maxes,
    temperature_2m_min: mins,
    precipitation_probability_max: rainMax,
  } = daily;
  if (time.length !== maxes.length || time.length !== mins.length || time.length !== rainMax.length) return null;

  const points: DailyForecastPoint[] = [];
  for (let i = 0; i < time.length; i++) {
    const dateYmd = time[i];
    const tempMaxC = maxes[i];
    const tempMinC = mins[i];
    const rainChanceMaxPercent = rainMax[i];
    if (
      typeof dateYmd !== "string" ||
      typeof tempMaxC !== "number" ||
      typeof tempMinC !== "number" ||
      typeof rainChanceMaxPercent !== "number"
    ) {
      continue;
    }
    points.push({ dateYmd, tempMaxC, tempMinC, rainChanceMaxPercent });
  }
  return points;
}

function parseLocationResult(result: unknown): LocationForecast {
  if (typeof result !== "object" || result === null) return { hourly: null, daily: null };
  const typed = result as OpenMeteoLocationResult;
  return { hourly: parseHourly(typed.hourly), daily: parseDaily(typed.daily) };
}

// Exported for tests. Open-Meteo returns a bare object (not an array) when
// only one location was requested — normalised to an array of one here so
// callers only ever handle one shape. A location whose own hourly or daily
// data is missing or malformed comes back null for just that part, rather
// than failing every other location (CLAUDE.md's "let one bad day/court/
// venue fail gracefully" rule).
export function parseOpenMeteoResponse(raw: unknown, locationCount: number): LocationForecast[] {
  const results = Array.isArray(raw) ? raw : [raw];
  const out: LocationForecast[] = [];
  for (let i = 0; i < locationCount; i++) {
    out.push(i < results.length ? parseLocationResult(results[i]) : { hourly: null, daily: null });
  }
  return out;
}

async function fetchForecastLive(coords: { lat: number; lng: number }[]): Promise<LocationForecast[]> {
  const latitude = coords.map((c) => c.lat).join(",");
  const longitude = coords.map((c) => c.lng).join(",");
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&hourly=temperature_2m,precipitation_probability` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=UTC&forecast_days=${FORECAST_DAYS}`;
  const data = await politeFetchJson(url);
  return parseOpenMeteoResponse(data, coords.length);
}

// One combined request for every venue, cached/de-duped the same way each
// getXVenue() is (lib/courts/cache.ts) — a page refresh joins the one
// already running instead of firing a second one. Keyed by the exact
// coordinate list so it only ever serves a cache hit for the same venues.
export async function getWeatherForVenues(coords: { lat: number; lng: number }[]): Promise<LocationForecast[]> {
  const key = `openmeteo:${coords.map((c) => `${c.lat},${c.lng}`).join("|")}`;
  return cached(key, CACHE_TTL_MS, () => fetchForecastLive(coords));
}

function hourFloorIso(iso: string): string {
  const d = new Date(iso);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

// The forecast point for whichever hour a slot starts in, or null if it's
// outside the forecast window (or weather couldn't be loaded at all) — the
// caller just shows the slot without a weather tag in that case.
export function weatherAtHour(points: HourlyForecastPoint[] | null, slotStartAtIso: string): HourlyForecastPoint | null {
  if (!points) return null;
  const target = hourFloorIso(slotStartAtIso);
  return points.find((p) => p.timeIso === target) ?? null;
}

export interface DaySummary {
  tempMaxC: number;
  tempMinC: number;
  rainChanceMaxPercent: number;
}

// A single "what to expect" figure per day for the whole area, not any one
// venue — the live venues are all a few km apart in west/northwest London,
// so pooling their daily figures (highest high, lowest low, highest rain
// chance seen anywhere) gives a representative range for the day strip
// rather than arbitrarily picking one venue's own forecast.
export function summariseDailyAcrossVenues(
  forecasts: (LocationForecast | null)[],
  days: string[]
): Record<string, DaySummary> {
  const summary: Record<string, DaySummary> = {};
  for (const day of days) {
    let tempMax: number | null = null;
    let tempMin: number | null = null;
    let rainMax: number | null = null;
    for (const forecast of forecasts) {
      const point = forecast?.daily?.find((d) => d.dateYmd === day);
      if (!point) continue;
      tempMax = tempMax === null ? point.tempMaxC : Math.max(tempMax, point.tempMaxC);
      tempMin = tempMin === null ? point.tempMinC : Math.min(tempMin, point.tempMinC);
      rainMax = rainMax === null ? point.rainChanceMaxPercent : Math.max(rainMax, point.rainChanceMaxPercent);
    }
    if (tempMax !== null && tempMin !== null && rainMax !== null) {
      summary[day] = { tempMaxC: tempMax, tempMinC: tempMin, rainChanceMaxPercent: rainMax };
    }
  }
  return summary;
}
