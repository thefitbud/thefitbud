import { and, desc, eq, lt, or } from "drizzle-orm";
import { Hono } from "hono";
import {
  createPlanDraftFromVersionRequestSchema,
  createPlanRequestSchema,
  createPlanResponseSchema,
  applyPlanTemplateRequestSchema,
  applyPlanTemplateResponseSchema,
  effectivePlanResponseSchema,
  planContentSchema,
  planListResponseSchema,
  planVersionSchema,
  planWithVersionsSchema,
  publishPlanRequestSchema,
  updatePlanDraftRequestSchema,
} from "@fitbud/contracts";
import {
  canEditPlanVersion,
  canPromoteScheduledPlanVersion,
  canPublishPlanVersion,
  copyPlanContent,
} from "@fitbud/core";
import { createDb } from "../db/client";
import {
  coachingRelationships,
  plans,
  planTemplates,
  planVersions,
} from "../db/schema";
import {
  mapPlan,
  mapPlanVersion,
  mapPlanVersionSummary,
  parsePlanContentJson,
} from "../domain/mappers";
import { appendChangeLog } from "../domain/sync";
import { addDaysIso, createId, nowIso, sha256Hex } from "../lib/crypto";
import { buildPage, decodeCursor } from "../lib/cursor";
import { fail, ok } from "../lib/envelope";
import {
  findIdempotencyRecord,
  saveIdempotencyRecord,
} from "../lib/idempotency";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth";
import { queueRealtimeHint } from "../realtime/emit";
import { canAccessRelationship } from "./relationships";
import type { Env, Variables } from "../types";

const CREATE_PLAN_OPERATION = "plan.create";
const PUBLISH_PLAN_OPERATION = "plan.publish";
const CREATE_DRAFT_FROM_VERSION_OPERATION = "plan.draft_from_version";
const APPLY_TEMPLATE_OPERATION = "plan.apply_template";

export const planRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

type Db = ReturnType<typeof createDb>;

async function loadOwnedPlan(
  db: Db,
  planId: string,
  trainerUserId: string,
) {
  const rows = await db
    .select({
      plan: plans,
      relationship: coachingRelationships,
    })
    .from(plans)
    .innerJoin(
      coachingRelationships,
      eq(plans.coachingRelationshipId, coachingRelationships.id),
    )
    .where(eq(plans.id, planId))
    .limit(1);
  const row = rows[0];
  if (!row || row.relationship.trainerUserId !== trainerUserId) {
    return null;
  }
  return row;
}

async function loadAccessiblePlan(
  db: Db,
  planId: string,
  actorUserId: string,
  selectedRole: "trainer" | "trainee",
) {
  const rows = await db
    .select({
      plan: plans,
      relationship: coachingRelationships,
    })
    .from(plans)
    .innerJoin(
      coachingRelationships,
      eq(plans.coachingRelationshipId, coachingRelationships.id),
    )
    .where(eq(plans.id, planId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (
    selectedRole === "trainer" &&
    row.relationship.trainerUserId === actorUserId
  ) {
    return row;
  }
  if (
    selectedRole === "trainee" &&
    row.relationship.traineeUserId === actorUserId
  ) {
    return row;
  }
  return null;
}

async function listVersionsForPlan(db: Db, planId: string) {
  return db
    .select()
    .from(planVersions)
    .where(eq(planVersions.planId, planId))
    .orderBy(desc(planVersions.versionNumber));
}

async function supersedeEffectiveVersions(
  db: Db,
  planId: string,
  now: string,
  exceptVersionId?: string,
) {
  const effectiveRows = await db
    .select()
    .from(planVersions)
    .where(
      and(eq(planVersions.planId, planId), eq(planVersions.status, "effective")),
    );
  for (const row of effectiveRows) {
    if (exceptVersionId && row.id === exceptVersionId) continue;
    await db
      .update(planVersions)
      .set({
        status: "superseded",
        effectiveTo: now,
        updatedAt: now,
      })
      .where(eq(planVersions.id, row.id));
  }
}

async function promoteDueScheduledVersions(
  db: Db,
  relationshipId: string,
  now: string,
  env?: Env,
): Promise<void> {
  const scheduled = await db
    .select({
      version: planVersions,
      plan: plans,
    })
    .from(planVersions)
    .innerJoin(plans, eq(planVersions.planId, plans.id))
    .where(
      and(
        eq(plans.coachingRelationshipId, relationshipId),
        eq(planVersions.status, "scheduled"),
      ),
    );

  for (const row of scheduled) {
    if (
      !canPromoteScheduledPlanVersion(row.version.status) ||
      !row.version.effectiveFrom ||
      row.version.effectiveFrom > now
    ) {
      continue;
    }
    await supersedeEffectiveVersions(db, row.plan.id, now);
    await db
      .update(planVersions)
      .set({
        status: "effective",
        updatedAt: now,
      })
      .where(eq(planVersions.id, row.version.id));
    if (env) {
      queueRealtimeHint(env, {
        eventType: "effective_plan_changed",
        entityType: "plan_version",
        entityId: row.version.id,
        coachingRelationshipId: relationshipId,
        serverVersion: row.version.recordVersion,
      });
    }
  }
}

planRoutes.get(
  "/relationships/:relationshipId",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const relationshipId = c.req.param("relationshipId");
    const db = createDb(c.env.DB);
    const relationships = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, relationshipId))
      .limit(1);
    const relationship = relationships[0];
    if (!relationship || !canAccessRelationship(actor, relationship)) {
      return fail(
        c,
        404,
        "RELATIONSHIP_NOT_FOUND",
        "Coaching relationship not found.",
      );
    }

    await promoteDueScheduledVersions(db, relationshipId, nowIso(), c.env);

    const limitRaw = Number(c.req.query("limit") ?? "20");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.trunc(limitRaw), 1), 50)
      : 20;
    const cursor = c.req.query("cursor");
    const decoded = cursor ? decodeCursor(cursor) : null;
    if (cursor && !decoded) {
      return fail(c, 400, "INVALID_CURSOR", "Cursor is invalid.");
    }

    const conditions = [eq(plans.coachingRelationshipId, relationshipId)];
    if (decoded) {
      conditions.push(
        or(
          lt(plans.createdAt, decoded.k),
          and(eq(plans.createdAt, decoded.k), lt(plans.id, decoded.id)),
        )!,
      );
    }

    const rows = await db
      .select()
      .from(plans)
      .where(and(...conditions))
      .orderBy(desc(plans.createdAt), desc(plans.id))
      .limit(limit + 1);

    const page = buildPage(rows, limit, (item) => item.createdAt);
    const items = [];
    for (const plan of page.items) {
      const versions = await listVersionsForPlan(db, plan.id);
      items.push(
        planWithVersionsSchema.parse({
          plan: mapPlan(plan),
          versions: versions.map(mapPlanVersionSummary),
        }),
      );
    }

    return ok(
      c,
      planListResponseSchema.parse({
        items,
        nextCursor: page.nextCursor,
      }),
    );
  },
);

planRoutes.get(
  "/relationships/:relationshipId/effective",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const relationshipId = c.req.param("relationshipId");
    const db = createDb(c.env.DB);
    const relationships = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, relationshipId))
      .limit(1);
    const relationship = relationships[0];
    if (!relationship || !canAccessRelationship(actor, relationship)) {
      return fail(
        c,
        404,
        "RELATIONSHIP_NOT_FOUND",
        "Coaching relationship not found.",
      );
    }

    const now = nowIso();
    await promoteDueScheduledVersions(db, relationshipId, now, c.env);

    const rows = await db
      .select({
        plan: plans,
        version: planVersions,
      })
      .from(planVersions)
      .innerJoin(plans, eq(planVersions.planId, plans.id))
      .where(
        and(
          eq(plans.coachingRelationshipId, relationshipId),
          eq(planVersions.status, "effective"),
        ),
      )
      .orderBy(desc(planVersions.effectiveFrom), desc(planVersions.versionNumber))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return ok(
        c,
        effectivePlanResponseSchema.parse({ plan: null, version: null }),
      );
    }

    return ok(
      c,
      effectivePlanResponseSchema.parse({
        plan: mapPlan(row.plan),
        version: mapPlanVersion(row.version),
      }),
    );
  },
);

planRoutes.post(
  "/relationships/:relationshipId",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = createPlanRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid create plan request.", {
        issues: parsed.error.issues,
      });
    }

    const idempotencyKey = c.req.header("Idempotency-Key");
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required.",
      );
    }

    const relationshipId = c.req.param("relationshipId");
    const fingerprint = await sha256Hex(JSON.stringify(parsed.data));
    const db = createDb(c.env.DB);

    const prior = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: CREATE_PLAN_OPERATION,
      idempotencyKey,
    });
    if (prior) {
      if (prior.requestFingerprint !== fingerprint) {
        return fail(
          c,
          409,
          "IDEMPOTENCY_KEY_REUSE",
          "Idempotency key was reused with a different request payload.",
        );
      }
      return c.json(
        JSON.parse(prior.responseBody),
        prior.responseStatus as 201,
      );
    }

    const relationships = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, relationshipId))
      .limit(1);
    const relationship = relationships[0];
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(
        c,
        404,
        "RELATIONSHIP_NOT_FOUND",
        "Coaching relationship not found.",
      );
    }

    if (relationship.status !== "coaching_ready") {
      return fail(
        c,
        409,
        "PLAN_NOT_ALLOWED",
        "Plans require a coaching-ready relationship.",
      );
    }

    const now = nowIso();
    const planId = createId();
    const versionId = createId();
    await db.insert(plans).values({
      id: planId,
      coachingRelationshipId: relationshipId,
      title: parsed.data.title,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(planVersions).values({
      id: versionId,
      planId,
      versionNumber: 1,
      status: "draft",
      recordVersion: 1,
      contentJson: JSON.stringify(parsed.data.content),
      creationSource: "blank",
      publishedAt: null,
      effectiveFrom: null,
      effectiveTo: null,
      createdAt: now,
      updatedAt: now,
    });

    const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
    const [version] = await db
      .select()
      .from(planVersions)
      .where(eq(planVersions.id, versionId))
      .limit(1);
    if (!plan || !version) {
      return fail(c, 500, "PLAN_PERSIST_FAILED", "Plan could not be loaded.");
    }

    const data = createPlanResponseSchema.parse({
      plan: mapPlan(plan),
      version: mapPlanVersion(version),
    });
    const responseBody = { data };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: CREATE_PLAN_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 201,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return ok(c, data, 201);
  },
);

planRoutes.post(
  "/relationships/:relationshipId/from-template",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = applyPlanTemplateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        c,
        400,
        "INVALID_REQUEST",
        "Invalid apply template request.",
        { issues: parsed.error.issues },
      );
    }

    const idempotencyKey = c.req.header("Idempotency-Key");
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required.",
      );
    }

    const relationshipId = c.req.param("relationshipId");
    const fingerprint = await sha256Hex(
      JSON.stringify({ relationshipId, ...parsed.data }),
    );
    const db = createDb(c.env.DB);

    const prior = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: APPLY_TEMPLATE_OPERATION,
      idempotencyKey,
    });
    if (prior) {
      if (prior.requestFingerprint !== fingerprint) {
        return fail(
          c,
          409,
          "IDEMPOTENCY_KEY_REUSE",
          "Idempotency key was reused with a different request payload.",
        );
      }
      return c.json(
        JSON.parse(prior.responseBody),
        prior.responseStatus as 200 | 201,
      );
    }

    const relationships = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, relationshipId))
      .limit(1);
    const relationship = relationships[0];
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(
        c,
        404,
        "RELATIONSHIP_NOT_FOUND",
        "Coaching relationship not found.",
      );
    }
    if (relationship.status !== "coaching_ready") {
      return fail(
        c,
        409,
        "PLAN_NOT_ALLOWED",
        "Plans require a coaching-ready relationship.",
      );
    }

    const templates = await db
      .select()
      .from(planTemplates)
      .where(eq(planTemplates.id, parsed.data.templateId))
      .limit(1);
    const template = templates[0];
    if (!template || template.trainerUserId !== actor.userId) {
      return fail(c, 404, "TEMPLATE_NOT_FOUND", "Template not found.");
    }

    // Fresh UUIDs: mutating the template later must not affect this draft.
    const content = copyPlanContent(
      parsePlanContentJson(template.contentJson),
      createId,
    );
    const title = parsed.data.title ?? template.title;
    const now = nowIso();

    const existingPlans = await db
      .select()
      .from(plans)
      .where(eq(plans.coachingRelationshipId, relationshipId))
      .orderBy(desc(plans.createdAt))
      .limit(1);
    let plan = existingPlans[0] ?? null;
    let updatedExistingDraft = false;
    let versionId: string;
    let responseStatus: 200 | 201 = 201;

    if (!plan) {
      const planId = createId();
      versionId = createId();
      await db.insert(plans).values({
        id: planId,
        coachingRelationshipId: relationshipId,
        title,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(planVersions).values({
        id: versionId,
        planId,
        versionNumber: 1,
        status: "draft",
        recordVersion: 1,
        contentJson: JSON.stringify(content),
        creationSource: "template",
        publishedAt: null,
        effectiveFrom: null,
        effectiveTo: null,
        createdAt: now,
        updatedAt: now,
      });
      const [createdPlan] = await db
        .select()
        .from(plans)
        .where(eq(plans.id, planId))
        .limit(1);
      plan = createdPlan ?? null;
    } else {
      const drafts = await db
        .select()
        .from(planVersions)
        .where(
          and(eq(planVersions.planId, plan.id), eq(planVersions.status, "draft")),
        )
        .limit(1);
      const draft = drafts[0];
      if (draft) {
        if (
          parsed.data.expectedRecordVersion !== undefined &&
          draft.recordVersion !== parsed.data.expectedRecordVersion
        ) {
          return fail(
            c,
            409,
            "PLAN_VERSION_CONFLICT",
            "The plan draft was changed after this version was loaded.",
          );
        }
        await db
          .update(planVersions)
          .set({
            contentJson: JSON.stringify(content),
            creationSource: "template",
            recordVersion: draft.recordVersion + 1,
            updatedAt: now,
          })
          .where(eq(planVersions.id, draft.id));
        await db
          .update(plans)
          .set({ title, updatedAt: now })
          .where(eq(plans.id, plan.id));
        versionId = draft.id;
        updatedExistingDraft = true;
        responseStatus = 200;
      } else {
        const latest = await db
          .select()
          .from(planVersions)
          .where(eq(planVersions.planId, plan.id))
          .orderBy(desc(planVersions.versionNumber))
          .limit(1);
        const nextNumber = (latest[0]?.versionNumber ?? 0) + 1;
        versionId = createId();
        await db.insert(planVersions).values({
          id: versionId,
          planId: plan.id,
          versionNumber: nextNumber,
          status: "draft",
          recordVersion: 1,
          contentJson: JSON.stringify(content),
          creationSource: "template",
          publishedAt: null,
          effectiveFrom: null,
          effectiveTo: null,
          createdAt: now,
          updatedAt: now,
        });
        await db
          .update(plans)
          .set({ title, updatedAt: now })
          .where(eq(plans.id, plan.id));
      }
      const [refreshed] = await db
        .select()
        .from(plans)
        .where(eq(plans.id, plan.id))
        .limit(1);
      plan = refreshed ?? plan;
    }

    if (!plan) {
      return fail(c, 500, "PLAN_PERSIST_FAILED", "Plan could not be loaded.");
    }

    const [version] = await db
      .select()
      .from(planVersions)
      .where(eq(planVersions.id, versionId))
      .limit(1);
    if (!version) {
      return fail(
        c,
        500,
        "PLAN_VERSION_PERSIST_FAILED",
        "Plan version could not be loaded.",
      );
    }

    const data = applyPlanTemplateResponseSchema.parse({
      plan: mapPlan(plan),
      version: mapPlanVersion(version),
      updatedExistingDraft,
    });
    const responseBody = { data };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: APPLY_TEMPLATE_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return ok(c, data, responseStatus);
  },
);

planRoutes.get(
  "/:planId",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const planId = c.req.param("planId");
    const db = createDb(c.env.DB);
    const owned = await loadAccessiblePlan(
      db,
      planId,
      actor.userId,
      actor.selectedRole,
    );
    if (!owned) {
      return fail(c, 404, "PLAN_NOT_FOUND", "Plan not found.");
    }

    await promoteDueScheduledVersions(
      db,
      owned.plan.coachingRelationshipId,
      nowIso(),
      c.env,
    );
    const versions = await listVersionsForPlan(db, planId);
    return ok(
      c,
      planWithVersionsSchema.parse({
        plan: mapPlan(owned.plan),
        versions: versions.map(mapPlanVersionSummary),
      }),
    );
  },
);

planRoutes.get(
  "/:planId/versions/:versionId",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const planId = c.req.param("planId");
    const versionId = c.req.param("versionId");
    const db = createDb(c.env.DB);
    const owned = await loadAccessiblePlan(
      db,
      planId,
      actor.userId,
      actor.selectedRole,
    );
    if (!owned) {
      return fail(c, 404, "PLAN_NOT_FOUND", "Plan not found.");
    }

    const versions = await db
      .select()
      .from(planVersions)
      .where(
        and(eq(planVersions.id, versionId), eq(planVersions.planId, planId)),
      )
      .limit(1);
    const version = versions[0];
    if (!version) {
      return fail(c, 404, "PLAN_VERSION_NOT_FOUND", "Plan version not found.");
    }

    return ok(c, planVersionSchema.parse(mapPlanVersion(version)));
  },
);

planRoutes.put(
  "/:planId/versions/:versionId",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = updatePlanDraftRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid plan draft update.", {
        issues: parsed.error.issues,
      });
    }

    const planId = c.req.param("planId");
    const versionId = c.req.param("versionId");
    const db = createDb(c.env.DB);
    const owned = await loadOwnedPlan(db, planId, actor.userId);
    if (!owned) {
      return fail(c, 404, "PLAN_NOT_FOUND", "Plan not found.");
    }

    const versions = await db
      .select()
      .from(planVersions)
      .where(
        and(eq(planVersions.id, versionId), eq(planVersions.planId, planId)),
      )
      .limit(1);
    const version = versions[0];
    if (!version) {
      return fail(c, 404, "PLAN_VERSION_NOT_FOUND", "Plan version not found.");
    }

    if (!canEditPlanVersion(version.status)) {
      return fail(
        c,
        409,
        "PLAN_VERSION_IMMUTABLE",
        "Published, effective, scheduled, or superseded plan versions cannot be edited.",
      );
    }

    if (version.recordVersion !== parsed.data.expectedRecordVersion) {
      return fail(
        c,
        409,
        "PLAN_VERSION_CONFLICT",
        "The plan draft was changed after this version was loaded.",
      );
    }

    const now = nowIso();
    if (parsed.data.title) {
      await db
        .update(plans)
        .set({ title: parsed.data.title, updatedAt: now })
        .where(eq(plans.id, planId));
    }

    await db
      .update(planVersions)
      .set({
        contentJson: JSON.stringify(parsed.data.content),
        recordVersion: version.recordVersion + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(planVersions.id, versionId),
          eq(planVersions.recordVersion, parsed.data.expectedRecordVersion),
        ),
      );

    const [updated] = await db
      .select()
      .from(planVersions)
      .where(eq(planVersions.id, versionId))
      .limit(1);
    if (!updated) {
      return fail(
        c,
        500,
        "PLAN_VERSION_PERSIST_FAILED",
        "Plan version could not be loaded.",
      );
    }
    return ok(c, planVersionSchema.parse(mapPlanVersion(updated)));
  },
);

planRoutes.post(
  "/:planId/versions/:versionId/preview",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const planId = c.req.param("planId");
    const versionId = c.req.param("versionId");
    const db = createDb(c.env.DB);
    const owned = await loadOwnedPlan(db, planId, actor.userId);
    if (!owned) {
      return fail(c, 404, "PLAN_NOT_FOUND", "Plan not found.");
    }

    const versions = await db
      .select()
      .from(planVersions)
      .where(
        and(eq(planVersions.id, versionId), eq(planVersions.planId, planId)),
      )
      .limit(1);
    const version = versions[0];
    if (!version) {
      return fail(c, 404, "PLAN_VERSION_NOT_FOUND", "Plan version not found.");
    }

    const content = planContentSchema.safeParse(
      JSON.parse(version.contentJson) as unknown,
    );
    if (!content.success) {
      return fail(
        c,
        422,
        "PLAN_CONTENT_INVALID",
        "Plan content failed validation and cannot be previewed.",
        { issues: content.error.issues },
      );
    }

    return ok(
      c,
      planVersionSchema.parse({
        ...mapPlanVersion(version),
        content: content.data,
      }),
    );
  },
);

planRoutes.post(
  "/:planId/versions/:versionId/publish",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = publishPlanRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid publish plan request.", {
        issues: parsed.error.issues,
      });
    }

    const idempotencyKey = c.req.header("Idempotency-Key");
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required.",
      );
    }

    const planId = c.req.param("planId");
    const versionId = c.req.param("versionId");
    const fingerprint = await sha256Hex(
      JSON.stringify({ planId, versionId, ...parsed.data }),
    );
    const db = createDb(c.env.DB);

    const prior = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: PUBLISH_PLAN_OPERATION,
      idempotencyKey,
    });
    if (prior) {
      if (prior.requestFingerprint !== fingerprint) {
        return fail(
          c,
          409,
          "IDEMPOTENCY_KEY_REUSE",
          "Idempotency key was reused with a different request payload.",
        );
      }
      return c.json(
        JSON.parse(prior.responseBody),
        prior.responseStatus as 200,
      );
    }

    const owned = await loadOwnedPlan(db, planId, actor.userId);
    if (!owned) {
      return fail(c, 404, "PLAN_NOT_FOUND", "Plan not found.");
    }

    const versions = await db
      .select()
      .from(planVersions)
      .where(
        and(eq(planVersions.id, versionId), eq(planVersions.planId, planId)),
      )
      .limit(1);
    const version = versions[0];
    if (!version) {
      return fail(c, 404, "PLAN_VERSION_NOT_FOUND", "Plan version not found.");
    }

    if (!canPublishPlanVersion(version.status)) {
      return fail(
        c,
        409,
        "INVALID_PLAN_TRANSITION",
        "Only draft plan versions can be published or scheduled.",
      );
    }

    if (version.recordVersion !== parsed.data.expectedRecordVersion) {
      return fail(
        c,
        409,
        "PLAN_VERSION_CONFLICT",
        "The plan draft was changed after this version was loaded.",
      );
    }

    const content = planContentSchema.safeParse(
      JSON.parse(version.contentJson) as unknown,
    );
    if (!content.success) {
      return fail(
        c,
        422,
        "PLAN_CONTENT_INVALID",
        "Plan content failed validation and cannot be published.",
        { issues: content.error.issues },
      );
    }

    const now = nowIso();
    let nextStatus: "effective" | "scheduled" | "published" = "effective";
    let effectiveFrom = now;

    if (parsed.data.mode === "scheduled") {
      if (!parsed.data.effectiveFrom) {
        return fail(
          c,
          400,
          "EFFECTIVE_FROM_REQUIRED",
          "Scheduled publish requires effectiveFrom.",
        );
      }
      if (parsed.data.effectiveFrom <= now) {
        return fail(
          c,
          422,
          "EFFECTIVE_FROM_NOT_FUTURE",
          "Scheduled effectiveFrom must be in the future.",
        );
      }
      nextStatus = "scheduled";
      effectiveFrom = parsed.data.effectiveFrom;
    } else if (parsed.data.effectiveFrom) {
      if (parsed.data.effectiveFrom > now) {
        nextStatus = "scheduled";
        effectiveFrom = parsed.data.effectiveFrom;
      } else {
        nextStatus = "effective";
        effectiveFrom = parsed.data.effectiveFrom;
      }
    }

    if (nextStatus === "effective") {
      await supersedeEffectiveVersions(db, planId, now);
    }

    await db
      .update(planVersions)
      .set({
        status: nextStatus,
        recordVersion: version.recordVersion + 1,
        publishedAt: now,
        effectiveFrom,
        updatedAt: now,
      })
      .where(
        and(
          eq(planVersions.id, versionId),
          eq(planVersions.recordVersion, parsed.data.expectedRecordVersion),
        ),
      );

    await db
      .update(plans)
      .set({ updatedAt: now })
      .where(eq(plans.id, planId));

    const [updated] = await db
      .select()
      .from(planVersions)
      .where(eq(planVersions.id, versionId))
      .limit(1);
    if (!updated) {
      return fail(
        c,
        500,
        "PLAN_VERSION_PERSIST_FAILED",
        "Plan version could not be loaded.",
      );
    }

    const data = planVersionSchema.parse(mapPlanVersion(updated));
    if (nextStatus === "effective") {
      await appendChangeLog(db, {
        entityType: "effective_plan",
        recordId: data.id,
        changeKind: "upsert",
        serverVersion: data.recordVersion,
        coachingRelationshipId: owned.relationship.id,
        traineeUserId: owned.relationship.traineeUserId,
      });
      queueRealtimeHint(c.env, {
        eventType: "effective_plan_changed",
        entityType: "plan_version",
        entityId: data.id,
        coachingRelationshipId: owned.relationship.id,
        serverVersion: data.recordVersion,
      });
    }
    const responseBody = { data };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: PUBLISH_PLAN_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return ok(c, data);
  },
);

planRoutes.post(
  "/:planId/versions",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = createPlanDraftFromVersionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        c,
        400,
        "INVALID_REQUEST",
        "Invalid create draft from version request.",
        { issues: parsed.error.issues },
      );
    }

    const idempotencyKey = c.req.header("Idempotency-Key");
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required.",
      );
    }

    const planId = c.req.param("planId");
    const fingerprint = await sha256Hex(
      JSON.stringify({ planId, ...parsed.data }),
    );
    const db = createDb(c.env.DB);

    const prior = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: CREATE_DRAFT_FROM_VERSION_OPERATION,
      idempotencyKey,
    });
    if (prior) {
      if (prior.requestFingerprint !== fingerprint) {
        return fail(
          c,
          409,
          "IDEMPOTENCY_KEY_REUSE",
          "Idempotency key was reused with a different request payload.",
        );
      }
      return c.json(
        JSON.parse(prior.responseBody),
        prior.responseStatus as 201,
      );
    }

    const owned = await loadOwnedPlan(db, planId, actor.userId);
    if (!owned) {
      return fail(c, 404, "PLAN_NOT_FOUND", "Plan not found.");
    }

    const sources = await db
      .select()
      .from(planVersions)
      .where(
        and(
          eq(planVersions.id, parsed.data.sourceVersionId),
          eq(planVersions.planId, planId),
        ),
      )
      .limit(1);
    const source = sources[0];
    if (!source) {
      return fail(c, 404, "PLAN_VERSION_NOT_FOUND", "Source plan version not found.");
    }

    const existingDrafts = await db
      .select()
      .from(planVersions)
      .where(
        and(eq(planVersions.planId, planId), eq(planVersions.status, "draft")),
      )
      .limit(1);
    if (existingDrafts[0]) {
      return fail(
        c,
        409,
        "PLAN_DRAFT_EXISTS",
        "A draft version already exists for this plan.",
      );
    }

    const latest = await db
      .select()
      .from(planVersions)
      .where(eq(planVersions.planId, planId))
      .orderBy(desc(planVersions.versionNumber))
      .limit(1);
    const nextNumber = (latest[0]?.versionNumber ?? 0) + 1;
    const now = nowIso();
    const versionId = createId();
    await db.insert(planVersions).values({
      id: versionId,
      planId,
      versionNumber: nextNumber,
      status: "draft",
      recordVersion: 1,
      contentJson: source.contentJson,
      creationSource: parsed.data.asAdjustment ? "adjustment" : "previous_version",
      publishedAt: null,
      effectiveFrom: null,
      effectiveTo: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.update(plans).set({ updatedAt: now }).where(eq(plans.id, planId));

    const [created] = await db
      .select()
      .from(planVersions)
      .where(eq(planVersions.id, versionId))
      .limit(1);
    if (!created) {
      return fail(
        c,
        500,
        "PLAN_VERSION_PERSIST_FAILED",
        "Plan version could not be loaded.",
      );
    }

    const data = planVersionSchema.parse(mapPlanVersion(created));
    const responseBody = { data };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: CREATE_DRAFT_FROM_VERSION_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 201,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return ok(c, data, 201);
  },
);
