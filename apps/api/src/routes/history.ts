import {
  operation,
  cursorParameter,
  limitParameter,
} from "../openapi/document";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { historyListResponseSchema } from "@fitbud/contracts";
import { createDb } from "../db/client";
import { coachingRelationships } from "../db/schema";
import { assembleRelationshipHistory } from "../domain/history";
import { decodeCursor } from "../lib/cursor";
import { fail, ok } from "../lib/envelope";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth";
import type { ActorContext, Env, Variables } from "../types";
import { canAccessRelationship } from "./relationships";

export const historyRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

type Db = ReturnType<typeof createDb>;

async function loadOwnedRelationship(
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

/**
 * Readable coaching history for a relationship.
 * Trainer-owned deep-work surface; projection over domain tables only.
 */
historyRoutes.get(
  "/relationships/:relationshipId",
  operation({
    tag: "History",
    summary: "Returns readable coaching history for a trainer-owned relationship",
    description: "Returns readable coaching history for a trainer-owned relationship. The default page size is 30.",
    roles: ["trainer"],
    parameters: [
      limitParameter({ defaultValue: 30, maximum: 1 }),
      cursorParameter(),
    ],
    response: historyListResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const limitRaw = Number(c.req.query("limit") ?? "30");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.trunc(limitRaw), 1), 50)
      : 30;
    const cursor = c.req.query("cursor");
    const decoded = cursor ? decodeCursor(cursor) : null;
    if (cursor && !decoded) {
      return fail(c, 400, "INVALID_CURSOR", "Cursor is invalid.");
    }

    const db = createDb(c.env.DB);
    const relationship = await loadOwnedRelationship(
      db,
      c.req.param("relationshipId"),
      actor,
    );
    if (!relationship) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    const page = await assembleRelationshipHistory(db, relationship.id, {
      limit,
      cursor: decoded,
    });

    return ok(c, historyListResponseSchema.parse(page));
  },
);
