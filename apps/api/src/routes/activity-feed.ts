import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { NUTRIENT_SCALE, activityFeedResponseSchema } from "@fitbud/contracts";
import { formatCivilDate, formatPersonName, labelFor } from "@fitbud/core";
import { createDb } from "../db/client.js";
import {
  checkins,
  coachAsks,
  coachingRelationships,
  logEditEvents,
  mealCompliance,
  trainerProfiles,
  traineeProfiles,
  workoutExecutions,
} from "../db/schema.js";
import { resolveClientDisplayName } from "../domain/client-identity.js";
import { describeCoachLogEvent } from "../domain/coach-log.js";
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
    // Z14-1: one batch. Ended relationships stay out of the active feed unless
    // explicitly selected; every read is scoped through the same subquery on
    // the trainer's own relationships, so nothing else can leak in.
    const relScope = and(
      eq(coachingRelationships.trainerUserId, actor.userId),
      rid ? eq(coachingRelationships.id, rid) : eq(coachingRelationships.status, "active"),
    );
    const relIdsQuery = db.select({ id: coachingRelationships.id }).from(coachingRelationships).where(relScope);
    const coachChangesQuery = db
      .select()
      .from(logEditEvents)
      .where(inArray(logEditEvents.coachingRelationshipId, relIdsQuery))
      .orderBy(desc(logEditEvents.createdAt))
      .limit(50);
    const [rels, trainees, meals, workouts, checkinRows, asks, coachChanges, actorProfiles] =
      await db.batch([
        db.select().from(coachingRelationships).where(relScope),
        db
          .select()
          .from(traineeProfiles)
          .where(
            inArray(
              traineeProfiles.userId,
              db
                .select({ id: coachingRelationships.traineeUserId })
                .from(coachingRelationships)
                .where(relScope),
            ),
          ),
        db
          .select()
          .from(mealCompliance)
          .where(inArray(mealCompliance.coachingRelationshipId, relIdsQuery))
          .orderBy(desc(mealCompliance.loggedAt))
          .limit(50),
        db
          .select()
          .from(workoutExecutions)
          .where(inArray(workoutExecutions.coachingRelationshipId, relIdsQuery))
          .orderBy(desc(workoutExecutions.completedAt))
          .limit(50),
        db
          .select()
          .from(checkins)
          .where(inArray(checkins.coachingRelationshipId, relIdsQuery))
          .orderBy(desc(checkins.submittedAt))
          .limit(50),
        db
          .select()
          .from(coachAsks)
          .where(inArray(coachAsks.relationshipId, relIdsQuery))
          .orderBy(desc(coachAsks.lastAskedAt))
          .limit(50),
        coachChangesQuery,
        db
          .select({ userId: trainerProfiles.userId, displayName: trainerProfiles.displayName })
          .from(trainerProfiles)
          .where(
            inArray(
              trainerProfiles.userId,
              db
                .select({ id: logEditEvents.actorUserId })
                .from(logEditEvents)
                .where(inArray(logEditEvents.coachingRelationshipId, relIdsQuery))
                .orderBy(desc(logEditEvents.createdAt))
                .limit(50),
            ),
          ),
      ]);
    if (rels.length === 0) {
      return ok(c, activityFeedResponseSchema.parse({ events: [], nextCursor: null }));
    }
    const profileNameByUser = new Map(
      trainees.map((t) => [t.userId, t.displayName]),
    );
    // Z9-18: each event names the client as the trainer set it on that
    // relationship, else by their profile name.
    const nameByRelationship = new Map(
      rels.map((r) => [
        r.id,
        resolveClientDisplayName(r, profileNameByUser.get(r.traineeUserId)),
      ]),
    );
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
    for (const row of meals) {
      events.push({
        id: `meal:${row.id}`,
        relationshipId: row.coachingRelationshipId,
        traineeDisplayName: nameByRelationship.get(row.coachingRelationshipId) ?? null,
        type: "meal",
        subtype: labelFor("meal_compliance_outcome", row.outcome),
        occurredAt: row.loggedAt,
        traineeLocalTime: null,
        summary: `Meal ${labelFor("meal_compliance_outcome", row.outcome).toLowerCase()}`,
        kcal:
          row.kcalScaled == null
            ? null
            : Math.round(row.kcalScaled / NUTRIENT_SCALE),
      });
    }
    for (const row of workouts) {
      if (!row.completedAt) continue;
      events.push({
        id: `workout:${row.id}`,
        relationshipId: row.coachingRelationshipId,
        traineeDisplayName: nameByRelationship.get(row.coachingRelationshipId) ?? null,
        type: "workout",
        subtype: labelFor("workout_execution_status", row.status),
        occurredAt: row.completedAt,
        traineeLocalTime: null,
        summary: `Workout ${labelFor("workout_execution_status", row.status).toLowerCase()}`,
      });
    }
    for (const row of checkinRows) {
      if (!row.submittedAt) continue;
      events.push({
        id: `checkin:${row.id}`,
        relationshipId: row.coachingRelationshipId,
        traineeDisplayName: null,
        type: "checkin",
        subtype: labelFor("checkin_record_status", row.recordStatus),
        occurredAt: row.submittedAt,
        traineeLocalTime: null,
        summary: `Check-in ${formatCivilDate(row.localDate)}`,
      });
    }
    for (const row of asks) {
      const topicLabel = labelFor("coach_ask_topic", row.topic);
      events.push({
        id: `ask:${row.id}`,
        relationshipId: row.relationshipId,
        traineeDisplayName: nameByRelationship.get(row.relationshipId) ?? null,
        type: "coach_ask",
        subtype: topicLabel,
        occurredAt: row.lastAskedAt,
        traineeLocalTime: null,
        summary: `Coach ask: ${topicLabel}`,
      });
    }
    // R4 (Z6-19, Z7-22): one event per trainer create or edit. The audit row is
    // written in the same transaction as the entry, so a failed coach log
    // leaves neither this event nor the entry.
    const actorNames = new Map(
      actorProfiles.map((row) => [row.userId, formatPersonName(row.displayName)]),
    );
    for (const row of coachChanges) {
      const described = describeCoachLogEvent(row, actorNames.get(row.actorUserId) || "Coach");
      events.push({
        id: `log_edit:${row.id}`,
        relationshipId: row.coachingRelationshipId,
        traineeDisplayName: nameByRelationship.get(row.coachingRelationshipId) ?? null,
        type: described.type,
        subtype: described.subtype,
        occurredAt: row.createdAt,
        traineeLocalTime: null,
        summary: described.summary,
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
