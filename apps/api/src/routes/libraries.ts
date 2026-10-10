import {
  operation,
  cursorParameter,
  limitParameter,
} from "../openapi/document";
import { and, asc, eq, gt, inArray, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import {
  createExerciseLibraryItemRequestSchema,
  createFoodLibraryItemRequestSchema,
  exerciseDifficultySchema,
  exerciseLibraryItemSchema,
  exerciseLibraryListResponseSchema,
  foodLibraryItemSchema,
  foodLibraryListResponseSchema,
  scaleDecimal,
  updateExerciseLibraryItemRequestSchema,
  updateFoodLibraryItemRequestSchema,
} from "@fitbud/contracts";
import { createDb, type Db } from "../db/client";
import {
  exerciseLibraryItems,
  foodLibraryItems,
  foodLibraryServings,
} from "../db/schema";
import {
  mapExerciseLibraryItem,
  mapFoodLibraryItem,
} from "../domain/mappers";
import { createId, nowIso } from "../lib/crypto";
import { buildPage, decodeCursor } from "../lib/cursor";
import { fail, ok } from "../lib/envelope";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth";
import type { Env, Variables } from "../types";

export const libraryRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function nameContains(column: AnyColumn, q: string): SQL {
  return sql`${column} like ${likeContains(q)} escape '\\'`;
}

function jsonListContains(column: AnyColumn, value: string): SQL {
  return sql`exists (select 1 from json_each(${column}) where json_each.value = ${value})`;
}

function scaledOrNull(value: number | null | undefined): number | null {
  if (value == null) return null;
  return scaleDecimal(value);
}

async function servingsByFoodId(db: Db, foodIds: string[]) {
  const grouped = new Map<string, (typeof foodLibraryServings.$inferSelect)[]>();
  if (foodIds.length === 0) return grouped;
  const rows = await db
    .select()
    .from(foodLibraryServings)
    .where(inArray(foodLibraryServings.foodLibraryItemId, foodIds))
    .orderBy(asc(foodLibraryServings.label), asc(foodLibraryServings.id));
  for (const row of rows) {
    const current = grouped.get(row.foodLibraryItemId) ?? [];
    current.push(row);
    grouped.set(row.foodLibraryItemId, current);
  }
  return grouped;
}

async function insertServings(
  db: Db,
  foodId: string,
  servings: { label: string; unit: string; conversion: number }[],
  now: string,
) {
  for (const serving of servings) {
    await db.insert(foodLibraryServings).values({
      id: createId(),
      foodLibraryItemId: foodId,
      label: serving.label,
      unit: serving.unit,
      conversionScaled: scaleDecimal(serving.conversion),
      createdAt: now,
      updatedAt: now,
    });
  }
}

libraryRoutes.get(
  "/exercises",
  operation({
    tag: "Libraries",
    summary: "Libraries operation for GET /libraries/exercises.",
    description:
      "Active global and trainer-owned exercises. muscleGroup matches a primary or secondary muscle. Archived rows are omitted.",
    roles: ["trainer"],
    parameters: [
      limitParameter({ defaultValue: 50, maximum: 10 }),
      cursorParameter(),
      {
        name: "q",
        in: "query",
        required: false,
        description: "Case-insensitive exercise name search.",
        schema: { type: "string" },
      },
      {
        name: "muscleGroup",
        in: "query",
        required: false,
        description: "Exact match against a primary or secondary muscle group.",
        schema: { type: "string" },
      },
      {
        name: "primaryMuscle",
        in: "query",
        required: false,
        description: "Exact match against a primary muscle group.",
        schema: { type: "string" },
      },
      {
        name: "secondaryMuscle",
        in: "query",
        required: false,
        description: "Exact match against a secondary muscle group.",
        schema: { type: "string" },
      },
      {
        name: "equipment",
        in: "query",
        required: false,
        description: "Exact match against one stored equipment label.",
        schema: { type: "string" },
      },
      {
        name: "difficulty",
        in: "query",
        required: false,
        description: "Exact difficulty: beginner, intermediate, or advanced.",
        schema: {
          type: "string",
          enum: ["beginner", "intermediate", "advanced"],
        },
      },
    ],
    response: exerciseLibraryListResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const limitParam = c.req.query("limit");
    const limit = Math.min(
      Math.max(Number.parseInt(limitParam ?? "50", 10) || 50, 1),
      100,
    );
    const cursorParam = c.req.query("cursor");
    const cursor = cursorParam ? decodeCursor(cursorParam) : null;
    const q = c.req.query("q")?.trim();
    const muscleGroup = c.req.query("muscleGroup")?.trim();
    const primaryMuscle = c.req.query("primaryMuscle")?.trim();
    const secondaryMuscle = c.req.query("secondaryMuscle")?.trim();
    const equipment = c.req.query("equipment")?.trim();
    const difficultyParam = c.req.query("difficulty")?.trim();
    const difficulty = difficultyParam
      ? exerciseDifficultySchema.safeParse(difficultyParam)
      : null;
    if (difficulty && !difficulty.success) {
      return fail(
        c,
        400,
        "INVALID_REQUEST",
        "Exercise difficulty must be beginner, intermediate, or advanced.",
      );
    }
    const db = createDb(c.env.DB);
    const eitherMuscle = muscleGroup
      ? or(
          jsonListContains(exerciseLibraryItems.primaryMusclesJson, muscleGroup),
          jsonListContains(
            exerciseLibraryItems.secondaryMusclesJson,
            muscleGroup,
          ),
        )
      : undefined;

    const ownershipFilter = or(
      eq(exerciseLibraryItems.ownership, "global"),
      and(
        eq(exerciseLibraryItems.ownership, "trainer"),
        eq(exerciseLibraryItems.trainerUserId, actor.userId),
      ),
    );
    const filters = [
      ownershipFilter,
      eq(exerciseLibraryItems.status, "active"),
      q ? nameContains(exerciseLibraryItems.name, q) : undefined,
      eitherMuscle,
      primaryMuscle
        ? jsonListContains(exerciseLibraryItems.primaryMusclesJson, primaryMuscle)
        : undefined,
      secondaryMuscle
        ? jsonListContains(
            exerciseLibraryItems.secondaryMusclesJson,
            secondaryMuscle,
          )
        : undefined,
      equipment
        ? jsonListContains(exerciseLibraryItems.equipmentJson, equipment)
        : undefined,
      difficulty?.success
        ? eq(exerciseLibraryItems.difficulty, difficulty.data)
        : undefined,
      cursor
        ? or(
            gt(exerciseLibraryItems.name, cursor.k),
            and(
              eq(exerciseLibraryItems.name, cursor.k),
              gt(exerciseLibraryItems.id, cursor.id),
            ),
          )
        : undefined,
    ].filter((filter): filter is SQL => Boolean(filter));

    const rows = await db
      .select()
      .from(exerciseLibraryItems)
      .where(and(...filters))
      .orderBy(exerciseLibraryItems.name, exerciseLibraryItems.id)
      .limit(limit + 1);

    const page = buildPage(
      rows.map((row) => mapExerciseLibraryItem(row)),
      limit,
      (item) => item.name,
    );
    return ok(c, exerciseLibraryListResponseSchema.parse(page));
  },
);

libraryRoutes.post(
  "/exercises",
  operation({
    tag: "Libraries",
    summary: "Libraries operation for POST /libraries/exercises.",
    description:
      "Creates an independent trainer-owned exercise. Prescription targets are not stored.",
    roles: ["trainer"],
    body: createExerciseLibraryItemRequestSchema,
    successStatus: [201],
    response: exerciseLibraryItemSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = createExerciseLibraryItemRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        c,
        400,
        "INVALID_REQUEST",
        "Invalid create exercise library item request.",
        { issues: parsed.error.issues },
      );
    }

    const now = nowIso();
    const id = createId();
    const db = createDb(c.env.DB);
    await db.insert(exerciseLibraryItems).values({
      id,
      ownership: "trainer",
      trainerUserId: actor.userId,
      name: parsed.data.name,
      instructions: parsed.data.instructions ?? null,
      primaryMusclesJson: JSON.stringify(parsed.data.primaryMuscles ?? []),
      secondaryMusclesJson: JSON.stringify(parsed.data.secondaryMuscles ?? []),
      equipmentJson: JSON.stringify(parsed.data.equipment ?? []),
      difficulty: parsed.data.difficulty ?? null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const [row] = await db
      .select()
      .from(exerciseLibraryItems)
      .where(eq(exerciseLibraryItems.id, id))
      .limit(1);
    if (!row) {
      return fail(
        c,
        500,
        "EXERCISE_LIBRARY_PERSIST_FAILED",
        "Exercise library item could not be loaded.",
      );
    }
    return ok(c, exerciseLibraryItemSchema.parse(mapExerciseLibraryItem(row)), 201);
  },
);

libraryRoutes.put(
  "/exercises/:itemId",
  operation({
    tag: "Libraries",
    summary: "Libraries operation for PUT /libraries/exercises/:itemId.",
    description: "Updates a trainer-owned exercise. Global rows stay immutable.",
    roles: ["trainer"],
    body: updateExerciseLibraryItemRequestSchema,
    response: exerciseLibraryItemSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = updateExerciseLibraryItemRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        c,
        400,
        "INVALID_REQUEST",
        "Invalid update exercise library item request.",
        { issues: parsed.error.issues },
      );
    }

    const itemId = c.req.param("itemId");
    const db = createDb(c.env.DB);
    const rows = await db
      .select()
      .from(exerciseLibraryItems)
      .where(eq(exerciseLibraryItems.id, itemId))
      .limit(1);
    const row = rows[0];
    if (
      !row ||
      row.ownership !== "trainer" ||
      row.trainerUserId !== actor.userId
    ) {
      return fail(
        c,
        404,
        "EXERCISE_LIBRARY_ITEM_NOT_FOUND",
        "Exercise library item not found.",
      );
    }

    await db
      .update(exerciseLibraryItems)
      .set({
        name: parsed.data.name,
        instructions: parsed.data.instructions ?? null,
        primaryMusclesJson: JSON.stringify(parsed.data.primaryMuscles ?? []),
        secondaryMusclesJson: JSON.stringify(parsed.data.secondaryMuscles ?? []),
        equipmentJson: JSON.stringify(parsed.data.equipment ?? []),
        difficulty: parsed.data.difficulty ?? null,
        updatedAt: nowIso(),
      })
      .where(eq(exerciseLibraryItems.id, itemId));

    const [updated] = await db
      .select()
      .from(exerciseLibraryItems)
      .where(eq(exerciseLibraryItems.id, itemId))
      .limit(1);
    if (!updated) {
      return fail(
        c,
        500,
        "EXERCISE_LIBRARY_PERSIST_FAILED",
        "Exercise library item could not be loaded.",
      );
    }
    return ok(
      c,
      exerciseLibraryItemSchema.parse(mapExerciseLibraryItem(updated)),
    );
  },
);

libraryRoutes.delete(
  "/exercises/:itemId",
  operation({
    tag: "Libraries",
    summary: "Libraries operation for DELETE /libraries/exercises/:itemId.",
    description:
      "Archives a trainer-owned exercise. Existing plan and template snapshots stay.",
    roles: ["trainer"],
    response: exerciseLibraryItemSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const itemId = c.req.param("itemId");
    const db = createDb(c.env.DB);
    const rows = await db
      .select()
      .from(exerciseLibraryItems)
      .where(eq(exerciseLibraryItems.id, itemId))
      .limit(1);
    const row = rows[0];
    if (
      !row ||
      row.ownership !== "trainer" ||
      row.trainerUserId !== actor.userId
    ) {
      return fail(
        c,
        404,
        "EXERCISE_LIBRARY_ITEM_NOT_FOUND",
        "Exercise library item not found.",
      );
    }

    await db
      .update(exerciseLibraryItems)
      .set({ status: "archived", updatedAt: nowIso() })
      .where(eq(exerciseLibraryItems.id, itemId));
    const [updated] = await db
      .select()
      .from(exerciseLibraryItems)
      .where(eq(exerciseLibraryItems.id, itemId))
      .limit(1);
    if (!updated) {
      return fail(
        c,
        500,
        "EXERCISE_LIBRARY_PERSIST_FAILED",
        "Exercise library item could not be loaded.",
      );
    }
    return ok(c, exerciseLibraryItemSchema.parse(mapExerciseLibraryItem(updated)));
  },
);

libraryRoutes.get(
  "/foods",
  operation({
    tag: "Libraries",
    summary: "Libraries operation for GET /libraries/foods.",
    description:
      "Active global and trainer-owned foods with their servings. Archived rows are omitted.",
    roles: ["trainer"],
    parameters: [
      limitParameter({ defaultValue: 50, maximum: 10 }),
      cursorParameter(),
      {
        name: "q",
        in: "query",
        required: false,
        description: "Case-insensitive food name search.",
        schema: { type: "string" },
      },
    ],
    response: foodLibraryListResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const limitParam = c.req.query("limit");
    const limit = Math.min(
      Math.max(Number.parseInt(limitParam ?? "50", 10) || 50, 1),
      100,
    );
    const cursorParam = c.req.query("cursor");
    const cursor = cursorParam ? decodeCursor(cursorParam) : null;
    const q = c.req.query("q")?.trim();
    const db = createDb(c.env.DB);

    const ownershipFilter = or(
      eq(foodLibraryItems.ownership, "global"),
      and(
        eq(foodLibraryItems.ownership, "trainer"),
        eq(foodLibraryItems.trainerUserId, actor.userId),
      ),
    );
    const filters = [
      ownershipFilter,
      eq(foodLibraryItems.status, "active"),
      q ? nameContains(foodLibraryItems.name, q) : undefined,
      cursor
        ? or(
            gt(foodLibraryItems.name, cursor.k),
            and(
              eq(foodLibraryItems.name, cursor.k),
              gt(foodLibraryItems.id, cursor.id),
            ),
          )
        : undefined,
    ].filter((filter): filter is SQL => Boolean(filter));

    const rows = await db
      .select()
      .from(foodLibraryItems)
      .where(and(...filters))
      .orderBy(foodLibraryItems.name, foodLibraryItems.id)
      .limit(limit + 1);
    const servings = await servingsByFoodId(
      db,
      rows.map((row) => row.id),
    );

    const page = buildPage(
      rows.map((row) => mapFoodLibraryItem(row, servings.get(row.id) ?? [])),
      limit,
      (item) => item.name,
    );
    return ok(c, foodLibraryListResponseSchema.parse(page));
  },
);

libraryRoutes.post(
  "/foods",
  operation({
    tag: "Libraries",
    summary: "Libraries operation for POST /libraries/foods.",
    description:
      "Creates a trainer-owned food with a classification, canonical basis, and at least one serving.",
    roles: ["trainer"],
    body: createFoodLibraryItemRequestSchema,
    successStatus: [201],
    response: foodLibraryItemSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = createFoodLibraryItemRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        c,
        400,
        "INVALID_REQUEST",
        "Invalid create food library item request.",
        { issues: parsed.error.issues },
      );
    }

    const now = nowIso();
    const id = createId();
    const db = createDb(c.env.DB);
    await db.insert(foodLibraryItems).values({
      id,
      ownership: "trainer",
      trainerUserId: actor.userId,
      name: parsed.data.name,
      cuisineRegion: "indian",
      classification: parsed.data.classification,
      nutritionBasis: parsed.data.basis,
      energyKcalScaled: scaledOrNull(parsed.data.energyKcal),
      proteinScaled: scaledOrNull(parsed.data.proteinGrams),
      carbsScaled: scaledOrNull(parsed.data.carbsGrams),
      fatScaled: scaledOrNull(parsed.data.fatGrams),
      notes: parsed.data.notes ?? null,
      description: parsed.data.description ?? null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await insertServings(db, id, parsed.data.servings, now);

    const [row] = await db
      .select()
      .from(foodLibraryItems)
      .where(eq(foodLibraryItems.id, id))
      .limit(1);
    if (!row) {
      return fail(
        c,
        500,
        "FOOD_LIBRARY_PERSIST_FAILED",
        "Food library item could not be loaded.",
      );
    }
    const servings = await servingsByFoodId(db, [id]);
    return ok(
      c,
      foodLibraryItemSchema.parse(mapFoodLibraryItem(row, servings.get(id) ?? [])),
      201,
    );
  },
);

libraryRoutes.put(
  "/foods/:itemId",
  operation({
    tag: "Libraries",
    summary: "Libraries operation for PUT /libraries/foods/:itemId.",
    description:
      "Replaces a trainer-owned food definition. Saved plan snapshots are not rewritten.",
    roles: ["trainer"],
    body: updateFoodLibraryItemRequestSchema,
    response: foodLibraryItemSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = updateFoodLibraryItemRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        c,
        400,
        "INVALID_REQUEST",
        "Invalid update food library item request.",
        { issues: parsed.error.issues },
      );
    }

    const itemId = c.req.param("itemId");
    const db = createDb(c.env.DB);
    const rows = await db
      .select()
      .from(foodLibraryItems)
      .where(eq(foodLibraryItems.id, itemId))
      .limit(1);
    const row = rows[0];
    if (
      !row ||
      row.ownership !== "trainer" ||
      row.trainerUserId !== actor.userId
    ) {
      return fail(
        c,
        404,
        "FOOD_LIBRARY_ITEM_NOT_FOUND",
        "Food library item not found.",
      );
    }

    const now = nowIso();
    await db
      .update(foodLibraryItems)
      .set({
        name: parsed.data.name,
        classification: parsed.data.classification,
        nutritionBasis: parsed.data.basis,
        energyKcalScaled: scaledOrNull(parsed.data.energyKcal),
        proteinScaled: scaledOrNull(parsed.data.proteinGrams),
        carbsScaled: scaledOrNull(parsed.data.carbsGrams),
        fatScaled: scaledOrNull(parsed.data.fatGrams),
        notes: parsed.data.notes ?? null,
        description: parsed.data.description ?? null,
        updatedAt: now,
      })
      .where(eq(foodLibraryItems.id, itemId));
    await db
      .delete(foodLibraryServings)
      .where(eq(foodLibraryServings.foodLibraryItemId, itemId));
    await insertServings(db, itemId, parsed.data.servings, now);

    const [updated] = await db
      .select()
      .from(foodLibraryItems)
      .where(eq(foodLibraryItems.id, itemId))
      .limit(1);
    if (!updated) {
      return fail(
        c,
        500,
        "FOOD_LIBRARY_PERSIST_FAILED",
        "Food library item could not be loaded.",
      );
    }
    const servings = await servingsByFoodId(db, [itemId]);
    return ok(
      c,
      foodLibraryItemSchema.parse(
        mapFoodLibraryItem(updated, servings.get(itemId) ?? []),
      ),
    );
  },
);

libraryRoutes.delete(
  "/foods/:itemId",
  operation({
    tag: "Libraries",
    summary: "Libraries operation for DELETE /libraries/foods/:itemId.",
    description:
      "Archives a trainer-owned food. Existing plan and template snapshots stay.",
    roles: ["trainer"],
    response: foodLibraryItemSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const itemId = c.req.param("itemId");
    const db = createDb(c.env.DB);
    const rows = await db
      .select()
      .from(foodLibraryItems)
      .where(eq(foodLibraryItems.id, itemId))
      .limit(1);
    const row = rows[0];
    if (
      !row ||
      row.ownership !== "trainer" ||
      row.trainerUserId !== actor.userId
    ) {
      return fail(
        c,
        404,
        "FOOD_LIBRARY_ITEM_NOT_FOUND",
        "Food library item not found.",
      );
    }

    await db
      .update(foodLibraryItems)
      .set({ status: "archived", updatedAt: nowIso() })
      .where(eq(foodLibraryItems.id, itemId));
    const [updated] = await db
      .select()
      .from(foodLibraryItems)
      .where(eq(foodLibraryItems.id, itemId))
      .limit(1);
    if (!updated) {
      return fail(
        c,
        500,
        "FOOD_LIBRARY_PERSIST_FAILED",
        "Food library item could not be loaded.",
      );
    }
    const servings = await servingsByFoodId(db, [itemId]);
    return ok(
      c,
      foodLibraryItemSchema.parse(
        mapFoodLibraryItem(updated, servings.get(itemId) ?? []),
      ),
    );
  },
);
