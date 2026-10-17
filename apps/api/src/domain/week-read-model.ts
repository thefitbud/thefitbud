import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { WeekDayState, WeekReadModel } from "@fitbud/contracts";
import {
  addDaysToLocalDate,
  deriveMealAssignmentStatus,
  deriveWorkoutAssignmentStatus,
  formatLocalDate,
} from "@fitbud/core";
import type { Db } from "../db/client.js";
import {
  mealAssignments,
  mealCompliance,
  workoutAssignments,
  workoutExecutions,
} from "../db/schema.js";

export async function buildWeekReadModel(
  db: Db,
  input: {
    relationshipId: string;
    start: string;
    timeZone: string;
    nowIso: string;
  },
): Promise<WeekReadModel> {
  const end = addDaysToLocalDate(input.start, 6);
  const dates = Array.from({ length: 7 }, (_, i) =>
    addDaysToLocalDate(input.start, i),
  );
  const today = formatLocalDate(new Date(input.nowIso), input.timeZone);

  const workouts = await db
    .select({
      assignment: workoutAssignments,
      execution: workoutExecutions,
    })
    .from(workoutAssignments)
    .leftJoin(
      workoutExecutions,
      eq(workoutExecutions.assignmentId, workoutAssignments.id),
    )
    .where(
      and(
        eq(workoutAssignments.coachingRelationshipId, input.relationshipId),
        gte(workoutAssignments.localDate, input.start),
        lte(workoutAssignments.localDate, end),
        eq(workoutAssignments.scheduleStatus, "scheduled"),
      ),
    );

  const meals = await db
    .select({
      assignment: mealAssignments,
      compliance: mealCompliance,
    })
    .from(mealAssignments)
    .leftJoin(
      mealCompliance,
      eq(mealCompliance.assignmentId, mealAssignments.id),
    )
    .where(
      and(
        eq(mealAssignments.coachingRelationshipId, input.relationshipId),
        gte(mealAssignments.localDate, input.start),
        lte(mealAssignments.localDate, end),
        eq(mealAssignments.scheduleStatus, "scheduled"),
      ),
    );

  let workoutsAssigned = 0;
  let workoutsCompleted = 0;
  for (const row of workouts) {
    workoutsAssigned += 1;
    const status = deriveWorkoutAssignmentStatus({
      nowIso: input.nowIso,
      windowEndsAt: row.assignment.windowEndsAt,
      executionStatus: row.execution?.status ?? null,
    });
    if (status === "completed" || status === "modified") {
      workoutsCompleted += 1;
    }
  }

  let mealsAssigned = 0;
  let mealsLogged = 0;
  for (const row of meals) {
    mealsAssigned += 1;
    const status = deriveMealAssignmentStatus({
      nowIso: input.nowIso,
      windowEndsAt: row.assignment.windowEndsAt,
      complianceOutcome: row.compliance?.outcome ?? null,
      loggedAt: row.compliance?.loggedAt ?? null,
    });
    if (
      status === "confirmed" ||
      status === "modified" ||
      status === "logged_later"
    ) {
      mealsLogged += 1;
    }
  }

  const days = dates.map((date) => {
    const dayWorkouts = workouts.filter((w) => w.assignment.localDate === date);
    const dayMeals = meals.filter((m) => m.assignment.localDate === date);
    if (dayWorkouts.length === 0 && dayMeals.length === 0) {
      return { date, state: "rest" as WeekDayState };
    }
    if (date > today) {
      return { date, state: "future" as WeekDayState };
    }
    const woDone = dayWorkouts.filter((w) => {
      const status = deriveWorkoutAssignmentStatus({
        nowIso: input.nowIso,
        windowEndsAt: w.assignment.windowEndsAt,
        executionStatus: w.execution?.status ?? null,
      });
      return status === "completed" || status === "modified" || status === "skipped";
    }).length;
    const mealDone = dayMeals.filter((m) => {
      const status = deriveMealAssignmentStatus({
        nowIso: input.nowIso,
        windowEndsAt: m.assignment.windowEndsAt,
        complianceOutcome: m.compliance?.outcome ?? null,
        loggedAt: m.compliance?.loggedAt ?? null,
      });
      return (
        status === "confirmed" ||
        status === "modified" ||
        status === "skipped" ||
        status === "logged_later"
      );
    }).length;
    const total = dayWorkouts.length + dayMeals.length;
    const done = woDone + mealDone;
    if (done === 0 && date < today) {
      return { date, state: "missed" as WeekDayState };
    }
    if (done >= total) {
      return { date, state: "done" as WeekDayState };
    }
    return { date, state: "partial" as WeekDayState };
  });

  return {
    start: input.start,
    workouts: { assigned: workoutsAssigned, completed: workoutsCompleted },
    meals: { assigned: mealsAssigned, logged: mealsLogged },
    days,
  };
}
