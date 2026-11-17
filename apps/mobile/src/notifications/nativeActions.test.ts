import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

type Listener = (response: unknown) => void;
const listeners: Listener[] = [];
const setNotificationCategoryAsync = vi.fn(async () => undefined);
vi.mock("expo-notifications", () => ({
  DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
  setNotificationCategoryAsync,
  addNotificationResponseReceivedListener: (listener: Listener) => {
    listeners.push(listener);
    return { remove: () => undefined };
  },
  scheduleNotificationAsync: vi.fn(async () => "id"),
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

const { ensureMealNotificationActions, subscribeMealNotificationResponses } =
  await import("./nativeActions");
const { PUSH_GROUPS } = await import("./copy");

function response(actionIdentifier: string, data: Record<string, unknown>) {
  return {
    actionIdentifier,
    notification: { request: { content: { title: "Dinner is due", data } } },
  };
}

const MEAL_ID = "44444444-4444-4444-8444-444444444444";
const DEFAULT = "expo.modules.notifications.actions.DEFAULT";

describe("notification categories and the meal buttons (Z12-47)", async () => {
  await ensureMealNotificationActions();
  const events: unknown[] = [];
  subscribeMealNotificationResponses((event) => events.push(event));

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
    listeners[0]!(
      response(DEFAULT, {
        notificationType: "meal_reminder",
        domainEntityType: "meal_assignment",
        domainEntityId: MEAL_ID,
      }),
    );
    listeners[0]!(response(DEFAULT, { notificationType: "plan_published" }));
    expect(events).toEqual([]);
  });

  it("opens the meal from the Open button on a server push", () => {
    events.length = 0;
    listeners[0]!(
      response("meal_open", {
        notificationType: "meal_reminder",
        domainEntityType: "meal_assignment",
        domainEntityId: MEAL_ID,
      }),
    );
    expect(events).toEqual([{ kind: "open", mealAssignmentId: MEAL_ID }]);
  });

  it("opens the meal from a body tap on the local snooze reminder", () => {
    events.length = 0;
    listeners[0]!(response(DEFAULT, { mealAssignmentId: MEAL_ID }));
    expect(events).toEqual([{ kind: "open", mealAssignmentId: MEAL_ID }]);
  });
});
