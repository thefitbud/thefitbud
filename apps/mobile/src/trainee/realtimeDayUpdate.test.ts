import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDayViews,
  dayViewKey,
  cacheKey,
  getCacheEntry,
  setCached,
  subscribeAll,
} from "./dataCache";
import { applyRealtimeHint } from "./realtimeDayUpdate";

const REL = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function actions() {
  return { reloadPlan: vi.fn(), refreshUnread: vi.fn() };
}

function seed() {
  setCached(dayViewKey("today", REL, "2026-11-25"), { meals: ["Poha"] });
  setCached(dayViewKey("diet", REL, "2026-11-24"), { meals: ["Dal"] });
  setCached(cacheKey("meals", REL, "2026-11-25", "2026-11-25"), { items: [] });
  setCached(cacheKey("workouts", REL, "2026-11-23", "2026-11-29"), { items: [] });
  setCached(dayViewKey("today", OTHER, "2026-11-25"), { meals: ["Other"] });
}

beforeEach(() => {
  clearDayViews();
  seed();
});

describe("applyRealtimeHint", () => {
  it.each(["meal_compliance_changed", "workout_execution_changed"] as const)(
    "%s marks cached days stale, keeps them, and does not reload the plan",
    (eventType) => {
      const a = actions();
      const notified = vi.fn();
      const off = subscribeAll(notified);
      applyRealtimeHint({ eventType }, REL, a);
      off();

      expect(a.reloadPlan).not.toHaveBeenCalled();
      expect(notified).toHaveBeenCalledTimes(1);
      const today = getCacheEntry<{ meals: string[] }>(
        dayViewKey("today", REL, "2026-11-25"),
      );
      // Still on screen from the cache, but due a refetch.
      expect(today?.value).toEqual({ meals: ["Poha"] });
      expect(today?.stale).toBe(true);
      expect(
        getCacheEntry(dayViewKey("diet", REL, "2026-11-24"))?.stale,
      ).toBe(true);
      expect(
        getCacheEntry(cacheKey("meals", REL, "2026-11-25", "2026-11-25"))
          ?.stale,
      ).toBe(true);
      expect(
        getCacheEntry(cacheKey("workouts", REL, "2026-11-23", "2026-11-29"))
          ?.stale,
      ).toBe(true);
    },
  );

  it("leaves another relationship's days alone", () => {
    applyRealtimeHint({ eventType: "meal_compliance_changed" }, REL, actions());
    expect(
      getCacheEntry(dayViewKey("today", OTHER, "2026-11-25"))?.stale,
    ).toBe(false);
  });

  it("effective_plan_changed reloads the plan and marks cached days stale", () => {
    const a = actions();
    applyRealtimeHint({ eventType: "effective_plan_changed" }, REL, a);
    expect(a.reloadPlan).toHaveBeenCalledTimes(1);
    expect(
      getCacheEntry(dayViewKey("today", REL, "2026-11-25"))?.stale,
    ).toBe(true);
  });

  it.each([
    "checkin_submitted",
    "checkin_reviewed",
    "exception_created",
    "exception_acknowledged",
    "exception_resolved",
    "exception_changed",
  ] as const)("%s only refreshes unread", (eventType) => {
    const a = actions();
    applyRealtimeHint({ eventType }, REL, a);
    expect(a.reloadPlan).not.toHaveBeenCalled();
    expect(a.refreshUnread).toHaveBeenCalledTimes(1);
    expect(
      getCacheEntry(dayViewKey("today", REL, "2026-11-25"))?.stale,
    ).toBe(false);
  });

  it("an unknown future event type is a quiet unread refresh", () => {
    const a = actions();
    expect(() =>
      applyRealtimeHint({ eventType: "something_new" } as never, REL, a),
    ).not.toThrow();
    expect(a.reloadPlan).not.toHaveBeenCalled();
    expect(a.refreshUnread).toHaveBeenCalledTimes(1);
  });
});
