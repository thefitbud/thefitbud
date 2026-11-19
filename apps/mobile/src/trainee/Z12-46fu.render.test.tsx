/**
 * Z12-46fu: pixel fixes from FitBud UI's #483 device review (19 Nov 2026).
 * Companion coverage: formatInstant "7:00 pm" in packages/core; coach note
 * render in TodayTab.v3.test; chart anchors in ProgressTab.chart.test.
 */
import { describe, expect, it } from "vitest";
import { stepsChipText } from "./today/TodaySummaryCard";

describe("Z12-46fu Steps chip copy", () => {
  it("uses short Set up so the chip fits at 360 dp", () => {
    expect(stepsChipText({ status: "not_synced", target: null })).toEqual({
      value: "Set up",
      a11y: "Steps: set up steps",
    });
  });
});
