import type {
  CheckinCadence,
  CheckinDraftAnswers,
  CheckinRecordStatus,
  CheckinStatus,
} from "@fitbud/contracts";
import { addDaysToLocalDate } from "./workout.js";

export const MVP_CHECKIN_DEFINITION_VERSION = 1;

const REQUIRED_DRAFT_KEYS = ["wellbeing"] as const;

export function daysForCheckinCadence(cadence: CheckinCadence): number {
  switch (cadence) {
    case "weekly":
      return 7;
    case "biweekly":
      return 14;
    case "monthly":
      return 28;
    default: {
      const _exhaustive: never = cadence;
      return _exhaustive;
    }
  }
}

export function nextCheckinLocalDate(input: {
  fromLocalDate: string;
  cadence: CheckinCadence;
}): string {
  return addDaysToLocalDate(
    input.fromLocalDate,
    daysForCheckinCadence(input.cadence),
  );
}

export function canSaveCheckinDraft(input: {
  recordStatus: CheckinRecordStatus;
}): boolean {
  return input.recordStatus === "draft";
}

export function canSubmitCheckin(input: {
  recordStatus: CheckinRecordStatus;
  nowIso: string;
  windowStartsAt: string;
}): boolean {
  if (input.recordStatus !== "draft") return false;
  return input.nowIso >= input.windowStartsAt;
}

export function canRecordCheckinReview(input: {
  recordStatus: CheckinRecordStatus;
  hasReview: boolean;
}): boolean {
  return input.recordStatus === "submitted" && !input.hasReview;
}

/**
 * Derive check-in view status from window + submission + review.
 * Scheduled / Due / Overdue / Reviewed are never written by the client.
 */
export function deriveCheckinStatus(input: {
  nowIso: string;
  windowStartsAt: string;
  windowEndsAt: string;
  recordStatus: CheckinRecordStatus;
  hasReview: boolean;
}): CheckinStatus {
  if (input.hasReview) return "reviewed";
  if (input.recordStatus === "submitted") return "submitted";
  if (input.nowIso > input.windowEndsAt) return "overdue";
  if (input.nowIso >= input.windowStartsAt) return "due";
  return "scheduled";
}

export function missingRequiredCheckinAnswers(
  answers: CheckinDraftAnswers | null | undefined,
): string[] {
  if (!answers) return [...REQUIRED_DRAFT_KEYS];
  const missing: string[] = [];
  for (const key of REQUIRED_DRAFT_KEYS) {
    const value = answers[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      missing.push(key);
    }
  }
  return missing;
}
