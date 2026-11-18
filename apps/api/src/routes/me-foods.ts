import { and, desc, eq, gt, inArray, isNotNull, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import {
  traineeFoodDetailSchema,
  traineeFoodIndexResponseSchema,
  traineeFoodSearchResponseSchema,
  type TraineeFoodSearchResponse,
} from "@fitbud/contracts";
import { createDb } from "../db/client.js";
import {
  coachingRelationships,
  foodLibraryItems,
  foodLibraryServings,
  mealCompliance,
  traineeCustomFoods,
} from "../db/schema.js";
import { servingsByFoodId } from "../domain/library-servings.js";
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

type LibraryRow = typeof foodLibraryItems.$inferSelect;
type ServingRow = typeof foodLibraryServings.$inferSelect;
type CustomRow = typeof traineeCustomFoods.$inferSelect;
type SearchItem = TraineeFoodSearchResponse["items"][number];

/** How many of the trainee's own foods lead a search, and Recent's length. */
const MAX_OWN_IN_SEARCH = 5;
const RECENT_LIMIT = 20;

/** Nutrients for one serving of a per-100 g (or ml) food, scaled ×1,000,000. */
function perServing(
  scaled: number | null,
  conversionScaled: number | null | undefined,
): number | null {
  if (scaled == null) return null;
  return Math.round((scaled * (conversionScaled ?? 100_000_000)) / 100_000_000);
}

function librarySearchItem(row: LibraryRow, servings: ServingRow[]): SearchItem {
  const mapped = mapFoodLibraryItem(row, servings);
  const defaultId =
    row.defaultServingId ??
    servings.find((s) => s.isDefault)?.id ??
    servings[0]?.id ??
    null;
  const serving = servings.find((s) => s.id === defaultId) ?? null;
  return {
    id: mapped.id,
    name: mapped.name,
    energyKcalScaled: mapped.energyKcalScaled ?? null,
    defaultServingId: defaultId,
    source: "library",
    serving: serving
      ? {
          label: serving.label,
          kcalScaled: perServing(row.energyKcalScaled, serving.conversionScaled),
          proteinScaled: perServing(row.proteinScaled, serving.conversionScaled),
          carbsScaled: perServing(row.carbsScaled, serving.conversionScaled),
          fatScaled: perServing(row.fatScaled, serving.conversionScaled),
        }
      : null,
  };
}

function customSearchItem(row: CustomRow): SearchItem {
  return {
    id: row.id,
    name: row.name,
    energyKcalScaled: row.kcalScaled,
    defaultServingId: null,
    source: "custom",
    serving: {
      label: row.servingLabel,
      kcalScaled: row.kcalScaled,
      proteinScaled: row.proteinScaled ?? null,
      carbsScaled: row.carbsScaled ?? null,
      fatScaled: row.fatScaled ?? null,
    },
  };
}

/**
 * The trainee's own foods, newest first, one per name (D-W12-24): saving
 * "Ragi dosa" twice shows it once. Scoped to the signed-in trainee only.
 */
async function ownCustomFoods(
  db: ReturnType<typeof createDb>,
  traineeUserId: string,
  q: string | null,
  limit: number,
): Promise<CustomRow[]> {
  const rows = await db
    .select()
    .from(traineeCustomFoods)
    .where(
      and(
        eq(traineeCustomFoods.traineeUserId, traineeUserId),
        q ? sql`lower(${traineeCustomFoods.name}) like ${`%${q.toLowerCase()}%`}` : undefined,
      ),
    )
    .orderBy(desc(traineeCustomFoods.createdAt))
    .limit(limit * 4);
  const seen = new Set<string>();
  const out: CustomRow[] = [];
  for (const row of rows) {
    const key = row.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

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

/** Global foods, plus the active coach's own when there is one. */
function visibleFoodsFilter(trainerId: string | null) {
  return trainerId
    ? or(
        eq(foodLibraryItems.ownership, "global"),
        and(
          eq(foodLibraryItems.ownership, "trainer"),
          eq(foodLibraryItems.trainerUserId, trainerId),
        ),
      )
    : eq(foodLibraryItems.ownership, "global");
}

meFoodRoutes.get(
  "/search",
  operation({
    tag: "TraineeFoods",
    summary: "Search foods visible to trainee",
    description:
      "Global foods plus active trainer-owned foods, led by the trainee's own saved foods that match.",
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
    const servingsMap = await servingsByFoodId(
      db,
      rows.slice(0, limit).map((row) => row.id),
    );
    const page = buildPage(
      rows.map((row) => librarySearchItem(row, servingsMap.get(row.id) ?? [])),
      limit,
      (item) => item.name,
    );
    // The trainee's own foods lead the results (D-W12-24); `nextCursor`
    // still describes the library rows alone.
    const own =
      q.length >= 2
        ? (await ownCustomFoods(db, actor.userId, q, MAX_OWN_IN_SEARCH)).map(
            customSearchItem,
          )
        : [];
    return ok(
      c,
      traineeFoodSearchResponseSchema.parse({
        ...page,
        items: [...own, ...page.items],
      }),
    );
  },
);

meFoodRoutes.get(
  "/recent",
  operation({
    tag: "TraineeFoods",
    summary: "Recent foods for trainee",
    description:
      "The trainee's own saved foods and library foods from their recent logs, newest first, each with its default serving.",
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
    const custom = await ownCustomFoods(db, actor.userId, null, RECENT_LIMIT);
    const compliance = await db
      .select({
        itemsJson: mealCompliance.itemsJson,
        loggedAt: mealCompliance.loggedAt,
      })
      .from(mealCompliance)
      .where(
        and(
          eq(mealCompliance.traineeUserId, actor.userId),
          isNotNull(mealCompliance.itemsJson),
        ),
      )
      .orderBy(desc(mealCompliance.loggedAt))
      .limit(RECENT_LIMIT);
    // Library foods from the trainee's own recent logs, newest first.
    const loggedFoods: Array<{ foodId: string; at: string }> = [];
    const seenFoods = new Set<string>();
    for (const row of compliance) {
      let lines: unknown;
      try {
        lines = JSON.parse(row.itemsJson ?? "[]");
      } catch {
        continue;
      }
      if (!Array.isArray(lines)) continue;
      for (const line of lines as Array<{ foodId?: unknown }>) {
        if (typeof line?.foodId !== "string" || seenFoods.has(line.foodId)) continue;
        seenFoods.add(line.foodId);
        loggedFoods.push({ foodId: line.foodId, at: row.loggedAt });
      }
    }
    // A food must still be visible to this trainee (global or their active
    // coach's) and active to come back in Recent.
    const trainerId = await activeTrainerId(db, actor.userId);
    const foodIds = loggedFoods.slice(0, RECENT_LIMIT).map((row) => row.foodId);
    const libraryRows =
      foodIds.length > 0
        ? await db
            .select()
            .from(foodLibraryItems)
            .where(
              and(
                inArray(foodLibraryItems.id, foodIds),
                visibleFoodsFilter(trainerId),
                eq(foodLibraryItems.status, "active"),
              ),
            )
        : [];
    const libraryById = new Map(libraryRows.map((row) => [row.id, row]));
    const servingsMap = await servingsByFoodId(db, [...libraryById.keys()]);
    const dated: Array<{ at: string; item: SearchItem }> = [
      ...custom.map((row) => ({ at: row.createdAt, item: customSearchItem(row) })),
      ...loggedFoods.flatMap(({ foodId, at }) => {
        const row = libraryById.get(foodId);
        return row
          ? [{ at, item: librarySearchItem(row, servingsMap.get(row.id) ?? []) }]
          : [];
      }),
    ];
    dated.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return ok(
      c,
      traineeFoodSearchResponseSchema.parse({
        items: dated.slice(0, RECENT_LIMIT).map((row) => row.item),
        nextCursor: null,
      }),
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
          defaultServingId: row.defaultServingId,
        })),
      }),
    );
  },
);

meFoodRoutes.get(
  "/:foodId",
  operation({
    tag: "TraineeFoods",
    summary: "Food detail with servings",
    description:
      "Read-only food detail for trainee substitution search (v2 serving presets).",
    roles: ["trainee"],
    response: traineeFoodDetailSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const foodId = c.req.param("foodId");
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
    const [row] = await db
      .select()
      .from(foodLibraryItems)
      .where(
        and(
          eq(foodLibraryItems.id, foodId),
          ownershipFilter!,
          eq(foodLibraryItems.status, "active"),
        ),
      )
      .limit(1);
    if (!row) {
      return fail(c, 404, "FOOD_NOT_FOUND", "Food not found.");
    }
    const servingsMap = await servingsByFoodId(db, [row.id]);
    const servings = servingsMap.get(row.id) ?? [];
    const mapped = mapFoodLibraryItem(row, servings);
    const defaultServingId =
      row.defaultServingId ??
      servings.find((s) => s.isDefault)?.id ??
      servings[0]?.id ??
      null;
    return ok(
      c,
      traineeFoodDetailSchema.parse({
        id: mapped.id,
        name: mapped.name,
        energyKcalScaled: mapped.energyKcalScaled,
        proteinScaled: mapped.proteinScaled,
        carbsScaled: mapped.carbsScaled,
        fatScaled: mapped.fatScaled,
        defaultServingId,
        servings: servings.map((serving) => ({
          id: serving.id,
          label: serving.label,
          unit: serving.unit,
          conversionScaled: serving.conversionScaled,
          isDefault: serving.isDefault,
        })),
      }),
    );
  },
);
