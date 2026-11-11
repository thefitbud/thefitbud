import { useSyncExternalStore } from "react";
import { stepsSyncController, type StepsSyncSnapshot } from "./syncController";

/** The latest steps sync status, for the Steps chip and the setup screens (Z9-10). */
export function useStepsSyncStatus(): StepsSyncSnapshot {
  return useSyncExternalStore(
    stepsSyncController.subscribe,
    stepsSyncController.getSnapshot,
    stepsSyncController.getSnapshot,
  );
}
