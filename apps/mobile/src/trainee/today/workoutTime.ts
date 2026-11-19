import { formatClockTime } from "@fitbud/core";

/**
 * The clock time to show for a workout, or null when it has none.
 *
 * A workout assignment is for a day, not a time: its window opens at local
 * midnight, so `formatClockTime(windowStartsAt)` reads "12:00 am" for every
 * workout (the preview time bug from the Z12-41 review). A real planned time
 * only exists when the window starts after midnight in the trainee's zone;
 * otherwise Today shows no time rather than an invented one (AGENTS.md: every
 * visible dynamic value has a defined backend source).
 */
export function workoutTimeLabel(
  windowStartsAt: string,
  timeZone: string,
): string | null {
  const label = formatClockTime(windowStartsAt, timeZone);
  return /^(12:00 am|0?0:00)$/i.test(label.trim()) ? null : label;
}
