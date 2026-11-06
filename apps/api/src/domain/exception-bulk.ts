import { and, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import {
  BULK_RESOLVE_UNDO_WINDOW_MS,
  isBulkResolvableExceptionType,
  type BulkResolveExceptionsRequest,
  type BulkResolveExceptionsResponse,
  type BulkResolveItemResult,
  type BulkUndoResponse,
  type ExceptionStatus,
} from "@fitbud/contracts";
import { isOpenExceptionStatus } from "@fitbud/core";
import type { Db } from "../db/client";
import {
  exceptionActions,
  exceptions,
  idempotencyRecords,
  interventions,
} from "../db/schema";
import { createId, sha256Hex } from "../lib/crypto";

/**
 * Z6-10 (SPB, D11 locked): bulk Resolve for one client's compatible exceptions.
 *
 * Each resolved item gets the same writes as `POST /exceptions/:id/resolve`:
 * the exception row moves to resolved with the outcome and note, one `resolve`
 * exception action, one `resolve` intervention and, when a note is entered, one
 * `note` intervention. Bulk is one trainer action over items the trainer chose,
 * so an open item that was not yet reviewed is reviewed and resolved in the same
 * step (the trainer web drawer does the same for a single Resolve). The API never
 * resolves anything the trainer did not select.
 *
 * Undo state lives in D1 as a server-held receipt in `idempotency_records`
 * (actor-scoped, keyed by the bulk id), so no new table is needed: it records
 * every item's prior status and the ids of the rows the bulk wrote, which undo
 * deletes. A second receipt keyed by the same bulk id records the undo itself
 * (actor, time, restored items) and makes a second undo impossible.
 */

export const BULK_RESOLVE_OPERATION = "exception.bulk_resolve";
export const BULK_UNDO_OPERATION = "exception.bulk_undo";
/** Receipt written with a bulk resolve; read by undo. */
export const BULK_UNDO_STATE_OPERATION = "exception.bulk_resolve.state";
/** Receipt written when a bulk resolve is undone (the undo action log). */
export const BULK_UNDONE_OPERATION = "exception.bulk_resolve.undone";

/** How long the receipts are kept. Undo itself closes after 5 s. */
const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;

type ExceptionRow = typeof exceptions.$inferSelect;
type Write = BatchItem<"sqlite">;

export type BulkClassification =
  | { id: string; status: "resolve"; row: ExceptionRow }
  | {
      id: string;
      status: "skip";
      reason: "not_found" | "incompatible_type" | "already_resolved";
    };

/**
 * Decides each requested id. `rows` must already be limited to the requested
 * client's relationship: anything else is `not_found`, whoever owns it.
 */
export function classifyBulkResolve(
  requestedIds: readonly string[],
  rows: readonly ExceptionRow[],
  relationshipId: string,
): BulkClassification[] {
  const byId = new Map(
    rows
      .filter((row) => row.coachingRelationshipId === relationshipId)
      .map((row) => [row.id, row]),
  );
  return requestedIds.map((id) => {
    const row = byId.get(id);
    if (!row) return { id, status: "skip", reason: "not_found" };
    if (!isBulkResolvableExceptionType(row.type)) {
      return { id, status: "skip", reason: "incompatible_type" };
    }
    if (!isOpenExceptionStatus(row.status)) {
      return { id, status: "skip", reason: "already_resolved" };
    }
    return { id, status: "resolve", row };
  });
}

type UndoStateItem = {
  id: string;
  priorStatus: ExceptionStatus;
  priorAcknowledgedAt: string | null;
  actionId: string;
  interventionIds: string[];
};

type UndoState = {
  bulkId: string;
  relationshipId: string;
  resolvedAt: string;
  items: UndoStateItem[];
};

/**
 * Builds (does not run) a receipt insert for the batch. Takes the key hash
 * already computed: an async builder would await, and so run, the query.
 */
function receiptInsert(
  db: Db,
  input: {
    actorUserId: string;
    operation: string;
    keyHash: string;
    fingerprint: string;
    body: unknown;
    createdAt: string;
    expiresAt: string;
    status?: number;
  },
): Write {
  // A plain insert, not "on conflict do nothing": a duplicate key fails the
  // whole batch, so two concurrent identical requests cannot both write.
  return db.insert(idempotencyRecords).values({
    id: createId(),
    actorUserId: input.actorUserId,
    operation: input.operation,
    keyHash: input.keyHash,
    requestFingerprint: input.fingerprint,
    responseStatus: input.status ?? 200,
    responseBody: JSON.stringify(input.body),
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
  });
}

function plusMs(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}

export async function loadRelationshipExceptions(
  db: Db,
  relationshipId: string,
  ids: readonly string[],
): Promise<ExceptionRow[]> {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(exceptions)
    .where(
      and(
        eq(exceptions.coachingRelationshipId, relationshipId),
        inArray(exceptions.id, [...ids]),
      ),
    );
}

/**
 * Resolves the compatible items in one D1 batch (one transaction) together with
 * the idempotency record and the undo receipt. Returns the response body.
 */
export async function performBulkResolve(
  db: Db,
  input: {
    actorUserId: string;
    relationshipId: string;
    request: BulkResolveExceptionsRequest;
    classification: BulkClassification[];
    idempotencyKey: string;
    fingerprint: string;
    now: string;
  },
): Promise<{ body: { data: BulkResolveExceptionsResponse }; resolvedIds: string[] }> {
  const { now, actorUserId, relationshipId } = input;
  const outcome = input.request.outcome;
  const noteText = input.request.note?.trim() || null;
  const toResolve = input.classification.flatMap((item) =>
    item.status === "resolve" ? [item.row] : [],
  );
  const bulkId = toResolve.length > 0 ? createId() : null;

  const writes: Write[] = [];
  const stateItems: UndoStateItem[] = [];
  for (const row of toResolve) {
    const actionId = createId();
    const resolveInterventionId = createId();
    const interventionIds = [resolveInterventionId];
    writes.push(
      db
        .update(exceptions)
        .set({
          status: "resolved",
          acknowledgedAt: row.acknowledgedAt ?? now,
          resolvedAt: now,
          resolutionOutcome: outcome,
          resolutionNote: noteText,
          closedReason: "trainer",
          updatedAt: now,
        })
        .where(
          and(
            eq(exceptions.id, row.id),
            inArray(exceptions.status, ["detected", "active", "acknowledged"]),
          ),
        ),
      db.insert(exceptionActions).values({
        id: actionId,
        exceptionId: row.id,
        trainerUserId: actorUserId,
        action: "resolve",
        note: noteText,
        createdAt: now,
      }),
      db.insert(interventions).values({
        id: resolveInterventionId,
        coachingRelationshipId: relationshipId,
        trainerUserId: actorUserId,
        exceptionId: row.id,
        checkinId: null,
        kind: "resolve",
        summary: `Resolved (${outcome}): ${row.summary}`,
        resultingPlanVersionId: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
    if (noteText) {
      const noteInterventionId = createId();
      interventionIds.push(noteInterventionId);
      writes.push(
        db.insert(interventions).values({
          id: noteInterventionId,
          coachingRelationshipId: relationshipId,
          trainerUserId: actorUserId,
          exceptionId: row.id,
          checkinId: null,
          kind: "note",
          summary: noteText,
          resultingPlanVersionId: null,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    stateItems.push({
      id: row.id,
      priorStatus: row.status,
      priorAcknowledgedAt: row.acknowledgedAt,
      actionId,
      interventionIds,
    });
  }

  const items: BulkResolveItemResult[] = input.classification.map((item) =>
    item.status === "resolve"
      ? { id: item.id, status: "resolved" }
      : { id: item.id, status: "skipped", reason: item.reason },
  );
  const body = {
    data: {
      bulkId,
      relationshipId,
      resolvedCount: toResolve.length,
      skippedCount: items.length - toResolve.length,
      items,
      resolvedAt: bulkId ? now : null,
      undoExpiresAt: bulkId ? plusMs(now, BULK_RESOLVE_UNDO_WINDOW_MS) : null,
    } satisfies BulkResolveExceptionsResponse,
  };

  const expiresAt = plusMs(now, 7 * RECEIPT_TTL_MS);
  writes.push(
    receiptInsert(db, {
      actorUserId,
      operation: BULK_RESOLVE_OPERATION,
      keyHash: await sha256Hex(input.idempotencyKey),
      fingerprint: input.fingerprint,
      body,
      createdAt: now,
      expiresAt,
    }),
  );
  if (bulkId) {
    const state: UndoState = {
      bulkId,
      relationshipId,
      resolvedAt: now,
      items: stateItems,
    };
    writes.push(
      receiptInsert(db, {
        actorUserId,
        operation: BULK_UNDO_STATE_OPERATION,
        keyHash: await sha256Hex(bulkId),
        fingerprint: bulkId,
        body: state,
        createdAt: now,
        expiresAt: plusMs(now, RECEIPT_TTL_MS),
      }),
    );
  }

  await db.batch(writes as [Write, ...Write[]]);
  return { body, resolvedIds: toResolve.map((row) => row.id) };
}

async function findReceipt(
  db: Db,
  input: { actorUserId: string; operation: string; key: string; now: string },
): Promise<string | null> {
  const rows = await db
    .select({
      responseBody: idempotencyRecords.responseBody,
      expiresAt: idempotencyRecords.expiresAt,
    })
    .from(idempotencyRecords)
    .where(
      and(
        eq(idempotencyRecords.actorUserId, input.actorUserId),
        eq(idempotencyRecords.operation, input.operation),
        eq(idempotencyRecords.keyHash, await sha256Hex(input.key)),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row || row.expiresAt <= input.now) return null;
  return row.responseBody;
}

/** Undo state for this actor's bulk resolve, or null (unknown, someone else's, or gone). */
export async function loadUndoState(
  db: Db,
  input: { actorUserId: string; bulkId: string; now: string },
): Promise<{ state: UndoState; undone: boolean } | null> {
  const raw = await findReceipt(db, {
    actorUserId: input.actorUserId,
    operation: BULK_UNDO_STATE_OPERATION,
    key: input.bulkId,
    now: input.now,
  });
  if (!raw) return null;
  const state = JSON.parse(raw) as UndoState;
  const undone = await findReceipt(db, {
    actorUserId: input.actorUserId,
    operation: BULK_UNDONE_OPERATION,
    key: input.bulkId,
    now: input.now,
  });
  return { state, undone: undone !== null };
}

export function undoWindowOpen(resolvedAt: string, now: string): boolean {
  return Date.parse(now) - Date.parse(resolvedAt) <= BULK_RESOLVE_UNDO_WINDOW_MS;
}

/**
 * Restores each item's prior status and removes the rows the bulk wrote, in one
 * batch with the undo receipt (the undo action log) and the idempotency record.
 * Items whose row no longer carries this bulk's resolution are left alone.
 */
export async function performBulkUndo(
  db: Db,
  input: {
    actorUserId: string;
    state: UndoState;
    idempotencyKey: string;
    fingerprint: string;
    now: string;
  },
): Promise<{ body: { data: BulkUndoResponse }; restoredIds: string[] }> {
  const { state, now, actorUserId } = input;
  const current = await loadRelationshipExceptions(
    db,
    state.relationshipId,
    state.items.map((item) => item.id),
  );
  const currentById = new Map(current.map((row) => [row.id, row]));
  const restorable = state.items.filter((item) => {
    const row = currentById.get(item.id);
    return row?.status === "resolved" && row.resolvedAt === state.resolvedAt;
  });

  const writes: Write[] = [];
  for (const item of restorable) {
    writes.push(
      db
        .update(exceptions)
        .set({
          status: item.priorStatus,
          acknowledgedAt: item.priorAcknowledgedAt,
          resolvedAt: null,
          resolutionOutcome: null,
          resolutionNote: null,
          closedReason: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(exceptions.id, item.id),
            eq(exceptions.status, "resolved"),
            eq(exceptions.resolvedAt, state.resolvedAt),
          ),
        ),
      db.delete(exceptionActions).where(eq(exceptionActions.id, item.actionId)),
      db
        .delete(interventions)
        .where(inArray(interventions.id, item.interventionIds)),
    );
  }

  const body = {
    data: {
      bulkId: state.bulkId,
      relationshipId: state.relationshipId,
      restoredCount: restorable.length,
      items: restorable.map((item) => ({ id: item.id, status: item.priorStatus })),
    } satisfies BulkUndoResponse,
  };

  const undoneKeyHash = await sha256Hex(state.bulkId);
  const undoKeyHash = await sha256Hex(input.idempotencyKey);
  writes.push(
    receiptInsert(db, {
      actorUserId,
      operation: BULK_UNDONE_OPERATION,
      keyHash: undoneKeyHash,
      fingerprint: state.bulkId,
      body: { undoneAt: now, ...body.data },
      createdAt: now,
      expiresAt: plusMs(now, RECEIPT_TTL_MS),
    }),
    receiptInsert(db, {
      actorUserId,
      operation: BULK_UNDO_OPERATION,
      keyHash: undoKeyHash,
      fingerprint: input.fingerprint,
      body,
      createdAt: now,
      expiresAt: plusMs(now, 7 * RECEIPT_TTL_MS),
    }),
  );

  await db.batch(writes as [Write, ...Write[]]);
  return { body, restoredIds: restorable.map((item) => item.id) };
}
