/**
 * Account time zone save (Z14-14): the success toast only follows a save that
 * worked; a failed or offline save restores the old zone and shows the banner.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, mockAuth, render, screen, waitFor } from "../../test/render";
import { AccountScreen } from "./AccountScreen";

const h = vi.hoisted(() => ({ auth: {} as Record<string, unknown> }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => h.auth }));

function setup(update: () => Promise<unknown>) {
  h.auth = mockAuth({
    me: { timezone: "Asia/Kolkata" },
    api: {
      getNotificationPreferences: vi.fn(async () => ({ traineeTimezone: "Asia/Kolkata" })),
      listRelationships: vi.fn(async () => ({ items: [] })),
      updateNotificationPreferences: vi.fn(update),
    },
  });
  render(
    <AccountScreen
      onBack={() => undefined}
      onOpenPassword={() => undefined}
      onOpenPrivacy={() => undefined}
      onOpenLanguage={() => undefined}
      onOpenPastCoaching={() => undefined}
    />,
  );
}

async function pickDubai() {
  fireEvent.click(await screen.findByRole("button", { name: /^Time zone/ }, { timeout: 8000 }));
  fireEvent.click(await screen.findByRole("button", { name: /^Dubai,/ }, { timeout: 8000 }));
}

describe("AccountScreen time zone save", () => {
  it("shows the set toast only after the save has finished", async () => {
    let finish: (value: unknown) => void = () => undefined;
    const update = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    setup(update);
    await pickDubai();
    // Save still pending: sub-view open, no success toast yet.
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(screen.getByTestId("time-zone")).toBeTruthy();
    expect(screen.queryByText(/Time zone set to/)).toBeNull();
    finish({});
    expect(await screen.findByText(/^Time zone set to Dubai/)).toBeTruthy();
  });

  it("restores the old zone and shows the banner when the save fails, with no success toast", async () => {
    setup(async () => {
      throw new TypeError("Network request failed");
    });
    await pickDubai();
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy(), { timeout: 8000 });
    expect(screen.queryByText(/Time zone set to/)).toBeNull();
    // Back on Account with the previous zone showing.
    expect(screen.getByText("India Standard Time")).toBeTruthy();
    expect(screen.queryByText("Gulf Standard Time")).toBeNull();
  });
});
