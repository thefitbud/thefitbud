import { describe, expect, it } from "vitest";
import { checkinFormDefinitionSchema } from "@fitbud/contracts";
import { GLOBAL_CHECKIN_FORM_FIELDS } from "@fitbud/core";
import { checkinReviewRows } from "./checkinReviewRows";

const V2 = checkinFormDefinitionSchema.parse({
  fields: [
    { id: "weight", key: "weight", label: "Weight", type: "measurement", measurementType: "body_weight_kg", required: false },
    { id: "waist", key: "waist", label: "Waist", type: "measurement", measurementType: "waist_cm", required: false },
    { id: "arm", key: "arm", label: "Arm", type: "measurement", measurementType: "other", unit: "cm", required: false },
    { id: "photo_front", key: "photo_front", label: "Front", type: "photo_intent", photoSlot: "front", required: false },
    { id: "energy", key: "energy", label: "Energy", type: "scale_1_5", required: false },
    { id: "sleep", key: "sleep_quality", label: "Sleep quality", type: "scale_1_5", required: false },
    { id: "stress", key: "stress", label: "Stress", type: "scale_1_5", required: false },
    { id: "hunger", key: "hunger", label: "Hunger", type: "scale_1_5", required: false },
    { id: "notes", key: "notes", label: "Notes", type: "long_text", required: false },
    { id: "custom-1", label: "Any aches or pains?", type: "short_text", required: false },
  ],
}).fields;

const stored = [
  { type: "body_weight_kg", value: "86.4", unit: "kg", observedAt: "2026-10-16T05:00:00.000Z" },
  { type: "body_weight_kg", value: "86.9", unit: "kg", observedAt: "2026-10-09T05:00:00.000Z" },
  { type: "waist_cm", value: "94", unit: "cm", observedAt: "2026-10-16T05:00:00.000Z" },
  { type: "waist_cm", value: "95", unit: "cm", observedAt: "2026-10-09T05:00:00.000Z" },
];

describe("checkinReviewRows", () => {
  it("v2: ratings, texts and measures follow the pinned form, skipping blanks", () => {
    const rows = checkinReviewRows({
      fields: V2,
      answers: {
        fieldAnswers: {
          "custom-1": "Left knee",
          stress: 4,
          weight: 86.4,
          energy: 3,
          arm: 31.5,
          waist: 94,
          photo_front: "noted",
          notes: "Good week",
        },
      },
      measurements: stored,
    });
    expect(rows.ratings.map((r) => [r.label, r.value])).toEqual([
      ["Energy", 3],
      ["Stress", 4],
    ]);
    expect(rows.texts.map((r) => [r.label, r.text])).toEqual([
      ["Notes", "Good week"],
      ["Any aches or pains?", "Left knee"],
    ]);
    expect(rows.measures.map((m) => [m.label, m.value, m.unit])).toEqual([
      ["Weight", 86.4, "kg"],
      ["Waist", 94, "cm"],
      ["Arm", 31.5, "cm"],
    ]);
  });

  it("weight and waist keep their since line; other measures have none", () => {
    const rows = checkinReviewRows({
      fields: V2,
      answers: { fieldAnswers: { weight: 86.4, waist: 94, arm: 31.5 } },
      measurements: stored,
    });
    const [weight, waist, arm] = rows.measures;
    expect(weight!.since).toEqual({ delta: -0.5, previousObservedAt: "2026-10-09T05:00:00.000Z" });
    expect(waist!.since).toEqual({ delta: -1, previousObservedAt: "2026-10-09T05:00:00.000Z" });
    expect(arm!.since).toBeNull();
  });

  it("no since line when the newest stored weight is not this answer", () => {
    const rows = checkinReviewRows({
      fields: V2,
      answers: { fieldAnswers: { weight: 80 } },
      measurements: stored,
    });
    expect(rows.measures[0]!.since).toBeNull();
  });

  it("no wellbeing line for a form without that question, and no fixed question list", () => {
    const rows = checkinReviewRows({
      fields: V2,
      answers: { wellbeing: "OK", fieldAnswers: { energy: 2 } },
      measurements: [],
    });
    expect(rows.texts).toEqual([]);
    expect(rows.ratings).toHaveLength(1);
  });

  it("v1: wellbeing shows under its own label, legacy weight fills the weight question", () => {
    const rows = checkinReviewRows({
      fields: GLOBAL_CHECKIN_FORM_FIELDS,
      answers: { wellbeing: "Slept badly", bodyWeightKg: 85, notes: null },
      measurements: [],
    });
    expect(rows.texts).toEqual([
      { fieldId: "wellbeing", label: "Wellbeing", text: "Slept badly" },
    ]);
    expect(rows.measures.map((m) => [m.label, m.value, m.unit])).toEqual([
      ["Body weight", 85, "kg"],
    ]);
    expect(rows.ratings).toEqual([]);
  });

  it("an unsubmitted check-in has no rows", () => {
    expect(
      checkinReviewRows({ fields: V2, answers: null, measurements: stored }),
    ).toEqual({ ratings: [], measures: [], texts: [] });
  });
});
