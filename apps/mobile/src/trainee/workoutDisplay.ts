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

export async function loadPreviousSetHistory(
  api: {
    listWorkoutAssignments: (
      relationshipId: string,
      query: { fromDate: string; toDate: string },
    ) => Promise<{ items: WorkoutAssignment[] }>;
    getWorkoutExecution: (id: string) => Promise<WorkoutExecution>;
  },
  assignment: WorkoutAssignment,
  today: string,
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  try {
    const listed = await api.listWorkoutAssignments(
      assignment.coachingRelationshipId,
      {
        fromDate: addDays(today, -84),
        toDate: addDays(today, -1),
      },
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
      );
    const latest = candidates[0];
    if (!latest?.execution?.id) return map;
    const exec = await api.getWorkoutExecution(latest.execution.id);
    for (const exercise of exec.exercises) {
      for (const set of exercise.sets) {
        if (set.status === "pending") continue;
        const label = formatLoadRepsPair(
          set.actualLoadLabel ?? set.prescribedLoadLabel,
          set.actualReps ?? set.prescribedReps,
        );
        map[`${exercise.exerciseId}:${set.order}`] = label;
      }
    }
  } catch {
    // Offline / errors — column falls back to in-session values.
  }
  return map;
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
    return "One workout this week wasn't logged. If you did it, log it now.";
  }
  return `${count} workouts this week weren't logged. If you did them, log them now.`;
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
