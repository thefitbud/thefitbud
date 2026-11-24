import { describe, expect, it } from "vitest";
import {
  LEGAL_COUNSEL_SIGNOFF,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VALUES,
  TO_BE_CONFIRMED,
  assertLegalPublishable,
  fillLegalTokens,
  isLegalInForce,
  missingLegalValues,
  type LegalKey,
  type LegalValues,
} from "./legal-config.js";

/** A fully filled copy, as it would be once Firoz and counsel have answered everything. */
function filled(): LegalValues {
  const out = { ...LEGAL_VALUES };
  for (const key of Object.keys(out) as LegalKey[]) {
    out[key] = out[key] ?? `filled ${key}`;
  }
  return out;
}

describe("legal config values", () => {
  it("holds the values Firoz supplied on 24 Nov 2026", () => {
    expect(LEGAL_VALUES.partyName).toBe("Shaik Firoz Basha");
    expect(LEGAL_VALUES.grievanceOfficer).toBe("Shaik Firoz Basha");
    expect(LEGAL_VALUES.ownerAddress).toMatch(/Andhra Pradesh/);
    expect(LEGAL_EFFECTIVE_DATE).toBe("1 December 2026");
  });

  it("leaves every value he has not supplied unfilled, never guessed", () => {
    // These are open: counsel or Firoz must answer them. A number here would be invented.
    for (const key of [
      "liabilityCapFloor",
      "noticePeriod",
      "changeNoticePeriod",
      "disputeResolutionPeriod",
      "medicalClearanceAge",
      "dataLocation",
      "retentionSchedule",
      "deletionPeriod",
      "endedRelationshipRetention",
      "backupRetention",
      "rightsResponsePeriod",
      "grievanceAckPeriod",
      "fontIconLicences",
    ] as const) {
      expect(LEGAL_VALUES[key], key).toBeNull();
    }
  });

  it("has no counsel sign-off recorded, so the pending banner stays", () => {
    expect(LEGAL_COUNSEL_SIGNOFF).toBeNull();
    expect(isLegalInForce()).toBe(false);
    expect(isLegalInForce({ name: "A. Counsel", date: "1 January 2027" })).toBe(true);
  });
});

describe("fillLegalTokens (staging and local)", () => {
  it("fills known values", () => {
    expect(fillLegalTokens("by {{partyName}}.")).toBe("by Shaik Firoz Basha.");
  });

  it("renders a missing value as a marked 'To be confirmed' and does not throw", () => {
    expect(missingLegalValues().length).toBeGreaterThan(0);
    const out = fillLegalTokens("within {{deletionPeriod}} days");
    expect(out).toBe(`within ==${TO_BE_CONFIRMED}== days`);
    expect(out).not.toContain("{{");
  });

  it("turns an unknown token into the marker instead of leaking braces", () => {
    expect(fillLegalTokens("{{notAKey}}")).toBe(`==${TO_BE_CONFIRMED}==`);
  });

  it("builds the possessive notice period from the one value", () => {
    expect(fillLegalTokens("{{noticePeriodPossessive}} notice")).toBe(
      `==${TO_BE_CONFIRMED}== notice`,
    );
    expect(
      fillLegalTokens("{{noticePeriodPossessive}} notice", { ...LEGAL_VALUES, noticePeriod: "30 days" }),
    ).toBe("30 days' notice");
  });
});

describe("assertLegalPublishable (production gate)", () => {
  it("passes when every value is filled", () => {
    expect(() => assertLegalPublishable(filled())).not.toThrow();
    expect(missingLegalValues(filled())).toEqual([]);
  });

  it("fails on the values as they are today: open values must block production", () => {
    expect(() => assertLegalPublishable()).toThrow(/not ready to publish/);
  });

  it("fails when any single required value is emptied, and names it", () => {
    for (const key of Object.keys(LEGAL_VALUES) as LegalKey[]) {
      const values = filled();
      values[key] = null;
      expect(() => assertLegalPublishable(values), key).toThrow(key);
    }
  });

  it("treats a blank string as unfilled", () => {
    const values = filled();
    values.partyName = "   ";
    expect(() => assertLegalPublishable(values)).toThrow(/partyName/);
  });

  it("never prints a value in the error", () => {
    const values = filled();
    values.dataLocation = null;
    try {
      assertLegalPublishable(values);
    } catch (err) {
      expect((err as Error).message).not.toContain("filled ");
    }
  });
});
