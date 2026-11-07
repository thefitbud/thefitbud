import { describe, expect, it } from "vitest";
import type { CheckinFieldDefinition } from "@fitbud/contracts";
import {
  CHECKIN_STANDARD_KEYS,
  findCheckinFormKeyProblem,
  invalidCheckinKeyedAnswers,
  validateCheckinAnswer,
} from "./checkin-keys.js";
import { GLOBAL_CHECKIN_FORM_FIELDS } from "./checkin.js";

const weight: CheckinFieldDefinition = {
  id: "weight",
  key: "weight",
  label: "Weight",
  type: "measurement",
  measurementType: "body_weight_kg",
  required: false,
};
const energy: CheckinFieldDefinition = {
  id: "energy",
  key: "energy",
  label: "Energy",
  type: "scale_1_5",
  required: false,
};

describe("standard check-in keys", () => {
  it("lists the fourteen standard keys", () => {
    expect(CHECKIN_STANDARD_KEYS).toEqual([
      "weight", "waist", "hips", "chest", "arm", "thigh",
      "photo_front", "photo_side", "photo_back",
      "energy", "sleep_quality", "stress", "hunger", "notes",
    ]);
  });

  it("accepts ratings 1-5 as integers only", () => {
    for (const key of ["energy", "sleep_quality", "stress", "hunger"] as const) {
      for (const ok of [1, 2, 3, 4, 5]) {
        expect(validateCheckinAnswer(key, ok).ok).toBe(true);
      }
      for (const bad of [0, 6, 2.5, -1, "3", null, Number.NaN]) {
        expect(validateCheckinAnswer(key, bad).ok).toBe(false);
      }
    }
  });

  it("bounds weight to 20-300 kg and measurements to 10-250 cm", () => {
    expect(validateCheckinAnswer("weight", 19.9).ok).toBe(false);
    expect(validateCheckinAnswer("weight", 20).ok).toBe(true);
    expect(validateCheckinAnswer("weight", 300).ok).toBe(true);
    expect(validateCheckinAnswer("weight", 300.1).ok).toBe(false);
    for (const key of ["waist", "hips", "chest", "arm", "thigh"] as const) {
      expect(validateCheckinAnswer(key, 9.9).ok).toBe(false);
      expect(validateCheckinAnswer(key, 10).ok).toBe(true);
      expect(validateCheckinAnswer(key, 250).ok).toBe(true);
      expect(validateCheckinAnswer(key, 251).ok).toBe(false);
    }
  });

  it("takes photos as file ids and notes as text", () => {
    expect(validateCheckinAnswer("photo_front", "file-123").ok).toBe(true);
    expect(validateCheckinAnswer("photo_front", "").ok).toBe(false);
    expect(validateCheckinAnswer("photo_back", 4).ok).toBe(false);
    expect(validateCheckinAnswer("notes", "Felt strong").ok).toBe(true);
    expect(validateCheckinAnswer("notes", 4).ok).toBe(false);
  });

  it("reports a duplicate standard key at the second use", () => {
    expect(findCheckinFormKeyProblem([weight, energy, { ...energy, id: "energy" }]))
      .toEqual({ code: "DUPLICATE_CHECKIN_KEY", key: "energy", index: 2 });
  });

  it("rejects a key whose id or type does not match", () => {
    expect(findCheckinFormKeyProblem([{ ...energy, id: "mood" }])?.code)
      .toBe("CHECKIN_KEY_MISMATCH");
    expect(findCheckinFormKeyProblem([{ ...energy, type: "yes_no" } as CheckinFieldDefinition])?.code)
      .toBe("CHECKIN_KEY_MISMATCH");
    expect(
      findCheckinFormKeyProblem([
        { id: "arm", key: "arm", label: "Arm", type: "measurement", measurementType: "other", required: false },
      ])?.code,
    ).toBe("CHECKIN_KEY_MISMATCH");
    expect(
      findCheckinFormKeyProblem([
        { id: "arm", key: "arm", label: "Arm", type: "measurement", measurementType: "other", unit: "cm", required: false },
      ]),
    ).toBeNull();
  });

  it("leaves v1 and custom questions alone", () => {
    expect(findCheckinFormKeyProblem(GLOBAL_CHECKIN_FORM_FIELDS)).toBeNull();
    const custom: CheckinFieldDefinition = {
      id: "sleep", label: "Sleep", type: "scale_1_5", required: false,
    };
    expect(findCheckinFormKeyProblem([custom, { ...custom, id: "sleep2" }])).toBeNull();
    expect(invalidCheckinKeyedAnswers([custom], { fieldAnswers: { sleep: 9 } })).toEqual([]);
    expect(invalidCheckinKeyedAnswers(GLOBAL_CHECKIN_FORM_FIELDS, { fieldAnswers: { waist: 5 } })).toEqual([]);
  });

  it("flags only invalid keyed answers and ignores absent ones", () => {
    expect(
      invalidCheckinKeyedAnswers([weight, energy], { fieldAnswers: { weight: 10, energy: 4 } }),
    ).toEqual(["weight"]);
    expect(invalidCheckinKeyedAnswers([weight, energy], { fieldAnswers: {} })).toEqual([]);
  });
});
