import { trainerCategoriesSchema, type TrainerCategories } from "@fitbud/contracts";

export function defaultTrainerCategories(): TrainerCategories {
  return {
    askCoach: true,
    checkinSubmitted: true,
    criticalDigest: true,
    intakeSubmitted: true,
    renewalsDue: true,
    mealTimesChanged: true,
    morningSummary: false,
  };
}

export function parseTrainerCategoriesJson(json: string): TrainerCategories {
  try {
    const raw = JSON.parse(json) as unknown;
    if (Array.isArray(raw) && raw.length === 0) {
      return defaultTrainerCategories();
    }
    const parsed = trainerCategoriesSchema.partial().safeParse(raw);
    if (parsed.success) {
      return { ...defaultTrainerCategories(), ...parsed.data };
    }
  } catch {
    // fall through
  }
  return defaultTrainerCategories();
}

export function serializeTrainerCategories(categories: TrainerCategories): string {
  return JSON.stringify(trainerCategoriesSchema.parse(categories));
}
