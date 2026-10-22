import { describe, expect, it } from "vitest";
import { formatAgeMinutes, formatLocalDate } from "./format";

describe("format helpers", () => {
  it("formats local dates for display", () => {
    expect(formatLocalDate("2026-10-17")).toMatch(/Oct/);
  });

  it("formats age minutes with product-rule relative labels", () => {
    expect(formatAgeMinutes(45)).toBe("45 min ago");
    expect(formatAgeMinutes(120)).toBe("2 h ago");
    expect(formatAgeMinutes(3000)).toBe("2 d ago");
  });
});
