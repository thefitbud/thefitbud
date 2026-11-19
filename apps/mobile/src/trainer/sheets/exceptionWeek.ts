import { formatCivilDate } from "@fitbud/core";
import { weekdayShort } from "../../lib/dates";

/** One TM-04a "This week" day: a workout mark per civil day. */
export type ExceptionWeekMark = "done" | "missed" | "rest" | "today" | "upcoming";

export type ExceptionWeekDay = { date: string; letter: string; mark: ExceptionWeekMark };

export type ExceptionWeekModel = {
  range: string;
  days: ExceptionWeekDay[];
  workoutsDone: number;
  workoutsPlanned: number;
  mealsLogged: number;
  mealsPlanned: number;
};

const WORKOUT_DONE = new Set(["completed", "modified"]);
/** Same "logged" rule as the client status week (a skip is a logged answer). */
const MEAL_LOGGED = new Set(["confirmed", "modified", "logged_later", "skipped"]);

/**
 * TM-04a "This week", from the persisted assignments for the week (Mon–Sun in
 * the client's zone). Done = every workout that day completed; missed = any
 * missed; a planned day still ahead (or today, not done yet) is open; a day
 * with nothing planned is a rest dash. Counts are plain "x of y", never a
 * percentage (AGENTS.md).
 */
export function exceptionWeekModel(input: {
  dates: string[];
  today: string;
  workouts: ReadonlyArray<{ localDate: string; status: string }>;
  meals: ReadonlyArray<{ localDate: string; status: string }>;
}): ExceptionWeekModel {
  const days = input.dates.map((date) => {
    const day = input.workouts.filter((item) => item.localDate === date);
    const done = day.length > 0 && day.every((item) => WORKOUT_DONE.has(item.status));
    const missed = day.some((item) => item.status === "missed");
    let mark: ExceptionWeekMark;
    if (done) mark = "done";
    else if (missed) mark = "missed";
    else if (date === input.today) mark = "today";
    else if (date > input.today) mark = "upcoming";
    else mark = "rest";
    return { date, letter: weekdayShort("UTC", date).slice(0, 1), mark };
  });
  const first = input.dates[0];
  const last = input.dates[input.dates.length - 1];
  return {
    range: first && last ? `${formatCivilDate(first)} – ${formatCivilDate(last)}` : "",
    days,
    workoutsDone: input.workouts.filter((item) => WORKOUT_DONE.has(item.status)).length,
    workoutsPlanned: input.workouts.length,
    mealsLogged: input.meals.filter((item) => MEAL_LOGGED.has(item.status)).length,
    mealsPlanned: input.meals.length,
  };
}
