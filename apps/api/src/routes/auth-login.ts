import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { Hono } from "hono";
import {
  authLoginRequestSchema,
  authOtpStartRequestSchema,
  authOtpStartResponseSchema,
  authOtpVerifyRequestSchema,
  authOtpVerifyResponseSchema,
  authPasswordResetRequestSchema,
  authPasswordSetRequestSchema,
  authRefreshRequestSchema,
  authRefreshResponseSchema,
  authTokenResponseSchema,
} from "@fitbud/contracts";
import {
  authTokenErrorStatus,
  mintAuthToken,
  sessionTokenFields,
  type AuthTokenError,
} from "../auth/custom-token.js";
import { refreshIdToken } from "../auth/token-exchange.js";
import {
  findIdentityByIdentifierHash,
  identifierHash,
  normalizeIdentifier,
} from "../auth/identifiers.js";
import { issuePurposeProof, verifyPurposeProof } from "../auth/proof.js";
import {
  hashPassword,
  passwordRequirementMessage,
  validatePasswordPlaintext,
  verifyPassword,
} from "../auth/password.js";
import { getFlags } from "../config/flags.js";
import { createDb } from "../db/client.js";
import {
  authOtps,
  authRateLimits,
  userIdentities,
  users,
} from "../db/schema.js";
import { otpEmailBody, otpEmailSubject } from "../emails/otp.js";
import { passwordChangedEmailBody, passwordChangedEmailSubject } from "../emails/password-changed.js";
import { createId, nowIso, sha256Hex } from "../lib/crypto.js";
import { fail, ok, type AppContext } from "../lib/envelope.js";
import { sendSystemEmail } from "../lib/email.js";
import { operation } from "../openapi/document.js";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
} from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const authLoginRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const GENERIC_AUTH_FAIL = {
  status: 401 as const,
  code: "INVALID_CREDENTIALS",
  message: "Invalid credentials.",
};

async function bumpRateLimit(
  db: ReturnType<typeof createDb>,
  bucketKey: string,
  windowMinutes: number,
  max: number,
): Promise<boolean> {
  const now = new Date();
  const windowCutoff = new Date(
    now.getTime() - windowMinutes * 60_000,
  ).toISOString();
  const nowStr = now.toISOString();
  const rows = await db
    .select()
    .from(authRateLimits)
    .where(eq(authRateLimits.bucketKey, bucketKey))
    .limit(1);
  const row = rows[0];
  if (!row || row.windowStart < windowCutoff) {
    if (row) {
      await db
        .update(authRateLimits)
        .set({ windowStart: nowStr, count: 1 })
        .where(eq(authRateLimits.bucketKey, bucketKey));
    } else {
      await db.insert(authRateLimits).values({
        bucketKey,
        windowStart: nowStr,
        count: 1,
      });
    }
    return false;
  }
  if (row.count >= max) {
    return true;
  }
  await db
    .update(authRateLimits)
    .set({ count: row.count + 1 })
    .where(eq(authRateLimits.bucketKey, bucketKey));
  return false;
}

/** Staging/production with test auth is refused earlier by the runtime guard. */
function authRuntimeError(
  c: AppContext,
): Response | null {
  const authMode = c.env.AUTH_MODE === "firebase" ? "firebase" : "test";
  if (authMode === "test" && c.env.ENVIRONMENT !== "local") {
    return fail(
      c,
      500,
      "RUNTIME_MISCONFIGURED",
      "Test auth (AUTH_MODE=test) requires ENVIRONMENT=local. Set both in wrangler.toml [vars] or apps/api/.dev.vars.",
    );
  }
  if (authMode === "firebase" && !c.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return fail(
      c,
      503,
      "AUTH_NOT_CONFIGURED",
      "AUTH_MODE=firebase requires FIREBASE_SERVICE_ACCOUNT_JSON in .dev.vars.",
    );
  }
  return null;
}

function tokenFailure(c: AppContext, error: AuthTokenError) {
  return fail(
    c,
    authTokenErrorStatus(error),
    error,
    error === "AUTH_EXCHANGE_FAILED"
      ? "Sign-in could not be completed. Try again."
      : "Authentication provider is not configured.",
  );
}

async function findIdentityByIdentifier(
  db: ReturnType<typeof createDb>,
  identifier: ReturnType<typeof normalizeIdentifier>,
) {
  if (!identifier) {
    return null;
  }
  if (identifier.kind === "email") {
    const rows = await db
      .select()
      .from(userIdentities)
      .where(eq(userIdentities.emailNorm, identifier.value))
      .limit(1);
    return rows[0] ?? null;
  }
  const rows = await db
    .select()
    .from(userIdentities)
    .where(eq(userIdentities.mobileE164, identifier.value))
    .limit(1);
  return rows[0] ?? null;
}

authLoginRoutes.post(
  "/login",
  operation({
    tag: "Auth",
    summary: "Password login",
    description: "Email or mobile identifier with password.",
    security: "public",
    body: authLoginRequestSchema,
    response: authTokenResponseSchema,
  }),
  async (c) => {
    const configError = authRuntimeError(c);
    if (configError) {
      return configError;
    }
    const body = await c.req.json().catch(() => null);
    const parsed = authLoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid login request.");
    }
    const db = createDb(c.env.DB);
    const ip = c.req.header("CF-Connecting-IP") ?? "0.0.0.0";
    const ipHash = await sha256Hex(ip);
    if (await bumpRateLimit(db, `auth:ip:${ipHash}`, 15, 30)) {
      return fail(c, 429, "RATE_LIMITED", "Too many attempts.");
    }
    const identifier = normalizeIdentifier(parsed.data.identifier);
    if (!identifier) {
      return fail(c, GENERIC_AUTH_FAIL.status, GENERIC_AUTH_FAIL.code, GENERIC_AUTH_FAIL.message);
    }
    const identity = await findIdentityByIdentifier(db, identifier);
    if (!identity?.passwordHash) {
      return fail(c, GENERIC_AUTH_FAIL.status, GENERIC_AUTH_FAIL.code, GENERIC_AUTH_FAIL.message);
    }
    if (identity.lockedUntil && identity.lockedUntil > nowIso()) {
      return fail(c, GENERIC_AUTH_FAIL.status, GENERIC_AUTH_FAIL.code, GENERIC_AUTH_FAIL.message);
    }
    const valid = await verifyPassword(parsed.data.password, identity.passwordHash);
    if (!valid) {
      const failed = identity.failedLoginCount + 1;
      const lockedUntil =
        failed >= 10
          ? new Date(Date.now() + 15 * 60_000).toISOString()
          : identity.lockedUntil;
      await db
        .update(userIdentities)
        .set({
          failedLoginCount: failed,
          lockedUntil,
          updatedAt: nowIso(),
        })
        .where(eq(userIdentities.userId, identity.userId));
      return fail(c, GENERIC_AUTH_FAIL.status, GENERIC_AUTH_FAIL.code, GENERIC_AUTH_FAIL.message);
    }
    await db
      .update(userIdentities)
      .set({ failedLoginCount: 0, lockedUntil: null, updatedAt: nowIso() })
      .where(eq(userIdentities.userId, identity.userId));
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, identity.userId))
      .limit(1);
    if (!user) {
      return fail(c, GENERIC_AUTH_FAIL.status, GENERIC_AUTH_FAIL.code, GENERIC_AUTH_FAIL.message);
    }
    const token = await mintAuthToken(c.env, {
      firebaseUid: user.firebaseUid,
      email: identity.email ?? undefined,
    });
    if ("error" in token) {
      return tokenFailure(c, token.error);
    }
    return ok(
      c,
      authTokenResponseSchema.parse({
        ...sessionTokenFields(token),
        userId: user.id,
      }),
    );
  },
);

authLoginRoutes.post(
  "/otp/start",
  operation({
    tag: "Auth",
    summary: "Start OTP",
    description: "Send a one-time code when the identifier is known.",
    security: "public",
    body: authOtpStartRequestSchema,
    response: authOtpStartResponseSchema,
  }),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = authOtpStartRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid request.");
    }
    const db = createDb(c.env.DB);
    const identifier = normalizeIdentifier(parsed.data.identifier);
    const channels: Array<"email" | "whatsapp"> = [];
    if (identifier?.kind === "email") {
      const identity = await findIdentityByIdentifier(db, identifier);
      if (identity || parsed.data.purpose === "invite") {
        const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, "0");
        const idHash = await identifierHash(identifier.value);
        await db
          .update(authOtps)
          .set({ invalidatedAt: nowIso() })
          .where(
            and(
              eq(authOtps.identifierHash, idHash),
              eq(authOtps.purpose, parsed.data.purpose),
              isNull(authOtps.consumedAt),
              isNull(authOtps.invalidatedAt),
            ),
          );
        const codeHash = await sha256Hex(`${code}:${idHash}`);
        await db.insert(authOtps).values({
          id: createId(),
          identifierHash: idHash,
          codeHash,
          purpose: parsed.data.purpose,
          expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          attempts: 0,
          channelsSent: JSON.stringify(["email"]),
          consumedAt: null,
          invalidatedAt: null,
          createdAt: nowIso(),
          ipHash: null,
        });
        await sendSystemEmail(c.env, db, {
          to: identifier.value,
          template: "otp",
          subject: otpEmailSubject(code),
          text: otpEmailBody(code),
        });
        channels.push("email");
      }
    }
    const flags = await getFlags(c.env, db);
    // D-W1-4: outside local, OTP is email-only even when wa_otp is on.
    if (c.env.ENVIRONMENT === "local" && flags.wa_otp && identifier?.kind === "mobile") {
      channels.push("whatsapp");
    }
    return ok(
      c,
      authOtpStartResponseSchema.parse({
        sent: true,
        channels: channels.length ? channels : ["email"],
      }),
      202,
    );
  },
);

authLoginRoutes.post(
  "/otp/verify",
  operation({
    tag: "Auth",
    summary: "Verify OTP",
    description: "Verify a one-time code for login, reset, or invite.",
    security: "public",
    body: authOtpVerifyRequestSchema,
    response: authOtpVerifyResponseSchema,
  }),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = authOtpVerifyRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid request.");
    }
    const identifier = normalizeIdentifier(parsed.data.identifier);
    if (!identifier) {
      return fail(c, 401, "OTP_INVALID", "Invalid code.");
    }
    const db = createDb(c.env.DB);
    const idHash = await identifierHash(
      identifier.kind === "email" ? identifier.value : identifier.value,
    );
    const rows = await db
      .select()
      .from(authOtps)
      .where(
        and(
          eq(authOtps.identifierHash, idHash),
          eq(authOtps.purpose, parsed.data.purpose),
          isNull(authOtps.consumedAt),
          isNull(authOtps.invalidatedAt),
          gt(authOtps.expiresAt, nowIso()),
        ),
      )
      .orderBy(desc(authOtps.createdAt))
      .limit(1);
    const otp = rows[0];
    if (!otp) {
      return fail(c, 401, "OTP_INVALID", "Invalid code.");
    }
    const expected = await sha256Hex(`${parsed.data.code}:${idHash}`);
    if (expected !== otp.codeHash) {
      const attempts = otp.attempts + 1;
      await db
        .update(authOtps)
        .set({
          attempts,
          invalidatedAt: attempts >= 5 ? nowIso() : null,
        })
        .where(eq(authOtps.id, otp.id));
      return fail(c, 401, "OTP_INVALID", "Invalid code.");
    }
    await db
      .update(authOtps)
      .set({ consumedAt: nowIso() })
      .where(eq(authOtps.id, otp.id));
    if (parsed.data.purpose === "login" && identifier.kind === "email") {
      const identity = await findIdentityByIdentifier(db, identifier);
      const user = identity
        ? (
            await db.select().from(users).where(eq(users.id, identity.userId)).limit(1)
          )[0]
        : null;
      if (!user) {
        return fail(c, 401, "OTP_INVALID", "Invalid code.");
      }
      const token = await mintAuthToken(c.env, {
        firebaseUid: user.firebaseUid,
        email: identifier.value,
      });
      if ("error" in token) {
        return tokenFailure(c, token.error);
      }
      return ok(
        c,
        authOtpVerifyResponseSchema.parse({
          purpose: "login",
          ...sessionTokenFields(token),
          userId: user.id,
        }),
      );
    }
    const secret = c.env.MEDIA_SIGNING_SECRET ?? "fitbud-local-proof-secret";
    if (parsed.data.purpose === "reset") {
      const resetProof = await issuePurposeProof(secret, {
        otpId: otp.id,
        identifierHash: idHash,
        purpose: "reset",
      });
      return ok(
        c,
        authOtpVerifyResponseSchema.parse({ purpose: "reset", resetProof }),
      );
    }
    const otpProof = await issuePurposeProof(secret, {
      otpId: otp.id,
      identifierHash: idHash,
      purpose: "invite",
    });
    return ok(
      c,
      authOtpVerifyResponseSchema.parse({ purpose: "invite", otpProof }),
    );
  },
);

authLoginRoutes.post(
  "/password/reset",
  operation({
    tag: "Auth",
    summary: "Reset password with proof",
    description: "Complete a password reset using resetProof from OTP verify.",
    security: "public",
    body: authPasswordResetRequestSchema,
    response: authTokenResponseSchema,
  }),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = authPasswordResetRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid request.");
    }
    const violation = validatePasswordPlaintext(parsed.data.newPassword);
    if (violation) {
      return fail(c, 400, violation, passwordRequirementMessage(violation));
    }
    const secret = c.env.MEDIA_SIGNING_SECRET ?? "fitbud-local-proof-secret";
    const verified = await verifyPurposeProof(secret, parsed.data.resetProof, "reset");
    if (!verified) {
      return fail(c, 401, "RESET_PROOF_INVALID", "Reset proof is invalid or expired.");
    }
    const db = createDb(c.env.DB);
    const [otp] = await db
      .select()
      .from(authOtps)
      .where(eq(authOtps.id, verified.otpId))
      .limit(1);
    if (
      !otp ||
      otp.purpose !== "reset" ||
      otp.identifierHash !== verified.identifierHash ||
      !otp.consumedAt
    ) {
      return fail(c, 401, "RESET_PROOF_INVALID", "Reset proof is invalid or expired.");
    }
    const identity = await findIdentityByIdentifierHash(db, verified.identifierHash);
    if (!identity) {
      return fail(c, 401, "RESET_PROOF_INVALID", "Reset proof is invalid or expired.");
    }
    const passwordHash = await hashPassword(parsed.data.newPassword);
    const timestamp = nowIso();
    await db
      .update(userIdentities)
      .set({
        passwordHash,
        passwordUpdatedAt: timestamp,
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: timestamp,
      })
      .where(eq(userIdentities.userId, identity.userId));
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, identity.userId))
      .limit(1);
    if (!user) {
      return fail(c, 401, "RESET_PROOF_INVALID", "Reset proof is invalid or expired.");
    }
    if (identity.email) {
      await sendSystemEmail(c.env, db, {
        to: identity.email,
        template: "password_changed",
        subject: passwordChangedEmailSubject(),
        text: passwordChangedEmailBody(),
      });
    }
    const token = await mintAuthToken(c.env, {
      firebaseUid: user.firebaseUid,
      email: identity.email ?? undefined,
    });
    if ("error" in token) {
      return tokenFailure(c, token.error);
    }
    return ok(
      c,
      authTokenResponseSchema.parse({
        ...sessionTokenFields(token),
        userId: user.id,
      }),
    );
  },
);

authLoginRoutes.post(
  "/password/set",
  operation({
    tag: "Auth",
    summary: "Set password",
    description: "Set or change the signed-in user's password.",
    body: authPasswordSetRequestSchema,
    response: authTokenResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const body = await c.req.json().catch(() => null);
    const parsed = authPasswordSetRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid request.");
    }
    const violation = validatePasswordPlaintext(parsed.data.newPassword);
    if (violation) {
      return fail(c, 400, violation, passwordRequirementMessage(violation));
    }
    const db = createDb(c.env.DB);
    const [identity] = await db
      .select()
      .from(userIdentities)
      .where(eq(userIdentities.userId, actor.userId))
      .limit(1);
    if (identity?.passwordHash && !parsed.data.currentPassword) {
      return fail(c, 400, "CURRENT_PASSWORD_REQUIRED", "Current password is required.");
    }
    if (
      identity?.passwordHash &&
      parsed.data.currentPassword &&
      !(await verifyPassword(parsed.data.currentPassword, identity.passwordHash))
    ) {
      return fail(c, 401, "INVALID_CREDENTIALS", "Invalid credentials.");
    }
    const passwordHash = await hashPassword(parsed.data.newPassword);
    const timestamp = nowIso();
    if (identity) {
      await db
        .update(userIdentities)
        .set({
          passwordHash,
          passwordUpdatedAt: timestamp,
          updatedAt: timestamp,
        })
        .where(eq(userIdentities.userId, actor.userId));
    } else {
      await db.insert(userIdentities).values({
        userId: actor.userId,
        email: null,
        emailNorm: null,
        mobileE164: null,
        passwordHash,
        passwordUpdatedAt: timestamp,
        failedLoginCount: 0,
        lockedUntil: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    if (identity?.email) {
      await sendSystemEmail(c.env, db, {
        to: identity.email,
        template: "password_changed",
        subject: passwordChangedEmailSubject(),
        text: passwordChangedEmailBody(),
      });
    }
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1);
    const token = await mintAuthToken(c.env, {
      firebaseUid: user!.firebaseUid,
      email: identity?.email ?? undefined,
    });
    if ("error" in token) {
      return tokenFailure(c, token.error);
    }
    return ok(
      c,
      authTokenResponseSchema.parse({
        ...sessionTokenFields(token),
        userId: actor.userId,
      }),
    );
  },
);

authLoginRoutes.post(
  "/refresh",
  operation({
    tag: "Auth",
    summary: "Refresh session token",
    description:
      "Exchanges a Firebase refresh token for a new ID token. The response carries the rotated refresh token. Firebase mode only.",
    security: "public",
    body: authRefreshRequestSchema,
    response: authRefreshResponseSchema,
  }),
  async (c) => {
    if (c.env.AUTH_MODE !== "firebase") {
      return fail(
        c,
        400,
        "REFRESH_NOT_SUPPORTED",
        "Token refresh is only available with Firebase sign-in.",
      );
    }
    const apiKey = c.env.FIREBASE_WEB_API_KEY;
    if (!apiKey) {
      return fail(
        c,
        503,
        "AUTH_PROVIDER_NOT_CONFIGURED",
        "Authentication provider is not configured.",
      );
    }
    const body = await c.req.json().catch(() => null);
    const parsed = authRefreshRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid refresh request.");
    }
    const db = createDb(c.env.DB);
    const ip = c.req.header("CF-Connecting-IP") ?? "0.0.0.0";
    const ipHash = await sha256Hex(ip);
    if (await bumpRateLimit(db, `auth:refresh:ip:${ipHash}`, 15, 15)) {
      return fail(c, 429, "RATE_LIMITED", "Too many attempts.");
    }
    const refreshed = await refreshIdToken(apiKey, parsed.data.refreshToken);
    if (!refreshed.ok) {
      return fail(c, 401, "AUTH_REFRESH_FAILED", "Session expired. Sign in again.");
    }
    return ok(
      c,
      authRefreshResponseSchema.parse({
        token: refreshed.idToken,
        tokenKind: "firebase_id_token",
        refreshToken: refreshed.refreshToken,
        expiresIn: refreshed.expiresIn,
      }),
    );
  },
);
