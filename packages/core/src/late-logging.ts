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
}): { decision: LogDecision; reason?: string } {
  if (input.relationshipEnded) {
    return { decision: "ended", reason: "relationship_ended" };
  }
  if (input.assignmentScheduleStatus === "superseded") {
    return { decision: "superseded", reason: "superseded" };
  }
  if (
    input.exceptionStatus === "resolved" &&
    input.clientLoggedAt &&
    input.exceptionResolvedAt &&
    input.clientLoggedAt < input.exceptionResolvedAt
  ) {
    return { decision: "ok_after_resolve" };
  }
  if (input.exceptionStatus === "resolved" && input.required) {
    return { decision: "locked", reason: "exception_resolved" };
  }
  if (!input.required) {
    const today = input.localDate;
    const clientDay = input.clientLoggedAt?.slice(0, 10);
    if (clientDay && clientDay !== today) {
      return { decision: "locked", reason: "optional_past_day" };
    }
    return { decision: "ok" };
  }
  if (input.alreadyLogged) {
    return { decision: "ok" };
  }
  return { decision: "ok_late" };
}
