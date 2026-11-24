/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { LEGAL_NAV } from "./content";

// Z14-27: Settings → Help → Legal and Privacy and data link to the public pages.
vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    me: {
      userId: "trainer-user-1",
      email: "rahul.coach@demo.fitbud.test",
      timezone: "Asia/Kolkata",
      permittedRoles: ["trainer"],
    },
    finishAccountDeletion: vi.fn(),
    loading: false,
  }),
}));
vi.mock("../../lib/stage1-api", () => ({ stage1Api: { login: vi.fn() } }));
vi.mock("../../lib/config", () => ({
  useConfig: () => ({ config: { supportEmail: "tech@thefitbud.com" } }),
}));

const { SettingsHelpPage } = await import("../settings/SettingsHelpPage");
const { PrivacyDataPage } = await import("../settings/PrivacyDataPage");

afterEach(cleanup);

describe("Settings → Help → Legal", () => {
  it("links to every public legal page", () => {
    render(
      <MemoryRouter>
        <SettingsHelpPage />
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: "Legal" });
    expect(LEGAL_NAV).toHaveLength(8);
    for (const item of LEGAL_NAV) {
      expect(within(nav).getByRole("link", { name: item.label }).getAttribute("href")).toBe(item.path);
    }
  });
});

describe("Privacy and data", () => {
  it("points to the public policy and drops the stale 'legal review' line", () => {
    render(
      <MemoryRouter>
        <PrivacyDataPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("/privacy");
    expect(
      screen.getByRole("link", { name: "how deleting your account works" }).getAttribute("href"),
    ).toBe("/privacy#delete-account");
    expect(screen.getByRole("link", { name: "Terms of Service" }).getAttribute("href")).toBe("/terms");
    expect(document.body.textContent).not.toMatch(/legal review|finalised/i);
    // The in-app delete button is there, so no page may say there is none.
    expect(screen.getByTestId("delete-account-open")).toBeTruthy();
  });
});
