/**
 * Z14-16: Edited / Removed tags and the client-edit marker lines (TM-09e, TM-09f).
 */
import { describe, expect, it } from "vitest";
import {
  activityTag,
  clientEditMarker,
  isClientEdited,
  matchesActivityFilter,
  type ActivityEventLike,
} from "./model";

const base: ActivityEventLike = {
  id: "log_edit:1",
  relationshipId: "11111111-1111-4111-8111-111111111111",
  traineeDisplayName: "Aarav Mehta",
  type: "client_edited",
  subtype: "Edited",
  occurredAt: "2026-11-14T08:35:00.000Z",
  traineeLocalTime: null,
  summary: "Edited lunch",
};

describe("client meal change tags", () => {
  it("tags an edit Edited and a removal Removed, neutral kinds", () => {
    expect(activityTag(base)).toEqual({ kind: "edited", label: "Edited" });
    expect(
      activityTag({
        ...base,
        type: "client_removed",
        subtype: "Removed",
        summary: "Removed the dinner log",
      }),
    ).toEqual({ kind: "removed", label: "Removed" });
  });

  it("keeps a rating change on its own label", () => {
    expect(activityTag({ ...base, subtype: "Rating", summary: "Rated Legs: RPE 8" })).toEqual({
      kind: "other",
      label: "Rating",
    });
  });

  it("shows under Meals and Changes, not Workouts", () => {
    expect(matchesActivityFilter(base, "meals")).toBe(true);
    expect(matchesActivityFilter(base, "changes")).toBe(true);
    expect(matchesActivityFilter(base, "workouts")).toBe(false);
  });
});

describe("clientEditMarker", () => {
  const edited = {
    lastEditedByRole: "trainee" as const,
    lastEditedAt: "2026-11-14T08:35:00.000Z",
    updatedAt: "2026-11-14T08:35:00.000Z",
    previousValue: { outcome: "confirmed", deviationKind: null, kcal: 610 },
  };

  it("names who, when and what it was before", () => {
    expect(clientEditMarker(edited, "Aarav Mehta", "Asia/Kolkata")).toEqual({
      by: "Edited by Aarav · Sat 14 Nov, 2:05 pm",
      was: "Was 610 kcal · as planned",
    });
  });

  it("covers each previous outcome", () => {
    const was = (previousValue: { outcome: string; deviationKind: string | null; kcal: number | null }) =>
      clientEditMarker({ ...edited, previousValue }, "Aarav", "Asia/Kolkata")?.was;
    expect(was({ outcome: "modified", deviationKind: "restaurant", kcal: 1120 })).toBe(
      "Was 1,120 kcal · ate out",
    );
    expect(was({ outcome: "modified", deviationKind: "portion_adjustment", kcal: 700 })).toBe(
      "Was 700 kcal · changed portion",
    );
    expect(was({ outcome: "skipped", deviationKind: null, kcal: null })).toBe("Was skipped");
  });

  it("is absent for an unedited entry and for a coach edit", () => {
    expect(clientEditMarker({ ...edited, lastEditedByRole: null }, "Aarav", "Asia/Kolkata")).toBeNull();
    expect(clientEditMarker({ ...edited, lastEditedByRole: "coach" }, "Aarav", "Asia/Kolkata")).toBeNull();
    expect(clientEditMarker(null, "Aarav", "Asia/Kolkata")).toBeNull();
    expect(isClientEdited({ lastEditedByRole: "coach" })).toBe(false);
    expect(isClientEdited({ lastEditedByRole: "trainee" })).toBe(true);
  });
});
