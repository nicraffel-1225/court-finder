// LTA's and ProAgenda's JSON both give times with no UTC offset at all
// (e.g. "2026-11-11T09:00:00") — they mean that instant in Europe/London
// local time, not UTC. CLAUDE.md rule 4 says "store times in UTC", so this
// converts correctly across the BST/GMT boundary rather than guessing a
// fixed offset (which would be wrong for roughly half the year).
const LONDON_NAIVE_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

const londonFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatAsLondonMillis(utcMillis: number): number {
  const parts = londonFormatter.formatToParts(new Date(utcMillis));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  // formatToParts can render midnight as "24" in some ICU versions.
  const hour = get("hour") % 24;
  return Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
}

export function londonNaiveToUtcIso(naive: string): string {
  const match = LONDON_NAIVE_RE.exec(naive);
  if (!match) throw new Error(`Expected a naive Europe/London datetime, got: ${naive}`);
  const [, y, mo, d, h, mi, s] = match;
  const targetMillis = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));

  // Guess the offset is zero, see what that UTC instant looks like when
  // rendered in Europe/London, then correct by the difference. One pass is
  // enough — the offset is constant except exactly at a DST transition,
  // which never falls within a sports venue's opening hours.
  const renderedMillis = formatAsLondonMillis(targetMillis);
  const correctedMillis = targetMillis - (renderedMillis - targetMillis);
  return new Date(correctedMillis).toISOString();
}

// BUILD_GUIDE Phase 3: "upsert slots ... for the next 8 days." Also keeps
// a "venue_list" adapter from storing a slot that's already started today
// as if it were still bookable (these sources return a flat 07:00-21:00
// grid regardless of the time of day, unlike an RPDE feed).
const SYNC_WINDOW_DAYS = 8;

export function isWithinSyncWindow(startAtIso: string, now: Date = new Date()): boolean {
  const start = new Date(startAtIso).getTime();
  const windowEnd = now.getTime() + SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return start >= now.getTime() && start <= windowEnd;
}

// The next `n` calendar days as "YYYY-MM-DD" strings, starting today.
export function nextNDaysYmd(n: number, now: Date = new Date()): string[] {
  const days: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    days.push(`${y}-${m}-${day}`);
  }
  return days;
}
