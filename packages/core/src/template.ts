import {
  NUTRIENT_SCALE,
  type ExerciseLibraryItem,
  type FoodLibraryItem,
  type MealFoodItem,
  type MealPrescription,
  type PlanContent,
  type PlanTemplateType,
  type WorkoutExercise,
  type WorkoutSetTarget,
} from "@fitbud/contracts";
import {
  LibraryPrescriptionError,
  foodSnapshotFromLibrary,
} from "./nutrition.js";

function copyFoodItem(item: MealFoodItem): MealFoodItem {
  if (item.snapshotKind === "calculated") {
    return {
      ...item,
      canonical: { ...item.canonical },
      serving: { ...item.serving },
      calculated: { ...item.calculated },
    };
  }
  return {
    ...item,
    serving: { ...item.serving },
    calculated: { ...item.calculated },
  };
}

/** Deep-copy plan JSON with fresh IDs so templates never alias live plan state. */
export function copyPlanContent(
  content: PlanContent,
  newId: () => string,
): PlanContent {
  return {
    workoutDays: content.workoutDays.map((day) => ({
      id: newId(),
      order: day.order,
      name: day.name,
      exercises: day.exercises.map((exercise) => ({
        id: newId(),
        order: exercise.order,
        name: exercise.name,
        instructions: exercise.instructions,
        primaryMuscles: [...exercise.primaryMuscles],
        secondaryMuscles: [...exercise.secondaryMuscles],
        equipment: [...exercise.equipment],
        difficulty: exercise.difficulty,
        ...(exercise.sourceExerciseLibraryItemId
          ? { sourceExerciseLibraryItemId: exercise.sourceExerciseLibraryItemId }
          : {}),
        setTargets: exercise.setTargets.map((set) => ({
          id: newId(),
          order: set.order,
          reps: set.reps,
          loadLabel: set.loadLabel,
          rpe: set.rpe,
        })),
      })),
    })),
    mealPrescriptions: content.mealPrescriptions.map((meal) => ({
      id: newId(),
      order: meal.order,
      name: meal.name,
      scheduleHint: meal.scheduleHint,
      instructions: meal.instructions,
      photoRequired: meal.photoRequired,
      items: meal.items.map((item) => copyFoodItem(item)),
    })),
  };
}

/** @deprecated Prefer copyPlanContent — same behavior. */
export const copyPlanContentWithNewIds = copyPlanContent;

export function inferPlanTemplateType(content: PlanContent): PlanTemplateType {
  const hasWorkout = content.workoutDays.length > 0;
  const hasNutrition = content.mealPrescriptions.length > 0;
  if (hasWorkout && hasNutrition) return "combined";
  if (hasNutrition) return "nutrition";
  return "workout";
}

export const inferTemplateType = inferPlanTemplateType;

export function planContentMatchesTemplateType(
  content: PlanContent,
  templateType: PlanTemplateType,
): boolean {
  const hasWorkout = content.workoutDays.length > 0;
  const hasNutrition = content.mealPrescriptions.length > 0;
  switch (templateType) {
    case "workout":
      return hasWorkout && !hasNutrition;
    case "nutrition":
      return hasNutrition && !hasWorkout;
    case "combined":
      return hasWorkout && hasNutrition;
    default:
      return false;
  }
}

type PrescriptionSet = Pick<WorkoutSetTarget, "order" | "reps" | "loadLabel" | "rpe">;

/**
 * Copy exercise identity into a draft. Set targets come from the template.
 * The library does not supply reps or load.
 */
export function exercisePrescriptionFromLibrary(
  item: Pick<
    ExerciseLibraryItem,
    | "id"
    | "name"
    | "instructions"
    | "primaryMuscles"
    | "secondaryMuscles"
    | "equipment"
    | "difficulty"
    | "status"
  >,
  order: number,
  newId: () => string,
  setTargets: readonly PrescriptionSet[] = [],
): WorkoutExercise {
  if (item.status === "archived") {
    throw new LibraryPrescriptionError(
      "LIBRARY_ITEM_ARCHIVED",
      "Archived exercises cannot be added to new content.",
    );
  }
  return {
    id: newId(),
    order,
    name: item.name,
    instructions: item.instructions,
    primaryMuscles: [...item.primaryMuscles],
    secondaryMuscles: [...item.secondaryMuscles],
    equipment: [...item.equipment],
    difficulty: item.difficulty,
    sourceExerciseLibraryItemId: item.id,
    setTargets: setTargets.map((set, index) => ({
      id: newId(),
      order: set.order || index + 1,
      reps: set.reps,
      loadLabel: set.loadLabel,
      rpe: set.rpe,
    })),
  };
}

/** Copy one food serving and quantity into a draft meal. Nutrients are calculated. */
export function mealPrescriptionFromLibrary(
  item: FoodLibraryItem,
  order: number,
  newId: () => string,
  servingId: string,
  quantityScaled: number = NUTRIENT_SCALE,
): MealPrescription {
  const snapshot = foodSnapshotFromLibrary(item, servingId, quantityScaled);
  const instructions = [snapshot.serving.label, item.notes]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" · ");
  return {
    id: newId(),
    order,
    name: item.name,
    scheduleHint: null,
    instructions: instructions.length > 0 ? instructions : null,
    photoRequired: false,
    items: [snapshot],
  };
}
