import type {
  ExceptionSeverity,
  ExceptionSourceEntityType,
  ExceptionStatus,
  ExceptionType,
  MealComplianceOutcome,
  MealDeviationKind,
  WorkoutExecutionStatus,
} from "@fitbud/contracts";
import { deriveMealAssignmentStatus } from "./meal.js";
import { deriveWorkoutAssignmentStatus } from "./workout.js";

/** Documented MVP rule set — no opaque risk scores and no severity-rule editor. */
export const MVP_EXCEPTION_RULE_VERSION = "mvp.v2";

/**
 * Stored severities. On track is the absence of an exception, not a fifth
 * client-adherence value and not a numeric score.
 */
export const ADHERENCE_EXCEPTION_SEVERITIES = [
  "critical",
  "attention",
] as const satisfies readonly ExceptionSeverity[];

/** Open set for client roll-up. Resolved is history, not the active feed. */
export const ADHERENCE_OPEN_EXCEPTION_STATUSES = [
  "detected",
  "active",
  "acknowledged",
] as const satisfies readonly ExceptionStatus[];

/**
 * MVP activity defaults (documented, not opaque scores):
 * - Missed required workout: Critical.
 * - Explicit workout skip: Attention.
 * - Required meal still unlogged after its window: Critical.
 * - Explicit skip of a required meal: Critical.
 * - Recorded meal deviation or logged-later: Attention.
 * - Overdue check-in: Attention.
 * Missing evidence stays unlogged. It is not written as a confirmed skip.
 * One open exception per (type, source entity). Acknowledging or resolving
 * does not rewrite the source.
 */

export type ExceptionCandidate = {
  type: ExceptionType;
  severity: ExceptionSeverity;
  sourceEntityType: ExceptionSourceEntityType;
  sourceEntityId: string;
  summary: string;
  details: Record<string, unknown> | null;
};

export type ActivitySeverity = ExceptionSeverity | "on_track";

export function isOpenExceptionStatus(status: ExceptionStatus): boolean {
  return (
    status === "detected" || status === "active" || status === "acknowledged"
  );
}

/** Unresolved Critical or Attention, including acknowledged, keeps needs_attention. */
export function exceptionCountsTowardNeedsAttention(input: {
  status: ExceptionStatus;
  severity: ExceptionSeverity;
}): boolean {
  return (
    isOpenExceptionStatus(input.status) &&
    (input.severity === "critical" || input.severity === "attention")
  );
}

export function canAcknowledgeException(status: ExceptionStatus): boolean {
  return status === "detected" || status === "active";
}

export function canResolveException(status: ExceptionStatus): boolean {
  return status === "acknowledged";
}

/**
 * Mark reviewed is the acknowledged status. Undo is allowed only from there;
 * Resolve stays locked.
 */
export function canUndoAcknowledge(status: ExceptionStatus): boolean {
  return status === "acknowledged";
}

/** Status restored when Mark reviewed is undone. Active once the item was activated. */
export function restoredStatusAfterUndo(input: {
  activatedAt: string | null;
}): "detected" | "active" {
  return input.activatedAt ? "active" : "detected";
}

/** Needs you vs Reviewed for one client's open exception statuses. */
export type AttentionReviewBucket = "needs_you" | "reviewed";

/**
 * A client stays in Needs you while any open item is still detected or active.
 * They move to Reviewed only when every remaining open item is acknowledged.
 * Resolved items are history and do not keep the client in either list.
 */
export function attentionReviewBucket(
  statuses: readonly ExceptionStatus[],
): AttentionReviewBucket | null {
  let sawOpen = false;
  let sawUnreviewed = false;
  for (const status of statuses) {
    if (!isOpenExceptionStatus(status)) continue;
    sawOpen = true;
    if (status === "detected" || status === "active") sawUnreviewed = true;
  }
  if (!sawOpen) return null;
  return sawUnreviewed ? "needs_you" : "reviewed";
}

export function canActivateException(status: ExceptionStatus): boolean {
  return status === "detected";
}

export function exceptionKey(input: {
  type: ExceptionType;
  sourceEntityType: ExceptionSourceEntityType;
  sourceEntityId: string;
}): string {
  return `${input.type}:${input.sourceEntityType}:${input.sourceEntityId}`;
}

export function missedWorkoutCandidate(input: {
  assignmentId: string;
  localDate: string;
  windowEndsAt: string;
}): ExceptionCandidate {
  return {
    type: "missed_workout",
    severity: "critical",
    sourceEntityType: "workout_assignment",
    sourceEntityId: input.assignmentId,
    summary: "Missed workout",
    details: {
      localDate: input.localDate,
      windowEndsAt: input.windowEndsAt,
      rule: "missed_required_workout",
    },
  };
}

export function skippedWorkoutCandidate(input: {
  assignmentId: string;
  localDate: string;
}): ExceptionCandidate {
  return {
    type: "skipped_workout",
    severity: "attention",
    sourceEntityType: "workout_assignment",
    sourceEntityId: input.assignmentId,
    summary: "Skipped workout",
    details: {
      localDate: input.localDate,
      rule: "explicit_workout_skip",
    },
  };
}

export function overdueMealCandidate(input: {
  assignmentId: string;
  localDate: string;
  mealName: string;
  windowEndsAt: string;
}): ExceptionCandidate {
  return {
    type: "overdue_meal",
    severity: "critical",
    sourceEntityType: "meal_assignment",
    sourceEntityId: input.assignmentId,
    summary: `Required meal still unlogged: ${input.mealName}`,
    details: {
      localDate: input.localDate,
      mealName: input.mealName,
      windowEndsAt: input.windowEndsAt,
      rule: "required_meal_unlogged_after_window",
    },
  };
}

export function skippedMealCandidate(input: {
  assignmentId: string;
  localDate: string;
  mealName: string;
  loggedLater: boolean;
}): ExceptionCandidate {
  return {
    type: "skipped_meal",
    severity: "critical",
    sourceEntityType: "meal_assignment",
    sourceEntityId: input.assignmentId,
    summary: `Skipped required meal: ${input.mealName}`,
    details: {
      localDate: input.localDate,
      mealName: input.mealName,
      loggedLater: input.loggedLater,
      rule: "explicit_required_meal_skip",
    },
  };
}

export function mealDeviationCandidate(input: {
  assignmentId: string;
  localDate: string;
  mealName: string;
  deviationKind: MealDeviationKind | null;
  loggedLater: boolean;
}): ExceptionCandidate {
  return {
    type: "meal_deviation",
    severity: "attention",
    sourceEntityType: "meal_assignment",
    sourceEntityId: input.assignmentId,
    summary: `Meal deviation: ${input.mealName}`,
    details: {
      localDate: input.localDate,
      mealName: input.mealName,
      deviationKind: input.deviationKind,
      loggedLater: input.loggedLater,
      rule: "recorded_meal_deviation",
    },
  };
}

export function mealLoggedLaterCandidate(input: {
  assignmentId: string;
  localDate: string;
  mealName: string;
  windowEndsAt: string;
}): ExceptionCandidate {
  return {
    type: "meal_logged_later",
    severity: "attention",
    sourceEntityType: "meal_assignment",
    sourceEntityId: input.assignmentId,
    summary: `Meal logged later: ${input.mealName}`,
    details: {
      localDate: input.localDate,
      mealName: input.mealName,
      windowEndsAt: input.windowEndsAt,
      rule: "meal_logged_later",
    },
  };
}

export function overdueCheckinCandidate(input: {
  checkinId: string;
  localDate: string;
  windowEndsAt: string;
}): ExceptionCandidate {
  return {
    type: "overdue_checkin",
    severity: "attention",
    sourceEntityType: "checkin",
    sourceEntityId: input.checkinId,
    summary: "Overdue check-in",
    details: {
      localDate: input.localDate,
      windowEndsAt: input.windowEndsAt,
      rule: "derived_overdue_after_due_window",
    },
  };
}

export function workoutAdherenceCandidate(input: {
  assignmentId: string;
  localDate: string;
  windowEndsAt: string;
  nowIso: string;
  executionStatus: WorkoutExecutionStatus | null;
}): ExceptionCandidate | null {
  const status = deriveWorkoutAssignmentStatus({
    nowIso: input.nowIso,
    windowEndsAt: input.windowEndsAt,
    executionStatus: input.executionStatus,
  });
  if (status === "missed") {
    return missedWorkoutCandidate({
      assignmentId: input.assignmentId,
      localDate: input.localDate,
      windowEndsAt: input.windowEndsAt,
    });
  }
  if (status === "skipped") {
    return skippedWorkoutCandidate({
      assignmentId: input.assignmentId,
      localDate: input.localDate,
    });
  }
  return null;
}

export function workoutActivitySeverity(input: {
  assignmentId: string;
  localDate: string;
  windowEndsAt: string;
  nowIso: string;
  executionStatus: WorkoutExecutionStatus | null;
}): ActivitySeverity {
  return workoutAdherenceCandidate(input)?.severity ?? "on_track";
}

export function mealAdherenceCandidate(input: {
  assignmentId: string;
  localDate: string;
  mealName: string;
  windowEndsAt: string;
  nowIso: string;
  complianceOutcome: MealComplianceOutcome | null;
  loggedAt: string | null;
  deviationKind: MealDeviationKind | null;
}): ExceptionCandidate | null {
  const loggedLater =
    input.loggedAt != null && input.loggedAt > input.windowEndsAt;

  if (input.complianceOutcome === "skipped") {
    return skippedMealCandidate({
      assignmentId: input.assignmentId,
      localDate: input.localDate,
      mealName: input.mealName,
      loggedLater,
    });
  }

  const status = deriveMealAssignmentStatus({
    nowIso: input.nowIso,
    windowEndsAt: input.windowEndsAt,
    complianceOutcome: input.complianceOutcome,
    loggedAt: input.loggedAt,
  });

  if (status === "overdue") {
    return overdueMealCandidate({
      assignmentId: input.assignmentId,
      localDate: input.localDate,
      mealName: input.mealName,
      windowEndsAt: input.windowEndsAt,
    });
  }

  const hasDeviation =
    input.complianceOutcome === "modified" || input.deviationKind != null;
  if (hasDeviation) {
    return mealDeviationCandidate({
      assignmentId: input.assignmentId,
      localDate: input.localDate,
      mealName: input.mealName,
      deviationKind: input.deviationKind,
      loggedLater: status === "logged_later",
    });
  }
  if (status === "logged_later") {
    return mealLoggedLaterCandidate({
      assignmentId: input.assignmentId,
      localDate: input.localDate,
      mealName: input.mealName,
      windowEndsAt: input.windowEndsAt,
    });
  }
  return null;
}

export function mealActivitySeverity(input: {
  assignmentId: string;
  localDate: string;
  mealName: string;
  windowEndsAt: string;
  nowIso: string;
  complianceOutcome: MealComplianceOutcome | null;
  loggedAt: string | null;
  deviationKind: MealDeviationKind | null;
}): ActivitySeverity {
  return mealAdherenceCandidate(input)?.severity ?? "on_track";
}

/**
 * Filter candidates that already have an exception for the same source.
 * Callers pass open + acknowledged + resolved keys so Resolve cannot be undone
 * by immediate re-detection of the same hole.
 */
export function filterNewExceptionCandidates(
  candidates: ExceptionCandidate[],
  blockedKeys: ReadonlySet<string>,
): ExceptionCandidate[] {
  return candidates.filter(
    (candidate) => !blockedKeys.has(exceptionKey(candidate)),
  );
}
