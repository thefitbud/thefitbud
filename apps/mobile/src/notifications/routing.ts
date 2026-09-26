import {
  pushPayloadSchema,
  type PushPayload,
} from "@fitbud/contracts";
import { routeTargetFromPushPayload } from "@fitbud/core";

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

/** Stable synthetic installation id for local AUTH_MODE=test registration. */
export function localInstallationId(): string {
  return "fitbud-mobile-local-install";
}
