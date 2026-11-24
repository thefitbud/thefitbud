/**
 * Needs you review sheet wiring and the Asked toast (Z12-51): Resolve… goes
 * through the resolve sheet with the trainer's outcome, Remind opens the
 * FitBud reminder sheet (never WhatsApp) and only for items that can be nudged,
 * and "Marked answered" for a second client shows its own toast and Undo even
 * after the first one's left early.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  attentionGroupsResponseSchema,
  type AttentionGroupsResponse,
} from "@fitbud/contracts";
import { ApiClientError } from "@fitbud/api-client";
import { act, fireEvent, mockAuth, render, screen, waitFor } from "../../test/render";
import { NoticeHost } from "../../components/notice/NoticeHost";
import { createNoticeQueue, type NoticeQueue } from "../../components/notice/noticeQueue";

vi.mock("../../lib/reportError", () => ({ reportError: vi.fn() }));
const openContextualWhatsApp = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../whatsapp", () => ({ openContextualWhatsApp }));

const api = {
  getAttentionGroups: vi.fn(),
  listCoachAsks: vi.fn(),
  listTrainerCheckinInbox: vi.fn(),
  listClients: vi.fn(),
  getClientWorkspace: vi.fn(),
  getException: vi.fn(),
  getWorkoutAssignment: vi.fn(),
  getMealAssignment: vi.fn(),
  acknowledgeException: vi.fn(),
  undoExceptionAcknowledge: vi.fn(),
  resolveException: vi.fn(),
  createTrainerNote: vi.fn(),
  answerCoachAsk: vi.fn(),
  getResponsiveness: vi.fn(),
  nudgeActivity: vi.fn(),
};
const auth = mockAuth({ api, relationships: [], selectedRole: "trainer" });
vi.mock("../../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});
vi.mock("react-native-gesture-handler", () => ({
  Swipeable: ({ children }: { children: unknown }) => children,
}));
vi.mock("../../realtime/useRealtimeHints", () => ({ useRealtimeHints: vi.fn() }));

const { AttentionTab } = await import("../AttentionTab");
const { clearTrainerCache, setTrainerCacheOwner } = await import("../cache");
const { readReviewItem } = await import("../reviewItemCache");

const TRAINER = "6f1c2a9e-3b4d-4c5e-8f70-1a2b3c4d5e6f";
const REL = "6a68b615-c47c-4bfc-a7f8-550becf7878a";
const REL_B = "7b79c726-d58d-4cad-b8f9-661cfd08898b";
const EX_ID = "0b1f6d1e-2f0a-4c55-9d3b-1a2b3c4d5e6f";
const WORKOUT_ID = "1c2a7e2f-3a1b-4d66-8e4c-2b3c4d5e6f70";

function attention(type: string, sourceEntityType: string): AttentionGroupsResponse {
  const group = {
    relationshipId: REL,
    traineeDisplayName: "Rohan Mehta",
    clientWhatsappE164: "919800000001",
    bucket: "needs_you",
    itemCount: 1,
    mostSevere: "critical",
    oldestAgeMinutes: 7200,
    items: [
      {
        id: EX_ID,
        type,
        severity: "critical",
        status: "active",
        ageMinutes: 7200,
        summary: "Lower body A was not logged.",
        details: { localDate: "2026-11-10", workoutDayName: "Lower body A" },
        acknowledgedAt: null,
      },
    ],
  };
  void sourceEntityType;
  return attentionGroupsResponseSchema.parse({
    groups: [group],
    needsYou: [group],
    reviewed: [],
  });
}

function exceptionDetail(type: string, sourceEntityType: string, status = "active") {
  return {
    id: EX_ID,
    coachingRelationshipId: REL,
    type,
    severity: "critical",
    status,
    ruleVersion: "mvp.v2",
    sourceEntityType,
    sourceEntityId: WORKOUT_ID,
    summary: "Lower body A was not logged.",
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

function ask(id: string, relationshipId: string) {
  return {
    id,
    relationshipId,
    itemType: "meal_assignment",
    itemId: "2d3b8f30-4b2c-4e77-9f5d-3c4d5e6f7081",
    topic: "swap",
    status: "open",
    askCount: 1,
    askedAt: "2026-11-17T04:00:00.000Z",
    lastAskedAt: "2026-11-17T04:00:00.000Z",
    itemLabel: "Lunch",
    itemDate: "2026-11-17",
  };
}

function loadOk(type = "missed_workout", sourceEntityType = "workout_assignment") {
  api.getAttentionGroups.mockResolvedValue(attention(type, sourceEntityType));
  api.listCoachAsks.mockResolvedValue({
    items: [
      ask("3e4c9a41-5c3d-4f88-8a6e-4d5e6f708192", REL),
      ask("4f5dab52-6d4e-4a99-9b7f-5e6f708192a3", REL_B),
    ],
  });
  api.listTrainerCheckinInbox.mockResolvedValue({ items: [], nextCursor: null });
  api.listClients.mockResolvedValue({ items: [], nextCursor: null });
  api.getClientWorkspace.mockResolvedValue({
    header: {
      traineeDisplayName: "Rohan Mehta",
      goalShort: "Fat loss",
      startedAt: "2026-10-01T00:00:00.000Z",
      traineeTimezone: "Asia/Kolkata",
    },
  });
  api.getException.mockResolvedValue(exceptionDetail(type, sourceEntityType));
  api.getWorkoutAssignment.mockRejectedValue(new TypeError("Failed to fetch"));
  api.getMealAssignment.mockRejectedValue(new TypeError("Failed to fetch"));
  api.getResponsiveness.mockReturnValue(new Promise(() => {}));
}

let queue: NoticeQueue;

function mount() {
  return render(
    <NoticeHost queue={queue}>
      <AttentionTab
        onOpenClients={vi.fn()}
        onReviewException={vi.fn()}
        onReviewCheckin={vi.fn()}
      />
    </NoticeHost>,
  );
}

async function openSheet() {
  fireEvent.click(
    await screen.findByRole("button", { name: /^Review Rohan Mehta/ }),
  );
  await screen.findByTestId("review-sheet-noted");
}

beforeEach(() => {
  queue = createNoticeQueue();
  clearTrainerCache();
  setTrainerCacheOwner(null);
  setTrainerCacheOwner(TRAINER);
  openContextualWhatsApp.mockClear();
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe("AttentionTab review sheet (Z12-51)", () => {
  it("Remind opens the FitBud reminder sheet, never WhatsApp", async () => {
    loadOk();
    mount();
    await openSheet();
    const nudge = await screen.findByTestId("review-sheet-remind");
    await waitFor(() => expect(nudge.getAttribute("aria-disabled")).not.toBe("true"));
    fireEvent.click(nudge);
    await screen.findByText(/nudged you/);
    expect(openContextualWhatsApp).not.toHaveBeenCalled();
  });

  it("Z14-3: Noted, keep open and Resolve… drop the kept item so it is read fresh next time", async () => {
    loadOk();
    mount();
    await openSheet();
    // The sheet kept the item it just loaded, fresh.
    await waitFor(() => expect(readReviewItem(EX_ID)?.stale).toBe(false));

    api.acknowledgeException.mockResolvedValue({});
    fireEvent.click(screen.getByTestId("review-sheet-noted"));
    await waitFor(() => expect(api.acknowledgeException).toHaveBeenCalled());
    await waitFor(() => expect(readReviewItem(EX_ID)?.stale).toBe(true));
  });

  it("Z14-3: Resolve… from the sheet drops the kept item", async () => {
    loadOk();
    mount();
    await openSheet();
    await waitFor(() => expect(readReviewItem(EX_ID)?.stale).toBe(false));
    fireEvent.click(screen.getByTestId("review-sheet-resolve"));
    fireEvent.click(await screen.findByText("Talked to Rohan"));
    api.acknowledgeException.mockResolvedValue({});
    api.resolveException.mockResolvedValue({});
    fireEvent.click(screen.getByTestId("resolve-confirm"));
    await screen.findByText("All done for Rohan");
    expect(readReviewItem(EX_ID)?.stale).toBe(true);
  });

  it("does not offer Remind for a logged meal", async () => {
    loadOk("meal_deviation", "meal_assignment");
    mount();
    await openSheet();
    expect(screen.queryByTestId("review-sheet-remind")).toBeNull();
    expect(screen.getByTestId("review-sheet-resolve")).toBeTruthy();
  });

  it("Resolve… sends the trainer's outcome, then shows resolved and all-resolved", async () => {
    loadOk();
    mount();
    await openSheet();
    fireEvent.click(screen.getByTestId("review-sheet-resolve"));
    fireEvent.click(await screen.findByText("Talked to Rohan"));
    api.acknowledgeException.mockResolvedValue({});
    api.resolveException.mockResolvedValue({});
    fireEvent.click(screen.getByTestId("resolve-confirm"));
    await screen.findByText("All done for Rohan");
    // Open item: marked reviewed first (the API resolves acknowledged items),
    // then resolved with the outcome the trainer chose. Nothing auto-resolves.
    expect(api.acknowledgeException).toHaveBeenCalledWith(EX_ID, {}, expect.any(String));
    expect(api.resolveException).toHaveBeenCalledWith(
      EX_ID,
      { note: null, interventionKind: "resolve", outcome: "talked" },
      expect.any(String),
    );
    expect(screen.getByText("Resolved · Talked to client")).toBeTruthy();
    // Step back onto the item: read only, with the resolved banner and no Undo.
    fireEvent.click(screen.getByRole("button", { name: "Previous item" }));
    await screen.findByText("Resolved by you · just now · Talked to client");
    expect(screen.queryByTestId("review-sheet-undo")).toBeNull();
    expect(screen.queryByTestId("review-sheet-resolve")).toBeNull();
  });

  it("keeps the same resolve key on a retry after a failed resolve, and never re-notes", async () => {
    loadOk();
    mount();
    await openSheet();
    fireEvent.click(screen.getByTestId("review-sheet-resolve"));
    fireEvent.click(await screen.findByText("Talked to Rohan"));
    api.acknowledgeException.mockResolvedValue({});
    api.resolveException.mockRejectedValueOnce(
      new ApiClientError({
        code: "INTERNAL_ERROR",
        message: "An unexpected server error occurred.",
        requestId: "r",
        status: 500,
      }),
    );
    api.resolveException.mockResolvedValueOnce({});
    fireEvent.click(screen.getByTestId("resolve-confirm"));
    await screen.findByText("An unexpected server error occurred.");
    expect(api.acknowledgeException).toHaveBeenCalledTimes(1);
    expect(api.resolveException).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("resolve-confirm"));
    await screen.findByText("All done for Rohan");
    // Noted already succeeded: not sent again. Resolve retries on its key.
    expect(api.acknowledgeException).toHaveBeenCalledTimes(1);
    expect(api.resolveException).toHaveBeenCalledTimes(2);
    const resolveKeys = api.resolveException.mock.calls.map((call) => call[2]);
    expect(resolveKeys[0]).toEqual(expect.any(String));
    expect(resolveKeys[1]).toBe(resolveKeys[0]);
    expect(resolveKeys[0]).not.toBe(api.acknowledgeException.mock.calls[0]![2]);
    const [ackOrder] = api.acknowledgeException.mock.invocationCallOrder;
    const [firstResolve, secondResolve] = api.resolveException.mock.invocationCallOrder;
    expect(ackOrder!).toBeLessThan(firstResolve!);
    expect(firstResolve!).toBeLessThan(secondResolve!);
  });

  it("a lost success is success: 409 on retry and the exception re-fetches as resolved", async () => {
    loadOk();
    mount();
    await openSheet();
    fireEvent.click(screen.getByTestId("review-sheet-resolve"));
    fireEvent.click(await screen.findByText("Talked to Rohan"));
    api.acknowledgeException.mockResolvedValue({});
    api.resolveException.mockRejectedValue(
      new ApiClientError({
        code: "INVALID_TRANSITION",
        message: "Exception must be acknowledged before it can be resolved.",
        requestId: "r",
        status: 409,
      }),
    );
    api.getException.mockResolvedValue({
      ...exceptionDetail("missed_workout", "workout_assignment", "resolved"),
      resolvedAt: "2026-11-11T01:00:00.000Z",
      closedReason: "trainer",
    });
    fireEvent.click(screen.getByTestId("resolve-confirm"));
    await screen.findByText("All done for Rohan");
    expect(
      screen.queryByText("Exception must be acknowledged before it can be resolved."),
    ).toBeNull();
  });

  it("a 409 for an item that is not resolved keeps the API's error", async () => {
    loadOk();
    mount();
    await openSheet();
    fireEvent.click(screen.getByTestId("review-sheet-resolve"));
    fireEvent.click(await screen.findByText("Talked to Rohan"));
    api.acknowledgeException.mockResolvedValue({});
    api.resolveException.mockRejectedValue(
      new ApiClientError({
        code: "IDEMPOTENCY_KEY_REUSE",
        message: "Idempotency key was reused with a different request.",
        requestId: "r",
        status: 409,
      }),
    );
    fireEvent.click(screen.getByTestId("resolve-confirm"));
    await screen.findByText("Idempotency key was reused with a different request.");
    expect(screen.queryByText("1 resolved")).toBeNull();
  });

  it("a repeated in-sheet toast line is a new toast request, not a no-op", async () => {
    loadOk();
    const showToast = vi.spyOn(queue, "showToast");
    api.createTrainerNote.mockResolvedValue({});
    mount();
    await openSheet();
    for (let n = 0; n < 2; n += 1) {
      fireEvent.click(screen.getByTestId("review-sheet-add-note"));
      fireEvent.change(await screen.findByLabelText("Note"), {
        target: { value: `Note ${n}` },
      });
      fireEvent.click(screen.getByTestId("note-save"));
      await waitFor(() => expect(api.createTrainerNote).toHaveBeenCalledTimes(n + 1));
    }
    const shown = () =>
      showToast.mock.calls.filter((call) => call[0].message === "Shown on Rohan's Today");
    await waitFor(() => expect(shown()).toHaveLength(2));
  });
});

describe("AttentionTab review sheet actions (Z14-23)", () => {
  it("shows Remind, Noted keep open, Resolve…, Add note and WhatsApp; no ⋯ menu, no caption, no Next item", async () => {
    loadOk();
    mount();
    await openSheet();
    expect(screen.getByRole("button", { name: "Remind Rohan" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Noted, keep open" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resolve…" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add note" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "WhatsApp" })).toBeTruthy();
    expect(screen.queryByTestId("review-sheet-more")).toBeNull();
    expect(screen.queryByLabelText("More actions")).toBeNull();
    expect(screen.queryByText(/Mark reviewed|Nudge/)).toBeNull();
    expect(screen.queryByTestId("review-sheet-next-item")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("Noted, keep open shows the state line with Undo and keeps Remind and Resolve…", async () => {
    loadOk();
    mount();
    await openSheet();
    api.acknowledgeException.mockResolvedValue({});
    fireEvent.click(screen.getByTestId("review-sheet-noted"));
    // One item, now noted: the all-done summary says it is still open.
    await screen.findByText("All done for Rohan");
    expect(screen.getByText("1 noted, still open")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to Attention" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous item" }));
    await screen.findByText("Noted · still open");
    expect(screen.getByTestId("review-sheet-undo")).toBeTruthy();
    expect(screen.getByTestId("review-sheet-remind")).toBeTruthy();
    expect(screen.getByTestId("review-sheet-resolve")).toBeTruthy();
    expect(screen.queryByTestId("review-sheet-noted")).toBeNull();
  });

  it("Add note opens the note sheet and WhatsApp opens a wa.me chat", async () => {
    loadOk();
    mount();
    await openSheet();
    fireEvent.click(screen.getByTestId("review-sheet-whatsapp"));
    expect(openContextualWhatsApp).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("review-sheet-add-note"));
    expect(await screen.findByLabelText("Note")).toBeTruthy();
  });
});

describe("AttentionTab Asked toast (Z12-51)", () => {
  it("a second Marked answered shows its own toast and Undo after the first left early", async () => {
    loadOk();
    api.answerCoachAsk.mockResolvedValue({});
    mount();
    const replies = await screen.findAllByText("Reply");
    fireEvent.click(replies[0]!);
    expect(await screen.findByText("Marked answered")).toBeTruthy();
    // The queue lets the toast go early (a tap outside it); AttentionTab is not told.
    act(() => {
      const current = queue.getSnapshot().toast;
      if (current) queue.dismiss(current.id, "close");
    });
    await waitFor(() => expect(screen.queryByText("Marked answered")).toBeNull());
    fireEvent.click(screen.getByText("Reply"));
    expect(await screen.findByText("Marked answered")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
  });
});
