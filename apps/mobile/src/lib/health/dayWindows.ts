import { formatLocalDate, localDateTimeToUtcIso } from "@fitbud/core";
import { addDays } from "../dates";
import type { DayWindow } from "./types";

/** How many days each sync reads and saves (today and the six days before). */
export const STEPS_SYNC_DAYS = 7;

/**
 * The last `days` trainee-local days ending today, oldest first, as instant
 * ranges in the trainee's stored timezone. That is the zone the server uses for
 * `GET /me/steps/today`, so the day a total is saved under is the day the chip
 * reads. A day is midnight to the next midnight, so DST days are 23 or 25 hours.
 */
export function recentDayWindows(
  timeZone: string,
  now: Date,
  days: number = STEPS_SYNC_DAYS,
): DayWindow[] {
  const today = formatLocalDate(now, timeZone);
  const windows: DayWindow[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const localDate = addDays(today, -offset);
    windows.push({
      localDate,
      start: new Date(localDateTimeToUtcIso(localDate, timeZone)),
      end: new Date(localDateTimeToUtcIso(addDays(localDate, 1), timeZone)),
    });
  }
  return windows;
}

/** The window whose [start, end) holds `instant`, if any. */
export function windowContaining(
  windows: readonly DayWindow[],
  instant: Date,
): DayWindow | undefined {
  const t = instant.getTime();
  return windows.find((w) => w.start.getTime() <= t && t < w.end.getTime());
}
