/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SignInPage } from "./SignInPage";

const signInWithPassword = vi.fn();
const signInDevTest = vi.fn();

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
    signInWithPassword,
    signInDevTest,
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

afterEach(() => {
  cleanup();
  signInWithPassword.mockReset();
  signInDevTest.mockReset();
});

function renderSignIn(path = "/sign-in") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-in/code" element={<div data-testid="code-route">code</div>} />
        <Route path="/forgot-password" element={<div data-testid="forgot-route">forgot</div>} />
        <Route path="/privacy" element={<div data-testid="privacy-route">privacy</div>} />
        <Route path="/terms" element={<div data-testid="terms-route">terms</div>} />
        <Route path="/credits" element={<div data-testid="credits-route">credits</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function passwordInput(): HTMLInputElement {
  return document.querySelector('input[name="password"]') as HTMLInputElement;
}

function identifierInput(): HTMLInputElement {
  return document.querySelector('input[name="username"]') as HTMLInputElement;
}

describe("SignInPage", () => {
  it("renders password sign-in controls and DS5 legal footer", () => {
    renderSignIn();

    expect(screen.getByTestId("screen-TW-01")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Welcome back, coach" })).toBeTruthy();
    expect(identifierInput()).toBeTruthy();
    expect(passwordInput()).toBeTruthy();
    expect(screen.getByTestId("sign-in-submit")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Sign in with a code instead/i }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Legal" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Terms" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Credits and licences" })).toBeTruthy();
  });

  it("toggles password visibility", () => {
    renderSignIn();
    const password = passwordInput();
    expect(password.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password.type).toBe("password");
  });

  it("submits email and password to signInWithPassword", async () => {
    signInWithPassword.mockResolvedValue(undefined);
    renderSignIn();

    fireEvent.change(identifierInput(), {
      target: { value: "rahul.coach@demo.fitbud.test" },
    });
    fireEvent.change(passwordInput(), {
      target: { value: "FitBud-demo-2026" },
    });
    fireEvent.click(screen.getByTestId("sign-in-submit"));

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith(
        "rahul.coach@demo.fitbud.test",
        "FitBud-demo-2026",
      );
    });
  });

  it("shows the +91 hint when the identifier looks like a mobile", () => {
    renderSignIn();
    fireEvent.change(identifierInput(), {
      target: { value: "9876543210" },
    });
    expect(
      screen.getByText("+91 prefix applied for Indian mobiles"),
    ).toBeTruthy();
  });
});
