import {
  operation,
  dateWindowParameters,
} from "../openapi/document";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { Hono } from "hono";
import {
  attachMealPhotoRequestSchema,
  confirmMealRequestSchema,
  deviateMealRequestSchema,
  generateMealAssignmentsRequestSchema,
  generateMealAssignmentsResponseSchema,
  localDateSchema,
  mealAssignmentListResponseSchema,
  mealAssignmentSchema,
  mealComplianceSchema,
  mealComplianceSummaryResponseSchema,
  coachLogMealRequestSchema,
  removeMealLogResponseSchema,
  skipMealRequestSchema,
  traineeEditMealRequestSchema,
  traineeRemoveMealRequestSchema,
  NUTRIENT_SCALE,
  type MealCompliance,
  type MealPhotoIntent,
} from "@fitbud/contracts";
import {
  canLog,
  canRecordMealCompliance,
  formatLocalDate,
  mealPhotoIntentSatisfied,
} from "@fitbud/core";
import { createDb } from "../db/client";
import { evaluateExceptionsAfterWrite } from "../domain/exceptions";
import {
  coachingConfigurations,
  coachingRelationships,
  exceptions,
  logEditEvents,
  mealAssignments,
  mealCompliance,
  mediaAssets,
  nutritionExpectations,
  plans,
  planVersions,
  users,
} from "../db/schema";
import {
  mapMealAssignment,
  mapMealCompliance,
  parseMealPrescriptionJson,
  parsePlanContentJson,
} from "../domain/mappers";
import {
  insertMealAssignments,
  loadTraineeTimezone,
  resolveGenerationRange,
} from "../domain/assignment-schedule";
import {
  COACH_LOGGED_READ_ONLY_CODE,
  assertMealLogAllowed,
  buildLoggedFoodsCompliance,
} from "../domain/compliance-logging.js";
import {
  CoachLogConflict,
  LOG_WRITE_CONFLICT,
  mealLogSnapshot,
  recordCoachLogChange,
  type CoachLogClaim,
  type CoachLogWrite,
} from "../domain/coach-log.js";
import {
  COACH_LOG_BACKDATE_ERROR,
  LOG_TIME_ERROR_CODES,
  LOG_TIME_ERROR_MESSAGES,
  isInEndedPeriod,
  isWithinCoachLogWindow,
  resolveLogInstant,
} from "../domain/log-time-bounds.js";
import {
  FUTURE_DAY_LOG_ERROR_DOC,
  FUTURE_DAY_OPENAPI_NOTE,
} from "../domain/future-day.js";
import { resolvePushProviderMode } from "../lib/push-provider.js";
import { notifyTrainerClientLogEdited } from "../domain/client-log-edit-notify.js";
import {
  removeInputsFor,
  traineeMealView,
  traineeMealViewById,
} from "../domain/meal-edit-read.js";
import {
  MEAL_EDITED_BY_COACH_CODE,
  MEAL_EDITED_BY_COACH_MESSAGE,
  MEAL_EDIT_WINDOW_CLOSED_CODE,
  MEAL_EDIT_WINDOW_CLOSED_MESSAGE,
  MEAL_REMOVE_NOT_ALLOWED_CODE,
  MEAL_REMOVE_NOT_ALLOWED_MESSAGE,
  mealEditWindowAllows,
  mealStillLoggable,
  syncDeviceTime,
} from "../domain/meal-edit-window.js";
import { recordTraineeLogChange } from "../domain/trainee-log-edit.js";
import { appendChangeLog } from "../domain/sync";
import { addDaysIso, createId, nowIso, sha256Hex } from "../lib/crypto";
import { fail, ok, type AppContext } from "../lib/envelope";
import {
  findIdempotencyRecord,
  saveIdempotencyRecord,
} from "../lib/idempotency";
import { requireWritableRelationship } from "../lib/relationship-write-guard.js";
import { queueRealtimeHint } from "../realtime/emit";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth";
import { canAccessRelationship } from "./relationships";
import type { ActorContext, Env, Variables } from "../types";

const GENERATE_OPERATION = "meal.assignments.generate";
const CONFIRM_OPERATION = "meal.compliance.confirm";
const DEVIATE_OPERATION = "meal.compliance.deviate";
const SKIP_OPERATION = "meal.compliance.skip";

export const mealRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// Z14-1 / D-W14-8: a successful write re-evaluates its relationship's
// exceptions after the response, so Needs you can read stored rows.
mealRoutes.use("*", evaluateExceptionsAfterWrite);

type Db = ReturnType<typeof createDb>;

/** Resolve trainee-facing logging lock for one or many meal assignments. */
async function mealLockReasonsByAssignmentId(
  db: Db,
  input: {
    relationshipId: string;
    traineeUserId: string;
    assignmentIds: string[];
    rows: Array<{
      assignment: typeof mealAssignments.$inferSelect;
      compliance: typeof mealCompliance.$inferSelect | null;
    }>;
  },
): Promise<Map<string, string>> {
  if (input.assignmentIds.length === 0) return new Map<string, string>();

  const exceptionRows = await db
    .select({
      sourceEntityId: exceptions.sourceEntityId,
      status: exceptions.status,
    })
    .from(exceptions)
    .where(
      and(
        eq(exceptions.coachingRelationshipId, input.relationshipId),
        eq(exceptions.sourceEntityType, "meal_assignment"),
      ),
    );
  const timeZone = await loadTraineeTimezone(db, input.traineeUserId);
  return deriveMealLockReasons({
    exceptionRows,
    timeZone,
    assignmentIds: input.assignmentIds,
    rows: input.rows,
  });
}

/**
 * The lock rules of `mealLockReasonsByAssignmentId` over data the caller has
 * already read, so the list read can fetch the exception rows and the zone in
 * its own batch (Z14-1). No I/O.
 */
function deriveMealLockReasons(input: {
  exceptionRows: Array<{ sourceEntityId: string; status: string }>;
  timeZone: string;
  assignmentIds: string[];
  rows: Array<{
    assignment: typeof mealAssignments.$inferSelect;
    compliance: typeof mealCompliance.$inferSelect | null;
  }>;
}): Map<string, string> {
  const lockByAssignment = new Map<string, string>();
  if (input.assignmentIds.length === 0) return lockByAssignment;
  const { exceptionRows, timeZone } = input;
  const exceptionStatusById = new Map<string, string>();
  for (const ex of exceptionRows) {
    exceptionStatusById.set(ex.sourceEntityId, ex.status);
    if (
      ex.status === "resolved" &&
      input.assignmentIds.includes(ex.sourceEntityId)
    ) {
      lockByAssignment.set(ex.sourceEntityId, "exception_resolved");
    }
  }

  const now = nowIso();
  for (const row of input.rows) {
    if (lockByAssignment.has(row.assignment.id)) continue;
    const prescription = parseMealPrescriptionJson(
      row.assignment.mealPrescriptionJson,
    );
    const required = prescription.required !== false;
    const exceptionStatus = exceptionStatusById.get(row.assignment.id);
    const decision = canLog({
      assignmentScheduleStatus:
        row.assignment.scheduleStatus === "superseded"
          ? "superseded"
          : "scheduled",
      exceptionStatus:
        exceptionStatus === "active" ||
        exceptionStatus === "resolved" ||
        exceptionStatus === "acknowledged"
          ? exceptionStatus
          : null,
      nowIso: now,
      localDate: row.assignment.localDate,
      traineeTimezone: timeZone,
      required,
      alreadyLogged: row.compliance != null,
      windowEndsAt: row.assignment.windowEndsAt,
    });
    if (decision.decision === "locked" && decision.reason) {
      lockByAssignment.set(row.assignment.id, decision.reason);
    } else if (
      decision.decision === "superseded" ||
      decision.decision === "ended"
    ) {
      lockByAssignment.set(
        row.assignment.id,
        decision.reason ?? decision.decision,
      );
    }
  }
  return lockByAssignment;
}

async function loadReadyMealPhotoAsset(
  db: Db,
  mediaAssetId: string,
  relationshipId: string,
  traineeUserId: string,
) {
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaAssetId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.coachingRelationshipId !== relationshipId) return null;
  if (row.uploaderUserId !== traineeUserId) return null;
  if (row.mediaType !== "meal_photo") return null;
  if (row.status !== "ready") return null;
  return row;
}
async function loadAccessibleRelationship(
  db: Db,
  relationshipId: string,
  actor: ActorContext,
) {
  const rows = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.id, relationshipId))
    .limit(1);
  const row = rows[0];
  if (!row || !canAccessRelationship(actor, row)) return null;
  return row;
}

async function loadEffectivePlanVersion(db: Db, relationshipId: string) {
  const rows = await db
    .select({
      plan: plans,
      version: planVersions,
    })
    .from(plans)
    .innerJoin(planVersions, eq(planVersions.planId, plans.id))
    .where(
      and(
        eq(plans.coachingRelationshipId, relationshipId),
        eq(planVersions.status, "effective"),
      ),
    )
    .orderBy(desc(planVersions.effectiveFrom), desc(planVersions.versionNumber))
    .limit(1);
  return rows[0] ?? null;
}

async function loadActiveNutritionConfig(db: Db, relationshipId: string) {
  const rows = await db
    .select({
      configuration: coachingConfigurations,
      nutrition: nutritionExpectations,
    })
    .from(coachingConfigurations)
    .innerJoin(
      nutritionExpectations,
      eq(
        nutritionExpectations.coachingConfigurationId,
        coachingConfigurations.id,
      ),
    )
    .where(
      and(
        eq(coachingConfigurations.coachingRelationshipId, relationshipId),
        eq(coachingConfigurations.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function loadAssignmentWithCompliance(db: Db, assignmentId: string) {
  const assignmentRows = await db
    .select()
    .from(mealAssignments)
    .where(eq(mealAssignments.id, assignmentId))
    .limit(1);
  const assignment = assignmentRows[0];
  if (!assignment) return null;

  const complianceRows = await db
    .select()
    .from(mealCompliance)
    .where(eq(mealCompliance.assignmentId, assignment.id))
    .limit(1);

  return {
    assignment,
    compliance: complianceRows[0] ?? null,
  };
}

function requireIdempotencyKey(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  const key = c.req.header("Idempotency-Key")?.trim();
  return key && key.length > 0 ? key : null;
}

function coachLoggedReadOnlyError(c: AppContext) {
  return fail(
    c,
    409,
    COACH_LOGGED_READ_ONLY_CODE,
    "This meal was logged by your coach and cannot be changed.",
  );
}

/** Macros of a confirmed meal: the prescription's own totals, or all null when it has none. */
function prescriptionMacros(mealPrescriptionJson: string) {
  const prescription = parseMealPrescriptionJson(mealPrescriptionJson);
  let kcalScaled = 0;
  let proteinScaled = 0;
  let carbsScaled = 0;
  let fatScaled = 0;
  for (const item of prescription.items) {
    if (!("calculated" in item) || !item.calculated) continue;
    const calc = item.calculated;
    kcalScaled += calc.energyKcalScaled ?? 0;
    proteinScaled += calc.proteinScaled ?? 0;
    carbsScaled += calc.carbsScaled ?? 0;
    fatScaled += calc.fatScaled ?? 0;
  }
  if (kcalScaled > 0 || proteinScaled > 0 || carbsScaled > 0 || fatScaled > 0) {
    return { itemsJson: null as string | null, kcalScaled, proteinScaled, carbsScaled, fatScaled };
  }
  return {
    itemsJson: null as string | null,
    kcalScaled: null as number | null,
    proteinScaled: null as number | null,
    carbsScaled: null as number | null,
    fatScaled: null as number | null,
  };
}

/**
 * What a trainee-edited entry said before the trainee's latest change (the
 * `beforeJson` of the newest trainee audit row), keyed by entry id, for the
 * coach's meal panel (D-W14-23 a). Photo-only changes are not edits.
 */
async function traineeEditPreviousValues(
  db: Db,
  relationshipId: string,
  entryIds: readonly string[],
): Promise<Map<string, NonNullable<MealCompliance["previousValue"]>>> {
  const out = new Map<string, NonNullable<MealCompliance["previousValue"]>>();
  if (entryIds.length === 0) return out;
  const events = await db
    .select()
    .from(logEditEvents)
    .where(
      and(
        eq(logEditEvents.coachingRelationshipId, relationshipId),
        eq(logEditEvents.entityType, "meal_compliance"),
        eq(logEditEvents.actorRole, "trainee"),
        inArray(logEditEvents.entityId, [...entryIds]),
      ),
    )
    .orderBy(desc(logEditEvents.createdAt));
  for (const event of events) {
    if (out.has(event.entityId) || !event.beforeJson) continue;
    try {
      const before = JSON.parse(event.beforeJson) as {
        outcome?: string;
        deviationKind?: string | null;
        notes?: string | null;
        photoOnly?: boolean;
        macros?: { kcalScaled?: number | null };
      };
      if (before.photoOnly || typeof before.outcome !== "string") continue;
      const parsed = mealComplianceSchema.shape.previousValue.unwrap().unwrap().safeParse({
        outcome: before.outcome,
        deviationKind: before.deviationKind ?? null,
        notes: before.notes ?? null,
        kcal:
          before.macros?.kcalScaled == null
            ? null
            : Math.round(before.macros.kcalScaled / NUTRIENT_SCALE),
      });
      if (parsed.success) out.set(event.entityId, parsed.data);
    } catch {
      // An unreadable audit row only drops the "previous value" line.
    }
  }
  return out;
}

function serializePhotoIntent(
  intent: MealPhotoIntent | null | undefined,
): string | null {
  if (!intent) return null;
  return JSON.stringify(intent);
}

mealRoutes.post(
  "/relationships/:relationshipId/assignments/generate",
  operation({
    tag: "Meals",
    summary: "Meals operation for POST /meals/relationships/:relationshipId/assignments/generate.",
    description: "Meals operation for POST /meals/relationships/:relationshipId/assignments/generate.",
    roles: ["trainer", "trainee"],
    idempotency: true,
    body: generateMealAssignmentsRequestSchema,
    response: generateMealAssignmentsResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const idempotencyKey = requireIdempotencyKey(c);
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required.",
      );
    }

    const parsed = generateMealAssignmentsRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid generate request.", {
        issues: parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(JSON.stringify(parsed.data));
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: GENERATE_OPERATION,
      idempotencyKey,
    });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        return fail(
          c,
          409,
          "IDEMPOTENCY_KEY_REUSE",
          "Idempotency key was reused with a different request.",
        );
      }
      return c.json(
        JSON.parse(existing.responseBody),
        existing.responseStatus as 200,
      );
    }

    const relationship = await loadAccessibleRelationship(
      db,
      c.req.param("relationshipId"),
      actor,
    );
    if (!relationship) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }
    const writable = await requireWritableRelationship(
      c,
      db,
      relationship.id,
    );
    if (!writable.ok) {
      return writable.response;
    }

    const effective = await loadEffectivePlanVersion(db, relationship.id);
    if (!effective) {
      return fail(
        c,
        422,
        "NO_EFFECTIVE_PLAN",
        "An effective plan is required to generate meal assignments.",
      );
    }

    const config = await loadActiveNutritionConfig(db, relationship.id);
    if (!config) {
      return fail(
        c,
        422,
        "NO_ACTIVE_CONFIGURATION",
        "An active coaching configuration is required to generate meal assignments.",
      );
    }

    const content = parsePlanContentJson(effective.version.contentJson);
    if (content.mealPrescriptions.length === 0) {
      return fail(
        c,
        422,
        "NO_MEAL_PRESCRIPTIONS",
        "The effective plan has no meal prescriptions.",
      );
    }

    const timeZone = await loadTraineeTimezone(db, relationship.traineeUserId);
    const today = formatLocalDate(new Date(), timeZone);
    const resolved = resolveGenerationRange({
      window: parsed.data.window,
      today,
      fromDate: parsed.data.fromDate,
      toDate: parsed.data.toDate,
      version: effective.version,
      timeZone,
    });
    if (!resolved.ok) {
      return fail(c, 400, "INVALID_DATE_RANGE", resolved.message);
    }
    const dietScope = parsed.data.dietScope ?? "today_onward";
    const dates =
      dietScope === "today_only"
        ? resolved.dates.filter((date) => date === today)
        : resolved.dates;
    const now = nowIso();
    const createdRows = await insertMealAssignments(db, {
      relationshipId: relationship.id,
      planId: effective.plan.id,
      planVersionId: effective.version.id,
      content,
      timeZone,
      confirmationWindowHours: config.nutrition.confirmationWindowHours,
      photoRequirement: config.nutrition.photoRequirement,
      dates,
      now,
    });

    const generated = createdRows
      .map((row) => mapMealAssignment(row, null, now))
      .sort((left, right) => {
        if (left.localDate !== right.localDate) {
          return left.localDate.localeCompare(right.localDate);
        }
        const leftTime =
          left.prescription.localTime?.trim() || left.windowStartsAt;
        const rightTime =
          right.prescription.localTime?.trim() || right.windowStartsAt;
        if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);
        return left.mealName.localeCompare(right.mealName);
      });
    const responseBody = {
      data: generateMealAssignmentsResponseSchema.parse({
        created: generated.length,
        assignments: generated,
      }),
    };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: GENERATE_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return c.json(responseBody, 200);
  },
);

mealRoutes.get(
  "/relationships/:relationshipId/assignments",
  operation({
    tag: "Meals",
    summary: "Meals operation for GET /meals/relationships/:relationshipId/assignments.",
    description: "Meals operation for GET /meals/relationships/:relationshipId/assignments.",
    roles: ["trainer", "trainee"],
    parameters: [
      ...dateWindowParameters(),
    ],
    response: mealAssignmentListResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const fromDate = c.req.query("fromDate");
    const toDate = c.req.query("toDate");
    if (fromDate) {
      const parsed = localDateSchema.safeParse(fromDate);
      if (!parsed.success) {
        return fail(c, 400, "INVALID_REQUEST", "Invalid fromDate.");
      }
    }
    if (toDate) {
      const parsed = localDateSchema.safeParse(toDate);
      if (!parsed.success) {
        return fail(c, 400, "INVALID_REQUEST", "Invalid toDate.");
      }
    }

    const db = createDb(c.env.DB);
    // One round trip (Z14-1): the access check's relationship read, the
    // assignments, their compliance rows, the relationship's meal exceptions
    // and the trainee's zone are independent reads, so they share one
    // `db.batch`. Nothing is returned unless the relationship check passes.
    // The compliance rows are read apart from the assignments (a joined
    // select repeats column names, which `db.batch` cannot map).
    const relationshipId = c.req.param("relationshipId");
    const conditions = [
      eq(mealAssignments.coachingRelationshipId, relationshipId),
      eq(mealAssignments.scheduleStatus, "scheduled"),
    ];
    if (fromDate) {
      conditions.push(gte(mealAssignments.localDate, fromDate));
    }
    if (toDate) {
      conditions.push(lte(mealAssignments.localDate, toDate));
    }

    const [relationshipRows, assignmentRows, complianceRows, exceptionRows, tzRows] =
      await db.batch([
        db
          .select()
          .from(coachingRelationships)
          .where(eq(coachingRelationships.id, relationshipId))
          .limit(1),
        db
          .select()
          .from(mealAssignments)
          .where(and(...conditions))
          .orderBy(
            asc(mealAssignments.localDate),
            asc(mealAssignments.mealName),
            asc(mealAssignments.id),
          ),
        db
          .select()
          .from(mealCompliance)
          .where(
            inArray(
              mealCompliance.assignmentId,
              db
                .select({ id: mealAssignments.id })
                .from(mealAssignments)
                .where(and(...conditions)),
            ),
          ),
        db
          .select({
            sourceEntityId: exceptions.sourceEntityId,
            status: exceptions.status,
          })
          .from(exceptions)
          .where(
            and(
              eq(exceptions.coachingRelationshipId, relationshipId),
              eq(exceptions.sourceEntityType, "meal_assignment"),
            ),
          ),
        db
          .select({ timezone: users.timezone })
          .from(users)
          .innerJoin(
            coachingRelationships,
            eq(coachingRelationships.traineeUserId, users.id),
          )
          .where(eq(coachingRelationships.id, relationshipId))
          .limit(1),
      ]);
    const relationship = relationshipRows[0];
    if (!relationship || !canAccessRelationship(actor, relationship)) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    const complianceByAssignment = new Map(
      complianceRows.map((row) => [row.assignmentId, row]),
    );
    const rows = assignmentRows.map((assignment) => ({
      assignment,
      compliance: complianceByAssignment.get(assignment.id) ?? null,
    }));

    const now = nowIso();
    const assignmentIds = rows.map((row) => row.assignment.id);
    const lockByAssignment = deriveMealLockReasons({
      exceptionRows,
      timeZone: tzRows[0]?.timezone ?? "UTC",
      assignmentIds,
      rows,
    });
    const exceptionStatusByAssignment = new Map(
      exceptionRows.map((row) => [row.sourceEntityId, row.status]),
    );
    const asTrainee = actor.selectedRole === "trainee";
    const previousByEntry = asTrainee
      ? new Map<string, NonNullable<MealCompliance["previousValue"]>>()
      : await traineeEditPreviousValues(
          db,
          relationshipId,
          rows.flatMap((row) =>
            row.compliance?.lastEditedByRole === "trainee" ? [row.compliance.id] : [],
          ),
        );
    const items = rows
      .map((row) => {
        const reason = lockByAssignment.get(row.assignment.id) ?? null;
        const mapped = mapMealAssignment(row.assignment, row.compliance ?? null, now, {
          locked: reason != null,
          reason,
        });
        if (!row.compliance || !mapped.compliance) return mapped;
        const compliance: MealCompliance = asTrainee
          ? traineeMealView(row.compliance, {
              assignment: row.assignment,
              exceptionStatus: exceptionStatusByAssignment.get(row.assignment.id) ?? null,
              timeZone: tzRows[0]?.timezone ?? "UTC",
              relationship,
              now,
            })
          : {
              ...mapped.compliance,
              lastEditedAt: row.compliance.lastEditedAt ?? null,
              ...(previousByEntry.has(row.compliance.id)
                ? { previousValue: previousByEntry.get(row.compliance.id) }
                : {}),
            };
        return { ...mapped, compliance };
      })
      .sort((left, right) => {
        if (left.localDate !== right.localDate) {
          return left.localDate.localeCompare(right.localDate);
        }
        const leftTime =
          left.prescription.localTime?.trim() || left.windowStartsAt;
        const rightTime =
          right.prescription.localTime?.trim() || right.windowStartsAt;
        if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);
        const byName = left.mealName.localeCompare(right.mealName);
        if (byName !== 0) return byName;
        return left.id.localeCompare(right.id);
      });
    return ok(
      c,
      mealAssignmentListResponseSchema.parse({
        items,
        nextCursor: null,
      }),
    );
  },
);

mealRoutes.get(
  "/relationships/:relationshipId/compliance",
  operation({
    tag: "Meals",
    summary: "Meals operation for GET /meals/relationships/:relationshipId/compliance.",
    description: "Meals operation for GET /meals/relationships/:relationshipId/compliance.",
    roles: ["trainer", "trainee"],
    parameters: [
      ...dateWindowParameters(),
    ],
    response: mealComplianceSummaryResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const fromDate = c.req.query("fromDate");
    const toDate = c.req.query("toDate");

    const db = createDb(c.env.DB);
    const relationship = await loadAccessibleRelationship(
      db,
      c.req.param("relationshipId"),
      actor,
    );
    if (!relationship) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    const conditions = [
      eq(mealAssignments.coachingRelationshipId, relationship.id),
      eq(mealAssignments.scheduleStatus, "scheduled"),
    ];
    if (fromDate) conditions.push(gte(mealAssignments.localDate, fromDate));
    if (toDate) conditions.push(lte(mealAssignments.localDate, toDate));

    const rows = await db
      .select({
        assignment: mealAssignments,
        compliance: mealCompliance,
      })
      .from(mealAssignments)
      .leftJoin(
        mealCompliance,
        eq(mealCompliance.assignmentId, mealAssignments.id),
      )
      .where(and(...conditions))
      .orderBy(desc(mealAssignments.localDate), desc(mealAssignments.id));

    const now = nowIso();
    const items = rows.map((row) => {
      const mapped = mapMealAssignment(
        row.assignment,
        row.compliance ?? null,
        now,
      );
      return {
        assignmentId: mapped.id,
        localDate: mapped.localDate,
        mealName: mapped.mealName,
        status: mapped.status,
        outcome: mapped.compliance?.outcome ?? null,
        planVersionId: mapped.planVersionId,
        loggedAt: mapped.compliance?.loggedAt ?? null,
        photoRequired: mapped.photoRequired,
        hasPhotoIntent: Boolean(mapped.compliance?.photoIntent),
        mediaAssetId: mapped.compliance?.mediaAssetId ?? null,
      };
    });

    const totals = {
      pending: 0,
      confirmed: 0,
      modified: 0,
      skipped: 0,
      loggedLater: 0,
      overdue: 0,
    };
    for (const item of items) {
      if (item.status === "pending") totals.pending += 1;
      else if (item.status === "confirmed") totals.confirmed += 1;
      else if (item.status === "modified") totals.modified += 1;
      else if (item.status === "skipped") totals.skipped += 1;
      else if (item.status === "logged_later") totals.loggedLater += 1;
      else if (item.status === "overdue") totals.overdue += 1;
    }

    return ok(
      c,
      mealComplianceSummaryResponseSchema.parse({ items, totals }),
    );
  },
);

mealRoutes.get(
  "/assignments/:assignmentId",
  operation({
    tag: "Meals",
    summary: "Meals operation for GET /meals/assignments/:assignmentId.",
    description: "Meals operation for GET /meals/assignments/:assignmentId.",
    roles: ["trainer", "trainee"],
    response: mealAssignmentSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const db = createDb(c.env.DB);
    const loaded = await loadAssignmentWithCompliance(
      db,
      c.req.param("assignmentId"),
    );
    if (!loaded) {
      return fail(c, 404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
    }

    const relationship = await loadAccessibleRelationship(
      db,
      loaded.assignment.coachingRelationshipId,
      actor,
    );
    if (!relationship) {
      return fail(c, 404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
    }

    const locks = await mealLockReasonsByAssignmentId(db, {
      relationshipId: relationship.id,
      traineeUserId: relationship.traineeUserId,
      assignmentIds: [loaded.assignment.id],
      rows: [
        {
          assignment: loaded.assignment,
          compliance: loaded.compliance ?? null,
        },
      ],
    });
    const reason = locks.get(loaded.assignment.id) ?? null;
    const mapped = mapMealAssignment(
      loaded.assignment,
      loaded.compliance,
      nowIso(),
      { locked: reason != null, reason },
    );
    let compliance = mapped.compliance;
    if (loaded.compliance && compliance) {
      if (actor.selectedRole === "trainee") {
        compliance =
          (await traineeMealViewById(db, loaded.compliance.id, nowIso())) ?? compliance;
      } else {
        const previous = await traineeEditPreviousValues(
          db,
          relationship.id,
          loaded.compliance.lastEditedByRole === "trainee" ? [loaded.compliance.id] : [],
        );
        compliance = {
          ...compliance,
          lastEditedAt: loaded.compliance.lastEditedAt ?? null,
          ...(previous.has(loaded.compliance.id)
            ? { previousValue: previous.get(loaded.compliance.id) }
            : {}),
        };
      }
    }
    return ok(c, mealAssignmentSchema.parse({ ...mapped, compliance }));
  },
);

async function recordCompliance(
  c: AppContext,
  input: {
    operation: string;
    outcome: "confirmed" | "modified" | "skipped";
    deviationKind?:
      | "portion_adjustment"
      | "substitute"
      | "restaurant"
      | "repeat_recent"
      | "manual"
      | "other"
      | "logged_foods"
      | null;
    notes?: string | null;
    photoIntent?: MealPhotoIntent | null;
    requirePhotoWhenConfigured: boolean;
    clientLoggedAt?: string;
    loggedFoodItems?: import("@fitbud/contracts").LoggedFoodItem[];
  },
) {
  const actor = c.get("actor");
  if (!actor?.selectedRole) {
    return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
  }

  const idempotencyKey = requireIdempotencyKey(c);
  if (!idempotencyKey) {
    return fail(
      c,
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Idempotency-Key header is required.",
    );
  }

  const db = createDb(c.env.DB);
  const fingerprint = await sha256Hex(
    JSON.stringify({
      assignmentId: c.req.param("assignmentId"),
      outcome: input.outcome,
      deviationKind: input.deviationKind ?? null,
      notes: input.notes ?? null,
      photoIntent: input.photoIntent ?? null,
      clientLoggedAt: input.clientLoggedAt ?? null,
    }),
  );
  const existing = await findIdempotencyRecord(db, {
    actorUserId: actor.userId,
    operation: input.operation,
    idempotencyKey,
  });
  if (existing) {
    if (existing.requestFingerprint !== fingerprint) {
      return fail(
        c,
        409,
        "IDEMPOTENCY_KEY_REUSE",
        "Idempotency key was reused with a different request.",
      );
    }
    return c.json(
      JSON.parse(existing.responseBody),
      existing.responseStatus as 200,
    );
  }

  const assignmentId = c.req.param("assignmentId");
  if (!assignmentId) {
    return fail(c, 400, "INVALID_REQUEST", "Assignment id is required.");
  }

  const loaded = await loadAssignmentWithCompliance(db, assignmentId);
  if (!loaded) {
    return fail(c, 404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
  }

  const relationship = await loadAccessibleRelationship(
    db,
    loaded.assignment.coachingRelationshipId,
    actor,
  );
  if (!relationship || relationship.traineeUserId !== actor.userId) {
    return fail(c, 404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
  }

  const writable = await requireWritableRelationship(c, db, relationship.id);
  if (!writable.ok) {
    return writable.response;
  }

  const now = nowIso();
  // Client time, when sent, is the instant bounds, late, and status use,
  // normalised to UTC. createdAt stays the server receive time.
  const logInstant = resolveLogInstant({
    clientLoggedAt: input.clientLoggedAt,
    now,
  });
  const clientInstant = input.clientLoggedAt ? logInstant : undefined;
  const timeZone = await loadTraineeTimezone(db, actor.userId);
  const logGuard = await assertMealLogAllowed(db, {
    assignmentId,
    relationshipId: relationship.id,
    relationshipEnded: relationship.status === "ended",
    traineeUserId: actor.userId,
    traineeTimezone: timeZone,
    clientLoggedAt: clientInstant,
    nowIso: now,
    alreadyLogged: Boolean(loaded.compliance),
    existingLoggedByRole: loaded.compliance?.loggedByRole ?? null,
  });
  if (!logGuard.ok && logGuard.code === COACH_LOGGED_READ_ONLY_CODE) {
    return coachLoggedReadOnlyError(c);
  }
  if (!logGuard.ok && logGuard.status === 422) {
    return fail(
      c,
      422,
      logGuard.code,
      LOG_TIME_ERROR_MESSAGES[logGuard.reason],
    );
  }
  if (!logGuard.ok) {
    return fail(c, 409, logGuard.code, "This meal cannot be logged.", {
      reason: logGuard.reason,
    });
  }

  if (!canRecordMealCompliance({ hasCompliance: Boolean(loaded.compliance) })) {
    return fail(
      c,
      409,
      "COMPLIANCE_ALREADY_RECORDED",
      "This meal already has a compliance record.",
    );
  }

  // Ready mediaAssetId association satisfies photo requirement (D1 / R2).
  if (
    input.requirePhotoWhenConfigured &&
    !mealPhotoIntentSatisfied({
      photoRequired: loaded.assignment.photoRequired,
      mediaAssetId: input.photoIntent?.mediaAssetId ?? null,
    })
  ) {
    return fail(
      c,
      422,
      "PHOTO_INTENT_REQUIRED",
      "This meal requires a ready photo upload before confirmation.",
    );
  }

  const linkedMediaAssetId = input.photoIntent?.mediaAssetId ?? null;
  if (linkedMediaAssetId) {
    const media = await loadReadyMealPhotoAsset(
      db,
      linkedMediaAssetId,
      relationship.id,
      actor.userId,
    );
    if (!media) {
      return fail(
        c,
        422,
        "MEDIA_ASSET_INVALID",
        "Linked media asset must be a ready meal photo for this relationship.",
      );
    }
  }

  let macroFields = {
    itemsJson: null as string | null,
    kcalScaled: null as number | null,
    proteinScaled: null as number | null,
    carbsScaled: null as number | null,
    fatScaled: null as number | null,
  };
  // A changed portion (TR-08b) and an ate-out kcal (TR-08c) carry their lines
  // too, so the day ring counts what was eaten rather than the plan.
  if (
    (input.deviationKind === "logged_foods" ||
      input.deviationKind === "portion_adjustment" ||
      input.deviationKind === "restaurant") &&
    input.loggedFoodItems &&
    input.loggedFoodItems.length > 0
  ) {
    macroFields = await buildLoggedFoodsCompliance(db, {
      traineeUserId: actor.userId,
      relationshipId: relationship.id,
      items: input.loggedFoodItems,
      allowSaveToMyFoods: input.deviationKind === "logged_foods",
    });
  } else if (input.outcome === "confirmed") {
    macroFields = prescriptionMacros(loaded.assignment.mealPrescriptionJson);
  }

  const row = {
    id: createId(),
    assignmentId: loaded.assignment.id,
    coachingRelationshipId: relationship.id,
    planVersionId: loaded.assignment.planVersionId,
    traineeUserId: actor.userId,
    outcome: input.outcome,
    recordVersion: 0,
    // Z7-20 covers confirm and skip; a deviation keeps the receive time it
    // stored before (its client time still drives bounds and late).
    loggedAt: input.operation === DEVIATE_OPERATION ? now : logInstant,
    localDate: loaded.assignment.localDate,
    deviationKind: input.deviationKind ?? null,
    notes: input.notes ?? null,
    photoRequired: loaded.assignment.photoRequired,
    photoIntentJson: serializePhotoIntent(input.photoIntent),
    mediaAssetId: linkedMediaAssetId,
    itemsJson: macroFields.itemsJson,
    kcalScaled: macroFields.kcalScaled,
    proteinScaled: macroFields.proteinScaled,
    carbsScaled: macroFields.carbsScaled,
    fatScaled: macroFields.fatScaled,
    loggedLate: logGuard.loggedLate,
    loggedAfterResolve: logGuard.loggedAfterResolve,
    clientLoggedAt: input.clientLoggedAt ? logInstant : null,
    loggedByRole: "trainee" as const,
    loggedByUserId: null,
    lastEditedByRole: null,
    lastEditedByUserId: null,
    lastEditedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(mealCompliance).values(row);

  if (linkedMediaAssetId) {
    await db
      .update(mediaAssets)
      .set({
        domainEntityType: "meal_compliance",
        domainEntityId: row.id,
        updatedAt: now,
      })
      .where(eq(mediaAssets.id, linkedMediaAssetId));
  }

  const mapped = mealComplianceSchema.parse(mapMealCompliance(row));
  const traineeView = mealComplianceSchema.parse(
    traineeMealView(row, {
      assignment: loaded.assignment,
      exceptionStatus: null,
      timeZone,
      relationship,
      now,
    }),
  );
  await appendChangeLog(db, {
    entityType: "meal_compliance",
    recordId: mapped.id,
    changeKind: "upsert",
    serverVersion: mapped.recordVersion,
    coachingRelationshipId: relationship.id,
    traineeUserId: relationship.traineeUserId,
  });
  queueRealtimeHint(c.env, {
    eventType: "meal_compliance_changed",
    entityType: "meal_compliance",
    entityId: mapped.id,
    coachingRelationshipId: relationship.id,
    serverVersion: mapped.recordVersion,
  });

  const responseBody = {
    data: traineeView,
  };
  await saveIdempotencyRecord(db, {
    actorUserId: actor.userId,
    operation: input.operation,
    idempotencyKey,
    requestFingerprint: fingerprint,
    responseStatus: 200,
    responseBody,
    expiresAt: addDaysIso(7),
  });
  return c.json(responseBody, 200);
}

mealRoutes.post(
  "/assignments/:assignmentId/confirm",
  operation({
    tag: "Meals",
    summary: "Meals operation for POST /meals/assignments/:assignmentId/confirm.",
    description: `Meals operation for POST /meals/assignments/:assignmentId/confirm. ${FUTURE_DAY_OPENAPI_NOTE}`,
    roles: ["trainee"],
    idempotency: true,
    body: confirmMealRequestSchema,
    response: mealComplianceSchema,
    errors: [
      {
        status: 422,
        description:
          "A required meal photo was missing or invalid, the log time was out of bounds, or the meal is on a future day (FUTURE_DAY).",
      },
    ],
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const parsed = confirmMealRequestSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid confirm request.", {
        issues: parsed.error.issues,
      });
    }

    return recordCompliance(c, {
      operation: CONFIRM_OPERATION,
      outcome: "confirmed",
      photoIntent: parsed.data.photoIntent ?? null,
      requirePhotoWhenConfigured: true,
      clientLoggedAt: parsed.data.clientLoggedAt,
    });
  },
);

mealRoutes.post(
  "/assignments/:assignmentId/deviate",
  operation({
    tag: "Meals",
    summary: "Meals operation for POST /meals/assignments/:assignmentId/deviate.",
    description: `Meals operation for POST /meals/assignments/:assignmentId/deviate. ${FUTURE_DAY_OPENAPI_NOTE}`,
    roles: ["trainee"],
    idempotency: true,
    body: deviateMealRequestSchema,
    response: mealComplianceSchema,
    errors: [{ status: 422, description: FUTURE_DAY_LOG_ERROR_DOC }],
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const parsed = deviateMealRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid deviation request.", {
        issues: parsed.error.issues,
      });
    }

    return recordCompliance(c, {
      operation: DEVIATE_OPERATION,
      outcome: "modified",
      deviationKind: parsed.data.deviationKind,
      notes: parsed.data.notes ?? null,
      photoIntent: parsed.data.photoIntent ?? null,
      requirePhotoWhenConfigured: true,
      clientLoggedAt: parsed.data.clientLoggedAt,
      loggedFoodItems: parsed.data.items,
    });
  },
);

mealRoutes.post(
  "/assignments/:assignmentId/skip",
  operation({
    tag: "Meals",
    summary: "Meals operation for POST /meals/assignments/:assignmentId/skip.",
    description: `Meals operation for POST /meals/assignments/:assignmentId/skip. ${FUTURE_DAY_OPENAPI_NOTE}`,
    roles: ["trainee"],
    idempotency: true,
    body: skipMealRequestSchema,
    response: mealComplianceSchema,
    errors: [{ status: 422, description: FUTURE_DAY_LOG_ERROR_DOC }],
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const parsed = skipMealRequestSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid skip request.", {
        issues: parsed.error.issues,
      });
    }

    return recordCompliance(c, {
      operation: SKIP_OPERATION,
      outcome: "skipped",
      notes: parsed.data.notes ?? null,
      photoIntent: null,
      requirePhotoWhenConfigured: false,
      clientLoggedAt: parsed.data.clientLoggedAt,
    });
  },
);

// ---------------------------------------------------------------------------
// Trainer log and edit (Z6-20, PLAN-v2 D-P2-21, D-W6-IP R1–R5)
// ---------------------------------------------------------------------------

const COACH_LOG_OPERATION = "meal.coach.log";

function coachPushConfig(env: Env) {
  return {
    pushProviderMode: resolvePushProviderMode(env.PUSH_PROVIDER_MODE),
    expoAccessToken: env.EXPO_ACCESS_TOKEN,
  };
}

function coachMealVersionConflict(c: AppContext) {
  return fail(
    c,
    409,
    "VERSION_CONFLICT",
    "This meal changed since it was opened. Reload and try again.",
  );
}

function mealLogWriteConflict(c: AppContext) {
  return fail(c, 409, LOG_WRITE_CONFLICT.code, LOG_WRITE_CONFLICT.message);
}

async function mealAlreadyRecorded(c: AppContext, db: Db, assignmentId: string) {
  const [raced] = await db
    .select({ id: mealCompliance.id })
    .from(mealCompliance)
    .where(eq(mealCompliance.assignmentId, assignmentId))
    .limit(1);
  if (!raced) return mealLogWriteConflict(c);
  return fail(
    c,
    409,
    "COMPLIANCE_ALREADY_RECORDED",
    "This meal already has a compliance record.",
  );
}

mealRoutes.put(
  "/compliance/:assignmentId/:date",
  operation({
    tag: "Meals",
    summary: "Trainer logs or corrects a client's meal entry",
    description:
      "Creates the meal entry (confirmed, changed or skipped, with an optional note) logged by the coach (logged_by_role coach), or replaces the outcome, deviation and note of an existing entry. The date must equal the meal's own day and be within the last 7 days and not in the future (422 BACKDATE_LIMIT). recordVersion is required for an existing entry (409 VERSION_CONFLICT). A coach-created entry is read-only to the trainee (409 COACH_LOGGED_READ_ONLY); an entry the trainee logged stays the trainee's and gets last_edited_* set. Audited, shown in the activity feed and notifies the trainee when their coach-updates setting is on.",
    roles: ["trainer"],
    idempotency: true,
    body: coachLogMealRequestSchema,
    response: mealComplianceSchema,
    successStatus: [200, 201],
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const idempotencyKey = requireIdempotencyKey(c);
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required.",
      );
    }
    const parsed = coachLogMealRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    const date = localDateSchema.safeParse(c.req.param("date"));
    if (!parsed.success || !date.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid meal log.", {
        issues: parsed.success ? date.error?.issues : parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const assignmentId = c.req.param("assignmentId");
    const fingerprint = await sha256Hex(
      JSON.stringify({ assignmentId, date: date.data, body: parsed.data }),
    );
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: COACH_LOG_OPERATION,
      idempotencyKey,
    });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        return fail(
          c,
          409,
          "IDEMPOTENCY_KEY_REUSE",
          "Idempotency key was reused with a different request.",
        );
      }
      return c.json(
        JSON.parse(existing.responseBody),
        existing.responseStatus as 200,
      );
    }

    const loaded = await loadAssignmentWithCompliance(db, assignmentId);
    if (!loaded) {
      return fail(c, 404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
    }
    const { assignment } = loaded;
    const [relationship] = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, assignment.coachingRelationshipId))
      .limit(1);
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 403, "FORBIDDEN", "You cannot log meals for this client.");
    }
    const writable = await requireWritableRelationship(c, db, relationship.id);
    if (!writable.ok) return writable.response;

    if (assignment.localDate !== date.data) {
      return fail(c, 404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
    }
    if (assignment.scheduleStatus !== "scheduled") {
      return fail(c, 409, "INVALID_TRANSITION", "This meal is no longer scheduled.");
    }

    const now = nowIso();
    const timeZone = await loadTraineeTimezone(db, relationship.traineeUserId);
    // R2: the trainer skips the Z6-11 log-time bounds, but the meal's day must be
    // within the last 7 days and not in the future.
    if (
      !isWithinCoachLogWindow({
        localDates: [assignment.localDate],
        instants: [],
        now,
        timeZone,
      })
    ) {
      return fail(c, 422, COACH_LOG_BACKDATE_ERROR.code, COACH_LOG_BACKDATE_ERROR.message);
    }
    // D-W6-20: the ended period stays frozen after a reactivation.
    if (
      isInEndedPeriod({
        reactivatedAt: relationship.reactivatedAt,
        loggedAt: now,
        localDate: assignment.localDate,
        timeZone,
      })
    ) {
      return fail(
        c,
        422,
        LOG_TIME_ERROR_CODES.ended_period,
        LOG_TIME_ERROR_MESSAGES.ended_period,
      );
    }

    const body = parsed.data;
    const before = loaded.compliance;
    const nextNotes = body.notes ?? null;
    const nextDeviationKind = body.outcome === "modified" ? (body.deviationKind ?? null) : null;
    const nextItems = body.items;
    const itemKinds = new Set(["logged_foods", "portion_adjustment", "restaurant"]);
    // Z12-52: a coach may author portion / ate-out / logged-foods with items.
    // Without items, `logged_foods` is only valid when keeping a client's list.
    if (
      nextDeviationKind === "logged_foods" &&
      before?.deviationKind !== "logged_foods" &&
      !(nextItems && nextItems.length > 0)
    ) {
      return fail(c, 400, "INVALID_REQUEST", "There is no food list to keep.");
    }
    // D-W6-40: a client's logged food list is never erased. On such an entry the
    // trainer may change only the note (not the foods, outcome, or kind).
    const traineeFoodList =
      before?.deviationKind === "logged_foods" && before.loggedByRole === "trainee";
    if (
      traineeFoodList &&
      (body.outcome !== "modified" ||
        nextDeviationKind !== "logged_foods" ||
        (nextItems && nextItems.length > 0))
    ) {
      return fail(
        c,
        409,
        "FOOD_LIST_READ_ONLY",
        "This meal has the client's food list, so only its note can be changed.",
      );
    }
    if (!before && body.recordVersion !== undefined) {
      return coachMealVersionConflict(c);
    }
    if (before && body.recordVersion !== before.recordVersion) {
      return coachMealVersionConflict(c);
    }

    let macros: {
      itemsJson: string | null;
      kcalScaled: number | null;
      proteinScaled: number | null;
      carbsScaled: number | null;
      fatScaled: number | null;
    };
    if (body.outcome === "confirmed") {
      macros = prescriptionMacros(assignment.mealPrescriptionJson);
    } else if (
      body.outcome === "modified" &&
      nextDeviationKind &&
      itemKinds.has(nextDeviationKind) &&
      nextItems &&
      nextItems.length > 0
    ) {
      // In-person Something different: portion, ate out, or logged foods.
      macros = await buildLoggedFoodsCompliance(db, {
        traineeUserId: relationship.traineeUserId,
        relationshipId: relationship.id,
        items: nextItems,
        allowSaveToMyFoods: nextDeviationKind === "logged_foods",
      });
    } else if (
      body.outcome === "modified" &&
      nextDeviationKind &&
      itemKinds.has(nextDeviationKind) &&
      before &&
      before.deviationKind === nextDeviationKind
    ) {
      // Note-only edit of an entry that already carries items/macros.
      macros = {
        itemsJson: before.itemsJson,
        kcalScaled: before.kcalScaled,
        proteinScaled: before.proteinScaled,
        carbsScaled: before.carbsScaled,
        fatScaled: before.fatScaled,
      };
    } else {
      macros = {
        itemsJson: null,
        kcalScaled: null,
        proteinScaled: null,
        carbsScaled: null,
        fatScaled: null,
      };
    }

    let entryId: string;
    let status: 200 | 201;
    let action: "create" | "edit";
    let serverVersion: number;
    let domainWrites: () => readonly CoachLogWrite[];
    let claim: CoachLogClaim | undefined;
    let afterCompliance: Parameters<typeof mealLogSnapshot>[0]["compliance"];
    if (!before) {
      action = "create";
      status = 201;
      entryId = createId();
      serverVersion = 0;
      const row = {
        id: entryId,
        assignmentId: assignment.id,
        coachingRelationshipId: relationship.id,
        planVersionId: assignment.planVersionId,
        traineeUserId: relationship.traineeUserId,
        outcome: body.outcome,
        recordVersion: 0,
        loggedAt: now,
        localDate: assignment.localDate,
        deviationKind: nextDeviationKind,
        notes: nextNotes,
        photoRequired: assignment.photoRequired,
        photoIntentJson: null,
        mediaAssetId: null,
        ...macros,
        // Late is derived from the meal's window, never auto-closing anything.
        loggedLate: Date.parse(now) > Date.parse(assignment.windowEndsAt),
        loggedAfterResolve: false,
        clientLoggedAt: null,
        loggedByRole: "coach" as const,
        loggedByUserId: actor.userId,
        lastEditedByRole: null,
        lastEditedByUserId: null,
        lastEditedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      afterCompliance = row;
      domainWrites = () => [db.insert(mealCompliance).values(row)];
      claim = undefined;
    } else {
      action = "edit";
      status = 200;
      entryId = before.id;
      if (
        before.outcome === body.outcome &&
        before.deviationKind === nextDeviationKind &&
        before.notes === nextNotes &&
        before.itemsJson === macros.itemsJson &&
        before.kcalScaled === macros.kcalScaled &&
        before.proteinScaled === macros.proteinScaled &&
        before.carbsScaled === macros.carbsScaled &&
        before.fatScaled === macros.fatScaled
      ) {
        // Nothing changed: no audit row, no notification, no new version.
        const unchanged = {
          data: mealComplianceSchema.parse(mapMealCompliance(before)),
        };
        await saveIdempotencyRecord(db, {
          actorUserId: actor.userId,
          operation: COACH_LOG_OPERATION,
          idempotencyKey,
          requestFingerprint: fingerprint,
          responseStatus: 200,
          responseBody: unchanged,
          expiresAt: addDaysIso(7),
        });
        return c.json(unchanged, 200);
      }
      serverVersion = before.recordVersion + 1;
      const edited = {
        outcome: body.outcome,
        deviationKind: nextDeviationKind,
        notes: nextNotes,
        ...macros,
        recordVersion: serverVersion,
        lastEditedByRole: "coach" as const,
        lastEditedByUserId: actor.userId,
        lastEditedAt: now,
        updatedAt: now,
      };
      afterCompliance = { ...before, ...edited };
      claim = {
        entity: "meal_compliance",
        id: entryId,
        recordVersion: serverVersion,
        update: () =>
          db
            .update(mealCompliance)
            .set(edited)
            .where(
              and(
                eq(mealCompliance.id, before.id),
                eq(mealCompliance.recordVersion, before.recordVersion),
              ),
            ),
      };
      domainWrites = () => [];
    }

    let responseBody: { data: ReturnType<typeof mealComplianceSchema.parse> } | undefined;
    try {
      await recordCoachLogChange(db, {
        domainWrites,
        claim,
        afterCommit: async () => {
          const [saved] = await db
            .select()
            .from(mealCompliance)
            .where(eq(mealCompliance.id, entryId))
            .limit(1);
          responseBody = {
            data: mealComplianceSchema.parse(mapMealCompliance(saved!)),
          };
          await saveIdempotencyRecord(db, {
            actorUserId: actor.userId,
            operation: COACH_LOG_OPERATION,
            idempotencyKey,
            requestFingerprint: fingerprint,
            responseStatus: status,
            responseBody,
            expiresAt: addDaysIso(7),
          });
        },
        entity: {
          type: "meal_compliance",
          id: entryId,
          coachingRelationshipId: relationship.id,
          traineeUserId: relationship.traineeUserId,
          serverVersion,
          routing: { domainEntityType: "meal_assignment", domainEntityId: assignment.id },
        },
        action,
        actorUserId: actor.userId,
        before: before ? mealLogSnapshot({ assignment, compliance: before }) : null,
        after: mealLogSnapshot({ assignment, compliance: afterCompliance }),
        now,
        push: coachPushConfig(c.env),
      });
    } catch (error) {
      if (error instanceof CoachLogConflict) {
        if (error.kind === "version") return coachMealVersionConflict(c);
        if (error.kind === "entry") return mealAlreadyRecorded(c, db, assignment.id);
        return mealLogWriteConflict(c);
      }
      throw error;
    }

    if (!responseBody) {
      throw new Error("Coach log committed without a stored meal entry.");
    }
    queueRealtimeHint(c.env, {
      eventType: "meal_compliance_changed",
      entityType: "meal_compliance",
      entityId: entryId,
      coachingRelationshipId: relationship.id,
      serverVersion: responseBody.data.recordVersion,
    });
    return c.json(responseBody, status);
  },
);

// ---------------------------------------------------------------------------
// Trainee edits, removes and adds a photo to their own logged meal (Z14-11,
// D-W14-22, D-W14-23)
// ---------------------------------------------------------------------------

const EDIT_LOG_OPERATION = "meal.log.edit";
const REMOVE_LOG_OPERATION = "meal.log.remove";
const PHOTO_LOG_OPERATION = "meal.log.photo";

type OwnEntry = {
  entry: typeof mealCompliance.$inferSelect;
  assignment: typeof mealAssignments.$inferSelect;
  relationship: typeof coachingRelationships.$inferSelect;
};

/** The trainee's own entry, its meal and its relationship; a 404 for anyone else's. */
async function loadOwnMealEntry(
  c: AppContext,
  db: Db,
  entryId: string,
): Promise<{ ok: true; value: OwnEntry } | { ok: false; response: Response }> {
  const actor = c.get("actor");
  const notFound = () =>
    ({
      ok: false,
      response: fail(c, 404, "MEAL_LOG_NOT_FOUND", "We couldn't find that meal log."),
    }) as const;
  if (!actor) return notFound();
  const [entry] = await db
    .select()
    .from(mealCompliance)
    .where(eq(mealCompliance.id, entryId))
    .limit(1);
  if (!entry || entry.traineeUserId !== actor.userId) return notFound();
  const [[assignment], [relationship]] = await db.batch([
    db.select().from(mealAssignments).where(eq(mealAssignments.id, entry.assignmentId)).limit(1),
    db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, entry.coachingRelationshipId))
      .limit(1),
  ]);
  if (!assignment || !relationship || relationship.traineeUserId !== actor.userId) {
    return notFound();
  }
  return { ok: true, value: { entry, assignment, relationship } };
}

function mealEditConflictResponse(c: AppContext, error: CoachLogConflict) {
  return error.kind === "version"
    ? coachMealVersionConflict(c)
    : mealLogWriteConflict(c);
}

/** Replays a stored answer for a retried key, or refuses a key reused for a different request. */
async function replayStoredAnswer(
  c: AppContext,
  db: Db,
  input: { actorUserId: string; operation: string; key: string; fingerprint: string },
): Promise<Response | null> {
  const existing = await findIdempotencyRecord(db, {
    actorUserId: input.actorUserId,
    operation: input.operation,
    idempotencyKey: input.key,
  });
  if (!existing) return null;
  if (existing.requestFingerprint !== input.fingerprint) {
    return fail(
      c,
      409,
      "IDEMPOTENCY_KEY_REUSE",
      "Idempotency key was reused with a different request.",
    );
  }
  return c.json(JSON.parse(existing.responseBody), existing.responseStatus as 200);
}

/** The refusals every trainee change to an existing entry shares (before the window and version). */
function traineeEntryRefusal(c: AppContext, entry: typeof mealCompliance.$inferSelect) {
  if (entry.loggedByRole === "coach") return coachLoggedReadOnlyError(c);
  if (entry.lastEditedByRole === "coach") {
    return fail(c, 409, MEAL_EDITED_BY_COACH_CODE, MEAL_EDITED_BY_COACH_MESSAGE);
  }
  return null;
}

function windowClosed(c: AppContext) {
  return fail(c, 422, MEAL_EDIT_WINDOW_CLOSED_CODE, MEAL_EDIT_WINDOW_CLOSED_MESSAGE);
}

function entryInEndedPeriod(own: OwnEntry, timeZone: string): boolean {
  return isInEndedPeriod({
    reactivatedAt: own.relationship.reactivatedAt,
    loggedAt: own.entry.loggedAt,
    localDate: own.assignment.localDate,
    timeZone,
  });
}

mealRoutes.patch(
  "/logs/:entryId",
  operation({
    tag: "Meals",
    summary: "Trainee edits their own logged meal for 24 hours",
    description:
      "Replaces the outcome (as planned, changed portion, logged foods or ate out), amounts, kcal and note of the trainee's own entry. Allowed until 24 hours after it was first logged (422 MEAL_EDIT_WINDOW_CLOSED). A coach-logged entry is read-only (409 COACH_LOGGED_READ_ONLY), an entry the coach edited can no longer be changed here (409 MEAL_EDITED_BY_COACH), a stale recordVersion is 409 VERSION_CONFLICT. Sets last_edited_* to the trainee, writes the change log and an activity item, tells the coach (one notification per entry per 10 minutes) and re-runs exception evaluation; it never resolves an exception. Through sync, a change made offline inside the window is accepted if it arrives within 72 hours of the window closing.",
    roles: ["trainee"],
    idempotency: true,
    body: traineeEditMealRequestSchema,
    response: mealComplianceSchema,
    errors: [
      { status: 409, description: "COACH_LOGGED_READ_ONLY, MEAL_EDITED_BY_COACH or VERSION_CONFLICT." },
      { status: 422, description: "MEAL_EDIT_WINDOW_CLOSED: the 24 hours have passed." },
    ],
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const idempotencyKey = requireIdempotencyKey(c);
    if (!idempotencyKey) {
      return fail(c, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required.");
    }
    const parsed = traineeEditMealRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid meal edit.", {
        issues: parsed.error.issues,
      });
    }
    const body = parsed.data;
    const entryId = c.req.param("entryId");
    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(JSON.stringify({ entryId, body }));
    const replay = await replayStoredAnswer(c, db, {
      actorUserId: actor.userId,
      operation: EDIT_LOG_OPERATION,
      key: idempotencyKey,
      fingerprint,
    });
    if (replay) return replay;

    const loaded = await loadOwnMealEntry(c, db, entryId);
    if (!loaded.ok) return loaded.response;
    const own = loaded.value;
    const { entry, assignment, relationship } = own;
    const writable = await requireWritableRelationship(c, db, relationship.id);
    if (!writable.ok) return writable.response;
    const refusal = traineeEntryRefusal(c, entry);
    if (refusal) return refusal;

    const now = nowIso();
    if (
      !mealEditWindowAllows({
        loggedAt: entry.loggedAt,
        now,
        deviceTime: syncDeviceTime(c),
      })
    ) {
      return windowClosed(c);
    }
    const timeZone = await loadTraineeTimezone(db, actor.userId);
    if (entryInEndedPeriod(own, timeZone)) {
      return fail(
        c,
        422,
        LOG_TIME_ERROR_CODES.ended_period,
        LOG_TIME_ERROR_MESSAGES.ended_period,
      );
    }
    if (body.recordVersion !== entry.recordVersion) return coachMealVersionConflict(c);

    const nextNotes = body.notes ?? null;
    const nextDeviationKind = body.outcome === "modified" ? (body.deviationKind ?? null) : null;
    const itemKinds = new Set(["logged_foods", "portion_adjustment", "restaurant"]);
    if (
      nextDeviationKind === "logged_foods" &&
      entry.deviationKind !== "logged_foods" &&
      !(body.items && body.items.length > 0)
    ) {
      return fail(c, 400, "INVALID_REQUEST", "There is no food list to keep.");
    }

    let macros: {
      itemsJson: string | null;
      kcalScaled: number | null;
      proteinScaled: number | null;
      carbsScaled: number | null;
      fatScaled: number | null;
    };
    if (body.outcome === "confirmed") {
      macros = prescriptionMacros(assignment.mealPrescriptionJson);
    } else if (
      body.outcome === "modified" &&
      nextDeviationKind &&
      itemKinds.has(nextDeviationKind) &&
      body.items &&
      body.items.length > 0
    ) {
      macros = await buildLoggedFoodsCompliance(db, {
        traineeUserId: actor.userId,
        relationshipId: relationship.id,
        items: body.items,
        allowSaveToMyFoods: nextDeviationKind === "logged_foods",
      });
    } else if (
      body.outcome === "modified" &&
      nextDeviationKind &&
      itemKinds.has(nextDeviationKind) &&
      entry.deviationKind === nextDeviationKind
    ) {
      // Note-only edit of an entry that already carries its lines.
      macros = {
        itemsJson: entry.itemsJson,
        kcalScaled: entry.kcalScaled,
        proteinScaled: entry.proteinScaled,
        carbsScaled: entry.carbsScaled,
        fatScaled: entry.fatScaled,
      };
    } else {
      macros = {
        itemsJson: null,
        kcalScaled: null,
        proteinScaled: null,
        carbsScaled: null,
        fatScaled: null,
      };
    }

    const respond = async (status: 200, data: ReturnType<typeof mealComplianceSchema.parse>) => {
      const responseBody = { data };
      await saveIdempotencyRecord(db, {
        actorUserId: actor.userId,
        operation: EDIT_LOG_OPERATION,
        idempotencyKey,
        requestFingerprint: fingerprint,
        responseStatus: status,
        responseBody,
        expiresAt: addDaysIso(7),
      });
      return c.json(responseBody, status);
    };

    if (
      entry.outcome === body.outcome &&
      entry.deviationKind === nextDeviationKind &&
      entry.notes === nextNotes &&
      entry.itemsJson === macros.itemsJson &&
      entry.kcalScaled === macros.kcalScaled &&
      entry.proteinScaled === macros.proteinScaled &&
      entry.carbsScaled === macros.carbsScaled &&
      entry.fatScaled === macros.fatScaled
    ) {
      // Nothing changed: no new version, no activity item, no notification.
      const view = await traineeMealViewById(db, entry.id, now);
      return respond(200, mealComplianceSchema.parse(view ?? mapMealCompliance(entry)));
    }

    const serverVersion = entry.recordVersion + 1;
    const edited = {
      outcome: body.outcome,
      deviationKind: nextDeviationKind,
      notes: nextNotes,
      ...macros,
      recordVersion: serverVersion,
      lastEditedByRole: "trainee" as const,
      lastEditedByUserId: actor.userId,
      lastEditedAt: now,
      updatedAt: now,
    };
    const beforeSnapshot = mealLogSnapshot({ assignment, compliance: entry });
    const afterSnapshot = mealLogSnapshot({
      assignment,
      compliance: { ...entry, ...edited },
    });
    let responseData: ReturnType<typeof mealComplianceSchema.parse> | undefined;
    try {
      await recordTraineeLogChange(db, {
        entity: {
          type: "meal_compliance",
          id: entry.id,
          coachingRelationshipId: relationship.id,
          traineeUserId: actor.userId,
          serverVersion,
          mealAssignmentId: assignment.id,
        },
        kind: "edit",
        actorUserId: actor.userId,
        before: beforeSnapshot,
        after: afterSnapshot,
        now,
        claim: () =>
          db
            .update(mealCompliance)
            .set(edited)
            .where(
              and(
                eq(mealCompliance.id, entry.id),
                eq(mealCompliance.recordVersion, entry.recordVersion),
              ),
            ),
        afterCommit: async () => {
          const view = await traineeMealViewById(db, entry.id, now);
          responseData = mealComplianceSchema.parse(view);
          await saveIdempotencyRecord(db, {
            actorUserId: actor.userId,
            operation: EDIT_LOG_OPERATION,
            idempotencyKey,
            requestFingerprint: fingerprint,
            responseStatus: 200,
            responseBody: { data: responseData },
            expiresAt: addDaysIso(7),
          });
        },
      });
    } catch (error) {
      if (error instanceof CoachLogConflict) return mealEditConflictResponse(c, error);
      throw error;
    }
    if (!responseData) throw new Error("Meal edit committed without a stored entry.");

    queueRealtimeHint(c.env, {
      eventType: "meal_compliance_changed",
      entityType: "meal_compliance",
      entityId: entry.id,
      coachingRelationshipId: relationship.id,
      serverVersion,
    });
    // After the commit; never fails the trainee's request (logs and goes on).
    await notifyTrainerClientLogEdited(
      db,
      {
        relationshipId: relationship.id,
        trainerUserId: relationship.trainerUserId,
        entryId: entry.id,
        action: "edited",
        mealName: assignment.mealName,
        mealDate: assignment.localDate,
        before: entry,
        after: { ...entry, ...edited },
        now,
      },
      coachPushConfig(c.env),
    );
    return c.json({ data: responseData }, 200);
  },
);

async function removeRecordVersion(c: AppContext): Promise<number | null> {
  const fromQuery = c.req.query("recordVersion");
  if (fromQuery !== undefined) {
    const value = Number(fromQuery);
    return Number.isInteger(value) && value >= 0 ? value : null;
  }
  const parsed = traineeRemoveMealRequestSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  return parsed.success ? parsed.data.recordVersion : null;
}

mealRoutes.delete(
  "/logs/:entryId",
  operation({
    tag: "Meals",
    summary: "Trainee removes their own logged meal",
    description:
      "Puts the meal back to not logged. Allowed only while the entry is inside its 24 hour window and the meal could still be logged (its confirmation window is open and the day is not locked); otherwise 422 MEAL_REMOVE_NOT_ALLOWED. recordVersion is required (query or body). The change log keeps the full before-image, the coach sees a removal activity item and is notified, and exceptions are re-evaluated (never resolved).",
    roles: ["trainee"],
    idempotency: true,
    response: removeMealLogResponseSchema,
    errors: [
      { status: 409, description: "COACH_LOGGED_READ_ONLY, MEAL_EDITED_BY_COACH or VERSION_CONFLICT." },
      { status: 422, description: "MEAL_REMOVE_NOT_ALLOWED or MEAL_EDIT_WINDOW_CLOSED (offline)." },
    ],
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const idempotencyKey = requireIdempotencyKey(c);
    if (!idempotencyKey) {
      return fail(c, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required.");
    }
    const recordVersion = await removeRecordVersion(c);
    if (recordVersion === null) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid meal removal.");
    }
    const entryId = c.req.param("entryId");
    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(JSON.stringify({ entryId, recordVersion }));
    const replay = await replayStoredAnswer(c, db, {
      actorUserId: actor.userId,
      operation: REMOVE_LOG_OPERATION,
      key: idempotencyKey,
      fingerprint,
    });
    if (replay) return replay;

    const loaded = await loadOwnMealEntry(c, db, entryId);
    if (!loaded.ok) return loaded.response;
    const own = loaded.value;
    const { entry, assignment, relationship } = own;
    const writable = await requireWritableRelationship(c, db, relationship.id);
    if (!writable.ok) return writable.response;
    const refusal = traineeEntryRefusal(c, entry);
    if (refusal) return refusal;

    const now = nowIso();
    const deviceTime = syncDeviceTime(c);
    if (!mealEditWindowAllows({ loggedAt: entry.loggedAt, now, deviceTime })) {
      // Offline (sync) the refusal is the verdict the app shows in sync status.
      return deviceTime
        ? windowClosed(c)
        : fail(c, 422, MEAL_REMOVE_NOT_ALLOWED_CODE, MEAL_REMOVE_NOT_ALLOWED_MESSAGE);
    }
    const [timeZone, [exception]] = await Promise.all([
      loadTraineeTimezone(db, actor.userId),
      db
        .select({ status: exceptions.status })
        .from(exceptions)
        .where(
          and(
            eq(exceptions.coachingRelationshipId, relationship.id),
            eq(exceptions.sourceEntityId, assignment.id),
          ),
        )
        .limit(1),
    ]);
    if (
      !mealStillLoggable(
        removeInputsFor({
          assignment,
          exceptionStatus: exception?.status ?? null,
          timeZone,
          reactivatedAt: relationship.reactivatedAt,
          at: deviceTime ?? now,
        }),
      )
    ) {
      return fail(c, 422, MEAL_REMOVE_NOT_ALLOWED_CODE, MEAL_REMOVE_NOT_ALLOWED_MESSAGE);
    }
    if (recordVersion !== entry.recordVersion) return coachMealVersionConflict(c);

    const responseBody = {
      data: removeMealLogResponseSchema.parse({
        id: entry.id,
        assignmentId: assignment.id,
        coachingRelationshipId: relationship.id,
        removed: true,
      }),
    };
    const beforeSnapshot = mealLogSnapshot({ assignment, compliance: entry });
    try {
      await recordTraineeLogChange(db, {
        entity: {
          type: "meal_compliance",
          id: entry.id,
          coachingRelationshipId: relationship.id,
          traineeUserId: actor.userId,
          serverVersion: null,
          mealAssignmentId: assignment.id,
        },
        kind: "remove",
        actorUserId: actor.userId,
        before: beforeSnapshot,
        // The full before-image stays in `beforeJson`; `removed` marks the item.
        after: { ...beforeSnapshot, removed: true },
        now,
        claim: () =>
          db
            .delete(mealCompliance)
            .where(
              and(
                eq(mealCompliance.id, entry.id),
                eq(mealCompliance.recordVersion, entry.recordVersion),
              ),
            ),
        afterCommit: async () => {
          await saveIdempotencyRecord(db, {
            actorUserId: actor.userId,
            operation: REMOVE_LOG_OPERATION,
            idempotencyKey,
            requestFingerprint: fingerprint,
            responseStatus: 200,
            responseBody,
            expiresAt: addDaysIso(7),
          });
        },
      });
    } catch (error) {
      if (error instanceof CoachLogConflict) return mealEditConflictResponse(c, error);
      throw error;
    }

    queueRealtimeHint(c.env, {
      eventType: "meal_compliance_changed",
      entityType: "meal_compliance",
      entityId: entry.id,
      coachingRelationshipId: relationship.id,
      serverVersion: entry.recordVersion,
    });
    await notifyTrainerClientLogEdited(
      db,
      {
        relationshipId: relationship.id,
        trainerUserId: relationship.trainerUserId,
        entryId: entry.id,
        action: "removed",
        mealName: assignment.mealName,
        mealDate: assignment.localDate,
        before: entry,
        after: null,
        now,
      },
      coachPushConfig(c.env),
    );
    return c.json(responseBody, 200);
  },
);

mealRoutes.post(
  "/logs/:entryId/photo",
  operation({
    tag: "Meals",
    summary: "Trainee attaches a photo to a logged meal",
    description:
      "Links a ready meal_photo asset the trainee uploaded to their own entry, replacing an earlier photo (the change log keeps what it replaced). Refused after the entry's 24 hour window (422 MEAL_EDIT_WINDOW_CLOSED), on a coach-logged or coach-edited entry and on an ended relationship. A photo-only change does not mark the entry Edited and does not notify the coach.",
    roles: ["trainee"],
    idempotency: true,
    body: attachMealPhotoRequestSchema,
    response: mealComplianceSchema,
    errors: [
      { status: 409, description: "COACH_LOGGED_READ_ONLY or MEAL_EDITED_BY_COACH." },
      { status: 422, description: "MEAL_EDIT_WINDOW_CLOSED or MEDIA_ASSET_INVALID." },
    ],
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const idempotencyKey = requireIdempotencyKey(c);
    if (!idempotencyKey) {
      return fail(c, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required.");
    }
    const parsed = attachMealPhotoRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid photo request.", {
        issues: parsed.error.issues,
      });
    }
    const entryId = c.req.param("entryId");
    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(
      JSON.stringify({ entryId, mediaAssetId: parsed.data.mediaAssetId }),
    );
    const replay = await replayStoredAnswer(c, db, {
      actorUserId: actor.userId,
      operation: PHOTO_LOG_OPERATION,
      key: idempotencyKey,
      fingerprint,
    });
    if (replay) return replay;

    const loaded = await loadOwnMealEntry(c, db, entryId);
    if (!loaded.ok) return loaded.response;
    const { entry, assignment, relationship } = loaded.value;
    const writable = await requireWritableRelationship(c, db, relationship.id);
    if (!writable.ok) return writable.response;
    const refusal = traineeEntryRefusal(c, entry);
    if (refusal) return refusal;

    const now = nowIso();
    if (
      !mealEditWindowAllows({
        loggedAt: entry.loggedAt,
        now,
        deviceTime: syncDeviceTime(c),
      })
    ) {
      return windowClosed(c);
    }
    const media = await loadReadyMealPhotoAsset(
      db,
      parsed.data.mediaAssetId,
      relationship.id,
      actor.userId,
    );
    if (!media) {
      return fail(
        c,
        422,
        "MEDIA_ASSET_INVALID",
        "Linked media asset must be a ready meal photo for this relationship.",
      );
    }

    const beforeSnapshot = mealLogSnapshot({ assignment, compliance: entry });
    const serverVersion = entry.recordVersion + 1;
    const photoIntent = { notedAt: now, mediaAssetId: media.id };
    let responseData: ReturnType<typeof mealComplianceSchema.parse> | undefined;
    try {
      await recordTraineeLogChange(db, {
        entity: {
          type: "meal_compliance",
          id: entry.id,
          coachingRelationshipId: relationship.id,
          traineeUserId: actor.userId,
          serverVersion,
          mealAssignmentId: assignment.id,
        },
        kind: "edit",
        actorUserId: actor.userId,
        // The replaced photo stays in the history (`beforeJson`).
        before: { ...beforeSnapshot, photoOnly: true, mediaAssetId: entry.mediaAssetId },
        after: { ...beforeSnapshot, photoOnly: true, mediaAssetId: media.id },
        now,
        claim: () =>
          db
            .update(mealCompliance)
            .set({
              mediaAssetId: media.id,
              photoIntentJson: serializePhotoIntent(photoIntent),
              recordVersion: serverVersion,
              updatedAt: now,
            })
            .where(
              and(
                eq(mealCompliance.id, entry.id),
                eq(mealCompliance.recordVersion, entry.recordVersion),
              ),
            ),
        extraWrites: () => [
          db
            .update(mediaAssets)
            .set({
              domainEntityType: "meal_compliance",
              domainEntityId: entry.id,
              updatedAt: now,
            })
            .where(eq(mediaAssets.id, media.id)),
        ],
        afterCommit: async () => {
          const view = await traineeMealViewById(db, entry.id, now);
          responseData = mealComplianceSchema.parse(view);
          await saveIdempotencyRecord(db, {
            actorUserId: actor.userId,
            operation: PHOTO_LOG_OPERATION,
            idempotencyKey,
            requestFingerprint: fingerprint,
            responseStatus: 200,
            responseBody: { data: responseData },
            expiresAt: addDaysIso(7),
          });
        },
      });
    } catch (error) {
      if (error instanceof CoachLogConflict) return mealEditConflictResponse(c, error);
      throw error;
    }
    if (!responseData) throw new Error("Meal photo committed without a stored entry.");

    queueRealtimeHint(c.env, {
      eventType: "meal_compliance_changed",
      entityType: "meal_compliance",
      entityId: entry.id,
      coachingRelationshipId: relationship.id,
      serverVersion,
    });
    return c.json({ data: responseData }, 200);
  },
);
