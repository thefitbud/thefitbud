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

describe("CheckinReviewPage answers (Z6-2c / Z12-8)", () => {
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
    const heading = screen.getByRole("heading", { name: /Rohan wrote/ });
    const dl = heading.closest("section")!.querySelector("dl");
    return Array.from(dl?.querySelectorAll("div") ?? []).map((row) => [
      row.querySelector("dt")!.textContent,
      row.querySelector("dd")!.textContent?.replace(/\s+/g, " ").trim(),
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
    await screen.findByRole("heading", { name: /Rohan wrote/ });
    expect(answerList()).toEqual([
      ["Waist", "82 cm"],
      ["Arm", "31.5 cm"],
      ["Front", "Photo noted"],
      ["Energy", "4"],
      ["Sleep quality", "3"],
      ["Any aches or pains?", "Left knee, mildReview"],
    ]);
  });

  it("waist never shows the weight value, and no wellbeing row without that question", async () => {
    api.getCheckinReviewContext.mockResolvedValue(
      v2Context({ bodyWeightKg: 86.4, fieldAnswers: { "q-energy": 2 } }),
    );
    render(pageTree(0));
    await screen.findByRole("heading", { name: /Rohan wrote/ });
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
    await screen.findByRole("heading", { name: /Rohan wrote/ });
    expect(answerList()).toEqual([["Wellbeing", "Slept badly"]]);
  });

  it("puts Your review in the right card, not a footer strip", async () => {
    api.getCheckinReviewContext.mockResolvedValue(reviewContext(false));
    render(pageTree(0));
    expect(await screen.findByRole("heading", { name: "Your review" })).toBeTruthy();
    expect(screen.getByTestId("review-action-bar").className).toContain(
      "checkin-review-card",
    );
    expect(screen.queryByText(/Form v\d+ \(pinned\)/i)).toBeNull();
    expect(screen.getByRole("heading", { name: /Context · last 7 days/ })).toBeTruthy();
  });

  it("places Your review above Context so actions stay in the first viewport", async () => {
    api.getCheckinReviewContext.mockResolvedValue(reviewContext(false));
    const { container } = render(pageTree(0));
    await screen.findByRole("heading", { name: "Your review" });
    const side = container.querySelector(".checkin-review-side");
    expect(side).toBeTruthy();
    const headings = Array.from(
      side!.querySelectorAll("h2"),
    ).map((node) => node.textContent?.trim());
    expect(headings[0]).toBe("Your review");
    expect(headings[1]).toMatch(/Context · last 7 days/);
    expect(screen.getByRole("button", { name: "Save review" })).toBeTruthy();
  });

  it("reviewed state shows a Reviewed pill on the right card", async () => {
    api.getCheckinReviewContext.mockResolvedValue(reviewContext(true));
    render(pageTree(0));
    expect((await screen.findAllByText("Reviewed")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Edit review" })).toBeTruthy();
    expect(screen.getByTestId("review-action-bar").textContent).toMatch(/Reviewed by you/);
  });
});

describe("CheckinReviewPage layout (W13-7)", () => {
  const OTHER_REL = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
  const OTHER_CHECKIN = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

  it("renders the answers column and the review column side by side", async () => {
    api.getCheckinReviewContext.mockResolvedValue(reviewContext(false));
    const { container } = render(pageTree(0));
    await screen.findByRole("heading", { name: "Your review" });
    const grid = container.querySelector(".checkin-review-grid")!;
    expect(grid.children).toHaveLength(2);
    const main = screen.getByTestId("checkin-answers-col");
    expect(main.parentElement).toBe(grid);
    expect(main.querySelector("#answers-h")).toBeTruthy();
    expect(grid.querySelector("aside.checkin-review-side")).toBeTruthy();
    expect(main.contains(screen.getByTestId("review-action-bar"))).toBe(false);
  });

  it("keeps Save review and WhatsApp in the actions bar", async () => {
    api.getCheckinReviewContext.mockResolvedValue(reviewContext(false));
    render(pageTree(0));
    await screen.findByRole("heading", { name: "Your review" });
    const bar = screen.getByTestId("checkin-review-bar");
    expect(bar.textContent).toContain("Save review");
    expect(bar.textContent).toContain("Message on WhatsApp");
    expect(bar.textContent).toContain("Saving closes this check-in in Needs attention.");
    expect(screen.getByTestId("review-action-bar").contains(bar)).toBe(true);
  });

  it("has no bar and no Save review once reviewed, and never says Mark reviewed", async () => {
    api.getCheckinReviewContext.mockResolvedValue(reviewContext(true));
    const { container } = render(pageTree(0));
    await screen.findByRole("button", { name: "Edit review" });
    expect(screen.queryByTestId("checkin-review-bar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save review" })).toBeNull();
    expect(screen.getByText("Saved note")).toBeTruthy();
    expect(container.textContent).not.toMatch(/mark(ed|ing)? reviewed/i);
  });

  it("does not use the old Mark reviewed wording while a review is open", async () => {
    api.getCheckinReviewContext.mockResolvedValue(reviewContext(false));
    const { container } = render(pageTree(0));
    await screen.findByRole("heading", { name: "Your review" });
    expect(container.textContent).not.toMatch(/mark(ed|ing)? reviewed/i);
  });

  it("shows the stored measurements as a This week table with the change", async () => {
    const context = reviewContext(false);
    context.measurements = [
      { type: "body_weight_kg", value: "64.2", unit: "kg", observedAt: "2026-10-26T05:00:00.000Z" },
      { type: "body_weight_kg", value: "64.9", unit: "kg", observedAt: "2026-10-19T05:00:00.000Z" },
      { type: "waist_cm", value: "77.2", unit: "cm", observedAt: "2026-10-26T05:00:00.000Z" },
    ] as CheckinReviewContext["measurements"];
    api.getCheckinReviewContext.mockResolvedValue(context);
    render(pageTree(0));
    const section = (await screen.findByTestId("checkin-this-week")) as HTMLElement;
    const rows = Array.from(section.querySelectorAll("tbody tr")).map((row) =>
      Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent),
    );
    expect(rows).toEqual([
      ["Body weight", "64.9 kg", "64.2 kg", "−0.7"],
      ["Waist", "—", "77.2 cm", "—"],
    ]);
  });

  it("shows no This week table without stored measurements", async () => {
    api.getCheckinReviewContext.mockResolvedValue(reviewContext(false));
    render(pageTree(0));
    await screen.findByRole("heading", { name: "Your review" });
    expect(screen.queryByTestId("checkin-this-week")).toBeNull();
  });

  it("shows where this check-in sits in the to-review queue, with both neighbours", async () => {
    api.listTrainerCheckinInbox.mockResolvedValue({
      items: [
        { checkin: { id: OTHER_CHECKIN, status: "submitted" }, coachingRelationshipId: OTHER_REL },
        { checkin: { id: CHECKIN_ID, status: "submitted" }, coachingRelationshipId: REL_ID },
        { checkin: { id: "cccccccc-3333-4333-8333-cccccccccccc", status: "reviewed" }, coachingRelationshipId: REL_ID },
        { checkin: { id: "dddddddd-4444-4444-8444-dddddddddddd", status: "submitted" }, coachingRelationshipId: OTHER_REL },
      ],
      nextCursor: null,
    });
    api.getCheckinReviewContext.mockResolvedValue(reviewContext(false));
    render(pageTree(0));
    expect(await screen.findByText("2 of 3 to review")).toBeTruthy();
    const prev = screen.getByRole("link", { name: "Previous check-in to review" });
    expect(prev.getAttribute("href")).toBe(`/clients/${OTHER_REL}/check-ins/${OTHER_CHECKIN}`);
    expect(screen.getByRole("link", { name: "Next check-in to review" })).toBeTruthy();
  });

  it("shows no pager when the check-in is not in the queue", async () => {
    api.getCheckinReviewContext.mockResolvedValue(reviewContext(false));
    render(pageTree(0));
    await screen.findByRole("heading", { name: "Your review" });
    expect(screen.queryByText(/to review$/)).toBeNull();
  });
});
