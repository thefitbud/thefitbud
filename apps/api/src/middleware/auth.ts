import type { Role } from "@fitbud/contracts";
import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { createDb } from "../db/client";
import { verifyFirebaseIdToken } from "../auth/firebase";
import {
  loadActorByFirebaseUid,
  loadActorBySessionToken,
} from "../auth/identity";
import { fail } from "../lib/envelope";
import type { Env, Variables } from "../types";

function parseRequestedRole(headerValue: string | undefined): Role | null {
  if (headerValue === "trainer" || headerValue === "trainee") {
    return headerValue;
  }
  return null;
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
    const actor = await loadActorBySessionToken(db, sessionToken, requestedRole);
    if (actor) {
      c.set("actor", actor);
      await next();
      return;
    }
  }

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    const identity = await verifyFirebaseIdToken(token, {
      projectId: c.env.FIREBASE_PROJECT_ID,
      authMode: c.env.AUTH_MODE === "firebase" ? "firebase" : "test",
    });
    if (identity) {
      const actor = await loadActorByFirebaseUid(db, identity.uid, requestedRole);
      if (actor) {
        c.set("actor", actor);
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
