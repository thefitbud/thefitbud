import type {
  MealAssignmentStatus,
  MealComplianceOutcome,
  MealPhotoRequirement,
} from "@fitbud/contracts";

const TERMINAL_OUTCOMES: ReadonlySet<MealComplianceOutcome> = new Set([
  "confirmed",
  "modified",
  "skipped",
]);

export function isTerminalMealCompliance(
  outcome: MealComplianceOutcome | null | undefined,
): boolean {
  return outcome != null && TERMINAL_OUTCOMES.has(outcome);
}

export function canRecordMealCompliance(input: {
  hasCompliance: boolean;
}): boolean {
  return !input.hasCompliance;
}

/**
 * Resolve whether a meal photo is required from coaching config + prescription.
 */
export function resolveMealPhotoRequired(input: {
  photoRequirement: MealPhotoRequirement;
  prescriptionPhotoRequired: boolean;
}): boolean {
  if (input.photoRequirement === "none") return false;
  if (input.photoRequirement === "all_meals") return true;
  return input.prescriptionPhotoRequired;
}

/**
 * When a photo is required, a ready media asset id must be associated.
 * Callers still verify ownership, type, and ready status server-side.
 */
export function mealPhotoIntentSatisfied(input: {
  photoRequired: boolean;
  hasPhotoIntent?: boolean;
  mediaAssetId?: string | null;
}): boolean {
  if (!input.photoRequired) return true;
  return Boolean(input.mediaAssetId);
}

/**
 * Derive assignment status from window + compliance.
 * Pending / Logged Later / Overdue are never written by the client.
 */
export function deriveMealAssignmentStatus(input: {
  nowIso: string;
  windowEndsAt: string;
  complianceOutcome: MealComplianceOutcome | null;
  loggedAt: string | null;
}): MealAssignmentStatus {
  const { complianceOutcome, loggedAt } = input;
  if (complianceOutcome && loggedAt) {
    if (loggedAt > input.windowEndsAt) {
      return "logged_later";
    }
    return complianceOutcome;
  }

  if (input.nowIso > input.windowEndsAt) {
    return "overdue";
  }
  return "pending";
}
