/**
 * Health Connect adapter. It never imports `react-native-health-connect`
 * itself: `provider.android.ts` loads the library and binds it to
 * `HealthConnectPort`, so tests can drive this file with a fake port.
 */
import type { DailyStepTotal, DayWindow, HealthAvailability, HealthStepsProvider } from "./types";

export const READ_STEPS_PERMISSION = { accessType: "read", recordType: "Steps" } as const;

/** `SdkAvailabilityStatus` from react-native-health-connect 3.x. */
export const HEALTH_CONNECT_SDK = {
  UNAVAILABLE: 1,
  PROVIDER_UPDATE_REQUIRED: 2,
  AVAILABLE: 3,
} as const;

export type HealthConnectPermission = { accessType: string; recordType: string };

/** One `aggregateRecord` result for `Steps` over a window. */
export type HealthConnectStepsAggregate = {
  COUNT_TOTAL: number;
  dataOrigins?: readonly string[];
};

/** The parts of the Health Connect library this adapter uses. */
export type HealthConnectPort = {
  getSdkStatus(): Promise<number>;
  initialize(): Promise<boolean>;
  getGrantedPermissions(): Promise<readonly HealthConnectPermission[]>;
  requestPermission(
    permissions: readonly HealthConnectPermission[],
  ): Promise<readonly HealthConnectPermission[]>;
  /**
   * `aggregateRecord` for `Steps` between two instants. The library reads this
   * filter as instants, so a window means the same span whatever the device
   * zone. `aggregateGroupByPeriod` cuts periods in device-local time, which
   * would file a day under the wrong date when the device zone is not the
   * trainee's stored zone.
   */
  aggregateSteps(start: Date, end: Date): Promise<HealthConnectStepsAggregate>;
};

function hasReadSteps(list: readonly HealthConnectPermission[]): boolean {
  return list.some(
    (p) => p.accessType === READ_STEPS_PERMISSION.accessType && p.recordType === READ_STEPS_PERMISSION.recordType,
  );
}

export function createHealthConnectProvider(port: HealthConnectPort): HealthStepsProvider {
  let initialized = false;
  async function ready(): Promise<void> {
    if (initialized) return;
    initialized = await port.initialize();
    if (!initialized) throw new Error("Health Connect did not initialize");
  }

  return {
    source: "health_connect",
    platformKnowsIfAsked: false,
    async availability(): Promise<HealthAvailability> {
      const status = await port.getSdkStatus();
      if (status === HEALTH_CONNECT_SDK.AVAILABLE) return "available";
      if (status === HEALTH_CONNECT_SDK.PROVIDER_UPDATE_REQUIRED) return "needs_update";
      return "not_installed";
    },
    async permission(askedBefore) {
      await ready();
      if (hasReadSteps(await port.getGrantedPermissions())) return "granted";
      // Android reports "not granted" either way; only our own record tells them apart.
      return askedBefore ? "denied" : "not_requested";
    },
    async requestPermission() {
      await ready();
      const granted = await port.requestPermission([READ_STEPS_PERMISSION]);
      return hasReadSteps(granted) ? "granted" : "denied";
    },
    async readDailyTotals(windows: readonly DayWindow[]): Promise<DailyStepTotal[]> {
      if (windows.length === 0) return [];
      await ready();
      // One aggregate per trainee-local day (seven calls), in order.
      const totals: DailyStepTotal[] = [];
      for (const window of windows) {
        const result = await port.aggregateSteps(window.start, window.end);
        const count = result.COUNT_TOTAL;
        // Zero with no data origin means nothing was recorded; a recorded zero is a reading.
        const hasData = (result.dataOrigins?.length ?? 0) > 0 || count > 0;
        totals.push({
          localDate: window.localDate,
          steps: hasData && Number.isFinite(count) ? Math.round(count) : null,
        });
      }
      return totals;
    },
  };
}
