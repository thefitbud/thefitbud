import { describe, expect, it } from "vitest";
import { servingPresetsForFood } from "./servingPresetsV2";

describe("servingPresetsV2", () => {
  it("returns roti presets for roti foods", () => {
    const presets = servingPresetsForFood({
      id: "00000000-0000-4000-8000-000000000030",
      name: "Whole wheat roti",
      energyKcalScaled: 120_000_000,
      defaultServingId: "00000000-0000-4000-8000-000000000031",
    });
    expect(presets.some((row) => row.label.includes("roti"))).toBe(true);
  });
});
