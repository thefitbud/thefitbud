import {
  operation,
  limitParameter,
  exceptionStatusParameter,
} from "../openapi/document";
import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import {
  acknowledgeExceptionRequestSchema,
  attentionFeedResponseSchema,
  createInterventionRequestSchema,
  evaluateExceptionsResponseSchema,
  exceptionDetailSchema,
  exceptionListResponseSchema,
  exceptionSchema,
  interventionListResponseSchema,
  interventionSchema,
  resolveExceptionRequestSchema,
} from "@fitbud/contracts";
import {
  canAcknowledgeException,
  canResolveException,
} from "@fitbud/core";
import {
  evaluateRelationshipExceptions,
  listAttentionExceptionsForTrainer,
} from "../domain/exceptions";
import {
  mapException,
  mapExceptionAction,
  mapIntervention,
} from "../domain/mappers";
import { createDb } from "../db/client";
import {
  coachingRelationships,
  exceptionActions,
  exceptions,
  interventions,
  traineeProfiles,
} from "../db/schema";
import { addDaysIso, createId, nowIso, sha256Hex } from "../lib/crypto";
import { fail, ok } from "../lib/envelope";
import {
  findIdempotencyRecord,
  saveIdempotencyRecord,
} from "../lib/idempotency";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth";
import { queueRealtimeHint } from "../realtime/emit";
import type { ActorContext, Env, Variables } from "../types";
import { canAccessRelationship } from "./relationships";

const ACK_OPERATION = "exception.acknowledge";
const RESOLVE_OPERATION = "exception.resolve";
const INTERVENTION_OPERATION = "intervention.create";
const EVALUATE_OPERATION = "exception.evaluate";

export const exceptionRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

type Db = ReturnType<typeof createDb>;

async function loadAccessibleRelationship(
  db: Db,
  relationshipId: string,
  actor: ActorContext,
) {
  const rows = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.id, relationshipId))
    .limit(1);
  const row = rows[0];
  if (!row || !canAccessRelationship(actor, row)) return null;
  return row;
}

function requireIdempotencyKey(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  const key = c.req.header("Idempotency-Key")?.trim();
  return key && key.length > 0 ? key : null;
}

/** Trainer attention feed across owned relationships. */
exceptionRoutes.get(
  "/attention",
  operation({
    tag: "Exceptions",
    summary: "Exceptions operation for GET /exceptions/attention.",
    description: "Exceptions operation for GET /exceptions/attention.",
    roles: ["trainer"],
    parameters: [
      limitParameter({ defaultValue: 20, maximum: 1 }),
    ],
    response: attentionFeedResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const db = createDb(c.env.DB);
    const limitRaw = Number(c.req.query("limit") ?? "20");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.trunc(limitRaw), 1), 50)
      : 20;

    const now = nowIso();
    const attention = await listAttentionExceptionsForTrainer(
      db,
      actor.userId,
      limit,
      now,
    );

    const profileRows = await db.select().from(traineeProfiles);
    const nameByUserId = new Map(
      profileRows.map((row) => [row.userId, row.displayName]),
    );

    return ok(
      c,
      attentionFeedResponseSchema.parse({
        items: attention.map((item) => ({
          exception: mapException(item.exception),
          coachingRelationshipId: item.coachingRelationshipId,
          traineeUserId: item.traineeUserId,
          traineeDisplayName: nameByUserId.get(item.traineeUserId) ?? null,
        })),
        nextCursor: null,
      }),
    );
  },
);

exceptionRoutes.post(
  "/relationships/:relationshipId/evaluate",
  operation({
    tag: "Exceptions",
    summary: "Evaluates derived exceptions for a trainer-owned relationship",
    description: "Evaluates derived exceptions for a trainer-owned relationship. FitBud does not decide the coaching response.",
    roles: ["trainer"],
    idempotency: true,
    response: evaluateExceptionsResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const idempotencyKey = requireIdempotencyKey(c);
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
      JSON.stringify({ relationshipId: c.req.param("relationshipId") }),
    );
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: EVALUATE_OPERATION,
      idempotencyKey,
    });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        return fail(
          c,
          409,
          "IDEMPOTENCY_KEY_REUSE",
          "Idempotency key was reused with a different request.",
        );
      }
      return c.json(
        JSON.parse(existing.responseBody),
        existing.responseStatus as 200,
      );
    }

    const relationship = await loadAccessibleRelationship(
      db,
      c.req.param("relationshipId"),
      actor,
    );
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    const result = await evaluateRelationshipExceptions(
      db,
      relationship.id,
      nowIso(),
    );
    for (const item of result.exceptions) {
      queueRealtimeHint(c.env, {
        eventType: "exception_created",
        entityType: "exception",
        entityId: item.id,
        coachingRelationshipId: relationship.id,
        serverVersion: 0,
      });
    }
    for (const item of result.resolvedExceptions) {
      queueRealtimeHint(c.env, {
        eventType: "exception_resolved",
        entityType: "exception",
        entityId: item.id,
        coachingRelationshipId: relationship.id,
        serverVersion: 0,
      });
    }
    const responseBody = {
      data: evaluateExceptionsResponseSchema.parse(result),
    };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: EVALUATE_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return c.json(responseBody, 200);
  },
);

exceptionRoutes.get(
  "/relationships/:relationshipId",
  operation({
    tag: "Exceptions",
    summary: "Lists exceptions for a relationship",
    description: "Lists exceptions for a relationship. Omitting status returns detected and active exceptions.",
    roles: ["trainer"],
    parameters: [
      exceptionStatusParameter(),
    ],
    response: exceptionListResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const db = createDb(c.env.DB);
    const relationship = await loadAccessibleRelationship(
      db,
      c.req.param("relationshipId"),
      actor,
    );
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    await evaluateRelationshipExceptions(db, relationship.id, nowIso());

    const statusFilter = c.req.query("status");
    const rows = await db
      .select()
      .from(exceptions)
      .where(eq(exceptions.coachingRelationshipId, relationship.id))
      .orderBy(desc(exceptions.detectedAt), desc(exceptions.id));

    const items = rows
      .filter((row) => (statusFilter ? row.status === statusFilter : true))
      .filter((row) =>
        statusFilter
          ? true
          : row.status === "detected" || row.status === "active",
      )
      .map(mapException);

    return ok(
      c,
      exceptionListResponseSchema.parse({ items, nextCursor: null }),
    );
  },
);

exceptionRoutes.get(
  "/relationships/:relationshipId/interventions",
  operation({
    tag: "Exceptions",
    summary: "Exceptions operation for GET /exceptions/relationships/:relationshipId/interventions.",
    description: "Exceptions operation for GET /exceptions/relationships/:relationshipId/interventions.",
    roles: ["trainer"],
    response: interventionListResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const db = createDb(c.env.DB);
    const relationship = await loadAccessibleRelationship(
      db,
      c.req.param("relationshipId"),
      actor,
    );
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    const rows = await db
      .select()
      .from(interventions)
      .where(eq(interventions.coachingRelationshipId, relationship.id))
      .orderBy(desc(interventions.createdAt))
      .limit(50);

    return ok(
      c,
      interventionListResponseSchema.parse({
        items: rows.map(mapIntervention),
        nextCursor: null,
      }),
    );
  },
);

exceptionRoutes.post(
  "/relationships/:relationshipId/interventions",
  operation({
    tag: "Exceptions",
    summary: "Exceptions operation for POST /exceptions/relationships/:relationshipId/interventions.",
    description: "Exceptions operation for POST /exceptions/relationships/:relationshipId/interventions.",
    roles: ["trainer"],
    idempotency: true,
    body: createInterventionRequestSchema,
    response: interventionSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const parsed = createInterventionRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid intervention request.", {
        issues: parsed.error.issues,
      });
    }

    const idempotencyKey = requireIdempotencyKey(c);
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
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: INTERVENTION_OPERATION,
      idempotencyKey,
    });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        return fail(
          c,
          409,
          "IDEMPOTENCY_KEY_REUSE",
          "Idempotency key was reused with a different request.",
        );
      }
      return c.json(
        JSON.parse(existing.responseBody),
        existing.responseStatus as 200,
      );
    }

    const relationship = await loadAccessibleRelationship(
      db,
      c.req.param("relationshipId"),
      actor,
    );
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    if (parsed.data.exceptionId) {
      const linked = await db
        .select()
        .from(exceptions)
        .where(eq(exceptions.id, parsed.data.exceptionId))
        .limit(1);
      if (!linked[0] || linked[0].coachingRelationshipId !== relationship.id) {
        return fail(c, 404, "EXCEPTION_NOT_FOUND", "Exception not found.");
      }
    }

    const now = nowIso();
    const row = {
      id: createId(),
      coachingRelationshipId: relationship.id,
      trainerUserId: actor.userId,
      exceptionId: parsed.data.exceptionId ?? null,
      checkinId: parsed.data.checkinId ?? null,
      kind: parsed.data.kind,
      summary: parsed.data.summary,
      resultingPlanVersionId: parsed.data.resultingPlanVersionId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(interventions).values(row);

    const responseBody = {
      data: interventionSchema.parse(mapIntervention(row)),
    };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: INTERVENTION_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return c.json(responseBody, 200);
  },
);

exceptionRoutes.get(
  "/:exceptionId",
  operation({
    tag: "Exceptions",
    summary: "Exceptions operation for GET /exceptions/:exceptionId.",
    description: "Exceptions operation for GET /exceptions/:exceptionId.",
    roles: ["trainer"],
    response: exceptionDetailSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const db = createDb(c.env.DB);
    const rows = await db
      .select()
      .from(exceptions)
      .where(eq(exceptions.id, c.req.param("exceptionId")))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return fail(c, 404, "EXCEPTION_NOT_FOUND", "Exception not found.");
    }

    const relationship = await loadAccessibleRelationship(
      db,
      row.coachingRelationshipId,
      actor,
    );
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 404, "EXCEPTION_NOT_FOUND", "Exception not found.");
    }

    const actions = await db
      .select()
      .from(exceptionActions)
      .where(eq(exceptionActions.exceptionId, row.id))
      .orderBy(desc(exceptionActions.createdAt));

    return ok(
      c,
      exceptionDetailSchema.parse({
        ...mapException(row),
        actions: actions.map(mapExceptionAction),
      }),
    );
  },
);

exceptionRoutes.post(
  "/:exceptionId/acknowledge",
  operation({
    tag: "Exceptions",
    summary: "Exceptions operation for POST /exceptions/:exceptionId/acknowledge.",
    description: "Exceptions operation for POST /exceptions/:exceptionId/acknowledge.",
    roles: ["trainer"],
    idempotency: true,
    body: acknowledgeExceptionRequestSchema,
    response: exceptionSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const parsed = acknowledgeExceptionRequestSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid acknowledge request.", {
        issues: parsed.error.issues,
      });
    }

    const idempotencyKey = requireIdempotencyKey(c);
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
      JSON.stringify({
        exceptionId: c.req.param("exceptionId"),
        ...parsed.data,
      }),
    );
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: ACK_OPERATION,
      idempotencyKey,
    });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        return fail(
          c,
          409,
          "IDEMPOTENCY_KEY_REUSE",
          "Idempotency key was reused with a different request.",
        );
      }
      return c.json(
        JSON.parse(existing.responseBody),
        existing.responseStatus as 200,
      );
    }

    const rows = await db
      .select()
      .from(exceptions)
      .where(eq(exceptions.id, c.req.param("exceptionId")))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return fail(c, 404, "EXCEPTION_NOT_FOUND", "Exception not found.");
    }

    const relationship = await loadAccessibleRelationship(
      db,
      row.coachingRelationshipId,
      actor,
    );
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 404, "EXCEPTION_NOT_FOUND", "Exception not found.");
    }

    if (!canAcknowledgeException(row.status)) {
      return fail(
        c,
        409,
        "INVALID_TRANSITION",
        "Exception cannot be acknowledged from its current status.",
      );
    }

    const now = nowIso();
    await db
      .update(exceptions)
      .set({
        status: "acknowledged",
        acknowledgedAt: now,
        updatedAt: now,
      })
      .where(eq(exceptions.id, row.id));

    await db.insert(exceptionActions).values({
      id: createId(),
      exceptionId: row.id,
      trainerUserId: actor.userId,
      action: "acknowledge",
      note: parsed.data.note ?? null,
      createdAt: now,
    });

    await db.insert(interventions).values({
      id: createId(),
      coachingRelationshipId: relationship.id,
      trainerUserId: actor.userId,
      exceptionId: row.id,
      checkinId: null,
      kind: "acknowledge",
      summary: parsed.data.note?.trim() || `Acknowledged: ${row.summary}`,
      resultingPlanVersionId: null,
      createdAt: now,
      updatedAt: now,
    });

    const updated = {
      ...row,
      status: "acknowledged" as const,
      acknowledgedAt: now,
      updatedAt: now,
    };
    const responseBody = {
      data: exceptionSchema.parse(mapException(updated)),
    };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: ACK_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    queueRealtimeHint(c.env, {
      eventType: "exception_acknowledged",
      entityType: "exception",
      entityId: updated.id,
      coachingRelationshipId: relationship.id,
      serverVersion: 0,
    });
    return c.json(responseBody, 200);
  },
);

exceptionRoutes.post(
  "/:exceptionId/resolve",
  operation({
    tag: "Exceptions",
    summary: "Exceptions operation for POST /exceptions/:exceptionId/resolve.",
    description: "Exceptions operation for POST /exceptions/:exceptionId/resolve.",
    roles: ["trainer"],
    idempotency: true,
    body: resolveExceptionRequestSchema,
    response: exceptionSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const parsed = resolveExceptionRequestSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid resolve request.", {
        issues: parsed.error.issues,
      });
    }

    const idempotencyKey = requireIdempotencyKey(c);
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
      JSON.stringify({
        exceptionId: c.req.param("exceptionId"),
        ...parsed.data,
      }),
    );
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: RESOLVE_OPERATION,
      idempotencyKey,
    });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        return fail(
          c,
          409,
          "IDEMPOTENCY_KEY_REUSE",
          "Idempotency key was reused with a different request.",
        );
      }
      return c.json(
        JSON.parse(existing.responseBody),
        existing.responseStatus as 200,
      );
    }

    const rows = await db
      .select()
      .from(exceptions)
      .where(eq(exceptions.id, c.req.param("exceptionId")))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return fail(c, 404, "EXCEPTION_NOT_FOUND", "Exception not found.");
    }

    const relationship = await loadAccessibleRelationship(
      db,
      row.coachingRelationshipId,
      actor,
    );
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 404, "EXCEPTION_NOT_FOUND", "Exception not found.");
    }

    if (!canResolveException(row.status)) {
      return fail(
        c,
        409,
        "INVALID_TRANSITION",
        "Exception must be acknowledged before it can be resolved.",
      );
    }

    const now = nowIso();
    await db
      .update(exceptions)
      .set({
        status: "resolved",
        resolvedAt: now,
        updatedAt: now,
      })
      .where(eq(exceptions.id, row.id));

    await db.insert(exceptionActions).values({
      id: createId(),
      exceptionId: row.id,
      trainerUserId: actor.userId,
      action: "resolve",
      note: parsed.data.note ?? null,
      createdAt: now,
    });

    const kind = parsed.data.interventionKind ?? "resolve";
    await db.insert(interventions).values({
      id: createId(),
      coachingRelationshipId: relationship.id,
      trainerUserId: actor.userId,
      exceptionId: row.id,
      checkinId: null,
      kind,
      summary: parsed.data.note?.trim() || `Resolved: ${row.summary}`,
      resultingPlanVersionId: parsed.data.resultingPlanVersionId ?? null,
      createdAt: now,
      updatedAt: now,
    });

    const updated = {
      ...row,
      status: "resolved" as const,
      resolvedAt: now,
      updatedAt: now,
    };
    const responseBody = {
      data: exceptionSchema.parse(mapException(updated)),
    };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: RESOLVE_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    queueRealtimeHint(c.env, {
      eventType: "exception_resolved",
      entityType: "exception",
      entityId: updated.id,
      coachingRelationshipId: relationship.id,
      serverVersion: 0,
    });
    return c.json(responseBody, 200);
  },
);
