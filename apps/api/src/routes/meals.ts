import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import {
  confirmMealRequestSchema,
  deviateMealRequestSchema,
  generateMealAssignmentsRequestSchema,
  generateMealAssignmentsResponseSchema,
  localDateSchema,
  mealAssignmentListResponseSchema,
  mealAssignmentSchema,
  mealComplianceSchema,
  mealComplianceSummaryResponseSchema,
  skipMealRequestSchema,
  type MealPhotoIntent,
} from "@fitbud/contracts";
import {
  canRecordMealCompliance,
  eachLocalDateInclusive,
  mealPhotoIntentSatisfied,
  mealWindowForLocalDate,
  resolveMealPhotoRequired,
} from "@fitbud/core";
import { createDb } from "../db/client";
import {
  coachingConfigurations,
  coachingRelationships,
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
  parsePlanContentJson,
} from "../domain/mappers";
import { appendChangeLog } from "../domain/sync";
import { addDaysIso, createId, nowIso, sha256Hex } from "../lib/crypto";
import { fail, ok, type AppContext } from "../lib/envelope";
import {
  findIdempotencyRecord,
  saveIdempotencyRecord,
} from "../lib/idempotency";
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

type Db = ReturnType<typeof createDb>;

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

async function loadTraineeTimezone(db: Db, traineeUserId: string) {
  const rows = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, traineeUserId))
    .limit(1);
  return rows[0]?.timezone ?? "UTC";
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

function serializePhotoIntent(
  intent: MealPhotoIntent | null | undefined,
): string | null {
  if (!intent) return null;
  return JSON.stringify(intent);
}

mealRoutes.post(
  "/relationships/:relationshipId/assignments/generate",
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
    if (parsed.data.fromDate > parsed.data.toDate) {
      return fail(
        c,
        400,
        "INVALID_DATE_RANGE",
        "fromDate must be on or before toDate.",
      );
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
    const prescriptions = content.mealPrescriptions
      .slice()
      .sort((a, b) => a.order - b.order);
    if (prescriptions.length === 0) {
      return fail(
        c,
        422,
        "NO_MEAL_PRESCRIPTIONS",
        "The effective plan has no meal prescriptions.",
      );
    }

    const timezone = await loadTraineeTimezone(db, relationship.traineeUserId);
    const now = nowIso();
    const createdRows: (typeof mealAssignments.$inferSelect)[] = [];

    for (const localDate of eachLocalDateInclusive(
      parsed.data.fromDate,
      parsed.data.toDate,
    )) {
      for (const prescription of prescriptions) {
        const existingAssignment = await db
          .select()
          .from(mealAssignments)
          .where(
            and(
              eq(mealAssignments.coachingRelationshipId, relationship.id),
              eq(mealAssignments.planVersionId, effective.version.id),
              eq(mealAssignments.mealPrescriptionId, prescription.id),
              eq(mealAssignments.localDate, localDate),
            ),
          )
          .limit(1);
        if (existingAssignment[0]) continue;

        const window = mealWindowForLocalDate({
          localDate,
          timeZone: timezone,
          confirmationWindowHours: config.nutrition.confirmationWindowHours,
        });
        const photoRequired = resolveMealPhotoRequired({
          photoRequirement: config.nutrition.photoRequirement,
          prescriptionPhotoRequired: prescription.photoRequired,
        });

        const row = {
          id: createId(),
          coachingRelationshipId: relationship.id,
          planId: effective.plan.id,
          planVersionId: effective.version.id,
          mealPrescriptionId: prescription.id,
          mealName: prescription.name,
          mealPrescriptionJson: JSON.stringify(prescription),
          localDate,
          windowStartsAt: window.windowStartsAt,
          windowEndsAt: window.windowEndsAt,
          photoRequired,
          createdAt: now,
          updatedAt: now,
        };
        await db.insert(mealAssignments).values(row);
        createdRows.push(row);
      }
    }

    const responseBody = {
      data: generateMealAssignmentsResponseSchema.parse({
        created: createdRows.length,
        assignments: createdRows.map((row) =>
          mapMealAssignment(row, null, now),
        ),
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
    ];
    if (fromDate) {
      conditions.push(gte(mealAssignments.localDate, fromDate));
    }
    if (toDate) {
      conditions.push(lte(mealAssignments.localDate, toDate));
    }

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
      .orderBy(
        asc(mealAssignments.localDate),
        asc(mealAssignments.mealName),
        asc(mealAssignments.id),
      );

    const now = nowIso();
    return ok(
      c,
      mealAssignmentListResponseSchema.parse({
        items: rows.map((row) =>
          mapMealAssignment(row.assignment, row.compliance ?? null, now),
        ),
        nextCursor: null,
      }),
    );
  },
);

mealRoutes.get(
  "/relationships/:relationshipId/compliance",
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

    return ok(
      c,
      mealAssignmentSchema.parse(
        mapMealAssignment(loaded.assignment, loaded.compliance, nowIso()),
      ),
    );
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
      | null;
    notes?: string | null;
    photoIntent?: MealPhotoIntent | null;
    requirePhotoWhenConfigured: boolean;
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

  const now = nowIso();
  const row = {
    id: createId(),
    assignmentId: loaded.assignment.id,
    coachingRelationshipId: relationship.id,
    planVersionId: loaded.assignment.planVersionId,
    traineeUserId: actor.userId,
    outcome: input.outcome,
    recordVersion: 0,
    loggedAt: now,
    deviationKind: input.deviationKind ?? null,
    notes: input.notes ?? null,
    photoRequired: loaded.assignment.photoRequired,
    photoIntentJson: serializePhotoIntent(input.photoIntent),
    mediaAssetId: linkedMediaAssetId,
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
    data: mapped,
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
    });
  },
);

mealRoutes.post(
  "/assignments/:assignmentId/deviate",
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
    });
  },
);

mealRoutes.post(
  "/assignments/:assignmentId/skip",
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
    });
  },
);
