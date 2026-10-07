import { z } from "zod";
import {
  operation,
  cursorParameter,
  limitParameter,
} from "../openapi/document";
import { and, eq, gt, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import {
  createExerciseLibraryItemRequestSchema,
  createFoodLibraryItemRequestSchema,
  exerciseDifficultySchema,
  exerciseLibraryItemSchema,
  exerciseLibraryListResponseSchema,
  foodLibraryItemSchema,
  foodLibraryListResponseSchema,
  updateExerciseLibraryItemRequestSchema,
  updateFoodLibraryItemRequestSchema,
} from "@fitbud/contracts";
import { createDb } from "../db/client";
import { exerciseLibraryItems, foodLibraryItems } from "../db/schema";
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

libraryRoutes.get(
  "/exercises",
  operation({
    tag: "Libraries",
    summary: "Libraries operation for GET /libraries/exercises.",
    description: "Libraries operation for GET /libraries/exercises.",
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
        description: "Exact match against one stored muscle group.",
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

    const ownershipFilter = or(
      eq(exerciseLibraryItems.ownership, "global"),
      and(
        eq(exerciseLibraryItems.ownership, "trainer"),
        eq(exerciseLibraryItems.trainerUserId, actor.userId),
      ),
    );
    const filters = [
      ownershipFilter,
      q ? nameContains(exerciseLibraryItems.name, q) : undefined,
      muscleGroup
        ? jsonListContains(exerciseLibraryItems.muscleGroupsJson, muscleGroup)
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
    description: "Libraries operation for POST /libraries/exercises.",
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
      defaultLoadLabel: parsed.data.defaultLoadLabel ?? null,
      defaultReps: parsed.data.defaultReps ?? null,
      muscleGroupsJson: JSON.stringify(parsed.data.muscleGroups ?? []),
      equipmentJson: JSON.stringify(parsed.data.equipment ?? []),
      difficulty: parsed.data.difficulty ?? null,
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
    description: "Libraries operation for PUT /libraries/exercises/:itemId.",
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
        defaultLoadLabel: parsed.data.defaultLoadLabel ?? null,
        defaultReps: parsed.data.defaultReps ?? null,
        muscleGroupsJson: JSON.stringify(parsed.data.muscleGroups ?? []),
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
    description: "Libraries operation for DELETE /libraries/exercises/:itemId.",
    roles: ["trainer"],
    response: z.object({ deleted: z.literal(true) }),
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
      .delete(exerciseLibraryItems)
      .where(eq(exerciseLibraryItems.id, itemId));
    return ok(c, { deleted: true });
  },
);

libraryRoutes.get(
  "/foods",
  operation({
    tag: "Libraries",
    summary: "Libraries operation for GET /libraries/foods.",
    description: "Libraries operation for GET /libraries/foods.",
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

    const page = buildPage(
      rows.map((row) => mapFoodLibraryItem(row)),
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
    description: "Libraries operation for POST /libraries/foods.",
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
      portionLabel: parsed.data.portionLabel,
      notes: parsed.data.notes ?? null,
      description: parsed.data.description ?? null,
      calories: parsed.data.calories ?? null,
      proteinGrams: parsed.data.proteinGrams ?? null,
      carbsGrams: parsed.data.carbsGrams ?? null,
      fatGrams: parsed.data.fatGrams ?? null,
      createdAt: now,
      updatedAt: now,
    });

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
    return ok(c, foodLibraryItemSchema.parse(mapFoodLibraryItem(row)), 201);
  },
);

libraryRoutes.put(
  "/foods/:itemId",
  operation({
    tag: "Libraries",
    summary: "Libraries operation for PUT /libraries/foods/:itemId.",
    description: "Libraries operation for PUT /libraries/foods/:itemId.",
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

    await db
      .update(foodLibraryItems)
      .set({
        name: parsed.data.name,
        portionLabel: parsed.data.portionLabel,
        notes: parsed.data.notes ?? null,
        description: parsed.data.description ?? null,
        calories: parsed.data.calories ?? null,
        proteinGrams: parsed.data.proteinGrams ?? null,
        carbsGrams: parsed.data.carbsGrams ?? null,
        fatGrams: parsed.data.fatGrams ?? null,
        updatedAt: nowIso(),
      })
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
    return ok(c, foodLibraryItemSchema.parse(mapFoodLibraryItem(updated)));
  },
);

libraryRoutes.delete(
  "/foods/:itemId",
  operation({
    tag: "Libraries",
    summary: "Libraries operation for DELETE /libraries/foods/:itemId.",
    description: "Libraries operation for DELETE /libraries/foods/:itemId.",
    roles: ["trainer"],
    response: z.object({ deleted: z.literal(true) }),
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

    await db.delete(foodLibraryItems).where(eq(foodLibraryItems.id, itemId));
    return ok(c, { deleted: true });
  },
);
