import { and, eq, gt, or } from "drizzle-orm";
import { Hono } from "hono";
import {
  createExerciseLibraryItemRequestSchema,
  createFoodLibraryItemRequestSchema,
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

libraryRoutes.get(
  "/exercises",
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
    const db = createDb(c.env.DB);

    const ownershipFilter = or(
      eq(exerciseLibraryItems.ownership, "global"),
      and(
        eq(exerciseLibraryItems.ownership, "trainer"),
        eq(exerciseLibraryItems.trainerUserId, actor.userId),
      ),
    );

    const rows = await db
      .select()
      .from(exerciseLibraryItems)
      .where(
        cursor
          ? and(
              ownershipFilter,
              or(
                gt(exerciseLibraryItems.name, cursor.k),
                and(
                  eq(exerciseLibraryItems.name, cursor.k),
                  gt(exerciseLibraryItems.id, cursor.id),
                ),
              ),
            )
          : ownershipFilter,
      )
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
    const db = createDb(c.env.DB);

    const ownershipFilter = or(
      eq(foodLibraryItems.ownership, "global"),
      and(
        eq(foodLibraryItems.ownership, "trainer"),
        eq(foodLibraryItems.trainerUserId, actor.userId),
      ),
    );

    const rows = await db
      .select()
      .from(foodLibraryItems)
      .where(
        cursor
          ? and(
              ownershipFilter,
              or(
                gt(foodLibraryItems.name, cursor.k),
                and(
                  eq(foodLibraryItems.name, cursor.k),
                  gt(foodLibraryItems.id, cursor.id),
                ),
              ),
            )
          : ownershipFilter,
      )
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
