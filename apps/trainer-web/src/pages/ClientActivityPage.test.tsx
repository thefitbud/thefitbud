/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";

const REL_ID = "c422296e-ed7b-4196-a2b4-647096af3002";

const api = vi.hoisted(() => ({
  listWorkspaceActivity: vi.fn(),
  getMealAssignment: vi.fn(),
  listNotifications: vi.fn(),
  getActivityFeed: vi.fn(),
  markNotificationRead: vi.fn(),
}));

vi.mock("../lib/api", () => ({ apiClient: api }));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { timezone: "Asia/Kolkata" } }),
}));

import { ClientActivityPage } from "./ClientActivityPage";

function pageTree(query = "type=meal") {
  const context = {
    workspace: {
      header: {
        relationshipId: REL_ID,
        traineeDisplayName: "Rohan Mehta",
        onboardingStatus: "coaching_ready",
        effectivePlan: null,
        goalShort: null,
        renewalState: null,
        adherenceState: "on_track",
        traineeProfile: { displayName: "Rohan Mehta", age: 29, gender: "male" },
        traineeTimezone: "Asia/Kolkata",
        hasCustomMealTimes: false,
        trainerWhatsappE164: null,
        clientWhatsappE164: null,
        mealTimeOverrides: [],
      },
    },
    workspaceLoading: false,
    refreshEpoch: 0,
    online: true,
    ended: false,
  };
  return (
    <MemoryRouter initialEntries={[`/clients/${REL_ID}/activity?${query}`]}>
      <Routes>
        <Route path="/clients/:relationshipId" element={<Outlet context={context} />}>
          <Route path="activity" element={<ClientActivityPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  api.listNotifications.mockResolvedValue({ items: [] });
  api.getActivityFeed.mockResolvedValue({ events: [] });
  api.markNotificationRead.mockResolvedValue({});
  api.listWorkspaceActivity.mockResolvedValue({
    items: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        type: "meal",
        title: "Breakfast",
        state: "pending",
        localDate: "2026-11-12",
        occurredAt: "2026-11-12T02:30:00.000Z",
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        type: "meal",
        title: "Lunch",
        state: "modified",
        localDate: "2026-11-12",
        occurredAt: "2026-11-12T07:30:00.000Z",
      },
    ],
    nextCursor: null,
  });
  api.getMealAssignment.mockImplementation(async (id: string) => ({
    id,
    coachingRelationshipId: REL_ID,
    mealName: id.startsWith("aa") ? "Breakfast" : "Lunch",
    localDate: "2026-11-12",
    windowEndsAt: "2026-11-12T10:00:00.000Z",
    status: id.startsWith("aa") ? "pending" : "modified",
    scheduleStatus: "scheduled",
    prescription: { items: [] },
    compliance: id.startsWith("aa")
      ? null
      : {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          notes: "Ate out",
          loggedAt: "2026-11-12T08:00:00.000Z",
          loggedItems: [{ name: "Rajma chawal", servingLabel: "1 plate", energyKcal: 640 }],
          loggedTotals: { energyKcal: 640, proteinG: 20, carbsG: 80, fatG: 12 },
        },
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ClientActivityPage (Z12-8)", () => {
  it("shows type segments, Meals · this week card, and frame status chips", async () => {
    render(pageTree());
    expect(await screen.findByTestId("screen-TW-17")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Meals$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Workouts$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /This week/i })).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Meals · this week" })).toBeTruthy(),
    );
    expect(
      screen.getByText("Not logged yet", { selector: ".activity-status span" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Changed", { selector: ".activity-status span" }),
    ).toBeTruthy();
  });

  it("opens the meal panel for ?date=&entry= (the web bell's link) and shows the day", async () => {
    render(pageTree("date=2026-11-12&entry=cccccccc-cccc-4ccc-8ccc-cccccccccccc"));
    expect(await screen.findByTestId("activity-drawer")).toBeTruthy();
    await waitFor(() =>
      expect(api.listWorkspaceActivity).toHaveBeenCalledWith(
        REL_ID,
        expect.objectContaining({ occurredFrom: "2026-11-12", occurredTo: "2026-11-12" }),
      ),
    );
    expect(await screen.findByTestId("meal-panel")).toBeTruthy();
  });

  it("marks the client's unread log-edit notification read when its panel opens", async () => {
    const entryId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    api.listNotifications.mockResolvedValue({
      items: [
        {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          type: "trainer_client_log_edited",
          coachingRelationshipId: REL_ID,
          readAt: null,
          logEdit: { entryId, action: "edited", mealName: "Lunch", mealDate: "2026-11-12" },
        },
      ],
    });
    render(pageTree(`date=2026-11-12&entry=${entryId}`));
    await waitFor(() =>
      expect(api.markNotificationRead).toHaveBeenCalledWith("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
    );
  });

  it("lists a removed meal log on its day with the Removed tag", async () => {
    api.getActivityFeed.mockResolvedValue({
      events: [
        {
          id: "log_edit:1",
          type: "client_removed",
          summary: "Removed the dinner log",
          occurredAt: "2026-11-12T09:00:00.000Z",
          traineeDisplayName: "Rohan Mehta",
          mealDate: "2026-11-12",
          previousKcal: 1120,
        },
      ],
    });
    render(pageTree("date=2026-11-12"));
    expect(await screen.findByTestId("removed-tag")).toBeTruthy();
    expect(screen.getByText(/Rohan removed their dinner log \(Thu 12 Nov\) · was 1,120 kcal/)).toBeTruthy();
  });
});
