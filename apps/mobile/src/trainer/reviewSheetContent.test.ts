import { describe, expect, it } from "vitest";
import type { ExceptionDetail, WorkoutAssignment } from "@fitbud/contracts";
import {
  buildReviewSheetCardModel,
  coachingWeekNumber,
  reviewSheetCardBody,
  reviewSheetCardTitle,
  reviewSheetClientSubtitle,
  reviewSheetLoggedLine,
  reviewSheetPlannedLine,
  reviewSheetReminderLine,
} from "./reviewSheetContent";

function detail(
  overrides: Partial<ExceptionDetail> &
    Pick<ExceptionDetail, "type" | "summary">,
): ExceptionDetail {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    coachingRelationshipId: "44444444-4444-4444-8444-444444444444",
    severity: "critical",
    status: "active",
    ruleVersion: "demo-v1",
    sourceEntityType: "workout_assignment",
    sourceEntityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    details: { localDate: "2026-10-13" },
    detectedAt: "2026-10-13T18:00:00.000Z",
    activatedAt: null,
    acknowledgedAt: null,
    resolvedAt: null,
    createdAt: "2026-10-13T18:00:00.000Z",
    updatedAt: "2026-10-13T18:00:00.000Z",
    actions: [],
    ...overrides,
  };
}

describe("review sheet card content (frame 31)", () => {
  it("builds goal · week · N open items subtitle", () => {
    expect(
      reviewSheetClientSubtitle({
        goalShort: "Lose 6 kg",
        weekNumber: 6,
        openCount: 3,
      }),
    ).toBe("Lose 6 kg · week 6 · 3 open items");
    expect(
      reviewSheetClientSubtitle({
        goalShort: null,
        weekNumber: null,
        openCount: 1,
      }),
    ).toBe("1 open item");
  });

  it("titles as kind · civil date, not raw summary alone", () => {
    expect(
      reviewSheetCardTitle({
        type: "missed_workout",
        localDate: "2026-10-13",
        summary: "Missed workout",
      }),
    ).toBe("Missed workout · Tue 13 Oct");
    expect(
      reviewSheetCardTitle({
        type: "missed_workout",
        localDate: "2026-10-15",
      }),
    ).toBe("Missed workout · Thu 15 Oct");
  });

  it("builds the body paragraph from source name + planned clock", () => {
    expect(
      reviewSheetCardBody({
        type: "missed_workout",
        sourceName: "Lower body A",
        plannedClock: "7:00 pm",
      }),
    ).toBe("Lower body A was planned for 7:00 pm and wasn't logged.");
    expect(
      reviewSheetCardBody({
        type: "missed_workout",
        sourceName: "Upper body B",
        plannedClock: "7:00 pm",
      }),
    ).toBe("Upper body B was planned for 7:00 pm and wasn't logged.");
  });

  it("formats Planned / Logged / Reminder grid values", () => {
    expect(
      reviewSheetPlannedLine({
        exerciseCount: 5,
        setCount: 16,
        durationMinutes: 50,
      }),
    ).toBe("5 exercises · 16 sets · about 50 min");
    expect(
      reviewSheetPlannedLine({ exerciseCount: 6, setCount: 18 }),
    ).toBe("6 exercises · 18 sets");
    expect(reviewSheetLoggedLine({ type: "missed_workout" })).toBe(
      "Nothing logged",
    );
    expect(
      reviewSheetReminderLine({
        sentAt: "2026-10-13T14:45:00.000Z",
        opened: false,
        timeZone: "Asia/Kolkata",
      }),
    ).toBe("Sent 8:15 pm · not opened");
    expect(
      reviewSheetReminderLine({
        sentAt: "2026-10-15T14:45:00.000Z",
        opened: true,
        timeZone: "Asia/Kolkata",
      }),
    ).toBe("Sent 8:15 pm · opened");
  });

  it("derives coaching week from relationship start", () => {
    const start = "2026-09-07T00:00:00.000Z";
    const now = Date.parse("2026-10-18T12:00:00.000Z");
    expect(coachingWeekNumber(start, now)).toBe(6);
  });

  it("assembles the card model from exception + workout assignment", () => {
    const workout = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      coachingRelationshipId: "44444444-4444-4444-8444-444444444444",
      planId: "11111111-1111-4111-8111-111111111111",
      planVersionId: "22222222-2222-4222-8222-222222222222",
      workoutDayId: "33333333-3333-4333-8333-333333333333",
      workoutDayName: "Lower body A",
      localDate: "2026-10-13",
      windowStartsAt: "2026-10-13T13:30:00.000Z",
      windowEndsAt: "2026-10-13T18:29:59.000Z",
      status: "missed",
      scheduleStatus: "scheduled",
      workoutDay: {
        id: "33333333-3333-4333-8333-333333333333",
        order: 1,
        name: "Lower body A",
        required: true,
        exercises: [
          {
            id: "e1",
            order: 1,
            name: "Squat",
            instructions: null,
            primaryMuscles: [],
            secondaryMuscles: [],
            equipment: [],
            difficulty: null,
            setTargets: [
              { id: "s1", order: 1, reps: 8, loadLabel: "60 kg", rpe: null },
              { id: "s2", order: 2, reps: 8, loadLabel: "60 kg", rpe: null },
            ],
          },
          {
            id: "e2",
            order: 2,
            name: "RDL",
            instructions: null,
            primaryMuscles: [],
            secondaryMuscles: [],
            equipment: [],
            difficulty: null,
            setTargets: [
              { id: "s3", order: 1, reps: 10, loadLabel: "40 kg", rpe: null },
            ],
          },
        ],
      },
      execution: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    } as WorkoutAssignment;

    const model = buildReviewSheetCardModel({
      detail: detail({
        type: "missed_workout",
        summary: "Missed workout",
        details: { localDate: "2026-10-13" },
      }),
      ageMinutes: 5 * 24 * 60,
      workout,
      durationMinutes: 50,
      reminder: {
        sentAt: "2026-10-13T14:45:00.000Z",
        opened: false,
      },
      timeZone: "Asia/Kolkata",
    });

    expect(model.title).toBe("Missed workout · Tue 13 Oct");
    expect(model.body).toBe(
      "Lower body A was planned for 7:00 pm and wasn't logged.",
    );
    expect(model.planned).toBe("2 exercises · 3 sets · about 50 min");
    expect(model.logged).toBe("Nothing logged");
    expect(model.reminder).toBe("Sent 8:15 pm · not opened");
  });
});
