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
  missingStandardGroups,
  moveCustomDraft,
  moveStandardGroup,
  normalizeCheckinDraftOrder,
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
      expect(saved).toEqual(
        // The builder fills scale end labels; everything else is unchanged.
        saved.type === "scale_1_5"
          ? { ...original, lowLabel: "Very low", highLabel: "Very high" }
          : original,
      );
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

  it("re-ids an own question that already uses a standard id (v1 fork)", () => {
    // v1 forks carry unkeyed questions with ids like "waist".
    let drafts = draftsFromCheckinFields([
      { id: "waist", label: "Waist", type: "measurement", measurementType: "waist_cm", required: false },
      { id: "wellbeing", label: "Wellbeing", type: "short_text", required: true, maxLength: 1000 },
    ]);
    drafts = setStandardGroupKeys(drafts, "body", ["waist"]);
    const fields = build(drafts);
    expect(fields.filter((field) => field.id === "waist")).toHaveLength(1);
    expect(fields.find((field) => field.id === "waist")?.key).toBe("waist");
    expect(fields.find((field) => field.key !== "waist" && field.label === "Waist")).toBeDefined();
    // maxLength on own text questions survives the round trip.
    expect(fields.find((field) => field.id === "wellbeing")).toMatchObject({ maxLength: 1000 });
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
