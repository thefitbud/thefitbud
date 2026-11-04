import { afterEach, describe, expect, it } from "vitest";
import { formatLocalDate, localDateTimeToUtcIso } from "./timezone.js";
import { greetingFor } from "./greeting.js";
import { formatClockTime, formatWindow } from "./format.js";
import { localTimeHhMm } from "./reminder.js";
import {
  FALLBACK_DISPLAY_TIME_ZONE,
  UnsupportedTimeZoneError,
  clearTimeZoneResolutionCache,
} from "./zone.js";

/**
 * CU17: the core helpers are what crashed on Hermes/iOS. Node accepts
 * `Asia/Kolkata`, so each case here runs under a stub that rejects it exactly
 * as Apple's incomplete `knownTimeZoneNames` does, and asserts the helper
 * still produces the real IST answer — not UTC's, and not a silent fallback.
 */
const HERMES_MESSAGE = "Incorrect timeZone information provided";

function stubHermesIos(rejected: readonly string[]): () => void {
  const real = Intl.DateTimeFormat;
  const fake = function DateTimeFormat(
    locales?: string | string[],
    options?: Intl.DateTimeFormatOptions,
  ) {
    if (options?.timeZone !== undefined && rejected.includes(options.timeZone)) {
      throw new RangeError(HERMES_MESSAGE);
    }
    return new real(locales, options);
  } as unknown as typeof Intl.DateTimeFormat;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Intl as any).DateTimeFormat = fake;
  clearTimeZoneResolutionCache();
  return () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Intl as any).DateTimeFormat = real;
    clearTimeZoneResolutionCache();
  };
}

afterEach(() => {
  clearTimeZoneResolutionCache();
});

describe("formatLocalDate on Hermes/iOS", () => {
  it("gives the real IST civil date across midnight, not UTC's", () => {
    const restore = stubHermesIos(["Asia/Kolkata"]);
    try {
      // 18:45 UTC is already 00:15 on the 4th in IST.
      expect(
        formatLocalDate(new Date("2026-11-03T18:45:00Z"), "Asia/Kolkata"),
      ).toBe("2026-11-04");
      // Proof the assertion bites: UTC's answer is the 3rd.
      expect(formatLocalDate(new Date("2026-11-03T18:45:00Z"), "UTC")).toBe(
        "2026-11-03",
      );
    } finally {
      restore();
    }
  });

  it("surfaces the named error for an unusable zone instead of a wrong date", () => {
    const restore = stubHermesIos(["Asia/Kolkata", "Asia/Calcutta"]);
    try {
      expect(() =>
        formatLocalDate(new Date("2026-11-03T18:45:00Z"), "Asia/Kolkata"),
      ).toThrow(UnsupportedTimeZoneError);
      expect(() =>
        formatLocalDate(new Date("2026-11-03T18:45:00Z"), "Asia/Kolkata"),
      ).toThrow(/"Asia\/Kolkata"/);
    } finally {
      restore();
    }
  });

  it("throws the named error for a zone that does not exist", () => {
    expect(() =>
      formatLocalDate(new Date("2026-11-03T18:45:00Z"), "Not/AZone"),
    ).toThrow(UnsupportedTimeZoneError);
    expect(() =>
      formatLocalDate(new Date("2026-11-03T18:45:00Z"), "Not/AZone"),
    ).toThrow(/Not\/AZone/);
  });
});

describe("a blank zone is a caller bug, not the device zone", () => {
  it("throws rather than returning the device's civil date", () => {
    // Finding 3a: this used to return the engine-default date with no error.
    for (const blank of ["", "   "]) {
      expect(
        () => formatLocalDate(new Date("2026-11-03T18:45:00Z"), blank),
        JSON.stringify(blank),
      ).toThrow(UnsupportedTimeZoneError);
    }
    expect(() => localDateTimeToUtcIso("2026-11-04", "", 0, 0, 0)).toThrow(
      UnsupportedTimeZoneError,
    );
  });
});

describe("localDateTimeToUtcIso on Hermes/iOS", () => {
  it("round-trips a civil IST date and wall time through the alias", () => {
    const restore = stubHermesIos(["Asia/Kolkata"]);
    try {
      const iso = localDateTimeToUtcIso("2026-11-04", "Asia/Kolkata", 0, 0, 0);
      // IST is UTC+5:30, so local midnight on the 4th is 18:30 UTC on the 3rd.
      expect(iso).toBe("2026-11-03T18:30:00.000Z");
      expect(formatLocalDate(new Date(iso), "Asia/Kolkata")).toBe("2026-11-04");
    } finally {
      restore();
    }
  });

  it("throws the named error rather than falling back to UTC", () => {
    const restore = stubHermesIos(["Asia/Kolkata", "Asia/Calcutta"]);
    try {
      expect(() =>
        localDateTimeToUtcIso("2026-11-04", "Asia/Kolkata", 0, 0, 0),
      ).toThrow(UnsupportedTimeZoneError);
    } finally {
      restore();
    }
  });
});

describe("format.ts helpers on Hermes/iOS", () => {
  it("formats a clock time and a due window in real IST", () => {
    const restore = stubHermesIos(["Asia/Kolkata"]);
    try {
      expect(
        formatClockTime("2026-11-03T18:45:00Z", "Asia/Kolkata"),
      ).toBe("12:15 am");
      expect(
        formatWindow(
          "2026-11-03T18:30:00Z",
          "2026-11-04T18:29:00Z",
          "Asia/Kolkata",
        ),
      ).toContain("Wed 4 Nov");
    } finally {
      restore();
    }
  });
});

describe("greetingFor", () => {
  it("greets from the alias-resolved zone on Hermes/iOS", () => {
    const restore = stubHermesIos(["Asia/Kolkata"]);
    try {
      // 02:00 UTC is 07:30 IST — morning in India, still night in UTC.
      expect(
        greetingFor("Rohan Mehta", "Asia/Kolkata", new Date("2026-11-03T02:00:00Z")),
      ).toBe("Good morning, Rohan");
    } finally {
      restore();
    }
  });

  it("surfaces the typed error for an unusable zone instead of an IST greeting", () => {
    // The old code caught the zone error and answered from Asia/Kolkata, so a
    // user in an unusable zone saw a confidently wrong greeting (D-W3-12).
    expect(() =>
      greetingFor("Rohan Mehta", "Not/AZone", new Date("2026-11-03T02:00:00Z")),
    ).toThrow(UnsupportedTimeZoneError);
  });

  it("falls back to Asia/Kolkata only when no zone is given (D-W3b-11 (b))", () => {
    // An absent zone is the sanctioned India-first fallback; a present but
    // unresolvable one is the error case above. The two must not blur.
    const morningIst = new Date("2026-11-03T02:00:00Z");
    expect(greetingFor("Rohan Mehta", "", morningIst)).toBe("Good morning, Rohan");
    expect(greetingFor("Rohan Mehta", "   ", morningIst)).toBe("Good morning, Rohan");
    expect(greetingFor("Rohan Mehta", undefined, morningIst)).toBe(
      "Good morning, Rohan",
    );
    expect(greetingFor("Rohan Mehta", FALLBACK_DISPLAY_TIME_ZONE, morningIst)).toBe(
      "Good morning, Rohan",
    );
  });
});

describe("localTimeHhMm", () => {
  it("reads the local time through the alias on Hermes/iOS", () => {
    const restore = stubHermesIos(["Asia/Kolkata"]);
    try {
      expect(localTimeHhMm("2026-11-03T18:45:00Z", "Asia/Kolkata")).toBe("00:15");
    } finally {
      restore();
    }
  });

  it("returns null for an unparseable instant but throws for an unusable zone", () => {
    expect(localTimeHhMm("not-a-date", "Asia/Kolkata")).toBeNull();
    expect(() => localTimeHhMm("2026-11-03T18:45:00Z", "Not/AZone")).toThrow(
      UnsupportedTimeZoneError,
    );
  });
});
