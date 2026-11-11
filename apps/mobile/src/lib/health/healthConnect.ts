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

/** One `aggregateGroupByPeriod` group for `Steps` (`COUNT_TOTAL`). */
export type HealthConnectStepsGroup = {
  /** Device-local date-time of the period start, e.g. "2026-11-05T00:00". */
  startTime: string;
  result: { COUNT_TOTAL: number; dataOrigins?: readonly string[] };
};

/** The parts of the Health Connect library this adapter uses. */
export type HealthConnectPort = {
  getSdkStatus(): Promise<number>;
  initialize(): Promise<boolean>;
  getGrantedPermissions(): Promise<readonly HealthConnectPermission[]>;
  requestPermission(
    permissions: readonly HealthConnectPermission[],
  ): Promise<readonly HealthConnectPermission[]>;
  /** `aggregateGroupByPeriod` for `Steps`, between two instants, one-day periods. */
  aggregateStepsByDay(start: Date, end: Date): Promise<readonly HealthConnectStepsGroup[]>;
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
      const first = windows[0];
      const last = windows[windows.length - 1];
      if (!first || !last) return [];
      await ready();
      const groups = await port.aggregateStepsByDay(first.start, last.end);
      // Periods are cut in the device's zone. The trainee's stored zone comes
      // from the device (AcceptInviteScreen), so a period's date is the window's.
      const byDate = new Map<string, number>();
      for (const group of groups) {
        const localDate = group.startTime.slice(0, 10);
        const count = group.result.COUNT_TOTAL;
        const hasData = (group.result.dataOrigins?.length ?? 0) > 0 || count > 0;
        if (!hasData || !Number.isFinite(count)) continue;
        byDate.set(localDate, (byDate.get(localDate) ?? 0) + count);
      }
      return windows.map((w) => {
        const steps = byDate.get(w.localDate);
        return { localDate: w.localDate, steps: steps === undefined ? null : Math.round(steps) };
      });
    },
  };
}
