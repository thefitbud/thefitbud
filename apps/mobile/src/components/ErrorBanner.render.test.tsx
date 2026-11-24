/**
 * First test on the mobile render harness (CU6). It is also the harness's own
 * regression test: if the alias, the DOM environment or the native-module
 * mocks break, this file fails before any screen test does.
 */
import { describe, expect, it, vi } from "vitest";
import * as SecureStore from "expo-secure-store";
import { USER_FACING_OFFLINE, USER_FACING_SERVER } from "@fitbud/api-client";
import { themes } from "@fitbud/ui-mobile";
import {
  MOCK_SECURE_STORE_VALUE,
  fireEvent,
  mockAuth,
  render,
  screen,
} from "../test/render";
import { ThemeScope } from "../providers/ThemeProvider";
import { ErrorBanner, isOfflineMessage } from "./ErrorBanner";
import { offlineSavedAtText } from "./OfflineBanner";

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

    // `alert` takes its name from the author, not from its content, so an
    // `accessibilityLabel` on the banner would reach react-native-web as
    // `aria-label` and a screen reader would announce that instead of the
    // message — while `textContent` above stayed green. Pin its absence, so
    // the announcement is the message.
    expect(alert.getAttribute("aria-label")).toBeNull();
    expect(alert.getAttribute("aria-labelledby")).toBeNull();
  });

  it("renders a different message without leaking the previous one", () => {
    render(<ErrorBanner message="Enter the 6-digit code." />);

    expect(screen.getByRole("alert").textContent).toBe("Enter the 6-digit code.");
    expect(screen.queryByText("That code has expired.")).toBeNull();
  });

  it("stubs the auth context on the route a screen test starts from", () => {
    // Nothing else here renders a screen yet, so this is the only guard on
    // `mockAuth`'s defaults. `route` is the one that can silently send a later
    // screen test to the wrong view: `AppRoute` is an object union, so the
    // default has to be the sign-in route object, not a bare string.
    expect(mockAuth().route).toEqual({ name: "auth" });
    expect(mockAuth({ errorMessage: "Could not reach FitBud." }).errorMessage).toBe(
      "Could not reach FitBud.",
    );
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

/*
 * Z14-2 (D-W14-9): offline is neutral. The 58 ErrorBanner call sites pass
 * `userFacingMessage(err)`, which is the offline copy for a network failure;
 * that copy now renders the neutral banner (fill, wifi-off, no alert role)
 * in both themes. A real failure (5xx) stays crit.
 */
describe("ErrorBanner offline vs crit (Z14-2, D-W14-9)", () => {
  function rgb(hex: string): string {
    const n = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16);
    return `rgba(${n(1)}, ${n(3)}, ${n(5)}, 1.00)`;
  }

  for (const scheme of ["light", "dark"] as const) {
    it(`${scheme}: the offline message is the neutral banner, not an alert`, () => {
      render(
        <ThemeScope scheme={scheme} drivesSystemBars={false}>
          <ErrorBanner message={USER_FACING_OFFLINE} />
        </ThemeScope>,
      );
      expect(screen.getByText(USER_FACING_OFFLINE)).toBeTruthy();
      expect(screen.queryByRole("alert")).toBeNull();
      const banner = screen.getByTestId("offline-banner");
      expect(window.getComputedStyle(banner).backgroundColor).toBe(
        rgb(themes[scheme].colors.fill),
      );
    });

    it(`${scheme}: a server failure stays crit, as an alert`, () => {
      render(
        <ThemeScope scheme={scheme} drivesSystemBars={false}>
          <ErrorBanner message={USER_FACING_SERVER} />
        </ThemeScope>,
      );
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toBe(USER_FACING_SERVER);
      expect(window.getComputedStyle(alert).backgroundColor).toBe(
        rgb(themes[scheme].colors.critTint),
      );
      expect(screen.queryByTestId("offline-banner")).toBeNull();
    });
  }

  it("a screen's own offline line and the offline prop are neutral too", () => {
    render(
      <>
        <ErrorBanner message="You're offline. Reconnect to load this ask." />
        <ErrorBanner message="Couldn't load this." offline />
      </>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByTestId("offline-banner")).toHaveLength(2);
    expect(isOfflineMessage("Something went wrong on our side. Try again.")).toBe(false);
    expect(isOfflineMessage("Offline. 1 meal is saved on your phone.")).toBe(true);
  });

  it("TR-06g: Couldn't refresh keeps crit with a Retry action", () => {
    const onRetry = vi.fn();
    render(
      <ErrorBanner
        message="Couldn't refresh. Showing 9:40 am."
        offline={false}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "Couldn't refresh. Showing 9:40 am.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("the offline banner names when the shown data was saved", () => {
    const savedAt = Date.parse("2026-11-14T04:10:00.000Z");
    expect(offlineSavedAtText(savedAt, "Asia/Kolkata")).toBe(
      "You're offline. Showing what was saved at 9:40 am. Logs will send when you're back.",
    );
    expect(offlineSavedAtText(null, "Asia/Kolkata")).toBe(
      "You're offline. Showing what was saved on your phone. Logs will send when you're back.",
    );
  });
});
