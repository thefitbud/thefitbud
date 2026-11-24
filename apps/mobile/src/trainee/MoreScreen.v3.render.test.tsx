/**
 * Z12-49: trainee More on v3 (TR-20a, TM-08d) and the unsent sign-out sheet
 * (TR-20f). Text, roles and handlers through react-native-web; the layout is
 * graded in docs/qa/Z12-49.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Linking } from "react-native";
import { fireEvent, mockAuth, render, screen, waitFor } from "../test/render";

let auth: Record<string, unknown>;
const outbox: { status: string }[] = [];
const sendNow = vi.fn(async () => ({ sent: 0 }));

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});
vi.mock("../providers/ConfigProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../providers/ConfigProvider");
  return {
    ...actual,
    useConfig: () => ({ config: { flags: { steps: true } }, loading: false, refresh: async () => undefined }),
  };
});
vi.mock("../lib/config", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../lib/config");
  return { ...actual, isStepsEnabled: () => true };
});
vi.mock("../sync/SyncProvider", () => ({
  useSyncEngine: () => ({
    store: { listOutbox: async () => outbox },
    sendNow,
  }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { version: "1.0.0", ios: { buildNumber: "214" } } },
}));

const { MoreScreen } = await import("./MoreScreen");

const relationship = {
  id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
  status: "active",
  onboardingStatus: "coaching_ready",
  startedAt: "2026-10-01T04:30:00.000Z",
  endedAt: null,
  trainerDisplayName: "Rahul Verma",
  trainerWhatsappE164: "+919820145678",
} as never;

const traineeMe = {
  userId: "7a2d4c1e-5b3f-4d6a-9e8c-2f1a0b9c8d7e",
  email: "aarav.ontrack@demo.fitbud.test",
  timezone: "Asia/Kolkata",
  permittedRoles: ["trainee"],
};

describe("trainee More (TR-20a)", () => {
  beforeEach(() => {
    outbox.length = 0;
    sendNow.mockClear();
    auth = mockAuth({
      me: traineeMe,
      selectedRole: "trainee",
      api: { getTraineeProfile: async () => ({ displayName: "Aarav Sharma", gender: null }) },
    });
  });

  it("shows the profile, the coach and the four settings rows", async () => {
    const open = vi.fn();
    render(<MoreScreen relationship={relationship} onOpenOverlay={open} />);
    expect(await screen.findByText("Aarav Sharma")).toBeTruthy();
    expect(screen.getByText("Coached by Rahul Verma")).toBeTruthy();
    for (const [label, overlay] of [
      ["Reminders", "reminder_settings"],
      ["Steps", "steps_settings"],
      ["Account", "account"],
      ["Help", "help"],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(open).toHaveBeenLastCalledWith({ screen: overlay });
    }
    fireEvent.click(screen.getByRole("button", { name: /^Profile/ }));
    expect(open).toHaveBeenLastCalledWith({ screen: "profile" });
    // No old rows on the root (Z12-25 lock-screen widget, Z12-49 layout).
    expect(screen.queryByText("Lock-screen widget")).toBeNull();
    expect(screen.queryByText("Switch to coach view")).toBeNull();
  });

  it("the chat button opens a WhatsApp draft the trainee sends", async () => {
    const openURL = vi.spyOn(Linking, "openURL").mockResolvedValue(true);
    render(<MoreScreen relationship={relationship} onOpenOverlay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Message Rahul on WhatsApp" }));
    await waitFor(() => expect(openURL).toHaveBeenCalled());
    expect(String(openURL.mock.calls[0]![0])).toContain("wa.me/919820145678");
    openURL.mockRestore();
  });

  it("footer links open the documents inside the app, with no browser", () => {
    const openURL = vi.spyOn(Linking, "openURL").mockResolvedValue(true);
    render(<MoreScreen relationship={relationship} onOpenOverlay={vi.fn()} />);
    expect(screen.getByText(/FitBud 1\.0\.0 \(214\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Terms of Service, opens in the app" }));
    expect(screen.getByRole("heading", { name: "Terms of Service" })).toBeTruthy();
    expect(screen.getByTestId("legal-draft-notice").textContent).toMatch(/not yet in force/);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("link", { name: "Privacy Policy, opens in the app" }));
    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeTruthy();
    expect(openURL).not.toHaveBeenCalled();
    openURL.mockRestore();
  });

  it("the Legal link lists every document, Credits included, and Back returns to the list", () => {
    render(<MoreScreen relationship={relationship} onOpenOverlay={vi.fn()} />);
    fireEvent.click(screen.getByRole("link", { name: "All legal documents, opens in the app" }));
    for (const title of [
      "Privacy Policy",
      "Terms of Service",
      "Trainer Terms",
      "Trainee Terms",
      "Health and Fitness notice",
      "Acceptable Use Policy",
      "Beta Terms",
      "Credits and licences",
    ]) {
      expect(screen.getByRole("button", { name: title })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "Credits and licences" }));
    expect(screen.getByRole("heading", { name: "Credits and licences" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("legal-index")).toBeTruthy();
  });

  it("signs out at once when nothing is waiting", async () => {
    render(<MoreScreen relationship={relationship} onOpenOverlay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
  });

  it("TR-20f: asks first when logs are unsent; Cancel keeps the session", async () => {
    outbox.push({ status: "pending" }, { status: "rejected" });
    render(<MoreScreen relationship={relationship} onOpenOverlay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("2 items aren't sent yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(screen.queryByText("2 items aren't sent yet")).toBeNull();
  });

  it("TR-20f: Send first tries to send and keeps the sheet while rows remain", async () => {
    outbox.push({ status: "pending" });
    render(<MoreScreen relationship={relationship} onOpenOverlay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByText("1 item isn't sent yet");
    fireEvent.click(screen.getByRole("button", { name: "Send first" }));
    await waitFor(() => expect(sendNow).toHaveBeenCalledTimes(1));
    expect(auth.signOut).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sign out anyway" }));
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });
});

describe("dual account More (TM-08d)", () => {
  it("shows Switch to coach view, which asks before switching", async () => {
    auth = mockAuth({
      me: { ...traineeMe, permittedRoles: ["trainer", "trainee"] },
      selectedRole: "trainee",
      api: { getTraineeProfile: async () => ({ displayName: "Karan Malhotra", gender: null }) },
    });
    render(<MoreScreen relationship={relationship} onOpenOverlay={vi.fn()} />);
    expect(await screen.findByText("Client of Rahul · also a coach")).toBeTruthy();
    expect(screen.queryByText("Coached by Rahul Verma")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Switch to coach view" }));
    expect(screen.getByText("Switch to coach view?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Switch to coach" }));
    await waitFor(() => expect(auth.selectRole).toHaveBeenCalledWith("trainer"));
  });
});
