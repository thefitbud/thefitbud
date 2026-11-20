/**
 * TM-11 session detail helpers: metrics, finished-early, plan lines, set rows.
 */
import type {
  ExerciseExecution,
  SetExecution,
  WorkoutAssignment,
  WorkoutExecution,
} from "@fitbud/contracts";
import { formatClockTime, formatCivilDate, formatNumber } from "@fitbud/core";
import { durationMinutesFromExecution } from "../../trainee/workoutDuration";
import {
  planChangeRows,
  type PlanChangeRow,
} from "../../trainee/workoutDisplay";
import {
  sessionSetCounts,
  sessionVolumeKg,
} from "../../trainee/workoutSession";

export type SessionMetric = {
  id: "duration" | "volume" | "sets" | "effort";
  value: string;
  label: string;
};

export type SessionStatusKind = "finished" | "finished_early" | "modified";

export type SessionSetRow = {
  order: number;
  kg: string;
  reps: string;
  added?: boolean;
  skipped?: boolean;
};

export type SessionExerciseCard = {
  id: string;
  name: string;
  plan: string | null;
  askedYou?: boolean;
  skippedAll?: boolean;
  skippedAllLabel?: string;
  sets: SessionSetRow[];
};

export function finishedEarly(execution: WorkoutExecution): boolean {
  const counts = sessionSetCounts(execution);
  if (counts.total === 0) return false;
  return counts.skipped > 0 || counts.done < counts.total;
}

export function sessionStatus(execution: WorkoutExecution): SessionStatusKind {
  if (finishedEarly(execution)) return "finished_early";
  if (execution.status === "modified") return "modified";
  return "finished";
}

export function sessionStatusLabel(kind: SessionStatusKind): string {
  if (kind === "finished_early") return "Finished early";
  if (kind === "modified") return "Modified";
  return "Finished";
}

export function sessionMetrics(execution: WorkoutExecution): SessionMetric[] {
  const minutes = durationMinutesFromExecution(execution);
  const volume = sessionVolumeKg(execution);
  const counts = sessionSetCounts(execution);
  const rpe = execution.sessionRpe;
  return [
    {
      id: "duration",
      value: minutes != null ? `${minutes} min` : "—",
      label: "Duration",
    },
    {
      id: "volume",
      value: volume != null ? `${formatNumber(volume)} kg` : "—",
      label: "Volume",
    },
    {
      id: "sets",
      value: counts.total > 0 ? `${counts.done} / ${counts.total}` : "—",
      label: "Sets",
    },
    {
      id: "effort",
      value: rpe != null ? `${rpe} / 10` : "—",
      label: "Effort",
    },
  ];
}

/** "Lower body B · today 6:31–7:23 pm" / "Lower body A · Sat 7 Nov · 31 min". */
export function sessionSubtitle(input: {
  dayName: string;
  localDate: string;
  today: string;
  zone: string;
  execution: WorkoutExecution;
}): string {
  const minutes = durationMinutesFromExecution(input.execution);
  const start = formatClockTime(input.execution.startedAt, input.zone);
  const end = input.execution.completedAt
    ? formatClockTime(input.execution.completedAt, input.zone)
    : null;
  if (input.localDate === input.today && start && end) {
    return `${input.dayName} · today ${start}–${end}`;
  }
  const day = formatCivilDate(input.localDate);
  if (minutes != null) return `${input.dayName} · ${day} · ${minutes} min`;
  return `${input.dayName} · ${day}`;
}

function loadCell(set: SetExecution): string {
  if (set.status === "skipped" || set.status === "pending") return "—";
  const raw = (set.actualLoadLabel ?? set.prescribedLoadLabel ?? "").trim();
  if (!raw) return "—";
  const match = raw.match(/([\d.]+)/);
  return match ? match[1]! : raw;
}

function repsCell(set: SetExecution): { text: string; skipped?: boolean } {
  if (set.status === "skipped") return { text: "Skipped", skipped: true };
  if (set.status === "pending") return { text: "—", skipped: true };
  if (set.actualReps != null) return { text: String(set.actualReps) };
  return { text: "—" };
}

function planForExercise(
  assignment: WorkoutAssignment | null,
  exercise: ExerciseExecution,
): string | null {
  const planned = assignment?.workoutDay?.exercises?.find(
    (ex) => ex.id === exercise.exerciseId,
  );
  const targets = [...(planned?.setTargets ?? [])].sort(
    (a, b) => a.order - b.order,
  );
  if (targets.length === 0) {
    const fromExec = [...exercise.sets].sort((a, b) => a.order - b.order);
    if (fromExec.length === 0) return null;
    const reps = fromExec
      .map((s) => s.prescribedReps)
      .filter((r): r is number => r != null);
    const load = fromExec[0]?.prescribedLoadLabel?.replace(/\s*kg$/i, "").trim();
    const count = fromExec.length;
    if (reps.length === 0) return `Plan ${count} sets`;
    const min = Math.min(...reps);
    const max = Math.max(...reps);
    const repPart = min === max ? `${min}` : `${min}–${max}`;
    return load
      ? `Plan ${count} × ${repPart} · ${load} kg`
      : `Plan ${count} × ${repPart}`;
  }
  const reps = targets
    .map((t) => t.reps)
    .filter((r): r is number => r != null);
  const load = targets[0]?.loadLabel?.replace(/\s*kg$/i, "").trim();
  const count = targets.length;
  if (reps.length === 0) return `Plan ${count} sets`;
  const min = Math.min(...reps);
  const max = Math.max(...reps);
  const repPart = min === max ? `${min}` : `${min}–${max}`;
  return load
    ? `Plan ${count} × ${repPart} · ${load} kg`
    : `Plan ${count} × ${repPart}`;
}

export function sessionExerciseCards(
  execution: WorkoutExecution,
  assignment: WorkoutAssignment | null,
  askExerciseIds: ReadonlySet<string> = new Set(),
): SessionExerciseCard[] {
  const plannedById = new Map(
    (assignment?.workoutDay?.exercises ?? []).map((ex) => [ex.id, ex] as const),
  );
  return [...execution.exercises]
    .sort((a, b) => a.order - b.order)
    .map((exercise) => {
      const planned = plannedById.get(exercise.exerciseId);
      const plannedCount = planned?.setTargets?.length ?? exercise.sets.length;
      const sets = [...exercise.sets].sort((a, b) => a.order - b.order);
      const allSkipped =
        sets.length > 0 && sets.every((s) => s.status === "skipped");
      const rows: SessionSetRow[] = allSkipped
        ? []
        : sets.map((set) => {
            const reps = repsCell(set);
            const added =
              plannedCount > 0 &&
              set.order > plannedCount &&
              (set.status === "completed" || set.status === "modified");
            return {
              order: set.order,
              kg: loadCell(set),
              reps: reps.text,
              added: added || undefined,
              skipped: reps.skipped || undefined,
            };
          });
      return {
        id: exercise.id,
        name: exercise.name,
        plan: planForExercise(assignment, exercise),
        askedYou:
          askExerciseIds.has(exercise.id) ||
          askExerciseIds.has(exercise.exerciseId) ||
          undefined,
        skippedAll: allSkipped || undefined,
        skippedAllLabel: allSkipped
          ? `— Skipped all ${sets.length} ${sets.length === 1 ? "set" : "sets"}`
          : undefined,
        sets: rows,
      };
    });
}

export function earlyFinishBanner(
  execution: WorkoutExecution,
  firstName: string,
): string | null {
  if (!finishedEarly(execution)) return null;
  const counts = sessionSetCounts(execution);
  const missing = Math.max(0, counts.total - counts.done);
  const skippedNames = [...execution.exercises]
    .filter(
      (ex) =>
        ex.status === "skipped" ||
        ex.sets.every((s) => s.status === "skipped"),
    )
    .map((ex) => ex.name);
  if (skippedNames.length >= 2) {
    const last = skippedNames[skippedNames.length - 1]!;
    const head = skippedNames.slice(0, -1).join(", ");
    return `${missing} sets weren’t logged. ${firstName} finished early and skipped ${head} and ${last}.`;
  }
  if (skippedNames.length === 1) {
    return `${missing} sets weren’t logged. ${firstName} finished early and skipped ${skippedNames[0]}.`;
  }
  return `${missing} sets weren’t logged. ${firstName} finished early.`;
}

export function changeChips(execution: WorkoutExecution): PlanChangeRow[] {
  return planChangeRows(execution);
}

export function changeChipLabel(row: PlanChangeRow): string {
  if (row.skipped) {
    return `− ${row.exerciseName}`;
  }
  if (/→/.test(row.value)) {
    return `${row.exerciseName}: ${row.value}`;
  }
  if (row.value === "Skipped") return `− ${row.exerciseName}`;
  return `+ ${row.exerciseName}`;
}
