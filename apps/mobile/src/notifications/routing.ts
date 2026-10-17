import {
  pushPayloadSchema,
  type Notification,
  type PushPayload,
} from "@fitbud/contracts";
import { notificationInboxRoute, routeTargetFromPushPayload } from "@fitbud/core";

export type NotificationDeepLink = {
  tab: "workout" | "diet" | "today";
  domainEntityType: PushPayload["domainEntityType"];
  domainEntityId: string;
  /** Payload is routing only — callers must refetch authoritative state. */
  refetchRequired: true;
};

/**
 * Parse a notification-open payload into a deep link.
 * Never treat the payload as workflow state.
 */
export function deepLinkFromNotificationPayload(
  raw: unknown,
): NotificationDeepLink | null {
  const parsed = pushPayloadSchema.safeParse(raw);
  if (!parsed.success) return null;
  const target = routeTargetFromPushPayload(parsed.data);
  return {
    ...target,
    refetchRequired: true,
  };
}

/** Prefer server `route` with validated routing payload (TR-15). */
export function deepLinkFromNotification(
  item: Pick<Notification, "routing" | "route">,
): NotificationDeepLink | null {
  const parsed = pushPayloadSchema.safeParse(item.routing);
  if (parsed.success) {
    const expected = notificationInboxRoute(parsed.data);
    if (item.route && item.route !== expected) {
      // Server route wins for inbox navigation; payload still drives tab/entity.
    }
  }
  return deepLinkFromNotificationPayload(item.routing);
}

/** Stable synthetic installation id for local AUTH_MODE=test registration. */
export function localInstallationId(): string {
  return "fitbud-mobile-local-install";
}
