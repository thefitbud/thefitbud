import { describe, expect, it } from "vitest";
import {
  LOGGING_OPENS_ON_THE_DAY,
  isFutureDay,
  msUntilNextLocalMidnight,
  opensOnLabel,
} from "./futureDay";

describe("future-day helpers (Z12-39, D-W12-7)", () => {
  it("only a day after today is a future day", () => {
    expect(isFutureDay("2026-11-16", "2026-11-15")).toBe(true);
    expect(isFutureDay("2026-11-15", "2026-11-15")).toBe(false);
    expect(isFutureDay("2026-11-14", "2026-11-15")).toBe(false);
  });

  it("names the day in product date style, never ISO", () => {
    const label = opensOnLabel("2026-11-16");
    expect(label).toBe("Opens on Mon 16 Nov");
    expect(label).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(LOGGING_OPENS_ON_THE_DAY).toBe("Logging opens on the day.");
  });

  it("counts to the trainee's civil midnight, not UTC midnight", () => {
    // 23:30 in Kolkata is 18:00 UTC: 30 minutes to go, not 6 hours.
    expect(
      msUntilNextLocalMidnight("Asia/Kolkata", new Date("2026-11-15T18:00:00.000Z")),
    ).toBe(30 * 60 * 1000);
    // 23:30 in New York (UTC−5 in November) is 04:30 UTC the next day.
    expect(
      msUntilNextLocalMidnight("America/New_York", new Date("2026-11-16T04:30:00.000Z")),
    ).toBe(30 * 60 * 1000);
  });
});
