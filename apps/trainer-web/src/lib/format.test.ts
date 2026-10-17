import { describe, expect, it } from "vitest";
import { formatAgeMinutes, formatLocalDate } from "./format";

describe("format helpers", () => {
  it("formats local dates for display", () => {
    expect(formatLocalDate("2026-10-17")).toMatch(/Oct/);
  });

  it("formats age minutes into compact labels", () => {
    expect(formatAgeMinutes(45)).toBe("45m");
    expect(formatAgeMinutes(120)).toBe("2h");
    expect(formatAgeMinutes(3000)).toBe("2d");
  });
});
