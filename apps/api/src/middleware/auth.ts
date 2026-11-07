import { eq } from "drizzle-orm";
import type { Role } from "@fitbud/contracts";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { createDb, type Db } from "../db/client";
import { users, webSessions } from "../db/schema";
import { verifyFirebaseIdToken } from "../auth/firebase";
import { loadActorByFirebaseUid, loadActorByUserId } from "../auth/identity";
import { fail } from "../lib/envelope";
import { nowIso, sha256Hex } from "../lib/crypto";
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
  by: { userId: string } | { firebaseUid: string },
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
    .where(
      "userId" in by
        ? eq(users.id, by.userId)
        : eq(users.firebaseUid, by.firebaseUid),
    )
    .limit(1);
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

/** A live (not revoked, not expired) web session, touched on every use. */
async function loadLiveWebSession(db: Db, token: string) {
  const tokenHash = await sha256Hex(token);
  const [session] = await db
    .select()
    .from(webSessions)
    .where(eq(webSessions.tokenHash, tokenHash))
    .limit(1);
  if (!session || session.revokedAt || session.expiresAt <= nowIso()) {
    return null;
  }
  await db
    .update(webSessions)
    .set({ lastSeenAt: nowIso() })
    .where(eq(webSessions.id, session.id));
  return session;
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
  c.set("actor", null);

  const db = createDb(c.env.DB);
  const requestedRole = parseRequestedRole(c.req.header("x-fitbud-role") ?? undefined);
  const cookieName = c.env.SESSION_COOKIE_NAME || "fitbud_session";
  const sessionToken = getCookie(c, cookieName);
  const authHeader = c.req.header("authorization");

  if (sessionToken) {
    const session = await loadLiveWebSession(db, sessionToken);
    if (session) {
      // A cookie session's sign-in time is when it was issued (D-W6-31).
      const authTime = session.createdAt;
      const actor = await loadActorByUserId(db, {
        userId: session.userId,
        surface: "trainer_web",
        authMethod: "session",
        requestedRole,
      });
      if (actor) {
        c.set("actor", { ...actor, authTime });
        await next();
        return;
      }
      const archived = await loadArchivedUser(db, { userId: session.userId });
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
      const actor = await loadActorByFirebaseUid(db, identity.uid, requestedRole);
      if (actor) {
        c.set("actor", { ...actor, authTime });
      } else {
        const archived = await loadArchivedUser(db, { firebaseUid: identity.uid });
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
