import type {
  EffectivePlanResponse,
  ExerciseExecution,
  Plan,
  SetExecution,
  WorkoutAssignment,
  WorkoutExecution,
} from "@fitbud/contracts";
import { formatClockTime } from "@fitbud/core";
import { addDays, startOfWeekMonday } from "../lib/dates";
import { exerciseNameKey } from "./workoutSession";

export type WeekStripStatus = "done" | "miss" | "rest" | "today" | "future";

export function shortWorkoutDayName(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 2) return name.trim();
  const first = tokens[0]!;
  const last = tokens[tokens.length - 1]!;
  if (/^[A-Za-z]$/.test(last) || /^[A-B]\+?$/i.test(last)) {
    return `${first} ${last}`;
  }
  return name.length > 14 ? `${first} ${last}` : name.trim();
}

export function coachInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  const one = parts[0] ?? "YC";
  return one.slice(0, 2).toUpperCase();
}

function daysBetween(start: string, end: string): number {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const a = Date.UTC(sy!, sm! - 1, sd!);
  const b = Date.UTC(ey!, em! - 1, ed!);
  return Math.round((b - a) / 86_400_000);
}

export function weekNumberInPlan(
  effectiveFrom: string | null | undefined,
  weekStartLocal: string,
): number | null {
  if (!effectiveFrom) return null;
  const startDate = effectiveFrom.split("T")[0]!;
  const planMonday = startOfWeekMonday(startDate);
  const diff = daysBetween(planMonday, weekStartLocal);
  if (diff < 0) return 1;
  return Math.floor(diff / 7) + 1;
}

/** "Fat loss, phase 2" from plan title when present. */
export function planPhaseEyebrow(plan: Plan | null | undefined): string | null {
  const title = plan?.title?.trim();
  if (!title) return null;
  const normalized = title
    .replace(/\s*·\s*/g, ", ")
    .replace(/\bPhase\b/g, "phase");
  return normalized;
}

export function weekPlanEyebrow(
  effectivePlan: EffectivePlanResponse | null | undefined,
  weekStartLocal: string,
): string | null {
  const weekNum = weekNumberInPlan(
    effectivePlan?.version?.effectiveFrom ?? null,
    weekStartLocal,
  );
  const phase = planPhaseEyebrow(effectivePlan?.plan ?? null);
  if (weekNum != null && phase) return `Week ${weekNum} · ${phase}`;
  if (weekNum != null) return `Week ${weekNum}`;
  return phase;
}

export function weekStripStatus(
  date: string,
  today: string,
  assignment: WorkoutAssignment | undefined,
): WeekStripStatus {
  if (!assignment) return "rest";
  if (
    assignment.status === "completed" ||
    assignment.status === "modified"
  ) {
    return "done";
  }
  if (assignment.status === "missed") return "miss";
  if (date === today) return "today";
  if (date < today) return "miss";
  return "future";
}

export function totalSetsInDay(
  day: WorkoutAssignment["workoutDay"],
): number {
  return day.exercises.reduce((n, ex) => n + ex.setTargets.length, 0);
}

export function assignmentDayEyebrow(
  assignment: WorkoutAssignment,
  timeZone: string,
  today: string,
): string {
  const dateLabel = formatCivilDateShort(assignment.localDate);
  const planned = formatClockTime(assignment.windowStartsAt, timeZone);
  const dayPart =
    assignment.localDate === today
      ? `Today · planned ${planned}`
      : `${dateLabel} · planned ${planned}`;
  return dayPart;
}

/** Sat 17 Oct (no duplicate weekday). */
export function formatCivilDateShort(localDate: string): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d!));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    utc.getUTCDay()
  ]!;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${weekday} ${d} ${months[m! - 1]}`;
}

export function formatLoadRepsPair(
  loadLabel: string | null | undefined,
  reps: number | null | undefined,
): string {
  const loadRaw = loadLabel?.trim() ?? "";
  const loadMatch = loadRaw.match(/([\d.]+)/);
  let load = loadMatch ? loadMatch[1]! : "";
  if (!load && /body\s*weight|^bw$/i.test(loadRaw)) load = "BW";
  if (!load && loadRaw) load = loadRaw;
  if (!load) load = "BW";
  if (reps == null) return load === "BW" ? "BW" : `${load} kg`;
  if (load === "BW") return `${reps} reps`;
  return `${load} × ${reps}`;
}

export function previousSetLabel(
  exercise: ExerciseExecution,
  set: SetExecution,
  historyByKey: Record<string, string>,
): string {
  const prior = exercise.sets.find((s) => s.order === set.order - 1);
  if (prior) {
    if (prior.status !== "pending") {
      return formatLoadRepsPair(
        prior.actualLoadLabel ?? prior.prescribedLoadLabel,
        prior.actualReps ?? prior.prescribedReps,
      );
    }
    return formatLoadRepsPair(
      prior.prescribedLoadLabel,
      prior.prescribedReps,
    );
  }
  const key = `${exercise.exerciseId}:${set.order}`;
  const fromHistory = historyByKey[key];
  if (fromHistory) return fromHistory;
  if (set.order === 1) return "— first time";
  const prescribedPrior = formatLoadRepsPair(
    set.prescribedLoadLabel,
    set.prescribedReps,
  );
  return prescribedPrior || "—";
}

export type PlanChangeRow = {
  id: string;
  exerciseName: string;
  detail: string;
  value: string;
  skipped?: boolean;
};

export function planChangeRows(execution: WorkoutExecution): PlanChangeRow[] {
  const rows: PlanChangeRow[] = [];
  for (const exercise of execution.exercises) {
    const modifiedSets = exercise.sets.filter((s) => s.status === "modified");
    const skippedSets = exercise.sets.filter((s) => s.status === "skipped");
    if (modifiedSets.length > 0) {
      const loadChange = modifiedSets.find((s) => {
        const from = s.prescribedLoadLabel?.trim() ?? "";
        const to = s.actualLoadLabel?.trim() ?? "";
        return from && to && from !== to;
      });
      if (loadChange) {
        const from = loadChange.prescribedLoadLabel?.trim() ?? "—";
        const to = loadChange.actualLoadLabel?.trim() ?? "—";
        const orders = modifiedSets.map((s) => s.order).join(", ");
        rows.push({
          id: `${exercise.id}-load`,
          exerciseName: exercise.name,
          detail:
            modifiedSets.length > 1
              ? `Sets ${orders}`
              : `Set ${modifiedSets[0]!.order}`,
          value: `${from} → ${to}`,
        });
      } else {
        const repChange = modifiedSets[0];
        if (
          repChange &&
          repChange.prescribedReps != null &&
          repChange.actualReps != null &&
          repChange.prescribedReps !== repChange.actualReps
        ) {
          rows.push({
            id: `${exercise.id}-reps`,
            exerciseName: exercise.name,
            detail: `Set ${repChange.order}`,
            value: `${repChange.prescribedReps} → ${repChange.actualReps} reps`,
          });
        }
      }
    }
    if (skippedSets.length > 0) {
      rows.push({
        id: `${exercise.id}-skip`,
        exerciseName: exercise.name,
        detail:
          skippedSets.length > 1
            ? `Sets ${skippedSets.map((s) => s.order).join(", ")}`
            : `Set ${skippedSets[0]!.order}`,
        value: "Skipped",
        skipped: true,
      });
    }
  }
  return rows;
}

export function weekDotStatus(
  date: string,
  today: string,
  assignment: WorkoutAssignment | undefined,
): WeekStripStatus {
  const base = weekStripStatus(date, today, assignment);
  if (base === "today") return "future";
  if (base === "future") return "future";
  return base;
}

export function missedLogHeadline(count: number): string {
  if (count === 1) {
    return "One workout wasn't logged this week";
  }
  return `${count} workouts weren't logged this week`;
}

export function exerciseInstructionsFor(
  assignment: WorkoutAssignment | null | undefined,
  exerciseId: string,
): string | null {
  if (!assignment) return null;
  const match = assignment.workoutDay.exercises.find((ex) => ex.id === exerciseId);
  const note = match?.instructions?.trim();
  return note || null;
}

/* -------------------------------------------------------------------------- */
/* Exercise history and records for the active log (Z12-45: W-12, W-26)        */
/* -------------------------------------------------------------------------- */

/** One logged set as History lists it: "42.5 kg × 10", "12 reps". */
export type HistorySet = { order: number; label: string; kg: number | null };

/** One earlier session of a workout day, newest first in the list. */
export type HistorySession = {
  assignmentId: string;
  workoutDayName: string;
  localDate: string;
  /** Logged sets by exercise name (`exerciseNameKey`): plan versions renumber ids. */
  setsByExerciseName: Record<string, HistorySet[]>;
};

export type WorkoutHistory = {
  /** `${exerciseId}:${setOrder}` → "37.5 × 10": the Previous column. */
  previousByKey: Record<string, string>;
  /** Earlier finished sessions of this workout day, newest first. */
  sessions: HistorySession[];
};

export const EMPTY_WORKOUT_HISTORY: WorkoutHistory = {
  previousByKey: {},
  sessions: [],
};

/** How many earlier sessions History shows. */
export const HISTORY_SESSIONS = 3;

function kgOfLabel(label: string | null | undefined): number | null {
  const match = label?.trim().match(/^(\d+(?:\.\d+)?)\s*kg$/i);
  if (!match) return null;
  const kg = Number(match[1]);
  return Number.isFinite(kg) ? kg : null;
}

/** "42.5 kg × 10", "12 reps", "Bodyweight" when nothing more is known. */
export function historySetLabel(
  loadLabel: string | null | undefined,
  reps: number | null | undefined,
): string {
  const kg = kgOfLabel(loadLabel);
  const raw = loadLabel?.trim() ?? "";
  const bodyweight = raw === "" || /^(body\s*weight|bw)$/i.test(raw);
  if (kg != null) return reps != null ? `${kg} kg × ${reps}` : `${kg} kg`;
  if (bodyweight) return reps != null ? `${reps} reps` : "Bodyweight";
  return reps != null ? `${raw} × ${reps}` : raw;
}

/** The logged sets of one exercise of an execution, in order. */
export function historySetsOf(
  exercise: Pick<ExerciseExecution, "sets">,
): HistorySet[] {
  return [...exercise.sets]
    .sort((a, b) => a.order - b.order)
    .filter((set) => set.status === "completed" || set.status === "modified")
    .map((set) => {
      const load = set.actualLoadLabel ?? set.prescribedLoadLabel;
      return {
        order: set.order,
        label: historySetLabel(load, set.actualReps ?? set.prescribedReps),
        kg: kgOfLabel(load),
      };
    });
}

/**
 * The earlier finished sessions of this assignment's workout day in the last
 * 12 weeks (newest first, at most HISTORY_SESSIONS), and the Previous column
 * read from the newest one. A failed read gives an empty history: the column
 * falls back to in-session values and History says there is nothing yet.
 */
export async function loadWorkoutHistory(
  api: {
    listWorkoutAssignments: (
      relationshipId: string,
      query: { fromDate: string; toDate: string },
    ) => Promise<{ items: WorkoutAssignment[] }>;
    getWorkoutExecution: (id: string) => Promise<WorkoutExecution>;
  },
  assignment: WorkoutAssignment,
  today: string,
): Promise<WorkoutHistory> {
  try {
    const listed = await api.listWorkoutAssignments(
      assignment.coachingRelationshipId,
      { fromDate: addDays(today, -84), toDate: addDays(today, -1) },
    );
    const candidates = (listed.items as WorkoutAssignment[])
      .filter(
        (item) =>
          item.id !== assignment.id &&
          item.workoutDayId === assignment.workoutDayId &&
          (item.status === "completed" || item.status === "modified") &&
          item.execution?.id,
      )
      .sort(
        (a, b) =>
          b.localDate.localeCompare(a.localDate) ||
          Date.parse(b.windowStartsAt) - Date.parse(a.windowStartsAt),
      )
      .slice(0, HISTORY_SESSIONS);
    const sessions: HistorySession[] = [];
    const previousByKey: Record<string, string> = {};
    for (const item of candidates) {
      const execution = await api.getWorkoutExecution(item.execution!.id);
      const setsByExerciseName: Record<string, HistorySet[]> = {};
      for (const exercise of execution.exercises) {
        const sets = historySetsOf(exercise);
        if (sets.length > 0) setsByExerciseName[exerciseNameKey(exercise.name)] = sets;
        if (sessions.length > 0) continue;
        for (const set of exercise.sets) {
          if (set.status === "pending") continue;
          previousByKey[`${exercise.exerciseId}:${set.order}`] =
            formatLoadRepsPair(
              set.actualLoadLabel ?? set.prescribedLoadLabel,
              set.actualReps ?? set.prescribedReps,
            );
        }
      }
      sessions.push({
        assignmentId: item.id,
        workoutDayName: item.workoutDayName,
        localDate: item.localDate,
        setsByExerciseName,
      });
    }
    return { previousByKey, sessions };
  } catch {
    // Offline or a failed read: no history to show.
    return EMPTY_WORKOUT_HISTORY;
  }
}

/** The heaviest load logged for a lift before today, with the reps it was done for. */
export type ExerciseBest = { kg: number; reps: number | null };

/**
 * Every lift's heaviest kg load before `today`, by exercise name
 * (`exerciseNameKey`), from the strength read model (all time). It is what a
 * new record has to beat (W-12) and the History tab's "Heaviest" (W-26). A
 * failed read gives none, and then nothing is called a record.
 */
export async function loadExerciseBests(
  api: {
    getStrength: (
      relationshipId: string,
      query: { range: "all" },
    ) => Promise<{
      exercises: Array<{
        name: string;
        points: Array<{
          localDate: string;
          topLoadKg: number | null;
          reps: number | null;
        }>;
      }>;
    }>;
  },
  relationshipId: string,
  today: string,
): Promise<Record<string, ExerciseBest>> {
  const bests: Record<string, ExerciseBest> = {};
  try {
    const model = await api.getStrength(relationshipId, { range: "all" });
    for (const exercise of model.exercises) {
      const key = exerciseNameKey(exercise.name);
      for (const point of exercise.points) {
        if (point.localDate >= today || point.topLoadKg == null) continue;
        const best = bests[key];
        if (!best || point.topLoadKg > best.kg) {
          bests[key] = { kg: point.topLoadKg, reps: point.reps };
        }
      }
    }
  } catch {
    // No baseline: no record is claimed.
  }
  return bests;
}

/** "1:30" for a rest of 90 s; "0:45". */
export function formatRestLength(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/** "3 × 8–10 · 40 kg", "3 × 12", "3 sets": the plan chip of an exercise (W-03). */
export function exercisePlanLine(
  exercise: Pick<ExerciseExecution, "sets">,
): string {
  const sets = [...exercise.sets].sort((a, b) => a.order - b.order);
  if (sets.length === 0) return "";
  const reps = sets
    .map((set) => set.prescribedReps)
    .filter((value): value is number => value != null);
  let repPart = `${sets.length} ${sets.length === 1 ? "set" : "sets"}`;
  if (reps.length === sets.length) {
    const low = Math.min(...reps);
    const high = Math.max(...reps);
    repPart = `${sets.length} × ${low === high ? low : `${low}–${high}`}`;
  }
  const loads = new Set(
    sets.map((set) => {
      const kg = kgOfLabel(set.prescribedLoadLabel);
      return kg != null ? `${kg} kg` : (set.prescribedLoadLabel?.trim() ?? "");
    }),
  );
  const load = loads.size === 1 ? [...loads][0]! : "";
  const bodyweight = load === "" || /^(body\s*weight|bw)$/i.test(load);
  return bodyweight ? repPart : `${repPart} · ${load}`;
}

/** "4 sets · best 16 kg × 12", "2 of 3 sets", "Skipped": a finished exercise's line. */
export function exerciseDoneLine(
  exercise: Pick<ExerciseExecution, "sets">,
): string {
  const total = exercise.sets.length;
  const logged = historySetsOf(exercise);
  if (logged.length === 0) return "Skipped";
  const count =
    logged.length === total
      ? `${total} ${total === 1 ? "set" : "sets"}`
      : `${logged.length} of ${total} sets`;
  const withKg = logged.filter((set) => set.kg != null);
  if (withKg.length === 0) return count;
  const best = withKg.reduce((a, b) => (b.kg! > a.kg! ? b : a));
  return `${count} · best ${best.label}`;
}
