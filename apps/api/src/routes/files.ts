import { eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  confirmUploadRequestSchema,
  createUploadTargetRequestSchema,
  createUploadTargetResponseSchema,
  downloadTargetResponseSchema,
  mediaAssetSchema,
} from "@fitbud/contracts";
import { isAllowedMediaContentType } from "@fitbud/core";
import { createDb } from "../db/client";
import { coachingRelationships, mediaAssets } from "../db/schema";
import { mapMediaAsset } from "../domain/mappers";
import { addDaysIso, createId, nowIso, sha256Hex } from "../lib/crypto";
import { fail, ok, type AppContext } from "../lib/envelope";
import {
  DOWNLOAD_TARGET_TTL_MS,
  MAX_UPLOAD_BYTES,
  UPLOAD_TARGET_TTL_MS,
  buildObjectKey,
  fileSigningSecret,
  signFileAccessToken,
  verifyFileAccessToken,
} from "../lib/files";
import {
  findIdempotencyRecord,
  saveIdempotencyRecord,
} from "../lib/idempotency";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth";
import { canAccessRelationship } from "./relationships";
import type { ActorContext, Env, Variables } from "../types";

const UPLOAD_TARGET_OPERATION = "files.upload_target";
const CONFIRM_UPLOAD_OPERATION = "files.confirm_upload";

export const fileRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

type Db = ReturnType<typeof createDb>;

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

async function loadAccessibleMediaAsset(
  db: Db,
  mediaAssetId: string,
  actor: ActorContext,
) {
  const rows = await db
    .select({
      asset: mediaAssets,
      relationship: coachingRelationships,
    })
    .from(mediaAssets)
    .innerJoin(
      coachingRelationships,
      eq(mediaAssets.coachingRelationshipId, coachingRelationships.id),
    )
    .where(eq(mediaAssets.id, mediaAssetId))
    .limit(1);
  const row = rows[0];
  if (!row || !canAccessRelationship(actor, row.relationship)) return null;
  return row;
}

function requireIdempotencyKey(c: AppContext): string | null {
  return c.req.header("Idempotency-Key")?.trim() || null;
}

function requireMediaBucket(c: AppContext) {
  const bucket = c.env.MEDIA;
  if (!bucket) {
    return null;
  }
  return bucket;
}

fileRoutes.post(
  "/upload-targets",
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

    const parsed = createUploadTargetRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid upload target request.", {
        issues: parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(JSON.stringify(parsed.data));
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: UPLOAD_TARGET_OPERATION,
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
      parsed.data.coachingRelationshipId,
      actor,
    );
    if (!relationship) {
      return fail(
        c,
        404,
        "RELATIONSHIP_NOT_FOUND",
        "Coaching relationship not found.",
      );
    }

    if (
      actor.selectedRole === "trainee" &&
      relationship.traineeUserId !== actor.userId
    ) {
      return fail(
        c,
        404,
        "RELATIONSHIP_NOT_FOUND",
        "Coaching relationship not found.",
      );
    }

    if (
      parsed.data.mediaType === "meal_photo" &&
      actor.selectedRole !== "trainee"
    ) {
      return fail(
        c,
        403,
        "FORBIDDEN",
        "Only trainees may upload meal photos.",
      );
    }

    if (!isAllowedMediaContentType(parsed.data.contentType)) {
      return fail(
        c,
        422,
        "UNSUPPORTED_CONTENT_TYPE",
        "Only JPEG, PNG, and WebP image uploads are supported.",
      );
    }

    const now = nowIso();
    const mediaAssetId = createId();
    const objectKey = buildObjectKey({
      coachingRelationshipId: relationship.id,
      mediaAssetId,
      mediaType: parsed.data.mediaType,
    });
    const row = {
      id: mediaAssetId,
      coachingRelationshipId: relationship.id,
      uploaderUserId: actor.userId,
      mediaType: parsed.data.mediaType,
      status: "pending_upload" as const,
      objectKey,
      contentType: parsed.data.contentType,
      byteSize: parsed.data.byteSize ?? null,
      originalFilename: parsed.data.originalFilename ?? null,
      domainEntityType: parsed.data.domainEntityType ?? null,
      domainEntityId: parsed.data.domainEntityId ?? null,
      recordVersion: 0,
      createdAt: now,
      updatedAt: now,
      uploadedAt: null,
    };
    await db.insert(mediaAssets).values(row);

    const expiresAtUnix = Math.floor((Date.now() + UPLOAD_TARGET_TTL_MS) / 1000);
    const token = await signFileAccessToken({
      mediaAssetId,
      expiresAtUnix,
      secret: fileSigningSecret(c.env.MEDIA_SIGNING_SECRET),
    });
    const expiresAt = new Date(expiresAtUnix * 1000).toISOString();
    const responseBody = {
      data: createUploadTargetResponseSchema.parse({
        mediaAsset: mapMediaAsset(row),
        uploadUrl: `/files/${mediaAssetId}/content?exp=${expiresAtUnix}&sig=${token}`,
        expiresAt,
      }),
    };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: UPLOAD_TARGET_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return c.json(responseBody, 200);
  },
);

fileRoutes.put(
  "/:mediaAssetId/content",
  optionalAuthMiddleware,
  async (c) => {
    const mediaAssetId = c.req.param("mediaAssetId");
    const exp = c.req.query("exp");
    const sig = c.req.query("sig");
    const db = createDb(c.env.DB);

    let authorizedUploaderId: string | null = null;
    if (exp && sig) {
      const valid = await verifyFileAccessToken({
        mediaAssetId,
        expiresAtUnix: Number(exp),
        token: sig,
        secret: fileSigningSecret(c.env.MEDIA_SIGNING_SECRET),
      });
      if (!valid) {
        return fail(
          c,
          403,
          "UPLOAD_TOKEN_FORBIDDEN",
          "Upload token is invalid or expired.",
        );
      }
      const rows = await db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, mediaAssetId))
        .limit(1);
      const assetRow = rows[0];
      if (!assetRow) {
        return fail(c, 404, "MEDIA_ASSET_NOT_FOUND", "Media asset not found.");
      }
      authorizedUploaderId = assetRow.uploaderUserId;
    } else {
      const actor = c.get("actor");
      if (!actor?.selectedRole) {
        return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
      }
      const loaded = await loadAccessibleMediaAsset(db, mediaAssetId, actor);
      if (!loaded) {
        return fail(c, 404, "MEDIA_ASSET_NOT_FOUND", "Media asset not found.");
      }
      if (loaded.asset.uploaderUserId !== actor.userId) {
        return fail(c, 403, "FORBIDDEN", "Only the uploader may write content.");
      }
      authorizedUploaderId = actor.userId;
    }

    const bucket = requireMediaBucket(c);
    if (!bucket) {
      return fail(
        c,
        503,
        "MEDIA_BUCKET_UNAVAILABLE",
        "File storage is not configured.",
      );
    }

    const rows = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, mediaAssetId))
      .limit(1);
    const asset = rows[0];
    if (!asset || asset.uploaderUserId !== authorizedUploaderId) {
      return fail(c, 404, "MEDIA_ASSET_NOT_FOUND", "Media asset not found.");
    }

    if (asset.status === "ready") {
      return ok(c, mediaAssetSchema.parse(mapMediaAsset(asset)));
    }

    const contentType =
      c.req.header("content-type")?.split(";")[0]?.trim() || asset.contentType;
    if (!contentType.startsWith("image/")) {
      return fail(
        c,
        422,
        "UNSUPPORTED_CONTENT_TYPE",
        "Only image uploads are supported.",
      );
    }

    const body = await c.req.arrayBuffer();
    if (body.byteLength === 0) {
      return fail(c, 400, "EMPTY_UPLOAD", "Upload body is empty.");
    }
    if (body.byteLength > MAX_UPLOAD_BYTES) {
      return fail(
        c,
        413,
        "UPLOAD_TOO_LARGE",
        "Upload exceeds the maximum allowed size.",
      );
    }

    await bucket.put(asset.objectKey, body, {
      httpMetadata: { contentType },
      customMetadata: {
        mediaAssetId: asset.id,
        coachingRelationshipId: asset.coachingRelationshipId,
      },
    });

    const now = nowIso();
    await db
      .update(mediaAssets)
      .set({
        status: "ready",
        contentType,
        byteSize: body.byteLength,
        recordVersion: asset.recordVersion + 1,
        updatedAt: now,
        uploadedAt: now,
      })
      .where(eq(mediaAssets.id, asset.id));

    const updated = {
      ...asset,
      status: "ready" as const,
      contentType,
      byteSize: body.byteLength,
      recordVersion: asset.recordVersion + 1,
      updatedAt: now,
      uploadedAt: now,
    };
    return ok(c, mediaAssetSchema.parse(mapMediaAsset(updated)));
  },
);

fileRoutes.post(
  "/:mediaAssetId/confirm",
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

    const parsed = confirmUploadRequestSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid confirm upload request.", {
        issues: parsed.error.issues,
      });
    }

    const bucket = requireMediaBucket(c);
    if (!bucket) {
      return fail(
        c,
        503,
        "MEDIA_BUCKET_UNAVAILABLE",
        "File storage is not configured.",
      );
    }

    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(
      JSON.stringify({
        mediaAssetId: c.req.param("mediaAssetId"),
        ...parsed.data,
      }),
    );
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: CONFIRM_UPLOAD_OPERATION,
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

    const loaded = await loadAccessibleMediaAsset(
      db,
      c.req.param("mediaAssetId"),
      actor,
    );
    if (!loaded) {
      return fail(c, 404, "MEDIA_ASSET_NOT_FOUND", "Media asset not found.");
    }

    if (loaded.asset.uploaderUserId !== actor.userId) {
      return fail(
        c,
        403,
        "FORBIDDEN",
        "Only the uploader may confirm the upload.",
      );
    }

    const object = await bucket.head(loaded.asset.objectKey);
    if (!object) {
      return fail(
        c,
        422,
        "UPLOAD_NOT_FOUND",
        "No uploaded object was found for this media asset.",
      );
    }

    const now = nowIso();
    const contentType =
      parsed.data.contentType ??
      object.httpMetadata?.contentType ??
      loaded.asset.contentType;
    const byteSize = parsed.data.byteSize ?? object.size ?? loaded.asset.byteSize;
    await db
      .update(mediaAssets)
      .set({
        status: "ready",
        contentType,
        byteSize,
        recordVersion: loaded.asset.recordVersion + 1,
        updatedAt: now,
        uploadedAt: loaded.asset.uploadedAt ?? now,
      })
      .where(eq(mediaAssets.id, loaded.asset.id));

    const updated = {
      ...loaded.asset,
      status: "ready" as const,
      contentType,
      byteSize: byteSize ?? null,
      recordVersion: loaded.asset.recordVersion + 1,
      updatedAt: now,
      uploadedAt: loaded.asset.uploadedAt ?? now,
    };
    const responseBody = {
      data: mediaAssetSchema.parse(mapMediaAsset(updated)),
    };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: CONFIRM_UPLOAD_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return c.json(responseBody, 200);
  },
);

fileRoutes.get(
  "/:mediaAssetId/download-target",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const db = createDb(c.env.DB);
    const loaded = await loadAccessibleMediaAsset(
      db,
      c.req.param("mediaAssetId"),
      actor,
    );
    if (!loaded) {
      return fail(c, 404, "MEDIA_ASSET_NOT_FOUND", "Media asset not found.");
    }
    if (loaded.asset.status !== "ready") {
      return fail(
        c,
        409,
        "MEDIA_NOT_READY",
        "Media asset is not ready for download.",
      );
    }

    const expiresAtUnix = Math.floor(
      (Date.now() + DOWNLOAD_TARGET_TTL_MS) / 1000,
    );
    const token = await signFileAccessToken({
      mediaAssetId: loaded.asset.id,
      expiresAtUnix,
      secret: fileSigningSecret(c.env.MEDIA_SIGNING_SECRET),
    });
    const expiresAt = new Date(expiresAtUnix * 1000).toISOString();
    return ok(
      c,
      downloadTargetResponseSchema.parse({
        mediaAsset: mapMediaAsset(loaded.asset),
        downloadUrl: `/files/${loaded.asset.id}/content?exp=${expiresAtUnix}&sig=${token}`,
        expiresAt,
      }),
    );
  },
);

fileRoutes.get(
  "/:mediaAssetId/content",
  optionalAuthMiddleware,
  async (c) => {
    const mediaAssetId = c.req.param("mediaAssetId");
    const exp = c.req.query("exp");
    const sig = c.req.query("sig");
    const db = createDb(c.env.DB);

    let authorized = false;
    if (exp && sig) {
      authorized = await verifyFileAccessToken({
        mediaAssetId,
        expiresAtUnix: Number(exp),
        token: sig,
        secret: fileSigningSecret(c.env.MEDIA_SIGNING_SECRET),
      });
    } else {
      const actor = c.get("actor");
      if (actor?.selectedRole) {
        const loaded = await loadAccessibleMediaAsset(db, mediaAssetId, actor);
        authorized = Boolean(loaded);
      }
    }

    if (!authorized) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const bucket = requireMediaBucket(c);
    if (!bucket) {
      return fail(
        c,
        503,
        "MEDIA_BUCKET_UNAVAILABLE",
        "File storage is not configured.",
      );
    }

    const rows = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, mediaAssetId))
      .limit(1);
    const asset = rows[0];
    if (!asset || asset.status !== "ready") {
      return fail(c, 404, "MEDIA_ASSET_NOT_FOUND", "Media asset not found.");
    }

    const object = await bucket.get(asset.objectKey);
    if (!object) {
      return fail(c, 404, "MEDIA_OBJECT_NOT_FOUND", "Media object not found.");
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, max-age=60");
    return new Response(object.body, { headers });
  },
);

fileRoutes.get(
  "/:mediaAssetId",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const db = createDb(c.env.DB);
    const loaded = await loadAccessibleMediaAsset(
      db,
      c.req.param("mediaAssetId"),
      actor,
    );
    if (!loaded) {
      return fail(c, 404, "MEDIA_ASSET_NOT_FOUND", "Media asset not found.");
    }
    return ok(c, mediaAssetSchema.parse(mapMediaAsset(loaded.asset)));
  },
);
