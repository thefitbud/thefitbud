import { useEffect } from "react";
import { AppState } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { isStepsEnabled } from "../../lib/config";
import {
  cameToForeground,
  stepsSyncController,
  useStepsSyncStatus,
  type StepsSyncSnapshot,
} from "../../lib/health";
import { useConfig } from "../../providers/ConfigProvider";

/**
 * Keeps the server's step totals current from Apple Health / Health Connect
 * (Z9-9): syncs the last seven days once per app start and each time the app
 * returns to the foreground. The first automatic run asks for read access
 * once; after a denial it stops asking, and the chip keeps showing "Set up
 * steps" because the server has no total for today (D-W9-3).
 *
 * Off when the `steps_enabled` flag is off or the signed-in role is not a
 * trainee. On web and in builds without the native modules it reports
 * `unavailable` and never prompts.
 */
export function useStepsSync(): StepsSyncSnapshot {
  const { api, me, selectedRole } = useAuth();
  const { config } = useConfig();
  const enabled = isStepsEnabled(config) && selectedRole === "trainee" && me !== null;
  const timeZone = me?.timezone ?? "UTC";

  useEffect(() => {
    if (!enabled) return undefined;
    void stepsSyncController.syncOnLaunch({ api, timeZone });
    let previous: string | null = AppState.currentState;
    const subscription = AppState.addEventListener("change", (next) => {
      if (cameToForeground(previous, next)) {
        void stepsSyncController.sync({ api, timeZone, trigger: "auto" });
      }
      previous = next;
    });
    return () => subscription.remove();
  }, [enabled, api, timeZone]);

  return useStepsSyncStatus();
}
