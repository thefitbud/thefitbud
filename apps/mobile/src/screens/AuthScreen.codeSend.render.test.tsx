/**
 * CU21: the Maestro code sign-in types the email on the password screen, then
 * taps "Sign in with a code instead" and "Send code". The 6-digit field is
 * rendered only after `startOtp` resolves. That request uses AuthScreen's
 * identifier, which the password screen used to keep to itself, so Send code
 * bailed with "Enter your mobile number or email." and the field never appeared.
 *
 * The harness is happy-dom plus react-native-web (CU6). It proves the text and
 * labels Maestro matches. It does not drive a device.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "../test/render";

const QA_EMAIL = "qa+ontrack@thefitbud.com";

const startOtp = vi.fn();

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
    login: vi.fn(),
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

function typeEmail(value: string) {
  fireEvent.change(screen.getByLabelText("Mobile number or email"), {
    target: { value },
  });
}

describe("code sign-in after typing on the password screen", () => {
  beforeEach(() => {
    startOtp.mockReset();
    startOtp.mockResolvedValue({ sent: true, channels: ["email"] });
    auth.clearError.mockClear();
  });

  it("sends the typed email and shows the 6-digit field", async () => {
    render(<AuthScreen />);

    typeEmail(QA_EMAIL);
    fireEvent.click(screen.getByRole("button", { name: "Sign in with a code instead" }));

    expect(screen.getByLabelText("Mobile number or email")).toHaveProperty("value", QA_EMAIL);
    expect(screen.queryByText("6-digit code")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    expect(startOtp).toHaveBeenCalledWith({
      identifier: QA_EMAIL,
      purpose: "login",
    });
    await waitFor(() => {
      expect(screen.getByText("6-digit code")).toBeTruthy();
    });
    expect(screen.queryByText("Enter your mobile number or email.")).toBeNull();
  });

  it("does not request a code when the email was never typed", async () => {
    render(<AuthScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Sign in with a code instead" }));
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    expect(startOtp).not.toHaveBeenCalled();
    expect(screen.getByText("Enter your mobile number or email.")).toBeTruthy();
    expect(screen.queryByText("6-digit code")).toBeNull();
  });
});
