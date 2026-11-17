import type {
  SyncMutationOperation,
  SyncMutationResult,
} from "@fitbud/contracts";
import { SYNC_OPERATION_ENTITY } from "@fitbud/contracts";
import { createIdempotencyKey } from "../lib/idempotency";
import type { SyncEngine } from "./engine";

/**
 * Saves one logical action on the phone, then tries to send it.
 *
 * - The row is written to the outbox (durable storage) before any request.
 * - One action is one row: the mutation id is also the idempotency key, and
 *   both are reused on every retry.
 * - A send that cannot reach the API is not an error here: the row stays
 *   waiting and the sync triggers send it later.
 *
 * `results` holds the server's verdict on this action, and only this action,
 * when there is one.
 * File uploads must not go through this helper: use engine.enqueueFileUpload.
 */
export async function enqueueAndPush(
  engine: SyncEngine,
  input: {
    mutationId?: string;
    idempotencyKey?: string;
    recordId: string;
    operation: SyncMutationOperation;
    expectedServerVersion?: number | null;
    payload: Record<string, unknown>;
    /** Optional optimistic local snapshot written before the outbox entry. */
    localPayload?: unknown;
  },
): Promise<{
  mutationId: string;
  idempotencyKey: string;
  results: SyncMutationResult[];
}> {
  const entityType = SYNC_OPERATION_ENTITY[input.operation];
  const clientOccurredAt = new Date().toISOString();
  const payloadJson = JSON.stringify(input.payload);

  const mutationId = input.mutationId ?? createIdempotencyKey();
  const idempotencyKey = input.idempotencyKey ?? mutationId;

  if (input.localPayload !== undefined) {
    await engine.store.upsertLocal({
      entityType,
      recordId: input.recordId,
      serverVersion: input.expectedServerVersion ?? 0,
      payloadJson: JSON.stringify(input.localPayload),
      tombstone: false,
      updatedAt: clientOccurredAt,
    });
  }

  await engine.enqueue({
    mutationId,
    idempotencyKey,
    entityType,
    recordId: input.recordId,
    operation: input.operation,
    expectedServerVersion: input.expectedServerVersion ?? null,
    clientOccurredAt,
    payloadJson,
  });

  let results: SyncMutationResult[] = [];
  try {
    results = await engine.pushPending();
  } catch {
    // Not sent this time. The row is waiting in the outbox with the reason,
    // and the triggers (reconnect, foreground, 30 s, next API call) retry it.
  }
  // Only this action's verdict: another row refused in the same request is
  // not this action's failure (the sync status screen shows that one).
  return {
    mutationId,
    idempotencyKey,
    results: results.filter((result) => result.mutationId === mutationId),
  };
}
