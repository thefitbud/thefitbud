/**
 * The trainee's edit windows (Z14-11): 24 h to edit or remove a logged meal
 * (D-W14-22) and 48 h to change a finished workout's rating (D-W14-20).
 *
 * The server owns every rule here; reads return `editableUntil` / `canRemove` /
 * `feedbackEditableUntil` and the app never computes them. Pure functions, no
 * I/O, so list reads, sync pull and the write routes agree.
 */
import { canLog } from "@fitbud/core";
import type { MealCompliance } from "@fitbud/contracts";
import { LOG_TIME_FUTURE_DRIFT_MS, isInEndedPeriod } from "./log-time-bounds.js";

export const MEAL_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** A change made offline inside the window may arrive this long after it closes (D-W14-22 f). */
export const MEAL_EDIT_OFFLINE_GRACE_MS = 72 * 60 * 60 * 1000;
export const WORKOUT_FEEDBACK_WINDOW_MS = 48 * 60 * 60 * 1000;

export const MEAL_EDIT_WINDOW_CLOSED_CODE = "MEAL_EDIT_WINDOW_CLOSED";
export const MEAL_EDIT_WINDOW_CLOSED_MESSAGE =
  "Logged entries can be changed for 24 hours. Ask your coach to fix it.";
export const MEAL_EDITED_BY_COACH_CODE = "MEAL_EDITED_BY_COACH";
export const MEAL_EDITED_BY_COACH_MESSAGE =
  "Your coach has already corrected this meal, so it can't be changed here.";
export const MEAL_REMOVE_NOT_ALLOWED_CODE = "MEAL_REMOVE_NOT_ALLOWED";
export const MEAL_REMOVE_NOT_ALLOWED_MESSAGE =
  "This log can't be removed any more.";
export const FEEDBACK_EDIT_WINDOW_CLOSED_CODE = "FEEDBACK_EDIT_WINDOW_CLOSED";
export const FEEDBACK_EDIT_WINDOW_CLOSED_MESSAGE =
  "Ratings can be changed for 48 hours after a workout.";

/**
 * Device time of a mutation that sync is applying, keyed by the exact Request
 * object sync builds for the in-process dispatch. Nothing outside the process
 * can set it: an incoming request is always a different object, so a plain
 * REST caller cannot claim an earlier device time to stretch a window.
 */
const syncDeviceTimes = new WeakMap<Request, string>();

export function bindSyncDeviceTime(request: Request, clientOccurredAt: string): void {
  syncDeviceTimes.set(request, clientOccurredAt);
}

export function syncDeviceTime(c: { req: { raw: Request } }): string | null {
  return syncDeviceTimes.get(c.req.raw) ?? null;
}

type EntryAuthorship = {
  loggedAt: string;
  loggedByRole?: "trainee" | "coach" | null;
  lastEditedByRole?: "trainee" | "coach" | null;
};

/**
 * `loggedAt` + 24 h for the trainee's own, never coach-edited entry on an
 * active relationship; null otherwise (D-W14-22 a, d).
 */
export function mealEditableUntil(
  entry: EntryAuthorship,
  relationshipEnded: boolean,
): string | null {
  if (relationshipEnded) return null;
  if (entry.loggedByRole === "coach") return null;
  if (entry.lastEditedByRole === "coach") return null;
  const logged = Date.parse(entry.loggedAt);
  if (!Number.isFinite(logged)) return null;
  return new Date(logged + MEAL_EDIT_WINDOW_MS).toISOString();
}

export type MealRemoveInputs = {
  scheduleStatus: "scheduled" | "superseded";
  localDate: string;
  windowEndsAt: string;
  /** The meal's `required` flag from its prescription (defaults to true). */
  required: boolean;
  /** The meal assignment's exception status, if any ("detected" reads as active). */
  exceptionStatus: string | null;
  timeZone: string;
  reactivatedAt: string | null;
  /** The instant to judge "can it still be logged" at: always server now, never device time. */
  at: string;
};

/**
 * D-W14-22 (c): the meal could still be logged if this entry were removed.
 * Mirrors the rules a first log runs (`canLog` with nothing logged, and the
 * frozen ended period) over data the caller already holds.
 */
export function mealStillLoggable(input: MealRemoveInputs): boolean {
  if (
    isInEndedPeriod({
      reactivatedAt: input.reactivatedAt,
      loggedAt: input.at,
      localDate: input.localDate,
      timeZone: input.timeZone,
    })
  ) {
    return false;
  }
  const exceptionStatus =
    input.exceptionStatus === "detected"
      ? "active"
      : input.exceptionStatus === "active" ||
          input.exceptionStatus === "resolved" ||
          input.exceptionStatus === "acknowledged"
        ? input.exceptionStatus
        : null;
  const { decision } = canLog({
    assignmentScheduleStatus: input.scheduleStatus,
    exceptionStatus,
    nowIso: input.at,
    localDate: input.localDate,
    traineeTimezone: input.timeZone,
    required: input.required,
    alreadyLogged: false,
    windowEndsAt: input.windowEndsAt,
  });
  // `ok_late` is a log after the confirmation window closed: removing the entry
  // would leave a required meal missed, so it is not removable (D-W14-22 c).
  return decision === "ok" || decision === "ok_after_resolve";
}

/** Adds `editableUntil` and `canRemove` to a meal entry read for its trainee. */
export function withTraineeEditState(
  compliance: MealCompliance,
  input: { relationshipEnded: boolean; now: string; remove: MealRemoveInputs },
): MealCompliance {
  const editableUntil = mealEditableUntil(
    {
      loggedAt: compliance.loggedAt,
      loggedByRole: compliance.loggedByRole,
      lastEditedByRole: compliance.lastEditedByRole,
    },
    input.relationshipEnded,
  );
  const open = editableUntil != null && Date.parse(editableUntil) > Date.parse(input.now);
  return {
    ...compliance,
    editableUntil,
    canRemove: open && mealStillLoggable(input.remove),
  };
}

function windowAllows(input: {
  startsAt: string;
  windowMs: number;
  now: string;
  deviceTime: string | null;
  /** How far before `startsAt` a device time may sit (device clock behind the server). */
  startSkewMs?: number;
}): boolean {
  const closes = Date.parse(input.startsAt) + input.windowMs;
  const now = Date.parse(input.now);
  if (input.deviceTime == null) return now < closes;
  const device = Date.parse(input.deviceTime);
  if (!Number.isFinite(device)) return false;
  if (device < Date.parse(input.startsAt) - (input.startSkewMs ?? 0)) return false;
  if (device > now + LOG_TIME_FUTURE_DRIFT_MS) return false;
  if (device >= closes) return false;
  return now <= closes + MEAL_EDIT_OFFLINE_GRACE_MS;
}

/**
 * Judges a meal change against the 24 h window. Online the instant is server
 * time. Offline (sync) the change was made on the device: it counts when the
 * device time is not before `loggedAt`, not later than server time + 5 min and
 * inside the window, and it arrived within 72 h of the window closing.
 */
export function mealEditWindowAllows(input: {
  loggedAt: string;
  now: string;
  deviceTime: string | null;
}): boolean {
  return windowAllows({
    startsAt: input.loggedAt,
    windowMs: MEAL_EDIT_WINDOW_MS,
    now: input.now,
    deviceTime: input.deviceTime,
  });
}

/**
 * The 48 h rating window. Same offline rule as meals (device time inside the
 * window, arrival within 72 h of it closing, D-W14-22 f applied to D-W14-20),
 * except the lower bound: `completedAt` is stamped with server arrival time, so
 * a rating picked right after finishing can carry a device time slightly before
 * it (device clock behind, or the finish was queued offline). The device time
 * may be up to 5 minutes before `completedAt`, mirroring the 5-minute device
 * clock allowance on the upper side.
 */
export function feedbackEditWindowAllows(input: {
  completedAt: string;
  now: string;
  deviceTime: string | null;
}): boolean {
  return windowAllows({
    startsAt: input.completedAt,
    windowMs: WORKOUT_FEEDBACK_WINDOW_MS,
    now: input.now,
    deviceTime: input.deviceTime,
    startSkewMs: LOG_TIME_FUTURE_DRIFT_MS,
  });
}

export function workoutFeedbackEditableUntil(input: {
  completedAt: string | null;
  loggedByRole?: "trainee" | "coach" | null;
  status: string;
}): string | null {
  if (!input.completedAt) return null;
  if (input.loggedByRole === "coach") return null;
  if (input.status === "skipped") return null;
  const completed = Date.parse(input.completedAt);
  if (!Number.isFinite(completed)) return null;
  return new Date(completed + WORKOUT_FEEDBACK_WINDOW_MS).toISOString();
}
