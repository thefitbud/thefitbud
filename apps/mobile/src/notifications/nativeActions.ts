import { Platform } from "react-native";
import { MEAL_REMINDER_SNOOZE_MINUTES } from "@fitbud/core";
import {
  MEAL_ACTION_CATEGORY,
  MEAL_NOTIFICATION_ACTIONS,
  snoozeMeal,
} from "./actions";

export type MealNotificationResponse = {
  kind: "open" | "snooze";
  mealAssignmentId: string | null;
};

type ResponseListener = (event: MealNotificationResponse) => void;
const listeners = new Set<ResponseListener>();
let nativeReady = false;

export function subscribeMealNotificationResponses(
  listener: ResponseListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(event: MealNotificationResponse): void {
  for (const listener of listeners) listener(event);
}

/**
 * Registers Open and Snooze 30 min on the meal category.
 * No-ops on web: the system notification UI needs a dev build.
 */
export async function ensureMealNotificationActions(): Promise<void> {
  if (Platform.OS === "web" || nativeReady) return;
  const Notifications = await import("expo-notifications");
  await Notifications.setNotificationCategoryAsync(
    MEAL_ACTION_CATEGORY,
    MEAL_NOTIFICATION_ACTIONS.map((action) => ({
      identifier: action.identifier,
      buttonTitle: action.buttonTitle,
      options: { opensAppToForeground: action.opensAppToForeground },
    })),
  );
  Notifications.addNotificationResponseReceivedListener((response) => {
    const actionId = response.actionIdentifier;
    const data = response.notification.request.content.data ?? {};
    const mealAssignmentId =
      typeof data.mealAssignmentId === "string" ? data.mealAssignmentId : null;
    if (actionId === "meal_snooze_30") {
      if (mealAssignmentId) snoozeMeal(mealAssignmentId);
      emit({ kind: "snooze", mealAssignmentId });
      return;
    }
    if (
      actionId === "meal_open" ||
      actionId === Notifications.DEFAULT_ACTION_IDENTIFIER
    ) {
      emit({ kind: "open", mealAssignmentId });
    }
  });
  nativeReady = true;
}

/** Schedules the one follow-up push. Web cannot, so the caller keeps the in-app snooze. */
export async function scheduleMealSnoozeNotification(input: {
  title: string;
  body: string;
  mealAssignmentId: string;
}): Promise<"scheduled" | "needs-dev-build"> {
  if (Platform.OS === "web") return "needs-dev-build";
  const Notifications = await import("expo-notifications");
  await Notifications.scheduleNotificationAsync({
    content: {
      title: input.title,
      body: input.body,
      categoryIdentifier: MEAL_ACTION_CATEGORY,
      data: { mealAssignmentId: input.mealAssignmentId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: MEAL_REMINDER_SNOOZE_MINUTES * 60,
    },
  });
  return "scheduled";
}
