import type {
  OnboardingFieldDefinition,
  OnboardingFieldType,
} from "@fitbud/contracts";
import { parseOnboardingFormFields } from "@fitbud/core";

/** Types a new version may store. Legacy text, textarea, and select stay on old versions. */
export const BUILDER_FIELD_TYPES = [
  "short_text",
  "long_text",
  "single_choice",
  "multiple_choice",
  "number",
  "yes_no",
] as const;

export type BuilderFieldType = (typeof BUILDER_FIELD_TYPES)[number];

export type FieldOptionDraft = {
  id: string;
  label: string;
};

export type FieldDraft = {
  id: string;
  type: BuilderFieldType;
  label: string;
  required: boolean;
  helpText: string;
  maxLength: string;
  options: FieldOptionDraft[];
};

export function fieldTypeLabel(type: OnboardingFieldType): string {
  switch (type) {
    case "text":
      return "Text";
    case "textarea":
      return "Text area";
    case "select":
      return "Select";
    case "short_text":
      return "Short text";
    case "long_text":
      return "Long text";
    case "single_choice":
      return "Single choice";
    case "multiple_choice":
      return "Multiple choice";
    case "number":
      return "Number";
    case "yes_no":
      return "Yes / no";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export function isChoiceType(
  type: BuilderFieldType,
): type is "single_choice" | "multiple_choice" {
  return type === "single_choice" || type === "multiple_choice";
}

export function isTextType(type: BuilderFieldType): type is "short_text" | "long_text" {
  return type === "short_text" || type === "long_text";
}

function newOption(): FieldOptionDraft {
  return { id: crypto.randomUUID(), label: "" };
}

export function blankField(): FieldDraft {
  return {
    id: crypto.randomUUID(),
    type: "short_text",
    label: "",
    required: false,
    helpText: "",
    maxLength: "",
    options: [newOption()],
  };
}

function builderType(type: OnboardingFieldType): BuilderFieldType {
  switch (type) {
    case "text":
    case "short_text":
      return "short_text";
    case "textarea":
    case "long_text":
      return "long_text";
    case "select":
    case "single_choice":
      return "single_choice";
    case "multiple_choice":
      return "multiple_choice";
    case "number":
      return "number";
    case "yes_no":
      return "yes_no";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function optionDrafts(field: OnboardingFieldDefinition): FieldOptionDraft[] {
  if (field.type === "select") {
    return field.options.map((option) => ({ id: option, label: option }));
  }
  if (field.type === "single_choice" || field.type === "multiple_choice") {
    return field.options.map((option) => ({ id: option.id, label: option.label }));
  }
  return [newOption()];
}

export function draftsFromFields(fields: OnboardingFieldDefinition[]): FieldDraft[] {
  return fields.map((field) => {
    const type = builderType(field.type);
    const maxLength =
      field.type === "text" ||
      field.type === "textarea" ||
      field.type === "short_text" ||
      field.type === "long_text"
        ? field.maxLength != null
          ? String(field.maxLength)
          : ""
        : "";
    return {
      id: field.id,
      type,
      label: field.label,
      required: field.required,
      helpText: field.helpText ?? "",
      maxLength,
      options: optionDrafts(field),
    };
  });
}

export function withFieldType(field: FieldDraft, type: BuilderFieldType): FieldDraft {
  if (field.type === type) return field;
  const keepOptions = isChoiceType(field.type) && isChoiceType(type);
  return {
    ...field,
    type,
    maxLength: isTextType(type) ? field.maxLength : "",
    options: isChoiceType(type)
      ? keepOptions && field.options.length > 0
        ? field.options
        : [newOption()]
      : field.options,
  };
}

/** A duplicate is a new question: new field id and new option ids, same labels. */
export function duplicateFieldDraft(field: FieldDraft): FieldDraft {
  return {
    ...field,
    id: crypto.randomUUID(),
    options: field.options.map((option) => ({
      id: crypto.randomUUID(),
      label: option.label,
    })),
  };
}

export function buildFields(
  drafts: FieldDraft[],
): { ok: true; fields: OnboardingFieldDefinition[] } | { ok: false; error: string } {
  if (drafts.length === 0) {
    return { ok: false, error: "Add at least one field." };
  }
  const fields: OnboardingFieldDefinition[] = [];
  for (const draft of drafts) {
    const label = draft.label.trim();
    if (!label) return { ok: false, error: "Each field needs a label." };
    const helpText = draft.helpText.trim();
    const base = {
      id: draft.id,
      label,
      required: draft.required,
      ...(helpText ? { helpText } : {}),
    };
    if (isChoiceType(draft.type)) {
      const options = draft.options
        .map((option) => ({ id: option.id, label: option.label.trim() }))
        .filter((option) => option.label.length > 0);
      if (options.length === 0) {
        return { ok: false, error: `“${label}” needs at least one option.` };
      }
      if (new Set(options.map((option) => option.id)).size !== options.length) {
        return { ok: false, error: `“${label}” has duplicate option ids.` };
      }
      fields.push(
        draft.type === "multiple_choice"
          ? { ...base, type: "multiple_choice", options }
          : { ...base, type: "single_choice", options },
      );
      continue;
    }
    if (draft.type === "number" || draft.type === "yes_no") {
      fields.push({ ...base, type: draft.type });
      continue;
    }
    const rawMax = draft.maxLength.trim();
    if (rawMax === "") {
      fields.push({ ...base, type: draft.type });
      continue;
    }
    const maxLength = Number(rawMax);
    if (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 10000) {
      return {
        ok: false,
        error: `Max length for “${label}” must be a whole number from 1 to 10000.`,
      };
    }
    fields.push({ ...base, type: draft.type, maxLength });
  }
  const parsed = parseOnboardingFormFields(fields);
  if (!parsed.ok) {
    return { ok: false, error: "This form definition is not valid." };
  }
  return { ok: true, fields: parsed.fields };
}

function canonicalField(field: OnboardingFieldDefinition) {
  const type = builderType(field.type);
  const base = {
    id: field.id,
    type,
    label: field.label,
    required: field.required,
    helpText: field.helpText ?? null,
  };
  if (type === "single_choice" || type === "multiple_choice") {
    const options =
      field.type === "select"
        ? field.options.map((option) => ({ id: option, label: option }))
        : field.type === "single_choice" || field.type === "multiple_choice"
          ? field.options.map((option) => ({ id: option.id, label: option.label }))
          : [];
    return { ...base, options };
  }
  if (type === "short_text" || type === "long_text") {
    const maxLength =
      field.type === "text" ||
      field.type === "textarea" ||
      field.type === "short_text" ||
      field.type === "long_text"
        ? (field.maxLength ?? null)
        : null;
    return { ...base, maxLength };
  }
  return base;
}

export function canonicalFields(fields: OnboardingFieldDefinition[]): string {
  return JSON.stringify(fields.map((field) => canonicalField(field)));
}

/** True when the draft would append a version identical to the latest stored fields. */
export function fieldsMatchLatest(
  drafts: FieldDraft[],
  latest: OnboardingFieldDefinition[] | null,
): boolean {
  if (!latest) return false;
  const built = buildFields(drafts);
  if (!built.ok) return false;
  return canonicalFields(built.fields) === canonicalFields(latest);
}
