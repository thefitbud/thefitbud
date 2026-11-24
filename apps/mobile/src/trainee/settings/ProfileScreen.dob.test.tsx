/** Z14-9: date of birth comes from the native picker; the saved value is unchanged. */
import { describe, expect, it, vi } from "vitest";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));
vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
  DateTimePickerAndroid: { open: vi.fn() },
}));

const { inputSelectionProps } = await import("../../components/Field");
const { BIRTH_DATE_MIN, birthDateFromIso, birthDateIso, birthDateLabel } = await import("./ProfileScreen");

describe("date of birth", () => {
  it("a picked day saves as the same ISO value as before and reads '12 Mar 1994'", () => {
    const picked = new Date(1994, 2, 12, 23, 59);
    expect(birthDateIso(picked)).toBe("1994-03-12");
    expect(birthDateLabel(birthDateIso(picked))).toBe("12 Mar 1994");
  });
  it("round-trips a stored value into the picker's start date", () => {
    const d = birthDateFromIso("1994-03-12")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([1994, 2, 12]);
    expect(birthDateFromIso("")).toBeNull();
    expect(birthDateFromIso(null)).toBeNull();
  });
  it("offers dates from 1 Jan 1920", () => {
    expect(birthDateIso(BIRTH_DATE_MIN)).toBe("1920-01-01");
  });
});

describe("inputSelectionProps", () => {
  const colors = { brand: "#2B2B6B", brandTint2: "#D9D7EA" };
  it("Android: light highlight, brand cursor and handles", () => {
    expect(inputSelectionProps(colors, "android")).toEqual({
      selectionColor: "#D9D7EA",
      cursorColor: "#2B2B6B",
      selectionHandleColor: "#2B2B6B",
    });
  });
  it("iOS is unchanged: brand selection colour", () => {
    expect(inputSelectionProps(colors, "ios").selectionColor).toBe("#2B2B6B");
  });
});
