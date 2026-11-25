/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ExceptionDetail } from "@fitbud/contracts";

// Z12-50 (D-W12-10): a paused client no longer blocks the nudge, and an
// inbox-only delivery says so in the drawer.

const EXC_ID = "44444444-4444-4444-8444-444444444444";
const REL_ID = "55555555-5555-4555-8555-555555555555";

const api = vi.hoisted(() => ({
  getException: vi.fn(),
  getWorkoutAssignment: vi.fn(),
  getClientWorkspace: vi.fn(),
  getResponsiveness: vi.fn(),
  nudgeActivity: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  apiClient: {
    getException: api.getException,
    getWorkoutAssignment: api.getWorkoutAssignment,
    getClientWorkspace: api.getClientWorkspace,
    nudgeActivity: api.nudgeActivity,
    acknowledgeException: vi.fn(),
    resolveException: vi.fn(),
  },
}));
vi.mock("../lib/stage1-api", () => ({
  stage1Api: { getResponsiveness: api.getResponsiveness },
}));
vi.mock("./OfflineBanner", () => ({ useOnlineStatus: () => true }));

import { ExceptionDrawer } from "./ExceptionDrawer";

const detail: ExceptionDetail = {
  id: EXC_ID,
  coachingRelationshipId: REL_ID,
  type: "missed_workout",
  severity: "attention",
  status: "acknowledged",
  ruleVersion: "v1",
  sourceEntityType: "workout_assignment",
  sourceEntityId: "66666666-6666-4666-8666-666666666666",
  summary: "Missed Upper body A",
  details: null,
  detectedAt: "2026-10-22T06:00:00.000Z",
  activatedAt: "2026-10-22T06:00:00.000Z",
  acknowledgedAt: "2026-10-22T07:00:00.000Z",
  resolvedAt: null,
  closedReason: null,
  createdAt: "2026-10-22T06:00:00.000Z",
  updatedAt: "2026-10-22T07:00:00.000Z",
  actions: [],
};

async function renderDrawer() {
  render(
    <MemoryRouter>
      <ExceptionDrawer exceptionId={EXC_ID} onClose={vi.fn()} />
    </MemoryRouter>,
  );
  return screen.findByRole("button", { name: "Remind" });
}

describe("ExceptionDrawer nudge (Z12-50)", () => {
  beforeEach(() => {
    api.getException.mockResolvedValue(detail);
    api.getWorkoutAssignment.mockResolvedValue({
      workoutDayName: "Upper body A",
      windowEndsAt: "2026-10-22T12:00:00.000Z",
      workoutDay: { exercises: [] },
    });
    api.getClientWorkspace.mockResolvedValue({
      header: { traineeDisplayName: "Rohan Mehta", clientWhatsappE164: null },
    });
    api.getResponsiveness.mockResolvedValue({
      label: "reminders_paused",
      counts: { sent: 0, opened: 0, loggedAfter: 0, loggedBefore: 0 },
      pushEnabled: true,
    });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("reminders paused no longer blocks the nudge", async () => {
    api.nudgeActivity.mockResolvedValue({
      deduped: false,
      delivery: "inbox",
      inboxReason: "reminders_paused",
    });
    const button = await renderDrawer();
    // Let the responsiveness read settle so a paused label could have blocked.
    await waitFor(() => expect(api.getResponsiveness).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(button);
    await waitFor(() => expect(api.nudgeActivity).toHaveBeenCalledTimes(1));
  });

  it.each([
    ["reminders_paused", "Reminder sent to their inbox. Reminders are paused."],
    ["push_off", "Reminder sent to their inbox. Push is off."],
  ])("inbox-only delivery (%s) says so", async (inboxReason, line) => {
    api.nudgeActivity.mockResolvedValue({
      deduped: false,
      delivery: "inbox",
      inboxReason,
    });
    const button = await renderDrawer();
    fireEvent.click(button);
    await screen.findByText(line);
  });

  it("a push delivery just says Reminder sent", async () => {
    api.nudgeActivity.mockResolvedValue({
      deduped: false,
      delivery: "push",
      inboxReason: null,
    });
    const button = await renderDrawer();
    fireEvent.click(button);
    await screen.findByText("Reminder sent");
    expect(screen.getByTestId("panel-nudge-result").textContent).not.toMatch(/inbox/);
  });

  it("hides Remind for a meal that was logged later (FLOW 6.2)", async () => {
    api.getException.mockResolvedValue({
      ...detail,
      type: "meal_logged_later",
      status: "active",
      acknowledgedAt: null,
      sourceEntityType: "meal_assignment",
    });
    render(
      <MemoryRouter>
        <ExceptionDrawer exceptionId={EXC_ID} onClose={vi.fn()} />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: /resolve/i });
    expect(screen.queryByRole("button", { name: "Remind" })).toBeNull();
    expect(screen.queryByText(/push notification/)).toBeNull();
  });

  it("the helper under Remind follows the client's push state (FLOW 6.3)", async () => {
    api.getResponsiveness.mockResolvedValue({
      label: "notifications_off",
      counts: { sent: 0, opened: 0, loggedAfter: 0, loggedBefore: 0 },
      pushEnabled: false,
    });
    await renderDrawer();
    expect(
      await screen.findByText(
        "Push is off for Rohan. A reminder goes to their FitBud inbox.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Sends Rohan a push/)).toBeNull();
  });
});
