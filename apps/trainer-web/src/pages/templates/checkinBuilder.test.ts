import { describe, expect, it } from "vitest";
import {
  CHECKIN_STANDARD_KEYS,
  checkinFormDefinitionSchema,
  type CheckinFieldDefinition,
} from "@fitbud/contracts";
import {
  findCheckinFormKeyProblem,
  GLOBAL_CHECKIN_FORM_V2_FIELDS,
} from "@fitbud/core";
import {
  blankCheckinField,
  buildCheckinFields,
  checkinDraftSections,
  draftsFromCheckinFields,
  duplicateCheckinFieldDraft,
  measurementTypeOptions,
  missingStandardGroups,
  moveCustomDraft,
  moveStandardGroup,
  normalizeCheckinDraftOrder,
  ownQuestionFeedsChart,
  setStandardGroupKeys,
  updateStandardGroup,
} from "./checkinBuilder";

/** A trainer's fork of the global v2 form plus two of their own questions. */
function keyedV2Fork(): CheckinFieldDefinition[] {
  return [
    ...GLOBAL_CHECKIN_FORM_V2_FIELDS.map((field) => ({ ...field })),
    {
      id: "went-well",
      label: "What went well this week?",
      type: "long_text",
      required: false,
    },
    {
      id: "hurting",
      label: "Anything hurting?",
      type: "yes_no",
      required: true,
    },
  ] as CheckinFieldDefinition[];
}

function build(drafts: ReturnType<typeof draftsFromCheckinFields>) {
  const built = buildCheckinFields(drafts);
  if (!built.ok) throw new Error(built.error);
  // Whatever the builder saves must pass the API's own checks.
  expect(checkinFormDefinitionSchema.safeParse({ fields: built.fields }).success).toBe(
    true,
  );
  expect(findCheckinFormKeyProblem(built.fields)).toBeNull();
  return built.fields;
}

function keysOf(fields: CheckinFieldDefinition[]) {
  return fields.flatMap((field) => (field.key ? [field.key] : []));
}

describe("checkin builder", () => {
  it("builds measurement, photo, and scale blocks", () => {
    const built = buildCheckinFields([
      {
        ...blankCheckinField("measurement"),
        label: "Body weight",
        measurementType: "body_weight_kg",
        required: true,
      },
      {
        ...blankCheckinField("photo_intent"),
        label: "Front photo",
        photoSlot: "front",
      },
      {
        ...blankCheckinField("scale_1_5"),
        label: "Energy",
        lowLabel: "Very low",
        highLabel: "Very high",
      },
      {
        ...blankCheckinField("short_text"),
        label: "What went well?",
      },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.fields.map((field) => field.type)).toEqual([
      "measurement",
      "photo_intent",
      "scale_1_5",
      "short_text",
    ]);
    // Own questions stay unkeyed.
    expect(keysOf(built.fields)).toEqual([]);
  });

  it("round-trips drafts", () => {
    const built = buildCheckinFields([
      {
        ...blankCheckinField("single_choice"),
        label: "Focus",
        options: [
          { id: "a", label: "Strength" },
          { id: "b", label: "Endurance" },
        ],
      },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const drafts = draftsFromCheckinFields(built.fields);
    expect(drafts[0]?.type).toBe("single_choice");
    expect(drafts[0]?.options).toHaveLength(2);
  });
});

describe("standard key preservation (D-W8-6)", () => {
  it("load → save keeps all 14 standard keys with their ids and types", () => {
    const loaded = keyedV2Fork();
    const fields = build(draftsFromCheckinFields(loaded));
    expect(keysOf(fields)).toEqual([...CHECKIN_STANDARD_KEYS]);
    for (const key of CHECKIN_STANDARD_KEYS) {
      const saved = fields.find((field) => field.key === key)!;
      const original = loaded.find((field) => field.key === key)!;
      // Unchanged questions save exactly as loaded (no default scale labels).
      expect(saved).toEqual(original);
    }
    // Own questions stay unkeyed with their ids.
    expect(fields.find((field) => field.id === "went-well")?.key).toBeUndefined();
    expect(fields.find((field) => field.id === "hurting")?.key).toBeUndefined();
  });

  it("load → edit (required, tip, reorder, new own question, rename own) → save keeps the keys", () => {
    let drafts = normalizeCheckinDraftOrder(draftsFromCheckinFields(keyedV2Fork()));
    drafts = updateStandardGroup(drafts, "weight", {
      required: true,
      helpText: "Weigh after waking",
    });
    drafts = updateStandardGroup(drafts, "body", { helpText: "Tape snug, not tight" });
    drafts = moveStandardGroup(drafts, "energy", -1);
    drafts = moveCustomDraft(drafts, "hurting", -1);
    drafts = drafts.map((draft) =>
      draft.id === "went-well" ? { ...draft, label: "Best moment this week?" } : draft,
    );
    drafts = [...drafts, { ...blankCheckinField("long_text"), label: "What was hard?" }];

    const fields = build(drafts);
    expect(new Set(keysOf(fields))).toEqual(new Set(CHECKIN_STANDARD_KEYS));
    expect(keysOf(fields)).toHaveLength(14);
    const weight = fields.find((field) => field.key === "weight")!;
    expect(weight).toMatchObject({
      id: "weight",
      label: "Body weight",
      required: true,
      helpText: "Weigh after waking",
    });
    for (const key of ["waist", "hips", "chest", "arm", "thigh"] as const) {
      expect(fields.find((field) => field.key === key)?.helpText).toBe(
        "Tape snug, not tight",
      );
    }
    // Energy moved above progress photos; own questions after all standard ones.
    const ids = fields.map((field) => field.id);
    expect(ids.indexOf("energy")).toBeLessThan(ids.indexOf("photo_front"));
    expect(ids.slice(-3)).toEqual([
      "hurting",
      "went-well",
      expect.any(String),
    ]);
    expect(fields.at(-1)).toMatchObject({ label: "What was hard?" });
    expect(fields.at(-1)?.key).toBeUndefined();
    expect(fields.find((field) => field.id === "went-well")?.label).toBe(
      "Best moment this week?",
    );
  });

  it("standard wording is fixed: an edited label on a keyed draft saves the standard label", () => {
    const drafts = draftsFromCheckinFields(keyedV2Fork()).map((draft) =>
      draft.key === "stress" ? { ...draft, label: "How stressed?" } : draft,
    );
    const fields = build(drafts);
    expect(fields.find((field) => field.key === "stress")?.label).toBe("Stress");
  });

  it("save → load → save is stable", () => {
    const first = build(draftsFromCheckinFields(keyedV2Fork()));
    const second = build(draftsFromCheckinFields(first));
    expect(second).toEqual(first);
  });

  it("a duplicated standard question becomes an own, unkeyed question", () => {
    const [weight] = draftsFromCheckinFields(keyedV2Fork());
    const copy = duplicateCheckinFieldDraft(weight!);
    expect(copy.key).toBeNull();
    expect(copy.id).not.toBe("weight");
  });

  it("refuses to save the same key twice", () => {
    const drafts = draftsFromCheckinFields(keyedV2Fork());
    const result = buildCheckinFields([...drafts, { ...drafts[0]!, id: "x" }]);
    expect(result.ok).toBe(false);
  });
});

describe("measurement picker (frame 171b)", () => {
  it("picking body measurements adds and removes keyed questions and keeps the others", () => {
    let drafts = normalizeCheckinDraftOrder(draftsFromCheckinFields(keyedV2Fork()));
    drafts = updateStandardGroup(drafts, "body", { required: true, helpText: "Morning" });
    drafts = setStandardGroupKeys(drafts, "body", ["waist", "hips", "chest", "arm"]);
    let fields = build(drafts);
    expect(keysOf(fields)).not.toContain("thigh");
    expect(keysOf(fields)).toHaveLength(13);

    drafts = setStandardGroupKeys(drafts, "body", ["waist", "thigh"]);
    fields = build(drafts);
    const body = fields.filter((field) =>
      ["waist", "hips", "chest", "arm", "thigh"].includes(field.key ?? ""),
    );
    expect(body.map((field) => field.key)).toEqual(["waist", "thigh"]);
    // A re-added key takes the group's required flag and tip.
    expect(body[1]).toMatchObject({
      id: "thigh",
      type: "measurement",
      measurementType: "other",
      unit: "cm",
      required: true,
      helpText: "Morning",
    });
  });

  it("adding a missing standard group puts it before own questions", () => {
    const loaded = keyedV2Fork().filter(
      (field) => !field.key || !["energy", "photo_front", "photo_side", "photo_back"].includes(field.key),
    );
    let drafts = normalizeCheckinDraftOrder(draftsFromCheckinFields(loaded));
    expect(missingStandardGroups(drafts).map((group) => group.id)).toEqual([
      "photos",
      "energy",
    ]);
    drafts = setStandardGroupKeys(drafts, "energy", ["energy"]);
    const fields = build(drafts);
    const ids = fields.map((field) => field.id);
    expect(ids.indexOf("energy")).toBeLessThan(ids.indexOf("went-well"));
    expect(missingStandardGroups(drafts).map((group) => group.id)).toEqual(["photos"]);
  });

  it("an empty pick removes the group", () => {
    let drafts = draftsFromCheckinFields(keyedV2Fork());
    drafts = setStandardGroupKeys(drafts, "photos", []);
    expect(keysOf(build(drafts))).not.toContain("photo_front");
    expect(missingStandardGroups(drafts).map((group) => group.id)).toEqual(["photos"]);
  });

  it("turns a v1 fork's own waist / weight / photo questions into the standard ones", () => {
    // v1 forks carry unkeyed questions with ids like "waist" and "body_weight".
    let drafts = draftsFromCheckinFields([
      { id: "body_weight", label: "Body weight", type: "measurement", measurementType: "body_weight_kg", required: true },
      { id: "waist", label: "Waist", type: "measurement", measurementType: "waist_cm", required: true, helpText: "At the navel" },
      { id: "photo_front", label: "Front", type: "photo_intent", photoSlot: "front", required: false },
      { id: "wellbeing", label: "Wellbeing", type: "short_text", required: true, maxLength: 1000 },
    ]);
    drafts = setStandardGroupKeys(drafts, "weight", ["weight"]);
    drafts = setStandardGroupKeys(drafts, "body", ["waist", "hips"]);
    drafts = setStandardGroupKeys(drafts, "photos", ["photo_front"]);
    const fields = build(drafts);
    // Each quantity is asked once: no duplicate body_weight_kg / waist_cm rows.
    const measurementTypes = fields.flatMap((field) =>
      field.type === "measurement" ? [field.measurementType] : [],
    );
    expect(measurementTypes.filter((type) => type === "body_weight_kg")).toHaveLength(1);
    expect(measurementTypes.filter((type) => type === "waist_cm")).toHaveLength(1);
    expect(fields.filter((field) => field.type === "photo_intent")).toHaveLength(1);
    // Converted questions keep required and tip, and are keyed.
    expect(fields.find((field) => field.key === "weight")).toMatchObject({ id: "weight", required: true });
    expect(fields.find((field) => field.key === "waist")).toMatchObject({
      id: "waist",
      required: true,
      helpText: "At the navel",
    });
    expect(fields.find((field) => field.id === "body_weight")).toBeUndefined();
    // No two questions share a label (the builder's "Another question uses this label").
    const labels = fields.map((field) => field.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
    // maxLength on own text questions survives the round trip.
    expect(fields.find((field) => field.id === "wellbeing")).toMatchObject({ maxLength: 1000 });
  });

  it("re-ids an own question with a standard id that asks something else", () => {
    let drafts = draftsFromCheckinFields([
      { id: "waist", label: "Waist feel", type: "short_text", required: false },
    ]);
    drafts = setStandardGroupKeys(drafts, "body", ["waist"]);
    const fields = build(drafts);
    expect(fields.find((field) => field.id === "waist")?.key).toBe("waist");
    expect(fields.find((field) => field.label === "Waist feel")?.id).not.toBe("waist");
  });

  it("own measurement questions default to and offer only Other (not a charted type)", () => {
    expect(blankCheckinField("measurement").measurementType).toBe("other");
    expect(measurementTypeOptions().map((option) => option.value)).toEqual(["other"]);
    // A loaded v1 own question keeps its type selectable so it is not changed silently.
    expect(measurementTypeOptions("waist_cm").map((option) => option.value)).toEqual([
      "waist_cm",
      "other",
    ]);
  });

  it("only own measurements of a charted type count as feeding a chart", () => {
    const [weight, armOther, text] = draftsFromCheckinFields([
      { id: "body_weight", label: "Body weight", type: "measurement", measurementType: "body_weight_kg", required: false },
      { id: "neck", label: "Neck", type: "measurement", measurementType: "other", unit: "cm", required: false },
      { id: "hard", label: "What was hard?", type: "long_text", required: false },
    ]);
    expect(ownQuestionFeedsChart(weight!)).toBe(true);
    expect(ownQuestionFeedsChart(armOther!)).toBe(false);
    expect(ownQuestionFeedsChart(text!)).toBe(false);
  });

  it("keeps stored scale end labels on a standard rating and adds none", () => {
    const fields = build(
      draftsFromCheckinFields([
        { key: "energy", id: "energy", label: "Energy", type: "scale_1_5", required: false, lowLabel: "Flat", highLabel: "Buzzing" },
        { key: "stress", id: "stress", label: "Stress", type: "scale_1_5", required: false },
      ]),
    );
    expect(fields[0]).toMatchObject({ lowLabel: "Flat", highLabel: "Buzzing" });
    expect(fields[1]).not.toHaveProperty("lowLabel");
    expect(fields[1]).not.toHaveProperty("highLabel");
  });

  it("groups drafts into standard rows and own questions", () => {
    const sections = checkinDraftSections(draftsFromCheckinFields(keyedV2Fork()));
    expect(sections.standard.map((entry) => entry.group.id)).toEqual([
      "weight",
      "body",
      "photos",
      "energy",
      "sleep_quality",
      "stress",
      "hunger",
      "notes",
    ]);
    expect(sections.custom.map((draft) => draft.id)).toEqual(["went-well", "hurting"]);
  });
});
