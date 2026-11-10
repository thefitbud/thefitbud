import { describe, expect, it } from "vitest";
import { formatLocalDate, mealWindowForLocalDate } from "@fitbud/core";
import {
  LOG_TIME_FUTURE_DRIFT_MS,
  assertLogTimeWithinBounds,
  isInEndedPeriod,
  resolveLogInstant,
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

describe("resolveLogInstant near local midnight", () => {
  it.each(["Asia/Kolkata", "America/New_York"])(
    "keeps a log made one minute before midnight on that civil day in %s",
    (timeZone) => {
      const { windowStartsAt, windowEndsAt } = mealWindowForLocalDate({
        localDate: "2026-11-10",
        timeZone,
        confirmationWindowHours: 24,
      });
      const clientLoggedAt = new Date(
        Date.parse(windowEndsAt) - 60_000,
      ).toISOString();
      const receivedAt = new Date(
        Date.parse(windowEndsAt) + 2 * 60_000,
      ).toISOString();

      const judged = resolveLogInstant({ clientLoggedAt, now: receivedAt });
      expect(formatLocalDate(new Date(judged), timeZone)).toBe("2026-11-10");
      expect(formatLocalDate(new Date(receivedAt), timeZone)).toBe("2026-11-11");
      expect(
        assertLogTimeWithinBounds({
          clientLoggedAt: judged,
          windowStart: windowStartsAt,
          now: receivedAt,
        }),
      ).toEqual({ ok: true });

      const shifted = resolveLogInstant({ now: receivedAt });
      expect(shifted).toBe(receivedAt);
      expect(formatLocalDate(new Date(shifted), timeZone)).toBe("2026-11-11");
    },
  );

  it("canonicalizes an offset and a Zulu time without milliseconds before string compare", () => {
    const { windowEndsAt } = mealWindowForLocalDate({
      localDate: "2026-11-10",
      timeZone: "Asia/Kolkata",
      confirmationWindowHours: 24,
    });
    // 23:59 IST is one minute before local midnight, and one minute before the
    // Zulu window end. The raw offset sorts after that window end.
    const offset = "2026-11-10T23:59:00+05:30";
    const receivedAt = new Date(Date.parse(windowEndsAt) + 2 * 60_000).toISOString();
    const judged = resolveLogInstant({ clientLoggedAt: offset, now: receivedAt });
    expect(judged).toBe("2026-11-10T18:29:00.000Z");
    expect(offset > windowEndsAt).toBe(true);
    expect(judged <= windowEndsAt).toBe(true);
    expect(formatLocalDate(new Date(judged), "Asia/Kolkata")).toBe("2026-11-10");
    expect(
      assertLogTimeWithinBounds({
        clientLoggedAt: judged,
        windowStart: mealWindowForLocalDate({
          localDate: "2026-11-10",
          timeZone: "Asia/Kolkata",
          confirmationWindowHours: 24,
        }).windowStartsAt,
        now: receivedAt,
      }),
    ).toEqual({ ok: true });

    const bareZulu = "2026-11-10T18:30:00Z";
    const atEnd = resolveLogInstant({ clientLoggedAt: bareZulu, now: receivedAt });
    expect(bareZulu > windowEndsAt).toBe(true);
    expect(atEnd).toBe(windowEndsAt);
    expect(atEnd > windowEndsAt).toBe(false);
  });
});

describe("isInEndedPeriod (EC1 rule 1)", () => {
  // Thu 12 Nov 2026, 00:10 in Kolkata = Wed 11 Nov, 18:40 UTC.
  const reactivatedAt = "2026-11-11T18:40:00.000Z";
  const after = "2026-11-11T19:00:00.000Z";

  it("has no frozen period for a relationship that was never reactivated", () => {
    expect(
      isInEndedPeriod({
        reactivatedAt: null,
        loggedAt: "2026-01-01T00:00:00.000Z",
        localDate: "2026-01-01",
        timeZone: "Asia/Kolkata",
      }),
    ).toBe(false);
  });

  it("freezes a log made before the reactivation, even on a later-dated item", () => {
    expect(
      isInEndedPeriod({
        reactivatedAt,
        loggedAt: "2026-11-11T18:39:59.999Z",
        localDate: "2026-11-12",
        timeZone: "Asia/Kolkata",
      }),
    ).toBe(true);
    expect(
      isInEndedPeriod({
        reactivatedAt,
        loggedAt: reactivatedAt,
        localDate: "2026-11-12",
        timeZone: "Asia/Kolkata",
      }),
    ).toBe(false);
  });

  it("freezes an item dated before the reactivation day in the trainee's timezone", () => {
    const at = (localDate: string, timeZone: string) =>
      isInEndedPeriod({ reactivatedAt, loggedAt: after, localDate, timeZone });
    // In Kolkata the reactivation is on Thu 12 Nov: Wed is frozen, Thu is not.
    expect(at("2026-11-11", "Asia/Kolkata")).toBe(true);
    expect(at("2026-11-12", "Asia/Kolkata")).toBe(false);
    // In New York the same instant is still Wed 11 Nov.
    expect(at("2026-11-10", "America/New_York")).toBe(true);
    expect(at("2026-11-11", "America/New_York")).toBe(false);
  });
});
