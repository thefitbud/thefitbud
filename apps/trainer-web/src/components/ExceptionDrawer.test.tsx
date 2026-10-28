/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import type { ExceptionDetail } from "@fitbud/contracts";

const EXC_ID = "44444444-4444-4444-8444-444444444444";
const REL_ID = "55555555-5555-4555-8555-555555555555";

const api = vi.hoisted(() => ({
  getException: vi.fn(),
  getWorkoutAssignment: vi.fn(),
  getClientWorkspace: vi.fn(),
  getResponsiveness: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  apiClient: {
    getException: api.getException,
    getWorkoutAssignment: api.getWorkoutAssignment,
    getClientWorkspace: api.getClientWorkspace,
  },
}));
vi.mock("../lib/stage1-api", () => ({
  stage1Api: { getResponsiveness: api.getResponsiveness },
}));

import { ExceptionDrawer, resolvedCloseLabel } from "./ExceptionDrawer";

// Acknowledged items show the outcome + note form straight away.
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

const RESOLVED_AT = "2026-10-22T08:00:00.000Z";

function resolvedDetail(
  closedReason: ExceptionDetail["closedReason"],
): ExceptionDetail {
  return {
    ...detail,
    status: "resolved",
    resolvedAt: RESOLVED_AT,
    closedReason,
    updatedAt: RESOLVED_AT,
  };
}

function inRouter(ui: ReactElement) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

async function renderDrawer(onClose: () => void) {
  const utils = render(
    inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={onClose} />),
  );
  const note = await screen.findByRole("textbox");
  return { ...utils, note: note as HTMLTextAreaElement };
}

describe("ExceptionDrawer focus (HM1)", () => {
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
    api.getResponsiveness.mockRejectedValue(new Error("not needed"));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("focuses the Close (X) button when it opens", async () => {
    await renderDrawer(() => undefined);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close" }),
    );
  });

  it("keeps focus in the note when the parent re-renders with a new onClose", async () => {
    const { note, rerender } = await renderDrawer(() => undefined);
    act(() => note.focus());
    fireEvent.change(note, { target: { value: "Talked, moving it to Sat" } });
    expect(document.activeElement).toBe(note);

    for (let i = 0; i < 3; i += 1) {
      rerender(
        inRouter(
          <ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />,
        ),
      );
      await act(async () => {
        await Promise.resolve();
      });
      expect(document.activeElement).toBe(note);
    }
    expect(note.value).toBe("Talked, moving it to Sat");
  });

  it("calls the latest onClose on Escape and from the X", async () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = await renderDrawer(first);
    rerender(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={latest} />),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(latest).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(latest).toHaveBeenCalledTimes(2);
    expect(first).not.toHaveBeenCalled();
  });
});

describe("ExceptionDrawer closedReason label (RL1b)", () => {
  beforeEach(() => {
    api.getWorkoutAssignment.mockResolvedValue({
      workoutDayName: "Upper body A",
      windowEndsAt: "2026-10-22T12:00:00.000Z",
      workoutDay: { exercises: [] },
    });
    api.getClientWorkspace.mockResolvedValue({
      header: { traineeDisplayName: "Rohan Mehta", clientWhatsappE164: null },
    });
    api.getResponsiveness.mockRejectedValue(new Error("not needed"));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("maps each closedReason to the trainer-facing prefix", () => {
    expect(resolvedCloseLabel("trainer")).toBe("Resolved by you");
    expect(resolvedCloseLabel(null)).toBe("Resolved by you");
    expect(resolvedCloseLabel("coaching_ended")).toBe("Closed · coaching ended");
    expect(resolvedCloseLabel("auto_resolve")).toBe("Cleared automatically");
  });

  it("shows Resolved by you for a trainer resolve", async () => {
    api.getException.mockResolvedValue(resolvedDetail("trainer"));
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    expect(
      await screen.findByText(/Resolved by you ·/),
    ).toBeTruthy();
    expect(screen.queryByText(/Cleared automatically/)).toBeNull();
    expect(screen.queryByText(/Closed · coaching ended/)).toBeNull();
  });

  it("shows Closed · coaching ended when coaching ended", async () => {
    api.getException.mockResolvedValue(resolvedDetail("coaching_ended"));
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    expect(
      await screen.findByText(/Closed · coaching ended ·/),
    ).toBeTruthy();
    expect(screen.queryByText(/Resolved by you/)).toBeNull();
    expect(screen.queryByText(/Cleared automatically/)).toBeNull();
  });

  it("shows Cleared automatically for an auto-resolve", async () => {
    api.getException.mockResolvedValue(resolvedDetail("auto_resolve"));
    render(
      inRouter(<ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />),
    );
    expect(
      await screen.findByText(/Cleared automatically ·/),
    ).toBeTruthy();
    expect(screen.queryByText(/Resolved by you/)).toBeNull();
    expect(screen.queryByText(/Closed · coaching ended/)).toBeNull();
  });
});
