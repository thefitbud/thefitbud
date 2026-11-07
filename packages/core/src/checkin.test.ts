import { describe, expect, it } from "vitest";
import {
  submitCheckinRequestSchema,
  type CheckinFieldDefinition,
} from "@fitbud/contracts";
import {
  GLOBAL_CHECKIN_FORM_FIELDS,
  canRecordCheckinReview,
  canSaveCheckinDraft,
  canSubmitCheckin,
  checkinAnswerEntries,
  daysForCheckinCadence,
  deriveCheckinStatus,
  linkedMeasurementsForCheckin,
  missingRequiredCheckinAnswers,
  nextCheckinLocalDate,
  parseCheckinFormFields,
} from "./checkin.js";

describe("checkin core", () => {
  it("maps cadence to day intervals", () => {
    expect(daysForCheckinCadence("weekly")).toBe(7);
    expect(daysForCheckinCadence("biweekly")).toBe(14);
    expect(daysForCheckinCadence("monthly")).toBe(28);
  });

  it("advances local date by cadence", () => {
    expect(
      nextCheckinLocalDate({ fromLocalDate: "2026-09-26", cadence: "weekly" }),
    ).toBe("2026-10-03");
  });

  it("derives scheduled / due / overdue / submitted / reviewed", () => {
    const window = {
      windowStartsAt: "2026-09-26T00:00:00.000Z",
      windowEndsAt: "2026-09-28T00:00:00.000Z",
    };
    expect(
      deriveCheckinStatus({
        ...window,
        nowIso: "2026-09-25T12:00:00.000Z",
        recordStatus: "draft",
        hasReview: false,
      }),
    ).toBe("scheduled");
    expect(
      deriveCheckinStatus({
        ...window,
        nowIso: "2026-09-26T12:00:00.000Z",
        recordStatus: "draft",
        hasReview: false,
      }),
    ).toBe("due");
    expect(
      deriveCheckinStatus({
        ...window,
        nowIso: "2026-09-29T00:00:00.001Z",
        recordStatus: "draft",
        hasReview: false,
      }),
    ).toBe("overdue");
    expect(
      deriveCheckinStatus({
        ...window,
        nowIso: "2026-09-29T00:00:00.001Z",
        recordStatus: "submitted",
        hasReview: false,
      }),
    ).toBe("submitted");
    expect(
      deriveCheckinStatus({
        ...window,
        nowIso: "2026-09-29T00:00:00.001Z",
        recordStatus: "submitted",
        hasReview: true,
      }),
    ).toBe("reviewed");
  });

  it("gates draft / submit / review transitions", () => {
    expect(canSaveCheckinDraft({ recordStatus: "draft" })).toBe(true);
    expect(canSaveCheckinDraft({ recordStatus: "submitted" })).toBe(false);
    expect(
      canSubmitCheckin({
        recordStatus: "draft",
        nowIso: "2026-09-26T00:00:00.000Z",
        windowStartsAt: "2026-09-26T00:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      canSubmitCheckin({
        recordStatus: "draft",
        nowIso: "2026-09-25T23:59:59.000Z",
        windowStartsAt: "2026-09-26T00:00:00.000Z",
      }),
    ).toBe(false);
    expect(
      canRecordCheckinReview({ recordStatus: "submitted", hasReview: false }),
    ).toBe(true);
    expect(
      canRecordCheckinReview({ recordStatus: "submitted", hasReview: true }),
    ).toBe(false);
  });

  it("requires wellbeing for submission answers", () => {
    expect(missingRequiredCheckinAnswers(null)).toEqual(["wellbeing"]);
    expect(missingRequiredCheckinAnswers({ wellbeing: "  " })).toEqual([
      "wellbeing",
    ]);
    expect(missingRequiredCheckinAnswers({ wellbeing: "Good week" })).toEqual(
      [],
    );
  });

  it("keeps the seeded form's body-weight answer and links one measurement", () => {
    expect(parseCheckinFormFields(GLOBAL_CHECKIN_FORM_FIELDS).ok).toBe(true);
    const bodyWeight = GLOBAL_CHECKIN_FORM_FIELDS.find(
      (field) => field.id === "body_weight",
    );
    expect(bodyWeight).toMatchObject({
      type: "measurement",
      measurementType: "body_weight_kg",
    });
    expect(
      missingRequiredCheckinAnswers(
        { wellbeing: "Good week" },
        GLOBAL_CHECKIN_FORM_FIELDS,
      ),
    ).toEqual([]);
    expect(
      linkedMeasurementsForCheckin({
        fields: GLOBAL_CHECKIN_FORM_FIELDS,
        answers: { wellbeing: "Good week", bodyWeightKg: 72.5 },
      }),
    ).toEqual([{ type: "body_weight_kg", value: 72.5, unit: "kg" }]);
    expect(
      linkedMeasurementsForCheckin({
        fields: [
          ...GLOBAL_CHECKIN_FORM_FIELDS,
          {
            id: "waist",
            label: "Waist",
            type: "measurement",
            measurementType: "waist_cm",
            required: false,
          },
        ],
        answers: {
          wellbeing: "Good week",
          bodyWeightKg: 72.5,
          fieldAnswers: { waist: 81 },
        },
      }),
    ).toEqual([
      { type: "body_weight_kg", value: 72.5, unit: "kg" },
      { type: "waist_cm", value: 81, unit: "cm" },
    ]);
  });
});

/** v2 standard questions (D-W6-17): all optional, no `wellbeing` question. */
const v2 = (
  id: string,
  label: string,
  type: CheckinFieldDefinition["type"],
  extra: Record<string, unknown> = {},
) => ({ id, key: id, label, type, required: false, ...extra }) as CheckinFieldDefinition;
const V2_FIELDS: CheckinFieldDefinition[] = [
  v2("weight", "Weight", "measurement", { measurementType: "body_weight_kg" }),
  v2("waist", "Waist", "measurement", { measurementType: "waist_cm" }),
  v2("arm", "Arm", "measurement", { measurementType: "other", unit: "cm" }),
  v2("thigh", "Thigh", "measurement", { measurementType: "other", unit: "cm" }),
  v2("photo_front", "Front", "photo_intent", { photoSlot: "front" }),
  v2("energy", "Energy", "scale_1_5"),
  v2("stress", "Stress", "scale_1_5"),
  v2("notes", "Notes", "long_text"),
];

describe("form-scoped required answers (Z6-2b)", () => {
  it("submit contract accepts answers without wellbeing but rejects a blank one", () => {
    expect(
      submitCheckinRequestSchema.safeParse({
        expectedVersion: 0,
        answers: { fieldAnswers: { arm: 32 } },
      }).success,
    ).toBe(true);
    expect(
      submitCheckinRequestSchema.safeParse({
        expectedVersion: 0,
        answers: { wellbeing: "   ", fieldAnswers: { arm: 32 } },
      }).success,
    ).toBe(false);
  });

  it("requires nothing on a v2-shaped form and wellbeing on v1", () => {
    expect(
      missingRequiredCheckinAnswers({ fieldAnswers: {} }, V2_FIELDS),
    ).toEqual([]);
    expect(
      missingRequiredCheckinAnswers({}, GLOBAL_CHECKIN_FORM_FIELDS),
    ).toEqual(["wellbeing"]);
    // No pinned form: the fallback keeps requiring wellbeing.
    expect(
      missingRequiredCheckinAnswers({ fieldAnswers: { arm: 32 } }),
    ).toEqual(["wellbeing"]);
  });
});

describe("linkedMeasurementsForCheckin (Z6-2b)", () => {
  it("keeps arm and thigh as two `other` rows in cm", () => {
    expect(
      linkedMeasurementsForCheckin({
        fields: V2_FIELDS,
        answers: { fieldAnswers: { arm: 32, thigh: 55, waist: 82 } },
      }),
    ).toEqual([
      { type: "waist_cm", value: 82, unit: "cm" },
      { type: "other", value: 32, unit: "cm" },
      { type: "other", value: 55, unit: "cm" },
    ]);
  });

  it("falls back to the type's default unit when the question has none", () => {
    expect(
      linkedMeasurementsForCheckin({
        fields: [
          {
            id: "grip",
            label: "Grip strength",
            type: "measurement",
            measurementType: "other",
            required: false,
          },
        ],
        answers: { fieldAnswers: { grip: 40 } },
      }),
    ).toEqual([{ type: "other", value: 40, unit: "unit" }]);
  });

  it("does not double weight from the question and legacy bodyWeightKg", () => {
    expect(
      linkedMeasurementsForCheckin({
        fields: V2_FIELDS,
        answers: { bodyWeightKg: 74.2, fieldAnswers: { weight: 74 } },
      }),
    ).toEqual([{ type: "body_weight_kg", value: 74, unit: "kg" }]);
    // Legacy weight alone fills one weight question, not every one.
    expect(
      linkedMeasurementsForCheckin({
        fields: [
          ...V2_FIELDS,
          v2("weight_evening", "Evening weight", "measurement", {
            measurementType: "body_weight_kg",
          }),
        ],
        answers: { bodyWeightKg: 74.2 },
      }),
    ).toEqual([{ type: "body_weight_kg", value: 74.2, unit: "kg" }]);
    // No weight question at all: legacy still links one row.
    expect(
      linkedMeasurementsForCheckin({
        fields: [v2("energy", "Energy", "scale_1_5")],
        answers: { bodyWeightKg: 74.2 },
      }),
    ).toEqual([{ type: "body_weight_kg", value: 74.2, unit: "kg" }]);
  });

  it("skips zero and non-numeric measurement answers", () => {
    expect(
      linkedMeasurementsForCheckin({
        fields: V2_FIELDS,
        answers: { fieldAnswers: { arm: 0, thigh: "55" } },
      }),
    ).toEqual([]);
  });
});

describe("checkinAnswerEntries (Z6-2b)", () => {
  it("returns answered questions in form order with keys and units, skipping blanks", () => {
    expect(
      checkinAnswerEntries(V2_FIELDS, {
        fieldAnswers: {
          notes: "Knee felt fine",
          thigh: 55,
          energy: 4,
          arm: 32,
          photo_front: "media-file-1",
          waist: "",
        },
      }),
    ).toEqual([
      { fieldId: "arm", key: "arm", label: "Arm", type: "measurement", unit: "cm", value: 32 },
      { fieldId: "thigh", key: "thigh", label: "Thigh", type: "measurement", unit: "cm", value: 55 },
      {
        fieldId: "photo_front",
        key: "photo_front",
        label: "Front",
        type: "photo_intent",
        unit: null,
        value: "media-file-1",
      },
      { fieldId: "energy", key: "energy", label: "Energy", type: "scale_1_5", unit: null, value: 4 },
      {
        fieldId: "notes",
        key: "notes",
        label: "Notes",
        type: "long_text",
        unit: null,
        value: "Knee felt fine",
      },
    ]);
  });

  it("reads v1 legacy answers only for the v1 fields they belong to", () => {
    expect(
      checkinAnswerEntries(GLOBAL_CHECKIN_FORM_FIELDS, {
        wellbeing: "Good week",
        notes: "  ",
        bodyWeightKg: 72.5,
        fieldAnswers: { waist: 81 },
      }),
    ).toEqual([
      {
        fieldId: "body_weight",
        key: null,
        label: "Body weight",
        type: "measurement",
        unit: "kg",
        value: 72.5,
      },
      { fieldId: "waist", key: null, label: "Waist", type: "measurement", unit: "cm", value: 81 },
      {
        fieldId: "wellbeing",
        key: null,
        label: "Wellbeing",
        type: "short_text",
        unit: null,
        value: "Good week",
      },
    ]);
  });

  it("never adds an entry the form does not have", () => {
    // A stored "OK" wellbeing from old mobile code and an unknown keyed answer on a v2 form.
    const entries = checkinAnswerEntries(V2_FIELDS, {
      wellbeing: "OK",
      fieldAnswers: { mood: "fine", arm: 32 },
    });
    expect(entries.map((entry) => entry.fieldId)).toEqual(["arm"]);
    expect(checkinAnswerEntries(V2_FIELDS, null)).toEqual([]);
  });
});
