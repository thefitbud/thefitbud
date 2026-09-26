import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./identity.js";

/**
 * Compact realtime hint types (selected freshness only).
 * Clients refetch/sync authoritative state; events are not CRUD payloads.
 */
export const realtimeEventTypeSchema = z.enum([
  "effective_plan_changed",
  "workout_execution_changed",
  "meal_compliance_changed",
  "checkin_submitted",
  "checkin_reviewed",
  "exception_created",
  "exception_acknowledged",
  "exception_resolved",
  /** Lifecycle umbrella used when a single hint covers create→active. */
  "exception_changed",
]);
export type RealtimeEventType = z.infer<typeof realtimeEventTypeSchema>;

/** Alias for Confluence "change kind" wording. */
export const realtimeChangeKindSchema = realtimeEventTypeSchema;
export type RealtimeChangeKind = RealtimeEventType;

export const realtimeEntityTypeSchema = z.enum([
  "plan_version",
  "workout_execution",
  "meal_compliance",
  "checkin",
  "exception",
]);
export type RealtimeEntityType = z.infer<typeof realtimeEntityTypeSchema>;

/**
 * Authorized compact change notification.
 * Keep keys minimal — no coaching summaries, notes, or health details.
 */
export const SAFE_REALTIME_EVENT_KEYS = [
  "eventId",
  "eventType",
  "entityType",
  "entityId",
  "coachingRelationshipId",
  "serverVersion",
  "occurredAt",
] as const;

export const realtimeEventSchema = z
  .object({
    eventId: uuidSchema,
    eventType: realtimeEventTypeSchema,
    entityType: realtimeEntityTypeSchema,
    entityId: uuidSchema,
    coachingRelationshipId: uuidSchema,
    serverVersion: z.number().int().nonnegative(),
    occurredAt: isoDateTimeSchema,
  })
  .strict();
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;

export const realtimeSubscriptionTargetSchema = z.object({
  coachingRelationshipId: uuidSchema,
  channel: z.string().min(1).max(128),
  path: z.string().min(1),
  protocol: z.literal("websocket"),
  /**
   * Explicit reminder: sockets never replace REST/sync.
   * Offline and HTTP paths remain correct when realtime is unavailable.
   */
  authority: z.literal("rest_and_sync"),
});
export type RealtimeSubscriptionTarget = z.infer<
  typeof realtimeSubscriptionTargetSchema
>;

/** @deprecated Prefer realtimeSubscriptionTargetSchema */
export const realtimeConnectionTargetSchema = realtimeSubscriptionTargetSchema;
export type RealtimeConnectionTarget = RealtimeSubscriptionTarget;

export function relationshipRealtimeChannel(relationshipId: string): string {
  return `relationship:${relationshipId}`;
}

export function relationshipRealtimePath(relationshipId: string): string {
  return `/realtime/relationships/${relationshipId}/ws`;
}
