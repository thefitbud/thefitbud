/**
 * The test gaps named in CU21's review verdict on #233 (Z5-21, G20).
 *
 * CU21 lifted the typed identifier from `SignInScreen` into
 * `AuthScreen.identifier`. The review passed it and listed what no committed
 * test covered:
 *
 * 1. `initialIdentifier` seeding the field when the password screen remounts
 *    (it remounts every time the mode changes back to "password").
 * 2. Reset password receiving the typed email. The reviewer checked this only
 *    with a throwaway test.
 *
 * Harness: happy-dom plus react-native-web (CU6), with the same stubs as
 * `AuthScreen.codeSend.render.test.tsx`. It proves text, labels and the
 * requests made. It does not drive a device.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "../test/render";

const QA_EMAIL = "qa+ontrack@thefitbud.com";
const EDITED_EMAIL = "qa+partial@thefitbud.com";

const startOtp = vi.fn();
const login = vi.fn();

const auth = {
  api: {},
  signInWithToken: vi.fn(),
  errorMessage: null as string | null,
  clearError: vi.fn(),
};

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});

vi.mock("../lib/stage1Api", () => ({
  stage1Api: () => ({
    startOtp,
    login,
    verifyOtp: vi.fn(),
    resetPassword: vi.fn(),
    setPassword: vi.fn(),
  }),
}));

vi.mock("../providers/ConfigProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../providers/ConfigProvider");
  return {
    ...actual,
    useConfig: () => ({ config: null, loading: false, refresh: async () => undefined }),
  };
});

const { AuthScreen } = await import("./AuthScreen");

function identifierField(): HTMLInputElement {
  return screen.getByLabelText("Mobile number or email") as HTMLInputElement;
}

function typeIdentifier(value: string) {
  fireEvent.change(identifierField(), { target: { value } });
}

beforeEach(() => {
  startOtp.mockReset();
  startOtp.mockResolvedValue({ sent: true, channels: ["email"] });
  login.mockReset();
  auth.clearError.mockClear();
});

describe("the password screen reseeds from AuthScreen.identifier on remount", () => {
  it("shows the typed email again after a round trip through code sign-in", () => {
    render(<AuthScreen />);
    typeIdentifier(QA_EMAIL);

    fireEvent.click(screen.getByRole("button", { name: "Sign in with a code instead" }));
    // The code screen is a different screen: the password field is gone.
    expect(screen.queryByLabelText("Password")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Use password instead" }));

    // A fresh SignInScreen, seeded from AuthScreen rather than empty.
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(identifierField().value).toBe(QA_EMAIL);
  });

  it("shows the email as edited on the code screen, not the one first typed", () => {
    render(<AuthScreen />);
    typeIdentifier(QA_EMAIL);
    fireEvent.click(screen.getByRole("button", { name: "Sign in with a code instead" }));

    typeIdentifier(EDITED_EMAIL);
    fireEvent.click(screen.getByRole("button", { name: "Use password instead" }));

    expect(identifierField().value).toBe(EDITED_EMAIL);
  });

  it("shows the typed email again after backing out of reset password", () => {
    render(<AuthScreen />);
    typeIdentifier(QA_EMAIL);

    fireEvent.click(screen.getByRole("button", { name: "Forgot password" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));

    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(identifierField().value).toBe(QA_EMAIL);
  });

  it("signs in with the reseeded email after the round trip", async () => {
    login.mockRejectedValue(new Error("stop here"));
    render(<AuthScreen />);
    typeIdentifier(QA_EMAIL);
    fireEvent.click(screen.getByRole("button", { name: "Sign in with a code instead" }));
    fireEvent.click(screen.getByRole("button", { name: "Use password instead" }));

    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "FitBud-demo-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        identifier: QA_EMAIL,
        password: "FitBud-demo-2026",
      });
    });
  });
});

describe("reset password uses the email typed on the password screen", () => {
  it("prefills the reset field and requests the reset code for that email", async () => {
    render(<AuthScreen />);
    typeIdentifier(QA_EMAIL);

    fireEvent.click(screen.getByRole("button", { name: "Forgot password" }));
    expect(identifierField().value).toBe(QA_EMAIL);

    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    expect(startOtp).toHaveBeenCalledWith({
      identifier: QA_EMAIL,
      purpose: "reset",
    });
    await waitFor(() => {
      expect(screen.getByText("Enter the code we sent to your email.")).toBeTruthy();
    });
  });
});
