import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  mealTimesResponseSchema,
  updateMealTimesRequestSchema,
} from "@fitbud/contracts";
import { createDb } from "../db/client.js";
import {
  coachingRelationships,
  mealTimeOverrides,
} from "../db/schema.js";
import { nowIso } from "../lib/crypto.js";
import { fail, ok } from "../lib/envelope.js";
import { listMergedMealTimeSlots } from "../domain/meal-time-slots.js";
import { applyMealTimeOverrideUpdate } from "../domain/meal-times-update.js";
import { resolvePushProviderMode } from "../lib/push-provider.js";
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
    const merged = await listMergedMealTimeSlots(db, rel.id);
    return ok(c, mealTimesResponseSchema.parse(merged));
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
    const before = await listMergedMealTimeSlots(db, rel.id);
    const planTimeBySlot = new Map(
      before.slots.map((slot) => [slot.slotKey, slot.planTime]),
    );
    for (const override of parsed.data.overrides) {
      const pattern = (
        override.dayPattern === "weekdays" || override.dayPattern === "weekends"
          ? override.dayPattern
          : "all"
      ) as "all" | "weekdays" | "weekends";
      const planTime = planTimeBySlot.get(override.slotKey);
      if (planTime && override.time === planTime && pattern === "all") {
        await db
          .delete(mealTimeOverrides)
          .where(
            and(
              eq(mealTimeOverrides.relationshipId, rel.id),
              eq(mealTimeOverrides.slotKey, override.slotKey),
              eq(mealTimeOverrides.dayPattern, pattern),
            ),
          );
        continue;
      }
      await db
        .insert(mealTimeOverrides)
        .values({
          relationshipId: rel.id,
          slotKey: override.slotKey,
          dayPattern: pattern,
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
    await applyMealTimeOverrideUpdate(
      db,
      {
        relationshipId: rel.id,
        trainerUserId: rel.trainerUserId,
        now,
      },
      {
        pushProviderMode: resolvePushProviderMode(c.env.PUSH_PROVIDER_MODE),
        expoAccessToken: c.env.EXPO_ACCESS_TOKEN,
      },
    );
    const merged = await listMergedMealTimeSlots(db, rel.id);
    return ok(c, mealTimesResponseSchema.parse(merged));
  },
);
