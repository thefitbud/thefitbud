/**
 * Z12-49 review (N2): after a 429 on password sign-in (TR-01f) the Sign in
 * button is disabled, and an edit to the identifier or the password brings it
 * back. Before the fix it stayed disabled until the user left the screen. An
 * edit after a wrong password (TR-01e) clears the inline text too.
 *
 * Harness: happy-dom plus react-native-web (CU6), with the same stubs as
 * `AuthScreen.identifier.render.test.tsx`. The API failure is a real
 * `ApiClientError`, classified by the production `classifyAuthError`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import { fireEvent, render, screen, waitFor } from "../test/render";
import { LOGIN_RATE_COPY } from "../lib/authErrors";

const EMAIL = "aarav.ontrack@demo.fitbud.test";

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
    startOtp: vi.fn(),
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

function apiError(status: number, code: string, message: string) {
  return new ApiClientError({ code, message, requestId: "req-1", status });
}

function signInButton(): HTMLElement {
  return screen.getByRole("button", { name: "Sign in" });
}

function isDisabled(el: HTMLElement): boolean {
  return el.getAttribute("aria-disabled") === "true" || el.hasAttribute("disabled");
}

function passwordField(): HTMLElement {
  // Filled state uses accessibilityLabel "Password, entered" for Maestro;
  // testID stays stable across empty and filled.
  return screen.getByTestId("sign-in-password");
}

function fillAndSubmit(password: string) {
  fireEvent.change(screen.getByLabelText("Mobile number or email"), {
    target: { value: EMAIL },
  });
  fireEvent.change(passwordField(), { target: { value: password } });
  fireEvent.click(signInButton());
}

beforeEach(() => {
  login.mockReset();
  auth.clearError.mockClear();
});

describe("password sign-in after a failure", () => {
  it("a 429 disables Sign in until the password is edited", async () => {
    login.mockRejectedValueOnce(apiError(429, "RATE_LIMITED", "Too many requests."));
    render(<AuthScreen />);
    fillAndSubmit("FitBud-demo-2025");

    await waitFor(() => expect(screen.getByText(LOGIN_RATE_COPY)).toBeTruthy());
    expect(isDisabled(signInButton())).toBe(true);
    fireEvent.click(signInButton());
    expect(login).toHaveBeenCalledTimes(1);

    fireEvent.change(passwordField(), {
      target: { value: "FitBud-demo-2026" },
    });
    expect(screen.queryByText(LOGIN_RATE_COPY)).toBeNull();
    expect(isDisabled(signInButton())).toBe(false);

    login.mockRejectedValueOnce(apiError(429, "RATE_LIMITED", "Too many requests."));
    fireEvent.click(signInButton());
    await waitFor(() => expect(login).toHaveBeenCalledTimes(2));
    expect(login).toHaveBeenLastCalledWith({ identifier: EMAIL, password: "FitBud-demo-2026" });
  });

  it("a 429 clears when the identifier is edited", async () => {
    login.mockRejectedValueOnce(apiError(429, "RATE_LIMITED", "Too many requests."));
    render(<AuthScreen />);
    fillAndSubmit("FitBud-demo-2025");
    await waitFor(() => expect(isDisabled(signInButton())).toBe(true));

    fireEvent.change(screen.getByLabelText("Mobile number or email"), {
      target: { value: "9876543210" },
    });
    expect(screen.queryByText(LOGIN_RATE_COPY)).toBeNull();
    expect(isDisabled(signInButton())).toBe(false);
  });

  it("an edit after a wrong password clears the inline text", async () => {
    login.mockRejectedValueOnce(
      apiError(401, "INVALID_CREDENTIALS", "Those details don't match."),
    );
    render(<AuthScreen />);
    fillAndSubmit("not-the-password-1");
    await waitFor(() =>
      expect(screen.getByText("That email and password don't match.")).toBeTruthy(),
    );

    fireEvent.change(passwordField(), { target: { value: "FitBud" } });
    expect(screen.queryByText("That email and password don't match.")).toBeNull();
  });
});
