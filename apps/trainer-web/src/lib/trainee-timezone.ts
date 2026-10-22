import type { ClientWorkspace } from "@fitbud/contracts";

/** Demo fallback when workspace header omits traineeTimezone (see GAPS). */
const DEMO_TRAINEE_TIMEZONE = "Asia/Kolkata";

export function resolveTraineeTimezone(
  header: ClientWorkspace["header"],
): { timezone: string; fromAdapter: boolean } {
  const fromApi = header.traineeTimezone?.trim();
  if (fromApi) {
    return { timezone: fromApi, fromAdapter: false };
  }
  return { timezone: DEMO_TRAINEE_TIMEZONE, fromAdapter: true };
}
