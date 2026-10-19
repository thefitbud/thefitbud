import { and, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import {
  mealPrescriptionSchema,
  mealTimesResponseSchema,
  updateMealTimesRequestSchema,
} from "@fitbud/contracts";
import { createDb } from "../db/client.js";
import {
  coachingRelationships,
  mealAssignments,
  mealTimeOverrides,
  users,
} from "../db/schema.js";
import { formatLocalDate } from "@fitbud/core";
import { nowIso } from "../lib/crypto.js";
import { fail, ok } from "../lib/envelope.js";
import { applyMealTimeOverrideUpdate } from "../domain/meal-times-update.js";
import { requireWritableRelationship } from "../lib/relationship-write-guard.js";
import { operation } from "../openapi/document.js";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const meMealTimeRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

async function activeRelationship(
  db: ReturnType<typeof createDb>,
  traineeUserId: string,
) {
  const [rel] = await db
    .select()
    .from(coachingRelationships)
    .where(
      and(
        eq(coachingRelationships.traineeUserId, traineeUserId),
        eq(coachingRelationships.status, "active"),
      ),
    )
    .limit(1);
  return rel ?? null;
}

meMealTimeRoutes.get(
  "/",
  operation({
    tag: "MealTimes",
    summary: "Trainee meal times",
    description: "Plan meal slots merged with overrides.",
    roles: ["trainee"],
    response: mealTimesResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const db = createDb(c.env.DB);
    const rel = await activeRelationship(db, actor.userId);
    if (!rel) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "No active relationship.");
    }
    const overrides = await db
      .select()
      .from(mealTimeOverrides)
      .where(eq(mealTimeOverrides.relationshipId, rel.id));
    const overrideBySlot = new Map(
      overrides.map((row) => [row.slotKey, row] as const),
    );

    const [trainee] = await db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1);
    const timeZone = trainee?.timezone ?? "UTC";
    const today = formatLocalDate(new Date(), timeZone);

    const assignments = await db
      .select()
      .from(mealAssignments)
      .where(
        and(
          eq(mealAssignments.coachingRelationshipId, rel.id),
          eq(mealAssignments.scheduleStatus, "scheduled"),
          gte(mealAssignments.localDate, today),
          lte(mealAssignments.localDate, today),
        ),
      )
      .limit(20);

    const slotsByKey = new Map<
      string,
      {
        slotKey: string;
        label: string;
        planTime: string;
        overrideTime: string | null;
      }
    >();
    for (const assignment of assignments) {
      let parsed;
      try {
        parsed = mealPrescriptionSchema.safeParse(
          JSON.parse(assignment.mealPrescriptionJson),
        );
      } catch {
        continue;
      }
      if (!parsed.success) continue;
      const slotKey =
        parsed.data.mealType ??
        parsed.data.name.toLowerCase().replace(/\s+/g, "_");
      if (slotsByKey.has(slotKey)) continue;
      const override = overrideBySlot.get(slotKey);
      const planTime = parsed.data.localTime ?? "08:00";
      slotsByKey.set(slotKey, {
        slotKey,
        label: parsed.data.name,
        planTime,
        overrideTime: override?.time ?? null,
      });
    }
    // Overrides without a same-day assignment still surface.
    for (const row of overrides) {
      if (slotsByKey.has(row.slotKey)) continue;
      slotsByKey.set(row.slotKey, {
        slotKey: row.slotKey,
        label: row.slotKey,
        planTime: row.time,
        overrideTime: row.time,
      });
    }
    const slots = [...slotsByKey.values()].sort((a, b) =>
      a.planTime.localeCompare(b.planTime),
    );
    return ok(
      c,
      mealTimesResponseSchema.parse({
        slots,
        mealTimesNeedReview: false,
      }),
    );
  },
);

meMealTimeRoutes.put(
  "/",
  operation({
    tag: "MealTimes",
    summary: "Update meal time overrides",
    description: "Stores validated meal time overrides.",
    roles: ["trainee"],
    body: updateMealTimesRequestSchema,
    response: mealTimesResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const body = await c.req.json().catch(() => null);
    const parsed = updateMealTimesRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid meal times.");
    }
    const timeToMinutes = (time: string): number | null => {
      const [hRaw, mRaw] = time.split(":").map(Number);
      const h = hRaw ?? 0;
      const m = mRaw ?? 0;
      if (!Number.isFinite(h) || !Number.isFinite(m)) {
        return null;
      }
      return h * 60 + m;
    };
    const minutes: number[] = [];
    for (const override of parsed.data.overrides) {
      const [hRaw] = override.time.split(":").map(Number);
      const h = hRaw ?? 0;
      if (!Number.isFinite(h) || h < 5 || h > 22) {
        return fail(c, 400, "INVALID_TIME", "Times must be between 05:00 and 22:00.");
      }
      const total = timeToMinutes(override.time);
      if (total === null) {
        return fail(c, 400, "INVALID_TIME", "Times must be between 05:00 and 22:00.");
      }
      minutes.push(total);
    }
    const sorted = [...minutes].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i]! - sorted[i - 1]! < 60) {
        return fail(
          c,
          400,
          "INVALID_MEAL_TIME_GAP",
          "Meal times must be at least 60 minutes apart.",
        );
      }
    }
    const db = createDb(c.env.DB);
    const rel = await activeRelationship(db, actor.userId);
    if (!rel) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "No active relationship.");
    }
    const writable = await requireWritableRelationship(c, db, rel.id);
    if (!writable.ok) {
      return writable.response;
    }
    const now = nowIso();
    for (const override of parsed.data.overrides) {
      await db
        .insert(mealTimeOverrides)
        .values({
          relationshipId: rel.id,
          slotKey: override.slotKey,
          dayPattern: override.dayPattern as "all" | "weekdays" | "weekends",
          time: override.time,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            mealTimeOverrides.relationshipId,
            mealTimeOverrides.slotKey,
            mealTimeOverrides.dayPattern,
          ],
          set: { time: override.time, updatedAt: now },
        });
    }
    await applyMealTimeOverrideUpdate(db, {
      relationshipId: rel.id,
      trainerUserId: rel.trainerUserId,
      now,
    });
    const overrides = await db
      .select()
      .from(mealTimeOverrides)
      .where(eq(mealTimeOverrides.relationshipId, rel.id));
    return ok(
      c,
      mealTimesResponseSchema.parse({
        slots: overrides.map((row) => ({
          slotKey: row.slotKey,
          label: row.slotKey,
          planTime: row.time,
          overrideTime: row.time,
        })),
      }),
    );
  },
);
