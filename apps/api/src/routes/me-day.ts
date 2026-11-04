import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { localDateSchema, weekReadModelSchema } from "@fitbud/contracts";
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
  workoutAssignments,
  workoutExecutions,
} from "../db/schema.js";
import { loadTraineeTimezone } from "../domain/assignment-schedule.js";
import { buildWeekReadModel } from "../domain/week-read-model.js";
import { nowIso } from "../lib/crypto.js";
import { fail, ok } from "../lib/envelope.js";
import { operation } from "../openapi/document.js";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

const dayResponseSchema = z.object({
  date: z.string(),
  assignments: z.object({
    workouts: z.array(z.object({ id: z.string(), name: z.string() })),
    meals: z.array(z.object({ id: z.string(), slotKey: z.string() })),
  }),
  logs: z.object({
    workouts: z.number().int(),
    meals: z.number().int(),
  }),
  totals: z.object({
    kcalScaled: z.number().int(),
    perMeal: z.array(z.object({ slotKey: z.string(), kcalScaled: z.number().int() })),
  }),
});

export const meDayRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

meDayRoutes.get(
  "/day/:date",
  operation({
    tag: "MeDay",
    summary: "Trainee day read model",
    description: "Assignments, logs, and totals for one local day.",
    roles: ["trainee"],
    response: dayResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const date = c.req.param("date");
    const db = createDb(c.env.DB);
    const [rel] = await db
      .select()
      .from(coachingRelationships)
      .where(
        and(
          eq(coachingRelationships.traineeUserId, actor.userId),
          eq(coachingRelationships.status, "active"),
        ),
      )
      .limit(1);
    if (!rel) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "No active relationship.");
    }
    // After end/reactivate, superseded slots stay in history but must not
    // inflate Today rings (e.g. "1218 / 0 kcal" with no live plan).
    const workouts = await db
      .select()
      .from(workoutAssignments)
      .where(
        and(
          eq(workoutAssignments.coachingRelationshipId, rel.id),
          eq(workoutAssignments.localDate, date),
          eq(workoutAssignments.scheduleStatus, "scheduled"),
        ),
      );
    const meals = await db
      .select()
      .from(mealAssignments)
      .where(
        and(
          eq(mealAssignments.coachingRelationshipId, rel.id),
          eq(mealAssignments.localDate, date),
          eq(mealAssignments.scheduleStatus, "scheduled"),
        ),
      );
    // Join compliance via assignment for this local date (loggedAt is an ISO
    // instant, not a civil date — never filter loggedAt === date).
    const mealLogs = await db
      .select({
        compliance: mealCompliance,
        assignment: mealAssignments,
      })
      .from(mealCompliance)
      .innerJoin(
        mealAssignments,
        eq(mealCompliance.assignmentId, mealAssignments.id),
      )
      .where(
        and(
          eq(mealAssignments.coachingRelationshipId, rel.id),
          eq(mealAssignments.localDate, date),
          eq(mealAssignments.scheduleStatus, "scheduled"),
        ),
      );
    const workoutLogs = await db
      .select({
        execution: workoutExecutions,
        assignment: workoutAssignments,
      })
      .from(workoutExecutions)
      .innerJoin(
        workoutAssignments,
        eq(workoutExecutions.assignmentId, workoutAssignments.id),
      )
      .where(
        and(
          eq(workoutAssignments.coachingRelationshipId, rel.id),
          eq(workoutAssignments.localDate, date),
          eq(workoutAssignments.scheduleStatus, "scheduled"),
        ),
      );
    const kcal = mealLogs.reduce(
      (sum, row) => sum + (row.compliance.kcalScaled ?? 0),
      0,
    );
    const perMeal = mealLogs.map((row) => ({
      slotKey: row.assignment.mealPrescriptionId,
      kcalScaled: row.compliance.kcalScaled ?? 0,
    }));
    return ok(
      c,
      dayResponseSchema.parse({
        date,
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
    // `?start=` was unvalidated: `2026-11` answered 200 with nonsense dates,
    // `2026-02-30` rolled into March, and `garbage` was an unhandled
    // RangeError 500. The regex alone accepts 2026-02-30, so the round trip
    // through addDaysToLocalDate is what rejects a date that is not a real
    // calendar day. The message is static text (D-W3-12, D-W3b-7) and the
    // code is the one the API already uses for a malformed query date
    // (apps/api/src/routes/workouts.ts fromDate/toDate).
    const startQuery = c.req.query("start")?.trim();
    if (startQuery) {
      const parsed = localDateSchema.safeParse(startQuery);
      if (!parsed.success || addDaysToLocalDate(parsed.data, 0) !== parsed.data) {
        return fail(c, 400, "INVALID_REQUEST", "Invalid start date.");
      }
    }
    const db = createDb(c.env.DB);
    const [rel] = await db
      .select()
      .from(coachingRelationships)
      .where(
        and(
          eq(coachingRelationships.traineeUserId, actor.userId),
          eq(coachingRelationships.status, "active"),
        ),
      )
      .limit(1);
    if (!rel) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "No active relationship.");
    }
    const timeZone = await loadTraineeTimezone(db, rel.traineeUserId);
    const today = formatLocalDate(new Date(nowIso()), timeZone);
    const weekday = weekdayFromLocalDate(today); // 0 Sun … 6 Sat
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const start = startQuery || addDaysToLocalDate(today, mondayOffset);
    const model = await buildWeekReadModel(db, {
      relationshipId: rel.id,
      start,
      timeZone,
      nowIso: nowIso(),
    });
    return ok(c, weekReadModelSchema.parse(model));
  },
);
