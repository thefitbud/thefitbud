import { describe, expect, it } from "vitest";
import type { Checkin, CheckinReview } from "@fitbud/contracts";
import {
  pickNextScheduledCheckin,
  pickTodayCheckin,
  todayCheckinBanner,
} from "./pickTodayCheckin";

function reviewStub(checkinId: string): CheckinReview {
  return {
    id: "00000000-0000-4000-8000-000000000099",
    checkinId,
    coachingRelationshipId: "00000000-0000-4000-8000-000000000001",
    trainerUserId: "00000000-0000-4000-8000-000000000010",
    outcome: "acknowledged",
    notes: "Nice week — keep it up.",
    createdAt: "2026-10-19T12:00:00.000Z",
    updatedAt: "2026-10-19T12:00:00.000Z",
  };
}

function stub(
  partial: Pick<Checkin, "id" | "localDate" | "status"> &
    Partial<Pick<Checkin, "review" | "recordStatus">>,
): Checkin {
  const reviewed = partial.status === "reviewed";
  return {
    coachingRelationshipId: "00000000-0000-4000-8000-000000000001",
    checkinScheduleId: "00000000-0000-4000-8000-000000000002",
    windowStartsAt: "2026-10-19T00:00:00.000Z",
    windowEndsAt: "2026-10-21T00:00:00.000Z",
    recordStatus:
      partial.recordStatus ??
      (partial.status === "submitted" || reviewed ? "submitted" : "draft"),
    recordVersion: 0,
    definitionVersion: 1,
    checkinFormVersionId: "00000000-0000-4000-8000-000000000003",
    answers: null,
    submittedAt: null,
    review: partial.review ?? (reviewed ? reviewStub(partial.id) : null),
    createdAt: "2026-10-19T00:00:00.000Z",
    updatedAt: "2026-10-19T00:00:00.000Z",
    ...partial,
  };
}

describe("pickTodayCheckin", () => {
  it("prefers today's due over a future scheduled (newest-first list)", () => {
    expect(
      pickTodayCheckin([
        stub({ id: "future", localDate: "2026-10-23", status: "scheduled" }),
        stub({ id: "due-today", localDate: "2026-10-19", status: "due" }),
      ])?.id,
    ).toBe("due-today");
  });

  it("prefers overdue over due, then next upcoming scheduled", () => {
    expect(
      pickTodayCheckin([
        stub({ id: "sched", localDate: "2026-10-25", status: "scheduled" }),
        stub({ id: "due", localDate: "2026-10-19", status: "due" }),
        stub({ id: "over", localDate: "2026-10-17", status: "overdue" }),
      ])?.id,
    ).toBe("over");
  });

  it("prefers reviewed reply over a newer unreviewed submitted (live Today path)", () => {
    const waitingSunday = stub({
      id: "waiting-sunday",
      localDate: "2026-10-18",
      status: "submitted",
      review: null,
    });
    const reviewedFriday = stub({
      id: "reviewed-friday",
      localDate: "2026-10-16",
      status: "reviewed",
      review: reviewStub("reviewed-friday"),
    });
    const next = stub({
      id: "next",
      localDate: "2026-10-23",
      status: "scheduled",
    });
    const picked = pickTodayCheckin([next, waitingSunday, reviewedFriday]);
    expect(picked?.id).toBe("reviewed-friday");
    const banner = todayCheckinBanner(
      picked,
      pickNextScheduledCheckin([next, waitingSunday, reviewedFriday]),
      "Rahul",
    );
    expect(banner.kind).toBe("reviewed");
    expect(banner.title).toBe("Acknowledged");
    expect(banner.body).toMatch(/Nice week/);
    expect(banner.nextLine).toBe("Next check-in 2026-10-23");
  });

  it("treats submitted+review payload as reviewed", () => {
    const reviewedViaPayload = stub({
      id: "submitted-with-review",
      localDate: "2026-10-16",
      status: "submitted",
      review: reviewStub("submitted-with-review"),
    });
    expect(
      pickTodayCheckin([
        stub({ id: "next", localDate: "2026-10-23", status: "scheduled" }),
        reviewedViaPayload,
      ])?.id,
    ).toBe("submitted-with-review");
  });

  it("returns null when nothing actionable, reviewed, or upcoming", () => {
    expect(pickTodayCheckin([])).toBeNull();
  });
});
