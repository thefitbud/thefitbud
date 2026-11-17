/**
 * D-W12-7 (Z12-39): future days are view only.
 *
 * A day after the trainee's today shows the plan with no way to log it. The
 * API refuses any such log with 422 `FUTURE_DAY` (`apps/api/src/domain/
 * future-day.ts`); these helpers keep the client from offering one. "Today"
 * is the trainee's civil day in their stored zone (`me.timezone`), the same
 * zone the server judges by, never the device zone.
 */
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { formatCivilDate, localDateTimeToUtcIso } from "@fitbud/core";
import { addDays, localDateInTimezone } from "../lib/dates";

/** Today's note on a future day (TR-06d), copy kept from D-W12-7. */
export const LOGGING_OPENS_ON_THE_DAY = "Logging opens on the day.";

/** True when `selectedDate` is after the trainee's `today` (both YYYY-MM-DD). */
export function isFutureDay(selectedDate: string, today: string): boolean {
  return selectedDate > today;
}

/** "Opens on Mon 16 Nov" (Diet TR-07k, Workout W-01e). */
export function opensOnLabel(localDate: string): string {
  return `Opens on ${formatCivilDate(localDate)}`;
}

const WEEKDAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** "Monday" for a civil date (YYYY-MM-DD). */
export function weekdayLong(localDate: string): string {
  const [y, m, d] = localDate.split("-").map(Number);
  return WEEKDAYS_LONG[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
}

/** Today's banner (TR-06d): "This is Rahul’s plan for Monday. Logging opens on the day." */
export function todayFutureBannerText(coachName: string, localDate: string): string {
  return `This is ${coachName}’s plan for ${weekdayLong(localDate)}. ${LOGGING_OPENS_ON_THE_DAY}`;
}

/** Diet's banner (TR-07k): "Opens on Mon 16 Nov. You can see Rahul’s plan now and log it on the day." */
export function dietFutureBannerText(coachName: string, localDate: string): string {
  return `${opensOnLabel(localDate)}. You can see ${coachName}’s plan now and log it on the day.`;
}

/** Milliseconds from now until the next civil midnight in `timeZone`. */
export function msUntilNextLocalMidnight(
  timeZone: string,
  now: Date = new Date(),
): number {
  const today = localDateInTimezone(timeZone, now);
  const next = Date.parse(localDateTimeToUtcIso(addDays(today, 1), timeZone));
  return Math.max(next - now.getTime(), 0);
}

/**
 * The trainee's civil today, kept current: it moves on at local midnight
 * while the app is open and is re-read whenever the app comes back to the
 * foreground (a device whose date was changed, or a phone left overnight), so
 * the next day unlocks without a restart.
 */
export function useLocalToday(timeZone: string): string {
  const [today, setToday] = useState(() => localDateInTimezone(timeZone));

  useEffect(() => {
    const refresh = () => setToday(localDateInTimezone(timeZone));
    refresh();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      // One second past midnight so the new day has certainly begun.
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, msUntilNextLocalMidnight(timeZone) + 1000);
    };
    schedule();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refresh();
        schedule();
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [timeZone]);

  return today;
}
