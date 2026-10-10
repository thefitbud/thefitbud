import { describe, expect, it } from "vitest";
import type { OnboardingFieldDefinition } from "@fitbud/contracts";
import {
  intakeControlForField,
  parseNumberAnswer,
  toggleSelectedOption,
} from "./intakeFields";

const fields: OnboardingFieldDefinition[] = [
  { id: "goal", type: "short_text", label: "Goal", required: true, maxLength: 80 },
  { id: "history", type: "long_text", label: "History", required: false },
  { id: "notes", type: "text", label: "Notes", required: false },
  { id: "background", type: "textarea", label: "Background", required: false },
  {
    id: "experience",
    type: "select",
    label: "Experience",
    required: true,
    options: ["New", "Returning"],
  },
  {
    id: "focus",
    type: "single_choice",
    label: "Focus",
    required: true,
    options: [
      { id: "strength", label: "Strength" },
      { id: "endurance", label: "Endurance" },
    ],
  },
  {
    id: "equipment",
    type: "multiple_choice",
    label: "Equipment",
    required: false,
    options: [
      { id: "dumbbells", label: "Dumbbells" },
      { id: "bands", label: "Bands" },
    ],
  },
  { id: "sessions", type: "number", label: "Sessions", required: true },
  { id: "injuries", type: "yes_no", label: "Injuries", required: true },
];

describe("intake field controls", () => {
  it("maps each pinned field type to its own control", () => {
    expect(fields.map((field) => intakeControlForField(field).kind)).toEqual([
      "short_text",
      "long_text",
      "short_text",
      "long_text",
      "single_choice",
      "single_choice",
      "multiple_choice",
      "number",
      "yes_no",
    ]);
    const legacy = intakeControlForField(fields[4]!);
    expect(legacy).toEqual({
      kind: "single_choice",
      options: [
        { id: "New", label: "New" },
        { id: "Returning", label: "Returning" },
      ],
    });
    const choice = intakeControlForField(fields[5]!);
    expect(choice.kind).toBe("single_choice");
    if (choice.kind !== "single_choice") return;
    expect(choice.options[0]).toEqual({ id: "strength", label: "Strength" });
  });

  it("toggles option ids and parses finite numbers", () => {
    expect(toggleSelectedOption(["dumbbells"], "bands")).toEqual(["dumbbells", "bands"]);
    expect(toggleSelectedOption(["dumbbells", "bands"], "bands")).toEqual(["dumbbells"]);
    expect(parseNumberAnswer("4")).toBe(4);
    expect(parseNumberAnswer("0")).toBe(0);
    expect(parseNumberAnswer("1.5")).toBe(1.5);
    expect(parseNumberAnswer("")).toBeUndefined();
    expect(parseNumberAnswer("4 sessions")).toBeUndefined();
  });
});
