/**
 * Steps sync (Z9-9): read the last seven trainee-local days of step totals
 * from Apple Health or Health Connect and save each with
 * `PUT /me/steps/days/:localDate` (Z6-9). Daily totals only; no samples are
 * stored. The server keeps the newest `syncedAt` per day, so a repeated or
 * late write never replaces a newer total; the Steps chip reads the server
 * (`GET /me/steps/today`, D-W9-3), never this module.
 */
import { ApiClientError } from "@fitbud/api-client";
import { STEPS_DAY_MAX, type PutStepsDayRequest, type PutStepsDayResponse } from "@fitbud/contracts";
import { reportError } from "../reportError";
import { recentDayWindows } from "./dayWindows";
import type { HealthPermission, HealthStepsProvider } from "./types";

export type StepsSyncErrorCode =
  /** The health library failed to load, or threw while checking availability or permission. */
  | "STEPS-NATIVE"
  /** Reading the daily totals threw. */
  | "STEPS-READ"
  /** One or more days were not saved. */
  | "STEPS-SAVE";

export type StepsSyncResult =
  | { kind: "unavailable" }
  | { kind: "not_installed" }
  | { kind: "needs_update" }
  /** Available, but the user has not been asked and this run may not ask. */
  | { kind: "not_requested" }
  | { kind: "denied" }
  /** Read access may be denied (HealthKit hides it) or the store has no steps. Nothing saved. */
  | { kind: "no_data" }
  | { kind: "synced"; syncedAt: string; savedDays: number }
  /**
   * The server will not take steps: the coaching relationship has ended (409
   * `RELATIONSHIP_ENDED`, read-only) or there is none (404). Not an error, and
   * the remaining days are not tried.
   */
  | { kind: "ended" }
  | { kind: "error"; code: StepsSyncErrorCode };

/** The one API call the sync makes (`FitBudApiClient.putStepsDay`). */
export type StepsDayWriter = {
  putStepsDay(localDate: string, body: PutStepsDayRequest): Promise<PutStepsDayResponse>;
};

/** 409 `RELATIONSHIP_ENDED` or 404: the trainee has no relationship that takes steps. */
function isNoWritableRelationship(err: unknown): boolean {
  return (
    err instanceof ApiClientError &&
    ((err.status === 409 && err.code === "RELATIONSHIP_ENDED") || err.status === 404)
  );
}

/**
 * The app's own record that it has shown the permission prompt, so the
 * automatic sync asks once (Android cannot tell "never asked" from "denied").
 */
export type PermissionMemory = {
  wasAsked(): Promise<boolean>;
  markAsked(): Promise<void>;
};

export type StepsSyncInput = {
  provider: HealthStepsProvider;
  api: StepsDayWriter;
  /** The trainee's stored timezone (`me.timezone`), the zone the server uses for "today". */
  timeZone: string;
  now: () => Date;
  memory: PermissionMemory;
  /**
   * `auto`: the background sync; shows the prompt only if the app never asked.
   * `user`: the trainee tapped set up (Z9-10); asks again unless already granted.
   */
  trigger: "auto" | "user";
};

async function resolvePermission(input: StepsSyncInput): Promise<HealthPermission> {
  const { provider, memory, trigger } = input;
  const asked = await memory.wasAsked();
  const current = await provider.permission(asked);
  const mayAsk =
    trigger === "user"
      ? current === "not_requested" || current === "denied"
      : current === "not_requested" && (!asked || provider.platformKnowsIfAsked);
  if (!mayAsk) return current;
  await memory.markAsked();
  return provider.requestPermission();
}

export async function runStepsSync(input: StepsSyncInput): Promise<StepsSyncResult> {
  const { provider, api, timeZone, now } = input;

  let permission: HealthPermission;
  try {
    const availability = await provider.availability();
    if (availability !== "available") return { kind: availability };
    permission = await resolvePermission(input);
  } catch (err) {
    reportError("steps.sync.native", err);
    return { kind: "error", code: "STEPS-NATIVE" };
  }
  if (permission === "not_requested") return { kind: "not_requested" };
  if (permission === "denied") return { kind: "denied" };

  const windows = recentDayWindows(timeZone, now());
  const today = windows[windows.length - 1]?.localDate;
  let totals;
  try {
    totals = await provider.readDailyTotals(windows);
  } catch (err) {
    reportError("steps.sync.read", err);
    return { kind: "error", code: "STEPS-READ" };
  }

  // A day the store has nothing for is left alone (no invented zeros). Today is
  // saved as 0 only when the platform confirms read access, so a granted
  // morning shows "0" rather than "Set up steps"; HealthKit never confirms.
  const days = totals.flatMap(({ localDate, steps }) => {
    if (steps !== null) {
      // Out of the server's range: a corrupt store total, not something to clamp.
      return steps >= 0 && steps <= STEPS_DAY_MAX ? [{ localDate, steps }] : [];
    }
    return localDate === today && permission === "granted" ? [{ localDate, steps: 0 }] : [];
  });
  if (days.length === 0) return { kind: "no_data" };

  const syncedAt = now().toISOString();
  let saved = 0;
  let firstError: unknown = null;
  // One day at a time: seven small writes. A failure on one day does not stop
  // the others, except an ended or missing relationship, which no later day
  // can change. Each write is idempotent (newest `syncedAt` wins).
  for (const day of days) {
    try {
      await api.putStepsDay(day.localDate, { steps: day.steps, source: provider.source, syncedAt });
      saved += 1;
    } catch (err) {
      if (isNoWritableRelationship(err)) return { kind: "ended" };
      firstError ??= err;
    }
  }
  if (firstError !== null) {
    reportError("steps.sync.save", firstError);
    return { kind: "error", code: "STEPS-SAVE" };
  }
  return { kind: "synced", syncedAt, savedDays: saved };
}
