import {
  parseCoachLogDedupeKey,
  type CoachLogEntityType,
  type Notification,
  type NotificationType,
} from "@fitbud/contracts";
import { labelFor, trainerNotificationCopy } from "@fitbud/core";

/** Lock-screen body when "Hide details on lock screen" is on. */
export const HIDDEN_LOCK_BODY = "You have something to log in FitBud.";

export type NotificationCopyContext = {
  coachName?: string | null;
  /** Trainee this trainer notification is about. Overrides clientDisplayName. */
  clientName?: string | null;
  /** Lock screen only. The inbox keeps the full sentence. */
  hideLockDetails?: boolean;
  /** Civil date today in the trainer's zone: names the meal day in a log-edit title. */
  today?: string | null;
};

/**
 * The client's given name for a trainer notification (TM-13a: "Aarav mentions
 * pain", "Sneha sent her check-in"), so the title fits one lock-screen line.
 * A raw enum or an email that leaked into the name field is not a name.
 */
function trainerClientName(
  notification: Notification,
  context: NotificationCopyContext,
): string | null {
  const name =
    context.clientName?.trim() || notification.clientDisplayName?.trim() || null;
  if (!name || /[_@]/.test(name)) return null;
  return name.split(/\s+/)[0] ?? null;
}

const LOCK_DETAIL_TYPES = new Set<NotificationType>([
  "meal_reminder",
  "workout_reminder",
  "checkin_reminder",
  "daily_summary",
  "activity_nudge",
  "trainer_note_shared",
]);

export function coachGivenName(displayName: string | null | undefined): string | null {
  const trimmed = displayName?.trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/)[0];
  if (!first || /^your$/i.test(first)) return null;
  return first;
}

function coachOrFallback(coachName: string | null | undefined): string {
  return coachGivenName(coachName) ?? "Your coach";
}

export function mealPushCopy(
  mealLabel: string,
  hideDetails = false,
): { title: string; body: string } {
  return {
    title: hideDetails ? HIDDEN_LOCK_BODY : `${mealLabel} isn't logged yet`,
    body: hideDetails ? HIDDEN_LOCK_BODY : "Open it in Diet, or snooze for 30 minutes.",
  };
}

export function checkinPushCopy(coachName?: string | null): {
  title: string;
  body: string;
} {
  return {
    title: "Weekly check-in is ready",
    body: `About 3 minutes. ${coachOrFallback(coachName)} will review it.`,
  };
}

export function notePushCopy(coachName?: string | null): {
  title: string;
  body: string;
} {
  return {
    title: `${coachOrFallback(coachName)} left a note`,
    body: "Tap to read.",
  };
}

/** TR-06h: the in-app banner over Today reads "Rahul left a note". */
export function noteBannerCopy(coachName?: string | null): { title: string } {
  return { title: `${coachOrFallback(coachName)} left a note` };
}

/**
 * "Coach updates to my logs" (Z6-19, D-W6-33, copy by Firoz). One type covers
 * a coach create and a coach edit; the dedupe key says which. A key this
 * build does not know falls back to the type label.
 */
export function coachLogCopy(notification: Pick<Notification, "dedupeKey">): {
  title: string;
  body: string;
} {
  const parsed = parseCoachLogDedupeKey(notification.dedupeKey);
  if (parsed?.action === "create") {
    return {
      title: "Logged by your coach",
      body: `Your coach logged ${COACH_LOG_THING[parsed.entityType].one} for you.`,
    };
  }
  if (parsed?.action === "edit") {
    return {
      title: "Edited by your coach",
      body: `Your coach updated one of your ${COACH_LOG_THING[parsed.entityType].many}.`,
    };
  }
  return { title: labelFor("notification_type", "coach_log_updated"), body: "" };
}

/** What the coach logged or edited, by entity type (D-W6-33; Z6-20 added meals and measurements). */
const COACH_LOG_THING: Record<CoachLogEntityType, { one: string; many: string }> = {
  workout_execution: { one: "a workout", many: "workouts" },
  meal_compliance: { one: "a meal", many: "meals" },
  measurement: { one: "a measurement", many: "measurements" },
};

export function inAppMealBannerCopy(mealLabel: string): { title: string } {
  return { title: `${mealLabel} isn't logged yet` };
}

function mealLabelFromRoute(notification: Notification): string {
  const route = notification.route.toLowerCase();
  if (route.includes("breakfast")) return "Breakfast";
  if (route.includes("lunch")) return "Lunch";
  if (route.includes("dinner")) return "Dinner";
  if (route.includes("snack")) return "Snack";
  return "Meal";
}

export function notificationRowTitle(
  notification: Notification,
  context: NotificationCopyContext = {},
): string {
  const type = notification.type;
  const meal = mealLabelFromRoute(notification);
  switch (type) {
    case "meal_reminder":
      // TR-15a names the meal; the record names it only when its route does.
      return meal === "Meal" ? "A meal is due" : `${meal} is due`;
    case "workout_reminder":
      return "Your workout is waiting";
    case "checkin_reminder":
      return checkinPushCopy(context.coachName).title;
    case "daily_summary":
      return "Things left today";
    case "activity_nudge":
      // The server's title (D-W12-9) is what the push carried; an older row
      // without one gets the same line from the coach's name.
      return (
        notification.title ??
        `${coachOrFallback(context.coachName)} sent you a reminder`
      );
    case "subscription_renewal_reminder":
      return "Plan renewal coming up";
    case "plan_published":
      return `${coachOrFallback(context.coachName)} changed your plan`;
    case "checkin_reviewed":
      return "Check-in reviewed";
    case "coach_answered":
      return `${coachOrFallback(context.coachName)} answered your question`;
    case "reminders_paused":
      return "Reminders paused for a while";
    case "relationship_ended":
      return "Coaching has ended";
    case "trainer_note_shared":
      return notePushCopy(context.coachName).title;
    case "reactivation_requested":
      return "Restart coaching?";
    case "trainer_ask_coach": {
      // TM-13b: "Aarav asked you". The ask itself goes out on WhatsApp.
      const client = trainerClientName(notification, context);
      return client ? `${client} asked you` : "A client asked you";
    }
    case "trainer_checkin_submitted":
    case "trainer_intake_submitted":
    case "trainer_renewal":
    case "trainer_meal_times_changed":
    case "trainer_client_log_edited":
      return trainerNotificationCopy(
        type,
        trainerClientName(notification, context),
        { logEdit: notification.logEdit, today: context.today },
      ).title;
    case "trainer_critical_digest":
      return "Clients need attention";
    case "admin_whatsapp_budget":
      return "WhatsApp budget alert";
    case "coach_log_updated":
      return coachLogCopy(notification).title;
    default: {
      const _exhaustive: never = type;
      return labelFor("notification_type", _exhaustive);
    }
  }
}

export function notificationRowBody(
  notification: Notification,
  context: NotificationCopyContext = {},
): string {
  if (
    context.hideLockDetails &&
    LOCK_DETAIL_TYPES.has(notification.type)
  ) {
    return HIDDEN_LOCK_BODY;
  }
  switch (notification.type) {
    case "meal_reminder":
      return "Tap to log it.";
    case "workout_reminder":
      return "Open it to start, or log it if you've trained.";
    case "checkin_reminder":
      return checkinPushCopy(context.coachName).body;
    case "daily_summary":
      return "Log what you did today, then rest easy.";
    case "activity_nudge":
      return notification.body ?? "Log it when you can.";
    case "subscription_renewal_reminder":
      return "Your coaching renewal window is open.";
    case "plan_published":
      return "See what's new in your plan.";
    case "checkin_reviewed":
      return `See ${coachOrFallback(context.coachName)}'s review.`;
    case "coach_answered":
      return "Tap to open the item they answered about.";
    case "reminders_paused":
      return "They didn't seem to help. Turn them back on anytime.";
    case "relationship_ended":
      return "Your access to this coaching space has ended.";
    case "trainer_note_shared":
      return notePushCopy(context.coachName).body;
    case "reactivation_requested":
      return `${coachOrFallback(context.coachName)} wants to restart coaching. Tap to review.`;
    case "trainer_ask_coach":
    case "trainer_checkin_submitted":
    case "trainer_intake_submitted":
    case "trainer_renewal":
    case "trainer_meal_times_changed":
    case "trainer_client_log_edited":
      return trainerNotificationCopy(
        notification.type,
        trainerClientName(notification, context),
        { logEdit: notification.logEdit, today: context.today },
      ).body;
    case "trainer_critical_digest":
      return "Open Attention to see who needs you.";
    case "admin_whatsapp_budget":
      return "Admin-only budget notice.";
    case "coach_log_updated":
      return coachLogCopy(notification).body;
    default:
      return "";
  }
}

/**
 * How a push groups on the phone (Z12-47): one Android channel and one iOS
 * notification category per kind, with the summary iOS shows on a collapsed
 * stack ("%u" is the count of the others). The copy above is the text; this is
 * where it lands. Expo's push service has no iOS thread id, so iOS stacks by
 * category summary and app, never per thread, until a native extension exists.
 */
export type PushGroupId =
  | "meal"
  | "workout"
  | "checkin"
  | "summary"
  | "coach"
  | "plan"
  | "account"
  | "clients";

export type PushGroup = {
  id: PushGroupId;
  /** Android channel id: the v2 id (Z14-6), never the deleted old one. */
  channelId: string;
  /** iOS category id: letters and underscores only (Expo rejects ":" and "-"). */
  categoryId: string;
  /** iOS stack summary, "%u" = the number of other notifications. */
  summary: string;
};

/**
 * The v2 Android channel ids (Z14-6): the same table as
 * `ANDROID_CHANNEL_ID_BY_GROUP` in androidChannels.ts, repeated here because that
 * file imports the native modules and this one is read by node-only code and
 * tests. `copy.test.ts` fails if the two tables differ.
 */
const ANDROID_CHANNEL_ID_BY_GROUP: Readonly<Record<PushGroupId, string>> = {
  workout: "workout_v2",
  meal: "meal_v2",
  checkin: "checkin_v2",
  summary: "summary",
  coach: "coach_v2",
  plan: "plan_v2",
  account: "account_v2",
  clients: "clients_v2",
};

const GROUPS: Record<PushGroupId, PushGroup> = {
  meal: {
    id: "meal",
    channelId: ANDROID_CHANNEL_ID_BY_GROUP.meal,
    // The meal category also carries the Open and Snooze 30 min buttons.
    categoryId: "meal_actions",
    summary: "%u more meal reminders",
  },
  workout: { id: "workout", channelId: ANDROID_CHANNEL_ID_BY_GROUP.workout, categoryId: "fitbud_workout", summary: "%u more workout reminders" },
  checkin: { id: "checkin", channelId: ANDROID_CHANNEL_ID_BY_GROUP.checkin, categoryId: "fitbud_checkin", summary: "%u more check-in reminders" },
  summary: { id: "summary", channelId: ANDROID_CHANNEL_ID_BY_GROUP.summary, categoryId: "fitbud_summary", summary: "%u more daily summaries" },
  coach: { id: "coach", channelId: ANDROID_CHANNEL_ID_BY_GROUP.coach, categoryId: "fitbud_coach", summary: "%u more from your coach" },
  plan: { id: "plan", channelId: ANDROID_CHANNEL_ID_BY_GROUP.plan, categoryId: "fitbud_plan", summary: "%u more plan updates" },
  account: { id: "account", channelId: ANDROID_CHANNEL_ID_BY_GROUP.account, categoryId: "fitbud_account", summary: "%u more coaching updates" },
  clients: { id: "clients", channelId: ANDROID_CHANNEL_ID_BY_GROUP.clients, categoryId: "fitbud_clients", summary: "%u more client updates" },
};

export const PUSH_GROUPS: readonly PushGroup[] = Object.values(GROUPS);

export function pushGroupFor(type: NotificationType): PushGroup {
  switch (type) {
    case "meal_reminder":
      return GROUPS.meal;
    case "workout_reminder":
      return GROUPS.workout;
    case "checkin_reminder":
      return GROUPS.checkin;
    case "daily_summary":
      return GROUPS.summary;
    case "activity_nudge":
    case "trainer_note_shared":
    case "checkin_reviewed":
    case "coach_answered":
    case "coach_log_updated":
      return GROUPS.coach;
    case "plan_published":
      return GROUPS.plan;
    case "subscription_renewal_reminder":
    case "reminders_paused":
    case "relationship_ended":
    case "reactivation_requested":
    case "admin_whatsapp_budget":
      return GROUPS.account;
    case "trainer_ask_coach":
    case "trainer_checkin_submitted":
    case "trainer_intake_submitted":
    case "trainer_renewal":
    case "trainer_meal_times_changed":
    case "trainer_client_log_edited":
    case "trainer_critical_digest":
      return GROUPS.clients;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/** Lock-screen limits (TR-15c, TM-13a at 393 pt): one title line, two body lines. */
export const PUSH_TITLE_MAX = 36;
export const PUSH_BODY_MAX = 90;

export function notificationTypeIcon(type: NotificationType): string {
  switch (type) {
    case "meal_reminder":
      return "🍽";
    case "workout_reminder":
      return "🏋";
    case "checkin_reminder":
      return "✓";
    case "daily_summary":
      return "☀";
    case "activity_nudge":
    case "trainer_note_shared":
    case "coach_answered":
    case "checkin_reviewed":
      return "💬";
    case "plan_published":
      return "📋";
    case "reminders_paused":
      return "⏸";
    case "relationship_ended":
    case "reactivation_requested":
      return "↺";
    case "subscription_renewal_reminder":
    case "trainer_renewal":
      return "🔔";
    case "trainer_ask_coach":
      return "💬";
    case "trainer_checkin_submitted":
    case "trainer_intake_submitted":
      return "📥";
    case "trainer_critical_digest":
      return "!";
    case "trainer_meal_times_changed":
      return "🕐";
    case "trainer_client_log_edited":
      return "✎";
    case "admin_whatsapp_budget":
      return "⚙";
    default:
      return "•";
  }
}

export function formatRelativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(
    new Date(iso),
  );
}
