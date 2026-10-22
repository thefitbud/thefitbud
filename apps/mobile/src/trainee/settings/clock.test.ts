import { describe, expect, it } from "vitest";
import {
  MEAL_REMINDER_AFTER_MINUTES,
  WORKOUT_FALLBACK_ANCHOR,
  WORKOUT_REMINDER_AFTER_MINUTES,
  DAILY_SUMMARY_CAP_LOCAL_TIME,
  HARD_STOP_LOCAL_TIME,
  isWithinQuietHours,
} from "@fitbud/core";
import {
  clockRange,
  mealReminderClock,
  quietSpanMinutes,
  validateMealTimes,
  validateQuietHours,
} from "./clock";

describe("quiet hours and meal times", () => {
  it("accepts the night preset and rejects a short range", () => {
    expect(quietSpanMinutes("22:00", "07:00")).toBe(9 * 60);
    expect(validateQuietHours("22:00", "07:00")).toBeNull();
    expect(validateQuietHours("22:00", "02:00")).toMatch(/at least 6/);
    expect(validateQuietHours("18:00", "08:00")).toMatch(/at most 12/);
  });

  it("formats quiet hours in 12-hour time", () => {
    expect(clockRange("22:00", "07:00")).toBe("10:00 pm – 7:00 am");
  });

  it("keeps meals in order and an hour apart", () => {
    expect(
      validateMealTimes([
        { label: "Breakfast", time: "08:00" },
        { label: "Lunch", time: "08:30" },
      ]),
    ).toBe("Lunch needs to be at least an hour after Breakfast.");
    expect(
      validateMealTimes([
        { label: "Lunch", time: "14:30" },
        { label: "Dinner", time: "20:30" },
      ]),
    ).toBeNull();
  });

  it("moves a 2:30 pm lunch reminder to 3:10 pm", () => {
    expect(MEAL_REMINDER_AFTER_MINUTES).toBe(40);
    expect(mealReminderClock("14:30")).toBe("15:10");
    expect(WORKOUT_REMINDER_AFTER_MINUTES).toBeGreaterThanOrEqual(60);
    expect(WORKOUT_REMINDER_AFTER_MINUTES).toBeLessThanOrEqual(90);
    expect(WORKOUT_FALLBACK_ANCHOR).toBe("18:00");
    expect(DAILY_SUMMARY_CAP_LOCAL_TIME).toBe("21:30");
    expect(HARD_STOP_LOCAL_TIME).toBe("22:00");
    expect(
      isWithinQuietHours({
        localTimeHhMm: "22:10",
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
      }),
    ).toBe(true);
    expect(
      isWithinQuietHours({
        localTimeHhMm: "21:00",
        quietHoursStart: "23:00",
        quietHoursEnd: "06:00",
      }),
    ).toBe(false);
  });
});
