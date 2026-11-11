/**
 * iOS: HealthKit through `@kingstinct/react-native-healthkit` 8.x (D-W9-6).
 *
 * The library builds a NativeEventEmitter when it is imported, which throws in
 * Expo Go and in any build made before this module was added. So it is only
 * imported after the native module is known to be linked; otherwise steps are
 * simply unavailable.
 */
import { NativeModules } from "react-native";
import { createAppleHealthProvider } from "./appleHealth";
import { unavailableHealthProvider, type HealthStepsProvider } from "./types";

let loaded: Promise<HealthStepsProvider> | null = null;

async function load(): Promise<HealthStepsProvider> {
  if (!NativeModules.ReactNativeHealthkit) return unavailableHealthProvider;
  const lib = await import("@kingstinct/react-native-healthkit");
  const HealthKit = lib.default;
  const stepCount = lib.HKQuantityTypeIdentifier.stepCount;
  return createAppleHealthProvider({
    isHealthDataAvailable: () => HealthKit.isHealthDataAvailable(),
    async requestStatus() {
      const status = await HealthKit.getRequestStatusForAuthorization([stepCount]);
      if (status === lib.HKAuthorizationRequestStatus.shouldRequest) return "should_request";
      if (status === lib.HKAuthorizationRequestStatus.unnecessary) return "unnecessary";
      return "unknown";
    },
    requestAuthorization: () => HealthKit.requestAuthorization([stepCount]),
    async dailyStepStatistics(anchor, start, end) {
      const buckets = await HealthKit.queryStatisticsCollectionForQuantity(
        stepCount,
        [lib.HKStatisticsOptions.cumulativeSum],
        anchor,
        { day: 1 },
        start,
        end,
        lib.HKUnits.Count,
      );
      // The native side also sends each bucket's startDate with sumQuantity;
      // the library's type leaves it out.
      return buckets.map((bucket) => ({
        sumQuantity: bucket.sumQuantity as { quantity: number; startDate?: string } | undefined,
      }));
    },
  });
}

export function loadHealthStepsProvider(): Promise<HealthStepsProvider> {
  // A failed load is not kept: the next sync tries again.
  loaded ??= load().catch((err: unknown) => {
    loaded = null;
    throw err;
  });
  return loaded;
}
