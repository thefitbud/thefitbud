import type {
  SetExecutionStatus,
  WorkoutAssignmentStatus,
  WorkoutExecutionStatus,
} from "@fitbud/contracts";

const OPEN_EXECUTION: ReadonlySet<WorkoutExecutionStatus> = new Set([
  "started",
  "paused",
]);

const QUALIFYING_EXECUTION: ReadonlySet<WorkoutExecutionStatus> = new Set([
  "completed",
  "modified",
  "skipped",
]);

export function isOpenWorkoutExecution(
  status: WorkoutExecutionStatus,
): boolean {
  return OPEN_EXECUTION.has(status);
}

/** Qualifying completion prevents Missed derivation. */
export function isQualifyingWorkoutExecution(
  status: WorkoutExecutionStatus,
): boolean {
  return QUALIFYING_EXECUTION.has(status);
}

export function canStartWorkoutAssignment(input: {
  assignmentStatus: WorkoutAssignmentStatus;
  hasOpenExecution: boolean;
}): boolean {
  if (input.hasOpenExecution) return false;
  return (
    input.assignmentStatus === "assigned" ||
    input.assignmentStatus === "missed"
  );
}

export function canPauseWorkoutExecution(
  status: WorkoutExecutionStatus,
): boolean {
  return status === "started";
}

export function canResumeWorkoutExecution(
  status: WorkoutExecutionStatus,
): boolean {
  return status === "paused";
}

export function canMutateOpenWorkoutExecution(
  status: WorkoutExecutionStatus,
): boolean {
  return isOpenWorkoutExecution(status);
}

export function canCompleteWorkoutExecution(input: {
  status: WorkoutExecutionStatus;
  requireSessionRpe: boolean;
  sessionRpe: number | null | undefined;
}): boolean {
  if (!isOpenWorkoutExecution(input.status)) return false;
  if (input.requireSessionRpe) {
    return (
      typeof input.sessionRpe === "number" &&
      input.sessionRpe >= 1 &&
      input.sessionRpe <= 10
    );
  }
  return true;
}

export function canSkipOpenWorkoutExecution(
  status: WorkoutExecutionStatus,
): boolean {
  return isOpenWorkoutExecution(status);
}

export function canSkipAssignedWorkout(input: {
  hasQualifyingExecution: boolean;
  hasOpenExecution: boolean;
}): boolean {
  return !input.hasQualifyingExecution && !input.hasOpenExecution;
}

/**
 * Derive assignment status from window + execution.
 * Missed is never written by the client.
 */
export function deriveWorkoutAssignmentStatus(input: {
  nowIso: string;
  windowEndsAt: string;
  executionStatus: WorkoutExecutionStatus | null;
}): WorkoutAssignmentStatus {
  const { executionStatus } = input;
  if (executionStatus === "started") return "in_progress";
  if (executionStatus === "paused") return "paused";
  if (executionStatus === "completed") return "completed";
  if (executionStatus === "modified") return "modified";
  if (executionStatus === "skipped") return "skipped";

  if (input.nowIso > input.windowEndsAt) {
    return "missed";
  }
  return "assigned";
}

/** Terminal status after complete: modified if any set differed or was skipped. */
export function resolveCompletedWorkoutStatus(
  setStatuses: SetExecutionStatus[],
): "completed" | "modified" {
  for (const status of setStatuses) {
    if (status === "modified" || status === "skipped") {
      return "modified";
    }
  }
  return "completed";
}

export function setCompletionIsModified(input: {
  prescribedReps: number | null;
  prescribedLoadLabel: string | null;
  actualReps: number | null;
  actualLoadLabel: string | null;
}): boolean {
  const reps =
    input.actualReps === null ? input.prescribedReps : input.actualReps;
  const load =
    input.actualLoadLabel === null
      ? input.prescribedLoadLabel
      : input.actualLoadLabel;
  return (
    reps !== input.prescribedReps || load !== input.prescribedLoadLabel
  );
}

/** JS getUTCDay()-style weekday: 0=Sun … 6=Sat for a YYYY-MM-DD. */
export function weekdayFromLocalDate(localDate: string): number {
  const [y, m, d] = localDate.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

export function compareLocalDates(a: string, b: string): number {
  return a.localeCompare(b);
}

export function addDaysToLocalDate(localDate: string, days: number): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + days));
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function eachLocalDateInclusive(fromDate: string, toDate: string): string[] {
  if (compareLocalDates(fromDate, toDate) > 0) return [];
  const dates: string[] = [];
  let cursor = fromDate;
  while (compareLocalDates(cursor, toDate) <= 0) {
    dates.push(cursor);
    cursor = addDaysToLocalDate(cursor, 1);
  }
  return dates;
}
