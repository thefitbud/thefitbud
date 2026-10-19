import { describe, expect, it } from "vitest";
import type { Checkin, CheckinReview } from "@fitbud/contracts";
import {
  pickNextScheduledCheckin,
  pickTodayCheckin,
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
    const future = stub({
      id: "future",
      localDate: "2026-10-23",
      status: "scheduled",
    });
    const due = stub({
      id: "due-today",
      localDate: "2026-10-19",
      status: "due",
    });
    // Newest-first as returned by listCheckins
    expect(pickTodayCheckin([future, due])?.id).toBe("due-today");
  });

  it("prefers overdue over due, then next upcoming scheduled", () => {
    expect(
      pickTodayCheckin([
        stub({ id: "sched", localDate: "2026-10-25", status: "scheduled" }),
        stub({ id: "due", localDate: "2026-10-19", status: "due" }),
        stub({ id: "over", localDate: "2026-10-17", status: "overdue" }),
      ])?.id,
    ).toBe("over");

    expect(
      pickTodayCheckin([
        stub({ id: "later", localDate: "2026-10-30", status: "scheduled" }),
        stub({ id: "next", localDate: "2026-10-23", status: "scheduled" }),
      ])?.id,
    ).toBe("next");
  });

  it("when both reviewed and scheduled exist, returns reviewed (reply) not scheduled", () => {
    const reviewed = stub({
      id: "reviewed",
      localDate: "2026-10-16",
      status: "reviewed",
    });
    const scheduled = stub({
      id: "next-week",
      localDate: "2026-10-23",
      status: "scheduled",
    });
    expect(pickTodayCheckin([scheduled, reviewed])?.id).toBe("reviewed");
    expect(pickNextScheduledCheckin([scheduled, reviewed])?.id).toBe(
      "next-week",
    );
  });

  it("returns null when nothing actionable, reviewed, or upcoming", () => {
    expect(
      pickTodayCheckin([
        stub({
          id: "reviewed-no-payload",
          localDate: "2026-10-12",
          status: "reviewed",
          review: null,
        }),
      ]),
    ).toBeNull();
  });
});
