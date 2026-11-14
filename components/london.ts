// Small Europe/London presentation helpers for the UI only — these read
// already-converted UTC timestamps. The write side (naive-local-to-UTC
// conversion) stays in lib/courts/time.ts, which this never touches.

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function londonParts(iso: string) {
  const parts = partsFormatter.formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  // formatToParts can render midnight as "24" in some ICU versions.
  const hour = Number(get("hour")) % 24;
  return { year: get("year"), month: get("month"), day: get("day"), hour, minute: get("minute") };
}

export function londonDayKey(iso: string): string {
  const { year, month, day } = londonParts(iso);
  return `${year}-${month}-${day}`;
}

export function londonHour(iso: string): number {
  return londonParts(iso).hour;
}

export function londonTimeLabel(iso: string): string {
  const { hour, minute } = londonParts(iso);
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

const weekdayFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long" });
const shortWeekdayFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" });
const dateFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long" });
const dayNumberFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric" });

// A "YYYY-MM-DD" day key is safe to format as a date at London noon,
// regardless of the reader's own timezone or the GMT/BST boundary.
function ymdToSafeDate(ymd: string): Date {
  return new Date(`${ymd}T12:00:00Z`);
}

export function shortWeekday(ymd: string): string {
  return shortWeekdayFormatter.format(ymdToSafeDate(ymd));
}

export function dayNumber(ymd: string): string {
  return dayNumberFormatter.format(ymdToSafeDate(ymd));
}

function weekdayAndDate(ymd: string): string {
  const d = ymdToSafeDate(ymd);
  return `${weekdayFormatter.format(d)} ${dateFormatter.format(d)}`;
}

// "Today" / "Tomorrow" / "Tue" — for the day-strip buttons.
export function relativeDayLabel(ymd: string, todayYmd: string, tomorrowYmd: string): string {
  if (ymd === todayYmd) return "Today";
  if (ymd === tomorrowYmd) return "Tomorrow";
  return shortWeekday(ymd);
}

// "today, Saturday 14 November" / "tomorrow, Sunday 15 November" / "Tuesday 18 November"
export function sheetDayLabel(ymd: string, todayYmd: string, tomorrowYmd: string): string {
  const full = weekdayAndDate(ymd);
  if (ymd === todayYmd) return `today, ${full}`;
  if (ymd === tomorrowYmd) return `tomorrow, ${full}`;
  return full;
}

// Same as relativeDayLabel, but starting from a slot's own UTC instant
// rather than an already-known day key (used by the next-free headline).
export function relativeDayLabelFromIso(iso: string, todayYmd: string, tomorrowYmd: string): string {
  return relativeDayLabel(londonDayKey(iso), todayYmd, tomorrowYmd);
}

export function postcodeOutcode(postcode: string | null): string | null {
  if (!postcode) return null;
  const match = /^[A-Z]{1,2}\d[A-Z\d]?/i.exec(postcode.trim());
  return match ? match[0].toUpperCase() : null;
}

export function joinWithAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
