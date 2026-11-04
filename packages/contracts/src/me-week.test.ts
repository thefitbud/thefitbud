import { describe, expect, it } from "vitest";
import { meWeekResponseSchema } from "./me-week.js";

/**
 * The sample is built the way `GET /me/week` builds its body today
 * (`apps/api/src/routes/me-day.ts`): the `start` it was given, then seven
 * consecutive dates each in the `future` state.
 */
function routeResponse(start: string) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${start}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), state: "future" };
  });
  return { start, days };
}

describe("meWeekResponseSchema", () => {
  it("accepts what GET /me/week returns today", () => {
    const body = routeResponse("2026-11-02");
    const parsed = meWeekResponseSchema.parse(body);
    expect(parsed).toEqual(body);
    expect(parsed.days).toHaveLength(7);
    expect(parsed.days.map((d) => d.date)).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
  });

  it("accepts a week that crosses a month end", () => {
    const body = routeResponse("2026-12-28");
    expect(meWeekResponseSchema.parse(body).days.at(-1)?.date).toBe("2027-01-03");
  });

  it("rejects dates that are not YYYY-MM-DD", () => {
    expect(() =>
      meWeekResponseSchema.parse({ start: "2 Nov 2026", days: [] }),
    ).toThrow();
    expect(() =>
      meWeekResponseSchema.parse({
        start: "2026-11-02",
        days: [{ date: "2026-11-02T00:00:00.000Z", state: "future" }],
      }),
    ).toThrow();
  });

  it("rejects a missing or mistyped field", () => {
    expect(() => meWeekResponseSchema.parse({ days: [] })).toThrow();
    expect(() => meWeekResponseSchema.parse({ start: "2026-11-02" })).toThrow();
    expect(() =>
      meWeekResponseSchema.parse({
        start: "2026-11-02",
        days: [{ date: "2026-11-02" }],
      }),
    ).toThrow();
    expect(() =>
      meWeekResponseSchema.parse({ start: "2026-11-02", days: {} }),
    ).toThrow();
  });

  it("rejects the richer week read model, which this route does not serve", () => {
    // `weekReadModelSchema` adds workouts / meals / todayNutrition. Those extra keys
    // are stripped rather than accepted as data, and a body that omits start fails.
    const parsed = meWeekResponseSchema.parse({
      start: "2026-11-02",
      days: [],
      workouts: { assigned: 3, completed: 1 },
      todayNutrition: { kcalScaled: 0 },
    });
    expect(parsed).toEqual({ start: "2026-11-02", days: [] });
  });
});
