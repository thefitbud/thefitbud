import {
  operation,
  cursorParameter,
  limitParameter,
} from "../openapi/document";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Hono as HonoApp } from "hono";
import {
  SYNC_OPERATION_ENTITY,
  syncMutationResultSchema,
  syncPullResponseSchema,
  syncPushRequestSchema,
  syncPushResponseSchema,
  type SyncEntityType,
  type SyncMutationOperation,
  type SyncMutationRequest,
  type SyncMutationResult,
} from "@fitbud/contracts";
import { createDb } from "../db/client";
import { syncMutations } from "../db/schema";
import {
  appendChangeLog,
  mutationResultFromStored,
  pullChangesForTrainee,
} from "../domain/sync";
import { createId, nowIso } from "../lib/crypto";
import { fail, ok } from "../lib/envelope";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth";
import type { Env, Variables } from "../types";

export const syncRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

type AppType = HonoApp<{ Bindings: Env; Variables: Variables }>;

let boundApp: AppType | null = null;

/** Avoid circular import: index binds the app after route registration. */
export function bindSyncApp(app: AppType): void {
  boundApp = app;
}

function getApp(): AppType {
  if (!boundApp) {
    throw new Error("Sync app is not bound");
  }
  return boundApp;
}

type DispatchTarget = {
  method: "POST" | "PUT";
  path: string;
  body: unknown;
};

function mapMutationToRequest(
  mutation: SyncMutationRequest,
): DispatchTarget | { error: string } {
  const payload = mutation.payload;
  switch (mutation.operation as SyncMutationOperation) {
    case "workout.start": {
      const assignmentId = payload.assignmentId;
      if (typeof assignmentId !== "string") {
        return { error: "assignmentId is required" };
      }
      return {
        method: "POST",
        path: `/workouts/assignments/${assignmentId}/start`,
        body: {},
      };
    }
    case "workout.pause": {
      const executionId = payload.executionId;
      if (typeof executionId !== "string") {
        return { error: "executionId is required" };
      }
      return {
        method: "POST",
        path: `/workouts/executions/${executionId}/pause`,
        body: {},
      };
    }
    case "workout.resume": {
      const executionId = payload.executionId;
      if (typeof executionId !== "string") {
        return { error: "executionId is required" };
      }
      return {
        method: "POST",
        path: `/workouts/executions/${executionId}/resume`,
        body: {},
      };
    }
    case "workout.complete_set": {
      const executionId = payload.executionId;
      const setExecutionId = payload.setExecutionId;
      if (typeof executionId !== "string" || typeof setExecutionId !== "string") {
        return { error: "executionId and setExecutionId are required" };
      }
      return {
        method: "POST",
        path: `/workouts/executions/${executionId}/sets/${setExecutionId}/complete`,
        body: payload.body ?? {},
      };
    }
    case "workout.complete": {
      const executionId = payload.executionId;
      if (typeof executionId !== "string") {
        return { error: "executionId is required" };
      }
      return {
        method: "POST",
        path: `/workouts/executions/${executionId}/complete`,
        body: payload.body ?? {},
      };
    }
    case "workout.skip": {
      const assignmentId = payload.assignmentId;
      if (typeof assignmentId !== "string") {
        return { error: "assignmentId is required" };
      }
      return {
        method: "POST",
        path: `/workouts/assignments/${assignmentId}/skip`,
        body: {},
      };
    }
    case "meal.confirm": {
      const assignmentId = payload.assignmentId;
      if (typeof assignmentId !== "string") {
        return { error: "assignmentId is required" };
      }
      return {
        method: "POST",
        path: `/meals/assignments/${assignmentId}/confirm`,
        body: payload.body ?? {},
      };
    }
    case "meal.deviate": {
      const assignmentId = payload.assignmentId;
      if (typeof assignmentId !== "string") {
        return { error: "assignmentId is required" };
      }
      return {
        method: "POST",
        path: `/meals/assignments/${assignmentId}/deviate`,
        body: payload.body ?? {},
      };
    }
    case "meal.skip": {
      const assignmentId = payload.assignmentId;
      if (typeof assignmentId !== "string") {
        return { error: "assignmentId is required" };
      }
      return {
        method: "POST",
        path: `/meals/assignments/${assignmentId}/skip`,
        body: payload.body ?? {},
      };
    }
    case "checkin.save_draft": {
      const checkinId = payload.checkinId;
      if (typeof checkinId !== "string") {
        return { error: "checkinId is required" };
      }
      return {
        method: "PUT",
        path: `/checkins/${checkinId}/draft`,
        body: payload.body ?? {},
      };
    }
    case "checkin.submit": {
      const checkinId = payload.checkinId;
      if (typeof checkinId !== "string") {
        return { error: "checkinId is required" };
      }
      return {
        method: "POST",
        path: `/checkins/${checkinId}/submit`,
        body: payload.body ?? {},
      };
    }
    case "measurement.create": {
      const coachingRelationshipId = payload.coachingRelationshipId;
      if (typeof coachingRelationshipId !== "string") {
        return { error: "coachingRelationshipId is required" };
      }
      const body =
        payload.body && typeof payload.body === "object"
          ? {
              ...(payload.body as Record<string, unknown>),
              ...(typeof payload.id === "string" ? { id: payload.id } : {}),
            }
          : {};
      return {
        method: "POST",
        path: `/progress/relationships/${coachingRelationshipId}/measurements`,
        body,
      };
    }
    default:
      return { error: "Unsupported sync operation" };
  }
}

function extractRecordMeta(
  entityType: SyncEntityType,
  data: unknown,
): { recordId: string | null; serverVersion: number | null; relationshipId: string | null } {
  if (!data || typeof data !== "object") {
    return { recordId: null, serverVersion: null, relationshipId: null };
  }
  const record = data as Record<string, unknown>;
  const recordId = typeof record.id === "string" ? record.id : null;
  const serverVersion =
    typeof record.recordVersion === "number" ? record.recordVersion : null;
  const relationshipId =
    typeof record.coachingRelationshipId === "string"
      ? record.coachingRelationshipId
      : null;
  if (entityType === "effective_plan") {
    return { recordId, serverVersion, relationshipId };
  }
  return { recordId, serverVersion, relationshipId };
}

function statusFromHttp(
  httpStatus: number,
  alreadyApplied: boolean,
): SyncMutationResult["status"] {
  if (alreadyApplied) return "already_applied";
  if (httpStatus === 409) return "conflicted";
  if (httpStatus >= 200 && httpStatus < 300) return "applied";
  return "rejected";
}

syncRoutes.post(
  "/push",
  operation({
    tag: "Sync",
    summary: "Applies offline trainee mutations",
    description: "Applies offline trainee mutations. Each mutation carries its own idempotency key in the body.",
    roles: ["trainee"],
    body: syncPushRequestSchema,
    response: syncPushResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const parsed = syncPushRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid sync push request.", {
        issues: parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const authHeader = c.req.header("Authorization") ?? "";
    const cookieHeader = c.req.header("Cookie") ?? "";
    const results: SyncMutationResult[] = [];

    for (const mutation of parsed.data.mutations) {
      const expectedEntity = SYNC_OPERATION_ENTITY[mutation.operation];
      if (mutation.entityType !== expectedEntity) {
        results.push({
          mutationId: mutation.mutationId,
          status: "rejected",
          recordId: null,
          serverVersion: null,
          entityType: mutation.entityType,
          error: {
            code: "SYNC_ENTITY_MISMATCH",
            message: "Mutation entityType does not match operation.",
          },
        });
        continue;
      }

      const existingByMutation = await db
        .select()
        .from(syncMutations)
        .where(
          and(
            eq(syncMutations.actorUserId, actor.userId),
            eq(syncMutations.mutationId, mutation.mutationId),
          ),
        )
        .limit(1);
      if (existingByMutation[0]) {
        const prior = mutationResultFromStored(existingByMutation[0].resultBody);
        results.push({
          ...prior,
          status:
            prior.status === "applied" || prior.status === "already_applied"
              ? "already_applied"
              : prior.status,
        });
        continue;
      }

      const existingByKey = await db
        .select()
        .from(syncMutations)
        .where(
          and(
            eq(syncMutations.actorUserId, actor.userId),
            eq(syncMutations.idempotencyKey, mutation.idempotencyKey),
          ),
        )
        .limit(1);
      if (existingByKey[0]) {
        const prior = mutationResultFromStored(existingByKey[0].resultBody);
        if (existingByKey[0].mutationId !== mutation.mutationId) {
          results.push({
            mutationId: mutation.mutationId,
            status: "rejected",
            recordId: prior.recordId,
            serverVersion: prior.serverVersion,
            entityType: prior.entityType,
            error: {
              code: "IDEMPOTENCY_KEY_REUSE",
              message:
                "Idempotency key was already used by a different mutation id.",
            },
          });
          continue;
        }
        results.push(prior);
        continue;
      }

      const mapped = mapMutationToRequest(mutation);
      if ("error" in mapped) {
        results.push({
          mutationId: mutation.mutationId,
          status: "rejected",
          recordId: null,
          serverVersion: null,
          entityType: mutation.entityType,
          error: { code: "INVALID_MUTATION_PAYLOAD", message: mapped.error },
        });
        continue;
      }

      const response = await getApp().request(
        mapped.path,
        {
          method: mapped.method,
          headers: {
            Authorization: authHeader,
            Cookie: cookieHeader,
            "Content-Type": "application/json",
            "Idempotency-Key": mutation.idempotencyKey,
            "x-fitbud-role": "trainee",
          },
          body: JSON.stringify(mapped.body),
        },
        c.env,
      );

      const json = (await response.json().catch(() => null)) as {
        data?: unknown;
        error?: { code?: string; message?: string; details?: Record<string, unknown> };
      } | null;

      if (!response.ok) {
        const result: SyncMutationResult = {
          mutationId: mutation.mutationId,
          status: statusFromHttp(response.status, false),
          recordId: mutation.recordId,
          serverVersion: null,
          entityType: mutation.entityType,
          error: {
            code: json?.error?.code ?? "SYNC_MUTATION_FAILED",
            message: json?.error?.message ?? "Mutation failed.",
            details: json?.error?.details,
          },
        };
        await db.insert(syncMutations).values({
          id: createId(),
          mutationId: mutation.mutationId,
          actorUserId: actor.userId,
          idempotencyKey: mutation.idempotencyKey,
          operation: mutation.operation,
          entityType: mutation.entityType,
          recordId: mutation.recordId,
          resultStatus: result.status,
          serverVersion: null,
          resultBody: JSON.stringify(result),
          createdAt: nowIso(),
        });
        results.push(result);
        continue;
      }

      const meta = extractRecordMeta(mutation.entityType, json?.data);
      const result: SyncMutationResult = syncMutationResultSchema.parse({
        mutationId: mutation.mutationId,
        status: "applied",
        recordId: meta.recordId ?? mutation.recordId,
        serverVersion: meta.serverVersion,
        entityType: mutation.entityType,
        error: null,
      });

      if (meta.relationshipId && meta.recordId) {
        await appendChangeLog(db, {
          entityType: mutation.entityType,
          recordId: meta.recordId,
          changeKind: "upsert",
          serverVersion: meta.serverVersion,
          coachingRelationshipId: meta.relationshipId,
          traineeUserId: actor.userId,
        });
      }

      await db.insert(syncMutations).values({
        id: createId(),
        mutationId: mutation.mutationId,
        actorUserId: actor.userId,
        idempotencyKey: mutation.idempotencyKey,
        operation: mutation.operation,
        entityType: mutation.entityType,
        recordId: result.recordId,
        resultStatus: result.status,
        serverVersion: result.serverVersion,
        resultBody: JSON.stringify(result),
        createdAt: nowIso(),
      });
      results.push(result);
    }

    return ok(c, syncPushResponseSchema.parse({ results }));
  },
);

syncRoutes.get(
  "/pull",
  operation({
    tag: "Sync",
    summary: "Pulls authoritative changes for the trainee",
    description: "Pulls authoritative changes for the trainee. The default limit is 50 and the maximum is 100.",
    roles: ["trainee"],
    parameters: [
      limitParameter({ defaultValue: 50, maximum: 1, invalid: "reject" }),
      cursorParameter(),
    ],
    response: syncPullResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const cursor = c.req.query("cursor") ?? null;
    const limitRaw = c.req.query("limit");
    const limit = Math.min(
      Math.max(limitRaw ? Number(limitRaw) : 50, 1),
      100,
    );
    if (limitRaw && !Number.isFinite(limit)) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid limit.");
    }

    const db = createDb(c.env.DB);
    const pulled = await pullChangesForTrainee(db, {
      traineeUserId: actor.userId,
      cursor,
      limit,
    });
    if (pulled.invalidCursor) {
      return fail(c, 400, "INVALID_CURSOR", "Sync cursor is invalid.");
    }

    return ok(
      c,
      syncPullResponseSchema.parse({
        changes: pulled.changes,
        nextCursor: pulled.nextCursor,
        hasMore: pulled.hasMore,
      }),
    );
  },
);
