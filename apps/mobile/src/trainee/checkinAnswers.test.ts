import { describe, expect, it } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import { checkinFormDefinitionSchema } from "@fitbud/contracts";
import { GLOBAL_CHECKIN_FORM_FIELDS } from "@fitbud/core";
import {
  answersToPayload,
  checkinFormLoadFailure,
  draftBody,
  lastWeightHint,
  submitBody,
  valuesFromStoredAnswers,
} from "./checkinAnswers";

/** v2-shaped form: keyed standard questions plus one custom question. */
const V2 = checkinFormDefinitionSchema.parse({
  fields: [
    { id: "weight", key: "weight", label: "Weight", type: "measurement", measurementType: "body_weight_kg", required: false },
    { id: "waist", key: "waist", label: "Waist", type: "measurement", measurementType: "waist_cm", required: false },
    { id: "thigh", key: "thigh", label: "Thigh", type: "measurement", measurementType: "other", unit: "cm", required: false },
    { id: "photo_front", key: "photo_front", label: "Front", type: "photo_intent", photoSlot: "front", required: false },
    { id: "energy", key: "energy", label: "Energy", type: "scale_1_5", required: false },
    { id: "stress", key: "stress", label: "Stress", type: "scale_1_5", required: false },
    { id: "notes", key: "notes", label: "Notes", type: "long_text", required: false },
    { id: "custom-1", label: "How are you feeling about training?", type: "short_text", required: false },
  ],
}).fields;

const V1 = GLOBAL_CHECKIN_FORM_FIELDS;

describe("answersToPayload", () => {
  it("v2: only answered questions are sent, and never wellbeing", () => {
    const payload = answersToPayload(V2, { weight: "86.4", energy: "4" });
    expect(payload).toEqual({ fieldAnswers: { weight: 86.4, energy: 4 } });
    expect(payload).not.toHaveProperty("wellbeing");
    expect(payload).not.toHaveProperty("notes");
    expect(payload).not.toHaveProperty("bodyWeightKg");
  });

  it("a label containing 'feeling' no longer maps to wellbeing", () => {
    const payload = answersToPayload(V2, { "custom-1": "Strong" });
    expect(payload).toEqual({ fieldAnswers: { "custom-1": "Strong" } });
    expect(payload.wellbeing).toBeUndefined();
  });

  it("v1: the typed wellbeing is sent, with legacy notes and weight only when answered", () => {
    const payload = answersToPayload(V1, {
      wellbeing: "Tired but fine",
      body_weight: "85",
    });
    expect(payload.wellbeing).toBe("Tired but fine");
    expect(payload.bodyWeightKg).toBe(85);
    expect(payload).not.toHaveProperty("notes");
    expect(payload.fieldAnswers).toEqual({
      body_weight: 85,
      wellbeing: "Tired but fine",
    });
  });

  it("v1: a blank wellbeing is not sent (the server answers CHECKIN_ANSWERS_INCOMPLETE)", () => {
    const payload = answersToPayload(V1, { wellbeing: "   ", notes: "" });
    expect(payload).toEqual({});
  });

  it("never produces OK or null for unanswered questions", () => {
    for (const values of [{}, { wellbeing: "" }, { weight: "" }] as Array<Record<string, string>>) {
      for (const fields of [V1, V2]) {
        const json = JSON.stringify(answersToPayload(fields, values));
        expect(json).not.toContain("OK");
        expect(json).not.toContain("null");
      }
    }
  });

  it("drops non-numeric and non-positive measurements and unknown yes/no values", () => {
    const payload = answersToPayload(V2, { weight: "0", waist: "abc", energy: "x" });
    expect(payload).toEqual({});
  });

  it("an untouched prefilled last weight is not sent; a confirmed one is", () => {
    // The screen keeps the last weight out of `values`; only a stepper press or
    // a confirmation writes it there.
    expect(answersToPayload(V2, {})).toEqual({});
    expect(answersToPayload(V2, { weight: "86.4" })).toEqual({
      fieldAnswers: { weight: 86.4 },
    });
  });

  it("photo intent keeps today's behaviour: 'noted' is sent as the answer", () => {
    expect(answersToPayload(V2, { photo_front: "noted" })).toEqual({
      fieldAnswers: { photo_front: "noted" },
    });
  });
});

describe("every send path uses the same real answers", () => {
  const values = { weight: "86.4", energy: "4" };
  const expected = { fieldAnswers: { weight: 86.4, energy: 4 } };

  it("draft save and its conflict retry", () => {
    expect(draftBody(3, V2, values)).toEqual({ expectedVersion: 3, answers: expected });
    expect(draftBody(4, V2, values)).toEqual({ expectedVersion: 4, answers: expected });
  });

  it("submit, its conflict retry and the queued submit", () => {
    expect(submitBody(3, V2, values)).toEqual({ expectedVersion: 3, answers: expected });
    expect(submitBody(5, V2, values)).toEqual({ expectedVersion: 5, answers: expected });
    for (const body of [draftBody(1, V2, {}), submitBody(1, V2, {})]) {
      expect(body.answers).toEqual({});
      expect(JSON.stringify(body)).not.toMatch(/OK|null/);
    }
  });
});

describe("valuesFromStoredAnswers", () => {
  it("restores a saved draft in screen form and skips unanswered questions", () => {
    expect(
      valuesFromStoredAnswers(V2, {
        fieldAnswers: { weight: 86.4, energy: 3, photo_front: "noted" },
      }),
    ).toEqual({ weight: "86.4", energy: "3", photo_front: "noted" });
  });

  it("restores v1 legacy answers for the fields they belong to", () => {
    expect(
      valuesFromStoredAnswers(V1, { wellbeing: "Fine", bodyWeightKg: 85 }),
    ).toEqual({ wellbeing: "Fine", body_weight: "85" });
  });
});

describe("lastWeightHint", () => {
  it("is the newest stored body weight", () => {
    expect(
      lastWeightHint([
        { type: "body_weight_kg", value: 86.9, observedAt: "2026-10-02T05:00:00.000Z" },
        { type: "waist_cm", value: 99, observedAt: "2026-10-12T05:00:00.000Z" },
        { type: "body_weight_kg", value: 86.4, observedAt: "2026-10-09T05:00:00.000Z" },
      ]),
    ).toEqual({ value: 86.4, observedAt: "2026-10-09T05:00:00.000Z" });
    expect(lastWeightHint([])).toBeNull();
  });
});

describe("checkinFormLoadFailure", () => {
  it("shows only an ApiClientError message verbatim", () => {
    const api = new ApiClientError({
      code: "CHECKIN_NOT_FOUND",
      message: "Check-in not found.",
      requestId: "r1",
      status: 404,
    });
    expect(checkinFormLoadFailure(api).message).toBe("Check-in not found.");
  });

  it("never shows another error's message, and gives a code instead", () => {
    const zod = Object.assign(new Error("[{\"path\":[\"fields\"]}]"), { name: "ZodError" });
    expect(checkinFormLoadFailure(zod).message).toContain("CHK-PARSE");
    expect(checkinFormLoadFailure(zod).message).not.toContain("path");
    expect(checkinFormLoadFailure(new TypeError("Failed to fetch")).code).toBe("CHK-NET");
    const other = checkinFormLoadFailure(new Error("secret detail"));
    expect(other.code).toBe("CHK-UNK");
    expect(other.message).not.toContain("secret");
  });
});
