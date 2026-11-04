import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FALLBACK_DISPLAY_TIME_ZONE,
  UnsupportedTimeZoneError,
  deviceTimeZone,
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

/**
 * The probe output from Firoz's iPhone (iOS dev build of staging, 4 Nov 2026).
 * There will be **no iOS build from this branch** — CU17 merges on code
 * evidence and the device check happens once from `main` — so this data is the
 * closest thing we have to the device, and the stubs below model it exactly
 * rather than a generic rejecting engine.
 *
 *   Asia/Kolkata   Incorrect timeZone information provided   <- REJECTED
 *   Asia/Calcutta  ok
 *   UTC            ok
 *   Etc/UTC        Incorrect timeZone information provided   <- REJECTED
 */
const DEVICE_REJECTS = ["Asia/Kolkata", "Etc/UTC"] as const;
const DEVICE_ACCEPTS = ["Asia/Calcutta", "UTC"] as const;

type Stub = {
  restore: () => void;
  /** Every zone the stub was asked about, in order. */
  asked: string[];
};

/**
 * @param rejected zone names this engine refuses, with Hermes's own message.
 * @param deviceZone what `resolvedOptions().timeZone` reports. `undefined`
 *   leaves the real engine's own zone; `null` models a device that reports no
 *   usable zone at all.
 */
function stubHermesIos(
  rejected: readonly string[],
  deviceZone?: string | null,
): Stub {
  const real = Intl.DateTimeFormat;
  const asked: string[] = [];
  const fake = function DateTimeFormat(
    locales?: string | string[],
    options?: Intl.DateTimeFormatOptions,
  ) {
    if (
      deviceZone !== undefined &&
      locales === undefined &&
      options === undefined
    ) {
      return { resolvedOptions: () => ({ timeZone: deviceZone }) };
    }
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

/** Firoz's iPhone: rejects what it rejected, accepts what it accepted. */
function stubFirozIphone(deviceZone?: string | null): Stub {
  return stubHermesIos(DEVICE_REJECTS, deviceZone);
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

  /**
   * Driven by the real probe output from Firoz's iPhone, 4 Nov 2026:
   *
   *   Asia/Kolkata   Incorrect timeZone information provided   <- REJECTED
   *   Asia/Calcutta  ok
   *   UTC            ok
   *   Etc/UTC        Incorrect timeZone information provided   <- REJECTED
   *
   * So the device rejects **two** of the four names, not just Asia/Kolkata.
   * This stub rejects exactly that pair and asserts both still resolve, which
   * also pins the candidate ordering: the requested name is tried first and
   * the group supplies the accepted sibling.
   */
  it("resolves both names the real device rejected (Asia/Kolkata and Etc/UTC)", () => {
    const stub = stubHermesIos(["Asia/Kolkata", "Etc/UTC"]);
    try {
      expect(resolveIntlTimeZone("Asia/Kolkata")).toBe("Asia/Calcutta");
      expect(resolveIntlTimeZone("Etc/UTC")).toBe("UTC");
      // The names the device accepted are returned untouched, not aliased away.
      expect(resolveIntlTimeZone("Asia/Calcutta")).toBe("Asia/Calcutta");
      expect(resolveIntlTimeZone("UTC")).toBe("UTC");
      // Requested name first in both cases.
      expect(stub.asked[0]).toBe("Asia/Kolkata");
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

  it("throws on a present but blank timeZone instead of answering from the device", () => {
    // Finding 3a: a blank zone used to build an *unzoned* formatter, so
    // formatLocalDate(d, "") silently returned the phone's date — exactly the
    // plausible-wrong-value this task exists to remove. "" and "  " must agree.
    for (const blank of ["", " ", "   "]) {
      expect(
        () => zonedDateTimeFormat("en-CA", { timeZone: blank }),
        JSON.stringify(blank),
      ).toThrow(UnsupportedTimeZoneError);
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

/**
 * D-W3b-11 (b): the device zone, with Asia/Kolkata only when it cannot be read
 * at all — never UTC. The two cases below are the whole substance of the
 * decision and must stay separate: an *unreadable* device zone falls back; a
 * zone that is *present but unresolvable* still throws.
 */
describe("deviceTimeZone (D-W3b-11 (b))", () => {
  function stubDeviceZone(resolved: unknown, shouldThrow = false) {
    const real = Intl.DateTimeFormat;
    const fake = function DateTimeFormat(
      locales?: string | string[],
      options?: Intl.DateTimeFormatOptions,
    ) {
      if (locales === undefined && options === undefined) {
        if (shouldThrow) throw new RangeError("no zone data on this device");
        return { resolvedOptions: () => ({ timeZone: resolved }) };
      }
      return new real(locales, options);
    } as unknown as typeof Intl.DateTimeFormat;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Intl as any).DateTimeFormat = fake;
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Intl as any).DateTimeFormat = real;
    };
  }

  it("returns the device's own zone when it reads back", () => {
    const restore = stubDeviceZone("Europe/Lisbon");
    try {
      expect(deviceTimeZone()).toBe("Europe/Lisbon");
    } finally {
      restore();
    }
  });

  it("returns the iOS legacy name as reported, which the alias table handles", () => {
    const restore = stubDeviceZone("Asia/Calcutta");
    try {
      expect(deviceTimeZone()).toBe("Asia/Calcutta");
      expect(resolveIntlTimeZone(deviceTimeZone())).toBe("Asia/Calcutta");
    } finally {
      restore();
    }
  });

  it.each([
    ["undefined", undefined],
    ["missing (null)", null],
    ["blank", ""],
    ["whitespace", "   "],
    ["not a string", 42],
  ])("falls back to Asia/Kolkata, never UTC, when the zone reads %s", (_label, value) => {
    const restore = stubDeviceZone(value);
    try {
      expect(deviceTimeZone()).toBe("Asia/Kolkata");
      expect(deviceTimeZone()).toBe(FALLBACK_DISPLAY_TIME_ZONE);
      expect(deviceTimeZone()).not.toBe("UTC");
    } finally {
      restore();
    }
  });

  it("falls back when the read itself throws", () => {
    const restore = stubDeviceZone(undefined, true);
    try {
      expect(deviceTimeZone()).toBe("Asia/Kolkata");
    } finally {
      restore();
    }
  });

  it("does NOT swallow a present-but-unresolvable zone into the fallback", () => {
    // The fallback covers an unreadable device zone only. A device that names
    // a zone the engine cannot use must still produce the named error, or
    // D-W3b-11's "an invalid or unsupported zone still shows an error that
    // names the zone" is lost and a trainer sees Indian dates instead.
    const restore = stubDeviceZone("Not/AZone");
    try {
      expect(deviceTimeZone()).toBe("Not/AZone");
      expect(() => resolveIntlTimeZone(deviceTimeZone())).toThrow(
        UnsupportedTimeZoneError,
      );
      expect(() => resolveIntlTimeZone(deviceTimeZone())).toThrow(/Not\/AZone/);
    } finally {
      restore();
    }
  });
});

describe("on an engine modelled exactly on Firoz's iPhone", () => {
  it("returns a name this device accepts for every probed input", () => {
    const stub = stubFirozIphone();
    try {
      // Each of the four probed names resolves to one the device said "ok" to.
      expect(resolveIntlTimeZone("Asia/Kolkata")).toBe("Asia/Calcutta");
      expect(resolveIntlTimeZone("Asia/Calcutta")).toBe("Asia/Calcutta");
      expect(resolveIntlTimeZone("Etc/UTC")).toBe("UTC");
      expect(resolveIntlTimeZone("UTC")).toBe("UTC");
      for (const zone of ["Asia/Kolkata", "Asia/Calcutta", "Etc/UTC", "UTC"]) {
        expect(DEVICE_ACCEPTS).toContain(resolveIntlTimeZone(zone));
      }
    } finally {
      stub.restore();
    }
  });

  it("produces the right instants, not merely a zone that does not throw", () => {
    const stub = stubFirozIphone();
    try {
      const evening = new Date("2026-11-03T18:45:00Z");
      // IST is UTC+5:30, so 18:45Z is 00:15 on the 4th in India.
      for (const ist of ["Asia/Kolkata", "Asia/Calcutta"]) {
        expect(
          zonedDateTimeFormat("en-GB", {
            timeZone: ist,
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          }).format(evening),
          ist,
        ).toBe("00:15");
      }
      // And the two UTC spellings agree with each other, at 18:45.
      for (const utc of ["UTC", "Etc/UTC"]) {
        expect(
          zonedDateTimeFormat("en-GB", {
            timeZone: utc,
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          }).format(evening),
          utc,
        ).toBe("18:45");
      }
    } finally {
      stub.restore();
    }
  });
});

describe("D-W3b-11 (b) on Firoz's iPhone", () => {
  it("works when the device reports the iOS legacy name", () => {
    // The common iOS case: resolvedOptions() says Asia/Calcutta.
    const stub = stubFirozIphone("Asia/Calcutta");
    try {
      expect(deviceTimeZone()).toBe("Asia/Calcutta");
      expect(resolveIntlTimeZone(deviceTimeZone())).toBe("Asia/Calcutta");
    } finally {
      stub.restore();
    }
  });

  it("works when the device reports the canonical name the engine rejects", () => {
    const stub = stubFirozIphone("Asia/Kolkata");
    try {
      expect(deviceTimeZone()).toBe("Asia/Kolkata");
      expect(resolveIntlTimeZone(deviceTimeZone())).toBe("Asia/Calcutta");
    } finally {
      stub.restore();
    }
  });

  it.each([
    ["nothing", null],
    ["a blank string", ""],
  ])(
    "falls back to Asia/Kolkata when the device reports %s — and that fallback itself resolves here",
    (_label, reported) => {
      const stub = stubFirozIphone(reported);
      try {
        expect(deviceTimeZone()).toBe(FALLBACK_DISPLAY_TIME_ZONE);
        expect(deviceTimeZone()).not.toBe("UTC");
        // The decided fallback is a name THIS device rejects outright, so the
        // rule would be useless without the alias: assert the whole chain, not
        // just the constant.
        expect(resolveIntlTimeZone(deviceTimeZone())).toBe("Asia/Calcutta");
        expect(DEVICE_ACCEPTS).toContain(resolveIntlTimeZone(deviceTimeZone()));
      } finally {
        stub.restore();
      }
    },
  );

  it("still names the zone when the device reports one it cannot resolve", () => {
    // The distinction the decision turns on: unreadable -> fallback; present
    // but unresolvable -> error. This path has no human check behind it now.
    const stub = stubFirozIphone("Mars/Olympus_Mons");
    try {
      expect(deviceTimeZone()).toBe("Mars/Olympus_Mons");
      expect(deviceTimeZone()).not.toBe(FALLBACK_DISPLAY_TIME_ZONE);
      expect(() => resolveIntlTimeZone(deviceTimeZone())).toThrow(
        UnsupportedTimeZoneError,
      );
      expect(() => resolveIntlTimeZone(deviceTimeZone())).toThrow(
        /Mars\/Olympus_Mons/,
      );
    } finally {
      stub.restore();
    }
  });
});
