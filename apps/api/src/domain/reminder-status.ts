export type ReminderStatusMode =
  | "normal"
  | "self_logger"
  | "soft_ignorer"
  | "paused"
  | "push_failed";

export type ReminderStatusSnapshot = {
  mode: ReminderStatusMode;
  pausedUntil: string | null;
  pushDeliverable: boolean;
  trainerDisabled: {
    workoutReminder: boolean;
    mealReminder: boolean;
    checkinReminder: boolean;
  };
};

const MODES = new Set<ReminderStatusMode>([
  "normal",
  "self_logger",
  "soft_ignorer",
  "paused",
  "push_failed",
]);

/**
 * Trainee-facing reminder state.
 * No device tokens is not "off" — only an explicit revoked token with nothing active is.
 */
export function deriveReminderStatus(input: {
  mode: string | null;
  pausedUntil: string | null;
  nowIso: string;
  tokens: Array<{ status: "active" | "revoked" }>;
  rules: Array<{ reminderType: string; enabled: boolean }>;
}): ReminderStatusSnapshot {
  const mode = MODES.has(input.mode as ReminderStatusMode)
    ? (input.mode as ReminderStatusMode)
    : "normal";
  const paused =
    mode === "paused" &&
    (!input.pausedUntil || input.pausedUntil > input.nowIso);
  const activeTokens = input.tokens.filter((token) => token.status === "active");
  const revokedTokens = input.tokens.filter((token) => token.status === "revoked");
  const pushDeliverable = activeTokens.length > 0 || revokedTokens.length === 0;
  const disabled = (type: string) =>
    input.rules.some((rule) => rule.reminderType === type && !rule.enabled);

  return {
    mode: paused ? "paused" : mode === "paused" ? "normal" : mode,
    pausedUntil: paused ? input.pausedUntil : null,
    pushDeliverable: mode === "push_failed" ? false : pushDeliverable,
    trainerDisabled: {
      workoutReminder: disabled("workout_reminder"),
      mealReminder: disabled("meal_reminder"),
      checkinReminder: disabled("checkin_reminder"),
    },
  };
}
