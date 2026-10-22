import type { OnboardingAnswers, OnboardingFormVersion } from "@fitbud/contracts";

function textAnswer(answers: OnboardingAnswers, id: string): string {
  const value = answers[id];
  return typeof value === "string" ? value : "";
}

export function coachingPrefillFromIntake(answers: OnboardingAnswers): {
  goalDescription: string;
  notes: string;
} {
  const goalDescription = textAnswer(answers, "goals").trim();
  const sections: Array<[string, string]> = [
    ["Schedule", textAnswer(answers, "schedule")],
    ["Preferences", textAnswer(answers, "preferences")],
    ["Relevant history", textAnswer(answers, "relevant_history")],
    ["Limitations", textAnswer(answers, "limitations")],
  ];
  const notes = sections
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}:\n${value.trim()}`)
    .join("\n\n");
  return { goalDescription, notes };
}

export function intakeFieldPreview(
  definition: OnboardingFormVersion | null,
): Array<{ id: string; label: string; required: boolean }> {
  if (!definition) return [];
  return definition.fields.map((field) => ({
    id: field.id,
    label: field.label,
    required: field.required,
  }));
}
