import { inArray } from "drizzle-orm";
import type { PlanContent } from "@fitbud/contracts";
import {
  LibraryPrescriptionError,
  foodSnapshotFromLibrary,
  librarySourceIds,
  materializePlanContent,
} from "@fitbud/core";
import type { Db } from "../db/client";
import {
  exerciseLibraryItems,
  foodLibraryItems,
  foodLibraryServings,
} from "../db/schema";
import { mapExerciseLibraryItem, mapFoodLibraryItem } from "./mappers";

export type LibrarySnapshotFailure = {
  status: 400 | 404 | 409;
  code: string;
  message: string;
};

function visibleToTrainer(
  ownership: "global" | "trainer",
  trainerUserId: string | null,
  actorUserId: string,
): boolean {
  return ownership === "global" || trainerUserId === actorUserId;
}

/**
 * New library references are copied from the current library row.
 * References already stored on the previous draft stay as saved snapshots.
 */
export async function prepareWritablePlanContent(
  db: Db,
  actorUserId: string,
  content: PlanContent,
  previous?: PlanContent,
): Promise<{ content: PlanContent } | LibrarySnapshotFailure> {
  const previousSources = previous
    ? librarySourceIds(previous)
    : { foodIds: [], exerciseIds: [] };
  const previousFoods = new Set(previousSources.foodIds);
  const previousExercises = new Set(previousSources.exerciseIds);
  const newFoodIds = new Set<string>();
  const newExerciseIds = new Set<string>();

  for (const meal of content.mealPrescriptions) {
    for (const item of meal.items) {
      if (
        item.sourceFoodLibraryItemId &&
        !previousFoods.has(item.sourceFoodLibraryItemId)
      ) {
        newFoodIds.add(item.sourceFoodLibraryItemId);
      }
    }
  }
  for (const day of content.workoutDays) {
    for (const exercise of day.exercises) {
      if (
        exercise.sourceExerciseLibraryItemId &&
        !previousExercises.has(exercise.sourceExerciseLibraryItemId)
      ) {
        newExerciseIds.add(exercise.sourceExerciseLibraryItemId);
      }
    }
  }

  const foodRows =
    newFoodIds.size === 0
      ? []
      : await db
          .select()
          .from(foodLibraryItems)
          .where(inArray(foodLibraryItems.id, [...newFoodIds]));
  const servingRows =
    newFoodIds.size === 0
      ? []
      : await db
          .select()
          .from(foodLibraryServings)
          .where(inArray(foodLibraryServings.foodLibraryItemId, [...newFoodIds]));
  const exerciseRows =
    newExerciseIds.size === 0
      ? []
      : await db
          .select()
          .from(exerciseLibraryItems)
          .where(inArray(exerciseLibraryItems.id, [...newExerciseIds]));

  const foods = new Map(
    foodRows.map((row) => [
      row.id,
      mapFoodLibraryItem(
        row,
        servingRows.filter((serving) => serving.foodLibraryItemId === row.id),
      ),
    ]),
  );
  const exercises = new Map(
    exerciseRows.map((row) => [row.id, mapExerciseLibraryItem(row)]),
  );

  let failure: LibrarySnapshotFailure | null = null;
  const mealPrescriptions = content.mealPrescriptions.map((meal) => ({
    ...meal,
    items: meal.items.map((item) => {
      if (failure) return item;
      const sourceId = item.sourceFoodLibraryItemId;
      if (!sourceId || previousFoods.has(sourceId)) return item;
      const food = foods.get(sourceId);
      if (
        !food ||
        !visibleToTrainer(food.ownership, food.trainerUserId, actorUserId)
      ) {
        failure = {
          status: 404,
          code: "FOOD_LIBRARY_ITEM_NOT_FOUND",
          message: "Food library item not found.",
        };
        return item;
      }
      if (item.snapshotKind !== "calculated" || !item.sourceServingId) {
        failure = {
          status: 400,
          code: "LIBRARY_SERVING_REQUIRED",
          message: "A new food prescription needs a serving and a quantity.",
        };
        return item;
      }
      try {
        return foodSnapshotFromLibrary(
          food,
          item.sourceServingId,
          item.quantityScaled,
        );
      } catch (error) {
        if (error instanceof LibraryPrescriptionError) {
          failure = {
            status: error.code === "LIBRARY_SERVING_NOT_FOUND" ? 400 : 409,
            code: error.code,
            message: error.message,
          };
        } else {
          throw error;
        }
        return item;
      }
    }),
  }));

  const workoutDays = content.workoutDays.map((day) => ({
    ...day,
    exercises: day.exercises.map((exercise) => {
      if (failure) return exercise;
      const sourceId = exercise.sourceExerciseLibraryItemId;
      if (!sourceId || previousExercises.has(sourceId)) return exercise;
      const libraryExercise = exercises.get(sourceId);
      if (
        !libraryExercise ||
        !visibleToTrainer(
          libraryExercise.ownership,
          libraryExercise.trainerUserId,
          actorUserId,
        )
      ) {
        failure = {
          status: 404,
          code: "EXERCISE_LIBRARY_ITEM_NOT_FOUND",
          message: "Exercise library item not found.",
        };
        return exercise;
      }
      if (libraryExercise.status === "archived") {
        failure = {
          status: 409,
          code: "LIBRARY_ITEM_ARCHIVED",
          message: "Archived exercises cannot be added to new content.",
        };
        return exercise;
      }
      return {
        ...exercise,
        name: libraryExercise.name,
        instructions: libraryExercise.instructions,
        primaryMuscles: [...libraryExercise.primaryMuscles],
        secondaryMuscles: [...libraryExercise.secondaryMuscles],
        equipment: [...libraryExercise.equipment],
        difficulty: libraryExercise.difficulty,
        sourceExerciseLibraryItemId: libraryExercise.id,
      };
    }),
  }));

  if (failure) return failure;
  return {
    content: materializePlanContent({
      workoutDays,
      mealPrescriptions,
    }),
  };
}
