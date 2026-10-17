/** Trainee-local calendar helpers (IANA timezone). */

export function localDateInTimezone(timeZone: string, instant = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function addDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function startOfWeekMonday(localDate: string): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d!));
  const day = utc.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(localDate, diff);
}

export function weekDatesFrom(startMonday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(startMonday, index));
}

export function formatHeadingDate(timeZone: string, localDate?: string): string {
  const instant = localDate
    ? new Date(`${localDate}T12:00:00Z`)
    : new Date();
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(instant);
}

export function weekdayShort(timeZone: string, localDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone,
  }).format(new Date(`${localDate}T12:00:00Z`));
}

export function dayOfMonth(timeZone: string, localDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    timeZone,
  }).format(new Date(`${localDate}T12:00:00Z`));
}
