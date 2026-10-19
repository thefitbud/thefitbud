import { describe, expect, it } from "vitest";
import {
  DEMO_LIVE_ACTIVITY,
  formatKg,
  reduceLiveActivity,
  setLogFromState,
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
  });

  it("logs the set with the stepped values, then rests", () => {
    const stepped = reduceLiveActivity(DEMO_LIVE_ACTIVITY, {
      type: "weight",
      direction: -1,
    });
    const logged = reduceLiveActivity(stepped, { type: "log_set" });
    expect(logged.phase).toBe("rest");
    expect(logged.restLeft).toBe(58);
    expect(setLogFromState(stepped, "Romanian deadlift")).toEqual({
      operation: "workout.log_set",
      exerciseName: "Romanian deadlift",
      setIndex: 2,
      kilograms: 20,
      reps: 10,
    });
    const skipped = reduceLiveActivity(logged, { type: "skip_rest" });
    expect(skipped.phase).toBe("go");
    const longer = reduceLiveActivity(logged, { type: "add_rest" });
    expect(longer.restLeft).toBe(88);
  });
});
