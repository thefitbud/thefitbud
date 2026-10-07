import type {
  ExceptionSourceEntityType,
  ExceptionStatus,
  ExceptionType,
} from "@fitbud/contracts";

/** Documented MVP rule set — no opaque risk scores. */
export const MVP_EXCEPTION_RULE_VERSION = "mvp.v1";

/**
 * MVP thresholds (documented, not opaque scores):
 * - Missed workout: C3 derived Missed after configured completion window.
 * - Overdue meal: C4 derived Overdue after configured confirmation window.
 * - Overdue check-in: C5 derived Overdue after configured due window.
 * Any such derived signal is a meaningful exception. One open exception per
 * (type, source entity). Acknowledging/resolving does not rewrite the source.
 */

export type ExceptionCandidate = {
  type: ExceptionType;
  sourceEntityType: ExceptionSourceEntityType;
  sourceEntityId: string;
  summary: string;
  details: Record<string, unknown> | null;
};

export function isOpenExceptionStatus(status: ExceptionStatus): boolean {
  return (
    status === "detected" || status === "active" || status === "acknowledged"
  );
}

export function canAcknowledgeException(status: ExceptionStatus): boolean {
  return status === "detected" || status === "active";
}

export function canResolveException(status: ExceptionStatus): boolean {
  return status === "acknowledged";
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
    sourceEntityType: "workout_assignment",
    sourceEntityId: input.assignmentId,
    summary: `Missed workout on ${input.localDate}`,
    details: {
      localDate: input.localDate,
      windowEndsAt: input.windowEndsAt,
      rule: "derived_missed_after_completion_window",
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
    sourceEntityType: "meal_assignment",
    sourceEntityId: input.assignmentId,
    summary: `Overdue meal confirmation: ${input.mealName} (${input.localDate})`,
    details: {
      localDate: input.localDate,
      mealName: input.mealName,
      windowEndsAt: input.windowEndsAt,
      rule: "derived_overdue_after_confirmation_window",
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
    sourceEntityType: "checkin",
    sourceEntityId: input.checkinId,
    summary: `Overdue check-in for ${input.localDate}`,
    details: {
      localDate: input.localDate,
      windowEndsAt: input.windowEndsAt,
      rule: "derived_overdue_after_due_window",
    },
  };
}

/** Filter candidates that already have an open exception for the same source. */
export function filterNewExceptionCandidates(
  candidates: ExceptionCandidate[],
  openKeys: ReadonlySet<string>,
): ExceptionCandidate[] {
  return candidates.filter(
    (candidate) => !openKeys.has(exceptionKey(candidate)),
  );
}
