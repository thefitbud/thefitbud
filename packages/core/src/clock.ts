import { localDateTimeToUtcIso, formatLocalDate } from "./timezone.js";

/** Product demo and seed dates are civil dates in India, not the device zone. */
export const IST_TIME_ZONE = "Asia/Kolkata";

/** YYYY-MM-DD in Asia/Kolkata. */
export function istDate(instant = new Date()): string {
  return formatLocalDate(instant, IST_TIME_ZONE);
}

/** UTC instant for a clock time on a civil date in Asia/Kolkata. */
export function istInstantAt(localDate: string, hour: number, minute = 0): Date {
  return new Date(
    localDateTimeToUtcIso(localDate, IST_TIME_ZONE, hour, minute, 0),
  );
}
