/** Z14-9: one bell, one unread dot, on Progress, Today and the top bar. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../test/render";
import { BellButton, bellLabel } from "./BellButton";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

describe("BellButton", () => {
  it("labels the unread count for screen readers", () => {
    expect(bellLabel(0)).toBe("Notifications");
    expect(bellLabel(3)).toBe("Notifications, 3 unread");
  });

  it("shows no dot with nothing unread", () => {
    render(<BellButton unread={0} onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
    expect(screen.queryByTestId("bell-unread-dot")).toBeNull();
  });

  it("shows the dot and opens on press when there is unread", () => {
    const onPress = vi.fn();
    render(<BellButton unread={2} onPress={onPress} />);
    expect(screen.getByTestId("bell-unread-dot")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 2 unread" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
