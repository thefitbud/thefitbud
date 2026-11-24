import {
  pushPayloadSchema,
  type Notification,
  type NotificationType,
  type PushPayload,
} from "@fitbud/contracts";
import { notificationInboxRoute, routeTargetFromPushPayload } from "@fitbud/core";
import type { ResolvedAppRoute } from "../navigation/linking";

/**
 * Where a trainer push opens. The payload carries ids only; the shell refetches
 * before showing anything.
 */
export type TrainerNotificationRoute =
  | { kind: "checkin"; checkinId: string }
  | { kind: "client"; relationshipId: string }
  | {
      // Z14-16 (D-W14-23 g): a client changed a meal log. Opens that client's
      // diet day. The push carries ids only, so `date` and `entryId` are filled
      // from the stored inbox row (`item.logEdit`) when the tap comes from the
      // inbox; from a push the shell looks the row up by `notificationId`.
      kind: "clientDiet";
      relationshipId: string;
      notificationId: string | null;
      date: string | null;
      /** Null for a removed entry: the day opens with nothing selected. */
      entryId: string | null;
    }
  | { kind: "attention" };

export type NotificationDeepLink = {
  tab: "workout" | "diet" | "today" | "progress" | "more";
  domainEntityType: PushPayload["domainEntityType"];
  domainEntityId: string;
  /** Exact in-app route for TR-23 (preferred over tab alone). */
  route: ResolvedAppRoute;
  path: string;
  /** Set only for trainer notification types; trainee types never carry one. */
  trainerRoute?: TrainerNotificationRoute | null;
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
    case "relationship_ended":
      return { type: "tab", tab: "today" };
    case "plan_published":
      // F13: "Rahul changed your plan" opens the Workout tab, where the
      // plan-changed banner says what changed (W-01d).
      return { type: "tab", tab: "workout" };
    case "reminders_paused":
      // Where they can be turned back on ("Turn them back on anytime").
      return { type: "reminders" };
    case "coach_answered":
      // Opens the item the question was about, when the payload names one.
      if (payload.domainEntityType === "workout_assignment") {
        return { type: "workout_overview", assignmentId: payload.domainEntityId };
      }
      if (payload.domainEntityType === "meal_assignment") {
        return { type: "meal", assignmentId: payload.domainEntityId };
      }
      return { type: "tab", tab: "today" };
    case "activity_nudge":
      if (payload.domainEntityType === "workout_assignment") {
        return { type: "workout_overview", assignmentId: payload.domainEntityId };
      }
      if (payload.domainEntityType === "meal_assignment") {
        return { type: "meal", assignmentId: payload.domainEntityId };
      }
      return { type: "tab", tab: "today" };
    case "coach_log_updated":
      // Z6-19 / Z6-20 (D-W6-33, D-W6-38): opens the workout or the meal day the
      // coach logged or edited, or Progress for a measurement.
      if (payload.domainEntityType === "workout_assignment") {
        return { type: "workout_overview", assignmentId: payload.domainEntityId };
      }
      if (payload.domainEntityType === "meal_assignment") {
        return { type: "meal", assignmentId: payload.domainEntityId };
      }
      if (payload.domainEntityType === "coaching_relationship") {
        return { type: "tab", tab: "progress" };
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
    case "trainer_client_log_edited":
    case "admin_whatsapp_budget":
      return { type: "tab", tab: "today" };
    default: {
      const _exhaustive: never = payload.notificationType;
      return _exhaustive;
    }
  }
}

/**
 * Trainer types open trainer screens. An id of the wrong entity type is not
 * trusted as a client or check-in id; it falls back to the attention list.
 */
function trainerRouteFromPayload(
  payload: PushPayload,
): TrainerNotificationRoute | null {
  if (!TRAINER_NOTIFICATION_TYPES.includes(payload.notificationType)) {
    return null;
  }
  const id = payload.domainEntityId;
  switch (payload.notificationType) {
    case "trainer_checkin_submitted":
      return payload.domainEntityType === "checkin"
        ? { kind: "checkin", checkinId: id }
        : { kind: "attention" };
    case "trainer_intake_submitted":
    case "trainer_meal_times_changed":
      return payload.domainEntityType === "coaching_relationship"
        ? { kind: "client", relationshipId: id }
        : { kind: "attention" };
    case "trainer_client_log_edited":
      return payload.domainEntityType === "coaching_relationship"
        ? {
            kind: "clientDiet",
            relationshipId: id,
            notificationId: payload.notificationId,
            date: null,
            entryId: null,
          }
        : { kind: "attention" };
    case "trainer_ask_coach":
      // Asks are shown and answered under the Attention tab's Asked filter.
      return { kind: "attention" };
    default:
      return { kind: "attention" };
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
    case "tab":
      return route.tab;
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
    trainerRoute: trainerRouteFromPayload(parsed.data),
    refetchRequired: true,
  };
}

/**
 * Prefer server `route` with validated routing payload (TR-15). A client's
 * meal-log change also carries the day and entry from the stored row.
 */
export function deepLinkFromNotification(
  item: Pick<Notification, "routing" | "route"> & Partial<Pick<Notification, "logEdit">>,
): NotificationDeepLink | null {
  const link = deepLinkFromNotificationPayload(item.routing);
  if (link?.trainerRoute?.kind === "clientDiet" && item.logEdit) {
    link.trainerRoute = {
      ...link.trainerRoute,
      date: item.logEdit.mealDate,
      entryId: item.logEdit.action === "edited" ? item.logEdit.entryId : null,
    };
  }
  return link;
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
  "coach_log_updated",
];

/** Trainer-facing push types that open a trainer screen (D-W3-1). */
export const TRAINER_NOTIFICATION_TYPES: NotificationType[] = [
  "trainer_ask_coach",
  "trainer_checkin_submitted",
  "trainer_intake_submitted",
  "trainer_meal_times_changed",
  "trainer_client_log_edited",
];

/** Which role may route a push of this type; null = not routed from a tap. */
export function notificationAudience(
  type: NotificationType,
): "trainee" | "trainer" | null {
  if (TRAINEE_NOTIFICATION_TYPES.includes(type)) return "trainee";
  if (TRAINER_NOTIFICATION_TYPES.includes(type)) return "trainer";
  return null;
}

/** Stable synthetic installation id for local AUTH_MODE=test registration. */
export function localInstallationId(): string {
  return "fitbud-mobile-local-install";
}
