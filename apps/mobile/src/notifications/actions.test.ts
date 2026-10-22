import { afterEach, describe, expect, it } from "vitest";
import {
  DEV_BUILD_NOTE,
  MEAL_NOTIFICATION_ACTIONS,
  isMealSnoozed,
  quietWindow,
  resetNotificationActionState,
  snoozeFireAt,
  snoozeMeal,
  snoozeNotice,
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
    expect(MEAL_NOTIFICATION_ACTIONS.map((action) => action.identifier)).toEqual([
      "meal_open",
      "meal_snooze_30",
    ]);
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

  it("waits out quiet hours when the follow-up would land inside them", () => {
    const evening = new Date("2026-10-19T16:10:00.000Z");
    const quiet = quietWindow("Asia/Kolkata", "22:00", "07:00");
    const deferred = snoozeFireAt(evening, quiet);
    expect(deferred.toISOString()).toBe("2026-10-20T01:30:00.000Z");
    expect(snoozeNotice(evening, deferred)).toBe("Snoozed until quiet hours end.");

    const early = new Date("2026-10-18T20:00:00.000Z");
    expect(snoozeFireAt(early, quiet).toISOString()).toBe(
      "2026-10-19T01:30:00.000Z",
    );

    const midday = new Date("2026-10-19T08:00:00.000Z");
    const afternoon = quietWindow("Asia/Kolkata", "13:00", "15:00");
    expect(snoozeFireAt(midday, afternoon).toISOString()).toBe(
      "2026-10-19T09:30:00.000Z",
    );

    const saved = snoozeMeal("meal-late", evening, quiet);
    expect(saved.ok).toBe(true);
    if (saved.ok) {
      expect(saved.until.toISOString()).toBe("2026-10-20T01:30:00.000Z");
    }
  });

  it("names the native surfaces that need a dev build", () => {
    expect(DEV_BUILD_NOTE).toContain("needs a dev build");
    expect(DEV_BUILD_NOTE).toContain("Live Activity");
    expect(DEV_BUILD_NOTE).toContain("Dynamic Island");
    expect(DEV_BUILD_NOTE).toContain("lock screen");
    expect(DEV_BUILD_NOTE).toContain("Android");
    expect(DEV_BUILD_NOTE).toContain("next set");
    expect(DEV_BUILD_NOTE).toContain("quiet hours");
  });
});
