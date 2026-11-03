import { afterEach, describe, expect, it, vi } from "vitest";
import {
  UnsupportedTimeZoneError,
  clearTimeZoneResolutionCache,
  resolveIntlTimeZone,
  timeZoneCandidates,
  zonedDateTimeFormat,
} from "./zone.js";

/**
 * Node runs with full ICU and happily accepts `Asia/Kolkata`, so a test that
 * only calls Intl here proves nothing about Hermes on iOS. These tests stub
 * `Intl.DateTimeFormat` so it rejects the exact set of names Apple's
 * `NSTimeZone.knownTimeZoneNames` omits, with the engine's own message.
 */
const HERMES_MESSAGE = "Incorrect timeZone information provided";

type Stub = {
  restore: () => void;
  /** Every zone the stub was asked about, in order. */
  asked: string[];
};

function stubHermesIos(rejected: readonly string[]): Stub {
  const real = Intl.DateTimeFormat;
  const asked: string[] = [];
  const fake = function DateTimeFormat(
    locales?: string | string[],
    options?: Intl.DateTimeFormatOptions,
  ) {
    const zone = options?.timeZone;
    if (zone !== undefined) {
      asked.push(zone);
      if (rejected.includes(zone)) {
        throw new RangeError(HERMES_MESSAGE);
      }
    }
    return new real(locales, options);
  } as unknown as typeof Intl.DateTimeFormat;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Intl as any).DateTimeFormat = fake;
  clearTimeZoneResolutionCache();
  return {
    asked,
    restore: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Intl as any).DateTimeFormat = real;
      clearTimeZoneResolutionCache();
    },
  };
}

afterEach(() => {
  clearTimeZoneResolutionCache();
});

describe("timeZoneCandidates", () => {
  it("puts the requested name first and only adds names for the same zone", () => {
    expect(timeZoneCandidates("Asia/Kolkata")).toEqual([
      "Asia/Kolkata",
      "Asia/Calcutta",
    ]);
    expect(timeZoneCandidates("Asia/Calcutta")).toEqual([
      "Asia/Calcutta",
      "Asia/Kolkata",
    ]);
    expect(timeZoneCandidates("UTC")).toEqual([
      "UTC",
      "Etc/UTC",
      "Etc/GMT",
      "GMT",
    ]);
  });

  it("offers no alias for a zone that has none", () => {
    expect(timeZoneCandidates("Asia/Dubai")).toEqual(["Asia/Dubai"]);
    expect(timeZoneCandidates("Not/AZone")).toEqual(["Not/AZone"]);
  });
});

describe("resolveIntlTimeZone on an engine that accepts everything", () => {
  it("returns the requested zone unchanged", () => {
    expect(resolveIntlTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(resolveIntlTimeZone("Asia/Dubai")).toBe("Asia/Dubai");
    expect(resolveIntlTimeZone("UTC")).toBe("UTC");
  });
});

describe("resolveIntlTimeZone on Hermes/iOS", () => {
  it("falls through to the Asia/Calcutta alias when Asia/Kolkata is rejected", () => {
    const stub = stubHermesIos(["Asia/Kolkata"]);
    try {
      expect(resolveIntlTimeZone("Asia/Kolkata")).toBe("Asia/Calcutta");
      // It tried the requested name first, then the alias — not the alias only.
      expect(stub.asked.slice(0, 2)).toEqual(["Asia/Kolkata", "Asia/Calcutta"]);
    } finally {
      stub.restore();
    }
  });

  it("falls through to UTC when Etc/UTC is rejected", () => {
    const stub = stubHermesIos(["Etc/UTC"]);
    try {
      expect(resolveIntlTimeZone("Etc/UTC")).toBe("UTC");
    } finally {
      stub.restore();
    }
  });

  it("caches the resolution per input instead of probing again", () => {
    const stub = stubHermesIos(["Asia/Kolkata"]);
    try {
      resolveIntlTimeZone("Asia/Kolkata");
      const afterFirst = stub.asked.length;
      resolveIntlTimeZone("Asia/Kolkata");
      expect(stub.asked.length).toBe(afterFirst);
    } finally {
      stub.restore();
    }
  });

  it("throws a named error, never a substitute zone, when nothing works", () => {
    const stub = stubHermesIos(["Asia/Kolkata", "Asia/Calcutta"]);
    try {
      let thrown: unknown;
      try {
        resolveIntlTimeZone("Asia/Kolkata");
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(UnsupportedTimeZoneError);
      const err = thrown as UnsupportedTimeZoneError;
      expect(err.timeZone).toBe("Asia/Kolkata");
      expect(err.tried).toEqual(["Asia/Kolkata", "Asia/Calcutta"]);
      // The message names the zone, every candidate and the engine's reason.
      expect(err.message).toContain('"Asia/Kolkata"');
      expect(err.message).toContain("Asia/Calcutta");
      expect(err.message).toContain(HERMES_MESSAGE);
      // And it is not any kind of silent UTC/IST fallback.
      expect(err.message).not.toMatch(/^UTC$/);
    } finally {
      stub.restore();
    }
  });
});

describe("resolveIntlTimeZone for a zone that does not exist", () => {
  it("throws the typed error naming the zone", () => {
    expect(() => resolveIntlTimeZone("Not/AZone")).toThrow(
      UnsupportedTimeZoneError,
    );
    expect(() => resolveIntlTimeZone("Not/AZone")).toThrow(/"Not\/AZone"/);
  });

  it("throws rather than treating an empty zone as the device zone", () => {
    expect(() => resolveIntlTimeZone("   ")).toThrow(UnsupportedTimeZoneError);
  });
});

describe("zonedDateTimeFormat", () => {
  it("formats through the alias when the engine rejects the canonical name", () => {
    const stub = stubHermesIos(["Asia/Kolkata"]);
    try {
      const out = zonedDateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date("2026-11-03T18:45:00Z"));
      // 18:45 UTC is 00:15 the next day in IST.
      expect(out).toBe("00:15");
    } finally {
      stub.restore();
    }
  });

  it("leaves the engine's own zone alone when no timeZone is given", () => {
    const spy = vi.spyOn(Intl, "DateTimeFormat");
    try {
      zonedDateTimeFormat("en-GB", { hour: "2-digit" });
      expect(spy.mock.calls[0]?.[1]).not.toHaveProperty("timeZone");
    } finally {
      spy.mockRestore();
    }
  });
});
