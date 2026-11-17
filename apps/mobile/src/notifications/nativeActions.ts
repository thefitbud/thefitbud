import { Platform } from "react-native";
import {
  MEAL_ACTION_CATEGORY,
  MEAL_NOTIFICATION_ACTIONS,
  quietWindow,
  snoozeMeal,
} from "./actions";
import { pushGroupFor, PUSH_GROUPS } from "./copy";

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
 * Registers one notification category per push group (copy.ts `PUSH_GROUPS`),
 * each with its iOS stack summary, and Open and Snooze 30 min on the meal
 * category. No-ops on web: the system notification UI needs a dev build.
 */
export async function ensureMealNotificationActions(): Promise<void> {
  if (Platform.OS === "web" || nativeReady) return;
  const Notifications = await import("expo-notifications");
  for (const group of PUSH_GROUPS) {
    const actions =
      group.categoryId === MEAL_ACTION_CATEGORY
        ? MEAL_NOTIFICATION_ACTIONS.map((action) => ({
            identifier: action.identifier,
            buttonTitle: action.buttonTitle,
            options: { opensAppToForeground: action.opensAppToForeground },
          }))
        : [];
    await Notifications.setNotificationCategoryAsync(group.categoryId, actions, {
      categorySummaryFormat: group.summary,
    });
  }
  Notifications.addNotificationResponseReceivedListener((response) => {
    const actionId = response.actionIdentifier;
    const data = response.notification.request.content.data ?? {};
    // The local snooze reminder carries mealAssignmentId; a server meal push
    // carries the routing payload (domainEntityType + domainEntityId).
    const mealAssignmentId =
      typeof data.mealAssignmentId === "string"
        ? data.mealAssignmentId
        : data.domainEntityType === "meal_assignment" &&
            typeof data.domainEntityId === "string"
          ? data.domainEntityId
          : null;
    if (actionId === "meal_snooze_30") {
      if (mealAssignmentId) {
        const result = snoozeMeal(mealAssignmentId, new Date(), quietWindow("Asia/Kolkata"));
        if (result.ok) {
          const title =
            typeof response.notification.request.content.title === "string"
              ? response.notification.request.content.title
              : "Meal is due";
          void scheduleMealSnoozeNotification({
            title,
            body: "Open it in Diet, or snooze for 30 minutes.",
            mealAssignmentId,
            until: result.until,
          });
        }
      }
      emit({ kind: "snooze", mealAssignmentId });
      return;
    }
    // A body tap on a server push routes through openListener.ts (it carries
    // the routing payload). Only the local snooze reminder, which carries a
    // mealAssignmentId and no routing payload, opens from here; otherwise
    // every tap would also jump to Diet.
    if (
      actionId === "meal_open" ||
      (actionId === Notifications.DEFAULT_ACTION_IDENTIFIER &&
        mealAssignmentId &&
        typeof data.notificationType !== "string")
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
  until: Date;
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
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: input.until,
      // Android: the meal channel, so it stacks with the other meal reminders.
      channelId: pushGroupFor("meal_reminder").channelId,
    },
  });
  return "scheduled";
}
