import { and, eq, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import {
  localDateSchema,
  meDayResponseSchema,
  weekReadModelSchema,
  type WorkoutExecutionStatus,
} from "@fitbud/contracts";
import {
  addDaysToLocalDate,
  formatLocalDate,
  weekdayFromLocalDate,
} from "@fitbud/core";
import { createDb } from "../db/client.js";
import {
  coachingRelationships,
  mealAssignments,
  mealCompliance,
  users,
  workoutAssignments,
  workoutExecutions,
} from "../db/schema.js";
import {
  buildWeekReadModel,
  deriveWeekDayFromWorkouts,
} from "../domain/week-read-model.js";
import { nowIso, sha256Hex } from "../lib/crypto.js";
import { fail } from "../lib/envelope.js";
import { parseWeekStartQuery } from "../lib/week-start.js";
import { operation } from "../openapi/document.js";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

/**
 * The trainee's own active relationship id as a scalar subquery, so a read can
 * be filtered by relationship inside the same statement (and the same
 * `db.batch` round trip) that resolves it. It is keyed by the authenticated
 * actor, never by anything in the request.
 */
function activeRelationshipIdFor(traineeUserId: string) {
  return sql<string>`(select ${coachingRelationships.id} from ${coachingRelationships} where ${coachingRelationships.traineeUserId} = ${traineeUserId} and ${coachingRelationships.status} = 'active' limit 1)`;
}

export const meDayRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Z14-1: the day and week answers are a pure function of stored state and the
 * clock, so a weak ETag over the exact body is always correct; a client that
 * sends it back in If-None-Match gets an empty 304 when nothing changed.
 * `private, no-cache`: revalidate every time, never shared between users.
 */
async function okWithEtag<T>(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  data: T,
) {
  const body = JSON.stringify({ data });
  const etag = `W/"${(await sha256Hex(body)).slice(0, 32)}"`;
  c.header("ETag", etag);
  c.header("Cache-Control", "private, no-cache");
  const ifNoneMatch = c.req.header("If-None-Match");
  if (ifNoneMatch && ifNoneMatch.split(",").some((tag) => tag.trim() === etag)) {
    return c.body(null, 304);
  }
  return c.body(body, 200, { "Content-Type": "application/json" });
}

meDayRoutes.get(
  "/day/:date",
  operation({
    tag: "MeDay",
    summary: "Trainee day read model",
    description:
      "Assignments, logs, totals, and the derived day state for one local day.",
    roles: ["trainee"],
    response: meDayResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    // Same check as `?start=` on `GET /me/week`: the regex accepts
    // 2026-02-30, and the round trip through addDaysToLocalDate rejects a
    // date that is not a real calendar day. Static text, existing code
    // (D-W3-12, D-W3b-7, CU23).
    const dateParam = c.req.param("date");
    const parsedDate = localDateSchema.safeParse(dateParam);
    if (
      !parsedDate.success ||
      addDaysToLocalDate(parsedDate.data, 0) !== parsedDate.data
    ) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid date.");
    }
    const date = parsedDate.data;
    const db = createDb(c.env.DB);
    // One round trip for every read (Z14-1). The relationship is resolved
    // inside each statement from the actor's own id, never from the request,
    // so a day with no active relationship returns nothing and answers 404.
    const relId = activeRelationshipIdFor(actor.userId);
    // After end/reactivate, superseded slots stay in history but must not
    // inflate Today rings (e.g. "1218 / 0 kcal" with no live plan).
    // Compliance is joined via assignment for this local date (loggedAt is an
    // ISO instant, not a civil date: never filter loggedAt === date).
    // Joined columns carry distinct aliases because `db.batch` maps rows by
    // column name.
    const [relRows, tzRows, workouts, meals, mealLogs, workoutLogs] =
      await db.batch([
        db
          .select({ id: coachingRelationships.id })
          .from(coachingRelationships)
          .where(
            and(
              eq(coachingRelationships.traineeUserId, actor.userId),
              eq(coachingRelationships.status, "active"),
            ),
          )
          .limit(1),
        db
          .select({ timezone: users.timezone })
          .from(users)
          .where(eq(users.id, actor.userId))
          .limit(1),
        db
          .select({
            id: workoutAssignments.id,
            workoutDayName: workoutAssignments.workoutDayName,
            windowEndsAt: workoutAssignments.windowEndsAt,
          })
          .from(workoutAssignments)
          .where(
            and(
              eq(workoutAssignments.coachingRelationshipId, relId),
              eq(workoutAssignments.localDate, date),
              eq(workoutAssignments.scheduleStatus, "scheduled"),
            ),
          ),
        db
          .select({
            id: mealAssignments.id,
            mealPrescriptionId: mealAssignments.mealPrescriptionId,
          })
          .from(mealAssignments)
          .where(
            and(
              eq(mealAssignments.coachingRelationshipId, relId),
              eq(mealAssignments.localDate, date),
              eq(mealAssignments.scheduleStatus, "scheduled"),
            ),
          ),
        db
          .select({
            kcalScaled: sql<number | null>`${mealCompliance.kcalScaled}`.as(
              "log_kcal_scaled",
            ),
            slotKey: sql<string>`${mealAssignments.mealPrescriptionId}`.as(
              "log_slot_key",
            ),
          })
          .from(mealCompliance)
          .innerJoin(
            mealAssignments,
            eq(mealCompliance.assignmentId, mealAssignments.id),
          )
          .where(
            and(
              eq(mealAssignments.coachingRelationshipId, relId),
              eq(mealAssignments.localDate, date),
              eq(mealAssignments.scheduleStatus, "scheduled"),
            ),
          ),
        db
          .select({
            assignmentId: sql<string>`${workoutAssignments.id}`.as(
              "log_assignment_id",
            ),
            status: sql<WorkoutExecutionStatus>`${workoutExecutions.status}`.as(
              "log_status",
            ),
          })
          .from(workoutExecutions)
          .innerJoin(
            workoutAssignments,
            eq(workoutExecutions.assignmentId, workoutAssignments.id),
          )
          .where(
            and(
              eq(workoutAssignments.coachingRelationshipId, relId),
              eq(workoutAssignments.localDate, date),
              eq(workoutAssignments.scheduleStatus, "scheduled"),
            ),
          ),
      ]);
    const [rel] = relRows;
    if (!rel) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "No active relationship.");
    }
    const kcal = mealLogs.reduce((sum, row) => sum + (row.kcalScaled ?? 0), 0);
    const perMeal = mealLogs.map((row) => ({
      slotKey: row.slotKey,
      kcalScaled: row.kcalScaled ?? 0,
    }));
    // Same civil "today" as `GET /me/week`: the trainee's zone, not UTC.
    // The state is derived from the scheduled workouts this handler already
    // loaded for the relationship, so it cannot describe another trainee.
    const timeZone = tzRows[0]?.timezone ?? "UTC";
    const now = nowIso();
    const today = formatLocalDate(new Date(now), timeZone);
    const executionByAssignment = new Map(
      workoutLogs.map((row) => [row.assignmentId, row.status]),
    );
    const { state } = deriveWeekDayFromWorkouts({
      date,
      today,
      nowIso: now,
      workouts: workouts.map((workout) => ({
        windowEndsAt: workout.windowEndsAt,
        workoutDayName: workout.workoutDayName,
        executionStatus: executionByAssignment.get(workout.id) ?? null,
      })),
    });
    return okWithEtag(
      c,
      meDayResponseSchema.parse({
        date,
        state,
        assignments: {
          workouts: workouts.map((w) => ({ id: w.id, name: w.workoutDayName })),
          meals: meals.map((m) => ({ id: m.id, slotKey: m.mealPrescriptionId })),
        },
        logs: {
          workouts: workoutLogs.length,
          meals: mealLogs.length,
        },
        totals: { kcalScaled: kcal, perMeal },
      }),
    );
  },
);

/**
 * `GET /me/week` — the trainee's own week read model (CU23, D-W3b-25).
 *
 * This route used to touch no database at all: it answered seven consecutive
 * dates all in `state: "future"`, derived today in UTC, and echoed `?start=`
 * back unvalidated. The client parses the response with
 * `weekReadModelSchema`, so every call threw and the three mobile call sites
 * fell back to deriving day states from the date alone — every past day read
 * as `missed` whether or not it was. That is the defect CU23 removes.
 *
 * It is not a new read model. `buildWeekReadModel` already serves the trainer
 * at `GET /workspaces/relationships/:rid/week`
 * (`apps/api/src/routes/workspaces.ts`), and that handler is this one's
 * template: the only substitution is the relationship lookup, which resolves
 * the trainee's own active relationship from `actor.userId` (never from the
 * request) exactly as `GET /me/day/:date` above does. Trainer and trainee
 * therefore read the same coaching state from the same builder.
 *
 * D-W3b-25's "Weekly view isn't available yet" dress-rehearsal fallback is
 * retired by D-W3b-37 (the 12 Nov rehearsal is cancelled), so this is the
 * real endpoint and no fallback shape exists.
 */
meDayRoutes.get(
  "/week",
  operation({
    tag: "MeDay",
    summary: "Trainee week read model",
    description:
      "Seven-day assignment and logging summary for the authenticated trainee.",
    roles: ["trainee"],
    response: weekReadModelSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    // Shared with the trainer week route (BT14, D-W4-19). See week-start.ts.
    const parsedStart = parseWeekStartQuery(c.req.query("start"));
    if (!parsedStart.ok) {
      return fail(c, parsedStart.status, parsedStart.code, parsedStart.message);
    }
    const db = createDb(c.env.DB);
    // Round trip 1 (after auth): the relationship and the trainee's zone in
    // one statement. The week's start depends on the zone, so the data reads
    // wait for it; they then share round trip 2 (Z14-1).
    const [head] = await db
      .select({ id: coachingRelationships.id, timezone: users.timezone })
      .from(coachingRelationships)
      .innerJoin(users, eq(users.id, coachingRelationships.traineeUserId))
      .where(
        and(
          eq(coachingRelationships.traineeUserId, actor.userId),
          eq(coachingRelationships.status, "active"),
        ),
      )
      .limit(1);
    if (!head) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "No active relationship.");
    }
    const timeZone = head.timezone ?? "UTC";
    const now = nowIso();
    const today = formatLocalDate(new Date(now), timeZone);
    const weekday = weekdayFromLocalDate(today); // 0 Sun … 6 Sat
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const start = parsedStart.start || addDaysToLocalDate(today, mondayOffset);
    const model = await buildWeekReadModel(db, {
      relationshipId: head.id,
      start,
      timeZone,
      nowIso: nowIso(),
    });
    return okWithEtag(c, weekReadModelSchema.parse(model));
  },
);


