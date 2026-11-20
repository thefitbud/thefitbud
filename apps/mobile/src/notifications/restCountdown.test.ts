import { describe, expect, it } from "vitest";
import {
  adjustRest,
  formatRestClock,
  restAlarmPlan,
  restCountdownRender,
  restElapsedFraction,
  restSecondsShown,
} from "./restCountdown";

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

/**
 * Z12-45: what the in-app rest bar reads. The bar keeps no counter: its text
 * is derived from the same end instant the lock-screen countdown counts to,
 * so the two agree to the second (Z12-48 builds its lines on these).
 */
describe("the in-app rest bar (W-05a)", () => {
  const shown = (now: number) =>
    formatRestClock(restSecondsShown(restCountdownRender(resting, now)));

  it("opens on the full rest and shows the seconds still to go, rounded up", () => {
    expect(shown(REST_START)).toBe("1:30");
    expect(shown(REST_START + 1)).toBe("1:30");
    expect(shown(REST_START + 1_000)).toBe("1:29");
    expect(shown(REST_START + 31_500)).toBe("0:59");
    expect(shown(REST_START + 32_000)).toBe("0:58");
    expect(shown(REST_END - 1_000)).toBe("0:01");
    expect(shown(REST_END - 1)).toBe("0:01");
  });

  it("never shows 0:00 for a running rest, and has no clock once it is over", () => {
    for (let ms = 0; ms < REST_SECONDS * 1000; ms += 250) {
      const render = restCountdownRender(resting, REST_START + ms);
      expect(render.kind).toBe("resting");
      expect(restSecondsShown(render)).toBeGreaterThanOrEqual(1);
      expect(restSecondsShown(render)).toBeLessThanOrEqual(REST_SECONDS);
    }
    expect(restCountdownRender(resting, REST_END).kind).toBe("ended");
    expect(restSecondsShown(restCountdownRender(resting, REST_END))).toBe(0);
  });

  it("a tick that comes late shows the right second, because nothing is counted", () => {
    // 32 s in, read once after a long gap (the app was in the background).
    expect(shown(REST_START + 32_000)).toBe("0:58");
    expect(shown(REST_START + 75_300)).toBe("0:15");
  });

  it("the fill is the share of the rest already spent", () => {
    expect(restElapsedFraction(restCountdownRender(resting, REST_START))).toBe(0);
    expect(restElapsedFraction(restCountdownRender(resting, REST_START + 45_000))).toBe(0.5);
    expect(restElapsedFraction(restCountdownRender(resting, REST_END))).toBe(1);
  });

  it("−15 and +15 move the end instant and the length together", () => {
    const rest = { endsAt: REST_END, seconds: REST_SECONDS };
    const more = adjustRest(rest, 15, REST_START + 32_000)!;
    expect(more).toEqual({ endsAt: REST_END + 15_000, seconds: 105 });
    expect(
      formatRestClock(
        restSecondsShown(
          restCountdownRender(
            { restEndsAt: more.endsAt, restSeconds: more.seconds },
            REST_START + 32_000,
          ),
        ),
      ),
    ).toBe("1:13");
    expect(adjustRest(rest, -15, REST_START + 32_000)).toEqual({
      endsAt: REST_END - 15_000,
      seconds: 75,
    });
    // Less than 15 s left: −15 ends the rest.
    expect(adjustRest(rest, -15, REST_END - 15_000)).toBeNull();
    expect(adjustRest(rest, -15, REST_END - 10_000)).toBeNull();
  });
});
