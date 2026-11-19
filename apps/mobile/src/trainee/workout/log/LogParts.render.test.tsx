/**
 * Z12-45 must-fix #3: the offline nav line must show in full (no
 * numberOfLines={1} truncation in the squeezed title column).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../../../test/render";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const { LogNav, OFFLINE_NAV_LINE } = await import("./LogParts");

describe("LogNav offline line (W-20)", () => {
  it("renders the full Offline · sets save on your phone string", () => {
    render(
      <LogNav
        title="Lower body B"
        subtitle="From Rahul’s plan"
        offline
        paused={false}
        onMinimise={() => undefined}
        onPauseToggle={() => undefined}
        onFinish={() => undefined}
      />,
    );
    expect(OFFLINE_NAV_LINE).toBe("Offline · sets save on your phone");
    const line = screen.getByText((_, node) => {
      if (!node || node.children.length === 0) return false;
      return (node.textContent ?? "").replace(/\s+/g, " ").trim() === OFFLINE_NAV_LINE;
    });
    expect(line).toBeTruthy();
    expect(screen.queryByText("From Rahul’s plan")).toBeNull();
  });
});
