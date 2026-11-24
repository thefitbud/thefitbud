/**
 * Activity feed (Z12-53 TM-09*): filters, empty, meal sheet entry.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, mockAuth, render, screen, waitFor } from "../../test/render";
import {
  activityDayLabel,
  activityTag,
  emptyFilterCopy,
  matchesActivityFilter,
} from "./model";

const REL = "1b65e3ad-84cf-4fe1-a546-0d62656c2c79";

const events = [
  {
    id: "meal:aaaaaaaa-0000-4000-8000-000000000001",
    relationshipId: REL,
    traineeDisplayName: "Priya Nair",
    type: "meal",
    subtype: "Ate out",
    occurredAt: "2026-11-14T10:00:00.000Z",
    traineeLocalTime: null,
    summary: "Meal ate out",
    kcal: 1120,
  },
  {
    id: "workout:bbbbbbbb-0000-4000-8000-000000000002",
    relationshipId: REL,
    traineeDisplayName: "Aarav Sharma",
    type: "workout",
    subtype: "Completed",
    occurredAt: "2026-11-14T11:00:00.000Z",
    traineeLocalTime: null,
    summary: "Workout completed",
  },
  {
    id: "checkin:cccccccc-0000-4000-8000-000000000003",
    relationshipId: "2b65e3ad-84cf-4fe1-a546-0d62656c2c79",
    traineeDisplayName: "Deepak Nair",
    type: "checkin",
    subtype: "Submitted",
    occurredAt: "2026-11-13T08:00:00.000Z",
    traineeLocalTime: "7:40 am",
    summary: "Check-in Fri 13 Nov",
  },
];

const api = {
  getActivityFeed: vi.fn(async () => ({ events, nextCursor: null })),
  listMealAssignments: vi.fn(async () => ({ items: [], nextCursor: null })),
  listClients: vi.fn(async () => ({ items: [], nextCursor: null })),
  createTrainerNote: vi.fn(async () => ({})),
  getClientWorkspace: vi.fn(),
};
const auth = mockAuth({ api, me: { timezone: "Asia/Kolkata" } });
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@fitbud/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fitbud/core")>()),
  deviceTimeZone: () => "Asia/Kolkata",
  formatLocalDate: () => "2026-11-14",
}));

const { ActivityFeedScreen } = await import("../ActivityFeedScreen");

describe("activity model", () => {
  it("filters by type family", () => {
    expect(matchesActivityFilter(events[0]!, "meals")).toBe(true);
    expect(matchesActivityFilter(events[0]!, "workouts")).toBe(false);
    expect(matchesActivityFilter(events[1]!, "workouts")).toBe(true);
    expect(matchesActivityFilter(events[2]!, "checkins")).toBe(true);
  });

  it("tags meal ate-out and check-in", () => {
    expect(activityTag(events[0]!).label).toBe("Ate out");
    expect(activityTag(events[2]!).label).toBe("Check-in");
  });

  it("labels today and yesterday", () => {
    expect(activityDayLabel("2026-11-14", "2026-11-14")).toBe("Today");
    expect(activityDayLabel("2026-11-13", "2026-11-14")).toBe("Yesterday");
  });

  it("words filtered empty copy with a client name", () => {
    expect(
      emptyFilterCopy({ filter: "checkins", clientFirstName: "Farhan" }).title,
    ).toMatch(/check-in activity/);
  });
});

describe("ActivityFeedScreen", () => {
  it("lists events and filters to Meals", async () => {
    api.getActivityFeed.mockResolvedValue({ events, nextCursor: null });
    render(
      <ActivityFeedScreen
        clients={[
          { relationshipId: REL, displayName: "Priya Nair" },
          {
            relationshipId: "2b65e3ad-84cf-4fe1-a546-0d62656c2c79",
            displayName: "Deepak Nair",
          },
        ]}
      />,
    );
    await screen.findByText(/Priya/);
    expect(screen.getByText(/Aarav/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Meals" }));
    expect(screen.getByText(/Priya/)).toBeTruthy();
    expect(screen.queryByText(/Aarav/)).toBeNull();
  });

  it("shows filtered empty and Clear filters", async () => {
    api.getActivityFeed.mockResolvedValue({ events: [], nextCursor: null });
    render(<ActivityFeedScreen />);
    await waitFor(() =>
      expect(screen.getByText(/No activity in the last 7 days/)).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Check-ins" }));
    expect(screen.getByText(/No check-in activity/)).toBeTruthy();
    expect(screen.getByText("Clear filters")).toBeTruthy();
  });

  it("opens the meal sheet from a meal row", async () => {
    api.getActivityFeed.mockResolvedValue({
      events: [events[0]!],
      nextCursor: null,
    });
    render(<ActivityFeedScreen />);
    fireEvent.click(await screen.findByText(/Priya/));
    expect(await screen.findByText(/Priya · Meal/)).toBeTruthy();
    expect(screen.getByText("Add note")).toBeTruthy();
    expect(screen.getByText("Open Priya")).toBeTruthy();
  });

  it("the avatar opens the profile; the rest of the row still opens the event", async () => {
    api.getActivityFeed.mockResolvedValue({
      events: [events[2]!],
      nextCursor: null,
    });
    const onOpenProfile = vi.fn();
    const onOpenClient = vi.fn();
    render(
      <ActivityFeedScreen onOpenProfile={onOpenProfile} onOpenClient={onOpenClient} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Open Deepak Nair's profile" }));
    expect(onOpenProfile).toHaveBeenCalledWith("2b65e3ad-84cf-4fe1-a546-0d62656c2c79");
    expect(onOpenClient).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(/Deepak/));
    expect(onOpenClient).toHaveBeenCalledWith(
      "2b65e3ad-84cf-4fe1-a546-0d62656c2c79",
      "Deepak Nair",
    );
  });

  it("avatars are plain without a profile handler (client's own activity)", async () => {
    api.getActivityFeed.mockResolvedValue({ events: [events[2]!], nextCursor: null });
    render(<ActivityFeedScreen />);
    await screen.findByText(/Deepak/);
    expect(screen.queryByRole("button", { name: /'s profile$/ })).toBeNull();
  });
});
