/**
 * First test on the mobile render harness (CU6). It is also the harness's own
 * regression test: if the alias, the DOM environment or the native-module
 * mocks break, this file fails before any screen test does.
 */
import { describe, expect, it } from "vitest";
import * as SecureStore from "expo-secure-store";
import { MOCK_SECURE_STORE_VALUE, render, screen } from "../test/render";
import { ErrorBanner } from "./ErrorBanner";

describe("ErrorBanner render", () => {
  it("renders the message it is given", () => {
    render(<ErrorBanner message="Could not reach FitBud. Check your connection." />);

    expect(
      screen.getByText("Could not reach FitBud. Check your connection."),
    ).toBeTruthy();
  });

  it("announces the message as an alert", () => {
    render(<ErrorBanner message="That code has expired." />);

    // accessibilityRole="alert" on the banner reaches assistive tech as
    // role="alert"; the accessible name of an alert is its own text, which is
    // why the banner needs no separate accessibilityLabel.
    const alert = screen.getByRole("alert");
    expect(alert).toBeTruthy();
    expect(alert.textContent).toBe("That code has expired.");
  });

  it("renders a different message without leaking the previous one", () => {
    render(<ErrorBanner message="Enter the 6-digit code." />);

    expect(screen.getByRole("alert").textContent).toBe("Enter the 6-digit code.");
    expect(screen.queryByText("That code has expired.")).toBeNull();
  });

  it("has the native-module mocks from the harness in place", async () => {
    // expo-secure-store has no JS implementation off-device. Reaching the
    // harness's sentinel proves the setup file's mock is registered before a
    // component module loads — the same thing a screen test relies on when it
    // renders something that restores a session.
    await expect(SecureStore.getItemAsync("fitbud.session")).resolves.toBe(
      MOCK_SECURE_STORE_VALUE,
    );
  });
});
