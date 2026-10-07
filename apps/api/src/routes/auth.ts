import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  traineeProfileSchema,
  updateTraineeProfileRequestSchema,
} from "@fitbud/contracts";
import { deriveAge, formatLocalDate } from "@fitbud/core";
import { traineeProfiles } from "../db/schema";
import {
  operation,
} from "../openapi/document";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  createWebSessionRequestSchema,
  meResponseSchema,
  createWebSessionResponseSchema,
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
import { nowIso } from "../lib/crypto";
import { fail, ok } from "../lib/envelope";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth";
import type { Env, Variables } from "../types";

export const authRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

authRoutes.post("/session", 
  operation({
    tag: "Auth",
    summary: "Exchanges a Firebase identity token for a trainer web session and provisions a trainer profile when one is missing.",
    description: "Exchanges a Firebase identity token for a trainer web session and provisions a trainer profile when one is missing.",
    security: "public",
    body: createWebSessionRequestSchema,
    response: createWebSessionResponseSchema,
  }),
  async (c) => {
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

authRoutes.delete("/session", 
  operation({
    tag: "Auth",
    summary: "Revokes the current web session and clears the session cookie.",
    description: "Revokes the current web session and clears the session cookie.",
    response: z.object({ ended: z.literal(true) }),
  }),
  optionalAuthMiddleware, requireAuthMiddleware, async (c) => {
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

meRoutes.get("/", 
  operation({
    tag: "Auth",
    summary: "Returns the authenticated actor, permitted roles, and selected role.",
    description: "Returns the authenticated actor, permitted roles, and selected role.",
    response: meResponseSchema,
  }),
  optionalAuthMiddleware, requireAuthMiddleware, async (c) => {
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

meRoutes.get(
  "/trainee-profile",
  operation({
    tag: "Auth",
    summary: "Returns the authenticated trainee profile.",
    description:
      "Trainee-only. Date of birth and gender are stored on the trainee profile. Age is derived and is not stored.",
    roles: ["trainee"],
    response: traineeProfileSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const db = createDb(c.env.DB);
    const [row] = await db
      .select()
      .from(traineeProfiles)
      .where(eq(traineeProfiles.userId, actor.userId))
      .limit(1);
    if (!row) {
      return fail(c, 404, "TRAINEE_PROFILE_NOT_FOUND", "Trainee profile not found.");
    }
    return ok(
      c,
      traineeProfileSchema.parse({
        displayName: row.displayName,
        dateOfBirth: row.dateOfBirth,
        gender: row.gender,
        updatedAt: row.updatedAt,
      }),
    );
  },
);

meRoutes.put(
  "/trainee-profile",
  operation({
    tag: "Auth",
    summary: "Updates the authenticated trainee date of birth and gender.",
    description:
      "Trainee-only. Display name is unchanged. A future or invalid birth date is rejected.",
    roles: ["trainee"],
    body: updateTraineeProfileRequestSchema,
    response: traineeProfileSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const body = await c.req.json().catch(() => null);
    const parsed = updateTraineeProfileRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid trainee profile.", {
        issues: parsed.error.issues,
      });
    }
    const today = formatLocalDate(new Date(), actor.timezone);
    if (
      parsed.data.dateOfBirth &&
      deriveAge(parsed.data.dateOfBirth, today) === null
    ) {
      return fail(
        c,
        400,
        "INVALID_REQUEST",
        "Date of birth must be a real date on or before today.",
      );
    }
    const db = createDb(c.env.DB);
    const [existing] = await db
      .select()
      .from(traineeProfiles)
      .where(eq(traineeProfiles.userId, actor.userId))
      .limit(1);
    if (!existing) {
      return fail(c, 404, "TRAINEE_PROFILE_NOT_FOUND", "Trainee profile not found.");
    }
    const updatedAt = nowIso();
    await db
      .update(traineeProfiles)
      .set({
        dateOfBirth: parsed.data.dateOfBirth,
        gender: parsed.data.gender,
        updatedAt,
      })
      .where(eq(traineeProfiles.id, existing.id));
    return ok(
      c,
      traineeProfileSchema.parse({
        displayName: existing.displayName,
        dateOfBirth: parsed.data.dateOfBirth,
        gender: parsed.data.gender,
        updatedAt,
      }),
    );
  },
);
