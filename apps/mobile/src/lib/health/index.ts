/** Phone step data (Z9-9). Screens import from here, never from a native health library. */
export type {
  DailyStepTotal,
  DayWindow,
  HealthAvailability,
  HealthPermission,
  HealthStepsProvider,
} from "./types";
export { loadHealthStepsProvider } from "./provider";
export { STEPS_SYNC_DAYS, recentDayWindows } from "./dayWindows";
export type { StepsSyncErrorCode, StepsSyncResult } from "./stepsSync";
export {
  cameToForeground,
  stepsSyncController,
  type StepsSyncSnapshot,
  type StepsSyncStatus,
} from "./syncController";
export { useStepsSyncStatus } from "./useStepsSyncStatus";
