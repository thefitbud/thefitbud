import { Hono } from "hono";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import {
  putStepsTargetRequestSchema,
  putStepsTargetResponseSchema,
  stepsQuerySchema,
  stepsRangeResponseSchema,
  type StepsDay,
} from "@fitbud/contracts";
import { createDb, type Db } from "../db/client.js";
import { coachingConfigurations, coachingRelationships, dailySteps, users } from "../db/schema.js";
import { localDateIn } from "../domain/strength-read-model.js";
import { nowIso } from "../lib/crypto.js";
import { fail, ok } from "../lib/envelope.js";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth.js";
import { operation } from "../openapi/document.js";
import type { Env, Variables } from "../types.js";

// W6 Z6-9: trainer reads of a client's daily steps and the per-client daily target.
export const stepsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Matches the column default on `coaching_configurations.steps_target`. */
const DEFAULT_STEPS_TARGET = 8000;

const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const;

/** Add whole days to a YYYY-MM-DD civil date (UTC arithmetic on the calendar date only). */
export function addDaysToLocalDate(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The target the client sees: the active configuration's, else a draft's (before the
 * first activation), else the newest superseded one, else the default. One scalar
 * subquery, so reading the target never costs a statement of its own.
 */
export const currentStepsTargetSql = sql<number>`coalesce((
  select ${coachingConfigurations.stepsTarget} from ${coachingConfigurations}
  where ${coachingConfigurations.coachingRelationshipId} = ${coachingRelationships.id}
  order by case ${coachingConfigurations.status} when 'active' then 0 when 'draft' then 1 else 2 end,
    ${coachingConfigurations.versionNumber} desc
  limit 1
), ${DEFAULT_STEPS_TARGET})`;

export type StepsRelationship = {
  id: string;
  trainerUserId: string | null;
  traineeUserId: string;
  status: "active" | "ended";
  timezone: string;
  target: number;
};

/** One statement: the relationship, the trainee's timezone and the current target. */
export async function loadStepsRelationshipById(
  db: Db,
  relationshipId: string,
): Promise<StepsRelationship | null> {
  const [row] = await db
    .select({
      id: coachingRelationships.id,
      trainerUserId: coachingRelationships.trainerUserId,
      traineeUserId: coachingRelationships.traineeUserId,
      status: coachingRelationships.status,
      timezone: users.timezone,
      target: currentStepsTargetSql,
    })
    .from(coachingRelationships)
    .innerJoin(users, eq(users.id, coachingRelationships.traineeUserId))
    .where(eq(coachingRelationships.id, relationshipId))
    .limit(1);
  return row ?? null;
}

/**
 * One statement: the trainee's own relationship, the active one first, else the most
 * recently started ended one (so reads still work after the client has ended).
 */
export async function loadTraineeStepsRelationship(
  db: Db,
  traineeUserId: string,
): Promise<StepsRelationship | null> {
  const [row] = await db
    .select({
      id: coachingRelationships.id,
      trainerUserId: coachingRelationships.trainerUserId,
      traineeUserId: coachingRelationships.traineeUserId,
      status: coachingRelationships.status,
      timezone: users.timezone,
      target: currentStepsTargetSql,
    })
    .from(coachingRelationships)
    .innerJoin(users, eq(users.id, coachingRelationships.traineeUserId))
    .where(eq(coachingRelationships.traineeUserId, traineeUserId))
    .orderBy(
      sql`case ${coachingRelationships.status} when 'active' then 0 else 1 end`,
      sql`${coachingRelationships.startedAt} desc`,
    )
    .limit(1);
  return row ?? null;
}

stepsRoutes.get(
  "/relationships/:relationshipId",
  operation({
    tag: "Steps",
    summary: "A client's saved daily steps and current target.",
    description:
      "Readable by the relationship's trainer, including after the relationship has ended. Only days the trainee's phone has saved are returned; dates are the trainee's local dates.",
    roles: ["trainer"],
    parameters: [
      {
        name: "range",
        in: "query",
        description: "7d (default), 30d or 90d, ending on the trainee's local today.",
        schema: { type: "string", enum: ["7d", "30d", "90d"] },
      },
    ],
    response: stepsRangeResponseSchema,
    errors: [
      { status: 400, description: "The range is invalid." },
      { status: 403, description: "The relationship belongs to someone else." },
      { status: 404, description: "The relationship does not exist." },
    ],
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const parsed = stepsQuerySchema.safeParse({
      range: c.req.query("range") || undefined,
    });
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid steps range.");
    }

    const db = createDb(c.env.DB);
    const relationship = await loadStepsRelationshipById(db, c.req.param("relationshipId"));
    if (!relationship) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }
    if (relationship.trainerUserId !== actor.userId) {
      return fail(c, 403, "FORBIDDEN", "You cannot view this client's steps.");
    }

    const to = localDateIn(relationship.timezone, new Date());
    const from = addDaysToLocalDate(to, 1 - RANGE_DAYS[parsed.data.range]);
    const rows = await db
      .select({
        localDate: dailySteps.localDate,
        steps: dailySteps.steps,
        source: dailySteps.source,
        syncedAt: dailySteps.syncedAt,
      })
      .from(dailySteps)
      .where(
        and(
          eq(dailySteps.coachingRelationshipId, relationship.id),
          gte(dailySteps.localDate, from),
          lte(dailySteps.localDate, to),
        ),
      )
      .orderBy(asc(dailySteps.localDate));
    const days: StepsDay[] = rows;
    return ok(
      c,
      stepsRangeResponseSchema.parse({
        relationshipId: relationship.id,
        target: relationship.target,
        from,
        to,
        days,
      }),
    );
  },
);

stepsRoutes.put(
  "/relationships/:relationshipId/target",
  operation({
    tag: "Steps",
    summary: "Set a client's daily steps target.",
    description:
      "Trainer only, 1,000 to 50,000. Rejected 409 once the relationship has ended. The target is a setting, not a coaching expectation: it is written to the active configuration and to any open draft in one statement, without changing either's record version, so it applies at once and survives activating or revising a configuration.",
    roles: ["trainer"],
    body: putStepsTargetRequestSchema,
    response: putStepsTargetResponseSchema,
    errors: [
      { status: 403, description: "The relationship belongs to someone else." },
      { status: 404, description: "The relationship or its configuration does not exist." },
      { status: 409, description: "The relationship has ended." },
    ],
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const parsed = putStepsTargetRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid steps target.");
    }

    const db = createDb(c.env.DB);
    const relationship = await loadStepsRelationshipById(db, c.req.param("relationshipId"));
    if (!relationship) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }
    if (relationship.trainerUserId !== actor.userId) {
      return fail(c, 403, "FORBIDDEN", "You cannot change this client's steps target.");
    }
    if (relationship.status === "ended") {
      return fail(c, 409, "RELATIONSHIP_ENDED", "This client has ended; steps are read-only.");
    }

    const updated = await db
      .update(coachingConfigurations)
      .set({ stepsTarget: parsed.data.target, updatedAt: nowIso() })
      .where(
        and(
          eq(coachingConfigurations.coachingRelationshipId, relationship.id),
          sql`${coachingConfigurations.status} in ('active', 'draft')`,
        ),
      )
      .returning({ id: coachingConfigurations.id });
    if (updated.length === 0) {
      return fail(c, 404, "CONFIGURATION_NOT_FOUND", "Coaching configuration not found.");
    }
    return ok(
      c,
      putStepsTargetResponseSchema.parse({
        relationshipId: relationship.id,
        target: parsed.data.target,
      }),
    );
  },
);
