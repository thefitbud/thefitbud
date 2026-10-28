/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  acknowledgeException: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  apiClient: {
    getException: api.getException,
    getWorkoutAssignment: api.getWorkoutAssignment,
    getClientWorkspace: api.getClientWorkspace,
    acknowledgeException: api.acknowledgeException,
  },
}));
vi.mock("../lib/stage1-api", () => ({
  stage1Api: { getResponsiveness: api.getResponsiveness },
}));

import { ExceptionDrawer } from "./ExceptionDrawer";

const baseDetail: ExceptionDetail = {
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
  createdAt: "2026-10-22T06:00:00.000Z",
  updatedAt: "2026-10-22T07:00:00.000Z",
  actions: [],
};

// Acknowledged items show the outcome + note form straight away.
const detail: ExceptionDetail = { ...baseDetail };

const activeDetail: ExceptionDetail = {
  ...baseDetail,
  status: "active",
  acknowledgedAt: null,
  updatedAt: "2026-10-22T06:00:00.000Z",
};

function inRouter(ui: ReactElement) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

function stubWorkspaceApis() {
  api.getWorkoutAssignment.mockResolvedValue({
    workoutDayName: "Upper body A",
    windowEndsAt: "2026-10-22T12:00:00.000Z",
    workoutDay: { exercises: [] },
  });
  api.getClientWorkspace.mockResolvedValue({
    header: { traineeDisplayName: "Rohan Mehta", clientWhatsappE164: null },
  });
  api.getResponsiveness.mockRejectedValue(new Error("not needed"));
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
    stubWorkspaceApis();
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

describe("ExceptionDrawer Mark reviewed focus (ED1)", () => {
  beforeEach(() => {
    stubWorkspaceApis();
    api.getException.mockResolvedValue(activeDetail);
    api.acknowledgeException.mockResolvedValue({
      ...activeDetail,
      status: "acknowledged",
      acknowledgedAt: "2026-10-22T07:00:00.000Z",
    });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps activeElement inside the drawer after Mark reviewed", async () => {
    render(
      inRouter(
        <ExceptionDrawer exceptionId={EXC_ID} onClose={() => undefined} />,
      ),
    );
    const markReviewed = await screen.findByRole("button", {
      name: "Mark reviewed",
    });

    api.getException.mockResolvedValue({
      ...activeDetail,
      status: "acknowledged",
      acknowledgedAt: "2026-10-22T07:00:00.000Z",
      updatedAt: "2026-10-22T07:00:00.000Z",
    });

    await act(async () => {
      markReviewed.focus();
      fireEvent.click(markReviewed);
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Mark reviewed" }),
      ).toBeNull();
    });
    await waitFor(() => {
      const drawer = screen.getByRole("dialog", {
        name: "Needs attention detail",
      });
      expect(document.activeElement).not.toBe(document.body);
      expect(drawer.contains(document.activeElement)).toBe(true);
    });
    expect(api.acknowledgeException).toHaveBeenCalled();
  });
});
