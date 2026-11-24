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

  it("bundles the full canonical IANA list, not only the curated cities", () => {
    expect(TIME_ZONES.length).toBeGreaterThan(400);
    const ids = TIME_ZONES.map((zone) => zone.id);
    expect(ids).toEqual(
      expect.arrayContaining(["Pacific/Chatham", "America/Argentina/Ushuaia", "Asia/Kolkata", "UTC"]),
    );
    // Every zone the runtime knows is in the list (Node has Intl.supportedValuesOf).
    const known = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    for (const id of known ?? []) expect(ids).toContain(id);
  });

  it("finds a zone outside the curated cities by city, readable name or IANA id", () => {
    expect(searchTimeZones("Chatham").map((z) => z.id)).toEqual(["Pacific/Chatham"]);
    expect(searchTimeZones("Pacific/Chatham").map((z) => z.id)).toContain("Pacific/Chatham");
    expect(searchTimeZones("Ushuaia").map((z) => z.id)).toEqual(["America/Argentina/Ushuaia"]);
    expect(searchTimeZones("america/argentina/ushuaia")[0]?.id).toBe("America/Argentina/Ushuaia");
    expect(searchTimeZones("buenos aires")[0]?.id).toBe("America/Argentina/Buenos_Aires");
  });

  it("folds old ids and groups by region", () => {
    expect(canonicalZoneId("Asia/Calcutta")).toBe("Asia/Kolkata");
    const groups = groupTimeZones(TIME_ZONES);
    expect(groups[0]?.region).toBe("Asia");
    expect(groups[0]?.zones[0]?.id).toBe("Asia/Kolkata");
  });
});
