/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CodeSignInPage } from "./CodeSignInPage";

const startOtp = vi.fn();
const verifyOtp = vi.fn();
const signInWithToken = vi.fn();

vi.mock("./AuthProvider", () => ({
  AuthFlowError: class AuthFlowError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  useAuth: () => ({
    me: null,
    loading: false,
    signInWithToken,
  }),
}));

vi.mock("../lib/config", () => ({
  useConfig: () => ({
    config: { supportEmail: "tech@thefitbud.com", features: {} },
    loading: false,
    error: null,
  }),
  isWhatsAppOtpEnabled: () => false,
}));

vi.mock("../hooks/useOnline", () => ({
  useOnline: () => true,
}));

vi.mock("../lib/api", () => ({
  apiClient: {
    startOtp: (...args: unknown[]) => startOtp(...args),
    verifyOtp: (...args: unknown[]) => verifyOtp(...args),
  },
}));

vi.mock("../lib/auth-flow", () => ({
  fetchDevMailCode: vi.fn(async () => null),
}));

afterEach(() => {
  cleanup();
  startOtp.mockReset();
  verifyOtp.mockReset();
  signInWithToken.mockReset();
});

function renderCodeSignIn() {
  return render(
    <MemoryRouter initialEntries={["/sign-in/code"]}>
      <Routes>
        <Route path="/sign-in/code" element={<CodeSignInPage />} />
        <Route path="/sign-in" element={<div data-testid="password-route">password</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CodeSignInPage", () => {
  it("renders the request step with email channel and WhatsApp coming soon", () => {
    renderCodeSignIn();

    expect(screen.getByTestId("screen-TW-01-code")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sign in with a code" })).toBeTruthy();
    expect(screen.getByLabelText(/Mobile number or email/i)).toBeTruthy();
    expect(screen.getByText("Email")).toBeTruthy();
    expect(screen.getByTestId("wa-otp-coming-soon")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Use password instead" })).toBeTruthy();
  });

  it("moves to verify after sending a code", async () => {
    startOtp.mockResolvedValue({ ok: true });
    renderCodeSignIn();

    fireEvent.change(screen.getByLabelText(/Mobile number or email/i), {
      target: { value: "rahul.coach@demo.fitbud.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    await waitFor(() => {
      expect(startOtp).toHaveBeenCalledWith({
        identifier: "rahul.coach@demo.fitbud.test",
        purpose: "login",
      });
    });
    expect(
      await screen.findByText("If an account exists, we've sent a code."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Verify and sign in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Resend/i })).toBeTruthy();
  });
});
