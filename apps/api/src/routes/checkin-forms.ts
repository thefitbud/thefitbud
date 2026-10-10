import {
  operation,
  cursorParameter,
  limitParameter,
} from "../openapi/document";
import { and, asc, desc, eq, inArray, lt, or } from "drizzle-orm";
import { Hono } from "hono";
import {
  checkinFormTemplateDetailSchema,
  checkinFormTemplateListResponseSchema,
  createCheckinFormTemplateRequestSchema,
  createCheckinFormTemplateVersionRequestSchema,
  forkCheckinFormTemplateRequestSchema,
} from "@fitbud/contracts";
import {
  canTrainerReadCheckinFormTemplate,
  parseCheckinFormFields,
} from "@fitbud/core";
import { createDb, type Db } from "../db/client";
import {
  checkinFormTemplates,
  checkinFormVersions,
  checkins,
  coachingRelationships,
} from "../db/schema";
import { mapCheckinFormTemplateDetail } from "../domain/mappers";
import { buildPage, decodeCursor } from "../lib/cursor";
import { addDaysIso, createId, nowIso, sha256Hex } from "../lib/crypto";
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

const CREATE_OPERATION = "checkin-form-template.create";
const FORK_OPERATION = "checkin-form-template.fork";
const VERSION_OPERATION = "checkin-form-template.version";

export const checkinFormTemplateRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

type TemplateRow = typeof checkinFormTemplates.$inferSelect;
type VersionRow = typeof checkinFormVersions.$inferSelect;

function definitionJson(fields: unknown): string {
  return JSON.stringify({ fields });
}

async function versionsForTemplates(db: Db, templateIds: string[]) {
  if (templateIds.length === 0) return [];
  return db
    .select()
    .from(checkinFormVersions)
    .where(inArray(checkinFormVersions.templateId, templateIds))
    .orderBy(asc(checkinFormVersions.version));
}

function detailFor(template: TemplateRow, versions: VersionRow[]) {
  return checkinFormTemplateDetailSchema.parse(
    mapCheckinFormTemplateDetail(template, versions),
  );
}

async function loadTemplate(db: Db, templateId: string) {
  const rows = await db
    .select()
    .from(checkinFormTemplates)
    .where(eq(checkinFormTemplates.id, templateId))
    .limit(1);
  return rows[0] ?? null;
}

async function traineePinnedVersions(
  db: Db,
  traineeUserId: string,
  templateId: string,
) {
  const relationships = await db
    .select({ id: coachingRelationships.id })
    .from(coachingRelationships)
    .where(eq(coachingRelationships.traineeUserId, traineeUserId));
  if (relationships.length === 0) return [];
  const pins = await db
    .select({ versionId: checkins.checkinFormVersionId })
    .from(checkins)
    .where(
      inArray(
        checkins.coachingRelationshipId,
        relationships.map((row) => row.id),
      ),
    );
  const versionIds = [...new Set(pins.map((row) => row.versionId))];
  if (versionIds.length === 0) return [];
  return db
    .select()
    .from(checkinFormVersions)
    .where(
      and(
        eq(checkinFormVersions.templateId, templateId),
        inArray(checkinFormVersions.id, versionIds),
      ),
    )
    .orderBy(asc(checkinFormVersions.version));
}

checkinFormTemplateRoutes.get(
  "/",
  operation({
    tag: "Checkins",
    summary: "List check-in form templates visible to the trainer.",
    description:
      "Global check-in bases and the trainer's own forks. Separate from onboarding forms.",
    roles: ["trainer"],
    parameters: [
      limitParameter({ defaultValue: 20, maximum: 50 }),
      cursorParameter(),
    ],
    response: checkinFormTemplateListResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const limitRaw = Number(c.req.query("limit") ?? "20");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.trunc(limitRaw), 1), 50)
      : 20;
    const cursor = c.req.query("cursor");
    const decoded = cursor ? decodeCursor(cursor) : null;
    if (cursor && !decoded) {
      return fail(c, 400, "INVALID_CURSOR", "Cursor is invalid.");
    }

    const db = createDb(c.env.DB);
    const conditions = [
      or(
        eq(checkinFormTemplates.ownership, "global"),
        and(
          eq(checkinFormTemplates.ownership, "trainer"),
          eq(checkinFormTemplates.trainerUserId, actor.userId),
        ),
      )!,
    ];
    if (decoded) {
      conditions.push(
        or(
          lt(checkinFormTemplates.createdAt, decoded.k),
          and(
            eq(checkinFormTemplates.createdAt, decoded.k),
            lt(checkinFormTemplates.id, decoded.id),
          ),
        )!,
      );
    }

    const rows = await db
      .select()
      .from(checkinFormTemplates)
      .where(and(...conditions))
      .orderBy(desc(checkinFormTemplates.createdAt), desc(checkinFormTemplates.id))
      .limit(limit + 1);
    const page = buildPage(rows, limit, (item) => item.createdAt);
    const versions = await versionsForTemplates(
      db,
      page.items.map((item) => item.id),
    );
    const items = page.items.flatMap((template) => {
      const templateVersions = versions.filter(
        (version) => version.templateId === template.id,
      );
      if (templateVersions.length === 0) return [];
      const detail = detailFor(template, templateVersions);
      return [
        {
          id: detail.id,
          ownership: detail.ownership,
          trainerUserId: detail.trainerUserId,
          name: detail.name,
          description: detail.description,
          latestVersionId: detail.latestVersionId,
          latestVersionNumber: detail.latestVersionNumber,
          createdAt: detail.createdAt,
          updatedAt: detail.updatedAt,
        },
      ];
    });
    return ok(
      c,
      checkinFormTemplateListResponseSchema.parse({
        items,
        nextCursor: page.nextCursor,
      }),
    );
  },
);

checkinFormTemplateRoutes.post(
  "/",
  operation({
    tag: "Checkins",
    summary: "Create a trainer-owned check-in form template.",
    description:
      "Creates a trainer-owned check-in form and its first immutable version. Global bases are seeded, not created here.",
    roles: ["trainer"],
    idempotency: true,
    body: createCheckinFormTemplateRequestSchema,
    successStatus: [201],
    response: checkinFormTemplateDetailSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = createCheckinFormTemplateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid check-in form template.", {
        issues: parsed.error.issues,
      });
    }
    const fields = parseCheckinFormFields(parsed.data.fields);
    if (!fields.ok) {
      return fail(
        c,
        400,
        "INVALID_FORM_DEFINITION",
        "Check-in form definition is invalid.",
      );
    }

    const idempotencyKey = c.req.header("idempotency-key")?.trim();
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required to create a check-in form template.",
      );
    }

    const fingerprint = await sha256Hex(
      JSON.stringify({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        fields: fields.fields,
      }),
    );
    const db = createDb(c.env.DB);
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: CREATE_OPERATION,
      idempotencyKey,
    });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        return fail(
          c,
          409,
          "IDEMPOTENCY_KEY_REUSE",
          "Idempotency key was reused with a different request payload.",
        );
      }
      return c.json(JSON.parse(existing.responseBody), existing.responseStatus as 201);
    }

    const timestamp = nowIso();
    const templateId = createId();
    const versionId = createId();
    await db.insert(checkinFormTemplates).values({
      id: templateId,
      ownership: "trainer",
      trainerUserId: actor.userId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.insert(checkinFormVersions).values({
      id: versionId,
      templateId,
      key: templateId,
      version: 1,
      scope: "trainer",
      trainerUserId: actor.userId,
      schemaJson: definitionJson(fields.fields),
      createdAt: timestamp,
    });

    const template = (await loadTemplate(db, templateId))!;
    const versions = await versionsForTemplates(db, [templateId]);
    const data = detailFor(template, versions);
    const responseBody = { data };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: CREATE_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 201,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return ok(c, data, 201);
  },
);

checkinFormTemplateRoutes.get(
  "/:templateId",
  operation({
    tag: "Checkins",
    summary: "Read one check-in form template.",
    description:
      "Trainers read a global base or their own fork. Trainees read a template only when one of their check-ins pins a version of it.",
    roles: ["trainer", "trainee"],
    response: checkinFormTemplateDetailSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const templateId = c.req.param("templateId");
    const db = createDb(c.env.DB);
    const template = await loadTemplate(db, templateId);
    if (!template) {
      return fail(c, 404, "TEMPLATE_NOT_FOUND", "Check-in form template not found.");
    }

    if (actor.selectedRole === "trainer") {
      if (!canTrainerReadCheckinFormTemplate(template, actor.userId)) {
        return fail(c, 404, "TEMPLATE_NOT_FOUND", "Check-in form template not found.");
      }
      const versions = await versionsForTemplates(db, [template.id]);
      if (versions.length === 0) {
        return fail(
          c,
          500,
          "CHECKIN_FORM_MISSING",
          "Check-in form template has no version.",
        );
      }
      return ok(c, detailFor(template, versions));
    }

    const pinned = await traineePinnedVersions(db, actor.userId, template.id);
    if (pinned.length === 0) {
      return fail(c, 404, "TEMPLATE_NOT_FOUND", "Check-in form template not found.");
    }
    return ok(c, detailFor(template, pinned));
  },
);

checkinFormTemplateRoutes.post(
  "/:templateId/fork",
  operation({
    tag: "Checkins",
    summary: "Fork a global check-in form into a trainer-owned template.",
    description:
      "Copies the latest global version into a new trainer-owned template. The global base is not changed.",
    roles: ["trainer"],
    idempotency: true,
    body: forkCheckinFormTemplateRequestSchema,
    successStatus: [201],
    response: checkinFormTemplateDetailSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => ({}));
    const parsed = forkCheckinFormTemplateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid fork request.", {
        issues: parsed.error.issues,
      });
    }

    const idempotencyKey = c.req.header("idempotency-key")?.trim();
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required to fork a check-in form template.",
      );
    }

    const sourceId = c.req.param("templateId");
    const fingerprint = await sha256Hex(
      JSON.stringify({
        sourceId,
        name: parsed.data.name ?? null,
        description: parsed.data.description ?? null,
      }),
    );
    const db = createDb(c.env.DB);
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: FORK_OPERATION,
      idempotencyKey,
    });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        return fail(
          c,
          409,
          "IDEMPOTENCY_KEY_REUSE",
          "Idempotency key was reused with a different request payload.",
        );
      }
      return c.json(JSON.parse(existing.responseBody), existing.responseStatus as 201);
    }

    const source = await loadTemplate(db, sourceId);
    if (!source || !canTrainerReadCheckinFormTemplate(source, actor.userId)) {
      return fail(c, 404, "TEMPLATE_NOT_FOUND", "Check-in form template not found.");
    }
    if (source.ownership !== "global") {
      return fail(
        c,
        409,
        "TEMPLATE_NOT_FORKABLE",
        "Only a global check-in form template can be forked.",
      );
    }

    const sourceVersions = await versionsForTemplates(db, [source.id]);
    const latest = sourceVersions[sourceVersions.length - 1];
    if (!latest) {
      return fail(
        c,
        500,
        "CHECKIN_FORM_MISSING",
        "Check-in form template has no version.",
      );
    }
    const copied = parseCheckinFormFields(
      (JSON.parse(latest.schemaJson) as { fields?: unknown }).fields,
    );
    if (!copied.ok) {
      return fail(
        c,
        500,
        "CHECKIN_FORM_MISSING",
        "Global check-in form definition is invalid.",
      );
    }

    const timestamp = nowIso();
    const templateId = createId();
    const versionId = createId();
    await db.insert(checkinFormTemplates).values({
      id: templateId,
      ownership: "trainer",
      trainerUserId: actor.userId,
      name: parsed.data.name ?? source.name,
      description: parsed.data.description ?? source.description,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.insert(checkinFormVersions).values({
      id: versionId,
      templateId,
      key: templateId,
      version: 1,
      scope: "trainer",
      trainerUserId: actor.userId,
      schemaJson: definitionJson(copied.fields),
      createdAt: timestamp,
    });

    const template = (await loadTemplate(db, templateId))!;
    const versions = await versionsForTemplates(db, [templateId]);
    const data = detailFor(template, versions);
    const responseBody = { data };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: FORK_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 201,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return ok(c, data, 201);
  },
);

checkinFormTemplateRoutes.post(
  "/:templateId/versions",
  operation({
    tag: "Checkins",
    summary: "Append a check-in form version to a trainer-owned template.",
    description:
      "Inserts a new immutable version. Global check-in bases cannot be edited. Already scheduled check-ins keep their pinned version.",
    roles: ["trainer"],
    idempotency: true,
    body: createCheckinFormTemplateVersionRequestSchema,
    successStatus: [201],
    response: checkinFormTemplateDetailSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = createCheckinFormTemplateVersionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid check-in form version.", {
        issues: parsed.error.issues,
      });
    }
    const fields = parseCheckinFormFields(parsed.data.fields);
    if (!fields.ok) {
      return fail(
        c,
        400,
        "INVALID_FORM_DEFINITION",
        "Check-in form definition is invalid.",
      );
    }

    const idempotencyKey = c.req.header("idempotency-key")?.trim();
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required to add a check-in form version.",
      );
    }

    const templateId = c.req.param("templateId");
    const fingerprint = await sha256Hex(
      JSON.stringify({ templateId, fields: fields.fields }),
    );
    const db = createDb(c.env.DB);
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: VERSION_OPERATION,
      idempotencyKey,
    });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        return fail(
          c,
          409,
          "IDEMPOTENCY_KEY_REUSE",
          "Idempotency key was reused with a different request payload.",
        );
      }
      return c.json(JSON.parse(existing.responseBody), existing.responseStatus as 201);
    }

    const template = await loadTemplate(db, templateId);
    if (!template || template.trainerUserId !== actor.userId) {
      if (template?.ownership === "global") {
        return fail(
          c,
          403,
          "GLOBAL_TEMPLATE_IMMUTABLE",
          "Global check-in form templates cannot be edited.",
        );
      }
      return fail(c, 404, "TEMPLATE_NOT_FOUND", "Check-in form template not found.");
    }

    const existingVersions = await versionsForTemplates(db, [template.id]);
    const latest = existingVersions[existingVersions.length - 1];
    if (!latest) {
      return fail(
        c,
        500,
        "CHECKIN_FORM_MISSING",
        "Check-in form template has no version.",
      );
    }

    const timestamp = nowIso();
    const versionId = createId();
    await db.insert(checkinFormVersions).values({
      id: versionId,
      templateId: template.id,
      key: latest.key,
      version: latest.version + 1,
      scope: "trainer",
      trainerUserId: actor.userId,
      schemaJson: definitionJson(fields.fields),
      createdAt: timestamp,
    });
    await db
      .update(checkinFormTemplates)
      .set({ updatedAt: timestamp })
      .where(eq(checkinFormTemplates.id, template.id));

    const versions = await versionsForTemplates(db, [template.id]);
    const updatedTemplate = (await loadTemplate(db, template.id))!;
    const data = detailFor(updatedTemplate, versions);
    const responseBody = { data };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: VERSION_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 201,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return ok(c, data, 201);
  },
);
