/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ClientWorkspace } from "@fitbud/contracts";

const auth = vi.hoisted(() => ({
  me: null as { timezone: string } | null,
}));
const zone = vi.hoisted(() => ({
  device: "America/Los_Angeles",
}));
vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ me: auth.me }),
}));
vi.mock("../../lib/http-api", () => ({
  cancelReactivation: vi.fn(),
}));
vi.mock("@fitbud/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fitbud/core")>();
  return {
    ...actual,
    deviceTimeZone: () => zone.device,
  };
});

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
  auth.me = null;
});

describe("WorkspaceHeader ⋯ menu (W13-10: places became the Settings tab)", () => {
  it.each(["active", "coaching_ready", "onboarding_submitted"] as const)(
    "%s client: the ⋯ menu keeps only End coaching…",
    (status) => {
      const { onOpenModal } = renderHeader(workspace(status));
      expect(openMenu()).toEqual(["End coaching…"]);
      for (const moved of [
        "Client settings",
        "Coaching setup",
        "Onboarding answers",
        "Reminder settings",
      ]) {
        expect(screen.queryByRole("menuitem", { name: moved })).toBeNull();
      }
      const end = screen.getByRole("menuitem", { name: "End coaching…" });
      expect(end.querySelector(".overflow-menu-item-icon svg")).not.toBeNull();
      expect(screen.queryAllByRole("separator")).toHaveLength(0);
      fireEvent.click(end);
      expect(onOpenModal).toHaveBeenCalledWith({ type: "end" });
    },
  );

  it.each([
    ["ended", null],
    ["ended with a pending reactivation", { sentAt: "2026-10-20T04:00:00.000Z" }],
  ] as const)("%s client: no ⋯ menu (nothing left in it)", (_label, pending) => {
    renderHeader(workspace("ended", pending));
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /End coaching/i })).toBeNull();
  });

  it("the Settings tab is last and opens the settings route", () => {
    renderHeader(workspace("active"));
    const tabs = screen
      .getByRole("navigation", { name: "Client sections" })
      .querySelectorAll("a");
    expect([...tabs].map((tab) => tab.textContent)).toEqual([
      "Overview",
      "Plan",
      "Activity",
      "Progress",
      "Check-ins",
      "History",
      "Settings",
    ]);
    fireEvent.click(screen.getByRole("link", { name: "Settings" }));
    expect(screen.getByText("settings route")).toBeTruthy();
  });
});

describe("WorkspaceHeader actions (W13-10: WhatsApp · Remind · Note · ⋯)", () => {
  it("active client: Remind (never Nudge) and Note; Note opens the composer", () => {
    const { onOpenModal } = renderHeader(workspace("active"));
    expect(screen.getByTestId("wsh-remind").textContent).toBe("Remind");
    expect(screen.getByTestId("wsh-remind").getAttribute("href")).toBe(
      `/clients/${REL_ID}/activity`,
    );
    expect(document.body.textContent ?? "").not.toMatch(/nudg/i);
    fireEvent.click(screen.getByTestId("wsh-note"));
    expect(onOpenModal).toHaveBeenCalledWith({ type: "note" });
  });

  it("a coached client's header has no primary Review button", () => {
    const ws = workspace("active");
    (ws.overview as unknown as { openException: { id: string } }).openException = {
      id: "66666666-6666-4666-8666-666666666666",
    };
    renderHeader(ws);
    expect(screen.queryByRole("button", { name: /^Review/ })).toBeNull();
  });

  it("ended client: no Remind or Note", () => {
    renderHeader(workspace("ended"));
    expect(screen.queryByTestId("wsh-remind")).toBeNull();
    expect(screen.queryByTestId("wsh-note")).toBeNull();
  });

  it("a renewal that needs attention is a header pill beside the status pills", () => {
    renderHeader(
      workspace("active", null, { renewalState: "expired", renewsOn: "2026-11-22" }),
    );
    const pill = document.querySelector('.wsh-name-row .status-chip[data-kind="renewal"]');
    expect(pill?.textContent).toMatch(/^Renewal expired · Sun 22 Nov/);
    expect(document.querySelector('.wsh-meta .status-chip[data-kind="renewal"]')).toBeNull();
  });
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
    auth.me = { timezone: "Asia/Kolkata" };
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
    auth.me = { timezone: "Asia/Kolkata" };
    renderHeader(workspace("ended", null, { startedAt: "2026-07-06T04:30:00.000Z" }));
    const pill = document.querySelector('.status-chip[data-kind="lifecycle"]');
    expect(pill?.textContent).toBe("Ended");
    expect(screen.queryByText(/^Coached /)).toBeNull();
  });

  it("near midnight the header shows the trainer's day, not the client's", () => {
    // 2026-10-03 20:00Z is Sun 4 Oct 01:30 in Kolkata but Sat 3 Oct 13:00 in Los Angeles.
    auth.me = { timezone: "America/Los_Angeles" };
    renderHeader(
      workspace("ended", null, {
        ...ENDED,
        startedAt: "2026-07-06T03:00:00.000Z",
        endedAt: "2026-10-03T20:00:00.000Z",
      }),
    );
    expect(screen.getByText(/^Coached Sun 5 Jul( 2026)? — Sat 3 Oct( 2026)?$/)).toBeTruthy();
    expect(document.querySelector('.status-chip[data-kind="lifecycle"]')?.textContent).toMatch(
      /^Ended · Sat 3 Oct( 2026)?$/,
    );
  });

  it("with no stored trainer zone uses the browser zone for Coached/Ended dates (D-W12-26)", () => {
    auth.me = null;
    zone.device = "America/Los_Angeles";
    // 2026-10-03 20:00Z is Sat 3 Oct afternoon in LA; 2026-07-06 03:00Z is Sun 5 Jul in LA.
    renderHeader(
      workspace("ended", null, {
        ...ENDED,
        startedAt: "2026-07-06T03:00:00.000Z",
        endedAt: "2026-10-03T20:00:00.000Z",
      }),
    );
    expect(screen.getByText(/^Coached Sun 5 Jul( 2026)? — Sat 3 Oct( 2026)?$/)).toBeTruthy();
    expect(document.querySelector('.status-chip[data-kind="lifecycle"]')?.textContent).toMatch(
      /^Ended · Sat 3 Oct( 2026)?$/,
    );
  });

  it("with an empty stored trainer zone still falls back to the browser zone", () => {
    auth.me = { timezone: "   " };
    zone.device = "Asia/Kolkata";
    renderHeader(workspace("ended", null, ENDED));
    expect(screen.getByText(/^Coached Mon 6 Jul( 2026)? — Sat 3 Oct( 2026)?$/)).toBeTruthy();
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
