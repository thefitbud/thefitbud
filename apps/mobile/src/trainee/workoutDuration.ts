import type { WorkoutDay, WorkoutExecution } from "@fitbud/contracts";

const MAX_DURATION_MINUTES = 240;
const WORK_SECONDS_PER_SET = 45;

/**
 * Seconds since the session started, from the execution's own server
 * timestamps (Z12-44), so the clock survives pause, resume, and an app kill
 * and relaunch: nothing is held only in memory.
 *
 * The server keeps `startedAt`, the current `pausedAt` and `completedAt`, and
 * no running total of paused time, so this is wall-clock time from the start:
 * it stands still while the session is paused (at `pausedAt`) and, after a
 * resume, includes the pause. It is the same rule as the finished duration
 * (`durationMinutesFromExecution`, start to finish), so the in-progress clock
 * and the summary's "Duration" never disagree. Excluding paused time needs a
 * stored total on the server (a migration; listed as a follow-up).
 */
export function elapsedSeconds(
  execution: Pick<WorkoutExecution, "startedAt" | "pausedAt" | "completedAt">,
  nowMs: number,
): number {
  const started = Date.parse(execution.startedAt);
  if (!Number.isFinite(started)) return 0;
  const stopAt = execution.completedAt ?? execution.pausedAt;
  const end = stopAt ? Date.parse(stopAt) : nowMs;
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - started) / 1000));
}

/** "23:14" (minutes:seconds), "1:02:05" past an hour (W-01b). */
export function formatElapsedClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  return `${minutes}:${ss}`;
}

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
