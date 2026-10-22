import type { AdherenceState, OnboardingStatus } from "@fitbud/contracts";
import { addDaysToLocalDate, compareLocalDates } from "./workout.js";

/** Inclusive civil dates, including today. */
export const ADHERENCE_WINDOW_DAYS = 14;

export type AdherenceObservationKind =
  | "workout_execution"
  | "meal_compliance"
  | "checkin";

export function adherenceWindowStart(today: string): string {
  return addDaysToLocalDate(today, -(ADHERENCE_WINDOW_DAYS - 1));
}

export function isWithinAdherenceWindow(localDate: string, today: string): boolean {
  const start = adherenceWindowStart(today);
  return (
    compareLocalDates(localDate, start) >= 0 &&
    compareLocalDates(localDate, today) <= 0
  );
}

/**
 * Qualifying activity is an observation on one of the trailing 14 trainer civil dates.
 * Assigned-but-unlogged work and an in-progress workout do not count.
 * Any persisted meal-compliance row counts. Only a submitted check-in counts.
 */
export function isQualifyingAdherenceObservation(input: {
  kind: AdherenceObservationKind;
  status: string;
  localDate: string;
  today: string;
}): boolean {
  if (!isWithinAdherenceWindow(input.localDate, input.today)) return false;
  if (input.kind === "workout_execution") {
    return (
      input.status === "completed" ||
      input.status === "modified" ||
      input.status === "skipped"
    );
  }
  if (input.kind === "meal_compliance") return true;
  return input.status === "submitted";
}

/**
 * Active clients: unresolved Critical or Attention exception (detected, active,
 * or acknowledged), then no qualifying activity in the trailing 14 civil days,
 * then on track. Acknowledgement does not by itself make the client on track.
 * Every other derived status, including pending invitations and ended, is not available.
 */
export function deriveAdherenceState(input: {
  onboardingStatus: OnboardingStatus;
  hasOpenAdherenceException: boolean;
  hasQualifyingActivity: boolean;
}): AdherenceState {
  if (input.onboardingStatus !== "active") return "not_available";
  if (input.hasOpenAdherenceException) return "needs_attention";
  if (!input.hasQualifyingActivity) return "no_recent_data";
  return "on_track";
}
