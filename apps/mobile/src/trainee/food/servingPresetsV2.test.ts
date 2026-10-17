import { describe, expect, it } from "vitest";
import { servingPresetsForFood } from "./servingPresetsV2";

describe("servingPresetsV2", () => {
  it("returns roti presets for roti foods", () => {
    const presets = servingPresetsForFood({
      id: "f1000001-0000-4000-8000-000000000001",
      name: "Chapati / roti",
      energyKcalScaled: 120_000_000,
      defaultServingId: null,
    });
    expect(presets.length).toBeGreaterThan(0);
    expect(presets.every((row) => row.servingId)).toBe(true);
    expect(presets[0]?.label.length).toBeGreaterThan(0);
  });
});
