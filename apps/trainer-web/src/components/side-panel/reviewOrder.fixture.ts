import type { ExceptionDetail } from "@fitbud/contracts";

/**
 * One client's items as the API returns them (W13-13 shared fixture). The
 * Home side panel, the Overview review modal and the Overview "Needs
 * attention" card must all walk them in the same order: Critical first, then
 * newest first, equal rows in API order; resolved rows are left out.
 * Test-only: imported by tests, never by app code.
 */
export const REVIEW_REL_ID = "5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a";

function row(
  n: number,
  overrides: Partial<ExceptionDetail> & Pick<ExceptionDetail, "severity" | "detectedAt">,
): ExceptionDetail {
  const id = `0000000${n}-1313-4000-8000-000000000000`;
  return {
    id,
    coachingRelationshipId: REVIEW_REL_ID,
    type: "overdue_meal",
    status: "active",
    ruleVersion: "v1",
    sourceEntityType: "meal_assignment",
    sourceEntityId: `0000000${n}-1313-4000-8000-0000000000aa`,
    summary: `Review item ${n}`,
    details: { localDate: "2026-11-24", mealName: "Dinner" },
    activatedAt: overrides.detectedAt,
    acknowledgedAt: null,
    resolvedAt: null,
    closedReason: null,
    createdAt: overrides.detectedAt,
    updatedAt: overrides.detectedAt,
    actions: [],
    ...overrides,
  };
}

/** API order on purpose: not the review order. */
export const REVIEW_ORDER_ROWS: ExceptionDetail[] = [
  row(1, { severity: "attention", detectedAt: "2026-11-24T10:00:00.000Z", type: "meal_deviation", summary: "Meal change" }),
  row(2, { severity: "critical", detectedAt: "2026-11-23T09:00:00.000Z" }),
  row(3, {
    severity: "attention",
    detectedAt: "2026-11-24T11:00:00.000Z",
    status: "acknowledged",
    acknowledgedAt: "2026-11-24T12:00:00.000Z",
  }),
  row(4, {
    severity: "attention",
    detectedAt: "2026-11-24T12:00:00.000Z",
    status: "resolved",
    resolvedAt: "2026-11-24T13:00:00.000Z",
    closedReason: "trainer",
  }),
  row(5, { severity: "critical", detectedAt: "2026-11-24T08:00:00.000Z" }),
  // Same severity and time as 6: equal rows keep the API order (5 before 6
  // only by time; 7 before 6 by API order).
  row(7, { severity: "attention", detectedAt: "2026-11-22T07:00:00.000Z" }),
  row(6, { severity: "attention", detectedAt: "2026-11-22T07:00:00.000Z" }),
];

/** Ids in review order (the pager's "n of m" is the index + 1). */
export const REVIEW_ORDER_IDS: string[] = [5, 2, 3, 1, 7, 6].map(
  (n) => `0000000${n}-1313-4000-8000-000000000000`,
);
