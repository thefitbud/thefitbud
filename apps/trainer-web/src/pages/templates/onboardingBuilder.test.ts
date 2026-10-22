import { describe, expect, it } from "vitest";
import type { OnboardingFieldDefinition } from "@fitbud/contracts";
import {
  blankField,
  buildFields,
  draftsFromFields,
  duplicateFieldDraft,
  fieldsMatchLatest,
  withFieldType,
} from "./onboardingBuilder";

const legacyFields: OnboardingFieldDefinition[] = [
  { id: "goals", type: "textarea", label: "Goals", required: true, maxLength: 2000 },
  {
    id: "experience",
    type: "select",
    label: "Experience",
    required: true,
    options: ["New", "Returning"],
  },
];

describe("onboarding builder", () => {
  it("saves new versions with typed fields and stable option ids", () => {
    const created = buildFields([
      {
        ...blankField(),
        id: "goal",
        type: "short_text",
        label: "Goal",
        required: true,
        maxLength: "80",
      },
      {
        ...blankField(),
        id: "focus",
        type: "single_choice",
        label: "Focus",
        required: true,
        options: [
          { id: "strength", label: "Strength" },
          { id: "endurance", label: " Endurance " },
        ],
      },
      {
        ...blankField(),
        id: "sessions",
        type: "number",
        label: "Sessions",
        required: true,
      },
      {
        ...blankField(),
        id: "injuries",
        type: "yes_no",
        label: "Injuries",
        required: false,
      },
    ]);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.fields.map((field) => field.type)).toEqual([
      "short_text",
      "single_choice",
      "number",
      "yes_no",
    ]);
    const focus = created.fields[1];
    expect(focus?.type).toBe("single_choice");
    if (focus?.type !== "single_choice") return;
    expect(focus.options).toEqual([
      { id: "strength", label: "Strength" },
      { id: "endurance", label: "Endurance" },
    ]);
  });

  it("treats a legacy version as unchanged until the trainer edits it", () => {
    const drafts = draftsFromFields(legacyFields);
    expect(fieldsMatchLatest(drafts, legacyFields)).toBe(true);
    const built = buildFields(drafts);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.fields.map((field) => field.type)).toEqual(["long_text", "single_choice"]);
    const experience = built.fields[1];
    if (experience?.type !== "single_choice") return;
    expect(experience.options).toEqual([
      { id: "New", label: "New" },
      { id: "Returning", label: "Returning" },
    ]);
    const edited = drafts.map((field) =>
      field.id === "goals" ? { ...field, label: "Main goal" } : field,
    );
    expect(fieldsMatchLatest(edited, legacyFields)).toBe(false);
  });

  it("duplicates a question with a new id and new option ids", () => {
    const original = draftsFromFields(legacyFields)[1]!;
    const copy = duplicateFieldDraft(original);
    expect(copy.id).not.toBe(original.id);
    expect(copy.label).toBe(original.label);
    expect(copy.options.map((option) => option.label)).toEqual(
      original.options.map((option) => option.label),
    );
    expect(copy.options.map((option) => option.id)).not.toEqual(
      original.options.map((option) => option.id),
    );
    const changed = withFieldType(original, "multiple_choice");
    expect(changed.type).toBe("multiple_choice");
    expect(changed.options.map((option) => option.id)).toEqual(
      original.options.map((option) => option.id),
    );
  });
});
