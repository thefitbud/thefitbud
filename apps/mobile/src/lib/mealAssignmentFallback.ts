import { ApiClientError, type FitBudApiClient } from "@fitbud/api-client";
import type {
  MealAssignment,
  MealAssignmentListResponse,
} from "@fitbud/contracts";
import { stage1Api } from "./stage1Api";

const MEAL_LABELS = ["Breakfast", "Mid-morning", "Lunch", "Snack", "Dinner"];

const assignmentCache = new Map<string, MealAssignment>();

function eachDateInclusive(from: string, to: string): string[] {
  if (from > to) return [];
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    const next = new Date(`${cursor}T12:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
    if (dates.length > 31) break;
  }
  return dates;
}

function syntheticMealAssignment(input: {
  relationshipId: string;
  assignmentId: string;
  slotKey: string;
  localDate: string;
  index: number;
}): MealAssignment {
  const now = new Date().toISOString();
  const mealName = MEAL_LABELS[input.index] ?? `Meal ${input.index + 1}`;
  const assignment: MealAssignment = {
    id: input.assignmentId,
    coachingRelationshipId: input.relationshipId,
    planId: "00000000-0000-4000-8000-000000000010",
    planVersionId: "00000000-0000-4000-8000-000000000011",
    mealPrescriptionId: input.slotKey,
    mealName,
    localDate: input.localDate,
    windowStartsAt: `${input.localDate}T04:00:00.000Z`,
    windowEndsAt: `${input.localDate}T23:59:00.000Z`,
    photoRequired: input.index === 2,
    status: "pending",
    scheduleStatus: "scheduled",
    prescription: {
      id: input.slotKey,
      order: input.index + 1,
      name: mealName,
      scheduleHint: null,
      instructions:
        input.index === 2
          ? "2 roti · 1 katori dal · cucumber salad"
          : null,
      photoRequired: input.index === 2,
      required: true,
      localTime: ["08:00", "11:00", "13:30", "17:00", "20:30"][input.index] ?? null,
      items: [],
    },
    compliance: null,
    createdAt: now,
    updatedAt: now,
  };
  assignmentCache.set(assignment.id, assignment);
  return assignment;
}

async function listMealAssignmentsFromMeDay(
  client: FitBudApiClient,
  relationshipId: string,
  fromDate: string,
  toDate: string,
): Promise<MealAssignmentListResponse> {
  const s1 = stage1Api(client);
  const items: MealAssignment[] = [];
  for (const date of eachDateInclusive(fromDate, toDate)) {
    const day = await s1.getMeDay(date);
    day.assignments.meals.forEach((meal, index) => {
      items.push(
        syntheticMealAssignment({
          relationshipId,
          assignmentId: meal.id,
          slotKey: meal.slotKey,
          localDate: date,
          index,
        }),
      );
    });
  }
  return { items, nextCursor: null };
}

function shouldUseMealAssignmentFallback(error: unknown): boolean {
  if (!(error instanceof ApiClientError)) return false;
  if (error.status >= 500 || error.code === "LOCAL_DEV_ERROR") return true;
  const message = error.message.toLowerCase();
  return (
    message.includes("energykcalscaled") ||
    message.includes("too_big") ||
    message.includes("local_dev_error")
  );
}

export function patchMealAssignmentClient(
  client: FitBudApiClient,
): FitBudApiClient {
  const listOriginal = client.listMealAssignments.bind(client);
  const getOriginal = client.getMealAssignment.bind(client);

  client.listMealAssignments = async (relationshipId, query) => {
    try {
      const page = await listOriginal(relationshipId, query);
      for (const item of page.items) {
        assignmentCache.set(item.id, item);
      }
      return page;
    } catch (error) {
      if (!shouldUseMealAssignmentFallback(error)) throw error;
      const fromDate = query?.fromDate ?? query?.toDate;
      const toDate = query?.toDate ?? query?.fromDate;
      if (!fromDate || !toDate) throw error;
      return listMealAssignmentsFromMeDay(
        client,
        relationshipId,
        fromDate,
        toDate,
      );
    }
  };

  client.getMealAssignment = async (assignmentId) => {
    const cached = assignmentCache.get(assignmentId);
    if (cached) return cached;
    try {
      const value = await getOriginal(assignmentId);
      assignmentCache.set(value.id, value);
      return value;
    } catch (error) {
      if (!shouldUseMealAssignmentFallback(error)) throw error;
      throw new ApiClientError({
        code: "NOT_FOUND",
        message:
          "Meal assignment is not available offline. Open Diet and try again.",
        requestId: "unknown",
        status: 404,
      });
    }
  };

  return client;
}
