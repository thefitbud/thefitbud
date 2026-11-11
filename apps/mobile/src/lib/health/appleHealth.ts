/**
 * HealthKit adapter. It never imports `@kingstinct/react-native-healthkit`
 * itself: `provider.ios.ts` loads the library and binds it to `AppleHealthPort`,
 * so tests can drive this file with a fake port.
 */
import { windowContaining } from "./dayWindows";
import type { DailyStepTotal, DayWindow, HealthPermission, HealthStepsProvider } from "./types";

/** One bucket of a daily HKStatisticsCollectionQuery for HKQuantityTypeIdentifierStepCount. */
export type AppleStepsBucket = {
  /** Absent when the day has no step samples (or read access was denied). */
  sumQuantity?: { quantity: number; startDate?: string } | null;
};

/** The parts of the HealthKit library this adapter uses, already bound to step count. */
export type AppleHealthPort = {
  isHealthDataAvailable(): Promise<boolean>;
  /** `getRequestStatusForAuthorization` for reading step count. */
  requestStatus(): Promise<"should_request" | "unnecessary" | "unknown">;
  /** `requestAuthorization` for reading step count; nothing is written. */
  requestAuthorization(): Promise<boolean>;
  /** `queryStatisticsCollectionForQuantity` with cumulative sum, one-day interval. */
  dailyStepStatistics(anchor: Date, start: Date, end: Date): Promise<readonly AppleStepsBucket[]>;
};

export function createAppleHealthProvider(port: AppleHealthPort): HealthStepsProvider {
  async function permission(): Promise<HealthPermission> {
    const status = await port.requestStatus();
    // HealthKit hides read denials, so "asked before" is as far as it goes.
    return status === "should_request" ? "not_requested" : "requested";
  }

  return {
    source: "apple_health",
    platformKnowsIfAsked: true,
    async availability() {
      return (await port.isHealthDataAvailable()) ? "available" : "unavailable";
    },
    permission,
    async requestPermission() {
      await port.requestAuthorization();
      return permission();
    },
    async readDailyTotals(windows: readonly DayWindow[]): Promise<DailyStepTotal[]> {
      const first = windows[0];
      const last = windows[windows.length - 1];
      if (!first || !last) return [];
      const buckets = await port.dailyStepStatistics(first.start, first.start, last.end);
      const totals = new Map<string, number>();
      for (const bucket of buckets) {
        const sum = bucket.sumQuantity;
        if (!sum?.startDate || !Number.isFinite(sum.quantity)) continue;
        const window = windowContaining(windows, new Date(sum.startDate));
        if (!window) continue;
        totals.set(window.localDate, (totals.get(window.localDate) ?? 0) + sum.quantity);
      }
      return windows.map((w) => {
        const steps = totals.get(w.localDate);
        return { localDate: w.localDate, steps: steps === undefined ? null : Math.round(steps) };
      });
    },
  };
}
