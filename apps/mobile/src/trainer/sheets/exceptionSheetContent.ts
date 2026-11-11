import type { ExceptionDetail, ResolveExceptionRequest } from "@fitbud/contracts";
import { formatCivilDate, formatPersonName } from "@fitbud/core";
import { labelFor } from "../labels";

/** Frame 33 outcome chips, in frame order. Values are the API `outcome` enum. */
export const RESOLVE_OUTCOMES: ReadonlyArray<{
  value: Exclude<NonNullable<ResolveExceptionRequest["outcome"]>, "other">;
  label: string;
}> = [
  { value: "talked", label: "Talked to client" },
  { value: "plan_adjusted", label: "Plan adjusted" },
  { value: "no_action", label: "No action needed" },
];

export function firstNameOf(displayName: string | null | undefined): string {
  const full = formatPersonName(displayName);
  return full.split(" ")[0] ?? "";
}

function detailString(
  details: ExceptionDetail["details"],
  key: string,
): string | null {
  const raw = details?.[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/** "Lunch" / "Lower body A", from the exception's own source details. */
export function exceptionSourceName(
  detail: Pick<ExceptionDetail, "details">,
): string | null {
  return (
    detailString(detail.details, "mealName") ??
    detailString(detail.details, "workoutDayName")
  );
}

/** "Thu 15 Oct", or null when the exception carries no civil date. */
export function exceptionDateLabel(
  detail: Pick<ExceptionDetail, "details">,
  now?: Date,
): string | null {
  const localDate = detailString(detail.details, "localDate");
  return localDate ? formatCivilDate(localDate, { now }) : null;
}

/** "Lunch not logged · Thu 15 Oct · Meera Iyer" (frame 33 subtitle). */
export function resolveSheetSubtitle(
  detail: Pick<ExceptionDetail, "type" | "details">,
  traineeDisplayName: string,
  now?: Date,
): string {
  const source = exceptionSourceName(detail);
  const kind = labelFor("exception_type", detail.type);
  const head =
    source &&
    (detail.type === "overdue_meal" || detail.type === "skipped_meal")
      ? `${source} not logged`
      : kind;
  return [head, exceptionDateLabel(detail, now), formatPersonName(traineeDisplayName)]
    .filter(Boolean)
    .join(" · ");
}

/** "Missed workout · Lower body A · Tue 13 Oct" (frame 34 subtitle). */
export function nudgeSheetSubtitle(
  detail: Pick<ExceptionDetail, "type" | "details">,
  now?: Date,
): string {
  return [
    labelFor("exception_type", detail.type),
    exceptionSourceName(detail),
    exceptionDateLabel(detail, now),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function resolveLockLine(traineeDisplayName: string): string {
  const name = firstNameOf(traineeDisplayName) || "your client";
  return `Resolving locks this item, so ${name} can't log it late anymore. The original log isn't changed.`;
}

/**
 * Editable wa.me prefill (frame 34). Plain text only: no coaching detail
 * beyond the item the trainer is looking at, and no link (none has a backend
 * source yet).
 */
export function nudgeDraftText(
  detail: Pick<ExceptionDetail, "type" | "details">,
  traineeDisplayName: string,
  now?: Date,
): string {
  const name = firstNameOf(traineeDisplayName);
  const greeting = name ? `Hi ${name},` : "Hi,";
  const source =
    detail.type === "overdue_checkin"
      ? "your check-in"
      : (exceptionSourceName(detail) ??
        `your ${labelFor("exception_type", detail.type).toLowerCase()}`);
  const date = exceptionDateLabel(detail, now);
  const about = source
    ? ` quick reminder about ${source}${date ? ` from ${date}` : ""}.`
    : " quick reminder from your coach.";
  return `${greeting}${about} Log it when you can, or tell me if this week needs a change.`;
}

/** Frame 36 limit. The note contract allows more; the frame says 1,000. */
export const NOTE_MAX_LENGTH = 1000;

/** "96 of 1,000" (frame 36 counter). */
export function noteCounterLabel(length: number): string {
  return `${length} of 1,000`;
}

/** "Rohan will see this on their Today screen and get a notification". */
export function noteVisibleLine(traineeDisplayName: string): string {
  const name = firstNameOf(traineeDisplayName) || "Your client";
  return `${name} will see this on their Today screen and get a notification`;
}

/** Shown when the toggle is off (no frame copy: states the existing private rule). */
export function notePrivateLine(): string {
  return "Only you will see this note";
}

/** "From Rahul · just now" (frame 36 preview chip). */
export function noteAppearsLine(trainerDisplayName: string | null | undefined): string {
  const name = firstNameOf(trainerDisplayName);
  return `${name ? `From ${name}` : "From your coach"} · just now`;
}
