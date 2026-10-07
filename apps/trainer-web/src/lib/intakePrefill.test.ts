import { describe, expect, it } from "vitest";
import type { IntakeDefinition } from "@fitbud/contracts";
import {
  coachingPrefillFromIntake,
  intakeFieldPreview,
} from "./intakePrefill";

const definition: IntakeDefinition = {
  id: "11111111-1111-4111-8111-111111111111",
  key: "mvp",
  version: 1,
  scope: "global",
  createdAt: "2026-09-26T00:00:00.000Z",
  fields: [
    { id: "goals", type: "textarea", label: "Goals", required: true },
    { id: "schedule", type: "textarea", label: "Schedule", required: true },
    {
      id: "preferences",
      type: "textarea",
      label: "Preferences",
      required: false,
    },
  ],
};

describe("coachingPrefillFromIntake", () => {
  it("maps goals to primary goal and supporting answers to notes", () => {
    expect(
      coachingPrefillFromIntake({
        goals: " Lose fat ",
        schedule: "Evenings",
        preferences: "Vegetarian",
        relevant_history: "",
      }),
    ).toEqual({
      primaryGoal: "Lose fat",
      notes: "Schedule:\nEvenings\n\nPreferences:\nVegetarian",
    });
  });

  it("returns empty strings when intake has no useful answers", () => {
    expect(coachingPrefillFromIntake({})).toEqual({
      primaryGoal: "",
      notes: "",
    });
  });
});

describe("intakeFieldPreview", () => {
  it("lists the current onboarding form fields", () => {
    expect(intakeFieldPreview(definition)).toEqual([
      { id: "goals", label: "Goals", required: true },
      { id: "schedule", label: "Schedule", required: true },
      { id: "preferences", label: "Preferences", required: false },
    ]);
  });
});
