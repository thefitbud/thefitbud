import type {
  ExerciseLibraryItem,
  FoodLibraryItem,
  MealPrescription,
  PlanContent,
  PlanTemplateType,
  WorkoutExercise,
} from "@fitbud/contracts";

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
      items: meal.items.map((item) => ({ ...item })),
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

/** Copy an exercise library item into a draft exercise prescription (no live link). */
export function exercisePrescriptionFromLibrary(
  item: Pick<
    ExerciseLibraryItem,
    "name" | "instructions" | "defaultLoadLabel" | "defaultReps"
  >,
  order: number,
  newId: () => string,
): WorkoutExercise {
  return {
    id: newId(),
    order,
    name: item.name,
    instructions: item.instructions,
    setTargets: [
      {
        id: newId(),
        order: 1,
        reps: item.defaultReps ?? 8,
        loadLabel: item.defaultLoadLabel,
        rpe: null,
      },
    ],
  };
}

/** Copy a food library item into a draft meal prescription (no live link). */
export function mealPrescriptionFromLibrary(
  item: Pick<FoodLibraryItem, "name" | "portionLabel" | "notes"> &
    Partial<
      Pick<
        FoodLibraryItem,
        "id" | "calories" | "proteinGrams" | "carbsGrams" | "fatGrams"
      >
    >,
  order: number,
  newId: () => string,
): MealPrescription {
  const instructions = [item.portionLabel, item.notes]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" · ");
  return {
    id: newId(),
    order,
    name: item.name,
    scheduleHint: null,
    instructions: instructions.length > 0 ? instructions : null,
    photoRequired: false,
    items: [
      {
        ...(item.id ? { sourceFoodLibraryItemId: item.id } : {}),
        name: item.name,
        portionLabel: item.portionLabel,
        calories: item.calories ?? null,
        proteinGrams: item.proteinGrams ?? null,
        carbsGrams: item.carbsGrams ?? null,
        fatGrams: item.fatGrams ?? null,
      },
    ],
  };
}
