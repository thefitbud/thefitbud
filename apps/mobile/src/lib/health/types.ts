/**
 * The one interface the app uses for phone step data (Z9-9). Native libraries
 * stay behind it: `appleHealth.ts` (HealthKit) and `healthConnect.ts`
 * (Health Connect) implement it, and `provider.*.ts` picks one per platform.
 * Screens (Z9-10) and the sync engine import from `lib/health` only.
 */
import type { StepsSource } from "@fitbud/contracts";

/**
 * - `available`: the store can be read on this device.
 * - `not_installed`: Android without Health Connect (before Android 14).
 * - `needs_update`: Android with an outdated Health Connect provider.
 * - `unavailable`: web, Expo Go, a build without the native module, or a
 *   device that has no health store (an iPad without Health).
 */
export type HealthAvailability = "available" | "not_installed" | "needs_update" | "unavailable";

/**
 * - `granted`: the app may read steps, and the platform says so (Android).
 * - `not_requested`: the user has not been asked yet.
 * - `requested`: asked before, but the platform hides the answer. HealthKit
 *   never reveals whether read access was denied; a denied read just returns
 *   no samples.
 * - `denied`: the platform says the app may not read steps.
 */
export type HealthPermission = "granted" | "not_requested" | "requested" | "denied";

/** One trainee-local calendar day as an instant range: [start, end). */
export type DayWindow = {
  localDate: string;
  start: Date;
  end: Date;
};

/** A day's total from the store; `steps` is null when the store holds no data for it. */
export type DailyStepTotal = {
  localDate: string;
  steps: number | null;
};

export type HealthStepsProvider = {
  /** The value saved with each day on the server. */
  readonly source: Extract<StepsSource, "apple_health" | "health_connect">;
  availability(): Promise<HealthAvailability>;
  /**
   * Current read permission. `askedBefore` is the app's own record of having
   * asked: Android cannot tell "never asked" from "denied" by itself.
   */
  permission(askedBefore: boolean): Promise<HealthPermission>;
  /** Shows the system permission prompt; resolves to the permission afterwards. */
  requestPermission(): Promise<HealthPermission>;
  /** Daily totals for the given windows (same order, one entry per window). */
  readDailyTotals(windows: readonly DayWindow[]): Promise<DailyStepTotal[]>;
};

/** Used on web, in Expo Go and in builds without the native modules. */
export const unavailableHealthProvider: HealthStepsProvider = {
  source: "health_connect",
  availability: async () => "unavailable",
  permission: async () => "not_requested",
  requestPermission: async () => "not_requested",
  readDailyTotals: async (windows) => windows.map((w) => ({ localDate: w.localDate, steps: null })),
};
