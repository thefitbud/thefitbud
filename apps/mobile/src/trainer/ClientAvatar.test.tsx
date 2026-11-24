import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../test/render";
import {
  CLIENT_LINK_MIN_TARGET,
  ClientAvatar,
  ClientNameLink,
  clientLinkHitSlop,
} from "./ClientAvatar";

describe("ClientAvatar", () => {
  it("is a button labelled with the client's name that calls onPress", () => {
    const onPress = vi.fn();
    render(<ClientAvatar name="Rohan Mehta" onPress={onPress} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Rohan Mehta's profile" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText("RM")).toBeTruthy();
  });

  it("is plain, not a button, without onPress", () => {
    render(<ClientAvatar name="Rohan Mehta" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("RM")).toBeTruthy();
  });

  it("every size reaches a 44 pt target", () => {
    for (const size of [40, 48, 56, 64]) {
      const slop = clientLinkHitSlop(size);
      expect(size + slop.left + slop.right).toBeGreaterThanOrEqual(CLIENT_LINK_MIN_TARGET);
      expect(size + slop.top + slop.bottom).toBeGreaterThanOrEqual(CLIENT_LINK_MIN_TARGET);
    }
  });

  it("the name link opens the profile too, and is plain without onPress", () => {
    const onPress = vi.fn();
    const { rerender } = render(
      <ClientNameLink name="Rohan Mehta" onPress={onPress}>
        Rohan Mehta
      </ClientNameLink>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Rohan Mehta's profile" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(<ClientNameLink name="Rohan Mehta">Rohan Mehta</ClientNameLink>);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
