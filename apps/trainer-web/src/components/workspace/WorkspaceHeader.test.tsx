/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ClientWorkspace } from "@fitbud/contracts";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ me: null }),
}));
vi.mock("../../lib/http-api", () => ({
  cancelReactivation: vi.fn(),
}));

import { WorkspaceHeader } from "./WorkspaceHeader";

const REL_ID = "55555555-5555-4555-8555-555555555555";

type Lifecycle = "ended" | "active" | "coaching_ready" | "onboarding_submitted";

function workspace(
  onboardingStatus: Lifecycle,
  pendingReactivation: { sentAt: string } | null = null,
): ClientWorkspace {
  return {
    header: {
      traineeDisplayName: "Kavya Menon",
      traineeProfile: { age: 31, gender: "female" },
      onboardingStatus,
      adherenceState: null,
      clientWhatsappE164: null,
      hasCustomMealTimes: false,
      goalShort: null,
      effectivePlan: null,
      startedAt: null,
      renewalState: null,
      renewsOn: null,
      pendingReactivation,
    },
    configuration: {
      configuration: {
        status: onboardingStatus === "active" || onboardingStatus === "ended"
          ? "active"
          : "draft",
      },
    },
    overview: {
      pendingReviewCheckin: null,
      openException: null,
      nextCheckin: null,
    },
  } as unknown as ClientWorkspace;
}

function renderHeader(ws: ClientWorkspace) {
  const onOpenModal = vi.fn();
  render(
    <MemoryRouter initialEntries={[`/clients/${REL_ID}/overview`]}>
      <Routes>
        <Route
          path="/clients/:relationshipId/overview"
          element={
            <WorkspaceHeader
              workspace={ws}
              relationshipId={REL_ID}
              submittedCheckinCount={0}
              onOpenModal={onOpenModal}
            />
          }
        />
        <Route
          path="/clients/:relationshipId/settings"
          element={<p>settings route</p>}
        />
        <Route
          path="/clients/:relationshipId/configure"
          element={<p>configure route</p>}
        />
      </Routes>
    </MemoryRouter>,
  );
  return { onOpenModal };
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "More actions" }));
  return screen
    .getAllByRole("menuitem")
    .map((item) => item.textContent?.trim());
}

afterEach(() => {
  cleanup();
});

describe("WorkspaceHeader ⋯ menu (CE2)", () => {
  it("ended client: configure and reminder entries are labelled view-only", () => {
    const { onOpenModal } = renderHeader(workspace("ended"));
    expect(openMenu()).toEqual([
      "Client settings",
      "View coaching setup",
      "Onboarding answers",
      "View reminder history",
    ]);
    expect(screen.queryByRole("menuitem", { name: /configure/i })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "View reminder settings" })).toBeNull();

    fireEvent.click(screen.getByRole("menuitem", { name: "View reminder history" }));
    expect(onOpenModal).toHaveBeenCalledWith({ type: "responsiveness" });

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "View coaching setup" }));
    expect(screen.getByText("configure route")).toBeTruthy();
  });

  it("ended client with a pending reactivation is labelled the same way", () => {
    renderHeader(workspace("ended", { sentAt: "2026-10-20T04:00:00.000Z" }));
    expect(openMenu()).toEqual([
      "Client settings",
      "View coaching setup",
      "Onboarding answers",
      "View reminder history",
    ]);
  });

  it.each(["active", "coaching_ready", "onboarding_submitted"] as const)(
    "%s client: Client settings first, then the actions in frame 208 order",
    (status) => {
      renderHeader(workspace(status));
      expect(openMenu()).toEqual([
        "Client settings",
        "Coaching setup",
        "Onboarding answers",
        "Reminder settings",
        "Add note",
        "End coaching…",
      ]);
    },
  );

  it.each(["active", "ended"] as const)(
    "%s client: Client settings opens the settings route",
    (status) => {
      renderHeader(workspace(status));
      openMenu();
      fireEvent.click(screen.getByRole("menuitem", { name: "Client settings" }));
      expect(screen.getByText("settings route")).toBeTruthy();
    },
  );
});

describe("WorkspaceHeader Message on WhatsApp (D-W7-7, read-only when ended)", () => {
  it("ended client: no Message on WhatsApp link or disabled button", () => {
    renderHeader(workspace("ended"));
    expect(screen.queryByText("Message on WhatsApp")).toBeNull();
  });

  it.each(["active", "coaching_ready", "onboarding_submitted"] as const)(
    "%s client: Message on WhatsApp is shown",
    (status) => {
      renderHeader(workspace(status));
      expect(screen.getByText("Message on WhatsApp")).toBeTruthy();
    },
  );
});
