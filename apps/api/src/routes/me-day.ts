import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createDb } from "../db/client.js";
import {
  coachingRelationships,
  mealAssignments,
  mealCompliance,
  workoutAssignments,
  workoutExecutions,
} from "../db/schema.js";
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

meDayRoutes.get(
  "/week",
  operation({
    tag: "MeDay",
    summary: "Trainee week summary",
    description: "Seven-day day states for the trainee.",
    roles: ["trainee"],
    response: z.object({ start: z.string(), days: z.array(z.object({ date: z.string(), state: z.string() })) }),
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const start = c.req.query("start") ?? new Date().toISOString().slice(0, 10);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(`${start}T12:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + i);
      return { date: d.toISOString().slice(0, 10), state: "future" };
    });
    return ok(c, { start, days });
  },
);
