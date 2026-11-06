import { Hono } from "hono";
import { sql } from "drizzle-orm";
import {
  putStepsDayRequestSchema,
  putStepsDayResponseSchema,
  stepsLocalDateSchema,
  stepsSettingsResponseSchema,
  stepsTodayResponseSchema,
  updateStepsSettingsRequestSchema,
} from "@fitbud/contracts";
import { getFlags } from "../config/flags.js";
import { createDb } from "../db/client.js";
import { fail, ok } from "../lib/envelope.js";
import { dailySteps } from "../db/schema.js";
import { localDateIn } from "../domain/strength-read-model.js";
import { createId } from "../lib/crypto.js";
import { operation } from "../openapi/document.js";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";
import { addDaysToLocalDate, loadTraineeStepsRelationship } from "./steps.js";

export const meStepRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

async function stepsDisabledResponse(c: Parameters<typeof ok>[0]) {
  return ok(
    c,
    stepsSettingsResponseSchema.parse({
      enabled: false,
      dailyGoal: null,
      source: null,
    }),
  );
}

meStepRoutes.get(
  "/",
  operation({
    tag: "Trainee",
    summary: "Steps settings",
    description: "Returns disabled stub while steps_enabled is false.",
    roles: ["trainee"],
    response: stepsSettingsResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const db = createDb(c.env.DB);
    const flags = await getFlags(c.env, db);
    if (!flags.steps_enabled) {
      return stepsDisabledResponse(c);
    }
    return ok(
      c,
      stepsSettingsResponseSchema.parse({
        enabled: true,
        dailyGoal: null,
        source: null,
      }),
    );
  },
);

meStepRoutes.put(
  "/",
  operation({
    tag: "Trainee",
    summary: "Update steps settings",
    description: "Rejected while steps_enabled is false.",
    roles: ["trainee"],
    body: updateStepsSettingsRequestSchema,
    response: stepsSettingsResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const parsed = updateStepsSettingsRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid steps settings.");
    }
    const db = createDb(c.env.DB);
    const flags = await getFlags(c.env, db);
    if (!flags.steps_enabled) {
      return fail(
        c,
        403,
        "FEATURE_DISABLED",
        "Steps tracking is not enabled.",
      );
    }
    return ok(
      c,
      stepsSettingsResponseSchema.parse({
        enabled: true,
        dailyGoal: parsed.data.dailyGoal ?? null,
        source: parsed.data.source ?? null,
      }),
    );
  },
);

/** Days a trainee may back-fill, and how far ahead of their own today a date may be. */
const MAX_DAYS_BACK = 30;
const MAX_DAYS_AHEAD = 1;

meStepRoutes.get(
  "/today",
  operation({
    tag: "Trainee",
    summary: "Today's steps against the target.",
    description:
      "Today is the trainee's local date. Steps are null until a total has been saved. Works after the relationship has ended.",
    roles: ["trainee"],
    response: stepsTodayResponseSchema,
    errors: [{ status: 404, description: "The trainee has no coaching relationship." }],
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.userId) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const db = createDb(c.env.DB);
    const relationship = await loadTraineeStepsRelationship(db, actor.userId);
    if (!relationship) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "No coaching relationship.");
    }
    const localDate = localDateIn(relationship.timezone, new Date());
    const [row] = await db
      .select({ steps: dailySteps.steps })
      .from(dailySteps)
      .where(
        sql`${dailySteps.coachingRelationshipId} = ${relationship.id} and ${dailySteps.localDate} = ${localDate}`,
      )
      .limit(1);
    return ok(
      c,
      stepsTodayResponseSchema.parse({
        localDate,
        steps: row?.steps ?? null,
        target: relationship.target,
      }),
    );
  },
);

meStepRoutes.put(
  "/days/:localDate",
  operation({
    tag: "Trainee",
    summary: "Save a day's step total.",
    description:
      "Upserts the trainee's total for one local date on their active relationship. A write replaces the stored day only when its syncedAt is newer, so retries and out-of-order syncs are safe without an idempotency key. The date may be at most 1 day ahead of the trainee's today and at most 30 days back.",
    roles: ["trainee"],
    body: putStepsDayRequestSchema,
    response: putStepsDayResponseSchema,
    errors: [
      { status: 400, description: "The body or date is invalid, or the date is outside the allowed window." },
      { status: 404, description: "The trainee has no coaching relationship." },
      { status: 409, description: "The relationship has ended." },
    ],
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.userId) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const date = stepsLocalDateSchema.safeParse(c.req.param("localDate"));
    if (!date.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid steps date.");
    }
    const body = putStepsDayRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!body.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid steps entry.");
    }

    const db = createDb(c.env.DB);
    const relationship = await loadTraineeStepsRelationship(db, actor.userId);
    if (!relationship) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "No coaching relationship.");
    }
    if (relationship.status === "ended") {
      return fail(c, 409, "RELATIONSHIP_ENDED", "This coaching relationship has ended.");
    }

    const now = new Date();
    const today = localDateIn(relationship.timezone, now);
    if (
      date.data > addDaysToLocalDate(today, MAX_DAYS_AHEAD) ||
      date.data < addDaysToLocalDate(today, -MAX_DAYS_BACK)
    ) {
      return fail(
        c,
        400,
        "STEPS_DATE_OUT_OF_RANGE",
        "Steps can be saved for the last 30 days and up to tomorrow.",
      );
    }

    const nowStamp = now.toISOString();
    const requested = body.data.syncedAt
      ? new Date(body.data.syncedAt).toISOString()
      : nowStamp;
    const syncedAt = requested > nowStamp ? nowStamp : requested;

    // One statement. The stored row is replaced only when this write is newer; either
    // way the row comes back, so the client always learns what is stored.
    const [stored] = await db
      .insert(dailySteps)
      .values({
        id: createId(),
        coachingRelationshipId: relationship.id,
        localDate: date.data,
        steps: body.data.steps,
        source: body.data.source,
        syncedAt,
      })
      .onConflictDoUpdate({
        target: [dailySteps.coachingRelationshipId, dailySteps.localDate],
        set: {
          steps: sql`case when excluded.synced_at > ${dailySteps.syncedAt} then excluded.steps else ${dailySteps.steps} end`,
          source: sql`case when excluded.synced_at > ${dailySteps.syncedAt} then excluded.source else ${dailySteps.source} end`,
          syncedAt: sql`case when excluded.synced_at > ${dailySteps.syncedAt} then excluded.synced_at else ${dailySteps.syncedAt} end`,
        },
      })
      .returning({
        steps: dailySteps.steps,
        source: dailySteps.source,
        syncedAt: dailySteps.syncedAt,
      });
    if (!stored) {
      return fail(c, 500, "INTERNAL_ERROR", "Steps could not be saved.");
    }
    return ok(
      c,
      putStepsDayResponseSchema.parse({
        localDate: date.data,
        steps: stored.steps,
        source: stored.source,
        syncedAt: stored.syncedAt,
        applied:
          stored.syncedAt === syncedAt &&
          stored.steps === body.data.steps &&
          stored.source === body.data.source,
      }),
    );
  },
);
