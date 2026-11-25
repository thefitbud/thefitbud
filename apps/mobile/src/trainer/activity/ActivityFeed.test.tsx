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
    const links = await screen.findAllByRole("button", { name: "Open Deepak Nair's profile" });
    fireEvent.click(links.find((el) => el.getAttribute("data-testid") === "client-avatar-link")!);
    expect(onOpenProfile).toHaveBeenCalledWith("2b65e3ad-84cf-4fe1-a546-0d62656c2c79");
    expect(onOpenClient).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(/Check-in Fri 13 Nov/));
    expect(onOpenClient).toHaveBeenCalledWith(
      "2b65e3ad-84cf-4fe1-a546-0d62656c2c79",
      "Deepak Nair",
    );
  });

  it("the name opens the profile and not the event (Z14-33)", async () => {
    api.getActivityFeed.mockResolvedValue({ events: [events[2]!], nextCursor: null });
    const onOpenProfile = vi.fn();
    const onOpenClient = vi.fn();
    render(<ActivityFeedScreen onOpenProfile={onOpenProfile} onOpenClient={onOpenClient} />);
    fireEvent.click(await screen.findByTestId("client-name-link"));
    expect(onOpenProfile).toHaveBeenCalledWith("2b65e3ad-84cf-4fe1-a546-0d62656c2c79");
    expect(onOpenClient).not.toHaveBeenCalled();
  });

  it("an unread removal shows a bin tag, the dot and ate out; opening it marks the inbox row read (Z14-33)", async () => {
    const removed = {
      id: "log_edit:dddddddd-0000-4000-8000-000000000004",
      relationshipId: REL,
      traineeDisplayName: "Priya Nair",
      type: "client_removed",
      subtype: "Removed",
      occurredAt: "2026-11-14T10:00:00.000Z",
      traineeLocalTime: null,
      summary: "Removed the dinner log",
      entryId: "eeeeeeee-0000-4000-8000-000000000005",
      mealDate: "2026-11-13",
      previousKcal: 1120,
      previousAteOut: true,
      unread: true,
      notificationId: "ffffffff-0000-4000-8000-000000000006",
    };
    const edited = {
      ...removed,
      id: "log_edit:dddddddd-0000-4000-8000-000000000007",
      type: "client_edited",
      subtype: "Edited",
      summary: "Edited lunch",
      entryId: "eeeeeeee-0000-4000-8000-000000000008",
      unread: false,
      notificationId: undefined,
      previousAteOut: false,
    };
    api.getActivityFeed.mockResolvedValue({ events: [removed, edited], nextCursor: null });
    const markRead = vi.fn(async () => ({}));
    Object.assign(api, { markNotificationRead: markRead });
    render(<ActivityFeedScreen onOpenClient={vi.fn()} />);
    await screen.findByText(/removed their dinner log \(Fri 13 Nov\) · was 1,120 kcal, ate out/);
    expect(screen.getAllByTestId("activity-unread-dot")).toHaveLength(1);
    expect(screen.getByText("Removed")).toBeTruthy();
    expect(screen.getByText("Edited")).toBeTruthy();
    fireEvent.click(screen.getByText(/removed their dinner log/));
    expect(markRead).toHaveBeenCalledWith(removed.notificationId);
    await waitFor(() => expect(screen.queryByTestId("activity-unread-dot")).toBeNull());
  });

  describe("client picker search (Z14-33)", () => {
    const LOADED = [{ relationshipId: REL, displayName: "Priya Nair" }];
    const FAR = {
      relationshipId: "9b65e3ad-84cf-4fe1-a546-0d62656c2c79",
      displayName: "Zoya Far",
      onboardingStatus: "coaching_ready",
    };
    async function openPicker() {
      api.getActivityFeed.mockResolvedValue({ events, nextCursor: null });
      render(<ActivityFeedScreen clients={LOADED} />);
      fireEvent.click(await screen.findByRole("button", { name: "Filter by client" }));
      return screen.findByLabelText("Search clients");
    }

    it("finds a client who is not in the loaded list, through the server", async () => {
      api.listClients.mockReset();
      api.listClients.mockResolvedValue({
        items: [{ relationshipId: FAR.relationshipId, traineeDisplayName: "Zoya Far" }],
        nextCursor: null,
      } as never);
      const input = await openPicker();
      expect(screen.getByText("Priya Nair")).toBeTruthy();
      fireEvent.change(input, { target: { value: "zoya" } });
      await screen.findByText("Zoya Far");
      expect(api.listClients).toHaveBeenCalledTimes(1);
      expect(api.listClients).toHaveBeenCalledWith({ q: "zoya", limit: 20 });
    });

    it("a failed search says so and keeps the loaded clients usable", async () => {
      api.listClients.mockReset();
      api.listClients.mockRejectedValue(new Error("boom"));
      const input = await openPicker();
      fireEvent.change(input, { target: { value: "priya" } });
      await screen.findByText("Couldn't search just now. Try again.");
      expect(screen.getByText("Priya Nair")).toBeTruthy();
    });

    it("offline, it searches only the loaded clients and says so", async () => {
      api.listClients.mockReset();
      api.listClients.mockRejectedValue(new TypeError("Network request failed"));
      const input = await openPicker();
      fireEvent.change(input, { target: { value: "priya" } });
      await screen.findByText("You're offline. Showing the clients already loaded.");
      expect(screen.getByText("Priya Nair")).toBeTruthy();
    });
  });

  it("avatars are plain without a profile handler (client's own activity)", async () => {
    api.getActivityFeed.mockResolvedValue({ events: [events[2]!], nextCursor: null });
    render(<ActivityFeedScreen />);
    await screen.findByText(/Deepak/);
    expect(screen.queryByRole("button", { name: /'s profile$/ })).toBeNull();
  });
});
