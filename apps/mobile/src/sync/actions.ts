import type {
  SyncMutationOperation,
  SyncMutationResult,
} from "@fitbud/contracts";
import { SYNC_OPERATION_ENTITY } from "@fitbud/contracts";
import { createIdempotencyKey } from "../lib/idempotency";
import type { SyncEngine } from "./engine";

/**
 * Operations whose caller still reads the server's verdict before it moves on
 * (Z14-2 decide-and-note):
 * - `workout.start`: the start screen opens the execution the server created,
 *   with the server's set ids, so it must wait for the start to land; a
 *   started workout made from the plan alone carries ids the server does not
 *   know.
 * - `checkin.submit`: the check-in screen runs the version-conflict retry and
 *   chooses between "Sent" and "Saved on your phone" from the verdict.
 * Neither is a meal or set log; every log returns at once (D-W14-6).
 */
export const AWAITS_VERDICT: ReadonlySet<SyncMutationOperation> = new Set<
  SyncMutationOperation
>(["workout.start", "checkin.submit"]);

export type EnqueueResult = {
  mutationId: string;
  idempotencyKey: string;
  /**
   * The server's verdict on this action, when the caller waited for it
   * (`wait`, or an `AWAITS_VERDICT` operation). For a log that returned at
   * once it is empty: the verdict lands on the outbox row, which the sync
   * status and the screens read.
   */
  results: SyncMutationResult[];
  /**
   * This action's verdict from the push that was started for it. Never
   * rejects: a push that could not reach the API resolves with `[]` and the
   * row waits in the outbox for the triggers.
   */
  pushed: Promise<SyncMutationResult[]>;
};

/**
 * Saves one logical action on the phone and starts sending it (D-W14-6).
 *
 * - The optimistic local snapshot (if any) and the outbox row are written to
 *   durable storage before this resolves, and before any request.
 * - One action is one row: the mutation id is also the idempotency key, and
 *   both are reused on every retry.
 * - The push runs behind it. The caller gets control back as soon as the row
 *   is on the phone; the push's verdict (sent, refused with the server's
 *   message, waiting) is written to the outbox row, never thrown here.
 * - `wait: true` (or an `AWAITS_VERDICT` operation) keeps the old shape: the
 *   promise resolves after the push with this action's verdict.
 *
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
    /** Wait for the push and return its verdict in `results`. */
    wait?: boolean;
  },
): Promise<EnqueueResult> {
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

  const pushed: Promise<SyncMutationResult[]> = engine.pushPending().then(
    // Only this action's verdict: another row refused in the same request is
    // not this action's failure (the sync status screen shows that one).
    (results) => results.filter((result) => result.mutationId === mutationId),
    // Not sent this time. The row is waiting in the outbox with the reason,
    // and the triggers (reconnect, foreground, 30 s, next API call) retry it.
    () => [],
  );

  const wait = input.wait ?? AWAITS_VERDICT.has(input.operation);
  return {
    mutationId,
    idempotencyKey,
    results: wait ? await pushed : [],
    pushed,
  };
}
