/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import type { CheckinReviewContext } from "@fitbud/contracts";

const REL_ID = "77777777-7777-4777-8777-777777777777";
const CHECKIN_ID = "88888888-8888-4888-8888-888888888888";
const TRAINER_ID = "99999999-9999-4999-8999-999999999999";

const api = vi.hoisted(() => ({
  getCheckinReviewContext: vi.fn(),
  listTrainerCheckinInbox: vi.fn(),
}));

vi.mock("../lib/api", () => ({ apiClient: api }));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { timezone: "Asia/Kolkata" } }),
}));

import { CheckinReviewPage } from "./CheckinReviewPage";

function reviewContext(reviewed: boolean): CheckinReviewContext {
  const at = "2026-10-27T05:30:00.000Z";
  return {
    checkin: {
      id: CHECKIN_ID,
      coachingRelationshipId: REL_ID,
      checkinScheduleId: null,
      localDate: "2026-10-27",
      windowStartsAt: "2026-10-26T18:30:00.000Z",
      windowEndsAt: "2026-10-28T18:30:00.000Z",
      recordStatus: "submitted",
      recordVersion: 2,
      definitionVersion: 1,
      checkinFormVersionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      answers: null,
      submittedAt: at,
      status: reviewed ? "reviewed" : "submitted",
      review: reviewed
        ? {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            checkinId: CHECKIN_ID,
            coachingRelationshipId: REL_ID,
            trainerUserId: TRAINER_ID,
            outcome: "acknowledged",
            notes: "Saved note",
            createdAt: at,
            updatedAt: at,
          }
        : null,
      createdAt: at,
      updatedAt: at,
    },
    pinnedForm: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      templateId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      key: "weekly",
      version: 1,
      scope: "global",
      fields: [],
      createdAt: at,
    },
    recentWorkoutAdherence: { completed: 3, missed: 1, modified: 0, skipped: 0, pending: 1 },
    recentMealCompliance: { confirmed: 10, modified: 2, skipped: 1, overdue: 0, pending: 2 },
    activeExceptions: [],
    photos: [],
    measurements: [],
    previousNotes: [],
    currentPlan: null,
    currentConfiguration: null,
  } as CheckinReviewContext;
}

function pageTree(refreshEpoch: number) {
  const context = {
    workspace: {
      header: {
        traineeDisplayName: "Rohan Sharma",
        traineeTimezone: "Asia/Kolkata",
        clientWhatsappE164: null,
      },
    },
    relationshipId: REL_ID,
    refreshEpoch,
    online: true,
    ended: false,
  };
  return (
    <MemoryRouter initialEntries={[`/clients/${REL_ID}/check-ins/${CHECKIN_ID}`]}>
      <Routes>
        <Route path="/clients/:relationshipId" element={<Outlet context={context} />}>
          <Route path="check-ins/:checkinId" element={<CheckinReviewPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  api.listTrainerCheckinInbox.mockResolvedValue({ items: [], nextCursor: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CheckinReviewPage on a workspace refresh", () => {
  it("keeps an edit of an existing review the trainer is typing", async () => {
    api.getCheckinReviewContext.mockResolvedValue(reviewContext(true));
    const view = render(pageTree(0));
    fireEvent.click(await screen.findByRole("button", { name: "Edit review" }));
    const note = screen.getByPlaceholderText("Optional note") as HTMLTextAreaElement;
    expect(note.value).toBe("Saved note");
    fireEvent.change(note, { target: { value: "Rewritten note in progress" } });

    view.rerender(pageTree(1));
    await waitFor(() => expect(api.getCheckinReviewContext).toHaveBeenCalledTimes(2));

    expect((screen.getByPlaceholderText("Optional note") as HTMLTextAreaElement).value).toBe(
      "Rewritten note in progress",
    );
    expect(screen.queryByRole("button", { name: "Edit review" })).toBeNull();
  });

  it("shows the newest response when refreshes resolve out of order", async () => {
    api.getCheckinReviewContext.mockResolvedValueOnce(reviewContext(true));
    const view = render(pageTree(0));
    await screen.findByRole("button", { name: "Edit review" });

    // Refresh 1 is slow and returns old data; refresh 2 is fast and newer.
    let resolveSlow: (value: CheckinReviewContext) => void = () => undefined;
    api.getCheckinReviewContext.mockImplementationOnce(
      () => new Promise<CheckinReviewContext>((resolve) => (resolveSlow = resolve)),
    );
    const newer = reviewContext(true);
    newer.checkin.review = { ...newer.checkin.review!, outcome: "needs_follow_up" };
    api.getCheckinReviewContext.mockResolvedValueOnce(newer);

    view.rerender(pageTree(1));
    await waitFor(() => expect(api.getCheckinReviewContext).toHaveBeenCalledTimes(2));
    view.rerender(pageTree(2));
    await waitFor(() => expect(api.getCheckinReviewContext).toHaveBeenCalledTimes(3));
    expect(await screen.findByText(/Needs follow-up/)).toBeTruthy();

    // The stale response lands last; it must not replace the newer one.
    await act(async () => {
      resolveSlow(reviewContext(true));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByText(/Needs follow-up/)).toBeTruthy();
    expect(screen.queryByText(/Loading review/i)).toBeNull();
  });

  it("keeps a first review the trainer is typing", async () => {
    api.getCheckinReviewContext.mockResolvedValue(reviewContext(false));
    const view = render(pageTree(0));
    const note = (await screen.findByPlaceholderText("Optional note")) as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "First review draft" } });

    view.rerender(pageTree(1));
    await waitFor(() => expect(api.getCheckinReviewContext).toHaveBeenCalledTimes(2));

    expect((screen.getByPlaceholderText("Optional note") as HTMLTextAreaElement).value).toBe(
      "First review draft",
    );
  });

  it("refetches quietly when not editing, without the loading state", async () => {
    api.getCheckinReviewContext.mockResolvedValue(reviewContext(true));
    const view = render(pageTree(0));
    await screen.findByRole("button", { name: "Edit review" });

    view.rerender(pageTree(1));
    expect(screen.queryByText(/Loading review/i)).toBeNull();
    await waitFor(() => expect(api.getCheckinReviewContext).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Edit review" })).toBeTruthy();
  });
});

describe("CheckinReviewPage answers (Z6-2c)", () => {
  const v2Fields = [
    { id: "q-weight", key: "weight", label: "Weight", type: "measurement", measurementType: "body_weight_kg", required: false },
    { id: "q-waist", key: "waist", label: "Waist", type: "measurement", measurementType: "waist_cm", required: false },
    { id: "q-arm", key: "arm", label: "Arm", type: "measurement", measurementType: "other", unit: "cm", required: false },
    { id: "q-front", key: "photo_front", label: "Front", type: "photo_intent", photoSlot: "front", required: false },
    { id: "q-energy", key: "energy", label: "Energy", type: "scale_1_5", required: false },
    { id: "q-sleep", key: "sleep_quality", label: "Sleep quality", type: "scale_1_5", required: false },
    { id: "q-notes", key: "notes", label: "Notes", type: "long_text", required: false },
    { id: "q-custom", label: "Any aches or pains?", type: "short_text", required: false },
  ] as const;

  function v2Context(answers: CheckinReviewContext["checkin"]["answers"]) {
    const context = reviewContext(false);
    context.checkin.answers = answers;
    context.pinnedForm = {
      ...context.pinnedForm,
      version: 2,
      fields: v2Fields as unknown as CheckinReviewContext["pinnedForm"]["fields"],
    };
    return context;
  }

  function answerList() {
    const heading = screen.getByRole("heading", { name: "Answers" });
    const dl = heading.closest("section")!.querySelector("dl");
    return Array.from(dl?.querySelectorAll("div") ?? []).map((row) => [
      row.querySelector("dt")!.textContent,
      row.querySelector("dd")!.textContent,
    ]);
  }

  it("lists only answered questions in form order, with units", async () => {
    api.getCheckinReviewContext.mockResolvedValue(
      v2Context({
        fieldAnswers: {
          "q-custom": "Left knee, mild",
          "q-sleep": 3,
          "q-arm": 31.5,
          "q-waist": 82,
          "q-front": "noted",
          "q-energy": 4,
        },
      }),
    );
    render(pageTree(0));
    await screen.findByRole("heading", { name: "Answers" });
    expect(answerList()).toEqual([
      ["Waist", "82 cm"],
      ["Arm", "31.5 cm"],
      ["Front", "Photo noted"],
      ["Energy", "4"],
      ["Sleep quality", "3"],
      ["Any aches or pains?", "Left knee, mild"],
    ]);
  });

  it("waist never shows the weight value, and no wellbeing row without that question", async () => {
    api.getCheckinReviewContext.mockResolvedValue(
      v2Context({ bodyWeightKg: 86.4, fieldAnswers: { "q-energy": 2 } }),
    );
    render(pageTree(0));
    await screen.findByRole("heading", { name: "Answers" });
    const rows = answerList();
    expect(rows).toEqual([
      ["Weight", "86.4 kg"],
      ["Energy", "2"],
    ]);
    expect(rows.some(([label]) => /wellbeing|waist/i.test(label ?? ""))).toBe(false);
  });

  it("a v1 form still shows the typed wellbeing under its own label", async () => {
    const context = reviewContext(false);
    context.pinnedForm = {
      ...context.pinnedForm,
      fields: [
        { id: "wellbeing", label: "Wellbeing", type: "short_text", required: true },
        { id: "notes", label: "Notes", type: "long_text", required: false },
      ],
    };
    context.checkin.answers = { wellbeing: "Slept badly", notes: null };
    api.getCheckinReviewContext.mockResolvedValue(context);
    render(pageTree(0));
    await screen.findByRole("heading", { name: "Answers" });
    expect(answerList()).toEqual([["Wellbeing", "Slept badly"]]);
  });
});
