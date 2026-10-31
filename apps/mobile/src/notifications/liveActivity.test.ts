import { describe, expect, it } from "vitest";
import {
  DEMO_LIVE_ACTIVITY,
  clearExpiredRest,
  clearRest,
  currentValueLine,
  formatKg,
  loggedSetLine,
  nextValueLine,
  reduceLiveActivity,
  restActive,
  setLogFromState,
  setProgressLine,
  stepWeight,
  withRest,
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

describe("lock-screen rest (27c)", () => {
  const NOW = Date.UTC(2026, 9, 19, 7, 25, 0);
  const rest = { endsAt: NOW + 90_000, seconds: 90 };

  it("sets rest fields when a set is logged with rest", () => {
    const logged = reduceLiveActivity(DEMO_LIVE_ACTIVITY, { type: "log_set" });
    const resting = withRest(logged, rest);
    expect(resting.restEndsAt).toBe(NOW + 90_000);
    expect(resting.restSeconds).toBe(90);
    expect(restActive(resting, NOW + 32_000)).toBe(true);
    expect(loggedSetLine(resting)).toBe("Set 2 logged · 22.5 kg × 10");
    expect(nextValueLine(resting)).toBe("Next 22.5 kg × 10");
  });

  it("clears rest on skip", () => {
    const resting = withRest(DEMO_LIVE_ACTIVITY, rest);
    expect(clearRest(resting)).toMatchObject({ restEndsAt: null, restSeconds: null });
    expect(withRest(resting, null)).toMatchObject({ restEndsAt: null, restSeconds: null });
  });

  it("clears rest on expiry and keeps it before", () => {
    const resting = withRest(DEMO_LIVE_ACTIVITY, rest);
    expect(clearExpiredRest(resting, NOW + 89_999)).toBe(resting);
    expect(restActive(resting, NOW + 90_000)).toBe(false);
    expect(clearExpiredRest(resting, NOW + 90_000)).toMatchObject({ restEndsAt: null, restSeconds: null });
  });

  it("has no rest state on the last set", () => {
    const lastSet = { ...DEMO_LIVE_ACTIVITY, setIndex: 3, setCount: 3 };
    const finished = reduceLiveActivity(lastSet, { type: "log_set" });
    expect(finished.finished).toBe(true);
    expect(withRest(finished, rest)).toMatchObject({ restEndsAt: null, restSeconds: null });
  });

  it("ignores a zero-length rest", () => {
    expect(withRest(DEMO_LIVE_ACTIVITY, { endsAt: NOW, seconds: 0 }).restEndsAt).toBeNull();
  });
});

describe("unknown Last", () => {
  it("drops Last from the progress line until a set is logged", () => {
    const first = { ...DEMO_LIVE_ACTIVITY, setIndex: 1, lastKnown: false };
    expect(setProgressLine(first)).toBe("Set 1 of 3");
    const logged = reduceLiveActivity(first, { type: "log_set" });
    expect(setProgressLine(logged)).toBe("Set 2 of 3 · Last: 22.5 kg × 10");
  });
});
