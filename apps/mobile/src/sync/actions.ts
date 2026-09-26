import type {
  SyncMutationOperation,
  SyncMutationResult,
} from "@fitbud/contracts";
import { SYNC_OPERATION_ENTITY } from "@fitbud/contracts";
import { createIdempotencyKey } from "../lib/idempotency";
import type { SyncEngine } from "./engine";

/**
 * Enqueues one logical offline mutation with a stable mutation UUID and
 * idempotency key, then attempts a push when online. Retries reuse the same keys.
 * File uploads must not go through this helper — use engine.enqueueFileUpload.
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
  const mutationId = input.mutationId ?? createIdempotencyKey();
  const idempotencyKey = input.idempotencyKey ?? mutationId;
  const entityType = SYNC_OPERATION_ENTITY[input.operation];
  const clientOccurredAt = new Date().toISOString();

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
    payloadJson: JSON.stringify(input.payload),
  });

  let results: SyncMutationResult[] = [];
  try {
    results = await engine.pushPending();
  } catch {
    // Leave pending for reconnect retry (airplane mode / network failure).
  }
  return { mutationId, idempotencyKey, results };
}
