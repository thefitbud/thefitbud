import { describe, expect, it } from "vitest";
import {
  changedMealFields,
  clientLogEditDedupeKey,
  mergeClientLogEditPayload,
  type MealEntryValues,
} from "./client-log-edit-notify.js";
import {
  feedbackEditWindowAllows,
  mealEditWindowAllows,
  mealEditableUntil,
} from "./meal-edit-window.js";

const HOUR = 60 * 60 * 1000;
const LOGGED = "2026-11-02T06:00:00.000Z";

const plain: MealEntryValues = {
  outcome: "confirmed",
  deviationKind: null,
  notes: null,
  itemsJson: null,
  kcalScaled: 610_000_000,
};

describe("which parts of a meal log changed (D-W14-23 f)", () => {
  it("names outcome, portion, foods, kcal and note in the order the copy lists them", () => {
    expect(
      changedMealFields(plain, {
        outcome: "modified",
        deviationKind: "portion_adjustment",
        notes: "Less rice",
        itemsJson: "[1]",
        kcalScaled: 690_000_000,
      }),
    ).toEqual(["outcome", "portion", "note"]);
    expect(
      changedMealFields(plain, { ...plain, outcome: "modified", deviationKind: "restaurant", kcalScaled: 900_000_000 }),
    ).toEqual(["outcome", "kcal"]);
    expect(changedMealFields(plain, { ...plain, notes: "Added a banana" })).toEqual(["note"]);
    expect(changedMealFields(plain, plain)).toEqual([]);
  });
});

describe("one notification per entry per ten minutes (D-W14-23 d)", () => {
  it("keys the bucket on the server clock", () => {
    const a = clientLogEditDedupeKey("entry-1", "2026-11-02T06:01:00.000Z");
    const b = clientLogEditDedupeKey("entry-1", "2026-11-02T06:09:59.000Z");
    const c = clientLogEditDedupeKey("entry-1", "2026-11-02T06:10:00.000Z");
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect(clientLogEditDedupeKey("entry-2", "2026-11-02T06:01:00.000Z")).not.toBe(a);
  });

  it("keeps the first from values and takes the latest to values and action", () => {
    const first = {
      entryId: "11111111-1111-4111-8111-111111111111",
      action: "edited" as const,
      mealName: "Lunch",
      mealDate: "2026-11-02",
      fromKcal: 610,
      toKcal: 690,
      fromOutcome: "confirmed",
      toOutcome: "modified",
      fields: ["outcome" as const],
    };
    const merged = mergeClientLogEditPayload(first, {
      ...first,
      fromKcal: 690,
      fromOutcome: "modified",
      toKcal: 720,
      fields: ["kcal" as const],
    });
    expect(merged).toMatchObject({ fromKcal: 610, fromOutcome: "confirmed", toKcal: 720, fields: ["outcome", "kcal"] });
    expect(
      mergeClientLogEditPayload(first, { ...first, action: "removed", toKcal: null, toOutcome: null, fields: [] }),
    ).toMatchObject({ action: "removed", fromKcal: 610, toKcal: null, fields: [] });
  });
});

describe("the edit windows (D-W14-22, D-W14-20)", () => {
  it("is loggedAt + 24 h for the trainee's own entry, null for coach-made or ended", () => {
    expect(mealEditableUntil({ loggedAt: LOGGED, loggedByRole: "trainee" }, false)).toBe("2026-11-03T06:00:00.000Z");
    expect(mealEditableUntil({ loggedAt: LOGGED, loggedByRole: "coach" }, false)).toBeNull();
    expect(mealEditableUntil({ loggedAt: LOGGED, loggedByRole: "trainee", lastEditedByRole: "coach" }, false)).toBeNull();
    expect(mealEditableUntil({ loggedAt: LOGGED, loggedByRole: "trainee" }, true)).toBeNull();
  });

  it("online: inside the 24 h only", () => {
    const at = (hours: number) => new Date(Date.parse(LOGGED) + hours * HOUR).toISOString();
    expect(mealEditWindowAllows({ loggedAt: LOGGED, now: at(23.9), deviceTime: null })).toBe(true);
    expect(mealEditWindowAllows({ loggedAt: LOGGED, now: at(24.1), deviceTime: null })).toBe(false);
  });

  it("offline: device time inside the window, not in the future, arrival within 72 h of closing", () => {
    const at = (hours: number) => new Date(Date.parse(LOGGED) + hours * HOUR).toISOString();
    expect(mealEditWindowAllows({ loggedAt: LOGGED, now: at(26), deviceTime: at(2) })).toBe(true);
    expect(mealEditWindowAllows({ loggedAt: LOGGED, now: at(24 + 72), deviceTime: at(2) })).toBe(true);
    expect(mealEditWindowAllows({ loggedAt: LOGGED, now: at(24 + 80), deviceTime: at(2) })).toBe(false);
    expect(mealEditWindowAllows({ loggedAt: LOGGED, now: at(3), deviceTime: at(3.2) })).toBe(false);
    expect(mealEditWindowAllows({ loggedAt: LOGGED, now: at(3), deviceTime: at(3.05) })).toBe(true);
    expect(mealEditWindowAllows({ loggedAt: LOGGED, now: at(3), deviceTime: at(-1) })).toBe(false);
    expect(mealEditWindowAllows({ loggedAt: LOGGED, now: at(30), deviceTime: at(25) })).toBe(false);
  });

  it("the rating window is 48 h with the same offline rule", () => {
    const at = (hours: number) => new Date(Date.parse(LOGGED) + hours * HOUR).toISOString();
    expect(feedbackEditWindowAllows({ completedAt: LOGGED, now: at(47.9), deviceTime: null })).toBe(true);
    expect(feedbackEditWindowAllows({ completedAt: LOGGED, now: at(48.1), deviceTime: null })).toBe(false);
    expect(feedbackEditWindowAllows({ completedAt: LOGGED, now: at(50), deviceTime: at(1) })).toBe(true);
    expect(feedbackEditWindowAllows({ completedAt: LOGGED, now: at(48 + 80), deviceTime: at(1) })).toBe(false);
  });
});
