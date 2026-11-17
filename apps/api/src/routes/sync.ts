import {
  operation,
  cursorParameter,
  limitParameter,
} from "../openapi/document";
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
import {
  appendChangeLog,
  failedSyncResult,
  findStoredSyncVerdict,
  pullChangesForTrainee,
  recordSyncResult,
  resolveWorkoutMutationPayload,
} from "../domain/sync";
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

      // Dedupe: an applied mutation is answered `already_applied` and never
      // dispatched again. A refusal on record is processed again (Z12-41).
      const stored = await findStoredSyncVerdict(db, {
        actorUserId: actor.userId,
        mutation,
      });
      if (stored.kind !== "process") {
        results.push(stored.result);
        continue;
      }

      // A workout opened with no network carries the plan's own ids.
      const payload = await resolveWorkoutMutationPayload(db, {
        actorUserId: actor.userId,
        operation: mutation.operation,
        payload: mutation.payload,
      });
      const mapped = mapMutationToRequest({ ...mutation, payload });
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
        // A transient failure (5xx, 408, 429) is marked `retryable` and is
        // not stored; any other refusal is stored and reported as it is.
        results.push(
          await recordSyncResult(db, {
            actorUserId: actor.userId,
            mutation,
            result: failedSyncResult(mutation, response.status, json?.error),
          }),
        );
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

      results.push(
        await recordSyncResult(db, {
          actorUserId: actor.userId,
          mutation,
          result,
        }),
      );
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
