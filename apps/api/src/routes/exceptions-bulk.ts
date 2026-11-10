import { Hono, type Context } from "hono";
import { eq } from "drizzle-orm";
import {
  bulkResolveExceptionsRequestSchema,
  bulkResolveExceptionsResponseSchema,
  bulkUndoRequestSchema,
  bulkUndoResponseSchema,
} from "@fitbud/contracts";
import { operation } from "../openapi/document";
import { createDb, type Db } from "../db/client";
import { coachingRelationships } from "../db/schema";
import { nowIso, sha256Hex } from "../lib/crypto";
import { fail } from "../lib/envelope";
import { requireWritableRelationship } from "../lib/relationship-write-guard";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth";
import { queueRealtimeHint } from "../realtime/emit";
import {
  BULK_RESOLVE_OPERATION,
  BULK_UNDO_OPERATION,
  classifyBulkResolve,
  findBulkIdempotencyRecord,
  loadRelationshipExceptions,
  loadUndoState,
  performBulkResolve,
  performBulkUndo,
  undoWindowOpen,
  type BulkIdempotencyLookup,
} from "../domain/exception-bulk";
import type { Env, Variables } from "../types";

/**
 * Z6-10 (SPB, D11 locked): bulk Resolve for one client's compatible exceptions
 * (missed workout, missed meal, missed log) with a 5 s undo. Only the owning
 * trainer can call it; ended relationships are read-only. Mark reviewed stays
 * the existing per-client call.
 */
export const exceptionsBulkRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

function idempotencyKeyOf(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  const key = c.req.header("Idempotency-Key")?.trim();
  return key && key.length > 0 ? key : null;
}

/** Replays a stored response, or rejects a reused or expired key. */
async function replay(
  db: Db,
  input: {
    actorUserId: string;
    operation: string;
    idempotencyKey: string;
    fingerprint: string;
  },
): Promise<BulkIdempotencyLookup> {
  return findBulkIdempotencyRecord(db, { ...input, now: nowIso() });
}

/** The answer for a lookup that must not run the request again, or null. */
function answerFor(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  lookup: BulkIdempotencyLookup,
): Response | null {
  switch (lookup.kind) {
    case "replay":
      return c.json(lookup.body as object, lookup.status as 200);
    case "reuse":
      return fail(
        c,
        409,
        "IDEMPOTENCY_KEY_REUSE",
        "Idempotency key was reused with a different request.",
      );
    case "expired":
      return fail(
        c,
        409,
        "IDEMPOTENCY_KEY_EXPIRED",
        "Idempotency key has expired. Send the request with a new key.",
      );
    case "none":
      return null;
  }
}

exceptionsBulkRoutes.post(
  "/resolve",
  operation({
    tag: "Exceptions",
    summary: "Resolves several of one client's compatible exceptions at once.",
    description:
      "Resolves the selected missed-workout, missed-meal and missed-log exceptions of one client with one outcome and note. Returns one result per id: resolved, or skipped with a reason (not_found, incompatible_type, already_resolved). Other exception types, other clients' ids and ids that are not exceptions are never changed. An ended relationship rejects the whole call. Undo is possible for 5 seconds with POST /exceptions/bulk/undo. The same Idempotency-Key replays the first response for 7 days; after that it answers 409 IDEMPOTENCY_KEY_EXPIRED.",
    roles: ["trainer"],
    idempotency: true,
    body: bulkResolveExceptionsRequestSchema,
    response: bulkResolveExceptionsResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const parsed = bulkResolveExceptionsRequestSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid bulk resolve request.", {
        issues: parsed.error.issues,
      });
    }

    const idempotencyKey = idempotencyKeyOf(c);
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required.",
      );
    }

    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(JSON.stringify(parsed.data));
    const lookup = {
      actorUserId: actor.userId,
      operation: BULK_RESOLVE_OPERATION,
      idempotencyKey,
      fingerprint,
    };
    const prior = answerFor(c, await replay(db, lookup));
    if (prior) return prior;

    const [relationship] = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, parsed.data.relationshipId))
      .limit(1);
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(
        c,
        404,
        "RELATIONSHIP_NOT_FOUND",
        "Coaching relationship not found.",
      );
    }

    // Rule 5 (EC1): an ended relationship is read-only for the whole call.
    const writable = await requireWritableRelationship(c, db, relationship.id);
    if (!writable.ok) return writable.response;

    const rows = await loadRelationshipExceptions(
      db,
      relationship.id,
      parsed.data.exceptionIds,
    );
    const classification = classifyBulkResolve(
      parsed.data.exceptionIds,
      rows,
      relationship.id,
    );

    let result: Awaited<ReturnType<typeof performBulkResolve>>;
    try {
      result = await performBulkResolve(db, {
        actorUserId: actor.userId,
        relationshipId: relationship.id,
        request: parsed.data,
        classification,
        idempotencyKey,
        fingerprint,
        now: nowIso(),
      });
    } catch (error) {
      // A concurrent request with the same key won the unique index and the
      // whole batch rolled back: answer with its stored result.
      const raced = answerFor(c, await replay(db, lookup));
      if (raced) return raced;
      throw error;
    }

    for (const id of result.resolvedIds) {
      queueRealtimeHint(c.env, {
        eventType: "exception_resolved",
        entityType: "exception",
        entityId: id,
        coachingRelationshipId: relationship.id,
        serverVersion: 0,
      });
    }
    return c.json(result.body, 200);
  },
);

exceptionsBulkRoutes.post(
  "/undo",
  operation({
    tag: "Exceptions",
    summary: "Undoes a bulk resolve within 5 seconds.",
    description:
      "Within 5 seconds of POST /exceptions/bulk/resolve, restores each resolved item's prior status and removes the resolution rows that call wrote. After 5 seconds the call answers 409 undo_expired. Only the trainer who ran the bulk resolve can undo it. The same Idempotency-Key replays the first response for 7 days; after that it answers 409 IDEMPOTENCY_KEY_EXPIRED.",
    roles: ["trainer"],
    idempotency: true,
    body: bulkUndoRequestSchema,
    response: bulkUndoResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const parsed = bulkUndoRequestSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid undo request.", {
        issues: parsed.error.issues,
      });
    }

    const idempotencyKey = idempotencyKeyOf(c);
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required.",
      );
    }

    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(
      JSON.stringify({ bulkId: parsed.data.bulkId }),
    );
    const lookup = {
      actorUserId: actor.userId,
      operation: BULK_UNDO_OPERATION,
      idempotencyKey,
      fingerprint,
    };
    const prior = answerFor(c, await replay(db, lookup));
    if (prior) return prior;

    const now = nowIso();
    // Actor-scoped: another trainer's bulk id reads as not found.
    const loaded = await loadUndoState(db, {
      actorUserId: actor.userId,
      bulkId: parsed.data.bulkId,
      now,
    });
    if (!loaded) {
      return fail(c, 404, "BULK_NOT_FOUND", "Bulk action not found.");
    }
    if (loaded.undone) {
      return fail(
        c,
        409,
        "BULK_ALREADY_UNDONE",
        "Bulk action was already undone.",
      );
    }
    if (!undoWindowOpen(loaded.state.resolvedAt, now)) {
      return fail(c, 409, "undo_expired", "Undo window has passed.");
    }

    const [relationship] = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, loaded.state.relationshipId))
      .limit(1);
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 404, "BULK_NOT_FOUND", "Bulk action not found.");
    }
    const writable = await requireWritableRelationship(c, db, relationship.id);
    if (!writable.ok) return writable.response;

    let result: Awaited<ReturnType<typeof performBulkUndo>>;
    try {
      result = await performBulkUndo(db, {
        actorUserId: actor.userId,
        state: loaded.state,
        idempotencyKey,
        fingerprint,
        now,
      });
    } catch (error) {
      const raced = answerFor(c, await replay(db, lookup));
      if (raced) return raced;
      const again = await loadUndoState(db, {
        actorUserId: actor.userId,
        bulkId: parsed.data.bulkId,
        now,
      });
      if (again?.undone) {
        return fail(
          c,
          409,
          "BULK_ALREADY_UNDONE",
          "Bulk action was already undone.",
        );
      }
      throw error;
    }

    for (const id of result.restoredIds) {
      queueRealtimeHint(c.env, {
        eventType: "exception_changed",
        entityType: "exception",
        entityId: id,
        coachingRelationshipId: relationship.id,
        serverVersion: 0,
      });
    }
    return c.json(result.body, 200);
  },
);

// Any other path under /exceptions/bulk stays a static 404.
exceptionsBulkRoutes.all("*", (c) =>
  fail(c, 404, "not_implemented", "This endpoint is not available yet."),
);
