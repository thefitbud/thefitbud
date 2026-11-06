import { and, eq, exists, inArray, isNull, sql } from "drizzle-orm";
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
import { isOpenExceptionStatus, restoredStatusAfterUndo } from "@fitbud/core";
import type { Db } from "../db/client";
import {
  exceptionActions,
  exceptions,
  idempotencyRecords,
  interventions,
} from "../db/schema";
import { createId, sha256Hex } from "../lib/crypto";

/**
 * Z6-10 (SPB, D11 locked; D-W6-15): bulk Resolve for one client's compatible
 * exceptions.
 *
 * Each resolved item gets the same writes as `POST /exceptions/:id/resolve`:
 * the exception row moves to resolved with the outcome and note, one `resolve`
 * exception action, one `resolve` intervention and, when a note is entered, one
 * `note` intervention. An open item that was not yet reviewed is reviewed and
 * resolved in the same step (as the trainer web drawer does for a single
 * Resolve), and then also gets the `acknowledge` action and intervention that
 * Mark reviewed writes, so history never shows a review time without a review
 * action (D-W6-15). The API never resolves anything the trainer did not select.
 *
 * Race safety: the exception update only applies to a still-open row, and every
 * insert for an item runs only if that item's row now carries this bulk's
 * resolution (status resolved, resolved_at and updated_at equal to this bulk's
 * time). If another resolve committed between the read and the batch, the item
 * gets no rows, is reported `already_resolved`, and is left out of the undo
 * receipt.
 *
 * Undo state lives in D1 as a server-held receipt in `idempotency_records`
 * (actor-scoped, keyed by the bulk id; D-W6-15), so no new table is needed: it
 * records every item's prior status and review time and the ids of the rows
 * the bulk wrote, which undo deletes. A second receipt keyed by the same bulk
 * id records the undo itself (actor, time, restored items) and makes a second
 * undo impossible.
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
  /** Exception actions this bulk wrote for the item (resolve, and acknowledge if it reviewed). */
  actionIds: string[];
  /** Interventions this bulk wrote for the item (resolve, note, acknowledge). */
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

function receiptBodyUpdate(
  db: Db,
  input: { actorUserId: string; operation: string; keyHash: string; body: unknown },
): Write {
  return db
    .update(idempotencyRecords)
    .set({ responseBody: JSON.stringify(input.body) })
    .where(
      and(
        eq(idempotencyRecords.actorUserId, input.actorUserId),
        eq(idempotencyRecords.operation, input.operation),
        eq(idempotencyRecords.keyHash, input.keyHash),
      ),
    );
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

/** True when the row carries this bulk's resolution. */
function resolvedByThisBulk(row: ExceptionRow | undefined, now: string): boolean {
  return (
    row?.status === "resolved" &&
    row.resolvedAt === now &&
    row.updatedAt === now &&
    row.closedReason === "trainer"
  );
}

/**
 * SQL guard for the same check: the item's row carries this bulk's resolution
 * (and, for the review rows, this bulk's review time).
 */
function resolvedHereWhere(exceptionId: string, now: string, reviewedHere = false) {
  return and(
    eq(exceptions.id, exceptionId),
    eq(exceptions.status, "resolved"),
    eq(exceptions.resolvedAt, now),
    eq(exceptions.updatedAt, now),
    eq(exceptions.closedReason, "trainer"),
    reviewedHere ? eq(exceptions.acknowledgedAt, now) : undefined,
  );
}

const constant = <T>(value: T, alias: string) => sql<T>`${value}`.as(alias);

/**
 * INSERT … SELECT from the exception row itself: the insert writes one row
 * when the guard holds and none otherwise, inside the same batch.
 */
function guardedAction(
  db: Db,
  input: {
    id: string;
    exceptionId: string;
    trainerUserId: string;
    action: "acknowledge" | "resolve";
    note: string | null;
    now: string;
    reviewedHere?: boolean;
  },
): Write {
  return db.insert(exceptionActions).select(
    db
      .select({
        id: constant(input.id, "id"),
        exceptionId: exceptions.id,
        trainerUserId: constant(input.trainerUserId, "trainer_user_id"),
        action: constant(input.action, "action"),
        note: constant(input.note, "note"),
        createdAt: constant(input.now, "created_at"),
      })
      .from(exceptions)
      .where(resolvedHereWhere(input.exceptionId, input.now, input.reviewedHere)),
  );
}

function guardedIntervention(
  db: Db,
  input: {
    id: string;
    relationshipId: string;
    trainerUserId: string;
    exceptionId: string;
    kind: "acknowledge" | "resolve" | "note";
    summary: string;
    now: string;
    reviewedHere?: boolean;
  },
): Write {
  return db.insert(interventions).select(
    db
      .select({
        id: constant(input.id, "id"),
        coachingRelationshipId: constant(input.relationshipId, "coaching_relationship_id"),
        trainerUserId: constant(input.trainerUserId, "trainer_user_id"),
        exceptionId: exceptions.id,
        checkinId: constant<string | null>(null, "checkin_id"),
        kind: constant(input.kind, "kind"),
        summary: constant(input.summary, "summary"),
        resultingPlanVersionId: constant<string | null>(null, "resulting_plan_version_id"),
        createdAt: constant(input.now, "created_at"),
        updatedAt: constant(input.now, "updated_at"),
      })
      .from(exceptions)
      .where(resolvedHereWhere(input.exceptionId, input.now, input.reviewedHere)),
  );
}

type PlannedItem = {
  row: ExceptionRow;
  resolveActionId: string;
  resolveInterventionId: string;
  noteInterventionId: string | null;
  /** Present when the item was not reviewed at read time. */
  review: { actionId: string; interventionId: string } | null;
};

function responseFor(
  input: {
    relationshipId: string;
    classification: BulkClassification[];
    resolvedIds: ReadonlySet<string>;
    bulkId: string | null;
    now: string;
  },
): { data: BulkResolveExceptionsResponse } {
  const items: BulkResolveItemResult[] = input.classification.map((item) => {
    if (item.status === "skip") {
      return { id: item.id, status: "skipped", reason: item.reason };
    }
    return input.resolvedIds.has(item.id)
      ? { id: item.id, status: "resolved" }
      : { id: item.id, status: "skipped", reason: "already_resolved" };
  });
  const resolvedCount = items.filter((item) => item.status === "resolved").length;
  const bulkId = resolvedCount > 0 ? input.bulkId : null;
  return {
    data: {
      bulkId,
      relationshipId: input.relationshipId,
      resolvedCount,
      skippedCount: items.length - resolvedCount,
      items,
      resolvedAt: bulkId ? input.now : null,
      undoExpiresAt: bulkId ? plusMs(input.now, BULK_RESOLVE_UNDO_WINDOW_MS) : null,
    },
  };
}

function undoItemFor(plan: PlannedItem, reviewedHere: boolean, row: ExceptionRow): UndoStateItem {
  const actionIds = [plan.resolveActionId];
  const interventionIds = [plan.resolveInterventionId];
  if (plan.noteInterventionId) interventionIds.push(plan.noteInterventionId);
  if (reviewedHere && plan.review) {
    actionIds.push(plan.review.actionId);
    interventionIds.push(plan.review.interventionId);
  }
  return {
    id: row.id,
    // Reviewed here: back to active/detected exactly as Undo of Mark reviewed does.
    priorStatus: reviewedHere
      ? restoredStatusAfterUndo({ activatedAt: row.activatedAt })
      : "acknowledged",
    priorAcknowledgedAt: reviewedHere ? null : row.acknowledgedAt,
    actionIds,
    interventionIds,
  };
}

/**
 * Resolves the compatible items in one D1 batch (one transaction) together with
 * the idempotency record and the undo receipt, then re-reads the rows: if
 * another request changed an item first, the response and the undo receipt are
 * corrected to what actually happened. Returns the response body.
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
  const plans: PlannedItem[] = input.classification.flatMap((item) =>
    item.status === "resolve"
      ? [
          {
            row: item.row,
            resolveActionId: createId(),
            resolveInterventionId: createId(),
            noteInterventionId: noteText ? createId() : null,
            review: item.row.acknowledgedAt
              ? null
              : { actionId: createId(), interventionId: createId() },
          },
        ]
      : [],
  );
  const bulkId = plans.length > 0 ? createId() : null;

  const writes: Write[] = [];
  for (const plan of plans) {
    const { row } = plan;
    writes.push(
      db
        .update(exceptions)
        .set({
          status: "resolved",
          // Keep a review time another request may have set since the read.
          acknowledgedAt: sql`coalesce(${exceptions.acknowledgedAt}, ${now})`,
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
    );
    if (plan.review) {
      // The same rows Mark reviewed writes, only if this bulk set the review time.
      writes.push(
        guardedAction(db, {
          id: plan.review.actionId,
          exceptionId: row.id,
          trainerUserId: actorUserId,
          action: "acknowledge",
          note: null,
          now,
          reviewedHere: true,
        }),
        guardedIntervention(db, {
          id: plan.review.interventionId,
          relationshipId,
          trainerUserId: actorUserId,
          exceptionId: row.id,
          kind: "acknowledge",
          summary: `Acknowledged: ${row.summary}`,
          now,
          reviewedHere: true,
        }),
      );
    }
    writes.push(
      guardedAction(db, {
        id: plan.resolveActionId,
        exceptionId: row.id,
        trainerUserId: actorUserId,
        action: "resolve",
        note: noteText,
        now,
      }),
      guardedIntervention(db, {
        id: plan.resolveInterventionId,
        relationshipId,
        trainerUserId: actorUserId,
        exceptionId: row.id,
        kind: "resolve",
        summary: `Resolved (${outcome}): ${row.summary}`,
        now,
      }),
    );
    if (plan.noteInterventionId && noteText) {
      writes.push(
        guardedIntervention(db, {
          id: plan.noteInterventionId,
          relationshipId,
          trainerUserId: actorUserId,
          exceptionId: row.id,
          kind: "note",
          summary: noteText,
          now,
        }),
      );
    }
  }

  // Optimistic result: every planned item resolves as read.
  const optimisticBody = responseFor({
    relationshipId,
    classification: input.classification,
    resolvedIds: new Set(plans.map((plan) => plan.row.id)),
    bulkId,
    now,
  });
  const optimisticState: UndoState | null = bulkId
    ? {
        bulkId,
        relationshipId,
        resolvedAt: now,
        items: plans.map((plan) => undoItemFor(plan, plan.review !== null, plan.row)),
      }
    : null;

  const responseKeyHash = await sha256Hex(input.idempotencyKey);
  const stateKeyHash = bulkId ? await sha256Hex(bulkId) : null;
  writes.push(
    receiptInsert(db, {
      actorUserId,
      operation: BULK_RESOLVE_OPERATION,
      keyHash: responseKeyHash,
      fingerprint: input.fingerprint,
      body: optimisticBody,
      createdAt: now,
      expiresAt: plusMs(now, 7 * RECEIPT_TTL_MS),
    }),
  );
  if (bulkId && stateKeyHash && optimisticState) {
    writes.push(
      receiptInsert(db, {
        actorUserId,
        operation: BULK_UNDO_STATE_OPERATION,
        keyHash: stateKeyHash,
        fingerprint: bulkId,
        body: optimisticState,
        createdAt: now,
        expiresAt: plusMs(now, RECEIPT_TTL_MS),
      }),
    );
  }

  await db.batch(writes as [Write, ...Write[]]);

  if (!bulkId || !stateKeyHash) {
    return { body: optimisticBody, resolvedIds: [] };
  }

  // What actually happened, from the committed rows.
  const after = await loadRelationshipExceptions(
    db,
    relationshipId,
    plans.map((plan) => plan.row.id),
  );
  const afterById = new Map(after.map((row) => [row.id, row]));
  const applied = plans.filter((plan) => resolvedByThisBulk(afterById.get(plan.row.id), now));
  const state: UndoState = {
    bulkId,
    relationshipId,
    resolvedAt: now,
    items: applied.map((plan) => {
      const row = afterById.get(plan.row.id)!;
      return undoItemFor(plan, plan.review !== null && row.acknowledgedAt === now, row);
    }),
  };
  const body = responseFor({
    relationshipId,
    classification: input.classification,
    resolvedIds: new Set(applied.map((plan) => plan.row.id)),
    bulkId,
    now,
  });

  const corrections: Write[] = [];
  if (JSON.stringify(body) !== JSON.stringify(optimisticBody)) {
    corrections.push(
      receiptBodyUpdate(db, {
        actorUserId,
        operation: BULK_RESOLVE_OPERATION,
        keyHash: responseKeyHash,
        body,
      }),
    );
  }
  if (applied.length === 0) {
    corrections.push(
      db
        .delete(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.actorUserId, actorUserId),
            eq(idempotencyRecords.operation, BULK_UNDO_STATE_OPERATION),
            eq(idempotencyRecords.keyHash, stateKeyHash),
          ),
        ),
    );
  } else if (JSON.stringify(state) !== JSON.stringify(optimisticState)) {
    corrections.push(
      receiptBodyUpdate(db, {
        actorUserId,
        operation: BULK_UNDO_STATE_OPERATION,
        keyHash: stateKeyHash,
        body: state,
      }),
    );
  }
  if (corrections.length > 0) {
    await db.batch(corrections as [Write, ...Write[]]);
  }
  return { body, resolvedIds: applied.map((plan) => plan.row.id) };
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

/** SQL guard: the item's exception row was just restored by this undo. */
function restoredHere(db: Db, item: UndoStateItem, now: string) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(exceptions)
      .where(
        and(
          eq(exceptions.id, item.id),
          eq(exceptions.status, item.priorStatus),
          isNull(exceptions.resolvedAt),
          eq(exceptions.updatedAt, now),
        ),
      ),
  );
}

/**
 * Restores each item's prior status and review time and removes the rows the
 * bulk wrote, in one batch with the undo receipt (the undo action log) and the
 * idempotency record. Items whose row no longer carries this bulk's resolution
 * are left alone, and their rows are kept.
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
      db
        .delete(exceptionActions)
        .where(
          and(
            eq(exceptionActions.exceptionId, item.id),
            inArray(exceptionActions.id, item.actionIds),
            restoredHere(db, item, now),
          ),
        ),
      db
        .delete(interventions)
        .where(
          and(
            eq(interventions.exceptionId, item.id),
            inArray(interventions.id, item.interventionIds),
            restoredHere(db, item, now),
          ),
        ),
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
