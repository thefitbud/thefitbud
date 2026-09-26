import type { RealtimeEntityType, RealtimeEventType } from "@fitbud/contracts";
import { relationshipRealtimeChannel } from "@fitbud/contracts";

const EVENT_TYPE_ENTITY: Record<RealtimeEventType, RealtimeEntityType> = {
  effective_plan_changed: "plan_version",
  workout_execution_changed: "workout_execution",
  meal_compliance_changed: "meal_compliance",
  checkin_submitted: "checkin",
  checkin_reviewed: "checkin",
  exception_created: "exception",
  exception_acknowledged: "exception",
  exception_resolved: "exception",
  exception_changed: "exception",
};

/** Ensures eventType and entityType stay aligned for compact hints. */
export function entityTypeForRealtimeEvent(
  eventType: RealtimeEventType,
): RealtimeEntityType {
  return EVENT_TYPE_ENTITY[eventType];
}

/** @deprecated Prefer entityTypeForRealtimeEvent */
export const entityTypeForRealtimeChange = entityTypeForRealtimeEvent;

export function isAuthorizedRealtimeChannel(
  channel: string,
  relationshipId: string,
): boolean {
  return channel === relationshipRealtimeChannel(relationshipId);
}
