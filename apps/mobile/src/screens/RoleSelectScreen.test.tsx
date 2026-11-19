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
    auth = mockAuth({ me: dualMe, accessToken: "tok", rememberRole: true });
  });

  it("greets by first name and remembers by default", async () => {
    render(<RoleSelectScreen />);
    expect(screen.getByText(/Karan, your account is a coach and a client/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Client. Follow your plan"));
    fireEvent.click(screen.getByText("Continue as client"));
    await waitFor(() =>
      expect(auth.selectRole as ReturnType<typeof vi.fn>).toHaveBeenCalledWith("trainee", {
        remember: true,
      }),
    );
  });

  it("Remember my choice is a checkbox that exposes its state and can be unticked (Z11-14)", async () => {
    render(<RoleSelectScreen />);
    const box = screen.getByRole("checkbox", { name: "Remember my choice" }) as HTMLElement;
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(box.getAttribute("aria-disabled")).toBeNull();

    fireEvent.click(box);
    expect(box.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByText("Continue as coach"));
    await waitFor(() =>
      expect(auth.selectRole as ReturnType<typeof vi.fn>).toHaveBeenCalledWith("trainer", {
        remember: false,
      }),
    );
  });

  it("opens unticked when the user unticked it before", () => {
    auth = mockAuth({ me: dualMe, accessToken: "tok", rememberRole: false });
    render(<RoleSelectScreen />);
    const box = screen.getByRole("checkbox", { name: "Remember my choice" }) as HTMLElement;
    expect(box.getAttribute("aria-checked")).toBe("false");
  });

  it("opened from More, starts on the role in use", async () => {
    auth = mockAuth({ me: dualMe, accessToken: "tok", selectedRole: "trainee", rememberRole: true });
    render(<RoleSelectScreen />);
    expect(
      (screen.getByLabelText("Client. Follow your plan") as HTMLElement).getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.click(screen.getByText("Continue as client"));
    await waitFor(() =>
      expect(auth.selectRole as ReturnType<typeof vi.fn>).toHaveBeenCalledWith("trainee", {
        remember: true,
      }),
    );
  });
});

describe("RoleSelectScreen Back (TM-08a, Z12-49)", () => {
  it("has no Back on first run", () => {
    auth = mockAuth({ me: dualMe, accessToken: "tok", canLeaveRoleSelect: false });
    render(<RoleSelectScreen />);
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("opened from More, Back leaves without choosing a role", () => {
    auth = mockAuth({
      me: dualMe,
      accessToken: "tok",
      selectedRole: "trainee",
      canLeaveRoleSelect: true,
      leaveRoleSelect: vi.fn(),
    });
    render(<RoleSelectScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(auth.leaveRoleSelect as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
    expect(auth.selectRole as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});

describe("SwitchRoleSheet (frame 61, TM-08c)", () => {
  it("asks, and Switch / Cancel fire their handlers", () => {
    const onSwitch = vi.fn();
    const onCancel = vi.fn();
    render(
      <SwitchRoleSheet
        visible
        targetRole="trainer"
        subject="a client's check-in"
        onSwitch={onSwitch}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText("Switch to coach view to open this?")).toBeTruthy();
    expect(
      screen.getByText("This is for a client's check-in, which you review as a coach."),
    ).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Switch to coach"));
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
    expect(screen.getByText("Email support")).toBeTruthy();
    fireEvent.click(screen.getByText("Sign out"));
    expect(auth.signOut as ReturnType<typeof vi.fn>).toHaveBeenCalled();
  });
});
