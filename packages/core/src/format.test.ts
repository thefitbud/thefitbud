import { describe, expect, it } from "vitest";
import {
  formatCivilDate,
  formatClockTime,
  formatPersonName,
  formatRelative,
  formatTimeDiff,
} from "./format.js";

describe("formatCivilDate", () => {
  it("formats as 'Thu 15 Oct' without a comma", () => {
    expect(formatCivilDate("2026-10-15", { now: new Date("2026-10-18T00:00:00Z") })).toBe(
      "Thu 15 Oct",
    );
  });

  it("includes year when not current year", () => {
    expect(formatCivilDate("2025-10-15", { now: new Date("2026-10-18T00:00:00Z") })).toBe(
      "Wed 15 Oct 2025",
    );
  });
});

describe("formatClockTime", () => {
  it("formats lowercase am/pm without a leading zero hour", () => {
    // 02:00 UTC = 07:30 IST
    const out = formatClockTime("2026-10-15T02:00:00.000Z", "Asia/Kolkata");
    expect(out).toMatch(/7:30 am/);
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-10-18T12:00:00.000Z");

  it("clamps negative deltas to just now / future phrasing", () => {
    expect(formatRelative("2026-10-18T12:00:30.000Z", now)).toBe("just now");
    expect(formatRelative("2026-10-20T12:00:00.000Z", now)).toBe("in 2 d");
  });

  it("formats past relative times", () => {
    expect(formatRelative("2026-10-18T11:55:00.000Z", now)).toBe("5 min ago");
    expect(formatRelative("2026-10-18T10:00:00.000Z", now)).toBe("2 h ago");
    expect(formatRelative("2026-10-17T12:00:00.000Z", now)).toBe("yesterday");
    expect(formatRelative("2026-10-15T12:00:00.000Z", now)).toBe("3 d ago");
  });
});

describe("formatPersonName", () => {
  it("title-cases lowercase demo names", () => {
    expect(formatPersonName("ishita banerjee")).toBe("Ishita Banerjee");
    expect(formatPersonName("rahul verma")).toBe("Rahul Verma");
  });

  it("keeps existing capitals such as McKenzie", () => {
    expect(formatPersonName("anya McKenzie")).toBe("Anya McKenzie");
  });
});

describe("formatTimeDiff", () => {
  it("describes trainee offset relative to trainer", () => {
    expect(formatTimeDiff("Asia/Kolkata", "Asia/Dubai")).toMatch(/behind you|ahead of you|Same time/);
  });
});
