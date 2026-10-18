/** Monday-first display order. Stored weekdays use 0 = Sunday … 6 = Saturday. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAY_INITIAL = ["S", "M", "T", "W", "T", "F", "S"] as const;

export function weekdayShort(weekday: number): string {
  return WEEKDAY_SHORT[weekday] ?? "";
}
