import { describe, expect, it } from "vitest";
import { deriveReminderStatus } from "./reminder-status.js";

describe("deriveReminderStatus", () => {
  const now = "2026-10-19T12:00:00.000Z";

  it("treats a future pause as paused and a revoked-only device as not deliverable", () => {
    const status = deriveReminderStatus({
      mode: "paused",
      pausedUntil: "2026-10-26T12:00:00.000Z",
      nowIso: now,
      tokens: [{ status: "revoked" }],
      rules: [{ reminderType: "workout_reminder", enabled: false }],
    });
    expect(status.mode).toBe("paused");
    expect(status.pausedUntil).toBe("2026-10-26T12:00:00.000Z");
    expect(status.pushDeliverable).toBe(false);
    expect(status.trainerDisabled.workoutReminder).toBe(true);
    expect(status.trainerDisabled.mealReminder).toBe(false);
  });

  it("does not mark a trainee with no device row as permission-off", () => {
    const status = deriveReminderStatus({
      mode: "normal",
      pausedUntil: null,
      nowIso: now,
      tokens: [],
      rules: [],
    });
    expect(status.mode).toBe("normal");
    expect(status.pushDeliverable).toBe(true);
    expect(status.trainerDisabled.workoutReminder).toBe(false);
  });
});
