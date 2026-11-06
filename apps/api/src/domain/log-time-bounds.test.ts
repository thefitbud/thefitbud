import { describe, expect, it } from "vitest";
import { mealWindowForLocalDate } from "@fitbud/core";
import {
  LOG_TIME_FUTURE_DRIFT_MS,
  assertLogTimeWithinBounds,
} from "./log-time-bounds.js";

const MIN = 60 * 1000;

function iso(ms: number) {
  return new Date(ms).toISOString();
}

describe.each(["Asia/Kolkata", "America/New_York"])(
  "assertLogTimeWithinBounds in %s",
  (timeZone) => {
    const { windowStartsAt } = mealWindowForLocalDate({
      localDate: "2026-11-10",
      timeZone,
      confirmationWindowHours: 24,
    });
    const start = Date.parse(windowStartsAt);

    it("accepts exactly the local window start", () => {
      expect(
        assertLogTimeWithinBounds({
          clientLoggedAt: windowStartsAt,
          windowStart: windowStartsAt,
          now: iso(start + 60 * MIN),
        }),
      ).toEqual({ ok: true });
    });

    it("rejects one second before the local window start", () => {
      expect(
        assertLogTimeWithinBounds({
          clientLoggedAt: iso(start - 1000),
          windowStart: windowStartsAt,
          now: iso(start + 60 * MIN),
        }),
      ).toEqual({ ok: false, reason: "before_window" });
    });

    it("accepts a log inside the window", () => {
      expect(
        assertLogTimeWithinBounds({
          clientLoggedAt: iso(start + 8 * 60 * MIN),
          windowStart: windowStartsAt,
          now: iso(start + 9 * 60 * MIN),
        }),
      ).toEqual({ ok: true });
    });

    it("accepts up to 5 minutes ahead of the server clock and rejects 6", () => {
      const now = start + 10 * 60 * MIN;
      expect(LOG_TIME_FUTURE_DRIFT_MS).toBe(5 * MIN);
      expect(
        assertLogTimeWithinBounds({
          clientLoggedAt: iso(now + 5 * MIN),
          windowStart: windowStartsAt,
          now: iso(now),
        }),
      ).toEqual({ ok: true });
      expect(
        assertLogTimeWithinBounds({
          clientLoggedAt: iso(now + 6 * MIN),
          windowStart: windowStartsAt,
          now: iso(now),
        }),
      ).toEqual({ ok: false, reason: "future" });
    });

    it("accepts a queued log delivered long after it was made", () => {
      // Made 2 hours into the window, received 3 days later: judged on when it
      // was made, not on when the server got it.
      expect(
        assertLogTimeWithinBounds({
          clientLoggedAt: iso(start + 2 * 60 * MIN),
          windowStart: windowStartsAt,
          now: iso(start + 3 * 24 * 60 * MIN),
        }),
      ).toEqual({ ok: true });
    });
  },
);

describe("assertLogTimeWithinBounds across timezones", () => {
  it("the same instant is before one zone's window and inside the other's", () => {
    const kolkata = mealWindowForLocalDate({
      localDate: "2026-11-10",
      timeZone: "Asia/Kolkata",
      confirmationWindowHours: 24,
    }).windowStartsAt;
    const newYork = mealWindowForLocalDate({
      localDate: "2026-11-10",
      timeZone: "America/New_York",
      confirmationWindowHours: 24,
    }).windowStartsAt;
    // Kolkata midnight is earlier in UTC than New York midnight.
    expect(Date.parse(kolkata)).toBeLessThan(Date.parse(newYork));
    const between = iso(Date.parse(kolkata) + 60 * MIN);
    const now = iso(Date.parse(newYork) + 60 * MIN);
    expect(
      assertLogTimeWithinBounds({
        clientLoggedAt: between,
        windowStart: kolkata,
        now,
      }),
    ).toEqual({ ok: true });
    expect(
      assertLogTimeWithinBounds({
        clientLoggedAt: between,
        windowStart: newYork,
        now,
      }),
    ).toEqual({ ok: false, reason: "before_window" });
  });
});
