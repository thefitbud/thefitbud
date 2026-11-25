import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../../test/render";
import { checkinSchema, trainerCheckinInboxItemSchema } from "@fitbud/contracts";
import { CheckinsList } from "./List";
import { buildCheckinListModel, civilDaysBetween } from "./model";

vi.mock("react-native-gesture-handler", () => ({
  Swipeable: ({ children }: { children: unknown }) => children,
}));

function item(input: {
  id: string;
  name: string;
  status: "submitted" | "overdue" | "due" | "reviewed";
  localDate: string;
  submittedAt?: string;
  reviewedAt?: string;
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
      recordStatus: input.submittedAt || input.reviewedAt ? "submitted" : "draft",
      recordVersion: 1,
      definitionVersion: 1,
      checkinFormVersionId: uuid("7"),
      answers: null,
      submittedAt: input.submittedAt ?? input.reviewedAt ?? null,
      status: input.status,
      review:
        input.status === "reviewed"
          ? {
              id: uuid(`5${input.id}`),
              checkinId: uuid(input.id),
              coachingRelationshipId: uuid(`9${input.id}`),
              trainerUserId: uuid("6"),
              outcome: "acknowledged",
              notes: null,
              createdAt: input.reviewedAt ?? "2026-10-18T04:00:00.000Z",
              updatedAt: input.reviewedAt ?? "2026-10-18T04:00:00.000Z",
            }
          : null,
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
  item({
    id: "2",
    name: "Deepak Nair",
    status: "submitted",
    localDate: "2026-10-17",
    submittedAt: "2026-10-17T15:15:00.000Z",
    tz: "Asia/Dubai",
  }),
  item({
    id: "1",
    name: "Rohan Mehta",
    status: "submitted",
    localDate: "2026-10-16",
    submittedAt: "2026-10-16T16:00:00.000Z",
  }),
  item({ id: "3", name: "Arjun Kapoor", status: "overdue", localDate: "2026-10-16" }),
  item({ id: "4", name: "Aarav Shah", status: "due", localDate: "2026-10-18" }),
  item({
    id: "5",
    name: "Sneha Kapoor",
    status: "reviewed",
    localDate: "2026-10-08",
    reviewedAt: "2026-10-09T04:00:00.000Z",
  }),
];
const model = buildCheckinListModel(ITEMS, {
  trainerZone: "Asia/Kolkata",
  today: "2026-10-18",
  nowIso: "2026-10-18T12:00:00.000Z",
  weeksByRelationship: new Map([
    [ITEMS[0]!.coachingRelationshipId, 8],
    [ITEMS[1]!.coachingRelationshipId, 2],
    [ITEMS[2]!.coachingRelationshipId, 5],
    [ITEMS[4]!.coachingRelationshipId, 1],
  ]),
  repliedIds: new Set([ITEMS[4]!.checkin.id]),
});

function renderList(over: Partial<Parameters<typeof CheckinsList>[0]> = {}) {
  const props = {
    loading: false,
    model,
    segment: "to_review" as const,
    onSegmentChange: vi.fn(),
    onReview: vi.fn(),
    onNudge: vi.fn(),
    onMarkReviewed: vi.fn(),
    ...over,
  };
  render(<CheckinsList {...props} />);
  return props;
}

describe("check-ins list model", () => {
  it("splits submitted, overdue and reviewed; drops merely-due; oldest first", () => {
    expect(model.toReview.map((r) => r.name)).toEqual(["Rohan Mehta", "Deepak Nair"]);
    expect(model.overdue.map((r) => r.name)).toEqual(["Arjun Kapoor"]);
    expect(model.reviewed.map((r) => r.name)).toEqual(["Sneha Kapoor"]);
  });

  it("words lines with week labels and overdue due dates", () => {
    expect(model.toReview[0]!.line).toBe("Weekly check-in · week 2");
    expect(model.toReview[1]!.line).toBe("Weekly check-in · week 8");
    expect(model.overdue[0]!.line).toBe("Weekly check-in · week 5 · due Fri 16 Oct");
    expect(model.reviewed[0]!.line).toBe("Week 1 · you replied");
  });

  it("ages submitted relatively and overdue as days late", () => {
    expect(model.toReview[0]!.age).toBe("2 d ago");
    expect(model.overdue[0]!.age).toBe("2 d late");
    expect(model.reviewed[0]!.age).toBe("Fri 9 Oct");
  });

  it("counts civil days and never goes negative", () => {
    expect(civilDaysBetween("2026-10-16", "2026-10-18")).toBe(2);
    expect(civilDaysBetween("2026-10-18", "2026-10-16")).toBe(0);
  });
});

describe("CheckinsList", () => {
  it("shows counts on tabs and opens a check-in from the row", () => {
    const props = renderList();
    expect(screen.getByRole("tab", { name: "To review · 2" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Overdue · 1" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Reviewed" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review Deepak Nair's check-in" }));
    expect(props.onReview).toHaveBeenCalledWith(model.toReview[1]);
  });

  it("the avatar opens the client's profile and does not open the check-in", () => {
    const onOpenClient = vi.fn();
    const props = renderList({ onOpenClient });
    const links = screen.getAllByRole("button", { name: "Open Deepak Nair's profile" });
    fireEvent.click(links.find((el) => el.getAttribute("data-testid") === "client-avatar-link")!);
    expect(onOpenClient).toHaveBeenCalledWith(model.toReview[1]!.item.coachingRelationshipId);
    expect(props.onReview).not.toHaveBeenCalled();
  });

  it("the name opens the client's profile and not the check-in (Z14-33)", () => {
    const onOpenClient = vi.fn();
    const props = renderList({ onOpenClient });
    const links = screen.getAllByRole("button", { name: "Open Deepak Nair's profile" });
    const nameLink = links.find((el) => el.getAttribute("data-testid") === "client-name-link")!;
    fireEvent.click(nameLink);
    expect(onOpenClient).toHaveBeenCalledWith(model.toReview[1]!.item.coachingRelationshipId);
    expect(props.onReview).not.toHaveBeenCalled();
    // The rest of the row still opens the review.
    fireEvent.click(screen.getByRole("button", { name: "Review Deepak Nair's check-in" }));
    expect(props.onReview).toHaveBeenCalledWith(model.toReview[1]);
  });

  it("an overdue row's name opens the profile; the row itself opens nothing (Z14-33)", () => {
    const onOpenClient = vi.fn();
    const props = renderList({ onOpenClient, segment: "overdue" });
    expect(screen.queryByRole("button", { name: /^Review/ })).toBeNull();
    const links = screen.getAllByRole("button", { name: "Open Arjun Kapoor's profile" });
    fireEvent.click(links.find((el) => el.getAttribute("data-testid") === "client-name-link")!);
    expect(onOpenClient).toHaveBeenCalledWith(model.overdue[0]!.item.coachingRelationshipId);
    expect(props.onReview).not.toHaveBeenCalled();
  });

  it("rows are plain avatars when no profile handler is given", () => {
    renderList();
    expect(screen.queryByRole("button", { name: /^Open .*'s profile$/ })).toBeNull();
  });

  it("Overdue tab offers Nudge, not Review", () => {
    const props = renderList({ segment: "overdue" });
    expect(screen.queryByRole("button", { name: /^Review/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remind Arjun Kapoor" }));
    expect(props.onNudge).toHaveBeenCalledWith(model.overdue[0]);
  });

  it("switching tabs reports the segment", () => {
    const props = renderList();
    fireEvent.click(screen.getByRole("tab", { name: "Overdue · 1" }));
    expect(props.onSegmentChange).toHaveBeenCalledWith("overdue");
    fireEvent.click(screen.getByRole("tab", { name: "Reviewed" }));
    expect(props.onSegmentChange).toHaveBeenCalledWith("reviewed");
  });

  it("empty state, with zero counts", () => {
    renderList({ model: { toReview: [], overdue: [], reviewed: [] } });
    expect(screen.getByText("No check-ins waiting. Nice.")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "To review · 0" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Overdue · 0" })).toBeTruthy();
  });

  it("loading state hides counts and rows", () => {
    renderList({ loading: true });
    expect(screen.getByRole("tab", { name: "To review" })).toBeTruthy();
    expect(screen.getByText("Loading check-ins…")).toBeTruthy();
    expect(screen.queryByText("Rohan Mehta")).toBeNull();
  });
});
