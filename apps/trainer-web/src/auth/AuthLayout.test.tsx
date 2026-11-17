/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";

vi.mock("../lib/config", () => ({
  useConfig: () => ({
    config: { supportEmail: "tech@thefitbud.com" },
    loading: false,
    error: null,
  }),
}));

afterEach(() => {
  cleanup();
});

describe("AuthLayout", () => {
  it("renders the form title, lead, and help mailto", () => {
    render(
      <MemoryRouter>
        <AuthLayout title="Welcome back, coach" screenTestId="screen-TW-01">
          <p>form body</p>
        </AuthLayout>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("screen-TW-01")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Welcome back, coach" })).toBeTruthy();
    expect(screen.getByText("Sign in to your FitBud workspace.")).toBeTruthy();
    expect(screen.getByText("form body")).toBeTruthy();

    const help = screen.getByRole("link", { name: "Need help?" });
    expect(help.getAttribute("href")).toContain("mailto:tech@thefitbud.com");
  });

  it("shows hero glimpse chips with icons when showGlimpse is on", () => {
    const { container } = render(
      <MemoryRouter>
        <AuthLayout title="Welcome back, coach" showGlimpse>
          <span />
        </AuthLayout>
      </MemoryRouter>,
    );

    expect(container.querySelector(".auth-glimpse .chip.crit svg")).toBeTruthy();
    expect(container.querySelector(".auth-glimpse .chip.attn svg")).toBeTruthy();
    expect(container.querySelector(".auth-glimpse .chip.info svg")).toBeTruthy();
    expect(container.textContent).toContain("Critical");
    expect(container.textContent).toContain("Attention");
    expect(container.textContent).toContain("To review");
  });

  it("hides the glimpse when showGlimpse is false", () => {
    const { container } = render(
      <MemoryRouter>
        <AuthLayout title="Client account" lead="" showGlimpse={false}>
          <span />
        </AuthLayout>
      </MemoryRouter>,
    );
    expect(container.querySelector(".auth-glimpse")).toBeNull();
  });

  it("renders an optional legal footer below the help line", () => {
    render(
      <MemoryRouter>
        <AuthLayout
          title="Welcome back, coach"
          footer={
            <nav className="auth-legal-links" aria-label="Legal">
              <a href="/legal/privacy">Privacy</a>
            </nav>
          }
        >
          <span />
        </AuthLayout>
      </MemoryRouter>,
    );
    expect(screen.getByRole("navigation", { name: "Legal" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy" })).toBeTruthy();
  });
});
