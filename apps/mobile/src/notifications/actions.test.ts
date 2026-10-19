import { afterEach, describe, expect, it } from "vitest";
import {
  DEV_BUILD_NOTE,
  IN_APP_MEAL_ACTIONS,
  IN_APP_NOTE_ACTIONS,
  LIVE_ACTIVITY_ACTIONS,
  MEAL_NOTIFICATION_ACTIONS,
  isMealSnoozed,
  resetNotificationActionState,
  snoozeMeal,
} from "./actions";

afterEach(() => {
  resetNotificationActionState();
});

describe("meal notification actions", () => {
  it("uses Open and Snooze 30 min inside the card", () => {
    expect(MEAL_NOTIFICATION_ACTIONS.map((action) => action.buttonTitle)).toEqual([
      "Open",
      "Snooze 30 min",
    ]);
    expect(IN_APP_MEAL_ACTIONS).toEqual(["Eaten as planned", "Open"]);
    expect(IN_APP_NOTE_ACTIONS).toEqual(["Read", "Later"]);
    expect(LIVE_ACTIVITY_ACTIONS).toEqual(["+30 s", "Skip rest"]);
  });

  it("snoozes a meal once for 30 minutes", () => {
    const now = new Date("2026-10-19T12:00:00.000Z");
    const first = snoozeMeal("meal-lunch", now);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.until.toISOString()).toBe("2026-10-19T12:30:00.000Z");
    }
    expect(isMealSnoozed("meal-lunch", new Date("2026-10-19T12:10:00.000Z"))).toBe(
      true,
    );
    expect(snoozeMeal("meal-lunch", new Date("2026-10-19T12:10:00.000Z")).ok).toBe(
      false,
    );
    expect(isMealSnoozed("meal-lunch", new Date("2026-10-19T13:00:00.000Z"))).toBe(
      false,
    );
  });

  it("names the native surfaces that need a dev build", () => {
    expect(DEV_BUILD_NOTE).toContain("needs a dev build");
    expect(DEV_BUILD_NOTE).toContain("Live Activity");
    expect(DEV_BUILD_NOTE).toContain("Dynamic Island");
    expect(DEV_BUILD_NOTE).toContain("lock screen");
  });
});
