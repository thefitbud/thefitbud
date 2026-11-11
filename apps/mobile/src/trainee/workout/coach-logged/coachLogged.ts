import type { WorkoutExecution } from "@fitbud/contracts";
import { formatLocalDate, zonedDateTimeFormat } from "@fitbud/core";
import { formatCivilDateShort } from "../../workoutDisplay";

export type CoachLogState = "logged" | "edited" | null;

type RoleFields = Pick<WorkoutExecution, "loggedByRole" | "lastEditedByRole">;

/**
 * R1 (D-P2-21): an entry the coach created is "logged" (read-only to the
 * trainee). An entry the trainee logged and the coach edited is "edited" and
 * stays the trainee's. Old payloads without the fields are the trainee's own.
 */
export function coachLogState(
  execution: RoleFields | null | undefined,
): CoachLogState {
  if (!execution) return null;
  if (execution.loggedByRole === "coach") return "logged";
  if (execution.lastEditedByRole === "coach") return "edited";
  return null;
}

export function coachLogTitle(state: Exclude<CoachLogState, null>): string {
  return state === "logged" ? "Logged by your coach" : "Edited by your coach";
}

/** "7:12 am" in the given time zone. */
function clockTime(iso: string, timeZone: string): string {
  return zonedDateTimeFormat("en-IN", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    .replace(/\s?(am|pm)/i, (_m, p: string) => ` ${p.toLowerCase()}`);
}

/** Civil date in the time zone of an ISO instant, as "Mon 2 Nov". */
export function civilDateOf(iso: string, timeZone: string): string {
  return formatCivilDateShort(formatLocalDate(new Date(iso), timeZone));
}

/** "7:12–8:04 am", or "7:12 am" when there is no end. */
export function sessionTimeRange(
  startedAt: string,
  completedAt: string | null,
  timeZone: string,
): string {
  const start = clockTime(startedAt, timeZone);
  if (!completedAt) return start;
  const end = clockTime(completedAt, timeZone);
  const [sT, sP] = start.split(" ");
  const [eT, eP] = end.split(" ");
  return sP === eP ? `${sT}–${eT} ${eP}` : `${start}–${end}`;
}

/** The banner's second line; no leading separator when the name is empty. */
export function coachLogMeta(
  state: Exclude<CoachLogState, null>,
  execution: WorkoutExecution,
  coachName: string,
  timeZone: string,
): string {
  const parts =
    state === "edited"
      ? [coachName.trim(), civilDateOf(execution.updatedAt, timeZone)]
      : [
          coachName.trim(),
          civilDateOf(execution.startedAt, timeZone),
          sessionTimeRange(execution.startedAt, execution.completedAt, timeZone),
        ];
  return parts.filter(Boolean).join(" · ");
}
