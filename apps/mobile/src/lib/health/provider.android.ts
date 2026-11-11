/**
 * Android: Health Connect through `react-native-health-connect` 3.x with the
 * `expo-health-connect` plugin (D-W9-6).
 *
 * Under the new architecture the library calls `TurboModuleRegistry.getEnforcing`
 * when it is imported, which throws in Expo Go and in any build made before this
 * module was added. So it is only imported once the native module is known to
 * be linked; otherwise steps are simply unavailable.
 */
import { NativeModules, TurboModuleRegistry } from "react-native";
import { createHealthConnectProvider } from "./healthConnect";
import { unavailableHealthProvider, type HealthStepsProvider } from "./types";

let loaded: Promise<HealthStepsProvider> | null = null;

function nativeModuleLinked(): boolean {
  return NativeModules.HealthConnect != null || TurboModuleRegistry.get("HealthConnect") != null;
}

async function load(): Promise<HealthStepsProvider> {
  if (!nativeModuleLinked()) return unavailableHealthProvider;
  const lib = await import("react-native-health-connect");
  return createHealthConnectProvider({
    getSdkStatus: () => lib.getSdkStatus(),
    initialize: () => lib.initialize(),
    getGrantedPermissions: () => lib.getGrantedPermissions(),
    requestPermission: (permissions) =>
      lib.requestPermission(
        permissions.map((p) => ({ accessType: "read" as const, recordType: p.recordType as "Steps" })),
      ),
    aggregateStepsByDay: (start, end) =>
      lib.aggregateGroupByPeriod({
        recordType: "Steps",
        timeRangeFilter: {
          operator: "between",
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        },
        timeRangeSlicer: { period: "DAYS", length: 1 },
      }),
  });
}

export function loadHealthStepsProvider(): Promise<HealthStepsProvider> {
  loaded ??= load();
  return loaded;
}
