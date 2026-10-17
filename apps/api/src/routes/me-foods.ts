import { and, desc, eq, gt, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import {
  traineeFoodIndexResponseSchema,
  traineeFoodSearchResponseSchema,
} from "@fitbud/contracts";
import { createDb } from "../db/client.js";
import {
  coachingRelationships,
  foodLibraryItems,
  mealCompliance,
  traineeCustomFoods,
} from "../db/schema.js";
import { buildFtsPrefixQuery, foodFtsMatchClause } from "../domain/library-search.js";
import { mapFoodLibraryItem } from "../domain/mappers.js";
import { buildPage } from "../lib/cursor.js";
import { fail, ok } from "../lib/envelope.js";
import { operation } from "../openapi/document.js";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const meFoodRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

async function activeTrainerId(
  db: ReturnType<typeof createDb>,
  traineeUserId: string,
): Promise<string | null> {
  const [rel] = await db
    .select()
    .from(coachingRelationships)
    .where(
      and(
        eq(coachingRelationships.traineeUserId, traineeUserId),
        eq(coachingRelationships.status, "active"),
      ),
    )
    .orderBy(desc(coachingRelationships.startedAt))
    .limit(1);
  return rel?.trainerUserId ?? null;
}

meFoodRoutes.get(
  "/search",
  operation({
    tag: "TraineeFoods",
    summary: "Search foods visible to trainee",
    description: "Global foods plus active trainer-owned foods.",
    roles: ["trainee"],
    response: traineeFoodSearchResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const q = c.req.query("q")?.trim() ?? "";
    const limit = Math.min(Number(c.req.query("limit") ?? "20") || 20, 50);
    const db = createDb(c.env.DB);
    const trainerId = await activeTrainerId(db, actor.userId);
    const ownershipFilter = trainerId
      ? or(
          eq(foodLibraryItems.ownership, "global"),
          and(
            eq(foodLibraryItems.ownership, "trainer"),
            eq(foodLibraryItems.trainerUserId, trainerId),
          ),
        )
      : eq(foodLibraryItems.ownership, "global");
    const ftsQuery = q.length >= 2 ? buildFtsPrefixQuery(q) : null;
    const filters = [
      ownershipFilter,
      eq(foodLibraryItems.status, "active"),
      ftsQuery ? foodFtsMatchClause(ftsQuery) : undefined,
    ].filter(Boolean);
    let rows = ftsQuery
      ? await db
          .select({ item: foodLibraryItems })
          .from(foodLibraryItems)
          .innerJoin(
            sql`food_search_fts`,
            sql`food_search_fts.food_id = ${foodLibraryItems.id}`,
          )
          .where(and(...(filters as Parameters<typeof and>)))
          .orderBy(sql`bm25(food_search_fts, 0, 10, 4, 1)`)
          .limit(limit + 1)
          .then((joined) => joined.map((row) => row.item))
      : await db
          .select()
          .from(foodLibraryItems)
          .where(and(ownershipFilter!, eq(foodLibraryItems.status, "active")))
          .orderBy(foodLibraryItems.name)
          .limit(limit + 1);
    if (ftsQuery && rows.length === 0 && q) {
      rows = await db
        .select()
        .from(foodLibraryItems)
        .where(
          and(
            ownershipFilter!,
            eq(foodLibraryItems.status, "active"),
            sql`${foodLibraryItems.name} like ${`%${q}%`}`,
          ),
        )
        .orderBy(foodLibraryItems.name)
        .limit(limit + 1);
    }
    const page = buildPage(
      rows.map((row) => {
        const mapped = mapFoodLibraryItem(row, []);
        return {
          id: mapped.id,
          name: mapped.name,
          energyKcalScaled: mapped.energyKcalScaled ?? null,
          defaultServingId: mapped.servings[0]?.id ?? null,
        };
      }),
      limit,
      (item) => item.name,
    );
    return ok(c, traineeFoodSearchResponseSchema.parse(page));
  },
);

meFoodRoutes.get(
  "/recent",
  operation({
    tag: "TraineeFoods",
    summary: "Recent foods for trainee",
    description: "Recently logged foods for the trainee.",
    roles: ["trainee"],
    response: traineeFoodSearchResponseSchema,
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
    const custom = await db
      .select()
      .from(traineeCustomFoods)
      .where(eq(traineeCustomFoods.traineeUserId, actor.userId))
      .orderBy(desc(traineeCustomFoods.createdAt))
      .limit(20);
    const compliance = await db
      .select()
      .from(mealCompliance)
      .where(eq(mealCompliance.traineeUserId, actor.userId))
      .orderBy(desc(mealCompliance.loggedAt))
      .limit(20);
    const names = new Map<string, { id: string; name: string }>();
    for (const row of custom) {
      names.set(row.id, { id: row.id, name: row.name });
    }
    for (const row of compliance) {
      if (!row.itemsJson) continue;
      try {
        const items = JSON.parse(row.itemsJson) as Array<{ foodId?: string; name?: string }>;
        for (const item of items) {
          if (item.foodId && item.name) {
            names.set(item.foodId, { id: item.foodId, name: item.name });
          }
        }
      } catch {
        /* ignore */
      }
    }
    const items = [...names.values()].slice(0, 20).map((item) => ({
      id: item.id,
      name: item.name,
      energyKcalScaled: null,
      defaultServingId: null,
    }));
    return ok(
      c,
      traineeFoodSearchResponseSchema.parse({ items, nextCursor: null }),
    );
  },
);

meFoodRoutes.get(
  "/index",
  operation({
    tag: "TraineeFoods",
    summary: "Food index delta",
    description: "Delta index for offline food search.",
    roles: ["trainee"],
    response: traineeFoodIndexResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const since = c.req.query("since")?.trim();
    const db = createDb(c.env.DB);
    const trainerId = await activeTrainerId(db, actor.userId);
    const ownershipFilter = trainerId
      ? or(
          eq(foodLibraryItems.ownership, "global"),
          and(
            eq(foodLibraryItems.ownership, "trainer"),
            eq(foodLibraryItems.trainerUserId, trainerId),
          ),
        )
      : eq(foodLibraryItems.ownership, "global");
    const rows = await db
      .select()
      .from(foodLibraryItems)
      .where(
        and(
          ownershipFilter!,
          eq(foodLibraryItems.status, "active"),
          since ? gt(foodLibraryItems.updatedAt, since) : undefined,
        ),
      )
      .orderBy(foodLibraryItems.updatedAt)
      .limit(500);
    return ok(
      c,
      traineeFoodIndexResponseSchema.parse({
        since: since ?? null,
        items: rows.map((row) => ({
          id: row.id,
          name: row.name,
          updatedAt: row.updatedAt,
          energyKcalScaled: row.energyKcalScaled,
          defaultServingId: null,
        })),
      }),
    );
  },
);
