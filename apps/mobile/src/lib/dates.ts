/** Trainee-local calendar helpers (IANA timezone). */
import { formatCivilDate, formatLocalDate as coreFormatLocalDate } from "@fitbud/core";

export function localDateInTimezone(timeZone: string, instant = new Date()): string {
  return coreFormatLocalDate(instant, timeZone);
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

/** Product-rule date heading: "Thu 15 Oct" (never US long form). */
export function formatHeadingDate(timeZone: string, localDate?: string): string {
  const date = localDate ?? localDateInTimezone(timeZone);
  return formatCivilDate(date);
}

export function weekdayShort(_timeZone: string, localDate: string): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d!));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][utc.getUTCDay()]!;
}

export function dayOfMonth(_timeZone: string, localDate: string): string {
  const parts = localDate.split("-");
  return String(Number(parts[2]));
}
