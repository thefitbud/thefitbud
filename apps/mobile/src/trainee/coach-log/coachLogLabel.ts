import { formatCivilDate, formatLocalDate } from "@fitbud/core";

export type CoachLogRoles = {
  loggedByRole?: "trainee" | "coach" | null;
  lastEditedByRole?: "trainee" | "coach" | null;
};

/**
 * Z9-12 (PLAN-v2 D-P2-21, R1). An entry the coach created reads "Logged by
 * your coach" (and stays so after later coach edits); an entry the trainee
 * logged and the coach edited reads "Edited by your coach · Mon 2 Nov".
 * Returns null when the trainee owns the entry untouched.
 */
export function coachLogLabel(
  roles: CoachLogRoles,
  editedAt: string | null | undefined,
  timeZone: string,
): string | null {
  if (roles.loggedByRole === "coach") return "Logged by your coach";
  if (roles.lastEditedByRole === "coach") {
    const when = editedAt ? new Date(editedAt) : null;
    if (when && !Number.isNaN(when.getTime())) {
      return `Edited by your coach · ${formatCivilDate(formatLocalDate(when, timeZone), { includeWeekday: true })}`;
    }
    return "Edited by your coach";
  }
  return null;
}
