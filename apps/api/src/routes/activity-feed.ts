import { desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { NUTRIENT_SCALE, activityFeedResponseSchema } from "@fitbud/contracts";
import { labelFor } from "@fitbud/core";
import { createDb } from "../db/client.js";
import {
  checkins,
  coachAsks,
  coachingRelationships,
  mealCompliance,
  traineeProfiles,
  workoutExecutions,
} from "../db/schema.js";
import { buildPage } from "../lib/cursor.js";
import { fail, ok } from "../lib/envelope.js";
import { operation } from "../openapi/document.js";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const activityFeedRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

activityFeedRoutes.get(
  "/feed",
  operation({
    tag: "Activity",
    summary: "Trainer activity feed",
    description: "Recent coaching events across owned relationships.",
    roles: ["trainer"],
    response: activityFeedResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const limit = Math.min(Number(c.req.query("limit") ?? "30") || 30, 50);
    const rid = c.req.query("rid")?.trim();
    const db = createDb(c.env.DB);
    const allRels = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.trainerUserId, actor.userId));
    // Ended relationships stay out of the active feed unless explicitly selected.
    const rels = rid
      ? allRels.filter((r) => r.id === rid)
      : allRels.filter((r) => r.status === "active");
    const relIds = rels.map((r) => r.id);
    if (relIds.length === 0) {
      return ok(c, activityFeedResponseSchema.parse({ events: [], nextCursor: null }));
    }
    const trainees = await db
      .select()
      .from(traineeProfiles)
      .where(inArray(traineeProfiles.userId, rels.map((r) => r.traineeUserId)));
    const nameByUser = new Map(trainees.map((t) => [t.userId, t.displayName]));
    const events: Array<{
      id: string;
      relationshipId: string;
      traineeDisplayName: string | null;
      type: string;
      subtype: string | null;
      occurredAt: string;
      traineeLocalTime: string | null;
      summary: string;
      kcal?: number | null;
      link?: string | null;
    }> = [];
    const meals = await db
      .select()
      .from(mealCompliance)
      .where(inArray(mealCompliance.coachingRelationshipId, relIds))
      .orderBy(desc(mealCompliance.loggedAt))
      .limit(50);
    for (const row of meals) {
      events.push({
        id: `meal:${row.id}`,
        relationshipId: row.coachingRelationshipId,
        traineeDisplayName: nameByUser.get(row.traineeUserId) ?? null,
        type: "meal",
        subtype: row.outcome,
        occurredAt: row.loggedAt,
        traineeLocalTime: null,
        summary: `Meal ${row.outcome}`,
        kcal:
          row.kcalScaled == null
            ? null
            : Math.round(row.kcalScaled / NUTRIENT_SCALE),
      });
    }
    const workouts = await db
      .select()
      .from(workoutExecutions)
      .where(inArray(workoutExecutions.coachingRelationshipId, relIds))
      .orderBy(desc(workoutExecutions.completedAt))
      .limit(50);
    for (const row of workouts) {
      if (!row.completedAt) continue;
      events.push({
        id: `workout:${row.id}`,
        relationshipId: row.coachingRelationshipId,
        traineeDisplayName: nameByUser.get(row.traineeUserId) ?? null,
        type: "workout",
        subtype: row.status,
        occurredAt: row.completedAt,
        traineeLocalTime: null,
        summary: `Workout ${row.status}`,
      });
    }
    const checkinRows = await db
      .select()
      .from(checkins)
      .where(inArray(checkins.coachingRelationshipId, relIds))
      .orderBy(desc(checkins.submittedAt))
      .limit(50);
    for (const row of checkinRows) {
      if (!row.submittedAt) continue;
      events.push({
        id: `checkin:${row.id}`,
        relationshipId: row.coachingRelationshipId,
        traineeDisplayName: null,
        type: "checkin",
        subtype: row.recordStatus,
        occurredAt: row.submittedAt,
        traineeLocalTime: row.localDate,
        summary: "Check-in submitted",
      });
    }
    const asks = await db
      .select()
      .from(coachAsks)
      .where(inArray(coachAsks.relationshipId, relIds))
      .orderBy(desc(coachAsks.lastAskedAt))
      .limit(50);
    for (const row of asks) {
      const topicLabel = labelFor("coach_ask_topic", row.topic);
      events.push({
        id: `ask:${row.id}`,
        relationshipId: row.relationshipId,
        traineeDisplayName: nameByUser.get(row.traineeUserId) ?? null,
        type: "coach_ask",
        subtype: topicLabel,
        occurredAt: row.lastAskedAt,
        traineeLocalTime: null,
        summary: `Coach ask: ${topicLabel}`,
      });
    }
    events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    const page = buildPage(events, limit, (e) => e.occurredAt);
    return ok(
      c,
      activityFeedResponseSchema.parse({
        events: page.items,
        nextCursor: page.nextCursor,
      }),
    );
  },
);
