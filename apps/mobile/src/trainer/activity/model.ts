import {
  addDaysToLocalDate,
  formatCivilDate,
  formatLocalDate,
  formatRelative,
  mealEditedByLine,
  mealRemovedActivityLine,
  mealWasLine,
} from "@fitbud/core";

export type ActivityFilter =
  | "all"
  | "workouts"
  | "meals"
  | "checkins"
  | "changes";

export type ActivityTagKind =
  | "new_best"
  | "ate_out"
  | "as_planned"
  | "changed"
  | "checkin"
  | "change"
  | "edited"
  | "removed"
  | "note_seen"
  | "ask"
  | "other";

export type ActivityTag = {
  kind: ActivityTagKind;
  label: string;
};

export type ActivityEventLike = {
  id: string;
  relationshipId: string;
  traineeDisplayName: string | null;
  type: string;
  subtype: string | null;
  occurredAt: string;
  traineeLocalTime: string | null;
  summary: string;
  kcal?: number | null;
  link?: string | null;
  /** Z14-16: on a client's own meal edit or removal, the entry, its day and the previous kcal. */
  entryId?: string | null;
  mealDate?: string | null;
  previousKcal?: number | null;
  /** Z14-33: the removed meal was an ate-out; unread dot; inbox row to mark read. */
  previousAteOut?: boolean;
  unread?: boolean;
  notificationId?: string;
};

export const ACTIVITY_FILTERS: Array<{ id: ActivityFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "workouts", label: "Workouts" },
  { id: "meals", label: "Meals" },
  { id: "checkins", label: "Check-ins" },
  { id: "changes", label: "Changes" },
];

export function matchesActivityFilter(
  event: ActivityEventLike,
  filter: ActivityFilter,
): boolean {
  if (filter === "all") return true;
  const type = event.type.toLowerCase();
  const subtype = (event.subtype ?? "").toLowerCase();
  const summary = event.summary.toLowerCase();
  // Z14-16: a client's own meal edit or removal shows under Meals and Changes.
  const clientMealChange = type === "client_edited" || type === "client_removed";
  if (filter === "meals" && clientMealChange) return true;
  if (filter === "changes" && clientMealChange) return true;
  if (filter === "meals") {
    return type.includes("meal") || summary.includes("meal") || summary.includes("kcal");
  }
  if (filter === "workouts") {
    return type.includes("workout") || summary.includes("workout");
  }
  if (filter === "checkins") {
    return type.includes("checkin") || type.includes("check-in") || summary.includes("check-in");
  }
  if (filter === "changes") {
    return (
      type.includes("change") ||
      type.includes("log_edit") ||
      type.includes("coach_log") ||
      subtype.includes("change") ||
      summary.includes("changed") ||
      summary.includes("time")
    );
  }
  return true;
}

export function activityTag(event: ActivityEventLike): ActivityTag {
  const type = event.type.toLowerCase();
  const subtype = (event.subtype ?? "").toLowerCase();
  const summary = event.summary.toLowerCase();

  // Z14-16 (D-W14-23 a): quiet neutral "Edited" / "Removed" tags. A rating a
  // client changed on a finished workout keeps its own label.
  if (type === "client_removed") return { kind: "removed", label: "Removed" };
  if (type === "client_edited") {
    return subtype === "rating"
      ? { kind: "other", label: "Rating" }
      : { kind: "edited", label: "Edited" };
  }
  if (type.includes("checkin") || summary.includes("check-in")) {
    return { kind: "checkin", label: "Check-in" };
  }
  if (summary.includes("note") && summary.includes("saw")) {
    return { kind: "note_seen", label: "Note seen" };
  }
  if (type.includes("ask") || summary.includes("coach ask")) {
    return { kind: "ask", label: "Ask" };
  }
  if (
    type.includes("change") ||
    type.includes("log_edit") ||
    summary.includes("changed")
  ) {
    return { kind: "change", label: "Change" };
  }
  if (type.includes("workout") || summary.includes("workout")) {
    if (summary.includes("best") || subtype.includes("best")) {
      return { kind: "new_best", label: "New best" };
    }
    return { kind: "other", label: "Workout" };
  }
  if (type.includes("meal") || summary.includes("meal")) {
    if (
      subtype.includes("out") ||
      summary.includes("ate out") ||
      subtype.includes("dining")
    ) {
      return { kind: "ate_out", label: "Ate out" };
    }
    if (
      subtype.includes("modif") ||
      subtype.includes("changed") ||
      summary.includes("changed")
    ) {
      return { kind: "changed", label: "Changed" };
    }
    if (
      subtype.includes("confirm") ||
      subtype.includes("as planned") ||
      subtype.includes("on plan") ||
      summary.includes("as planned")
    ) {
      return { kind: "as_planned", label: "As planned" };
    }
    return { kind: "as_planned", label: event.subtype ?? "Meal" };
  }
  return { kind: "other", label: event.subtype ?? "Activity" };
}

/** TODAY / YESTERDAY / civil date, for the feed day headers. */
export function activityDayLabel(
  isoDay: string,
  today: string,
): string {
  if (isoDay === today) return "Today";
  if (isoDay === addDaysToLocalDate(today, -1)) return "Yesterday";
  return formatCivilDate(isoDay);
}

export function activityTimeLine(
  event: ActivityEventLike,
  nowIso = new Date().toISOString(),
): string {
  const relative = formatRelative(event.occurredAt, nowIso);
  if (event.traineeLocalTime) {
    return `${relative} · ${event.traineeLocalTime} their time`;
  }
  return relative;
}

export function firstName(displayName: string | null | undefined): string {
  const trimmed = (displayName ?? "Client").trim();
  return trimmed.split(/\s+/)[0] || "Client";
}

/** Civil day window for "Last 7 days" eyebrow. */
export function lastSevenDaysSince(today = formatLocalDate(new Date(), "UTC")): string {
  return addDaysToLocalDate(today, -6);
}

export function emptyFilterCopy(input: {
  filter: ActivityFilter;
  clientFirstName: string | null;
}): { title: string; body: string | null } {
  const who = input.clientFirstName;
  const topic =
    input.filter === "workouts"
      ? "workout activity"
      : input.filter === "meals"
        ? "meal activity"
        : input.filter === "checkins"
          ? "check-in activity"
          : input.filter === "changes"
            ? "change activity"
            : "activity";
  if (who) {
    return {
      title: `No ${topic} in the last 7 days`,
      body:
        input.filter === "checkins"
          ? `${who}'s next check-in will show here when they send it.`
          : null,
    };
  }
  return {
    title: `No ${topic} in the last 7 days`,
    body:
      input.filter === "all"
        ? "It'll appear as your clients log."
        : "Try another filter, or clear the client filter.",
  };
}

export function parseMealComplianceId(eventId: string): string | null {
  const match = /^meal:([0-9a-f-]{36})$/i.exec(eventId);
  return match?.[1] ?? null;
}

type ClientEditFields = {
  lastEditedByRole?: "trainee" | "coach" | null;
  lastEditedAt?: string | null;
  updatedAt: string;
  previousValue?: {
    outcome: string;
    deviationKind: string | null;
    kcal: number | null;
  } | null;
};

/** Z14-16: the client changed this entry (a coach edit is not this). */
export function isClientEdited(
  compliance: Pick<ClientEditFields, "lastEditedByRole"> | null | undefined,
): boolean {
  return compliance?.lastEditedByRole === "trainee";
}

/**
 * The quiet box on a meal the client edited (TM-09f): "Edited by Aarav · Sat 14
 * Nov, 2:05 pm" and "Was 610 kcal · as planned". Null when the client never
 * edited it, or when a coach did.
 */
export function clientEditMarker(
  compliance: ClientEditFields | null | undefined,
  clientName: string,
  zone: string,
): { by: string; was: string | null } | null {
  if (!compliance || !isClientEdited(compliance)) return null;
  return {
    by: mealEditedByLine({
      clientName,
      editedAt: compliance.lastEditedAt ?? compliance.updatedAt,
      zone,
    }),
    was: compliance.previousValue ? mealWasLine(compliance.previousValue) : null,
  };
}


/**
 * The row's sentence without the client's name (the name is its own link line,
 * Z14-33). A removal reads as TM-09e: "removed their dinner log (Fri 13 Nov) ·
 * was 1,120 kcal, ate out"; everything else is the feed summary and kcal.
 */
export function activitySentence(event: ActivityEventLike): string {
  if (event.type === "client_removed" && event.entryId) {
    const line = mealRemovedActivityLine({
      clientName: "X",
      summary: event.summary,
      mealDate: event.mealDate ?? null,
      previousKcal: event.previousKcal ?? null,
      previousAteOut: event.previousAteOut ?? false,
    });
    return line.replace(/^X /, "");
  }
  const kcal = event.kcal != null ? ` · ${event.kcal.toLocaleString("en-IN")} kcal` : "";
  return `${event.summary}${kcal}`;
}
