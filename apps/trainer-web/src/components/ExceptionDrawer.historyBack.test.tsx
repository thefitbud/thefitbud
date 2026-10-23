/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import type { ClientWorkspace, ExceptionDetail } from "@fitbud/contracts";
import type { WorkspaceOutletContext } from "../pages/workspaceContext";

// DR2 (DR1 QA F-C): Esc, then browser Back before the close commits. History
// brings the same item back, the drawer instance is reused (the close was
// still a pending router transition), and it must be fully usable again:
// 'n' nudges once and Esc closes. Real pages, real drawer, real browser
// history (BrowserRouter), so the Back is a real popstate.

const REL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXC = "11111111-1111-4111-8111-111111111111";

const api = vi.hoisted(() => ({
  getAttentionGroups: vi.fn(),
  listCoachAsks: vi.fn(),
  getReengagementCandidates: vi.fn(),
  getActivityFeed: vi.fn(),
  getResponsiveness: vi.fn(),
  getWorkspaceWeek: vi.fn(),
  listSubscriptionAttention: vi.fn(),
  listTrainerCheckinInbox: vi.fn(),
  listClients: vi.fn(),
  listInvitations: vi.fn(),
  listTrainerNotes: vi.fn(),
  acknowledgeException: vi.fn(),
  resolveException: vi.fn(),
  getException: vi.fn(),
  getWorkoutAssignment: vi.fn(),
  getClientWorkspace: vi.fn(),
  nudgeActivity: vi.fn(),
}));

vi.mock("../lib/stage1-api", () => ({
  stage1Api: {
    getAttentionGroups: api.getAttentionGroups,
    listCoachAsks: api.listCoachAsks,
    getReengagementCandidates: api.getReengagementCandidates,
    getActivityFeed: api.getActivityFeed,
    getResponsiveness: api.getResponsiveness,
    getWorkspaceWeek: api.getWorkspaceWeek,
  },
}));
vi.mock("../lib/api", () => ({
  apiClient: {
    listSubscriptionAttention: api.listSubscriptionAttention,
    listTrainerCheckinInbox: api.listTrainerCheckinInbox,
    listClients: api.listClients,
    listInvitations: api.listInvitations,
    listTrainerNotes: api.listTrainerNotes,
    acknowledgeException: api.acknowledgeException,
    resolveException: api.resolveException,
    getException: api.getException,
    getWorkoutAssignment: api.getWorkoutAssignment,
    getClientWorkspace: api.getClientWorkspace,
    nudgeActivity: api.nudgeActivity,
  },
}));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { timezone: "Asia/Kolkata" } }),
}));
vi.mock("./OfflineBanner", () => ({ useOnlineStatus: () => true }));
vi.mock("../realtime/useRealtimeHints", () => ({ useRealtimeHints: () => undefined }));
vi.mock("./CoachAskDrawer", () => ({ CoachAskDrawer: () => null }));

import { ExceptionDrawer } from "./ExceptionDrawer";
import { HomePage } from "../pages/HomePage";
import { ClientOverviewPage } from "../pages/ClientOverviewPage";

const detail: ExceptionDetail = {
  id: EXC,
  coachingRelationshipId: REL,
  type: "missed_workout",
  severity: "attention",
  status: "active",
  ruleVersion: "v1",
  sourceEntityType: "workout_assignment",
  sourceEntityId: "66666666-6666-4666-8666-666666666666",
  summary: "Missed Upper body A",
  details: null,
  detectedAt: "2026-10-22T06:00:00.000Z",
  activatedAt: "2026-10-22T06:00:00.000Z",
  acknowledgedAt: null,
  resolvedAt: null,
  createdAt: "2026-10-22T06:00:00.000Z",
  updatedAt: "2026-10-22T06:00:00.000Z",
  actions: [],
};

/** Just enough of a coaching-ready workspace for the overview to render its Review CTA. */
const workspace = {
  header: {
    traineeDisplayName: "Rohan Mehta",
    clientWhatsappE164: null,
    onboardingStatus: "active",
    renewalState: null,
    hasCustomMealTimes: false,
    traineeProfile: { gender: null },
  },
  overview: {
    openException: {
      id: EXC,
      type: "missed_workout",
      severity: "attention",
      status: "active",
      summary: "Missed Upper body A",
      detectedAt: "2026-10-22T06:00:00.000Z",
    },
    nextCheckin: null,
    pendingReviewCheckin: null,
    progress: { measurements: [] },
    recentActivity: [],
  },
  plan: { plan: null, version: null },
  configuration: { configuration: null },
} as unknown as ClientWorkspace;

function WorkspaceLayout() {
  const ctx: WorkspaceOutletContext = {
    workspace,
    workspaceLoading: false,
    workspaceError: null,
    notFound: false,
    refreshEpoch: 0,
    reloadWorkspace: () => undefined,
    openWorkspaceModal: () => undefined,
    relationshipId: REL,
    online: true,
    ended: false,
  };
  return <Outlet context={ctx} />;
}

function press(key: string) {
  return fireEvent.keyDown(document.activeElement ?? document.body, { key });
}

/**
 * Esc, then browser Back, in one act() scope: the close's router transition
 * has not committed when the popstate lands, as under load in a browser.
 */
async function escThenBack() {
  await act(async () => {
    press("Escape");
    const popped = new Promise((r) => window.addEventListener("popstate", r, { once: true }));
    window.history.back();
    await popped;
  });
}

/** The reopened drawer is the same node, and it is usable: 'n' nudges once, Esc closes. */
async function expectUsable(dialog: HTMLElement) {
  expect(new URLSearchParams(window.location.search).get("exception")).toBe(EXC);
  expect(screen.getByRole("dialog")).toBe(dialog);
  await act(async () => {
    press("n");
  });
  expect(api.nudgeActivity).toHaveBeenCalledTimes(1);
  await act(async () => {
    press("Escape");
  });
  expect(screen.queryByRole("dialog")).toBeNull();
}

beforeEach(() => {
  api.getAttentionGroups.mockResolvedValue({
    groups: [
      {
        relationshipId: REL,
        traineeDisplayName: "Rohan Mehta",
        clientWhatsappE164: null,
        items: [
          {
            id: EXC,
            type: "missed_workout",
            severity: "attention",
            status: "active",
            ageMinutes: 120,
            summary: "Missed workout",
            details: null,
          },
        ],
      },
    ],
  });
  api.listCoachAsks.mockResolvedValue({ items: [] });
  api.getReengagementCandidates.mockResolvedValue({ items: [] });
  api.getActivityFeed.mockResolvedValue({ events: [] });
  api.listSubscriptionAttention.mockResolvedValue({ items: [] });
  api.listTrainerCheckinInbox.mockResolvedValue({ items: [] });
  api.listClients.mockResolvedValue({ items: [] });
  api.listInvitations.mockResolvedValue({ items: [] });
  api.listTrainerNotes.mockResolvedValue({ items: [] });
  api.getWorkspaceWeek.mockRejectedValue(new Error("not needed"));
  api.getResponsiveness.mockRejectedValue(new Error("not needed"));
  api.getException.mockResolvedValue(detail);
  api.getWorkoutAssignment.mockResolvedValue({
    workoutDayName: "Upper body A",
    windowEndsAt: "2026-10-22T12:00:00.000Z",
    workoutDay: { exercises: [] },
  });
  api.getClientWorkspace.mockResolvedValue({
    header: { traineeDisplayName: "Rohan Mehta", clientWhatsappE164: null },
  });
  api.nudgeActivity.mockResolvedValue({});
  api.acknowledgeException.mockResolvedValue({});
  api.resolveException.mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Esc then browser Back reopens a usable drawer (DR2 / DR1 QA F-C)", () => {
  it("Home: Esc, Back before the close commits: same drawer, 'n' nudges and Esc closes", async () => {
    window.history.replaceState(null, "", "/");
    render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>,
    );
    await screen.findByText("Rohan Mehta");
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("button", { name: "Nudge" });
    await escThenBack();
    await expectUsable(dialog);
  });

  // The client page passes no open token at all, so before DR2 nothing
  // could clear the flag here: Esc did nothing; only X / backdrop closed it.
  it("client page: Esc, Back before the close commits: same drawer, 'n' nudges and Esc closes", async () => {
    window.history.replaceState(null, "", `/clients/${REL}`);
    render(
      <BrowserRouter>
        <Routes>
          <Route element={<WorkspaceLayout />}>
            <Route path="/clients/:relationshipId" element={<ClientOverviewPage />} />
          </Route>
        </Routes>
      </BrowserRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("button", { name: "Nudge" });
    expect(window.location.pathname).toBe(`/clients/${REL}`);
    await escThenBack();
    await expectUsable(dialog);
  });

  // The reset is scoped to traversals that land on this item. Any other
  // history entry means the drawer is on its way out and must stay inert.
  describe("drawer only: which history traversals count as a fresh open", () => {
    const OTHER = "77777777-7777-4777-8777-777777777777";
    async function renderClosing() {
      window.history.replaceState(null, "", `/?exception=${EXC}`);
      const onClose = vi.fn(); // a parent whose close never commits
      render(
        <BrowserRouter>
          <ExceptionDrawer exceptionId={EXC} onClose={onClose} />
        </BrowserRouter>,
      );
      await screen.findByRole("button", { name: "Nudge" });
      press("Escape");
      expect(onClose).toHaveBeenCalledTimes(1);
      return onClose;
    }
    function traverseTo(url: string) {
      act(() => {
        window.history.pushState(null, "", url);
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
    }

    it("a traversal back to this item makes it usable again", async () => {
      const onClose = await renderClosing();
      traverseTo(`/?exception=${EXC}`);
      await act(async () => {
        press("n");
      });
      expect(api.nudgeActivity).toHaveBeenCalledTimes(1);
      press("Escape");
      expect(onClose).toHaveBeenCalledTimes(2);
    });

    for (const [name, url] of [
      ["no drawer", "/"],
      ["another item", `/?exception=${OTHER}`],
      ["another page", `/clients/${REL}`],
    ] as const) {
      it(`a traversal to ${name} keeps the closing drawer inert`, async () => {
        const onClose = await renderClosing();
        traverseTo(url);
        await act(async () => {
          press("n");
        });
        press("Escape");
        expect(api.nudgeActivity).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    }
  });
});
