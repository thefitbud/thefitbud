import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import { fireEvent, mockAuth, render, screen, waitFor } from "../test/render";
import {
  endedBannerText,
  exceptionFooterActions,
  exceptionHeaderSubtitle,
  isNetworkFailure,
  isNotFound,
  offlineBannerText,
  resolvedBannerText,
  resolvedOutcomePhrase,
  reviewedBannerText,
} from "./sheets/exceptionStateContent";
import { exceptionWeekModel } from "./sheets/exceptionWeek";

const api = {
  getException: vi.fn(),
  getClientWorkspace: vi.fn(),
  getWorkoutAssignment: vi.fn(),
  getMealAssignment: vi.fn(),
  listWorkoutAssignments: vi.fn(),
  listMealAssignments: vi.fn(),
  acknowledgeException: vi.fn(),
  resolveException: vi.fn(),
  createTrainerNote: vi.fn(),
  getResponsiveness: vi.fn(),
  nudgeActivity: vi.fn(),
};
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => mockAuth({ api, me: null }),
}));
vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));
const openContextualWhatsApp = vi.hoisted(() => vi.fn(async () => true));
vi.mock("./whatsapp", () => ({ openContextualWhatsApp }));

import { ExceptionReviewScreen } from "./ExceptionReviewScreen";

const ID = "11111111-1111-4111-8111-111111111111";
const REL = "22222222-2222-4222-8222-222222222222";

function exception(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    coachingRelationshipId: REL,
    type: "missed_workout",
    severity: "critical",
    status: "active",
    ruleVersion: "mvp.v2",
    sourceEntityType: "workout_assignment",
    sourceEntityId: "33333333-3333-4333-8333-333333333333",
    summary: "Lower body A was not logged.",
    details: { localDate: "2026-10-13", workoutDayName: "Lower body A" },
    detectedAt: "2026-10-14T00:05:00.000Z",
    activatedAt: null,
    acknowledgedAt: null,
    resolvedAt: null,
    closedReason: null,
    createdAt: "2026-10-14T00:05:00.000Z",
    updatedAt: "2026-10-14T00:05:00.000Z",
    actions: [],
    ...over,
  };
}

function workspace(endedAt: string | null) {
  return {
    header: {
      traineeDisplayName: "Kavya Nair",
      clientWhatsappE164: "919800000001",
      traineeTimezone: "Asia/Kolkata",
      goalShort: "Fat loss",
      startedAt: "2026-09-01T00:00:00.000Z",
      endedAt,
    },
  };
}

function renderScreen(onOpenClient = vi.fn(), onBack = vi.fn()) {
  render(
    <ExceptionReviewScreen
      exceptionId={ID}
      onBack={onBack}
      onOpenClient={onOpenClient}
    />,
  );
  return { onOpenClient, onBack };
}

function button(name: string) {
  return screen.getByRole("button", { name });
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  openContextualWhatsApp.mockClear();
  api.getWorkoutAssignment.mockRejectedValue(new TypeError("Failed to fetch"));
  api.listWorkoutAssignments.mockResolvedValue({ items: [], nextCursor: null });
  api.listMealAssignments.mockResolvedValue({ items: [], nextCursor: null });
});

describe("ExceptionReviewScreen states", () => {
  it("shows a skeleton while loading", () => {
    api.getException.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByLabelText("Loading exception")).toBeTruthy();
  });

  it("TM-04g: a 404 shows the not-found state with Back to Needs you and nothing live", async () => {
    api.getException.mockRejectedValue(
      new ApiClientError({ code: "NOT_FOUND", message: "x", requestId: "r", status: 404 }),
    );
    const { onBack } = renderScreen();
    await screen.findByText("This item is no longer available");
    fireEvent.click(button("Back to Needs you"));
    expect(onBack).toHaveBeenCalled();
    expect(screen.queryByText("Mark reviewed")).toBeNull();
    expect(screen.queryByLabelText("More actions")).toBeNull();
  });

  it("TM-04a: an open item offers Mark reviewed and Nudge, the ⋯ menu, and no Resolve", async () => {
    api.getException.mockResolvedValue(exception());
    api.getClientWorkspace.mockResolvedValue(workspace(null));
    renderScreen();
    await screen.findByText("Kavya Nair");
    expect(screen.getByRole("heading", { name: "Missed workout" })).toBeTruthy();
    expect(screen.getByText("Critical")).toBeTruthy();
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.getByText("What happened")).toBeTruthy();
    expect(button("Mark reviewed")).toBeTruthy();
    expect(button("Nudge")).toBeTruthy();
    expect(screen.getByLabelText("More actions")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
    expect(screen.queryByText(/workout_assignment|mvp\.v2/)).toBeNull();
  });

  it("Mark reviewed acknowledges and lands on TM-04e with Resolve primary", async () => {
    api.getException.mockResolvedValueOnce(exception());
    api.getClientWorkspace.mockResolvedValue(workspace(null));
    renderScreen();
    await screen.findByText("Kavya Nair");
    api.acknowledgeException.mockResolvedValue({});
    api.getException.mockResolvedValue(
      exception({ status: "acknowledged", acknowledgedAt: "2026-10-20T04:22:00.000Z" }),
    );
    fireEvent.click(button("Mark reviewed"));
    await screen.findByText(/^Reviewed by you at .* It stays in Needs you until it's resolved\.$/);
    expect(api.acknowledgeException).toHaveBeenCalledWith(ID, {}, expect.any(String));
    expect(screen.getByText("Reviewed")).toBeTruthy();
    expect(button("Resolve")).toBeTruthy();
    expect(button("Nudge")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark reviewed" })).toBeNull();
  });

  it("Resolve → TM-04d sends the trainer's outcome and note → TM-04f read only", async () => {
    api.getException.mockResolvedValueOnce(exception({ status: "acknowledged" }));
    api.getClientWorkspace.mockResolvedValue(workspace(null));
    renderScreen();
    await screen.findByText("Kavya Nair");
    fireEvent.click(button("Resolve"));
    await screen.findByText("Note (only you)");
    fireEvent.click(screen.getByText("Talked to Kavya"));
    fireEvent.change(screen.getByLabelText("Note (only you)"), {
      target: { value: "Travelling till Fri" },
    });
    api.resolveException.mockResolvedValue({});
    api.getException.mockResolvedValue(
      exception({
        status: "resolved",
        resolvedAt: "2026-10-17T04:35:00.000Z",
        closedReason: "trainer",
      }),
    );
    fireEvent.click(screen.getByTestId("resolve-confirm"));
    await screen.findByText(/^Resolved by you · .* · Talked to Kavya\.$/);
    expect(api.resolveException).toHaveBeenCalledWith(
      ID,
      { note: "Travelling till Fri", interventionKind: "resolve", outcome: "talked" },
      expect.any(String),
    );
    expect(screen.getByText("Resolved")).toBeTruthy();
    // happy-dom never ends the sheet's slide-out, so check the footer by id.
    expect(screen.queryByTestId("exception-resolve")).toBeNull();
    expect(screen.queryByRole("button", { name: "Nudge" })).toBeNull();
    expect(screen.queryByLabelText("More actions")).toBeNull();
  });

  it("a resolve error stays in the sheet as the API's curated text", async () => {
    api.getException.mockResolvedValue(exception({ status: "acknowledged" }));
    api.getClientWorkspace.mockResolvedValue(workspace(null));
    renderScreen();
    await screen.findByText("Kavya Nair");
    fireEvent.click(button("Resolve"));
    api.resolveException.mockRejectedValue(
      new ApiClientError({
        code: "INVALID_TRANSITION",
        message: "Exception must be acknowledged before it can be resolved.",
        requestId: "r",
        status: 409,
      }),
    );
    fireEvent.click(await screen.findByTestId("resolve-confirm"));
    await screen.findByText("Exception must be acknowledged before it can be resolved.");
  });

  it("TM-04i: an ended client is read only: banner, Ended chip, no actions or ⋯", async () => {
    api.getException.mockResolvedValue(exception({ status: "acknowledged" }));
    api.getClientWorkspace.mockResolvedValue(workspace("2026-10-03T12:30:00.000Z"));
    renderScreen();
    await screen.findByText(/This is read only\./);
    expect(screen.getByText("Ended")).toBeTruthy();
    expect(screen.getByText(/Fat loss · ended /)).toBeTruthy();
    for (const name of ["Mark reviewed", "Nudge", "Resolve"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByLabelText("More actions")).toBeNull();
  });

  it("Nudge is offered for unlogged items only, not for logged meals or skips", async () => {
    api.getClientWorkspace.mockResolvedValue(workspace(null));
    const cases: Array<[string, string]> = [
      ["meal_deviation", "meal_assignment"],
      ["meal_logged_later", "meal_assignment"],
      ["skipped_meal", "meal_assignment"],
      ["skipped_workout", "workout_assignment"],
    ];
    for (const [type, sourceEntityType] of cases) {
      api.getMealAssignment.mockRejectedValue(new TypeError("Failed to fetch"));
      api.getException.mockResolvedValue(exception({ type, sourceEntityType }));
      const view = render(
        <ExceptionReviewScreen exceptionId={ID} onBack={() => {}} onOpenClient={() => {}} />,
      );
      await screen.findByText("Kavya Nair");
      expect(screen.queryByRole("button", { name: "Nudge" })).toBeNull();
      expect(button("Mark reviewed")).toBeTruthy();
      view.unmount();
    }
  });

  it("offers no live actions while ended-ness is unknown (workspace fails)", async () => {
    api.getException.mockResolvedValue(exception());
    api.getClientWorkspace.mockRejectedValue(new Error("boom"));
    renderScreen();
    await screen.findByText("Could not check the client's status. (EXC-WS)");
    expect(screen.queryByRole("button", { name: "Mark reviewed" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nudge" })).toBeNull();
    expect(button("Try again")).toBeTruthy();
  });

  it("a proven network failure on first load shows the offline banner, not a blame message", async () => {
    api.getException.mockRejectedValue(new TypeError("Network request failed"));
    renderScreen();
    await screen.findByText("You're offline. Reconnect and try again.");
    expect(button("Try again")).toBeTruthy();
  });

  it("a non-network failure is not called offline", async () => {
    api.getException.mockRejectedValue(new TypeError("undefined is not a function"));
    renderScreen();
    await screen.findByText("Could not load exception. (EXC-LOAD)");
    expect(screen.queryByText(/offline/i)).toBeNull();
  });

  it("TM-04h: going offline keeps the item and disables Mark reviewed and Nudge", async () => {
    api.getException.mockResolvedValue(exception());
    api.getClientWorkspace.mockResolvedValue(workspace(null));
    renderScreen();
    await screen.findByText("Kavya Nair");
    api.acknowledgeException.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(button("Mark reviewed"));
    await screen.findByText("You're offline. Reviewing and nudging need a connection.");
    expect(button("Mark reviewed").getAttribute("aria-disabled")).toBe("true");
    expect(button("Nudge").getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Kavya Nair")).toBeTruthy();
  });

  it("⋯ → Add note saves through the note contract with one key", async () => {
    api.getException.mockResolvedValue(exception());
    api.getClientWorkspace.mockResolvedValue(workspace(null));
    renderScreen();
    await screen.findByText("Kavya Nair");
    fireEvent.click(screen.getByLabelText("More actions"));
    fireEvent.click(await screen.findByText("Add note"));
    await screen.findByRole("heading", { name: "Note for Kavya" });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Shorter sessions" } });
    api.createTrainerNote.mockResolvedValue({});
    fireEvent.click(screen.getByLabelText("Save"));
    await waitFor(() =>
      expect(api.createTrainerNote).toHaveBeenCalledWith(
        REL,
        { body: "Shorter sessions", visibility: "client" },
        expect.any(String),
      ),
    );
  });

  it("⋯ → WhatsApp opens a wa.me chat with no template; ⋯ → profile opens the client", async () => {
    api.getException.mockResolvedValue(exception());
    api.getClientWorkspace.mockResolvedValue(workspace(null));
    const { onOpenClient } = renderScreen();
    await screen.findByText("Kavya Nair");
    fireEvent.click(screen.getByLabelText("More actions"));
    fireEvent.click(await screen.findByText("Message on WhatsApp"));
    expect(openContextualWhatsApp).toHaveBeenCalledWith({ phoneE164: "919800000001" });
    fireEvent.click(screen.getByLabelText("More actions"));
    fireEvent.click(await screen.findByText("Open Kavya's profile"));
    expect(onOpenClient).toHaveBeenCalledWith(REL);
  });
});

describe("state copy and predicates", () => {
  it("formats the banners like the mocks", () => {
    const now = new Date("2026-10-20T00:00:00Z");
    expect(endedBannerText("Kavya", "2026-10-03T12:30:00.000Z", "Asia/Kolkata", now)).toBe(
      "Coaching with Kavya ended on Sat 3 Oct. This is read only.",
    );
    expect(
      resolvedBannerText(
        { resolvedAt: "2026-10-17T04:35:00.000Z", closedReason: "trainer" },
        "Asia/Kolkata",
        now,
      ),
    ).toBe("Resolved by you · Sat 17 Oct, 10:05 am");
    expect(
      resolvedBannerText(
        { resolvedAt: "2026-10-17T04:35:00.000Z", closedReason: "trainer" },
        "Asia/Kolkata",
        now,
        resolvedOutcomePhrase("talked", "Rohan"),
      ),
    ).toBe("Resolved by you · Sat 17 Oct, 10:05 am · Talked to Rohan.");
    expect(reviewedBannerText("2026-10-20T04:22:00.000Z", "Asia/Kolkata")).toBe(
      "Reviewed by you at 9:52 am. It stays in Needs you until it's resolved.",
    );
    expect(offlineBannerText(true)).toBe(
      "You're offline. Reviewing and nudging need a connection.",
    );
    expect(
      exceptionHeaderSubtitle({
        goalShort: "Fat loss",
        weekNumber: 6,
        ageLabel: "since 5 d",
        endedDay: null,
      }),
    ).toBe("Fat loss · week 6 · since 5 d");
  });

  it("footer actions follow TM-04a and TM-04e; resolved and ended have none", () => {
    expect(exceptionFooterActions("open", true)).toEqual({
      secondary: "markReviewed",
      primary: "nudge",
    });
    expect(exceptionFooterActions("reviewed", true)).toEqual({
      secondary: "nudge",
      primary: "resolve",
    });
    expect(exceptionFooterActions("reviewed", false)).toEqual({
      secondary: null,
      primary: "resolve",
    });
    expect(exceptionFooterActions("resolved", true)).toEqual({ secondary: null, primary: null });
    expect(exceptionFooterActions("ended", true)).toEqual({ secondary: null, primary: null });
  });

  it("builds This week from persisted assignments, as counts", () => {
    const dates = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];
    const week = exceptionWeekModel({
      dates,
      today: "2026-11-14",
      workouts: [
        { localDate: "2026-11-10", status: "missed" },
        { localDate: "2026-11-12", status: "missed" },
        { localDate: "2026-11-15", status: "pending" },
      ],
      meals: [
        { localDate: "2026-11-09", status: "confirmed" },
        { localDate: "2026-11-09", status: "pending" },
      ],
    });
    expect(week.days.map((day) => day.mark)).toEqual([
      "rest",
      "missed",
      "rest",
      "missed",
      "rest",
      "today",
      "upcoming",
    ]);
    expect(week.days.map((day) => day.letter).join("")).toBe("MTWTFSS");
    expect([week.workoutsDone, week.workoutsPlanned, week.mealsLogged, week.mealsPlanned]).toEqual([0, 3, 1, 2]);
  });

  it("isNetworkFailure is true only for proven network failures", () => {
    expect(isNetworkFailure(new TypeError("Network request failed"))).toBe(true);
    expect(isNetworkFailure(new TypeError("x is not a function"))).toBe(false);
    expect(isNetworkFailure(new Error("fetch"))).toBe(false);
    expect(
      isNetworkFailure(
        new ApiClientError({ code: "NETWORK_ERROR", message: "m", requestId: "", status: 0 }),
      ),
    ).toBe(true);
    expect(
      isNetworkFailure(
        new ApiClientError({ code: "X", message: "m", requestId: "r", status: 500 }),
      ),
    ).toBe(false);
    expect(isNotFound(new ApiClientError({ code: "N", message: "m", requestId: "r", status: 404 }))).toBe(true);
  });
});
