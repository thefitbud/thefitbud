import { describe, expect, it } from "vitest";
import { brand, rings } from "./tokens.js";

describe("brand hex (guide §1.6.1)", () => {
  it("uses #1A1248 deep navy and #FF587D coral", () => {
    expect(brand.deepNavy).toBe("#1A1248");
    expect(brand.coral).toBe("#FF587D");
    expect(rings.protein).toBe("#1A1248");
  });
});
