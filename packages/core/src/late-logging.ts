import { formatLocalDate } from "./timezone.js";

export type LogDecision =
  | "ok"
  | "ok_late"
  | "ok_after_resolve"
  | "locked"
  | "superseded"
  | "ended";

export function canLog(input: {
  assignmentScheduleStatus?: "scheduled" | "superseded";
  relationshipEnded?: boolean;
  exceptionStatus?: "active" | "resolved" | "acknowledged" | null;
  exceptionResolvedAt?: string | null;
  nowIso: string;
  clientLoggedAt?: string;
  localDate: string;
  traineeTimezone: string;
  required: boolean;
  alreadyLogged?: boolean;
  windowEndsAt?: string;
}): { decision: LogDecision; reason?: string } {
  if (input.relationshipEnded) {
    return { decision: "ended", reason: "relationship_ended" };
  }
  if (input.assignmentScheduleStatus === "superseded") {
    return { decision: "superseded", reason: "superseded" };
  }

  const logInstant = input.clientLoggedAt ?? input.nowIso;
  const logLocalDate = formatLocalDate(
    new Date(logInstant),
    input.traineeTimezone,
  );

  if (
    input.exceptionStatus === "resolved" &&
    input.clientLoggedAt &&
    input.exceptionResolvedAt &&
    input.clientLoggedAt < input.exceptionResolvedAt
  ) {
    return { decision: "ok_after_resolve" };
  }

  if (!input.required) {
    if (logLocalDate !== input.localDate) {
      return { decision: "locked", reason: "optional_past_day" };
    }
    return { decision: "ok" };
  }

  if (input.exceptionStatus === "resolved") {
    return { decision: "locked", reason: "exception_resolved" };
  }

  if (input.alreadyLogged) {
    const nowLocalDate = formatLocalDate(
      new Date(input.nowIso),
      input.traineeTimezone,
    );
    if (nowLocalDate !== input.localDate) {
      return { decision: "locked", reason: "edit_window_closed" };
    }
    return { decision: "ok" };
  }

  const windowEnd = input.windowEndsAt ?? input.nowIso;
  if (logInstant <= windowEnd) {
    return { decision: "ok" };
  }

  return { decision: "ok_late" };
}
