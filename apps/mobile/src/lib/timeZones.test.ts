import { describe, expect, it } from "vitest";
import {
  TIME_ZONES,
  canonicalZoneId,
  formatUtcOffset,
  groupTimeZones,
  searchTimeZones,
  zoneOffsetLabel,
} from "./timeZones";

describe("timeZones", () => {
  it("lists every zone once with an id the runtime knows", () => {
    const ids = TIME_ZONES.map((zone) => zone.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone: id })).not.toThrow();
    }
  });

  it("formats offsets as UTC+h:mm", () => {
    expect(formatUtcOffset(330)).toBe("UTC+5:30");
    expect(formatUtcOffset(0)).toBe("UTC+0:00");
    expect(formatUtcOffset(-480)).toBe("UTC-8:00");
    expect(formatUtcOffset(345)).toBe("UTC+5:45");
  });

  it("reads the current offset from Intl, following daylight saving", () => {
    expect(zoneOffsetLabel("Asia/Kolkata")).toBe("UTC+5:30");
    expect(zoneOffsetLabel("Asia/Dubai")).toBe("UTC+4:00");
    expect(zoneOffsetLabel("Europe/London", new Date("2026-01-15T12:00:00Z"))).toBe("UTC+0:00");
    expect(zoneOffsetLabel("Europe/London", new Date("2026-07-15T12:00:00Z"))).toBe("UTC+1:00");
    expect(zoneOffsetLabel("Not/AZone")).toBe("");
  });

  it("finds zones by abbreviation, city and country", () => {
    expect(searchTimeZones("IST")[0]?.id).toBe("Asia/Kolkata");
    expect(searchTimeZones("Kolkata").map((z) => z.id)).toContain("Asia/Kolkata");
    expect(searchTimeZones("india").map((z) => z.id)).toContain("Asia/Kolkata");
    expect(searchTimeZones("London").map((z) => z.id)).toEqual(["Europe/London"]);
    expect(searchTimeZones("new").map((z) => z.id)).toEqual(
      expect.arrayContaining(["America/New_York", "Asia/Kolkata", "Pacific/Auckland"]),
    );
    expect(searchTimeZones("Lakeview")).toEqual([]);
    expect(searchTimeZones("")).toHaveLength(TIME_ZONES.length);
  });

  it("folds old ids and groups by region", () => {
    expect(canonicalZoneId("Asia/Calcutta")).toBe("Asia/Kolkata");
    const groups = groupTimeZones(TIME_ZONES);
    expect(groups[0]?.region).toBe("Asia");
    expect(groups[0]?.zones[0]?.id).toBe("Asia/Kolkata");
  });
});
