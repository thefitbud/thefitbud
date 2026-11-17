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
    // TraineeShell subscribes only while a trainee session is mounted. With no
    // subscriber (signed out, or a trainer session) a meal button press is
    // dropped: it must not schedule a reminder carrying an earlier trainee's
    // meal title, or open their assignment.
    if (listeners.size === 0) return;
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

/**
 * Sign-out: cancels every scheduled meal snooze reminder and takes delivered
 * ones out of Notification Centre, so the next person on this phone never sees
 * the signed-out trainee's meal title or opens their assignment. Only the local
 * reminder carries `mealAssignmentId`; server pushes are left alone.
 */
export async function cancelMealSnoozeReminders(): Promise<void> {
  if (Platform.OS === "web") return;
  const Notifications = await import("expo-notifications");
  const isSnoozeReminder = (data: Record<string, unknown> | null | undefined) =>
    typeof data?.mealAssignmentId === "string";
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const request of scheduled) {
    if (isSnoozeReminder(request.content.data)) {
      await Notifications.cancelScheduledNotificationAsync(request.identifier);
    }
  }
  const presented = await Notifications.getPresentedNotificationsAsync();
  for (const notification of presented) {
    if (isSnoozeReminder(notification.request.content.data)) {
      await Notifications.dismissNotificationAsync(notification.request.identifier);
    }
  }
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
