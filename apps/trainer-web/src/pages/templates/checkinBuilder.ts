import type {
  CheckinFieldDefinition,
  MeasurementType,
} from "@fitbud/contracts";
import { labelFor } from "@fitbud/core";

export const CHECKIN_FIELD_TYPES = [
  "short_text",
  "long_text",
  "single_choice",
  "multiple_choice",
  "number",
  "yes_no",
  "measurement",
  "photo_intent",
  "scale_1_5",
] as const;

export type CheckinBuilderFieldType = (typeof CHECKIN_FIELD_TYPES)[number];

export type CheckinOptionDraft = { id: string; label: string };

export type CheckinFieldDraft = {
  id: string;
  type: CheckinBuilderFieldType;
  label: string;
  required: boolean;
  helpText: string;
  options: CheckinOptionDraft[];
  measurementType: MeasurementType;
  unit: string;
  photoSlot: "front" | "side" | "back" | "any";
  lowLabel: string;
  highLabel: string;
};

export function checkinFieldTypeLabel(type: CheckinBuilderFieldType): string {
  switch (type) {
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
    case "measurement":
      return "Measurement";
    case "photo_intent":
      return "Progress photos";
    case "scale_1_5":
      return "Scale 1–5";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function newOption(): CheckinOptionDraft {
  return { id: crypto.randomUUID(), label: "" };
}

export function blankCheckinField(
  type: CheckinBuilderFieldType = "short_text",
): CheckinFieldDraft {
  return {
    id: crypto.randomUUID(),
    type,
    label: "",
    required: false,
    helpText: "",
    options: [newOption(), newOption()],
    measurementType: "body_weight_kg",
    unit: "",
    photoSlot: "any",
    lowLabel: "Very low",
    highLabel: "Very high",
  };
}

export function draftsFromCheckinFields(
  fields: CheckinFieldDefinition[],
): CheckinFieldDraft[] {
  return fields.map((field) => {
    const base = blankCheckinField(
      (CHECKIN_FIELD_TYPES as readonly string[]).includes(field.type)
        ? (field.type as CheckinBuilderFieldType)
        : "short_text",
    );
    base.id = field.id;
    base.label = field.label;
    base.required = field.required;
    base.helpText = field.helpText ?? "";
    if (field.type === "single_choice" || field.type === "multiple_choice") {
      base.options = field.options.map((option) => ({ ...option }));
    }
    if (field.type === "measurement") {
      base.measurementType = field.measurementType;
      base.unit = field.unit ?? "";
    }
    if (field.type === "photo_intent") {
      base.photoSlot = field.photoSlot ?? "any";
    }
    if (field.type === "scale_1_5") {
      base.lowLabel = field.lowLabel ?? "Very low";
      base.highLabel = field.highLabel ?? "Very high";
    }
    if (field.type === "number") {
      base.unit = field.unit ?? "";
    }
    return base;
  });
}

export function duplicateCheckinFieldDraft(
  field: CheckinFieldDraft,
): CheckinFieldDraft {
  return {
    ...field,
    id: crypto.randomUUID(),
    options: field.options.map((option) => ({
      id: crypto.randomUUID(),
      label: option.label,
    })),
  };
}

export function measurementTypeOptions(): Array<{
  value: MeasurementType;
  label: string;
}> {
  return (
    ["body_weight_kg", "waist_cm", "hip_cm", "chest_cm", "other"] as const
  ).map((value) => ({
    value,
    label: labelFor("measurement_type", value),
  }));
}

export function buildCheckinFields(
  drafts: CheckinFieldDraft[],
):
  | { ok: true; fields: CheckinFieldDefinition[] }
  | { ok: false; error: string } {
  if (drafts.length === 0) {
    return { ok: false, error: "Add at least one field." };
  }
  const fields: CheckinFieldDefinition[] = [];
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
    if (
      draft.type === "single_choice" ||
      draft.type === "multiple_choice"
    ) {
      const options = draft.options
        .map((option) => ({ id: option.id, label: option.label.trim() }))
        .filter((option) => option.label.length > 0);
      if (options.length < 2) {
        return { ok: false, error: `“${label}” needs at least 2 options.` };
      }
      fields.push({ ...base, type: draft.type, options });
      continue;
    }
    if (draft.type === "measurement") {
      const unit = draft.unit.trim();
      fields.push({
        ...base,
        type: "measurement",
        measurementType: draft.measurementType,
        ...(unit ? { unit } : {}),
      });
      continue;
    }
    if (draft.type === "photo_intent") {
      fields.push({
        ...base,
        type: "photo_intent",
        photoSlot: draft.photoSlot,
      });
      continue;
    }
    if (draft.type === "scale_1_5") {
      fields.push({
        ...base,
        type: "scale_1_5",
        lowLabel: draft.lowLabel.trim() || "Very low",
        highLabel: draft.highLabel.trim() || "Very high",
      });
      continue;
    }
    if (draft.type === "number") {
      const unit = draft.unit.trim();
      fields.push({
        ...base,
        type: "number",
        ...(unit ? { unit } : {}),
      });
      continue;
    }
    if (draft.type === "yes_no") {
      fields.push({ ...base, type: "yes_no" });
      continue;
    }
    fields.push({ ...base, type: draft.type });
  }
  return { ok: true, fields };
}
