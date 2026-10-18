import type { WorkoutExecution } from "@fitbud/contracts";

const MAX_DURATION_MINUTES = 240;

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
