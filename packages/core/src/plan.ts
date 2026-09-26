import type { PlanVersionStatus } from "@fitbud/contracts";

/** Only draft plan versions may be edited. */
export function canEditPlanVersion(status: PlanVersionStatus): boolean {
  return status === "draft";
}

/** Draft → published (immediate) or scheduled. */
export function canPublishPlanVersion(status: PlanVersionStatus): boolean {
  return status === "draft";
}

/** Whether a version is immutable after leave-draft. */
export function isImmutablePlanVersion(status: PlanVersionStatus): boolean {
  return (
    status === "published" ||
    status === "scheduled" ||
    status === "effective" ||
    status === "superseded"
  );
}

/** Scheduled versions become effective at/after effectiveFrom. */
export function canPromoteScheduledPlanVersion(
  status: PlanVersionStatus,
): boolean {
  return status === "scheduled";
}
