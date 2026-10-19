import type { WorkoutDay, WorkoutExecution } from "@fitbud/contracts";

const MAX_DURATION_MINUTES = 240;
const WORK_SECONDS_PER_SET = 45;

/** Bounded session duration from start/complete; null if incomplete or absurd. */
export function durationMinutesFromExecution(
  execution: Pick<WorkoutExecution, "startedAt" | "completedAt">,
): number | null {
  if (!execution.completedAt) return null;
  const started = Date.parse(execution.startedAt);
  const completed = Date.parse(execution.completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return null;
  if (completed < started) return null;
  const raw = Math.round((completed - started) / 60_000);
  if (raw < 1) return 1;
  if (raw > MAX_DURATION_MINUTES) return null;
  return raw;
}

/**
 * Estimated session length from plan rest + sets.
 * Returns null when rest data is incomplete (omit the duration in UI).
 */
export function estimateDurationMinutesFromDay(
  day: Pick<WorkoutDay, "exercises">,
): number | null {
  const exercises = day.exercises;
  if (exercises.length === 0) return null;

  let totalSec = 0;
  let restIntervals = 0;

  for (const exercise of exercises) {
    const sets = [...exercise.setTargets].sort((a, b) => a.order - b.order);
    if (sets.length === 0) return null;
    for (let i = 0; i < sets.length; i++) {
      totalSec += WORK_SECONDS_PER_SET;
      if (i < sets.length - 1) {
        const rest = sets[i]?.restSeconds;
        if (rest == null) return null;
        totalSec += rest;
        restIntervals += 1;
      }
    }
  }

  // Single-set-only days with no rest intervals are still computable from set work.
  if (restIntervals === 0 && exercises.every((ex) => ex.setTargets.length > 1)) {
    return null;
  }

  const minutes = Math.round(totalSec / 60);
  if (minutes < 1) return 1;
  if (minutes > MAX_DURATION_MINUTES) return null;
  return minutes;
}
