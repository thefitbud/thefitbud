import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import { mockAuth, render, screen, waitFor } from "../test/render";
import {
  endedBannerText,
  isNetworkFailure,
  isNotFound,
  offlineBannerText,
  resolvedBannerText,
} from "./sheets/exceptionStateContent";

const api = {
  getException: vi.fn(),
  getClientWorkspace: vi.fn(),
  acknowledgeException: vi.fn(),
  resolveException: vi.fn(),
  createTrainerNote: vi.fn(),
};
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => mockAuth({ api, me: null }),
}));
vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));

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
      clientWhatsappE164: null,
      endedAt,
    },
  };
}

function renderScreen() {
  return render(
    <ExceptionReviewScreen exceptionId={ID} onBack={() => {}} onOpenClient={() => {}} />,
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe("ExceptionReviewScreen states", () => {
  it("shows a skeleton while loading, not the old loading text", () => {
    api.getException.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByLabelText("Loading exception")).toBeTruthy();
    expect(screen.queryByText("Loading exception…")).toBeNull();
  });

  it("shows the frame 39 state on a 404 and nothing live", async () => {
    api.getException.mockRejectedValue(
      new ApiClientError({ code: "NOT_FOUND", message: "x", requestId: "r", status: 404 }),
    );
    renderScreen();
    await screen.findByText("This item is no longer available");
    expect(screen.getByText("Back to Attention")).toBeTruthy();
    expect(screen.queryByText("Acknowledge")).toBeNull();
  });

  it("an ended client is fully read-only: no Acknowledge, Note, Resolve, Nudge or More", async () => {
    api.getException.mockResolvedValue(exception());
    api.getClientWorkspace.mockResolvedValue(workspace("2026-10-03T12:30:00.000Z"));
    renderScreen();
    await screen.findByText(/This item is read-only\./);
    expect(screen.queryByText("Acknowledge")).toBeNull();
    expect(screen.queryByText(/Note \(optional\)/)).toBeNull();
    expect(screen.queryByText("Nudge on WhatsApp")).toBeNull();
    expect(screen.queryByLabelText("More actions")).toBeNull();
  });

  it("an acknowledged item for an ended client has no Resolve", async () => {
    api.getException.mockResolvedValue(exception({ status: "acknowledged" }));
    api.getClientWorkspace.mockResolvedValue(workspace("2026-10-03T12:30:00.000Z"));
    renderScreen();
    await screen.findByText(/This item is read-only\./);
    expect(screen.queryByText("Resolve")).toBeNull();
  });

  it("offers no live actions while ended-ness is unknown (workspace fails)", async () => {
    api.getException.mockResolvedValue(exception());
    api.getClientWorkspace.mockRejectedValue(new Error("boom"));
    renderScreen();
    await screen.findByText("Could not check the client's status. (EXC-WS)");
    expect(screen.queryByText("Acknowledge")).toBeNull();
    expect(screen.queryByText("Nudge on WhatsApp")).toBeNull();
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("shows the resolved banner and no live actions", async () => {
    api.getException.mockResolvedValue(
      exception({
        status: "resolved",
        resolvedAt: "2026-10-17T04:35:00.000Z",
        closedReason: "trainer",
      }),
    );
    api.getClientWorkspace.mockResolvedValue(workspace(null));
    renderScreen();
    await screen.findByText(/^Resolved by you · /);
    expect(screen.queryByText("Acknowledge")).toBeNull();
    expect(screen.queryByText("Resolve")).toBeNull();
    expect(screen.queryByText("Nudge on WhatsApp")).toBeNull();
  });

  it("does not print raw source or rule text", async () => {
    api.getException.mockResolvedValue(exception());
    api.getClientWorkspace.mockResolvedValue(workspace(null));
    renderScreen();
    await screen.findByText("Acknowledge");
    expect(screen.queryByText(/workout_assignment|mvp\.v2|Source |Rule /)).toBeNull();
  });

  it("a proven network failure on first load shows the offline banner, not a blame message", async () => {
    api.getException.mockRejectedValue(new TypeError("Network request failed"));
    renderScreen();
    await screen.findByText("You're offline. Reconnect and try again.");
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("a non-network failure is not called offline", async () => {
    api.getException.mockRejectedValue(new TypeError("undefined is not a function"));
    renderScreen();
    await screen.findByText("Could not load exception. (EXC-LOAD)");
    expect(screen.queryByText(/offline/i)).toBeNull();
  });

  it("disables actions with the offline reason when a reload fails offline", async () => {
    api.getException.mockResolvedValueOnce(exception());
    api.getClientWorkspace.mockResolvedValue(workspace(null));
    renderScreen();
    await screen.findByText("Acknowledge");
    api.getException.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    screen.getByText("Acknowledge");
    // Trigger a failing reload through a failing acknowledge.
    api.acknowledgeException.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    screen.getByText("Acknowledge").click();
    await waitFor(() => expect(screen.getByText(/You're offline\. Showing the last update from /)).toBeTruthy());
    const ack = screen.getByText("Acknowledge").closest("[role=button]");
    expect(ack?.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("state copy and predicates", () => {
  it("formats the banners like the frames", () => {
    const now = new Date("2026-10-20T00:00:00Z");
    expect(endedBannerText("Kavya", "2026-10-03T12:30:00.000Z", "Asia/Kolkata", now)).toBe(
      "Coaching with Kavya ended on Sat 3 Oct. This item is read-only.",
    );
    expect(
      resolvedBannerText(
        { resolvedAt: "2026-10-17T04:35:00.000Z", closedReason: "trainer" },
        "Asia/Kolkata",
        now,
      ),
    ).toBe("Resolved by you · Sat 17 Oct, 10:05 am");
    expect(offlineBannerText("2026-10-20T04:10:00.000Z", "Asia/Kolkata")).toBe(
      "You're offline. Showing the last update from 9:40 am.",
    );
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
