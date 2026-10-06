import {
  operation,
  cursorParameter,
  limitParameter,
} from "../openapi/document";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { Hono } from "hono";
import {
  coachingRelationshipSchema,
  relationshipListResponseSchema,
} from "@fitbud/contracts";
import { createDb } from "../db/client";
import { coachingRelationships } from "../db/schema";
import { deriveOnboardingStatusForRelationships } from "../domain/client-status";
import { mapRelationship } from "../domain/mappers";
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
    return ok(
      c,
      coachingRelationshipSchema.parse(
        mapRelationship(row, statuses.get(row.id) ?? "onboarding_pending"),
      ),
    );
  },
);

export { canAccessRelationship };
