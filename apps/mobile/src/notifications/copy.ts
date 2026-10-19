import type { Notification, NotificationType } from "@fitbud/contracts";

/** Lock-screen body when "Hide details on lock screen" is on. */
export const HIDDEN_LOCK_BODY = "You have something to log in FitBud.";

export type NotificationCopyContext = {
  coachName?: string | null;
  /** Lock screen only. The inbox keeps the full sentence. */
  hideLockDetails?: boolean;
};

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
    title: `${mealLabel} isn't logged yet`,
    body: hideDetails
      ? HIDDEN_LOCK_BODY
      : "Tap if you ate as planned. Changed something? Open to log it.",
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
    title: `${coachOrFallback(coachName)} has a note for you!`,
    body: "Tap to read.",
  };
}

export function noteBannerCopy(coachName?: string | null): {
  kicker: string;
  title: string;
  body: string;
  mark: string;
} {
  const coach = coachOrFallback(coachName);
  return {
    kicker: "From your coach",
    title: `${coach} has a note for you!`,
    body: "Tap to read it on Today.",
    mark: coach.slice(0, 1).toUpperCase(),
  };
}

export function inAppMealBannerCopy(mealLabel: string): {
  kicker: string;
  title: string;
  body: string;
} {
  return {
    kicker: `FitBud · ${mealLabel}`,
    title: `${mealLabel} isn't logged yet`,
    body: "Ate as planned? One tap logs it.",
  };
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
      return mealPushCopy(meal).title;
    case "workout_reminder":
      return "Time for your workout?";
    case "checkin_reminder":
      return checkinPushCopy(context.coachName).title;
    case "daily_summary":
      return "Things left today";
    case "activity_nudge":
      return "Quick reminder from your coach";
    case "subscription_renewal_reminder":
      return "Plan renewal coming up";
    case "plan_published":
      return "Your plan is updated";
    case "checkin_reviewed":
      return "Your coach reviewed your check-in";
    case "coach_answered":
      return "Your coach answered your question";
    case "reminders_paused":
      return "Reminders paused for a while";
    case "relationship_ended":
      return "Coaching has ended";
    case "trainer_note_shared":
      return notePushCopy(context.coachName).title;
    case "reactivation_requested":
      return "Your coach wants to restart coaching";
    case "trainer_ask_coach":
      return "Client asked on WhatsApp";
    case "trainer_checkin_submitted":
      return "Check-in submitted";
    case "trainer_intake_submitted":
      return "Intake submitted";
    case "trainer_critical_digest":
      return "Clients need attention";
    case "trainer_renewal":
      return "Client renewal due";
    case "trainer_meal_times_changed":
      return "Client changed meal times";
    case "admin_whatsapp_budget":
      return "WhatsApp budget alert";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
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
      return mealPushCopy(mealLabelFromRoute(notification)).body;
    case "workout_reminder":
      return "If you've already trained, log it in a tap. If today's not the day, that's okay too.";
    case "checkin_reminder":
      return checkinPushCopy(context.coachName).body;
    case "daily_summary":
      return "Log what you did today, then rest easy.";
    case "activity_nudge":
      return "Log it when you can.";
    case "subscription_renewal_reminder":
      return "Your coaching renewal window is open.";
    case "plan_published":
      return "See what's new in your plan.";
    case "checkin_reviewed":
      return "Tap to see your coach's review.";
    case "coach_answered":
      return "Tap to open the item they answered about.";
    case "reminders_paused":
      return "They didn't seem to help. Turn them back on anytime.";
    case "relationship_ended":
      return "Your access to this coaching space has ended.";
    case "trainer_note_shared":
      return notePushCopy(context.coachName).body;
    case "reactivation_requested":
      return "Tap to review the request.";
    case "trainer_ask_coach":
      return "Open the item they asked about.";
    case "trainer_checkin_submitted":
      return "Review when you're ready.";
    case "trainer_intake_submitted":
      return "Review their intake answers.";
    case "trainer_critical_digest":
      return "Open Attention to see who needs you.";
    case "trainer_renewal":
      return "Follow up before the window closes.";
    case "trainer_meal_times_changed":
      return "Reminders will follow their new times.";
    case "admin_whatsapp_budget":
      return "Admin-only budget notice.";
    default:
      return "";
  }
}

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
