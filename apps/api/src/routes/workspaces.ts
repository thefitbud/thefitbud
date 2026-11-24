import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import {
  clientWorkspaceSchema,
  weekReadModelSchema,
  workspaceActivityListResponseSchema,
  workspaceActivityQuerySchema,
} from "@fitbud/contracts";
import { addDaysToLocalDate, formatLocalDate, weekdayFromLocalDate } from "@fitbud/core";
import { buildWeekReadModel } from "../domain/week-read-model.js";
import { createDb } from "../db/client";
import {
  coachingRelationships,
  planVersions,
  plans,
  users,
} from "../db/schema";
import {
  listRelationshipActivity,
  loadClientWorkspace,
} from "../domain/workspace";
import { decodeCursor } from "../lib/cursor";
import { fail, ok } from "../lib/envelope";
import { parseWeekStartQuery } from "../lib/week-start";
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

/**
 * The relationship row plus both timezones ("UTC" when unset), as one statement.
 * Pass the result of running it to `trainerOwnedRelationship`.
 */
function relationshipWithTimezonesQuery(db: Db, relationshipId: string) {
  return db
    .select({
      relationship: coachingRelationships,
      traineeTimezone: sql<string | null>`(select ${users.timezone} from ${users} where ${users.id} = ${coachingRelationships.traineeUserId})`,
      trainerTimezone: sql<string | null>`(select ${users.timezone} from ${users} where ${users.id} = ${coachingRelationships.trainerUserId})`,
    })
    .from(coachingRelationships)
    .where(eq(coachingRelationships.id, relationshipId))
    .limit(1);
}

/** Same access check as `loadTrainerRelationship`, on rows already read. */
function trainerOwnedRelationship(
  rows: Awaited<ReturnType<typeof relationshipWithTimezonesQuery>>,
  actor: ActorContext,
) {
  const row = rows[0];
  if (!row || !canAccessRelationship(actor, row.relationship)) return null;
  return {
    relationship: row.relationship,
    traineeTimezone: row.traineeTimezone ?? "UTC",
    trainerTimezone: row.trainerTimezone ?? "UTC",
  };
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
    const relationshipId = c.req.param("relationshipId");
    const now = nowIso();
    // One round trip: the access check's read, and whether a scheduled plan
    // version has come due (promotion is a write, so it only runs when needed).
    const [relationshipRows, dueRows] = await db.batch([
      relationshipWithTimezonesQuery(db, relationshipId),
      db
        .select({ id: planVersions.id })
        .from(planVersions)
        .where(
          and(
            eq(planVersions.status, "scheduled"),
            lte(planVersions.effectiveFrom, now),
            inArray(
              planVersions.planId,
              db
                .select({ id: plans.id })
                .from(plans)
                .where(eq(plans.coachingRelationshipId, relationshipId)),
            ),
          ),
        )
        .limit(1),
    ]);
    const owned = trainerOwnedRelationship(relationshipRows, actor);
    if (!owned) {
      return fail(
        c,
        404,
        "RELATIONSHIP_NOT_FOUND",
        "Coaching relationship not found.",
      );
    }
    const { relationship } = owned;

    if (dueRows.length > 0) {
      await promoteDueScheduledVersions(db, relationship.id, now, c.env);
    }
    const workspace = await loadClientWorkspace(db, relationship, now, {
      trainer: owned.trainerTimezone,
      trainee: owned.traineeTimezone,
    });
    return ok(c, workspace);
  },
);

workspaceRoutes.get(
  "/relationships/:relationshipId/week",
  operation({
    tag: "Workspaces",
    summary: "Trainer week read model",
    description: "Seven-day assignment and logging summary for one client.",
    roles: ["trainer"],
    response: weekReadModelSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    // Same `?start=` check as `GET /me/week` (BT14, D-W4-19). A bad value used
    // to throw RangeError inside the week builder and return 500.
    const parsedStart = parseWeekStartQuery(c.req.query("start"));
    if (!parsedStart.ok) {
      return fail(c, parsedStart.status, parsedStart.code, parsedStart.message);
    }
    const db = createDb(c.env.DB);
    // Ownership check and the trainee's timezone in one statement.
    const owned = trainerOwnedRelationship(
      await relationshipWithTimezonesQuery(db, c.req.param("relationshipId")),
      actor,
    );
    if (!owned) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Coaching relationship not found.");
    }
    const { relationship, traineeTimezone: timeZone } = owned;
    const today = formatLocalDate(new Date(nowIso()), timeZone);
    const weekday = weekdayFromLocalDate(today); // 0 Sun … 6 Sat
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const start = parsedStart.start || addDaysToLocalDate(today, mondayOffset);
    const model = await buildWeekReadModel(db, {
      relationshipId: relationship.id,
      start,
      timeZone,
      nowIso: nowIso(),
    });
    return ok(c, weekReadModelSchema.parse(model));
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
