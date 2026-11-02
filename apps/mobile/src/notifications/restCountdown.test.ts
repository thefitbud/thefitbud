import { describe, expect, it } from "vitest";
import { restAlarmPlan, restCountdownRender } from "./restCountdown";

/**
 * The executable specification for the rest countdown, on both surfaces
 * (LA3d). The Android notification's Kotlin mirror (RestCountdown.kt) cannot
 * be compiled or run in this repo's CI — there is no Android SDK, emulator or
 * device in a cloud session — so these cases are the only automated check that
 * the rules the notification depends on hold.
 *
 * The defect they pin: the notification's countdown is a system `Chronometer`
 * with a base in the future, which keeps ticking past zero and renders
 * negative elapsed time once the rest has ended. Nothing here may ever report
 * a rest as running, or a duration as remaining, past the rest's end instant.
 */

const REST_START = Date.UTC(2026, 9, 21, 7, 25, 0);
const REST_SECONDS = 90;
const REST_END = REST_START + REST_SECONDS * 1000;

const resting = { restEndsAt: REST_END, restSeconds: REST_SECONDS };

describe("restCountdownRender", () => {
  it("counts down inside the rest window", () => {
    const render = restCountdownRender(resting, REST_START + 30_000);
    expect(render).toEqual({
      kind: "resting",
      remainingMs: 60_000,
      elapsedMs: 30_000,
      totalMs: 90_000,
    });
  });

  it("is still resting with one millisecond left", () => {
    expect(restCountdownRender(resting, REST_END - 1)).toEqual({
      kind: "resting",
      remainingMs: 1,
      elapsedMs: 89_999,
      totalMs: 90_000,
    });
  });

  it("has ended exactly at the rest's end instant", () => {
    // `endsAt <= now`, not `<`: at the end there is nothing left to count.
    expect(restCountdownRender(resting, REST_END)).toEqual({ kind: "ended" });
  });

  it("has ended, with no negative duration, long after the rest's end", () => {
    // The frozen-app case: the process never woke to update the notification,
    // and the Chronometer has been showing "-0:14" on the lock screen.
    const render = restCountdownRender(resting, REST_END + 14_000);
    expect(render).toEqual({ kind: "ended" });
    expect(render).not.toHaveProperty("remainingMs");
  });

  it("never reports a negative remaining duration at any instant past the end", () => {
    for (const offset of [0, 1, 500, 14_000, 3_600_000, 86_400_000]) {
      const render = restCountdownRender(resting, REST_END + offset);
      expect(render.kind).toBe("ended");
    }
    for (const offset of [1, 500, 30_000, 89_999]) {
      const render = restCountdownRender(resting, REST_END - offset);
      if (render.kind !== "resting") throw new Error("expected a running rest");
      expect(render.remainingMs).toBe(offset);
      expect(render.remainingMs).toBeGreaterThan(0);
      expect(render.elapsedMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("has ended when the rest was skipped", () => {
    // Skip rest clears both fields, on the notification and in the app.
    expect(restCountdownRender({ restEndsAt: null, restSeconds: null }, REST_START)).toEqual({
      kind: "ended",
    });
    expect(restCountdownRender({}, REST_START)).toEqual({ kind: "ended" });
  });

  it("has ended when the workout is finished, whatever the rest fields say", () => {
    expect(restCountdownRender({ ...resting, finished: true }, REST_START)).toEqual({
      kind: "ended",
    });
  });

  it("widens the window for a rest extended past its planned length", () => {
    // 150 s left of a rest planned at 90 s: elapsed must not go negative.
    const extended = { restEndsAt: REST_START + 150_000, restSeconds: REST_SECONDS };
    expect(restCountdownRender(extended, REST_START)).toEqual({
      kind: "resting",
      remainingMs: 150_000,
      elapsedMs: 0,
      totalMs: 150_000,
    });
  });

  it("falls back to the time left when the rest length is missing or unusable", () => {
    for (const restSeconds of [null, undefined, 0, -30, Number.NaN]) {
      expect(restCountdownRender({ restEndsAt: REST_END, restSeconds }, REST_START)).toEqual({
        kind: "resting",
        remainingMs: 90_000,
        elapsedMs: 0,
        totalMs: 90_000,
      });
    }
  });

  it("has ended for an unusable end instant", () => {
    for (const restEndsAt of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(restCountdownRender({ restEndsAt, restSeconds: REST_SECONDS }, REST_START)).toEqual({
        kind: "ended",
      });
    }
  });
});

describe("restAlarmPlan", () => {
  it("schedules the repaint at the rest's end while rest is running", () => {
    expect(restAlarmPlan(resting, REST_START)).toEqual({
      cancelExisting: true,
      fireAtMs: REST_END,
    });
  });

  it("cancels and schedules nothing once the rest has ended", () => {
    // Firing late must be a no-op, so nothing is left scheduled for a rest
    // that is already over.
    expect(restAlarmPlan(resting, REST_END)).toEqual({
      cancelExisting: true,
      fireAtMs: null,
    });
    expect(restAlarmPlan(resting, REST_END + 60_000)).toEqual({
      cancelExisting: true,
      fireAtMs: null,
    });
  });

  it("cancels a scheduled repaint when the rest is skipped", () => {
    // Every state replaces the one before it: a skipped rest must leave no
    // stale repaint behind to resurrect a countdown.
    expect(restAlarmPlan({ restEndsAt: null, restSeconds: null }, REST_START)).toEqual({
      cancelExisting: true,
      fireAtMs: null,
    });
  });

  it("cancels a scheduled repaint when the workout finishes", () => {
    expect(restAlarmPlan({ ...resting, finished: true }, REST_START)).toEqual({
      cancelExisting: true,
      fireAtMs: null,
    });
  });

  it("cancels the old repaint and schedules the new one for a shortened rest", () => {
    const shortened = { restEndsAt: REST_START + 20_000, restSeconds: 20 };
    expect(restAlarmPlan(shortened, REST_START)).toEqual({
      cancelExisting: true,
      fireAtMs: REST_START + 20_000,
    });
  });

  it("cancels on every state, running or not", () => {
    for (const input of [
      resting,
      { restEndsAt: null, restSeconds: null },
      { ...resting, finished: true },
      {},
    ]) {
      expect(restAlarmPlan(input, REST_START).cancelExisting).toBe(true);
    }
  });
});
