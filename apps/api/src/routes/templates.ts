import { and, desc, eq, lt, or } from "drizzle-orm";
import { Hono } from "hono";
import {
  createPlanTemplateFromVersionRequestSchema,
  createPlanTemplateRequestSchema,
  planTemplateListResponseSchema,
  planTemplateSchema,
  updatePlanTemplateRequestSchema,
} from "@fitbud/contracts";
import {
  copyPlanContent,
  planContentMatchesTemplateType,
} from "@fitbud/core";
import { createDb } from "../db/client";
import {
  coachingRelationships,
  plans,
  planTemplates,
  planVersions,
} from "../db/schema";
import {
  mapPlanTemplate,
  mapPlanTemplateSummary,
  parsePlanContentJson,
} from "../domain/mappers";
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
import type { Env, Variables } from "../types";

const CREATE_TEMPLATE_OPERATION = "template.create";
const CREATE_TEMPLATE_FROM_VERSION_OPERATION = "template.create_from_version";

export const templateRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

templateRoutes.get(
  "/",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const limitParam = c.req.query("limit");
    const limit = Math.min(
      Math.max(Number.parseInt(limitParam ?? "20", 10) || 20, 1),
      50,
    );
    const cursorParam = c.req.query("cursor");
    const cursor = cursorParam ? decodeCursor(cursorParam) : null;
    const db = createDb(c.env.DB);

    const rows = await db
      .select()
      .from(planTemplates)
      .where(
        cursor
          ? and(
              eq(planTemplates.trainerUserId, actor.userId),
              or(
                lt(planTemplates.updatedAt, cursor.k),
                and(
                  eq(planTemplates.updatedAt, cursor.k),
                  lt(planTemplates.id, cursor.id),
                ),
              ),
            )
          : eq(planTemplates.trainerUserId, actor.userId),
      )
      .orderBy(desc(planTemplates.updatedAt), desc(planTemplates.id))
      .limit(limit + 1);

    const page = buildPage(
      rows.map((row) => mapPlanTemplateSummary(row)),
      limit,
      (item) => item.updatedAt,
    );
    return ok(c, planTemplateListResponseSchema.parse(page));
  },
);

templateRoutes.post(
  "/",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = createPlanTemplateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        c,
        400,
        "INVALID_REQUEST",
        "Invalid create template request.",
        { issues: parsed.error.issues },
      );
    }

    if (
      !planContentMatchesTemplateType(
        parsed.data.content,
        parsed.data.templateType,
      )
    ) {
      return fail(
        c,
        422,
        "TEMPLATE_CONTENT_MISMATCH",
        "Template content does not match the selected template type.",
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

    const fingerprint = await sha256Hex(JSON.stringify(parsed.data));
    const db = createDb(c.env.DB);
    const prior = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: CREATE_TEMPLATE_OPERATION,
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

    const now = nowIso();
    const id = createId();
    // Store a copied snapshot so later edits to the request payload cannot
    // mutate the persisted template through shared object references.
    const content = copyPlanContent(parsed.data.content, createId);
    await db.insert(planTemplates).values({
      id,
      trainerUserId: actor.userId,
      title: parsed.data.title,
      templateType: parsed.data.templateType,
      contentJson: JSON.stringify(content),
      recordVersion: 1,
      createdAt: now,
      updatedAt: now,
    });

    const [row] = await db
      .select()
      .from(planTemplates)
      .where(eq(planTemplates.id, id))
      .limit(1);
    if (!row) {
      return fail(
        c,
        500,
        "TEMPLATE_PERSIST_FAILED",
        "Template could not be loaded.",
      );
    }

    const data = planTemplateSchema.parse(mapPlanTemplate(row));
    const responseBody = { data };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: CREATE_TEMPLATE_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 201,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return ok(c, data, 201);
  },
);

templateRoutes.post(
  "/from-plan-version",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = createPlanTemplateFromVersionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        c,
        400,
        "INVALID_REQUEST",
        "Invalid create template from plan version request.",
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

    const fingerprint = await sha256Hex(JSON.stringify(parsed.data));
    const db = createDb(c.env.DB);
    const prior = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: CREATE_TEMPLATE_FROM_VERSION_OPERATION,
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

    const owned = await db
      .select({
        plan: plans,
        relationship: coachingRelationships,
        version: planVersions,
      })
      .from(plans)
      .innerJoin(
        coachingRelationships,
        eq(plans.coachingRelationshipId, coachingRelationships.id),
      )
      .innerJoin(planVersions, eq(planVersions.planId, plans.id))
      .where(
        and(
          eq(plans.id, parsed.data.planId),
          eq(planVersions.id, parsed.data.versionId),
          eq(coachingRelationships.trainerUserId, actor.userId),
        ),
      )
      .limit(1);
    const source = owned[0];
    if (!source) {
      return fail(c, 404, "PLAN_VERSION_NOT_FOUND", "Plan version not found.");
    }

    const content = copyPlanContent(
      parsePlanContentJson(source.version.contentJson),
      createId,
    );
    if (
      !planContentMatchesTemplateType(content, parsed.data.templateType)
    ) {
      return fail(
        c,
        422,
        "TEMPLATE_CONTENT_MISMATCH",
        "Plan version content does not match the selected template type.",
      );
    }

    const now = nowIso();
    const id = createId();
    await db.insert(planTemplates).values({
      id,
      trainerUserId: actor.userId,
      title: parsed.data.title,
      templateType: parsed.data.templateType,
      contentJson: JSON.stringify(content),
      recordVersion: 1,
      createdAt: now,
      updatedAt: now,
    });

    const [row] = await db
      .select()
      .from(planTemplates)
      .where(eq(planTemplates.id, id))
      .limit(1);
    if (!row) {
      return fail(
        c,
        500,
        "TEMPLATE_PERSIST_FAILED",
        "Template could not be loaded.",
      );
    }

    const data = planTemplateSchema.parse(mapPlanTemplate(row));
    const responseBody = { data };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: CREATE_TEMPLATE_FROM_VERSION_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 201,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return ok(c, data, 201);
  },
);

templateRoutes.get(
  "/:templateId",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const templateId = c.req.param("templateId");
    const db = createDb(c.env.DB);
    const rows = await db
      .select()
      .from(planTemplates)
      .where(eq(planTemplates.id, templateId))
      .limit(1);
    const row = rows[0];
    if (!row || row.trainerUserId !== actor.userId) {
      return fail(c, 404, "TEMPLATE_NOT_FOUND", "Template not found.");
    }
    return ok(c, planTemplateSchema.parse(mapPlanTemplate(row)));
  },
);

templateRoutes.put(
  "/:templateId",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = updatePlanTemplateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        c,
        400,
        "INVALID_REQUEST",
        "Invalid update template request.",
        { issues: parsed.error.issues },
      );
    }

    const templateType = parsed.data.templateType;
    if (
      templateType &&
      !planContentMatchesTemplateType(parsed.data.content, templateType)
    ) {
      return fail(
        c,
        422,
        "TEMPLATE_CONTENT_MISMATCH",
        "Template content does not match the selected template type.",
      );
    }

    const templateId = c.req.param("templateId");
    const db = createDb(c.env.DB);
    const rows = await db
      .select()
      .from(planTemplates)
      .where(eq(planTemplates.id, templateId))
      .limit(1);
    const row = rows[0];
    if (!row || row.trainerUserId !== actor.userId) {
      return fail(c, 404, "TEMPLATE_NOT_FOUND", "Template not found.");
    }

    if (row.recordVersion !== parsed.data.expectedRecordVersion) {
      return fail(
        c,
        409,
        "TEMPLATE_VERSION_CONFLICT",
        "The template was changed after this version was loaded.",
      );
    }

    const nextType = templateType ?? row.templateType;
    if (!planContentMatchesTemplateType(parsed.data.content, nextType)) {
      return fail(
        c,
        422,
        "TEMPLATE_CONTENT_MISMATCH",
        "Template content does not match the selected template type.",
      );
    }

    const content = copyPlanContent(parsed.data.content, createId);
    const now = nowIso();
    await db
      .update(planTemplates)
      .set({
        title: parsed.data.title ?? row.title,
        templateType: nextType,
        contentJson: JSON.stringify(content),
        recordVersion: row.recordVersion + 1,
        updatedAt: now,
      })
      .where(eq(planTemplates.id, templateId));

    const [updated] = await db
      .select()
      .from(planTemplates)
      .where(eq(planTemplates.id, templateId))
      .limit(1);
    if (!updated) {
      return fail(
        c,
        500,
        "TEMPLATE_PERSIST_FAILED",
        "Template could not be loaded.",
      );
    }
    return ok(c, planTemplateSchema.parse(mapPlanTemplate(updated)));
  },
);

templateRoutes.delete(
  "/:templateId",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const templateId = c.req.param("templateId");
    const db = createDb(c.env.DB);
    const rows = await db
      .select()
      .from(planTemplates)
      .where(eq(planTemplates.id, templateId))
      .limit(1);
    const row = rows[0];
    if (!row || row.trainerUserId !== actor.userId) {
      return fail(c, 404, "TEMPLATE_NOT_FOUND", "Template not found.");
    }

    await db.delete(planTemplates).where(eq(planTemplates.id, templateId));
    return ok(c, { deleted: true });
  },
);
