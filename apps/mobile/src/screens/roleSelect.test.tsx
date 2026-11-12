import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, mockAuth, render, screen, waitFor } from "../test/render";

let auth: Record<string, unknown>;
vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});
vi.mock("../providers/ConfigProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../providers/ConfigProvider");
  return {
    ...actual,
    useConfig: () => ({ config: null, loading: false, refresh: async () => undefined }),
  };
});

const { RoleSelectScreen, SwitchRoleSheet } = await import("./RoleSelectScreen");
const { UnsupportedRoleScreen } = await import("./UnsupportedRoleScreen");

const dualMe = {
  userId: "11111111-1111-4111-8111-111111111111",
  permittedRoles: ["trainer", "trainee"],
  trainerProfile: { displayName: "Karan Shah", whatsappE164: null },
};

describe("RoleSelectScreen (frame 59)", () => {
  beforeEach(() => {
    auth = mockAuth({ me: dualMe, accessToken: "tok" });
  });

  it("greets by first name and remembers by default", async () => {
    render(<RoleSelectScreen />);
    expect(screen.getByText(/Karan, your account has both/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Client. Follow your plan"));
    fireEvent.click(screen.getByText("Continue"));
    await waitFor(() =>
      expect(auth.selectRole as ReturnType<typeof vi.fn>).toHaveBeenCalledWith("trainee"),
    );
  });

  it("shows Remember my choice ticked and disabled", () => {
    render(<RoleSelectScreen />);
    expect((screen.getByLabelText("Remember my choice") as HTMLElement).getAttribute("aria-disabled")).toBe("true");
  });
});

describe("SwitchRoleSheet (frame 61)", () => {
  it("asks, and Switch / Cancel fire their handlers", () => {
    const onSwitch = vi.fn();
    const onCancel = vi.fn();
    render(
      <SwitchRoleSheet
        visible
        targetRole="trainer"
        subject="Rohan Mehta's check-in"
        onSwitch={onSwitch}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText("Switch to coach view to open this?")).toBeTruthy();
    expect(
      screen.getByText("This link is for Rohan Mehta's check-in, which you review as a coach."),
    ).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Switch"));
    fireEvent.click(screen.getByLabelText("Cancel"));
    expect(onSwitch).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("UnsupportedRoleScreen (frame 60)", () => {
  it("offers support email and Sign out", () => {
    auth = mockAuth({ me: { ...dualMe, permittedRoles: ["admin"] } });
    render(<UnsupportedRoleScreen />);
    expect(screen.getByText("This account can't use the app yet")).toBeTruthy();
    expect(screen.getByText("Email FitBud support")).toBeTruthy();
    fireEvent.click(screen.getByText("Sign out"));
    expect(auth.signOut as ReturnType<typeof vi.fn>).toHaveBeenCalled();
  });
});
