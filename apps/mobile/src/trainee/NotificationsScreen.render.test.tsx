/**
 * Notifications inbox (TR-15a, TR-15b; Z12-47), and its fetch count (BT15,
 * D-W4-16): the same cache-subscriber loop as the progress tab, where `load`
 * writes the inbox cache and refetching from that notification never settled.
 * react-native-web only (D-W4-17); the native branch is not exercised.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Notification, NotificationType } from "@fitbud/contracts";
import { fireEvent, mockAuth, render, screen, waitFor } from "../test/render";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

let listCalls = 0;
let inbox: Notification[] = [];
const markRead = vi.fn(async (id: string) => ({ id }));

const api = {
  listNotifications: vi.fn(async () => {
    listCalls += 1;
    return { items: inbox, nextCursor: null };
  }),
  getNotificationPreferences: vi.fn(async () => ({
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
  })),
};

vi.mock("../lib/stage1Api", () => ({
  stage1Api: () => ({ markNotificationRead: markRead }),
}));

const auth = mockAuth({
  api,
  me: {
    id: "a0a69e20-297d-4101-a5e2-ecce9b8491cb",
    email: "aarav.ontrack@demo.fitbud.test",
    timezone: "Asia/Kolkata",
  },
});

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../auth/AuthProvider",
  );
  return { ...actual, useAuth: () => auth };
});

const reportErrorMock = vi.fn();
vi.mock("../lib/reportError", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../lib/reportError",
  );
  return { ...actual, reportError: reportErrorMock };
});

const {
  NotificationsScreen,
  groupInbox,
  inboxTimeLabel,
  notificationsPageMarginTop,
  NOTIFICATIONS_CONTENT_TOP_PAD,
  INBOX_LOAD_ERROR,
  INBOX_PARSE_ERROR,
  INBOX_READ_ERROR,
} = await import("./NotificationsScreen");
const { setCached } = await import("./dataCache");
const { androidTopInset } = await import("../screens/auth/authParts");

let seq = 0;
function row(
  type: NotificationType,
  createdAt: string,
  overrides: Partial<Notification> = {},
): Notification {
  seq += 1;
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
  const entity =
    type === "workout_reminder"
      ? ("workout_assignment" as const)
      : type === "meal_reminder"
        ? ("meal_assignment" as const)
        : type === "checkin_reviewed"
          ? ("checkin" as const)
          : ("coaching_relationship" as const);
  return {
    id,
    recipientUserId: "a0a69e20-297d-4101-a5e2-ecce9b8491cb",
    coachingRelationshipId: "33333333-3333-4333-8333-333333333333",
    type,
    notificationType: type,
    domainEntityType: entity,
    domainEntityId: "44444444-4444-4444-8444-444444444444",
    state: "delivered",
    dedupeKey: `${type}:${id}`,
    createdAt,
    readAt: null,
    route: type === "meal_reminder" ? "/meal/dinner" : "/today",
    routing: {
      notificationId: id,
      notificationType: type,
      domainEntityType: entity,
      domainEntityId: "44444444-4444-4444-8444-444444444444",
      createdAt,
    },
    ...overrides,
  };
}

beforeEach(() => {
  listCalls = 0;
  inbox = [];
  markRead.mockClear();
  setCached("notifications:inbox", []);
});

describe("inbox grouping by the trainee's civil day (Asia/Kolkata)", () => {
  const tz = "Asia/Kolkata";
  const today = "2026-11-17";

  it("groups Today, Yesterday, Earlier on the local day, not the UTC date", () => {
    const items = [
      // 18:40 UTC on the 16th is 00:10 on the 17th in India: today.
      row("plan_published", "2026-11-16T18:40:00.000Z"),
      // 18:00 UTC on the 16th is 23:30 on the 16th in India: yesterday.
      row("meal_reminder", "2026-11-16T18:00:00.000Z"),
      row("checkin_reviewed", "2026-11-09T05:00:00.000Z"),
      row("workout_reminder", "2026-11-17T01:30:00.000Z"),
    ];
    const sections = groupInbox(items, today, tz);
    expect(sections.map((s) => s.title)).toEqual(["Today", "Yesterday", "Earlier"]);
    expect(sections[0]!.items.map((i) => i.type)).toEqual([
      "workout_reminder",
      "plan_published",
    ]);
    expect(sections[1]!.items.map((i) => i.type)).toEqual(["meal_reminder"]);
    expect(sections[2]!.items.map((i) => i.type)).toEqual(["checkin_reviewed"]);
  });

  it("leaves empty groups out", () => {
    const sections = groupInbox([row("plan_published", "2026-11-10T05:00:00.000Z")], today, tz);
    expect(sections.map((s) => s.title)).toEqual(["Earlier"]);
  });

  it("labels times like the frame: clock, Yesterday, weekday, date", () => {
    const now = new Date("2026-11-17T08:00:00.000Z");
    expect(inboxTimeLabel("2026-11-17T04:42:00.000Z", today, tz, now)).toBe("10:12 am");
    expect(inboxTimeLabel("2026-11-16T12:00:00.000Z", today, tz, now)).toBe("Yesterday");
    expect(inboxTimeLabel("2026-11-16T18:40:00.000Z", today, tz, now)).toBe("12:10 am");
    // Sat 14 Nov is within the last week; Sat 7 Nov is not.
    expect(inboxTimeLabel("2026-11-14T06:00:00.000Z", today, tz, now)).toBe("Sat");
    expect(inboxTimeLabel("2026-11-07T06:00:00.000Z", today, tz, now)).toBe("Sat 7 Nov");
  });
});

describe("NotificationsScreen (TR-15a, TR-15b)", () => {
  it("offsets the custom nav by the Android status-bar inset", () => {
    expect(notificationsPageMarginTop(0)).toBe(-NOTIFICATIONS_CONTENT_TOP_PAD);
    expect(notificationsPageMarginTop(48)).toBe(
      -NOTIFICATIONS_CONTENT_TOP_PAD + 48,
    );
    // Host Platform: web → 0; production Android uses StatusBar.currentHeight.
    expect(notificationsPageMarginTop()).toBe(
      -NOTIFICATIONS_CONTENT_TOP_PAD + androidTopInset,
    );
  });

  it("lists notifications once per mount", async () => {
    render(
      <NotificationsScreen
        onBack={() => undefined}
        onOpenSettings={() => undefined}
        onNavigate={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(listCalls).toBe(1);
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(listCalls).toBe(1);
  });

  it("keeps Back reachable after the top inset is applied", async () => {
    const onBack = vi.fn();
    render(
      <NotificationsScreen
        onBack={onBack}
        onOpenSettings={() => undefined}
        onNavigate={() => undefined}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state with the coach's name and no Read all", async () => {
    render(
      <NotificationsScreen
        coachName="Rahul Verma"
        onBack={() => undefined}
        onNavigate={() => undefined}
      />,
    );
    expect(await screen.findByText("You’re all caught up")).toBeTruthy();
    expect(
      screen.getByText("Messages from Rahul, plan changes and reminders show up here."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Read all" })).toBeNull();
    expect(screen.queryByText("No notifications yet.")).toBeNull();
  });

  it("shows groups, coach copy, the reminder row title, Read all and the 30-day line", async () => {
    const now = Date.now();
    inbox = [
      row("plan_published", new Date(now - 60_000).toISOString()),
      row("activity_nudge", new Date(now - 120_000).toISOString(), {
        title: "Rahul nudged you",
        body: "Evening snack is waiting. Log it when you can.",
      }),
      row("checkin_reviewed", new Date(now - 10 * 86_400_000).toISOString(), {
        readAt: new Date(now - 9 * 86_400_000).toISOString(),
        state: "read",
      }),
    ];
    render(
      <NotificationsScreen
        coachName="Rahul Verma"
        onBack={() => undefined}
        onNavigate={() => undefined}
      />,
    );
    expect(await screen.findByText("Rahul changed your plan")).toBeTruthy();
    expect(screen.getByText("Reminder from Rahul")).toBeTruthy();
    expect(screen.queryByText("Rahul nudged you")).toBeNull();
    expect(screen.getByText("Evening snack is waiting. Log it when you can.")).toBeTruthy();
    expect(screen.getByText("Check-in reviewed")).toBeTruthy();
    expect(screen.getByText("See Rahul's review.")).toBeTruthy();
    expect(screen.getByText("Earlier")).toBeTruthy();
    expect(screen.getByText("Notifications are kept for 30 days.")).toBeTruthy();
    // Unread rows say so to a screen reader; colour is not the only signal.
    expect(
      screen.getByRole("button", { name: /^Rahul changed your plan\. .*Unread$/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /^Check-in reviewed\. See Rahul's review\.\. / }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Read all" }));
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Read all" })).toBeNull(),
    );
  });

  it("Read all that fails reports it and shows a short error code", async () => {
    const now = Date.now();
    inbox = [
      row("plan_published", new Date(now - 60_000).toISOString()),
      row("checkin_reviewed", new Date(now - 120_000).toISOString()),
    ];
    const failure = new TypeError("Network request failed");
    markRead.mockRejectedValueOnce(failure);
    reportErrorMock.mockClear();
    render(
      <NotificationsScreen
        coachName="Rahul Verma"
        onBack={() => undefined}
        onNavigate={() => undefined}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Read all" }));

    expect(await screen.findByText(INBOX_READ_ERROR)).toBeTruthy();
    expect(reportErrorMock).toHaveBeenCalledWith("notifications.readAll", failure);
    // The first refusal stops the loop; both rows keep their unread dot.
    expect(markRead).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Read all" })).toBeTruthy();
  });

  it("a load that fails to parse is reported and does not read as offline", async () => {
    inbox = [row("plan_published", new Date().toISOString())];
    // Something already on screen, so the saved list stays visible.
    setCached("notifications:inbox", inbox);
    const zod = Object.assign(new Error("bad shape"), {
      name: "ZodError",
      issues: [{ path: ["items", 0, "type"], message: "Invalid" }],
    });
    api.listNotifications.mockRejectedValueOnce(zod);
    reportErrorMock.mockClear();
    render(
      <NotificationsScreen
        coachName="Rahul Verma"
        onBack={() => undefined}
        onNavigate={() => undefined}
      />,
    );

    expect(await screen.findByText(INBOX_PARSE_ERROR)).toBeTruthy();
    expect(reportErrorMock).toHaveBeenCalledWith("notifications.load", zod);
    expect(screen.queryByText("Showing saved notifications")).toBeNull();
    expect(screen.getByText("Rahul changed your plan")).toBeTruthy();
  });

  it("a load that fails with no saved list shows a short code, not the cause", async () => {
    api.listNotifications.mockRejectedValueOnce(new Error("boom"));
    reportErrorMock.mockClear();
    render(
      <NotificationsScreen
        coachName="Rahul Verma"
        onBack={() => undefined}
        onNavigate={() => undefined}
      />,
    );
    expect(await screen.findByText(INBOX_LOAD_ERROR)).toBeTruthy();
    expect(screen.queryByText("boom")).toBeNull();
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
  });

  it("a tap marks the row read and opens its target", async () => {
    inbox = [row("plan_published", new Date().toISOString())];
    const onNavigate = vi.fn();
    render(
      <NotificationsScreen
        coachName="Rahul Verma"
        onBack={() => undefined}
        onNavigate={onNavigate}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /^Rahul changed your plan/ }),
    );
    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1));
    expect(markRead).toHaveBeenCalledWith(inbox[0]!.id);
    expect(onNavigate.mock.calls[0]![0].route).toEqual({ type: "tab", tab: "workout" });
  });
});
