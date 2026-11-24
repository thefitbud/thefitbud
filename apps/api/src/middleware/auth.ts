import { eq } from "drizzle-orm";
import type { Role } from "@fitbud/contracts";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { createDb, type Db } from "../db/client";
import { users } from "../db/schema";
import { verifyFirebaseIdToken } from "../auth/firebase";
import {
  actorFromIdentity,
  loadIdentityByFirebaseUid,
  loadLiveWebSessionIdentity,
  type IdentityRow,
} from "../auth/identity";
import { fail } from "../lib/envelope";
import type { ActorContext, Env, Variables } from "../types";

type AuthContext = Context<{ Bindings: Env; Variables: Variables }>;

function parseRequestedRole(headerValue: string | undefined): Role | null {
  if (headerValue === "trainer" || headerValue === "trainee") {
    return headerValue;
  }
  return null;
}

/**
 * The only routes an archived account reaches (Z6-14, D-W6-7): its status, the
 * reactivation confirm and web sign-out (D-W6-35, so an archived browser's
 * cookie session can be revoked). Every other route that resolves an actor
 * answers 403 ACCOUNT_ARCHIVED with `purgeAfter`.
 */
const ARCHIVED_ACTOR_ROUTES = new Set([
  "GET /account/status",
  "POST /account/reactivation",
  "DELETE /auth/session",
]);

function archivedActorMayReach(c: AuthContext): boolean {
  const path = c.req.path.replace(/\/+$/, "");
  return ARCHIVED_ACTOR_ROUTES.has(`${c.req.method} ${path}`);
}

type ArchivedUser = {
  id: string;
  firebaseUid: string;
  timezone: string;
  purgeAfter: string;
};

/** The user row when (and only when) the account is archived. */
async function loadArchivedUser(
  db: Db,
  by: { userId: string },
): Promise<ArchivedUser | null> {
  const [row] = await db
    .select({
      id: users.id,
      firebaseUid: users.firebaseUid,
      timezone: users.timezone,
      accountState: users.accountState,
      purgeAfter: users.purgeAfter,
    })
    .from(users)
    .where(eq(users.id, by.userId))
    .limit(1);
  return archivedFromIdentity(row ?? null);
}

/** The archived view of an identity row already read (no extra query, Z14-1). */
function archivedFromIdentity(
  row: Pick<IdentityRow, "id" | "firebaseUid" | "timezone" | "accountState" | "purgeAfter"> | null,
): ArchivedUser | null {
  if (!row || row.accountState !== "archived" || !row.purgeAfter) {
    return null;
  }
  return {
    id: row.id,
    firebaseUid: row.firebaseUid,
    timezone: row.timezone,
    purgeAfter: row.purgeAfter,
  };
}

/** Static 403 for an archived account; `purgeAfter` is the caller's own date. */
export function accountArchivedResponse(c: AuthContext, purgeAfter: string) {
  return fail(
    c,
    403,
    "ACCOUNT_ARCHIVED",
    "This account is deleted. Sign in again and bring it back to continue.",
    { accountState: "archived", purgeAfter },
  );
}

/**
 * An archived account either reaches its status or reactivation route as an
 * actor with no roles (so no role-gated handler can accept it), or is refused
 * here, before any handler, including routes that skip requireAuthMiddleware.
 */
async function continueAsArchived(
  c: AuthContext,
  next: () => Promise<void>,
  user: ArchivedUser,
  credential: {
    surface: ActorContext["surface"];
    authMethod: ActorContext["authMethod"];
    authTime: string | null;
  },
) {
  if (!archivedActorMayReach(c)) {
    return accountArchivedResponse(c, user.purgeAfter);
  }
  c.set("actor", {
    userId: user.id,
    firebaseUid: user.firebaseUid,
    accountState: "archived",
    authTime: credential.authTime,
    timezone: user.timezone,
    permittedRoles: [],
    selectedRole: null,
    surface: credential.surface,
    trainerProfileId: null,
    traineeProfileId: null,
    authMethod: credential.authMethod,
  });
  await next();
}

/**
 * Z14-1: an actor already resolved by this worker for an in-process request
 * (sync push applies each mutation through the app without re-running auth).
 * Keyed by the exact Request object the caller built, so nothing from outside
 * the process can reach it: an incoming request is always a different object.
 */
type InternalRequestContext = {
  actor: ActorContext;
  /** Relationships whose exceptions the inner handlers asked to re-evaluate. */
  exceptionEvaluations: Set<string>;
};
const internalRequests = new WeakMap<Request, InternalRequestContext>();
/** Actors already resolved for a request object, so a second pass reads nothing. */
const resolvedRequests = new WeakMap<Request, ActorContext | null>();

/** Marks `request` as carrying an already-resolved actor (in-process dispatch only). */
export function bindInternalRequest(
  request: Request,
  context: InternalRequestContext,
): void {
  internalRequests.set(request, context);
}

/** The in-process context for this request, if the caller bound one. */
export function internalRequestContext(c: {
  req: { raw: Request };
}): InternalRequestContext | null {
  return internalRequests.get(c.req.raw) ?? null;
}

function epochSecondsToIso(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export const optionalAuthMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  // Z14-1: resolved once per request. A second pass (or an in-process request
  // that carries its caller's actor) reuses it and reads nothing.
  const internal = internalRequests.get(c.req.raw);
  if (internal) {
    c.set("actor", internal.actor);
    await next();
    return;
  }
  if (resolvedRequests.has(c.req.raw)) {
    c.set("actor", resolvedRequests.get(c.req.raw) ?? null);
    await next();
    return;
  }
  c.set("actor", null);

  const db = createDb(c.env.DB);
  const requestedRole = parseRequestedRole(c.req.header("x-fitbud-role") ?? undefined);
  const cookieName = c.env.SESSION_COOKIE_NAME || "fitbud_session";
  const sessionToken = getCookie(c, cookieName);
  const authHeader = c.req.header("authorization");

  if (sessionToken) {
    // One query: session + user + roles + profiles (Z14-1).
    const session = await loadLiveWebSessionIdentity(db, sessionToken);
    if (session?.identity) {
      // A cookie session's sign-in time is when it was issued (D-W6-31).
      const authTime = session.createdAt;
      const actor = actorFromIdentity(session.identity, {
        surface: "trainer_web",
        authMethod: "session",
        requestedRole,
      });
      if (actor) {
        c.set("actor", { ...actor, authTime });
        resolvedRequests.set(c.req.raw, c.get("actor"));
        await next();
        return;
      }
      const archived = archivedFromIdentity(session.identity);
      if (archived) {
        return continueAsArchived(c, next, archived, {
          surface: "trainer_web",
          authMethod: "session",
          authTime,
        });
      }
    }
  }

  if (authHeader?.startsWith("Bearer ")) {
    const authMode = c.env.AUTH_MODE === "firebase" ? "firebase" : "test";
    // Staging/production never get here with test auth (runtime guard). Any other
    // non-local environment still refuses the unsigned test tokens.
    if (authMode === "test" && c.env.ENVIRONMENT !== "local") {
      return fail(
        c,
        500,
        "RUNTIME_MISCONFIGURED",
        "Test authentication is only available in local development.",
      );
    }
    const token = authHeader.slice("Bearer ".length).trim();
    const identity = await verifyFirebaseIdToken(token, {
      projectId: c.env.FIREBASE_PROJECT_ID,
      authMode,
    });
    if (identity) {
      const authTime = epochSecondsToIso(identity.authTime);
      // One query: user + roles + profiles (Z14-1; five serial queries before).
      const row = await loadIdentityByFirebaseUid(db, identity.uid);
      const actor = row
        ? actorFromIdentity(row, { surface: "mobile", authMethod: "bearer", requestedRole })
        : null;
      if (actor) {
        c.set("actor", { ...actor, authTime });
        resolvedRequests.set(c.req.raw, c.get("actor"));
      } else {
        const archived = archivedFromIdentity(row);
        if (archived) {
          return continueAsArchived(c, next, archived, {
            surface: "mobile",
            authMethod: "bearer",
            authTime,
          });
        }
      }
    }
  }

  await next();
});

export const requireAuthMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  const actor = c.get("actor");
  if (!actor) {
    return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
  }
  if (actor.accountState === "archived") {
    // Only the allowlisted routes see an archived actor, which carries no roles.
    // Sign-out uses this middleware, so it passes here; any other route is
    // refused here too in case an archived actor ever reaches it.
    if (archivedActorMayReach(c)) {
      await next();
      return;
    }
    const archived = await loadArchivedUser(createDb(c.env.DB), {
      userId: actor.userId,
    });
    if (archived) {
      return accountArchivedResponse(c, archived.purgeAfter);
    }
    return fail(c, 403, "ACCOUNT_DISABLED", "Account is disabled.");
  }
  if (actor.accountState !== "active") {
    return fail(c, 403, "ACCOUNT_DISABLED", "Account is disabled.");
  }
  await next();
});

export function requireRole(...roles: Role[]) {
  return createMiddleware<{
    Bindings: Env;
    Variables: Variables;
  }>(async (c, next) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    if (!actor.selectedRole || !roles.includes(actor.selectedRole)) {
      return fail(
        c,
        403,
        "FORBIDDEN_ROLE",
        "Authenticated user lacks the required role for this operation.",
        {
          requiredRoles: roles,
          selectedRole: actor.selectedRole,
          permittedRoles: actor.permittedRoles,
        },
      );
    }
    await next();
  });
}
