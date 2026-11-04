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

/**
 * Firoz's iPhone, from the real probe (4 Nov 2026): it rejects these two names
 * and accepts `Asia/Calcutta` and `UTC`. There is no iOS build from this
 * branch, so this is the closest model of the device we have.
 */
const DEVICE_REJECTS = ["Asia/Kolkata", "Etc/UTC"] as const;

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

describe("the user-visible strings, on an engine modelled on Firoz's iPhone", () => {
  /**
   * The screens that red-boxed. Every string here is what a trainer or trainee
   * actually reads, so each case asserts the **correct** value rather than the
   * absence of a throw — a zone that resolves to the wrong place would pass a
   * does-not-throw test and ship a wrong date.
   */
  const evening = new Date("2026-11-03T18:45:00Z"); // 00:15 on the 4th, IST

  it("renders the Attention tab's date heading in real IST for both spellings", () => {
    const restore = stubHermesIos(DEVICE_REJECTS);
    try {
      for (const ist of ["Asia/Kolkata", "Asia/Calcutta"]) {
        expect(formatLocalDate(evening, ist), ist).toBe("2026-11-04");
      }
      // The device's own answer in UTC would have been the 3rd — the bug this
      // task exists to prevent, kept visible in the assertion.
      expect(formatLocalDate(evening, "UTC")).toBe("2026-11-03");
    } finally {
      restore();
    }
  });

  it("renders the offline-since clock time in real IST", () => {
    const restore = stubHermesIos(DEVICE_REJECTS);
    try {
      for (const ist of ["Asia/Kolkata", "Asia/Calcutta"]) {
        expect(formatClockTime(evening.toISOString(), ist), ist).toBe("12:15 am");
      }
    } finally {
      restore();
    }
  });

  it("renders a due window on the right civil day", () => {
    const restore = stubHermesIos(DEVICE_REJECTS);
    try {
      expect(
        formatWindow("2026-11-03T18:30:00Z", "2026-11-04T18:29:00Z", "Asia/Kolkata"),
      ).toContain("Wed 4 Nov");
    } finally {
      restore();
    }
  });

  it("greets from the real local hour, and from the decided fallback when no zone is given", () => {
    const restore = stubHermesIos(DEVICE_REJECTS);
    try {
      const morningIst = new Date("2026-11-03T02:00:00Z"); // 07:30 IST
      expect(greetingFor("Rohan Mehta", "Asia/Kolkata", morningIst)).toBe(
        "Good morning, Rohan",
      );
      // The D-W3b-11 fallback is a name this device rejects, so this also
      // proves the fallback survives the alias step end to end.
      expect(greetingFor("Rohan Mehta", "", morningIst)).toBe("Good morning, Rohan");
    } finally {
      restore();
    }
  });

  it("round-trips both UTC spellings the device disagrees about", () => {
    const restore = stubHermesIos(DEVICE_REJECTS);
    try {
      for (const utc of ["UTC", "Etc/UTC"]) {
        expect(localDateTimeToUtcIso("2026-11-04", utc, 0, 0, 0), utc).toBe(
          "2026-11-04T00:00:00.000Z",
        );
      }
      expect(localDateTimeToUtcIso("2026-11-04", "Asia/Kolkata", 0, 0, 0)).toBe(
        "2026-11-03T18:30:00.000Z",
      );
    } finally {
      restore();
    }
  });

  it("names the zone rather than rendering anything, when nothing resolves", () => {
    const restore = stubHermesIos(["Asia/Kolkata", "Asia/Calcutta"]);
    try {
      expect(() => formatLocalDate(evening, "Asia/Kolkata")).toThrow(
        /"Asia\/Kolkata".*Asia\/Calcutta.*Incorrect timeZone information provided/s,
      );
    } finally {
      restore();
    }
  });
});
