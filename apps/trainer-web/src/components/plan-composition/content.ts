import {
  NUTRIENT_SCALE,
  planContentSchema,
  type ExerciseLibraryItem,
  type FoodLibraryItem,
  type MealFoodItem,
  type MealPrescription,
  type PlanContent,
  type PlanTemplateType,
  type PlanVersionStatus,
  type WorkoutDay,
  type WorkoutExercise,
  type WorkoutSetTarget,
} from "@fitbud/contracts";
import {
  exercisePrescriptionFromLibrary,
  foodSnapshotFromLibrary,
} from "@fitbud/core";

/** Schema ceilings for one plan or template draft. */
export const PLAN_COMPOSITION_LIMITS = {
  workoutDays: 14,
  exercisesPerDay: 40,
  setsPerExercise: 30,
  meals: 12,
  itemsPerMeal: 30,
} as const;

function newId(): string {
  return crypto.randomUUID();
}

function withOrder<T extends { order: number }>(items: T[]): T[] {
  return items.map((item, index) =>
    item.order === index + 1 ? item : { ...item, order: index + 1 },
  );
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] | null {
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return null;
  const next = items.slice();
  const [item] = next.splice(index, 1);
  if (!item) return null;
  next.splice(target, 0, item);
  return next;
}

export function sortedByOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.order - right.order);
}

export function clonePlanContent(content: PlanContent): PlanContent {
  return {
    workoutDays: content.workoutDays.map((day) => ({
      ...day,
      exercises: day.exercises.map((exercise) => ({
        ...exercise,
        setTargets: exercise.setTargets.map((target) => ({ ...target })),
      })),
    })),
    mealPrescriptions: content.mealPrescriptions.map((meal) => ({
      ...meal,
      items: (meal.items ?? []).map((item) => ({ ...item })),
    })),
  };
}

export function createWorkoutDay(order: number): WorkoutDay {
  return {
    id: newId(),
    order,
    name: `Day ${order}`,
    exercises: [],
  };
}

export function createWorkoutExercise(order: number): WorkoutExercise {
  return {
    id: newId(),
    order,
    name: "",
    instructions: null,
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: [],
    difficulty: null,
    setTargets: [createSetTarget(1)],
  };
}

export function createSetTarget(order: number): WorkoutSetTarget {
  return {
    id: newId(),
    order,
    reps: null,
    loadLabel: null,
    rpe: null,
  };
}

export function createMeal(order: number): MealPrescription {
  return {
    id: newId(),
    order,
    name: `Meal ${order}`,
    scheduleHint: null,
    instructions: null,
    photoRequired: false,
    items: [],
  };
}

export function createFoodItem(): MealFoodItem {
  return {
    snapshotKind: "legacy",
    name: "",
    classification: null,
    basis: null,
    canonical: null,
    serving: { label: "", unit: "portion", conversionScaled: null },
    quantityScaled: NUTRIENT_SCALE,
    calculated: {
      energyKcalScaled: null,
      proteinScaled: null,
      carbsScaled: null,
      fatScaled: null,
      partial: true,
    },
  };
}

export function createBlankPlanContent(): PlanContent {
  return {
    workoutDays: [createWorkoutDay(1)],
    mealPrescriptions: [],
  };
}

/** Blank draft that already satisfies the template-type content rule. */
export function blankContentForTemplateType(
  templateType: PlanTemplateType,
): PlanContent {
  switch (templateType) {
    case "workout":
      return createBlankPlanContent();
    case "nutrition":
      return { workoutDays: [], mealPrescriptions: [createMeal(1)] };
    case "combined":
      return {
        workoutDays: [createWorkoutDay(1)],
        mealPrescriptions: [createMeal(1)],
      };
    default: {
      const _exhaustive: never = templateType;
      return _exhaustive;
    }
  }
}

/** Drafts are editable. Every other version status stays read-only. */
export function isEditablePlanStatus(status: PlanVersionStatus): boolean {
  return status === "draft";
}

export function planContentError(content: PlanContent): string | null {
  const parsed = planContentSchema.safeParse(content);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  if (!issue) return "Plan content is incomplete.";
  const field = String(issue.path[issue.path.length - 1] ?? "");
  if (field === "name") return "Each day, exercise, meal, and food item needs a name.";
  if (field === "label") return "Each food item needs a portion.";
  return issue.message;
}

function mapDay(
  content: PlanContent,
  dayId: string,
  update: (day: WorkoutDay) => WorkoutDay,
): PlanContent {
  return {
    ...content,
    workoutDays: content.workoutDays.map((day) =>
      day.id === dayId ? update(day) : day,
    ),
  };
}

function mapExercise(
  content: PlanContent,
  dayId: string,
  exerciseId: string,
  update: (exercise: WorkoutExercise) => WorkoutExercise,
): PlanContent {
  return mapDay(content, dayId, (day) => ({
    ...day,
    exercises: day.exercises.map((exercise) =>
      exercise.id === exerciseId ? update(exercise) : exercise,
    ),
  }));
}

function mapMeal(
  content: PlanContent,
  mealId: string,
  update: (meal: MealPrescription) => MealPrescription,
): PlanContent {
  return {
    ...content,
    mealPrescriptions: content.mealPrescriptions.map((meal) =>
      meal.id === mealId ? update(meal) : meal,
    ),
  };
}

export function addWorkoutDay(content: PlanContent): PlanContent {
  if (content.workoutDays.length >= PLAN_COMPOSITION_LIMITS.workoutDays) {
    return content;
  }
  return {
    ...content,
    workoutDays: withOrder([
      ...sortedByOrder(content.workoutDays),
      createWorkoutDay(content.workoutDays.length + 1),
    ]),
  };
}

export function removeWorkoutDay(content: PlanContent, dayId: string): PlanContent {
  return {
    ...content,
    workoutDays: withOrder(content.workoutDays.filter((day) => day.id !== dayId)),
  };
}

export function moveWorkoutDay(
  content: PlanContent,
  dayId: string,
  direction: -1 | 1,
): PlanContent {
  const days = sortedByOrder(content.workoutDays);
  const index = days.findIndex((day) => day.id === dayId);
  const moved = moveItem(days, index, direction);
  if (!moved) return content;
  return { ...content, workoutDays: withOrder(moved) };
}

export function updateWorkoutDayName(
  content: PlanContent,
  dayId: string,
  name: string,
): PlanContent {
  return mapDay(content, dayId, (day) => ({ ...day, name }));
}

export function addExercise(content: PlanContent, dayId: string): PlanContent {
  return mapDay(content, dayId, (day) => {
    if (day.exercises.length >= PLAN_COMPOSITION_LIMITS.exercisesPerDay) {
      return day;
    }
    return {
      ...day,
      exercises: withOrder([
        ...sortedByOrder(day.exercises),
        createWorkoutExercise(day.exercises.length + 1),
      ]),
    };
  });
}

export function removeExercise(
  content: PlanContent,
  dayId: string,
  exerciseId: string,
): PlanContent {
  return mapDay(content, dayId, (day) => ({
    ...day,
    exercises: withOrder(
      day.exercises.filter((exercise) => exercise.id !== exerciseId),
    ),
  }));
}

export function moveExercise(
  content: PlanContent,
  dayId: string,
  exerciseId: string,
  direction: -1 | 1,
): PlanContent {
  return mapDay(content, dayId, (day) => {
    const exercises = sortedByOrder(day.exercises);
    const index = exercises.findIndex((exercise) => exercise.id === exerciseId);
    const moved = moveItem(exercises, index, direction);
    if (!moved) return day;
    return { ...day, exercises: withOrder(moved) };
  });
}

export function updateExercise(
  content: PlanContent,
  dayId: string,
  exerciseId: string,
  patch: Partial<Pick<WorkoutExercise, "name" | "instructions">>,
): PlanContent {
  return mapExercise(content, dayId, exerciseId, (exercise) => ({
    ...exercise,
    ...patch,
  }));
}

export function addSetTarget(
  content: PlanContent,
  dayId: string,
  exerciseId: string,
): PlanContent {
  return mapExercise(content, dayId, exerciseId, (exercise) => {
    if (exercise.setTargets.length >= PLAN_COMPOSITION_LIMITS.setsPerExercise) {
      return exercise;
    }
    return {
      ...exercise,
      setTargets: withOrder([
        ...sortedByOrder(exercise.setTargets),
        createSetTarget(exercise.setTargets.length + 1),
      ]),
    };
  });
}

export function removeSetTarget(
  content: PlanContent,
  dayId: string,
  exerciseId: string,
  setId: string,
): PlanContent {
  return mapExercise(content, dayId, exerciseId, (exercise) => ({
    ...exercise,
    setTargets: withOrder(
      exercise.setTargets.filter((target) => target.id !== setId),
    ),
  }));
}

export function updateSetTarget(
  content: PlanContent,
  dayId: string,
  exerciseId: string,
  setId: string,
  patch: Partial<Pick<WorkoutSetTarget, "reps" | "loadLabel" | "rpe">>,
): PlanContent {
  return mapExercise(content, dayId, exerciseId, (exercise) => ({
    ...exercise,
    setTargets: exercise.setTargets.map((target) =>
      target.id === setId ? { ...target, ...patch } : target,
    ),
  }));
}

export function addMeal(content: PlanContent): PlanContent {
  if (content.mealPrescriptions.length >= PLAN_COMPOSITION_LIMITS.meals) {
    return content;
  }
  return {
    ...content,
    mealPrescriptions: withOrder([
      ...sortedByOrder(content.mealPrescriptions),
      createMeal(content.mealPrescriptions.length + 1),
    ]),
  };
}

export function removeMeal(content: PlanContent, mealId: string): PlanContent {
  return {
    ...content,
    mealPrescriptions: withOrder(
      content.mealPrescriptions.filter((meal) => meal.id !== mealId),
    ),
  };
}

export function moveMeal(
  content: PlanContent,
  mealId: string,
  direction: -1 | 1,
): PlanContent {
  const meals = sortedByOrder(content.mealPrescriptions);
  const index = meals.findIndex((meal) => meal.id === mealId);
  const moved = moveItem(meals, index, direction);
  if (!moved) return content;
  return { ...content, mealPrescriptions: withOrder(moved) };
}

export function updateMeal(
  content: PlanContent,
  mealId: string,
  patch: Partial<
    Pick<MealPrescription, "name" | "scheduleHint" | "instructions" | "photoRequired">
  >,
): PlanContent {
  return mapMeal(content, mealId, (meal) => ({ ...meal, ...patch }));
}

export function addFoodItem(content: PlanContent, mealId: string): PlanContent {
  return mapMeal(content, mealId, (meal) => {
    const items = meal.items ?? [];
    if (items.length >= PLAN_COMPOSITION_LIMITS.itemsPerMeal) return meal;
    return { ...meal, items: [...items, createFoodItem()] };
  });
}

export function removeFoodItem(
  content: PlanContent,
  mealId: string,
  index: number,
): PlanContent {
  return mapMeal(content, mealId, (meal) => ({
    ...meal,
    items: (meal.items ?? []).filter((_, itemIndex) => itemIndex !== index),
  }));
}

export function moveFoodItem(
  content: PlanContent,
  mealId: string,
  index: number,
  direction: -1 | 1,
): PlanContent {
  return mapMeal(content, mealId, (meal) => {
    const moved = moveItem(meal.items ?? [], index, direction);
    if (!moved) return meal;
    return { ...meal, items: moved };
  });
}

export function updateFoodItem(
  content: PlanContent,
  mealId: string,
  index: number,
  next: MealFoodItem,
): PlanContent {
  return mapMeal(content, mealId, (meal) => ({
    ...meal,
    items: (meal.items ?? []).map((item, itemIndex) =>
      itemIndex === index ? next : item,
    ),
  }));
}

/** Copy library identity into the selected day. Sets are entered on the draft. */
export function addExerciseFromLibrary(
  content: PlanContent,
  dayId: string,
  source: ExerciseLibraryItem,
): PlanContent {
  return mapDay(content, dayId, (day) => {
    const exercises = sortedByOrder(day.exercises);
    if (exercises.length >= PLAN_COMPOSITION_LIMITS.exercisesPerDay) {
      return day;
    }
    return {
      ...day,
      exercises: withOrder([
        ...exercises,
        exercisePrescriptionFromLibrary(source, exercises.length + 1, newId),
      ]),
    };
  });
}

/** Copy a calculated food snapshot into the selected meal. */
export function addFoodItemFromLibrary(
  content: PlanContent,
  mealId: string,
  source: FoodLibraryItem,
  servingId: string,
  quantityScaled: number = NUTRIENT_SCALE,
): PlanContent {
  const snapshot = foodSnapshotFromLibrary(source, servingId, quantityScaled);
  return mapMeal(content, mealId, (meal) => {
    const items = meal.items ?? [];
    if (items.length >= PLAN_COMPOSITION_LIMITS.itemsPerMeal) return meal;
    return {
      ...meal,
      items: [...items, snapshot],
    };
  });
}

function cloneExercise(exercise: WorkoutExercise): WorkoutExercise {
  return {
    ...exercise,
    id: newId(),
    setTargets: exercise.setTargets.map((target) => ({ ...target, id: newId() })),
  };
}

export function duplicateWorkoutDay(
  content: PlanContent,
  dayId: string,
): PlanContent {
  const days = sortedByOrder(content.workoutDays);
  if (days.length >= PLAN_COMPOSITION_LIMITS.workoutDays) return content;
  const index = days.findIndex((day) => day.id === dayId);
  const source = days[index];
  if (!source) return content;
  const copy: WorkoutDay = {
    id: newId(),
    order: source.order,
    name: source.name,
    exercises: sortedByOrder(source.exercises).map(cloneExercise),
  };
  const next = days.slice();
  next.splice(index + 1, 0, copy);
  return { ...content, workoutDays: withOrder(next) };
}

export function duplicateExercise(
  content: PlanContent,
  dayId: string,
  exerciseId: string,
): PlanContent {
  return mapDay(content, dayId, (day) => {
    const exercises = sortedByOrder(day.exercises);
    if (exercises.length >= PLAN_COMPOSITION_LIMITS.exercisesPerDay) return day;
    const index = exercises.findIndex((exercise) => exercise.id === exerciseId);
    const source = exercises[index];
    if (!source) return day;
    const next = exercises.slice();
    next.splice(index + 1, 0, cloneExercise(source));
    return { ...day, exercises: withOrder(next) };
  });
}

export function duplicateMeal(content: PlanContent, mealId: string): PlanContent {
  const meals = sortedByOrder(content.mealPrescriptions);
  if (meals.length >= PLAN_COMPOSITION_LIMITS.meals) return content;
  const index = meals.findIndex((meal) => meal.id === mealId);
  const source = meals[index];
  if (!source) return content;
  const copy: MealPrescription = {
    ...source,
    id: newId(),
    items: (source.items ?? []).map((item) => ({ ...item })),
  };
  const next = meals.slice();
  next.splice(index + 1, 0, copy);
  return { ...content, mealPrescriptions: withOrder(next) };
}

export function duplicateFoodItem(
  content: PlanContent,
  mealId: string,
  index: number,
): PlanContent {
  return mapMeal(content, mealId, (meal) => {
    const items = meal.items ?? [];
    const source = items[index];
    if (!source || items.length >= PLAN_COMPOSITION_LIMITS.itemsPerMeal) {
      return meal;
    }
    const next = items.slice();
    next.splice(index + 1, 0, { ...source });
    return { ...meal, items: next };
  });
}
