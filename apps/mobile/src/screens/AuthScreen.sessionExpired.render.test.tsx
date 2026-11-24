/** Z12-49: TR-24, the server ended the session (refresh refused). */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../test/render";
import { SIGNED_OUT_MESSAGE } from "../auth/sessionRestore";

const auth = {
  api: {},
  signInWithToken: vi.fn(),
  errorMessage: SIGNED_OUT_MESSAGE as string | null,
  clearError: vi.fn(),
};

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

const { AuthScreen } = await import("./AuthScreen");

describe("session expired (TR-24)", () => {
  it("says why, keeps the logs, and Sign in returns to the form", () => {
    render(<AuthScreen />);
    expect(screen.getByText("Please sign in again")).toBeTruthy();
    expect(screen.getByText(/Anything you logged is still on this phone/)).toBeTruthy();
    expect(screen.queryByText("Sign in with a code instead")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(auth.clearError).toHaveBeenCalledTimes(1);
  });

  it("any other error stays on the sign-in form", () => {
    auth.errorMessage = "Couldn't reach FitBud. Check your connection and try again.";
    render(<AuthScreen />);
    expect(screen.queryByText("Please sign in again")).toBeNull();
    expect(screen.getByText("Sign in with a code instead")).toBeTruthy();
  });
});
