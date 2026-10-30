/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";

const REL_ID = "66666666-6666-4666-8666-666666666666";

const api = vi.hoisted(() => ({
  listTrainerNotes: vi.fn(),
  deleteTrainerNote: vi.fn(),
}));
const stage1 = vi.hoisted(() => ({
  getWorkspaceWeek: vi.fn(),
  patchTrainerNote: vi.fn(),
}));

vi.mock("../lib/api", () => ({ apiClient: api }));
vi.mock("../lib/stage1-api", () => ({ stage1Api: stage1 }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ me: null }) }));
vi.mock("../components/workspace/ResponsivenessPanel", () => ({
  ResponsivenessPanel: () => null,
}));
vi.mock("../components/ExceptionDrawer", () => ({ ExceptionDrawer: () => null }));

import { ClientOverviewPage } from "./ClientOverviewPage";

type Lifecycle = "ended" | "active" | "coaching_ready";
type Renewal = "current" | "upcoming" | "due" | "expired" | null;

function renderPage(onboardingStatus: Lifecycle, renewalState: Renewal) {
  const workspace = {
    header: {
      relationshipId: REL_ID,
      traineeDisplayName: "Kavya Menon",
      onboardingStatus,
      renewalState,
      traineeProfile: { displayName: "Kavya Menon", age: null, gender: "female" },
      traineeTimezone: "Asia/Kolkata",
      hasCustomMealTimes: false,
      trainerWhatsappE164: null,
      clientWhatsappE164: null,
    },
    overview: {
      openException: null,
      pendingReviewCheckin: null,
      nextCheckin: null,
      recentActivity: [],
      progress: { measurements: [] },
    },
    plan: { plan: null, version: null },
    configuration: { configuration: null },
  };
  const context = {
    workspace,
    openWorkspaceModal: vi.fn(),
    refreshEpoch: 0,
    relationshipId: REL_ID,
    online: true,
    ended: onboardingStatus === "ended",
  };
  return render(
    <MemoryRouter initialEntries={[`/clients/${REL_ID}/overview`]}>
      <Routes>
        <Route path="/clients/:relationshipId" element={<Outlet context={context} />}>
          <Route path="overview" element={<ClientOverviewPage />} />
          <Route path="configure" element={<p>configure route</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.listTrainerNotes.mockResolvedValue({ items: [] });
  stage1.getWorkspaceWeek.mockRejectedValue(new Error("no week in unit test"));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ClientOverviewPage renewal link (CE3)", () => {
  it.each(["due", "expired", "upcoming"] as const)(
    "ended client, renewal %s: the link reads View coaching setup and only navigates",
    async (renewal) => {
      renderPage("ended", renewal);
      const link = await screen.findByRole("link", { name: "View coaching setup" });
      expect(link.getAttribute("href")).toBe(`/clients/${REL_ID}/configure`);
      expect(screen.queryByRole("link", { name: "Open settings" })).toBeNull();
      fireEvent.click(link);
      expect(await screen.findByText("configure route")).toBeTruthy();
      expect(api.deleteTrainerNote).not.toHaveBeenCalled();
      expect(stage1.patchTrainerNote).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["active", "due"],
    ["active", "expired"],
    ["coaching_ready", "due"],
  ] as const)("%s client, renewal %s: the link still reads Open settings", async (status, renewal) => {
    renderPage(status, renewal);
    const link = await screen.findByRole("link", { name: "Open settings" });
    expect(link.getAttribute("href")).toBe(`/clients/${REL_ID}/configure`);
    expect(screen.queryByRole("link", { name: "View coaching setup" })).toBeNull();
  });

  it.each([
    ["ended", "current"],
    ["ended", null],
    ["active", "current"],
  ] as const)("%s client, renewal %s: no Renewal card", async (status, renewal) => {
    renderPage(status, renewal);
    expect(await screen.findByRole("heading", { name: "Progress" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Renewal" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open settings" })).toBeNull();
    expect(screen.queryByRole("link", { name: "View coaching setup" })).toBeNull();
  });
});
