/**
 * Z11b-6: the pure chart helpers behind the Progress tab.
 * `.test.tsx` because ProgressTab imports react-native (render project).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const { clampMarkerLeft, monthTickPoints, weightSeriesLast12Weeks } =
  await import("./ProgressTab");

describe("clampMarkerLeft", () => {
  it("centres the pill on the marker when there is room", () => {
    expect(clampMarkerLeft(160, 100, 329)).toBe(110);
  });
  it("never goes past the left edge", () => {
    expect(clampMarkerLeft(8, 180, 329)).toBe(0);
  });
  it("never goes past the right edge", () => {
    expect(clampMarkerLeft(320, 180, 329)).toBe(149);
  });
  it("stays at 0 when the pill is wider than the chart", () => {
    expect(clampMarkerLeft(100, 400, 329)).toBe(0);
  });
  it("before measuring, only keeps off the left edge", () => {
    expect(clampMarkerLeft(0, 0, 329)).toBe(0);
  });
});

describe("monthTickPoints", () => {
  it("returns the first point of each distinct month", () => {
    const pts = [
      { date: "2026-10-02" },
      { date: "2026-10-09" },
      { date: "2026-10-30" },
    ];
    expect(monthTickPoints(pts)).toEqual([{ date: "2026-10-02" }]);
  });
  it("labels each month once across a boundary", () => {
    const pts = [
      { date: "2026-09-25" },
      { date: "2026-10-02" },
      { date: "2026-10-09" },
      { date: "2026-11-03" },
    ];
    expect(monthTickPoints(pts).map((p) => p.date)).toEqual([
      "2026-09-25",
      "2026-10-02",
      "2026-11-03",
    ]);
  });
});

describe("weightSeriesLast12Weeks", () => {
  it("keeps the last reading of each civil day", () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 3);
    const ymd = d.toISOString().slice(0, 10);
    const m = (t: string, value: number) =>
      ({ type: "body_weight_kg", value, observedAt: `${ymd}T${t}:00.000Z` }) as never;
    const series = weightSeriesLast12Weeks(
      [m("15:30", 81), m("02:42", 82)],
      "UTC",
    );
    expect(series).toEqual([{ date: ymd, value: 81 }]);
  });
});
