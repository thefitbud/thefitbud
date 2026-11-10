import type {
  CheckinFieldDefinition,
  CheckinStandardKey,
  MeasurementType,
} from "@fitbud/contracts";
import {
  GLOBAL_CHECKIN_FORM_V2_FIELDS,
  labelFor,
} from "@fitbud/core";

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
  /**
   * Standard question key (D-W6-17). Kept through draft, edit and save so a
   * keyed v2 form keeps its Progress charts (D-W8-6). Null for the trainer's
   * own questions, which are never charted.
   */
  key: CheckinStandardKey | null;
  /** Text length cap carried over from the loaded field; null when it had none. */
  maxLength: number | null;
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
    key: null,
    maxLength: null,
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
    base.key = field.key ?? null;
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
    if (field.type === "short_text" || field.type === "long_text") {
      base.maxLength = field.maxLength ?? null;
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
    // A copy is the trainer's own question: each key appears once per form.
    key: null,
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

// ---------------------------------------------------------------------------
// Standard questions (D-W6-17, D-W8-6)
// ---------------------------------------------------------------------------

/** The fixed definition of a standard key: id, wording and type (global v2). */
export function standardCheckinDefinition(
  key: CheckinStandardKey,
): CheckinFieldDefinition {
  const found = GLOBAL_CHECKIN_FORM_V2_FIELDS.find((field) => field.key === key);
  if (!found) throw new Error("Unknown standard check-in key.");
  return found;
}

/** A fresh draft for a standard key, with its fixed wording. */
export function standardCheckinDraft(key: CheckinStandardKey): CheckinFieldDraft {
  const [draft] = draftsFromCheckinFields([standardCheckinDefinition(key)]);
  return draft!;
}

function buildStandardField(
  key: CheckinStandardKey,
  draft: CheckinFieldDraft,
  helpText: string,
): CheckinFieldDefinition {
  // Wording, id and type always come from the key: the trainer can change
  // only whether it is required and the tip shown to the client.
  const standard = standardCheckinDefinition(key);
  const field: CheckinFieldDefinition = {
    ...standard,
    key,
    required: draft.required,
  };
  delete field.helpText;
  if (helpText) field.helpText = helpText;
  if (field.type === "scale_1_5") {
    field.lowLabel = draft.lowLabel.trim() || "Very low";
    field.highLabel = draft.highLabel.trim() || "Very high";
  }
  return field;
}

export type StandardCheckinGroupId =
  | "weight"
  | "body"
  | "photos"
  | "energy"
  | "sleep_quality"
  | "stress"
  | "hunger"
  | "notes";

export type StandardCheckinGroup = {
  id: StandardCheckinGroupId;
  title: string;
  /** Keys in the order clients see them. */
  keys: readonly CheckinStandardKey[];
  /** Shown in Progress (charts or photo compare). Notes are not. */
  charted: boolean;
  /** Short type line, e.g. "rating 1 to 5". */
  kind: string;
};

export const STANDARD_CHECKIN_GROUPS: readonly StandardCheckinGroup[] = [
  { id: "weight", title: "Body weight", keys: ["weight"], charted: true, kind: "number, kg" },
  {
    id: "body",
    title: "Body measurements",
    keys: ["waist", "hips", "chest", "arm", "thigh"],
    charted: true,
    kind: "cm",
  },
  {
    id: "photos",
    title: "Progress photos",
    keys: ["photo_front", "photo_side", "photo_back"],
    charted: true,
    kind: "photos",
  },
  { id: "energy", title: "Energy", keys: ["energy"], charted: true, kind: "rating 1 to 5" },
  {
    id: "sleep_quality",
    title: "Sleep quality",
    keys: ["sleep_quality"],
    charted: true,
    kind: "rating 1 to 5",
  },
  { id: "stress", title: "Stress", keys: ["stress"], charted: true, kind: "rating 1 to 5" },
  { id: "hunger", title: "Hunger", keys: ["hunger"], charted: true, kind: "rating 1 to 5" },
  { id: "notes", title: "Notes", keys: ["notes"], charted: false, kind: "long text" },
];

/** Picker copy for keys in a multi-key group (frame 171b). */
export const STANDARD_KEY_PICKER_COPY: Partial<
  Record<CheckinStandardKey, { label: string; hint: string }>
> = {
  waist: { label: "Waist", hint: "At the navel" },
  hips: { label: "Hip", hint: "Widest part of the hips" },
  chest: { label: "Chest", hint: "Across the nipple line" },
  arm: { label: "Arm", hint: "Mid upper arm, relaxed" },
  thigh: { label: "Thigh", hint: "Widest part, standing" },
  photo_front: { label: "Front", hint: "" },
  photo_side: { label: "Side", hint: "" },
  photo_back: { label: "Back", hint: "" },
};

export function standardGroupFor(key: CheckinStandardKey): StandardCheckinGroup {
  return STANDARD_CHECKIN_GROUPS.find((group) => group.keys.includes(key))!;
}

function standardGroupById(id: StandardCheckinGroupId): StandardCheckinGroup {
  return STANDARD_CHECKIN_GROUPS.find((group) => group.id === id)!;
}

export type CheckinDraftSections = {
  standard: Array<{ group: StandardCheckinGroup; drafts: CheckinFieldDraft[] }>;
  custom: CheckinFieldDraft[];
};

/**
 * Splits drafts into standard groups (in the order a group first appears,
 * keys inside a group in their fixed order) and the trainer's own questions.
 */
export function checkinDraftSections(
  drafts: CheckinFieldDraft[],
): CheckinDraftSections {
  const standard: CheckinDraftSections["standard"] = [];
  const custom: CheckinFieldDraft[] = [];
  for (const draft of drafts) {
    if (!draft.key) {
      custom.push(draft);
      continue;
    }
    const group = standardGroupFor(draft.key);
    let entry = standard.find((row) => row.group.id === group.id);
    if (!entry) {
      entry = { group, drafts: [] };
      standard.push(entry);
    }
    entry.drafts.push(draft);
  }
  for (const entry of standard) {
    entry.drafts.sort(
      (a, b) => entry.group.keys.indexOf(a.key!) - entry.group.keys.indexOf(b.key!),
    );
  }
  return { standard, custom };
}

function flattenSections(sections: CheckinDraftSections): CheckinFieldDraft[] {
  return [...sections.standard.flatMap((entry) => entry.drafts), ...sections.custom];
}

/** Saved order: standard questions first, then the trainer's own questions. */
export function normalizeCheckinDraftOrder(
  drafts: CheckinFieldDraft[],
): CheckinFieldDraft[] {
  return flattenSections(checkinDraftSections(drafts));
}

/** Standard groups the form does not ask yet. */
export function missingStandardGroups(
  drafts: CheckinFieldDraft[],
): StandardCheckinGroup[] {
  const present = new Set(
    drafts.flatMap((draft) => (draft.key ? [standardGroupFor(draft.key).id] : [])),
  );
  return STANDARD_CHECKIN_GROUPS.filter((group) => !present.has(group.id));
}

/**
 * Sets which keys of a standard group the form asks. Keeps drafts already in
 * the form (with their required flag and tip), adds missing keys with fixed
 * wording, and removes the rest. An empty list removes the group. An own
 * question that happens to use a standard key's id gets a new id, because a
 * keyed question's id must equal its key.
 */
export function setStandardGroupKeys(
  drafts: CheckinFieldDraft[],
  groupId: StandardCheckinGroupId,
  keys: readonly CheckinStandardKey[],
): CheckinFieldDraft[] {
  const group = standardGroupById(groupId);
  const wanted = group.keys.filter((key) => keys.includes(key));
  const existing = drafts.filter(
    (draft) => draft.key && group.keys.includes(draft.key),
  );
  const template = existing[0];
  const added = wanted
    .filter((key) => !existing.some((draft) => draft.key === key))
    .map((key) => {
      const draft = standardCheckinDraft(key);
      if (template) {
        draft.required = template.required;
        draft.helpText = template.helpText;
      }
      return draft;
    });
  const takenIds = new Set(added.map((draft) => draft.id));
  const kept: CheckinFieldDraft[] = [];
  let placed = false;
  for (const draft of drafts) {
    if (draft.key && group.keys.includes(draft.key)) {
      if (!placed) {
        kept.push(...added);
        placed = true;
      }
      if (wanted.includes(draft.key)) kept.push(draft);
      continue;
    }
    if (!draft.key && takenIds.has(draft.id)) {
      kept.push({ ...draft, id: crypto.randomUUID() });
      continue;
    }
    kept.push(draft);
  }
  if (!placed && added.length > 0) {
    // New group: after the last standard question, before own questions.
    const firstCustom = kept.findIndex((draft) => !draft.key);
    kept.splice(firstCustom === -1 ? kept.length : firstCustom, 0, ...added);
  }
  return normalizeCheckinDraftOrder(kept);
}

/** Changes required / tip on every key of a standard group. */
export function updateStandardGroup(
  drafts: CheckinFieldDraft[],
  groupId: StandardCheckinGroupId,
  patch: Partial<Pick<CheckinFieldDraft, "required" | "helpText">>,
): CheckinFieldDraft[] {
  const group = standardGroupById(groupId);
  return drafts.map((draft) =>
    draft.key && group.keys.includes(draft.key) ? { ...draft, ...patch } : draft,
  );
}

/** Moves a standard group up or down among the standard questions. */
export function moveStandardGroup(
  drafts: CheckinFieldDraft[],
  groupId: StandardCheckinGroupId,
  delta: number,
): CheckinFieldDraft[] {
  const sections = checkinDraftSections(drafts);
  const index = sections.standard.findIndex((entry) => entry.group.id === groupId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= sections.standard.length) return drafts;
  const next = [...sections.standard];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return flattenSections({ ...sections, standard: next });
}

/** Moves one of the trainer's own questions up or down among own questions. */
export function moveCustomDraft(
  drafts: CheckinFieldDraft[],
  draftId: string,
  delta: number,
): CheckinFieldDraft[] {
  const sections = checkinDraftSections(drafts);
  const index = sections.custom.findIndex((draft) => draft.id === draftId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= sections.custom.length) return drafts;
  const next = [...sections.custom];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return flattenSections({ ...sections, custom: next });
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
  const seenKeys = new Set<CheckinStandardKey>();
  for (const draft of drafts) {
    const helpText = draft.helpText.trim();
    if (draft.key) {
      if (seenKeys.has(draft.key)) {
        return { ok: false, error: "Each standard question can appear once." };
      }
      seenKeys.add(draft.key);
      fields.push(buildStandardField(draft.key, draft, helpText));
      continue;
    }
    const label = draft.label.trim();
    if (!label) return { ok: false, error: "Each field needs a label." };
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
    if (draft.type === "short_text" || draft.type === "long_text") {
      fields.push({
        ...base,
        type: draft.type,
        ...(draft.maxLength ? { maxLength: draft.maxLength } : {}),
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
