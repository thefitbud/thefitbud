import { sixMonthsBefore } from "./RangeControl";
import type { MetricRange } from "./useProgressMetrics";

/**
 * The quiet scope line under a rail value: what window the number covers.
 * The rail and the KPI row read the same range, so the same label never shows two numbers.
 */
export function rangeScopeLabel(range: MetricRange, today: string): string {
  if (range.range === "4w") return "last 4 weeks";
  if (range.range === "12w") return "last 12 weeks";
  if (range.range === "all") return "all time";
  if (
    range.range === "custom" &&
    range.to === today &&
    range.from === sixMonthsBefore(today)
  ) {
    return "last 6 months";
  }
  return "selected dates";
}
