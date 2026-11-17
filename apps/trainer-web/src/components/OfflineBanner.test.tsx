/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const onlineState = vi.hoisted(() => ({ value: false }));

vi.mock("../hooks/useOnline", () => ({
  useOnline: () => onlineState.value,
}));

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    me: { timezone: "Asia/Kolkata" },
  }),
}));

import { OfflineBanner } from "./OfflineBanner";

afterEach(() => {
  cleanup();
  onlineState.value = false;
});

describe("OfflineBanner", () => {
  it("is hidden while online", () => {
    onlineState.value = true;
    const { container } = render(<OfflineBanner />);
    expect(container.querySelector("[data-testid='offline-banner']")).toBeNull();
  });

  it("shows icon and loaded-at copy while offline", () => {
    onlineState.value = false;
    render(
      <OfflineBanner loadedAt="2026-10-18T04:08:00.000Z" />,
    );
    const banner = screen.getByTestId("offline-banner");
    expect(banner.textContent).toMatch(/you're offline/i);
    expect(banner.textContent).toMatch(/showing what was loaded at/i);
    expect(banner.textContent).toMatch(/changes can't be saved until you're back online/i);
    // 04:08 UTC → 9:38 am IST
    expect(banner.textContent).toMatch(/9:38 am/i);
  });
});
