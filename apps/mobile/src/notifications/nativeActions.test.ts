import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

type Listener = (response: unknown) => void;
const listeners: Listener[] = [];
const setNotificationCategoryAsync = vi.fn(async () => undefined);
const scheduleNotificationAsync = vi.fn<(request: unknown) => Promise<string>>(async () => "id");
type Request = { identifier: string; content: { data: Record<string, unknown> } };
let scheduled: Request[] = [];
let presented: Array<{ request: Request }> = [];
const cancelScheduledNotificationAsync = vi.fn<(id: string) => Promise<void>>(async () => undefined);
const dismissNotificationAsync = vi.fn<(id: string) => Promise<void>>(async () => undefined);
vi.mock("expo-notifications", () => ({
  DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
  setNotificationCategoryAsync,
  addNotificationResponseReceivedListener: (listener: Listener) => {
    listeners.push(listener);
    return { remove: () => undefined };
  },
  scheduleNotificationAsync,
  getAllScheduledNotificationsAsync: async () => scheduled,
  cancelScheduledNotificationAsync,
  getPresentedNotificationsAsync: async () => presented,
  dismissNotificationAsync,
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

const {
  cancelMealSnoozeReminders,
  ensureMealNotificationActions,
  subscribeMealNotificationResponses,
} = await import("./nativeActions");
const { PUSH_GROUPS } = await import("./copy");
const { isMealSnoozed, resetNotificationActionState } = await import("./actions");

function response(actionIdentifier: string, data: Record<string, unknown>) {
  return {
    actionIdentifier,
    notification: { request: { content: { title: "Dinner is due", data } } },
  };
}

const MEAL_ID = "44444444-4444-4444-8444-444444444444";
const DEFAULT = "expo.modules.notifications.actions.DEFAULT";
const SERVER_MEAL_PUSH = {
  notificationType: "meal_reminder",
  domainEntityType: "meal_assignment",
  domainEntityId: MEAL_ID,
};

async function flush(): Promise<void> {
  // The scheduler loads expo-notifications with a dynamic import.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("notification categories and the meal buttons (Z12-47)", async () => {
  await ensureMealNotificationActions();
  const events: unknown[] = [];
  let unsubscribe = subscribeMealNotificationResponses((event) => events.push(event));

  it("registers one category per push group, each with its stack summary", () => {
    expect(setNotificationCategoryAsync).toHaveBeenCalledTimes(PUSH_GROUPS.length);
    const meal = setNotificationCategoryAsync.mock.calls.find(
      (call: unknown[]) => call[0] === "meal_actions",
    ) as unknown as [string, Array<{ identifier: string }>, { categorySummaryFormat: string }];
    expect(meal[1].map((a) => a.identifier)).toEqual(["meal_open", "meal_snooze_30"]);
    expect(meal[2].categorySummaryFormat).toBe("%u more meal reminders");
    const coach = setNotificationCategoryAsync.mock.calls.find(
      (call: unknown[]) => call[0] === "fitbud_coach",
    ) as unknown as [string, unknown[], { categorySummaryFormat: string }];
    expect(coach[1]).toEqual([]);
  });

  it("leaves a body tap on a server push to the routing listener", () => {
    events.length = 0;
    listeners[0]!(response(DEFAULT, SERVER_MEAL_PUSH));
    listeners[0]!(response(DEFAULT, { notificationType: "plan_published" }));
    expect(events).toEqual([]);
  });

  it("opens the meal from the Open button on a server push", () => {
    events.length = 0;
    listeners[0]!(response("meal_open", SERVER_MEAL_PUSH));
    expect(events).toEqual([{ kind: "open", mealAssignmentId: MEAL_ID }]);
  });

  it("opens the meal from a body tap on the local snooze reminder", () => {
    events.length = 0;
    listeners[0]!(response(DEFAULT, { mealAssignmentId: MEAL_ID }));
    expect(events).toEqual([{ kind: "open", mealAssignmentId: MEAL_ID }]);
  });

  it("does not jump to Diet from a tap on an unrelated local notification", () => {
    events.length = 0;
    // A local notification with no meal id and no routing payload (for
    // example a rest-timer reminder) is not a meal.
    listeners[0]!(response(DEFAULT, {}));
    listeners[0]!(response(DEFAULT, { kind: "rest_timer" }));
    expect(events).toEqual([]);
  });

  it("Snooze 30 min schedules one reminder and refuses a second snooze", async () => {
    resetNotificationActionState();
    scheduleNotificationAsync.mockClear();
    events.length = 0;

    listeners[0]!(response("meal_snooze_30", SERVER_MEAL_PUSH));
    await flush();
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const request = scheduleNotificationAsync.mock.calls[0]![0] as {
      content: { title: string; categoryIdentifier: string; data: unknown };
      trigger: { type: string; date: Date };
    };
    expect(request.content).toMatchObject({
      title: "Dinner is due",
      categoryIdentifier: "meal_actions",
      data: { mealAssignmentId: MEAL_ID },
    });
    expect(request.trigger.type).toBe("date");
    // Android: the v2 meal channel, never the deleted legacy "meal" id (Z14-35).
    const channelId = (request.trigger as unknown as { channelId: string }).channelId;
    expect(channelId).toBe("meal_v2");
    expect(channelId).not.toBe("meal");
    expect(isMealSnoozed(MEAL_ID)).toBe(true);

    // The reminder itself carries the Snooze button; a second press does not
    // schedule another one.
    listeners[0]!(response("meal_snooze_30", { mealAssignmentId: MEAL_ID }));
    await flush();
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      { kind: "snooze", mealAssignmentId: MEAL_ID },
      { kind: "snooze", mealAssignmentId: MEAL_ID },
    ]);
  });

  it("drops Open and Snooze when no trainee session is listening", async () => {
    resetNotificationActionState();
    scheduleNotificationAsync.mockClear();
    events.length = 0;
    unsubscribe();

    listeners[0]!(response("meal_snooze_30", SERVER_MEAL_PUSH));
    listeners[0]!(response("meal_open", SERVER_MEAL_PUSH));
    listeners[0]!(response(DEFAULT, { mealAssignmentId: MEAL_ID }));
    await flush();

    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(isMealSnoozed(MEAL_ID)).toBe(false);
    expect(events).toEqual([]);
    unsubscribe = subscribeMealNotificationResponses((event) => events.push(event));
  });
});

describe("cancelMealSnoozeReminders (sign-out)", () => {
  it("cancels and dismisses only the local meal reminders", async () => {
    const meal: Request = { identifier: "snooze-1", content: { data: { mealAssignmentId: MEAL_ID } } };
    const other: Request = { identifier: "rest-1", content: { data: { kind: "rest_timer" } } };
    const server: Request = { identifier: "push-1", content: { data: SERVER_MEAL_PUSH } };
    scheduled = [meal, other];
    presented = [{ request: { ...meal, identifier: "snooze-2" } }, { request: server }];

    await cancelMealSnoozeReminders();

    expect(cancelScheduledNotificationAsync.mock.calls).toEqual([["snooze-1"]]);
    expect(dismissNotificationAsync.mock.calls).toEqual([["snooze-2"]]);
  });
});
