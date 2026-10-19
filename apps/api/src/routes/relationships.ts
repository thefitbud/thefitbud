import {
  operation,
  cursorParameter,
  limitParameter,
} from "../openapi/document";
import { and, desc, eq, gt, lt, or } from "drizzle-orm";
import { Hono } from "hono";
import {
  coachingRelationshipSchema,
  endRelationshipRequestSchema,
  reactivateRelationshipRequestSchema,
  relationshipListResponseSchema,
} from "@fitbud/contracts";
import { createDb } from "../db/client";
import { coachingRelationships } from "../db/schema";
import { deriveOnboardingStatusForRelationships } from "../domain/client-status";
import { mapRelationship } from "../domain/mappers";
import {
  cancelRelationshipReactivation,
  confirmRelationshipReactivation,
  endCoachingRelationship,
  requestRelationshipReactivation,
} from "../domain/relationship-lifecycle";
import { storeInboxNotification } from "../domain/inbox-notify.js";
import { reactivationRequests } from "../db/schema";
import { buildPage, decodeCursor } from "../lib/cursor";
import { fail, ok } from "../lib/envelope";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth";
import type { ActorContext, Env, Variables } from "../types";

export const relationshipRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

function canAccessRelationship(
  actor: ActorContext,
  row: typeof coachingRelationships.$inferSelect,
): boolean {
  if (actor.selectedRole === "trainer" && row.trainerUserId === actor.userId) {
    return true;
  }
  if (actor.selectedRole === "trainee" && row.traineeUserId === actor.userId) {
    return true;
  }
  return false;
}

relationshipRoutes.get(
  "/",
  operation({
    tag: "Relationships",
    summary: "Relationships operation for GET /relationships.",
    description: "Relationships operation for GET /relationships.",
    roles: ["trainer", "trainee"],
    parameters: [
      limitParameter({ defaultValue: 20, maximum: 1 }),
      cursorParameter(),
    ],
    response: relationshipListResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const limitRaw = Number(c.req.query("limit") ?? "20");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.trunc(limitRaw), 1), 50)
      : 20;
    const cursor = c.req.query("cursor");
    const decoded = cursor ? decodeCursor(cursor) : null;
    if (cursor && !decoded) {
      return fail(c, 400, "INVALID_CURSOR", "Cursor is invalid.");
    }

    const ownership =
      actor.selectedRole === "trainer"
        ? eq(coachingRelationships.trainerUserId, actor.userId)
        : eq(coachingRelationships.traineeUserId, actor.userId);

    const conditions = [ownership];
    if (decoded) {
      conditions.push(
        or(
          lt(coachingRelationships.createdAt, decoded.k),
          and(
            eq(coachingRelationships.createdAt, decoded.k),
            lt(coachingRelationships.id, decoded.id),
          ),
        )!,
      );
    }

    const db = createDb(c.env.DB);
    const rows = await db
      .select()
      .from(coachingRelationships)
      .where(and(...conditions))
      .orderBy(
        desc(coachingRelationships.createdAt),
        desc(coachingRelationships.id),
      )
      .limit(limit + 1);

    const page = buildPage(rows, limit, (item) => item.createdAt);
    const statuses = await deriveOnboardingStatusForRelationships(db, page.items);
    return ok(
      c,
      relationshipListResponseSchema.parse({
        items: page.items.map((row) =>
          mapRelationship(row, statuses.get(row.id) ?? "onboarding_pending"),
        ),
        nextCursor: page.nextCursor,
      }),
    );
  },
);

relationshipRoutes.get(
  "/:relationshipId",
  operation({
    tag: "Relationships",
    summary: "Relationships operation for GET /relationships/:relationshipId.",
    description: "Relationships operation for GET /relationships/:relationshipId.",
    roles: ["trainer", "trainee"],
    response: coachingRelationshipSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const relationshipId = c.req.param("relationshipId");
    const db = createDb(c.env.DB);
    const rows = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, relationshipId))
      .limit(1);
    const row = rows[0];
    if (!row || !canAccessRelationship(actor, row)) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Coaching relationship not found.");
    }

    const statuses = await deriveOnboardingStatusForRelationships(db, [row]);
    const base = mapRelationship(row, statuses.get(row.id) ?? "onboarding_pending");
    let pendingReactivation: {
      requestId: string;
      expiresAt: string;
      intakeUpdateRequested: boolean;
    } | null = null;
    if (row.status === "ended") {
      const now = new Date().toISOString();
      const [pending] = await db
        .select()
        .from(reactivationRequests)
        .where(
          and(
            eq(reactivationRequests.relationshipId, relationshipId),
            eq(reactivationRequests.status, "pending"),
            gt(reactivationRequests.expiresAt, now),
          ),
        )
        .limit(1);
      if (pending) {
        pendingReactivation = {
          requestId: pending.id,
          expiresAt: pending.expiresAt,
          intakeUpdateRequested: pending.intakeUpdateRequested,
        };
      }
    }
    return ok(
      c,
      coachingRelationshipSchema.parse({
        ...base,
        pendingReactivation,
      }),
    );
  },
);

relationshipRoutes.post(
  "/:relationshipId/end",
  operation({
    tag: "Relationships",
    summary: "End coaching relationship",
    description: "Trainer ends an active coaching relationship.",
    roles: ["trainer"],
    body: endRelationshipRequestSchema,
    response: coachingRelationshipSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const body = await c.req.json().catch(() => null);
    const parsed = endRelationshipRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid end request.");
    }
    const relationshipId = c.req.param("relationshipId");
    const db = createDb(c.env.DB);
    const [row] = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, relationshipId))
      .limit(1);
    if (!row || row.trainerUserId !== actor.userId) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Coaching relationship not found.");
    }
    if (row.status === "ended") {
      return fail(c, 409, "RELATIONSHIP_ALREADY_ENDED", "Relationship is already ended.");
    }
    await endCoachingRelationship(db, {
      relationshipId,
      endedByUserId: actor.userId,
      reason: parsed.data.reason,
    });
    await storeInboxNotification(db, {
      recipientUserId: row.traineeUserId,
      relationshipId,
      notificationType: "relationship_ended",
      domainEntityId: relationshipId,
      dedupeKey: `relationship-ended:${relationshipId}`,
    });
    const [updated] = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, relationshipId))
      .limit(1);
    const statuses = await deriveOnboardingStatusForRelationships(db, [updated!]);
    return ok(
      c,
      coachingRelationshipSchema.parse(
        mapRelationship(updated!, statuses.get(updated!.id) ?? "ended"),
      ),
    );
  },
);

relationshipRoutes.post(
  "/:relationshipId/reactivate",
  operation({
    tag: "Relationships",
    summary: "Request relationship reactivation",
    description: "Creates a pending reactivation request for an ended relationship.",
    roles: ["trainer"],
    body: reactivateRelationshipRequestSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const relationshipId = c.req.param("relationshipId");
    const body = await c.req.json().catch(() => null);
    const parsed = reactivateRelationshipRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid reactivation request.");
    }
    const db = createDb(c.env.DB);
    const [row] = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, relationshipId))
      .limit(1);
    if (!row || row.trainerUserId !== actor.userId || row.status !== "ended") {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Coaching relationship not found.");
    }
    const pending = await db
      .select()
      .from(reactivationRequests)
      .where(
        and(
          eq(reactivationRequests.relationshipId, relationshipId),
          eq(reactivationRequests.status, "pending"),
        ),
      )
      .limit(1);
    if (pending[0]) {
      return fail(c, 409, "REACTIVATION_PENDING", "A reactivation request is already pending.");
    }
    const requestId = await requestRelationshipReactivation(db, {
      relationshipId,
      trainerUserId: actor.userId,
      intakeUpdateRequested: parsed.data.intakeUpdateRequested,
    });
    await storeInboxNotification(db, {
      recipientUserId: row.traineeUserId,
      relationshipId,
      notificationType: "reactivation_requested",
      domainEntityId: requestId,
      dedupeKey: `reactivation-request:${requestId}`,
    });
    return ok(c, { requestId, status: "pending" as const });
  },
);

relationshipRoutes.post(
  "/:relationshipId/reactivate/confirm",
  operation({
    tag: "Relationships",
    summary: "Confirm relationship reactivation",
    description: "Trainee confirms reactivation on the same relationship id.",
    roles: ["trainee"],
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const relationshipId = c.req.param("relationshipId");
    const db = createDb(c.env.DB);
    const [row] = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, relationshipId))
      .limit(1);
    if (!row || row.traineeUserId !== actor.userId || row.status !== "ended") {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Coaching relationship not found.");
    }
    const [pending] = await db
      .select()
      .from(reactivationRequests)
      .where(
        and(
          eq(reactivationRequests.relationshipId, relationshipId),
          eq(reactivationRequests.status, "pending"),
        ),
      )
      .limit(1);
    if (!pending) {
      return fail(c, 404, "REACTIVATION_NOT_FOUND", "No pending reactivation request.");
    }
    if (pending.expiresAt < new Date().toISOString()) {
      return fail(c, 410, "REACTIVATION_EXPIRED", "Reactivation request expired.");
    }
    await confirmRelationshipReactivation(db, {
      relationshipId,
      requestId: pending.id,
    });
    const [updated] = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, relationshipId))
      .limit(1);
    const statuses = await deriveOnboardingStatusForRelationships(db, [updated!]);
    return ok(
      c,
      coachingRelationshipSchema.parse(
        mapRelationship(updated!, statuses.get(updated!.id) ?? "active"),
      ),
    );
  },
);

relationshipRoutes.post(
  "/:relationshipId/reactivate/cancel",
  operation({
    tag: "Relationships",
    summary: "Cancel pending reactivation",
    description: "Trainer cancels a pending reactivation request.",
    roles: ["trainer"],
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const relationshipId = c.req.param("relationshipId");
    const db = createDb(c.env.DB);
    const cancelled = await cancelRelationshipReactivation(db, {
      relationshipId,
      trainerUserId: actor.userId,
    });
    if (!cancelled) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Coaching relationship not found.");
    }
    return ok(c, { status: "cancelled" as const });
  },
);

export { canAccessRelationship };
