import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  createWebSessionRequestSchema,
  meResponseSchema,
} from "@fitbud/contracts";
import { createDb } from "../db/client";
import { verifyFirebaseIdToken } from "../auth/firebase";
import {
  createWebSession,
  ensureRoleAndProfile,
  findOrCreateUserFromFirebase,
  loadActorByUserId,
  revokeWebSession,
} from "../auth/identity";
import { fail, ok } from "../lib/envelope";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
} from "../middleware/auth";
import type { Env, Variables } from "../types";

export const authRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

authRoutes.post("/session", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createWebSessionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, 400, "INVALID_REQUEST", "Invalid session exchange request.", {
      issues: parsed.error.issues,
    });
  }

  const identity = await verifyFirebaseIdToken(parsed.data.idToken, {
    projectId: c.env.FIREBASE_PROJECT_ID,
    authMode: c.env.AUTH_MODE === "firebase" ? "firebase" : "test",
  });
  if (!identity) {
    return fail(c, 401, "INVALID_TOKEN", "Firebase identity token was rejected.");
  }

  const db = createDb(c.env.DB);
  const { userId } = await findOrCreateUserFromFirebase(
    db,
    identity,
    parsed.data.timezone ?? "UTC",
  );

  // Trainer web session exchange provisions trainer role + profile when missing.
  await ensureRoleAndProfile(db, {
    userId,
    role: "trainer",
    displayName: identity.email?.split("@")[0] || "Trainer",
  });

  const actor = await loadActorByUserId(db, {
    userId,
    surface: "trainer_web",
    authMethod: "session",
    requestedRole: "trainer",
  });
  if (!actor || actor.selectedRole !== "trainer") {
    return fail(
      c,
      403,
      "FORBIDDEN_ROLE",
      "Trainer web sessions require the trainer role.",
    );
  }

  const session = await createWebSession(db, userId);
  const cookieName = c.env.SESSION_COOKIE_NAME || "fitbud_session";
  setCookie(c, cookieName, session.token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    expires: new Date(session.expiresAt),
  });

  return ok(c, {
    userId,
    expiresAt: session.expiresAt,
  });
});

authRoutes.delete("/session", optionalAuthMiddleware, requireAuthMiddleware, async (c) => {
  const cookieName = c.env.SESSION_COOKIE_NAME || "fitbud_session";
  const token = getCookie(c, cookieName);

  if (token) {
    const db = createDb(c.env.DB);
    await revokeWebSession(db, token);
  }

  deleteCookie(c, cookieName, { path: "/" });
  return ok(c, { ended: true });
});

export const meRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

meRoutes.get("/", optionalAuthMiddleware, requireAuthMiddleware, async (c) => {
  const actor = c.get("actor");
  if (!actor) {
    return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
  }

  const data = meResponseSchema.parse({
    userId: actor.userId,
    firebaseUid: actor.firebaseUid,
    accountState: actor.accountState,
    timezone: actor.timezone,
    permittedRoles: actor.permittedRoles,
    selectedRole: actor.selectedRole,
    surface: actor.surface,
    trainerProfileId: actor.trainerProfileId,
    traineeProfileId: actor.traineeProfileId,
  });

  return ok(c, data);
});
