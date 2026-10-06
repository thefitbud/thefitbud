import {
  operation,
  cursorParameter,
  limitParameter,
} from "../openapi/document";
import { and, asc, desc, eq, inArray, lt, or } from "drizzle-orm";
import { Hono } from "hono";
import {
  createOnboardingFormTemplateRequestSchema,
  createOnboardingFormTemplateVersionRequestSchema,
  forkOnboardingFormTemplateRequestSchema,
  onboardingFormTemplateDetailSchema,
  onboardingFormTemplateListResponseSchema,
} from "@fitbud/contracts";
import {
  canTrainerReadOnboardingTemplate,
  parseOnboardingFormFields,
} from "@fitbud/core";
import { createDb, type Db } from "../db/client";
import {
  onboardingFormTemplates,
  onboardingFormVersions,
} from "../db/schema";
import { traineePinnedVersionsForTemplate } from "../domain/onboarding-forms";
import { mapOnboardingFormTemplateDetail } from "../domain/mappers";
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

const CREATE_OPERATION = "onboarding-form-template.create";
const FORK_OPERATION = "onboarding-form-template.fork";
const VERSION_OPERATION = "onboarding-form-template.version";

export const onboardingFormTemplateRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

type TemplateRow = typeof onboardingFormTemplates.$inferSelect;
type VersionRow = typeof onboardingFormVersions.$inferSelect;

function definitionJson(fields: unknown): string {
  return JSON.stringify({ fields });
}

async function versionsForTemplates(db: Db, templateIds: string[]) {
  if (templateIds.length === 0) {
    return [];
  }
  return db
    .select()
    .from(onboardingFormVersions)
    .where(inArray(onboardingFormVersions.templateId, templateIds))
    .orderBy(asc(onboardingFormVersions.version));
}

function detailFor(
  template: TemplateRow,
  versions: VersionRow[],
) {
  return onboardingFormTemplateDetailSchema.parse(
    mapOnboardingFormTemplateDetail(template, versions),
  );
}

async function loadTemplate(db: Db, templateId: string) {
  const rows = await db
    .select()
    .from(onboardingFormTemplates)
    .where(eq(onboardingFormTemplates.id, templateId))
    .limit(1);
  return rows[0] ?? null;
}

onboardingFormTemplateRoutes.get(
  "/",
  operation({
    tag: "Onboarding",
    summary: "Onboarding operation for GET /onboarding/form-templates.",
    description: "Onboarding operation for GET /onboarding/form-templates.",
    roles: ["trainer"],
    parameters: [
      limitParameter({ defaultValue: 20, maximum: 1 }),
      cursorParameter(),
    ],
    response: onboardingFormTemplateListResponseSchema,
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
        eq(onboardingFormTemplates.ownership, "global"),
        and(
          eq(onboardingFormTemplates.ownership, "trainer"),
          eq(onboardingFormTemplates.trainerUserId, actor.userId),
        ),
      )!,
    ];
    if (decoded) {
      conditions.push(
        or(
          lt(onboardingFormTemplates.createdAt, decoded.k),
          and(
            eq(onboardingFormTemplates.createdAt, decoded.k),
            lt(onboardingFormTemplates.id, decoded.id),
          ),
        )!,
      );
    }

    const rows = await db
      .select()
      .from(onboardingFormTemplates)
      .where(and(...conditions))
      .orderBy(
        desc(onboardingFormTemplates.createdAt),
        desc(onboardingFormTemplates.id),
      )
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
      if (templateVersions.length === 0) {
        return [];
      }
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
      onboardingFormTemplateListResponseSchema.parse({
        items,
        nextCursor: page.nextCursor,
      }),
    );
  },
);

onboardingFormTemplateRoutes.post(
  "/",
  operation({
    tag: "Onboarding",
    summary: "Onboarding operation for POST /onboarding/form-templates.",
    description: "Onboarding operation for POST /onboarding/form-templates.",
    roles: ["trainer"],
    idempotency: true,
    body: createOnboardingFormTemplateRequestSchema,
    successStatus: [201],
    response: onboardingFormTemplateDetailSchema,
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
    const parsed = createOnboardingFormTemplateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid onboarding form template.", {
        issues: parsed.error.issues,
      });
    }
    const fields = parseOnboardingFormFields(parsed.data.fields);
    if (!fields.ok) {
      return fail(
        c,
        400,
        "INVALID_FORM_DEFINITION",
        "Onboarding form definition is invalid.",
      );
    }

    const idempotencyKey = c.req.header("idempotency-key")?.trim();
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required to create an onboarding form template.",
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
    await db.insert(onboardingFormTemplates).values({
      id: templateId,
      ownership: "trainer",
      trainerUserId: actor.userId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.insert(onboardingFormVersions).values({
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

onboardingFormTemplateRoutes.get(
  "/:templateId",
  operation({
    tag: "Onboarding",
    summary: "Onboarding operation for GET /onboarding/form-templates/:templateId.",
    description: "Onboarding operation for GET /onboarding/form-templates/:templateId.",
    roles: ["trainer", "trainee"],
    response: onboardingFormTemplateDetailSchema,
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
      return fail(c, 404, "TEMPLATE_NOT_FOUND", "Onboarding form template not found.");
    }

    if (actor.selectedRole === "trainer") {
      if (!canTrainerReadOnboardingTemplate(template, actor.userId)) {
        return fail(
          c,
          404,
          "TEMPLATE_NOT_FOUND",
          "Onboarding form template not found.",
        );
      }
      const versions = await versionsForTemplates(db, [template.id]);
      if (versions.length === 0) {
        return fail(
          c,
          500,
          "ONBOARDING_FORM_MISSING",
          "Onboarding form template has no version.",
        );
      }
      return ok(c, detailFor(template, versions));
    }

    const pinned = await traineePinnedVersionsForTemplate(
      db,
      actor.userId,
      template.id,
    );
    if (pinned.length === 0) {
      return fail(c, 404, "TEMPLATE_NOT_FOUND", "Onboarding form template not found.");
    }
    return ok(c, detailFor(template, pinned));
  },
);

onboardingFormTemplateRoutes.post(
  "/:templateId/fork",
  operation({
    tag: "Onboarding",
    summary: "Onboarding operation for POST /onboarding/form-templates/:templateId/fork.",
    description: "Onboarding operation for POST /onboarding/form-templates/:templateId/fork.",
    roles: ["trainer"],
    idempotency: true,
    body: forkOnboardingFormTemplateRequestSchema,
    successStatus: [201],
    response: onboardingFormTemplateDetailSchema,
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
    const parsed = forkOnboardingFormTemplateRequestSchema.safeParse(body);
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
        "Idempotency-Key header is required to fork an onboarding form template.",
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
    if (!source || !canTrainerReadOnboardingTemplate(source, actor.userId)) {
      return fail(c, 404, "TEMPLATE_NOT_FOUND", "Onboarding form template not found.");
    }
    if (source.ownership !== "global") {
      return fail(
        c,
        409,
        "TEMPLATE_NOT_FORKABLE",
        "Only a global onboarding form template can be forked.",
      );
    }

    const sourceVersions = await versionsForTemplates(db, [source.id]);
    const latest = sourceVersions[sourceVersions.length - 1];
    if (!latest) {
      return fail(
        c,
        500,
        "ONBOARDING_FORM_MISSING",
        "Onboarding form template has no version.",
      );
    }
    const copied = parseOnboardingFormFields(
      (JSON.parse(latest.schemaJson) as { fields?: unknown }).fields,
    );
    if (!copied.ok) {
      return fail(
        c,
        500,
        "ONBOARDING_FORM_MISSING",
        "Global onboarding form definition is invalid.",
      );
    }

    const timestamp = nowIso();
    const templateId = createId();
    const versionId = createId();
    await db.insert(onboardingFormTemplates).values({
      id: templateId,
      ownership: "trainer",
      trainerUserId: actor.userId,
      name: parsed.data.name ?? source.name,
      description:
        parsed.data.description ?? source.description,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.insert(onboardingFormVersions).values({
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

onboardingFormTemplateRoutes.post(
  "/:templateId/versions",
  operation({
    tag: "Onboarding",
    summary: "Onboarding operation for POST /onboarding/form-templates/:templateId/versions.",
    description: "Onboarding operation for POST /onboarding/form-templates/:templateId/versions.",
    roles: ["trainer"],
    idempotency: true,
    body: createOnboardingFormTemplateVersionRequestSchema,
    successStatus: [201],
    response: onboardingFormTemplateDetailSchema,
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
    const parsed = createOnboardingFormTemplateVersionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid onboarding form version.", {
        issues: parsed.error.issues,
      });
    }
    const fields = parseOnboardingFormFields(parsed.data.fields);
    if (!fields.ok) {
      return fail(
        c,
        400,
        "INVALID_FORM_DEFINITION",
        "Onboarding form definition is invalid.",
      );
    }

    const idempotencyKey = c.req.header("idempotency-key")?.trim();
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required to add an onboarding form version.",
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
          "Global onboarding form templates cannot be edited.",
        );
      }
      return fail(c, 404, "TEMPLATE_NOT_FOUND", "Onboarding form template not found.");
    }

    const existingVersions = await versionsForTemplates(db, [template.id]);
    const latest = existingVersions[existingVersions.length - 1];
    if (!latest) {
      return fail(
        c,
        500,
        "ONBOARDING_FORM_MISSING",
        "Onboarding form template has no version.",
      );
    }

    const timestamp = nowIso();
    const versionId = createId();
    await db.insert(onboardingFormVersions).values({
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
      .update(onboardingFormTemplates)
      .set({ updatedAt: timestamp })
      .where(eq(onboardingFormTemplates.id, template.id));

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
