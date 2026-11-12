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
  headerOverrides: Record<string, unknown> = {},
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
      ...headerOverrides,
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
  // Accessible names: rich items carry their label as aria-label and the
  // description as aria-describedby.
  return screen
    .getAllByRole("menuitem")
    .map((item) => item.getAttribute("aria-label") ?? item.textContent?.trim());
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
        "End coaching…",
      ]);
      expect(screen.queryByRole("menuitem", { name: /Add note/i })).toBeNull();
    },
  );

  it("active client: frame 208 icons, descriptions and a divider before End coaching", () => {
    renderHeader(workspace("active"));
    openMenu();
    const menu = screen.getByRole("menu");
    expect(menu.classList.contains("overflow-menu-list-wide")).toBe(true);
    const settings = screen.getByRole("menuitem", { name: "Client settings" });
    const settingsDesc = document.getElementById(
      settings.getAttribute("aria-describedby") ?? "",
    );
    expect(settingsDesc?.textContent).toBe("Basic details, subscription & package");
    const setup = screen.getByRole("menuitem", { name: "Coaching setup" });
    expect(
      document.getElementById(setup.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toBe("Goal, expectations, check-ins, reminders");
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item.querySelector(".overflow-menu-item-icon svg")).not.toBeNull();
    }
    const separators = screen.getAllByRole("separator");
    expect(separators).toHaveLength(1);
    expect(separators[0]?.nextElementSibling?.textContent).toBe("End coaching…");
  });

  it("ended client: no divider and no End coaching", () => {
    renderHeader(workspace("ended"));
    openMenu();
    expect(screen.queryAllByRole("separator")).toHaveLength(0);
    expect(screen.queryByRole("menuitem", { name: /End coaching/i })).toBeNull();
  });

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

describe("WorkspaceHeader ended state (frame 179)", () => {
  const ENDED = {
    startedAt: "2026-07-06T04:30:00.000Z",
    endedAt: "2026-10-03T12:00:00.000Z",
    traineeTimezone: "Asia/Kolkata",
    adherenceState: "needs_attention",
    goalShort: "Lose 4 kg",
    effectivePlan: { title: "Fat loss" },
    renewalState: "expired",
    renewsOn: "2026-10-01",
  };

  it("shows the Ended · date pill, coached dates and Reactivate; no banner or adherence chip", () => {
    const { onOpenModal } = renderHeader(workspace("ended", null, ENDED));
    const pill = document.querySelector('.status-chip[data-kind="lifecycle"]');
    expect(pill?.textContent).toMatch(/^Ended · Sat 3 Oct( 2026)?$/);
    expect(document.querySelector('.status-chip[data-kind="adherence"]')).toBeNull();
    expect(screen.queryByText(/Needs attention|Not available/)).toBeNull();
    expect(screen.getByText(/^Coached Mon 6 Jul( 2026)? — Sat 3 Oct( 2026)?$/)).toBeTruthy();
    expect(screen.getByText("Lose 4 kg")).toBeTruthy();
    // Frame 179 meta: no plan link, renewal chip or week number when ended.
    expect(screen.queryByRole("link", { name: "Fat loss" })).toBeNull();
    expect(document.querySelector('.status-chip[data-kind="renewal"]')).toBeNull();
    expect(screen.queryByText(/^Week \d+/)).toBeNull();

    expect(screen.queryByText(/Coaching ended/)).toBeNull();
    expect(document.querySelector(".wsh-ended-banner")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByTestId("screen-TW-30")).toBeTruthy();

    expect(screen.queryByRole("button", { name: /Reactivate coaching/ })).toBeNull();
    const reactivate = screen.getByRole("button", { name: "Reactivate" });
    // Frame 179 draws Reactivate as the filled primary button (see PR note).
    expect(reactivate.className).toContain("button-primary");
    expect(reactivate.className).toContain("wsh-reactivate");
    fireEvent.click(reactivate);
    expect(onOpenModal).toHaveBeenCalledWith({ type: "reactivate" });
  });

  it("without endedAt the pill reads Ended and the meta has no coached dates", () => {
    renderHeader(workspace("ended", null, { startedAt: "2026-07-06T04:30:00.000Z" }));
    const pill = document.querySelector('.status-chip[data-kind="lifecycle"]');
    expect(pill?.textContent).toBe("Ended");
    expect(screen.queryByText(/^Coached /)).toBeNull();
  });

  it("pending reactivation keeps the waiting line, Remind on WhatsApp and Cancel request", () => {
    renderHeader(
      workspace("ended", { sentAt: "2026-10-20T04:00:00.000Z" }, {
        ...ENDED,
        clientWhatsappE164: "+919800000000",
      }),
    );
    expect(screen.getByRole("status").textContent).toMatch(/^Waiting for Kavya to confirm/);
    expect(screen.getByRole("link", { name: /Remind on WhatsApp/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel request" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reactivate" })).toBeNull();
    expect(screen.getByTestId("screen-TW-30")).toBeTruthy();
  });

  it("active client: lifecycle and adherence chips, no TW-30 hook", () => {
    renderHeader(workspace("active", null, { adherenceState: "on_track" }));
    expect(document.querySelector('.status-chip[data-kind="lifecycle"]')?.textContent).toBe("Active");
    expect(document.querySelector('.status-chip[data-kind="adherence"]')).not.toBeNull();
    expect(screen.queryByTestId("screen-TW-30")).toBeNull();
  });
});

describe("WorkspaceHeader WhatsApp button at iPad width (frame 208b)", () => {
  it("keeps the accessible name and carries the short WhatsApp label for ≤1024px", () => {
    renderHeader(workspace("active", null, { clientWhatsappE164: "+919800000000" }));
    const link = screen.getByRole("link", { name: "Message on WhatsApp" });
    expect(link.querySelector(".wsh-wa-long")?.textContent).toBe("Message on WhatsApp");
    expect(link.querySelector(".wsh-wa-short")?.textContent?.trim()).toBe("WhatsApp");
  });
});
