/** Z14-36: the tab bar is not rendered while a section's See all page is open. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, mockAuth, render, screen } from "../test/render";

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => mockAuth({ api: {}, relationships: [], me: { timezone: "Asia/Kolkata" } }),
}));
vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));
vi.mock("./AttentionTab", () => ({
  AttentionTab: (p: { onFullScreenChange?: (open: boolean) => void }) => (
    <div data-testid="attention-tab">
      <button onClick={() => p.onFullScreenChange?.(true)}>open-see-all</button>
      <button onClick={() => p.onFullScreenChange?.(false)}>close-see-all</button>
    </div>
  ),
}));
vi.mock("./ClientsTab", () => ({ ClientsTab: () => <div data-testid="clients-tab" /> }));
vi.mock("./CheckinsTab", () => ({ CheckinsTab: () => <div data-testid="checkins-tab" /> }));
vi.mock("./MoreScreen", () => ({ TrainerMoreScreen: () => <div /> }));

const { TrainerShell } = await import("./TrainerShell");

describe("TrainerShell tab bar and See all", () => {
  it("shows the tab bar on Attention, Clients and Check-ins with no See all open", () => {
    render(<TrainerShell />);
    for (const label of ["Attention", "Clients", "Check-ins"]) {
      fireEvent.click(screen.getByLabelText(label));
      expect(screen.getByRole("tablist")).toBeTruthy();
      expect(screen.getByTestId("tab-attention")).toBeTruthy();
    }
  });

  it("does not render the tab bar while See all is open, and restores it on close", () => {
    render(<TrainerShell />);
    expect(screen.getByRole("tablist")).toBeTruthy();
    fireEvent.click(screen.getByText("open-see-all"));
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByTestId("tab-attention")).toBeNull();
    fireEvent.click(screen.getByText("close-see-all"));
    expect(screen.getByRole("tablist")).toBeTruthy();
    // Attention was never unmounted, so its section and scroll are kept.
    expect(screen.getByTestId("attention-tab")).toBeTruthy();
  });
});
