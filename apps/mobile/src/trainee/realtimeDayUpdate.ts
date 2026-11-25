import type { RealtimeEvent } from "@fitbud/contracts";
import { markRelationshipDaysStale } from "./dataCache";

/**
 * What the trainee shell does about one realtime hint (Z14-44). Events carry
 * no meal or workout fields and no date, so they stay hints: the cached days
 * are marked stale (they keep showing) and the screen refetches them
 * underneath. The plan is reloaded only when the plan itself changed.
 *
 * - `effective_plan_changed`: reload the plan, mark cached days stale.
 * - `meal_compliance_changed`, `workout_execution_changed`: mark cached days
 *   stale only. No plan pull, no sync pull.
 * - check-in and exception hints: unread count only.
 * - an unknown or future type: unread count only (quiet, never throws).
 */
export type RealtimeDayActions = {
  reloadPlan: () => void;
  refreshUnread: () => void;
};

export function applyRealtimeHint(
  event: Pick<RealtimeEvent, "eventType">,
  relationshipId: string,
  actions: RealtimeDayActions,
): void {
  switch (event.eventType) {
    case "effective_plan_changed":
      markRelationshipDaysStale(relationshipId);
      actions.reloadPlan();
      actions.refreshUnread();
      return;
    case "meal_compliance_changed":
    case "workout_execution_changed":
      markRelationshipDaysStale(relationshipId);
      actions.refreshUnread();
      return;
    default:
      actions.refreshUnread();
  }
}
