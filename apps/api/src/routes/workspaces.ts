import { eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  clientWorkspaceSchema,
  workspaceActivityListResponseSchema,
  workspaceActivityQuerySchema,
} from "@fitbud/contracts";
import { createDb } from "../db/client";
import { coachingRelationships } from "../db/schema";
import {
  listRelationshipActivity,
  loadClientWorkspace,
} from "../domain/workspace";
import { decodeCursor } from "../lib/cursor";
import { fail, ok } from "../lib/envelope";
import { nowIso } from "../lib/crypto";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth";
import {
  activityQueryParameters,
  cursorParameter,
  limitParameter,
  operation,
} from "../openapi/document";
import type { ActorContext, Env, Variables } from "../types";
import { promoteDueScheduledVersions } from "./plans";
import { canAccessRelationship } from "./relationships";

export const workspaceRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

type Db = ReturnType<typeof createDb>;

async function loadTrainerRelationship(
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

workspaceRoutes.get(
  "/relationships/:relationshipId",
  operation({
    tag: "Workspaces",
    summary: "Trainer client workspace",
    description:
      "Trainer-only composition of one owned client. Header, overview, effective plan, active configuration, and the latest subscription version are read from existing records. Empty sections are null or empty arrays. Trainees cannot call this route.",
    roles: ["trainer"],
    response: clientWorkspaceSchema,
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
    const relationship = await loadTrainerRelationship(
      db,
      c.req.param("relationshipId"),
      actor,
    );
    if (!relationship) {
      return fail(
        c,
        404,
        "RELATIONSHIP_NOT_FOUND",
        "Coaching relationship not found.",
      );
    }

    const now = nowIso();
    await promoteDueScheduledVersions(db, relationship.id, now, c.env);
    const workspace = await loadClientWorkspace(db, relationship, now);
    return ok(c, workspace);
  },
);

workspaceRoutes.get(
  "/relationships/:relationshipId/activity",
  operation({
    tag: "Workspaces",
    summary: "Trainer client activity",
    description:
      "Trainer-only activity for one owned relationship. type is workout, meal, or checkin. Optional state must be a derived status for that type. occurredFrom and occurredTo are civil dates on the assignment or check-in. Each record keeps the plan version stored on that execution. A state that does not belong to the type is rejected.",
    roles: ["trainer"],
    parameters: [
      ...activityQueryParameters(),
      limitParameter({ defaultValue: 20, maximum: 50 }),
      cursorParameter(),
    ],
    response: workspaceActivityListResponseSchema,
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
    const relationship = await loadTrainerRelationship(
      db,
      c.req.param("relationshipId"),
      actor,
    );
    if (!relationship) {
      return fail(
        c,
        404,
        "RELATIONSHIP_NOT_FOUND",
        "Coaching relationship not found.",
      );
    }

    const parsed = workspaceActivityQuerySchema.safeParse({
      type: c.req.query("type") || undefined,
      state: c.req.query("state") || undefined,
      occurredFrom: c.req.query("occurredFrom") || undefined,
      occurredTo: c.req.query("occurredTo") || undefined,
    });
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid activity filter.", {
        issues: parsed.error.issues,
      });
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

    const page = await listRelationshipActivity(db, {
      relationshipId: relationship.id,
      type: parsed.data.type,
      state: parsed.data.state,
      occurredFrom: parsed.data.occurredFrom,
      occurredTo: parsed.data.occurredTo,
      limit,
      cursor: decoded,
      nowIso: nowIso(),
    });
    return ok(c, workspaceActivityListResponseSchema.parse(page));
  },
);
