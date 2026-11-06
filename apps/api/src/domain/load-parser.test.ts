import { describe, expect, it } from "vitest";
import {
  isBlankLoadLabel,
  parseLoadLabel,
  resolveSetLoad,
  type ParsedLoad,
} from "./load-parser.js";

const kg = (value: number): ParsedLoad => ({ kind: "kg", kg: value });
const plus = (value: number): ParsedLoad => ({ kind: "bodyweight_plus", kg: value });
const BODYWEIGHT: ParsedLoad = { kind: "bodyweight", kg: null };
const TEXT: ParsedLoad = { kind: "text", kg: null };

describe("parseLoadLabel", () => {
  // Labels a trainer or trainee types; no exercise default unit.
  const cases: Array<[label: string | null | undefined, expected: ParsedLoad]> = [
    // kg
    ["40 kg", kg(40)],
    ["60kg", kg(60)],
    ["40 KG", kg(40)],
    ["40 Kg", kg(40)],
    ["40 kgs", kg(40)],
    ["40KGS", kg(40)],
    ["  40   kg  ", kg(40)],
    ["40\tkg", kg(40)],
    ["42.5 kg", kg(42.5)],
    ["42,5 kg", kg(42.5)],
    ["22.25 kg", kg(22.25)],
    ["2,25kg", kg(2.25)],
    ["12.5 kilos", kg(12.5)],
    ["20 kilo", kg(20)],
    ["100 kilograms", kg(100)],
    ["1 kilogram", kg(1)],
    ["0 kg", kg(0)],
    ["1250 kg", kg(1250)],
    // pounds, converted and rounded to 2 decimals
    ["90 lb", kg(40.82)],
    ["90 lbs", kg(40.82)],
    ["90LBS", kg(40.82)],
    ["45 pounds", kg(20.41)],
    ["1 pound", kg(0.45)],
    ["22.5 lb", kg(10.21)],
    ["100,5 lb", kg(45.59)],
    // bodyweight
    ["Bodyweight", BODYWEIGHT],
    ["bodyweight", BODYWEIGHT],
    ["BW", BODYWEIGHT],
    ["bw", BODYWEIGHT],
    ["Body weight", BODYWEIGHT],
    [" BW ", BODYWEIGHT],
    // bodyweight plus an added load
    ["BW+10", plus(10)],
    ["BW + 10", plus(10)],
    ["bw+10kg", plus(10)],
    ["BW + 7.5 kg", plus(7.5)],
    ["Bodyweight + 20 kg", plus(20)],
    ["BW+2,5 KGS", plus(2.5)],
    ["BW + 25 lb", plus(11.34)],
    // text: never guessed
    ["RPE 7", TEXT],
    ["easy", TEXT],
    ["Moderate", TEXT],
    ["Light band", TEXT],
    ["40", TEXT],
    ["40.5", TEXT],
    ["2x20 kg", TEXT],
    ["20 kg each", TEXT],
    ["20 kg/hand", TEXT],
    ["40-50 kg", TEXT],
    ["40, 45 kg", TEXT],
    ["40,45,50 kg", TEXT],
    ["1,000 kg", TEXT],
    ["4 0 kg", TEXT],
    ["40 .5 kg", TEXT],
    ["42.5.0 kg", TEXT],
    ["42.555 kg", TEXT],
    [".5 kg", TEXT],
    ["40. kg", TEXT],
    ["-5 kg", TEXT],
    ["+10 kg", TEXT],
    ["12345 kg", TEXT],
    ["40 kgkg", TEXT],
    ["kg", TEXT],
    ["BW-10", TEXT],
    ["BW+", TEXT],
    ["BW+easy", TEXT],
    ["BW++10", TEXT],
    ["BW+10 reps", TEXT],
    ["Body-weight", TEXT],
    ["40 ｋｇ", TEXT],
    ["40 kg", TEXT],
    ["", TEXT],
    ["   ", TEXT],
    [null, TEXT],
    [undefined, TEXT],
  ];

  it.each(cases)("parses %j", (label, expected) => {
    expect(parseLoadLabel(label)).toEqual(expected);
  });

  it("reads a bare number in the exercise's default unit only when one is given", () => {
    expect(parseLoadLabel("40")).toEqual(TEXT);
    expect(parseLoadLabel("40", { bareNumberUnit: "kg" })).toEqual(kg(40));
    expect(parseLoadLabel("42,5", { bareNumberUnit: "kg" })).toEqual(kg(42.5));
    expect(parseLoadLabel("90", { bareNumberUnit: "lb" })).toEqual(kg(40.82));
    // An explicit unit wins over the default.
    expect(parseLoadLabel("90 lb", { bareNumberUnit: "kg" })).toEqual(kg(40.82));
    // The default never turns words into numbers.
    expect(parseLoadLabel("RPE 7", { bareNumberUnit: "kg" })).toEqual(TEXT);
    expect(parseLoadLabel("BW", { bareNumberUnit: "kg" })).toEqual(BODYWEIGHT);
    // "BW+10" always reads kg.
    expect(parseLoadLabel("BW+10", { bareNumberUnit: "lb" })).toEqual(plus(10));
  });

  it("returns kg with at most 2 decimals for every pound value up to 500 lb", () => {
    for (let h = 0; h <= 50_000; h += 25) {
      const label = `${(h / 100).toFixed(2)} lb`;
      const parsed = parseLoadLabel(label);
      expect(parsed.kind).toBe("kg");
      expect(parsed.kg).not.toBeNull();
      expect(Math.abs(parsed.kg! * 100 - Math.round(parsed.kg! * 100))).toBeLessThan(1e-6);
      expect(Math.abs(parsed.kg! - (h / 100) * 0.45359237)).toBeLessThanOrEqual(0.005 + 1e-9);
    }
  });
});

describe("isBlankLoadLabel", () => {
  it("treats null, empty and whitespace-only labels as blank", () => {
    expect(isBlankLoadLabel(null)).toBe(true);
    expect(isBlankLoadLabel(undefined)).toBe(true);
    expect(isBlankLoadLabel("")).toBe(true);
    expect(isBlankLoadLabel(" \t\n ")).toBe(true);
    expect(isBlankLoadLabel("easy")).toBe(false);
  });
});

describe("resolveSetLoad", () => {
  it("fills both kg columns and takes the kind from the logged label", () => {
    expect(
      resolveSetLoad({ prescribedLoadLabel: "40 kg", actualLoadLabel: "42.5 kg" }),
    ).toEqual({ prescribedLoadKg: 40, actualLoadKg: 42.5, loadKind: "kg" });
    expect(
      resolveSetLoad({ prescribedLoadLabel: "40 kg", actualLoadLabel: "BW" }),
    ).toEqual({ prescribedLoadKg: 40, actualLoadKg: null, loadKind: "bodyweight" });
    expect(
      resolveSetLoad({ prescribedLoadLabel: "Bodyweight", actualLoadLabel: "BW+10" }),
    ).toEqual({ prescribedLoadKg: null, actualLoadKg: 10, loadKind: "bodyweight_plus" });
  });

  it("uses the prescribed kind until a load is logged", () => {
    expect(
      resolveSetLoad({ prescribedLoadLabel: "40 kg", actualLoadLabel: null }),
    ).toEqual({ prescribedLoadKg: 40, actualLoadKg: null, loadKind: "kg" });
    expect(
      resolveSetLoad({ prescribedLoadLabel: "Bodyweight", actualLoadLabel: "  " }),
    ).toEqual({ prescribedLoadKg: null, actualLoadKg: null, loadKind: "bodyweight" });
  });

  it("keeps an unparseable logged label as text instead of falling back", () => {
    expect(
      resolveSetLoad({ prescribedLoadLabel: "40 kg", actualLoadLabel: "a bit heavier" }),
    ).toEqual({ prescribedLoadKg: 40, actualLoadKg: null, loadKind: "text" });
  });

  it("is text with no kg when neither label is set", () => {
    expect(
      resolveSetLoad({ prescribedLoadLabel: null, actualLoadLabel: null }),
    ).toEqual({ prescribedLoadKg: null, actualLoadKg: null, loadKind: "text" });
  });

  it("passes the exercise default unit to both labels", () => {
    expect(
      resolveSetLoad(
        { prescribedLoadLabel: "40", actualLoadLabel: "45" },
        { bareNumberUnit: "kg" },
      ),
    ).toEqual({ prescribedLoadKg: 40, actualLoadKg: 45, loadKind: "kg" });
  });
});
