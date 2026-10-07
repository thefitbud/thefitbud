import {
  realtimeEventSchema,
  type RealtimeEntityType,
  type RealtimeEvent,
  type RealtimeEventType,
} from "@fitbud/contracts";
import { createId, nowIso } from "../lib/crypto";
import type { Env } from "../types";

export type RealtimeHintInput = {
  eventType: RealtimeEventType;
  entityType: RealtimeEntityType;
  entityId: string;
  coachingRelationshipId: string;
  serverVersion: number;
  occurredAt?: string;
  eventId?: string;
};

/**
 * Emit a selected realtime change hint for a coaching relationship room.
 *
 * Best-effort: failures never fail the calling mutation. When the Durable Object
 * binding is absent (tests / misconfig), optionally records into REALTIME_TEST_SINK.
 * Workflows must remain correct when this no-ops.
 */
export async function emitRealtimeHint(
  env: Env,
  input: RealtimeHintInput,
): Promise<RealtimeEvent | null> {
  const event = realtimeEventSchema.parse({
    eventId: input.eventId ?? createId(),
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    coachingRelationshipId: input.coachingRelationshipId,
    serverVersion: input.serverVersion,
    occurredAt: input.occurredAt ?? nowIso(),
  });

  if (env.REALTIME_TEST_SINK) {
    env.REALTIME_TEST_SINK.push(event);
  }

  const namespace = env.RELATIONSHIP_REALTIME;
  if (!namespace) {
    return event;
  }

  try {
    const id = namespace.idFromName(event.coachingRelationshipId);
    const stub = namespace.get(id);
    await stub.fetch("https://realtime/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch {
    // Realtime is a hint channel — swallow delivery errors.
  }

  return event;
}

/** Fire-and-forget wrapper for mutation success paths. */
export function queueRealtimeHint(env: Env, input: RealtimeHintInput): void {
  void emitRealtimeHint(env, input).catch(() => undefined);
}
