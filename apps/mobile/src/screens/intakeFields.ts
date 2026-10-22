import type { OnboardingFieldDefinition } from "@fitbud/contracts";

export type IntakeChoice = {
  id: string;
  label: string;
};

export type IntakeControl =
  | { kind: "short_text"; maxLength?: number }
  | { kind: "long_text"; maxLength?: number }
  | { kind: "single_choice"; options: IntakeChoice[] }
  | { kind: "multiple_choice"; options: IntakeChoice[] }
  | { kind: "number" }
  | { kind: "yes_no" };

/** Control the pinned field should render. Legacy types map onto the same controls. */
export function intakeControlForField(field: OnboardingFieldDefinition): IntakeControl {
  switch (field.type) {
    case "text":
    case "short_text":
      return { kind: "short_text", maxLength: field.maxLength };
    case "textarea":
    case "long_text":
      return { kind: "long_text", maxLength: field.maxLength };
    case "select":
      return {
        kind: "single_choice",
        options: field.options.map((option) => ({ id: option, label: option })),
      };
    case "single_choice":
      return { kind: "single_choice", options: field.options };
    case "multiple_choice":
      return { kind: "multiple_choice", options: field.options };
    case "number":
      return { kind: "number" };
    case "yes_no":
      return { kind: "yes_no" };
    default: {
      const _exhaustive: never = field;
      return _exhaustive;
    }
  }
}

export function toggleSelectedOption(
  selected: readonly string[],
  optionId: string,
): string[] {
  return selected.includes(optionId)
    ? selected.filter((id) => id !== optionId)
    : [...selected, optionId];
}

/** Accept a plain decimal. Incomplete input such as "-" is not an answer yet. */
export function parseNumberAnswer(text: string): number | undefined {
  const trimmed = text.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}
