import type { PlanContent } from "@fitbud/contracts";
import { planConsistencyWarnings } from "@fitbud/core";
import { planContentError } from "../plan-composition";
import { WEEK_ORDER, weekdayShort } from "./weekdays";

export type PublishIssues = {
  blocking: string[];
  notes: string[];
};

export function publishIssues(
  content: PlanContent,
  expectations: { sessionsPerWeek: number; mealsPerDay: number } | null,
): PublishIssues {
  const blocking: string[] = [];
  const notes: string[] = [];
  const contentIssue = planContentError(content);
  if (contentIssue) blocking.push(contentIssue);

  for (const meal of content.mealPrescriptions) {
    if (!meal.localTime) {
      blocking.push(`Set a time for ${meal.name} so reminders work`);
    }
  }

  if (content.workoutDays.length > 0) {
    const used = new Set(
      content.workoutDays
        .map((day) => day.weekday)
        .filter((weekday): weekday is number => weekday != null),
    );
    const restDays = WEEK_ORDER.filter((weekday) => !used.has(weekday));
    if (restDays.length > 0) {
      notes.push(
        `${restDays.length} ${restDays.length === 1 ? "day has" : "days have"} no session · ${restDays
          .map(weekdayShort)
          .join(", ")} ${restDays.length === 1 ? "is a rest day" : "are rest days"}. Is that intended?`,
      );
    }
  }

  if (expectations) {
    const warnings = planConsistencyWarnings({
      sessionsPerWeek: expectations.sessionsPerWeek,
      mealsPerDay: expectations.mealsPerDay,
      workoutDays: content.workoutDays,
      mealPrescriptions: content.mealPrescriptions,
    });
    for (const warning of warnings) {
      notes.push(
        warning.code === "workout_sessions"
          ? `Configuration expects ${warning.expected} sessions/week; plan has ${warning.actual}`
          : warning.message,
      );
    }
  }
  return { blocking, notes };
}
