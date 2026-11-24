/**
 * Z12-49: sign in on v3 (TR-01a), with the inline wrong-password (TR-01e) and
 * rate-limited (TR-01f) states, and the footer links.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Linking } from "react-native";
import { fireEvent, render, screen } from "../../test/render";
import { LOGIN_RATE_COPY, WRONG_CREDENTIALS_COPY } from "../../lib/authErrors";
import { SignInScreen } from "./SignInScreen";

function renderSignIn(props: Partial<Parameters<typeof SignInScreen>[0]> = {}) {
  const onSignIn = vi.fn(async () => undefined);
  render(
    <SignInScreen
      loading={false}
      error={null}
      onSignIn={onSignIn}
      onUseCode={vi.fn()}
      onForgotPassword={vi.fn()}
      {...props}
    />,
  );
  return { onSignIn };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SignInScreen (TR-01a)", () => {
  it("has no WhatsApp card, no Have a code? and no Show password text link", () => {
    renderSignIn();
    expect(screen.queryByText(/Coming soon/)).toBeNull();
    expect(screen.queryByText("Have a code?")).toBeNull();
    expect(screen.queryByText("Show password")).toBeNull();
    // The eye inside the field toggles the password instead.
    expect(screen.getByRole("button", { name: "Show password" })).toBeTruthy();
  });

  it("Terms, Privacy and Health notice open in the app while signed out", () => {
    const openURL = vi.spyOn(Linking, "openURL").mockResolvedValue(true);
    renderSignIn();
    fireEvent.click(screen.getByRole("link", { name: "Privacy Policy, opens in the app" }));
    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeTruthy();
    expect(screen.getByTestId("legal-draft-notice").textContent).toMatch(/not yet in force/);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("link", { name: "Terms of Service, opens in the app" }));
    expect(screen.getByRole("heading", { name: "Terms of Service" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("link", { name: "Health and Fitness notice, opens in the app" }));
    expect(screen.getByRole("heading", { name: "Health and Fitness notice" })).toBeTruthy();
    expect(openURL).not.toHaveBeenCalled();
    openURL.mockRestore();
  });

  it.each([
    "Terms of Service, opens in the app",
    "Privacy Policy, opens in the app",
    "Health and Fitness notice, opens in the app",
  ])("%s is at least 44 pt tall", (name) => {
    // BT3's review found footer links that looked right but were only ~32 px
    // hittable. Assert the link's own minimum height, not the text size.
    renderSignIn();
    const link = screen.getByRole("link", { name });
    const minHeight = Number.parseFloat(window.getComputedStyle(link).minHeight);
    expect(minHeight).toBeGreaterThanOrEqual(44);
  });

  it("TR-01e: wrong password shows inline under the field, not as a banner", () => {
    renderSignIn({
      error: WRONG_CREDENTIALS_COPY,
      errorKind: "wrong-credentials",
      initialIdentifier: "98201 45678",
    });
    expect(screen.getByText("That number and password don't match.")).toBeTruthy();
    expect(screen.queryByText(WRONG_CREDENTIALS_COPY)).toBeNull();
  });

  it("an error without a proven kind stays a banner (no misleading inline text)", () => {
    renderSignIn({ error: "Couldn't reach FitBud (AUTH-NET). Check your connection and try again." });
    expect(screen.getByText(/AUTH-NET/)).toBeTruthy();
    expect(screen.queryByText("That number and password don't match.")).toBeNull();
  });

  it("TR-01f: too many tries shows the wait banner and disables Sign in", () => {
    const { onSignIn } = renderSignIn({ error: LOGIN_RATE_COPY, errorKind: "rate-limited" });
    expect(screen.getByText(LOGIN_RATE_COPY)).toBeTruthy();
    const button = screen.getByRole("button", { name: "Sign in" });
    fireEvent.click(button);
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it("password a11y label flips to Password, entered when non-empty (Maestro)", () => {
    renderSignIn();
    const field = screen.getByTestId("sign-in-password");
    expect(field.getAttribute("aria-label")).toBe("Password");
    fireEvent.change(field, { target: { value: "FitBud-demo-2026" } });
    expect(screen.getByLabelText("Password, entered")).toBeTruthy();
  });
});
