import { describe, expect, it } from "vitest";
import {
  DEMO_LIVE_ACTIVITY,
  currentValueLine,
  formatKg,
  loggedSetLine,
  reduceLiveActivity,
  setLogFromState,
  setProgressLine,
  stepWeight,
} from "./liveActivity";

describe("live activity set logging", () => {
  it("steps weight by 2.5 kg and reps by 1", () => {
    expect(stepWeight(22.5, 1)).toBe(25);
    expect(stepWeight(2.5, -1)).toBe(0);
    expect(stepWeight(0, -1)).toBe(0);
    const heavier = reduceLiveActivity(DEMO_LIVE_ACTIVITY, {
      type: "weight",
      direction: 1,
    });
    const moreReps = reduceLiveActivity(heavier, { type: "reps", direction: 1 });
    expect(moreReps.kilograms).toBe(25);
    expect(moreReps.reps).toBe(11);
    expect(formatKg(moreReps.kilograms)).toBe("25");
    expect(formatKg(22.5)).toBe("22.5");
    expect(currentValueLine(moreReps)).toBe("25 kg × 11");
  });

  it("logs the set and advances to the next set", () => {
    expect(setProgressLine(DEMO_LIVE_ACTIVITY)).toBe(
      "Set 2 of 3 · Last: 20 kg × 10",
    );
    const logged = reduceLiveActivity(DEMO_LIVE_ACTIVITY, { type: "log_set" });
    expect(logged.finished).toBe(false);
    expect(logged.setIndex).toBe(3);
    expect(logged.lastKg).toBe(22.5);
    expect(logged.lastReps).toBe(10);
    expect(logged.kilograms).toBe(22.5);
    expect(logged.reps).toBe(10);
    expect(loggedSetLine(logged)).toBe("Set 2 logged · 22.5 kg × 10");
    expect(setProgressLine(logged)).toBe("Set 3 of 3 · Last: 22.5 kg × 10");
    expect(setLogFromState(DEMO_LIVE_ACTIVITY, "Romanian deadlift")).toEqual({
      operation: "workout.log_set",
      exerciseName: "Romanian deadlift",
      setIndex: 2,
      kilograms: 22.5,
      reps: 10,
    });
  });

  it("keeps a stepped value on the logged set, then prefills the plan", () => {
    const stepped = reduceLiveActivity(DEMO_LIVE_ACTIVITY, {
      type: "weight",
      direction: -1,
    });
    const logged = reduceLiveActivity(stepped, { type: "log_set" });
    expect(loggedSetLine(logged)).toBe("Set 2 logged · 20 kg × 10");
    expect(logged.kilograms).toBe(22.5);
    expect(setLogFromState(stepped, "Romanian deadlift").kilograms).toBe(20);
  });

  it("stops after the last set", () => {
    const second = reduceLiveActivity(DEMO_LIVE_ACTIVITY, { type: "log_set" });
    const third = reduceLiveActivity(second, { type: "log_set" });
    expect(third.finished).toBe(true);
    expect(third.setIndex).toBe(3);
    expect(loggedSetLine(third)).toBe("Set 3 logged · 22.5 kg × 10");
    const nudged = reduceLiveActivity(third, { type: "weight", direction: 1 });
    expect(nudged.kilograms).toBe(22.5);
    expect(reduceLiveActivity(third, { type: "log_set" })).toEqual(third);
  });
});
