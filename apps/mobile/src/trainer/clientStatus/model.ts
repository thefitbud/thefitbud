import type {
  Checkin,
  MealComplianceItem,
  ProgressMetricPoint,
  ResponsivenessResponse,
  WorkoutAdherenceItem,
} from "@fitbud/contracts";
import {
  formatCivilDate,
  formatHhMmTime,
  formatLocalDate,
  formatWeight,
  labelFor,
} from "@fitbud/core";
import { addDays, startOfWeekMonday, weekdayShort } from "../../lib/dates";

const MINUS = "−";

const WORKOUT_DONE = new Set<string>(["completed", "modified"]);
/** Same "logged" rule as the web ended overview (a skip is a logged answer). */
const MEAL_LOGGED = new Set<string>(["confirmed", "modified", "logged_later", "skipped"]);
const CHECKIN_SUBMITTED = new Set<string>(["submitted", "reviewed"]);

export type DayMark = "done" | "missed" | "none";

export type WeekDayCell = {
  date: string;
  letter: string;
  mark: DayMark;
  /** "3/4" or "–" when nothing is planned. */
  count: string;
};

type DatedWorkout = { localDate: string; status: string };

/** One cell per date: all done = check, any missed = cross, otherwise a dash. */
export function weekDayCells(
  zone: string,
  dates: string[],
  workouts: DatedWorkout[],
  /** Days after this date have not happened in the coaching period: shown as "—". */
  lastDate?: string,
): WeekDayCell[] {
  return dates.map((date) => {
    if (lastDate && date > lastDate) {
      return { date, letter: weekdayShort(zone, date).slice(0, 1), mark: "none", count: "—" };
    }
    const day = workouts.filter((item) => item.localDate === date);
    const done = day.filter((item) => WORKOUT_DONE.has(item.status)).length;
    const missed = day.some((item) => item.status === "missed");
    let mark: DayMark = "none";
    if (day.length > 0 && done === day.length) mark = "done";
    else if (missed) mark = "missed";
    return {
      date,
      letter: weekdayShort(zone, date).slice(0, 1),
      mark,
      count: day.length === 0 ? "–" : `${done}/${day.length}`,
    };
  });
}

/** kcal tile: logged of assigned, from the week read model's today block (same source as web). */
export function kcalTileValue(
  nutrition: { logged: { kcal: number }; assigned: { kcal: number } | null } | null | undefined,
): string {
  if (!nutrition) return "–";
  const logged = nutrition.logged.kcal.toLocaleString("en-IN");
  if (!nutrition.assigned) return logged;
  return `${logged} of ${nutrition.assigned.kcal.toLocaleString("en-IN")}`;
}

/** One line for the Reminders card, from the responsiveness read (TW-31 summary). */
export function reminderLine(data: ResponsivenessResponse): string {
  const title = labelFor("responsiveness_label", data.label);
  const { sent, opened, loggedAfter, loggedBefore } = data.counts;
  let detail: string;
  switch (data.label) {
    case "logs_on_own":
      detail = `Logged ${loggedBefore} of ${Math.max(sent, loggedBefore + loggedAfter)} before a reminder`;
      break;
    case "responds":
      detail = `Logged ${loggedAfter} of ${sent} after a reminder · ${opened} opened`;
      break;
    case "often_misses":
      detail = `${sent} reminders sent · ${opened} opened · ${loggedAfter} logged after`;
      break;
    case "reminders_paused":
      detail = data.pausedUntil
        ? `Paused until ${formatCivilDate(data.pausedUntil.slice(0, 10))}`
        : "Paused for this client";
      break;
    case "notifications_off":
      detail = sent > 0 ? `${sent} sent · push off` : "Push notifications off";
      break;
    case "not_enough_data":
      detail = sent > 0 ? `${sent} sent · need more history` : "Fewer than 5 reminders in 14 days";
      break;
    default:
      return title;
  }
  return `${title} · ${detail}`;
}

export function quietHoursLine(
  data: Pick<ResponsivenessResponse, "quietHoursStart" | "quietHoursEnd">,
): string | null {
  if (!data.quietHoursStart || !data.quietHoursEnd) return null;
  return `Quiet hours ${formatHhMmTime(data.quietHoursStart)} – ${formatHhMmTime(data.quietHoursEnd)}`;
}

export type EndedInput = {
  zone: string;
  startedAt: string;
  endedAt: string;
  weights: ProgressMetricPoint[];
  workouts: WorkoutAdherenceItem[];
  meals: MealComplianceItem[];
  checkins: Checkin[];
};

export type EndedSummary = {
  startDate: string;
  endDate: string;
  lastWeekStart: string;
  weeksCoached: number;
  workouts: string | null;
  checkins: string | null;
  weight: { headline: string; sub: string | null } | null;
  lastWeek: {
    cells: WeekDayCell[];
    workouts: string | null;
    meals: string | null;
    lastCheckin: string;
  };
};

function civilDaysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function weightSummary(weights: ProgressMetricPoint[]): EndedSummary["weight"] {
  const first = weights[0];
  const last = weights[weights.length - 1];
  if (!first || !last) return null;
  if (first === last) return { headline: formatWeight(first.value), sub: null };
  const delta = Math.round((last.value - first.value) * 10) / 10;
  const sign = delta > 0 ? "+" : delta < 0 ? MINUS : "";
  const plain = (kg: number) => formatWeight(kg).replace(/ kg$/, "");
  return {
    headline: `${plain(first.value)} → ${formatWeight(last.value)}`,
    sub: `${sign}${formatWeight(Math.abs(delta))} from ${formatCivilDate(first.localDate)} to ${formatCivilDate(last.localDate)}`,
  };
}

export function buildEndedSummary(input: EndedInput): EndedSummary {
  const startDate = formatLocalDate(new Date(input.startedAt), input.zone);
  const endDate = formatLocalDate(new Date(input.endedAt), input.zone);
  // Frame 74: the Monday-start week that contains the end date.
  const lastWeekStart = startOfWeekMonday(endDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(lastWeekStart, i));

  const doneWorkouts = input.workouts.filter((w) => WORKOUT_DONE.has(w.status)).length;
  // A check-in still scheduled was never due, so it is not counted.
  const dueCheckins = input.checkins.filter((c) => c.status !== "scheduled");
  const submitted = dueCheckins.filter((c) => CHECKIN_SUBMITTED.has(c.status)).length;

  const weekWorkouts = input.workouts.filter(
    (w) => w.localDate >= lastWeekStart && w.localDate <= endDate,
  );
  const weekDone = weekWorkouts.filter((w) => WORKOUT_DONE.has(w.status)).length;
  const loggedMeals = input.meals.filter((m) => MEAL_LOGGED.has(m.status)).length;
  const lastCheckin = input.checkins
    .filter((c) =>
        CHECKIN_SUBMITTED.has(c.status) &&
        c.localDate >= lastWeekStart &&
        c.localDate <= endDate,
    )
    .sort((a, b) => b.localDate.localeCompare(a.localDate))[0];

  return {
    startDate,
    endDate,
    lastWeekStart,
    weeksCoached: Math.max(1, Math.ceil((civilDaysBetween(startDate, endDate) + 1) / 7)),
    workouts: input.workouts.length > 0 ? `${doneWorkouts} of ${input.workouts.length}` : null,
    checkins: dueCheckins.length > 0 ? `${submitted} of ${dueCheckins.length}` : null,
    weight: weightSummary(input.weights),
    lastWeek: {
      cells: weekDayCells(input.zone, days, weekWorkouts, endDate),
      workouts: weekWorkouts.length > 0 ? `${weekDone} of ${weekWorkouts.length}` : null,
      meals: input.meals.length > 0 ? `${loggedMeals} of ${input.meals.length}` : null,
      lastCheckin: lastCheckin
        ? weekdayShort(input.zone, lastCheckin.localDate)
        : "None",
    },
  };
}
