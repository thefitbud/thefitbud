import { afterEach, describe, expect, it, vi } from "vitest";
import { Platform } from "react-native";
import { fireEvent, render, screen } from "../test/render";
import { HEADER_BACK_SLOT, HEADER_BACK_TARGET, HeaderBack, backLabel } from "./HeaderBack";

const realOS = Platform.OS;
afterEach(() => {
  (Platform as { OS: string }).OS = realOS;
});

describe("HeaderBack", () => {
  it("backLabel falls back to Back", () => {
    expect(backLabel("Rohan")).toBe("Rohan");
    expect(backLabel("  ")).toBe("Back");
    expect(backLabel(null)).toBe("Back");
    expect(backLabel(undefined)).toBe("Back");
  });

  it("iOS shows the chevron with the parent's name", () => {
    (Platform as { OS: string }).OS = "ios";
    const onPress = vi.fn();
    render(<HeaderBack onPress={onPress} label="Rohan" />);
    expect(screen.getByText("Rohan")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("iOS shows Back when the parent is not known", () => {
    (Platform as { OS: string }).OS = "ios";
    render(<HeaderBack onPress={() => undefined} />);
    expect(screen.getByText("Back")).toBeTruthy();
  });

  it("Android shows an arrow with no visible label, but screen readers hear Back", () => {
    (Platform as { OS: string }).OS = "android";
    render(<HeaderBack onPress={() => undefined} label="Rohan" />);
    expect(screen.queryByText("Rohan")).toBeNull();
    expect(screen.queryByText("Back")).toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  });

  it("has a target of at least 44 x 44 pt, and its slot is wide enough on both platforms", () => {
    expect(HEADER_BACK_TARGET).toBeGreaterThanOrEqual(44);
    expect(HEADER_BACK_SLOT).toBeGreaterThanOrEqual(HEADER_BACK_TARGET);
  });
});
