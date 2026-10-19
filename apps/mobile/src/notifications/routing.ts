import {
  pushPayloadSchema,
  type Notification,
  type NotificationType,
  type PushPayload,
} from "@fitbud/contracts";
import { notificationInboxRoute, routeTargetFromPushPayload } from "@fitbud/core";
import type { ResolvedAppRoute } from "../navigation/linking";

export type NotificationDeepLink = {
  tab: "workout" | "diet" | "today" | "progress" | "more";
  domainEntityType: PushPayload["domainEntityType"];
  domainEntityId: string;
  /** Exact in-app route for TR-23 (preferred over tab alone). */
  route: ResolvedAppRoute;
  path: string;
  /** Payload is routing only — callers must refetch authoritative state. */
  refetchRequired: true;
};

function exactRouteFromPayload(payload: PushPayload): ResolvedAppRoute {
  switch (payload.notificationType) {
    case "workout_reminder":
      return { type: "workout_overview", assignmentId: payload.domainEntityId };
    case "meal_reminder":
      return { type: "meal", assignmentId: payload.domainEntityId };
    case "checkin_reminder":
    case "checkin_reviewed":
      return { type: "checkin", checkinId: payload.domainEntityId };
    case "daily_summary":
    case "subscription_renewal_reminder":
    case "plan_published":
    case "coach_answered":
    case "reminders_paused":
    case "relationship_ended":
      return { type: "tab", tab: "today" };
    case "activity_nudge":
      if (payload.domainEntityType === "workout_assignment") {
        return { type: "workout_overview", assignmentId: payload.domainEntityId };
      }
      if (payload.domainEntityType === "meal_assignment") {
        return { type: "meal", assignmentId: payload.domainEntityId };
      }
      return { type: "tab", tab: "today" };
    case "trainer_note_shared":
      return { type: "note", noteId: payload.domainEntityId };
    case "reactivation_requested":
      return { type: "reactivate", requestId: payload.domainEntityId };
    case "trainer_ask_coach":
    case "trainer_checkin_submitted":
    case "trainer_intake_submitted":
    case "trainer_critical_digest":
    case "trainer_renewal":
    case "trainer_meal_times_changed":
    case "admin_whatsapp_budget":
      return { type: "tab", tab: "today" };
    default: {
      const _exhaustive: never = payload.notificationType;
      return _exhaustive;
    }
  }
}

function tabFromRoute(route: ResolvedAppRoute): NotificationDeepLink["tab"] {
  switch (route.type) {
    case "workout_overview":
    case "workout_active":
    case "workout_summary":
      return "workout";
    case "meal":
      return "diet";
    case "reminders":
      return "more";
    default:
      return "today";
  }
}

/**
 * Parse a notification-open payload into a deep link.
 * Never treat the payload as workflow state.
 */
export function deepLinkFromNotificationPayload(
  raw: unknown,
): NotificationDeepLink | null {
  const parsed = pushPayloadSchema.safeParse(raw);
  if (!parsed.success) return null;
  const legacy = routeTargetFromPushPayload(parsed.data);
  const route = exactRouteFromPayload(parsed.data);
  return {
    tab: tabFromRoute(route) === "today" ? legacy.tab : tabFromRoute(route),
    domainEntityType: legacy.domainEntityType,
    domainEntityId: legacy.domainEntityId,
    route,
    path: notificationInboxRoute(parsed.data),
    refetchRequired: true,
  };
}

/** Prefer server `route` with validated routing payload (TR-15). */
export function deepLinkFromNotification(
  item: Pick<Notification, "routing" | "route">,
): NotificationDeepLink | null {
  return deepLinkFromNotificationPayload(item.routing);
}

/** Every trainee-facing notification type in §4 maps to a documented screen. */
export const TRAINEE_NOTIFICATION_TYPES: NotificationType[] = [
  "workout_reminder",
  "meal_reminder",
  "checkin_reminder",
  "subscription_renewal_reminder",
  "daily_summary",
  "activity_nudge",
  "plan_published",
  "checkin_reviewed",
  "coach_answered",
  "reminders_paused",
  "relationship_ended",
  "trainer_note_shared",
  "reactivation_requested",
];

/** Stable synthetic installation id for local AUTH_MODE=test registration. */
export function localInstallationId(): string {
  return "fitbud-mobile-local-install";
}
