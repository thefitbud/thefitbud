import type { OnboardingAnswers, OnboardingFormVersion } from "@fitbud/contracts";

export function coachingPrefillFromIntake(answers: OnboardingAnswers): {
  goalDescription: string;
  notes: string;
} {
  const goalDescription = answers.goals?.trim() ?? "";
  const sections: Array<[string, string | undefined]> = [
    ["Schedule", answers.schedule],
    ["Preferences", answers.preferences],
    ["Relevant history", answers.relevant_history],
    ["Limitations", answers.limitations],
  ];
  const notes = sections
    .filter(([, value]) => value?.trim())
    .map(([label, value]) => `${label}:\n${value?.trim() ?? ""}`)
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
