import { describe, expect, it } from "vitest";
import {
  defaultUnitForMeasurementType,
  isAllowedMediaContentType,
} from "./progress.js";

describe("progress helpers", () => {
  it("accepts supported image content types", () => {
    expect(isAllowedMediaContentType("image/jpeg")).toBe(true);
    expect(isAllowedMediaContentType("image/png; charset=binary")).toBe(true);
    expect(isAllowedMediaContentType("application/pdf")).toBe(false);
  });

  it("maps measurement types to default units", () => {
    expect(defaultUnitForMeasurementType("body_weight_kg")).toBe("kg");
    expect(defaultUnitForMeasurementType("waist_cm")).toBe("cm");
  });
});
