import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../../test/render";
import { checkinSchema, trainerCheckinInboxItemSchema } from "@fitbud/contracts";
import { CheckinsList } from "./List";
import { buildCheckinListModel, civilDaysBetween } from "./model";

function item(input: {
  id: string;
  name: string;
  status: "submitted" | "overdue" | "due";
  localDate: string;
  submittedAt?: string;
  tz?: string;
}) {
  const uuid = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, "0")}`;
  return trainerCheckinInboxItemSchema.parse({
    checkin: checkinSchema.parse({
      id: uuid(input.id),
      coachingRelationshipId: uuid(`9${input.id}`),
      checkinScheduleId: null,
      localDate: input.localDate,
      windowStartsAt: "2026-10-15T18:30:00.000Z",
      windowEndsAt: "2026-10-16T18:29:00.000Z",
      recordStatus: input.submittedAt ? "submitted" : "draft",
      recordVersion: 1,
      definitionVersion: 1,
      checkinFormVersionId: uuid("7"),
      answers: null,
      submittedAt: input.submittedAt ?? null,
      status: input.status,
      review: null,
      createdAt: "2026-10-12T00:00:00.000Z",
      updatedAt: "2026-10-12T00:00:00.000Z",
    }),
    coachingRelationshipId: uuid(`9${input.id}`),
    traineeUserId: uuid(`8${input.id}`),
    traineeDisplayName: input.name,
    traineeTimezone: input.tz ?? "Asia/Kolkata",
  });
}

const ITEMS = [
  item({ id: "2", name: "Deepak Nair", status: "submitted", localDate: "2026-10-17", submittedAt: "2026-10-17T15:15:00.000Z", tz: "Asia/Dubai" }),
  item({ id: "1", name: "Rohan Mehta", status: "submitted", localDate: "2026-10-16", submittedAt: "2026-10-16T16:00:00.000Z" }),
  item({ id: "3", name: "Arjun Kapoor", status: "overdue", localDate: "2026-10-16" }),
  item({ id: "4", name: "Aarav Shah", status: "due", localDate: "2026-10-18" }),
];
const model = buildCheckinListModel(ITEMS, {
  trainerZone: "Asia/Kolkata",
  today: "2026-10-18",
});

function renderList(over: Partial<Parameters<typeof CheckinsList>[0]> = {}) {
  const props = {
    loading: false,
    model,
    segment: "to_review" as const,
    onSegmentChange: vi.fn(),
    onReview: vi.fn(),
    onWhatsApp: vi.fn(),
    ...over,
  };
  render(<CheckinsList {...props} />);
  return props;
}

describe("check-ins list model", () => {
  it("splits submitted from overdue, drops merely-due, oldest first", () => {
    expect(model.toReview.map((r) => r.name)).toEqual(["Rohan Mehta", "Deepak Nair"]);
    expect(model.overdue.map((r) => r.name)).toEqual(["Arjun Kapoor"]);
  });

  it("words lines with civil dates, client zone and days overdue", () => {
    expect(model.toReview[0]!.line).toBe("Check-in · submitted Fri 16 Oct, 9:30 pm");
    // Zone abbreviation text comes from the engine (GST or GMT+4), so match its shape.
    expect(model.toReview[1]!.line).toMatch(/^Check-in · submitted Sat 17 Oct, 7:15 pm (GST|GMT\+4)$/);
    expect(model.overdue[0]!.line).toBe("Check-in · due Fri 16 Oct · 2 d overdue");
  });

  it("no zone suffix when the client zone is an alias of the trainer's", () => {
    const aliased = buildCheckinListModel(
      [ITEMS[1]!],
      { trainerZone: "Asia/Calcutta", today: "2026-10-18" },
    );
    expect(aliased.toReview[0]!.line).toBe("Check-in · submitted Fri 16 Oct, 9:30 pm");
    const other = buildCheckinListModel(
      [ITEMS[0]!],
      { trainerZone: "Asia/Calcutta", today: "2026-10-18" },
    );
    expect(other.toReview[0]!.line).toMatch(/pm (GST|GMT\+4)$/);
  });

  it("counts civil days and never goes negative", () => {
    expect(civilDaysBetween("2026-10-16", "2026-10-18")).toBe(2);
    expect(civilDaysBetween("2026-10-18", "2026-10-16")).toBe(0);
  });
});

describe("CheckinsList", () => {
  it("shows counts on both tabs and Review opens that check-in", () => {
    const props = renderList();
    expect(screen.getByRole("tab", { name: "To review 2" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Overdue 1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review Deepak Nair's check-in" }));
    expect(props.onReview).toHaveBeenCalledWith(model.toReview[1]);
  });

  it("Overdue tab offers WhatsApp, not Review", () => {
    const props = renderList({ segment: "overdue" });
    expect(screen.queryByRole("button", { name: /^Review/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "WhatsApp Arjun Kapoor" }));
    expect(props.onWhatsApp).toHaveBeenCalledWith(model.overdue[0]);
  });

  it("switching tabs reports the segment", () => {
    const props = renderList();
    fireEvent.click(screen.getByRole("tab", { name: "Overdue 1" }));
    expect(props.onSegmentChange).toHaveBeenCalledWith("overdue");
  });

  it("empty state, with zero counts", () => {
    renderList({ model: { toReview: [], overdue: [] } });
    expect(screen.getByText("No check-ins to review")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "To review 0" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Overdue 0" })).toBeTruthy();
  });

  it("loading state hides counts and rows", () => {
    renderList({ loading: true });
    expect(screen.getByRole("tab", { name: "To review" })).toBeTruthy();
    expect(screen.getByText("Loading check-ins…")).toBeTruthy();
    expect(screen.queryByText("Rohan Mehta")).toBeNull();
  });
});
