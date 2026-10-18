import { describe, expect, it } from "vitest";
import {
  adherenceStateSchema,
  checkinStatusSchema,
  coachingRelationshipStatusSchema,
  exceptionSeveritySchema,
  exceptionTypeSchema,
  historyItemKindSchema,
  mealAssignmentStatusSchema,
  mealDeviationKindSchema,
  onboardingStatusSchema,
  workoutAssignmentStatusSchema,
} from "@fitbud/contracts";
import { allLabelEntries, enumLabel, labelFor } from "./labels.js";

describe("labels", () => {
  it("covers every value of core contract enums", () => {
    const schemas: Array<{ name: string; values: readonly string[] }> = [
      { name: "adherence_state", values: adherenceStateSchema.options },
      { name: "onboarding_status", values: onboardingStatusSchema.options },
      {
        name: "relationship_status",
        values: coachingRelationshipStatusSchema.options,
      },
      { name: "exception_type", values: exceptionTypeSchema.options },
      { name: "exception_severity", values: exceptionSeveritySchema.options },
      { name: "checkin_status", values: checkinStatusSchema.options },
      {
        name: "meal_assignment_status",
        values: mealAssignmentStatusSchema.options,
      },
      { name: "meal_deviation_kind", values: mealDeviationKindSchema.options },
      {
        name: "workout_assignment_status",
        values: workoutAssignmentStatusSchema.options,
      },
      { name: "history_kind", values: historyItemKindSchema.options },
    ];

    for (const { name, values } of schemas) {
      for (const value of values) {
        const label = labelFor(name as Parameters<typeof labelFor>[0], value);
        expect(label, `${name}.${value}`).toBeTruthy();
        expect(label).not.toMatch(/_/);
        expect(label[0]).toBe(label[0]?.toUpperCase());
      }
    }
  });

  it("maps snake_case topics and body parts", () => {
    expect(labelFor("coach_ask_topic", "portion_size")).toBe("Portion size");
    expect(labelFor("body_part", "upper_back")).toBe("Upper back");
    expect(enumLabel("overdue_meal")).toBe("Overdue meal");
  });

  it("falls back to sentence case for unknown values", () => {
    expect(labelFor("exception_type", "brand_new_thing")).toBe("Brand new thing");
  });

  it("exposes a non-empty catalogue", () => {
    expect(allLabelEntries().length).toBeGreaterThan(80);
  });
});
