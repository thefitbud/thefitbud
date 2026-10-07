import {
  operation,
  realtimeAccessParameters,
} from "../openapi/document";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import {
  realtimeSubscriptionTargetSchema,
  relationshipRealtimeChannel,
  relationshipRealtimePath,
  realtimeEventSchema,
} from "@fitbud/contracts";
import { createDb } from "../db/client";
import { coachingRelationships } from "../db/schema";
import { verifyFirebaseIdToken } from "../auth/firebase";
import {
  loadActorByFirebaseUid,
  loadActorBySessionToken,
} from "../auth/identity";
import { fail, ok } from "../lib/envelope";
import { optionalAuthMiddleware } from "../middleware/auth";
import type { ActorContext, Env, Variables } from "../types";

export const realtimeRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

type RealtimeContext = Context<{ Bindings: Env; Variables: Variables }>;

function canAccessRelationship(
  actor: ActorContext,
  row: typeof coachingRelationships.$inferSelect,
): boolean {
  if (row.trainerUserId === actor.userId || row.traineeUserId === actor.userId) {
    return true;
  }
  return false;
}

/**
 * Resolve actor for WebSocket upgrades.
 * Same-origin trainer-web uses session cookies. Mobile may pass access_token
 * because browsers/RN often cannot set Authorization on the WS constructor.
 */
async function resolveRealtimeActor(
  c: RealtimeContext,
): Promise<ActorContext | null> {
  const existing = c.get("actor");
  if (existing) return existing;

  const db = createDb(c.env.DB);
  const url = new URL(c.req.url);
  const requestedRoleHeader = c.req.header("x-fitbud-role");
  const requestedRoleQuery = url.searchParams.get("role");
  const requestedRole =
    requestedRoleHeader === "trainer" || requestedRoleHeader === "trainee"
      ? requestedRoleHeader
      : requestedRoleQuery === "trainer" || requestedRoleQuery === "trainee"
        ? requestedRoleQuery
        : null;

  const cookieName = c.env.SESSION_COOKIE_NAME || "fitbud_session";
  const sessionToken = getCookie(c, cookieName);
  if (sessionToken) {
    const actor = await loadActorBySessionToken(db, sessionToken, requestedRole);
    if (actor) return actor;
  }

  const authHeader = c.req.header("authorization");
  const bearer =
    authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : (url.searchParams.get("access_token")?.trim() ?? "");

  if (bearer) {
    const identity = await verifyFirebaseIdToken(bearer, {
      projectId: c.env.FIREBASE_PROJECT_ID,
      authMode: c.env.AUTH_MODE === "firebase" ? "firebase" : "test",
    });
    if (identity) {
      return loadActorByFirebaseUid(db, identity.uid, requestedRole);
    }
  }

  return null;
}

async function loadAuthorizedRelationship(
  env: Env,
  actor: ActorContext,
  relationshipId: string,
) {
  const db = createDb(env.DB);
  const rows = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.id, relationshipId))
    .limit(1);
  const row = rows[0];
  if (!row || !canAccessRelationship(actor, row)) {
    return null;
  }
  return row;
}

function subscriptionTarget(relationshipId: string) {
  return realtimeSubscriptionTargetSchema.parse({
    coachingRelationshipId: relationshipId,
    channel: relationshipRealtimeChannel(relationshipId),
    path: relationshipRealtimePath(relationshipId),
    protocol: "websocket",
    authority: "rest_and_sync",
  });
}

/**
 * Authorized subscription target for a coaching relationship channel.
 * Events are refetch/sync hints only — REST and offline sync stay authoritative.
 */
realtimeRoutes.get(
  "/relationships/:relationshipId/connection",
  operation({
    tag: "Realtime",
    summary: "Returns the realtime subscription target for a relationship",
    description: "Returns the realtime subscription target for a relationship. REST and sync stay authoritative when the socket is unavailable.",
    parameters: [
      ...realtimeAccessParameters(),
    ],
    response: realtimeSubscriptionTargetSchema,
  }),
  optionalAuthMiddleware,
  async (c) => {
    const actor = (await resolveRealtimeActor(c)) ?? c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    if (actor.accountState !== "active") {
      return fail(c, 403, "ACCOUNT_DISABLED", "Account is disabled.");
    }

    const relationshipId = c.req.param("relationshipId");
    const relationship = await loadAuthorizedRelationship(
      c.env,
      actor,
      relationshipId,
    );
    if (!relationship) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    return ok(c, subscriptionTarget(relationshipId));
  },
);

/**
 * WebSocket upgrade for an authorized relationship channel.
 * Fan-out model: one Durable Object room per coaching relationship id.
 */
realtimeRoutes.get(
  "/relationships/:relationshipId/ws",
  operation({
    tag: "Realtime",
    summary: "Upgrades to a WebSocket for relationship change hints",
    description: "Upgrades to a WebSocket for relationship change hints. A request that is not an upgrade returns 426. Socket messages match realtimeEventSchema and are not an HTTP body.",
    parameters: [
      ...realtimeAccessParameters(),
    ],
    websocketMessage: realtimeEventSchema,
  }),
  optionalAuthMiddleware,
  async (c) => {
    const actor = (await resolveRealtimeActor(c)) ?? c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    if (actor.accountState !== "active") {
      return fail(c, 403, "ACCOUNT_DISABLED", "Account is disabled.");
    }

    if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
      return fail(
        c,
        426,
        "WEBSOCKET_UPGRADE_REQUIRED",
        "Realtime channel requires a WebSocket upgrade. REST/sync remain authoritative.",
      );
    }

    const relationshipId = c.req.param("relationshipId");
    const relationship = await loadAuthorizedRelationship(
      c.env,
      actor,
      relationshipId,
    );
    if (!relationship) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    const namespace = c.env.RELATIONSHIP_REALTIME;
    if (!namespace) {
      return fail(
        c,
        503,
        "REALTIME_UNAVAILABLE",
        "Realtime hub is not configured. Use REST or sync instead.",
      );
    }

    const stub = namespace.get(namespace.idFromName(relationshipId));
    const headers = new Headers(c.req.raw.headers);
    headers.set("x-fitbud-user-id", actor.userId);
    headers.set("x-fitbud-relationship-id", relationshipId);
    return stub.fetch(
      new Request(c.req.raw.url, {
        method: c.req.raw.method,
        headers,
      }),
    );
  },
);
