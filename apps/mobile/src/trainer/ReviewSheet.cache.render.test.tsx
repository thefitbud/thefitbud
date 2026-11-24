/**
 * Z14-3: the review sheet paints its header from the per-client cache while the
 * workspace read is still pending, prefetches the next item, and steps to a
 * seen item without a request or a "Loading item…" line.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockAuth, render, screen, waitFor } from "../test/render";

vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));

const api = {
  getClientWorkspace: vi.fn(),
  getException: vi.fn(),
  getWorkoutAssignment: vi.fn(),
  getMealAssignment: vi.fn(),
};
const auth = mockAuth({ api, relationships: [], selectedRole: "trainer" });
vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});

const { ReviewSheet } = await import("./ReviewSheet");
const { clearTrainerCache, setTrainerCacheOwner, trainerCacheEpoch, writeClientMeta } =
  await import("./cache");

const TRAINER = "6f1c2a9e-3b4d-4c5e-8f70-1a2b3c4d5e6f";
const REL = "6a68b615-c47c-4bfc-a7f8-550becf7878a";
const EX_A = "0b1f6d1e-2f0a-4c55-9d3b-1a2b3c4d5e6f";
const EX_B = "1c2a7e2f-3a1b-4d66-8e4c-2b3c4d5e6f70";
const WORKOUT = "2d3b8f30-4b2c-4e77-9f5d-3c4d5e6f7081";

function item(id: string, summary: string) {
  return {
    id,
    type: "missed_workout" as const,
    severity: "attention" as const,
    status: "active" as const,
    ageMinutes: 600,
    summary,
    details: { localDate: "2026-11-10", workoutDayName: "Lower body A" },
    acknowledgedAt: null,
  };
}

function detail(id: string, summary: string) {
  return {
    id,
    coachingRelationshipId: REL,
    type: "missed_workout",
    severity: "attention",
    status: "active",
    ruleVersion: "mvp.v2",
    sourceEntityType: "workout_assignment",
    sourceEntityId: WORKOUT,
    summary,
    details: { localDate: "2026-11-10", workoutDayName: "Lower body A" },
    detectedAt: "2026-11-11T00:05:00.000Z",
    activatedAt: null,
    acknowledgedAt: null,
    resolvedAt: null,
    closedReason: null,
    createdAt: "2026-11-11T00:05:00.000Z",
    updatedAt: "2026-11-11T00:05:00.000Z",
    actions: [],
  };
}

const items = [item(EX_A, "Lower body A was not logged."), item(EX_B, "Upper body B was not logged.")];

function sheet(index: number) {
  return (
    <ReviewSheet
      visible
      relationshipId={REL}
      traineeDisplayName="Rohan Mehta"
      items={items}
      index={index}
      onChangeIndex={vi.fn()}
      onBrowseItem={vi.fn()}
      onShowSummary={vi.fn()}
      onDismiss={vi.fn()}
      onMarkReviewed={vi.fn()}
      onUndo={vi.fn()}
      onNextClient={vi.fn()}
      onNudge={vi.fn()}
      onResolve={vi.fn()}
      onMore={vi.fn()}
    />
  );
}

beforeEach(() => {
  clearTrainerCache();
  setTrainerCacheOwner(null);
  setTrainerCacheOwner(TRAINER);
  Object.values(api).forEach((fn) => fn.mockReset());
  api.getException.mockImplementation(async (id: string) =>
    detail(id, id === EX_A ? "Lower body A was not logged." : "Upper body B was not logged."),
  );
  api.getWorkoutAssignment.mockResolvedValue(null);
  // The whole-workspace read never answers in these tests.
  api.getClientWorkspace.mockReturnValue(new Promise(() => undefined));
});

describe("ReviewSheet instant paint", () => {
  it("shows the header from the client cache while the workspace call is pending", async () => {
    // A clients-list entry: name, goal, start. No time zone yet, so the sheet
    // still asks for the workspace, but it does not wait for it.
    writeClientMeta(
      REL,
      {
        name: "Rohan Mehta",
        goalShort: "Fat loss",
        startedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        status: "coaching_ready",
      },
      trainerCacheEpoch(),
    );
    render(sheet(0));

    expect(await screen.findByText(/Fat loss · week 3/)).toBeTruthy();
    expect(api.getClientWorkspace).toHaveBeenCalledTimes(1);
  });

  it("prefetches the next item, and stepping to it or back makes no request", async () => {
    const view = render(sheet(0));
    await waitFor(() => expect(api.getException).toHaveBeenCalledWith(EX_A));
    // The next item loads while the first is read.
    await waitFor(() => expect(api.getException).toHaveBeenCalledWith(EX_B));
    expect(api.getException).toHaveBeenCalledTimes(2);

    view.rerender(sheet(1));
    expect(await screen.findByLabelText(/Item 2/)).toBeTruthy();
    expect(screen.queryByText("Loading item…")).toBeNull();

    view.rerender(sheet(0));
    expect(await screen.findByLabelText(/Item 1/)).toBeTruthy();
    expect(screen.queryByText("Loading item…")).toBeNull();
    // Still the two reads from the start: nothing was fetched on either step.
    expect(api.getException).toHaveBeenCalledTimes(2);
  });

  it("a different trainer on the same device does not see the kept items", async () => {
    const view = render(sheet(0));
    await waitFor(() => expect(api.getException).toHaveBeenCalledTimes(2));
    view.unmount();

    clearTrainerCache();
    setTrainerCacheOwner(null);
    setTrainerCacheOwner("0b9e8d7c-6a5f-4e3d-9c2b-1a0f9e8d7c6b");
    api.getException.mockClear();
    render(sheet(0));
    await waitFor(() => expect(api.getException).toHaveBeenCalledWith(EX_A));
  });
});
