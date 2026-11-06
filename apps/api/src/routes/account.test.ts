import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import { hashPassword } from "../auth/password.js";
import { createWebSession } from "../auth/identity.js";
import { addCalendarMonthsUtc } from "../domain/account-deletion.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import type { Env } from "../types.js";

/**
 * Z6-14: account deletion (archive for 6 months), the archived-actor middleware,
 * status and reactivation, through the production routes on persisted data.
 */

function dummyD1(): D1Database {
  return {
    prepare() {
      throw new Error("D1 should not be used when test DB override is set");
    },
    dump: async () => new ArrayBuffer(0),
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

function testEnv(): Env {
  return {
    DB: dummyD1(),
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    ENVIRONMENT: "local",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    EMAIL_PROVIDER: "dev_sink",
  };
}

const PASSWORD = "Strong-pass-2026";
const nowSeconds = () => Math.floor(Date.now() / 1000);

type Json = Record<string, unknown> & {
  data?: Record<string, unknown>;
  error?: { code: string; message: string; details?: Record<string, unknown> };
};

async function call(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: Json }> {
  const response = await app.request(
    path,
    {
      method: init.method ?? "GET",
      headers: {
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    },
    testEnv(),
  );
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as Json) : {} };
}

async function trainerSession(email: string) {
  const response = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken: createTestIdToken(`trainer-${email}`, email, nowSeconds()),
        timezone: "Asia/Kolkata",
      }),
    },
    testEnv(),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: { userId: string } };
  return {
    userId: body.data.userId,
    email,
    headers: { Cookie: response.headers.get("set-cookie")!.split(";")[0]! },
  };
}

async function invite(trainer: { headers: Record<string, string> }, email: string) {
  const created = await call("/invitations", {
    method: "POST",
    headers: { ...trainer.headers, "Idempotency-Key": `inv-${email}` },
    body: { recipientEmail: email, recipientDisplayName: "Priya Sharma" },
  });
  expect(created.status).toBe(200);
  return created.body.data!.token as string;
}

function bearer(uid: string, email: string, authTime?: number) {
  return {
    Authorization: `Bearer ${createTestIdToken(uid, email, authTime)}`,
    "x-fitbud-role": "trainee",
  };
}

/** A trainee coached by `trainer`, with a password identity, a device token and a web session row. */
async function coachedTrainee(
  db: Db,
  trainer: { headers: Record<string, string> },
  slug: string,
) {
  const email = `priya.${slug}@example.com`;
  const uid = `trainee-${slug}`;
  const inviteToken = await invite(trainer, email);
  const accepted = await call("/invitations/accept", {
    method: "POST",
    headers: bearer(uid, email, nowSeconds()),
    body: { token: inviteToken, timezone: "Asia/Kolkata" },
  });
  expect(accepted.status).toBe(200);
  const relationshipId = (accepted.body.data!.relationship as { id: string }).id;
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.firebaseUid, uid))
    .limit(1);
  const timestamp = new Date().toISOString();
  // Real trainees sign in with email + password (the invite password path).
  await db.insert(schema.userIdentities).values({
    userId: user!.id,
    email,
    emailNorm: email,
    mobileE164: null,
    passwordHash: await hashPassword(PASSWORD),
    passwordUpdatedAt: timestamp,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  const device = await call("/notifications/device-tokens", {
    method: "POST",
    headers: bearer(uid, email, nowSeconds()),
    body: {
      token: `ExponentPushToken[${slug}-device]`,
      platform: "ios",
      provider: "expo",
      installationId: `install-${slug}`,
    },
  });
  expect(device.status).toBe(200);
  await createWebSession(db, user!.id);
  return { userId: user!.id, uid, email, relationshipId };
}

async function signIn(email: string) {
  const login = await call("/auth/login", {
    method: "POST",
    body: { identifier: email, password: PASSWORD },
  });
  expect(login.status).toBe(200);
  return {
    Authorization: `Bearer ${login.body.data!.token as string}`,
    "x-fitbud-role": "trainee",
  };
}

function openExceptions(relationshipId: string, prefix: string) {
  const at = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const base = {
    coachingRelationshipId: relationshipId,
    ruleVersion: "test-v1",
    detailsJson: null,
    detectedAt: at,
    activatedAt: at,
    acknowledgedAt: null,
    resolvedAt: null,
    resolutionOutcome: null,
    resolutionNote: null,
    closedReason: null,
    sourceLoggedLateAt: null,
    createdAt: at,
    updatedAt: at,
    severity: "attention",
  } as const;
  return [
    {
      ...base,
      id: `${prefix}-0001-4000-8000-000000000001`,
      type: "missed_workout",
      status: "active",
      sourceEntityType: "workout_assignment",
      sourceEntityId: `${prefix}-0002-4000-8000-000000000001`,
      summary: "Missed Tuesday's workout",
    },
    {
      ...base,
      id: `${prefix}-0001-4000-8000-000000000002`,
      type: "overdue_meal",
      status: "detected",
      activatedAt: null,
      sourceEntityType: "meal_assignment",
      sourceEntityId: `${prefix}-0002-4000-8000-000000000002`,
      summary: "Lunch not logged",
    },
  ] as const;
}

async function userRow(db: Db, userId: string) {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  return row!;
}

describe("account deletion, archived access and reactivation (Z6-14)", () => {
  let db: Db;
  let close: () => void;

  beforeEach(async () => {
    const handle = await createMemoryDb();
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    close();
    vi.restoreAllMocks();
  });

  it("archives a trainee with a fresh sign-in: ends coaching, closes exceptions, revokes sessions and device tokens", async () => {
    const trainer = await trainerSession("arjun.coach@example.com");
    const trainee = await coachedTrainee(db, trainer, "archive");
    await db.insert(schema.exceptions).values([...openExceptions(trainee.relationshipId, "aaaaaaaa")]);

    const deleted = await call("/account/deletion", {
      method: "POST",
      headers: await signIn(trainee.email),
    });
    expect(deleted.status).toBe(200);
    const data = deleted.body.data as { accountState: string; archivedAt: string; purgeAfter: string };
    expect(data.accountState).toBe("archived");
    expect(data.purgeAfter).toBe(addCalendarMonthsUtc(data.archivedAt, 6));

    const user = await userRow(db, trainee.userId);
    expect(user.accountState).toBe("archived");
    expect(user.archivedAt).toBe(data.archivedAt);
    expect(user.purgeAfter).toBe(data.purgeAfter);

    const [relationship] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, trainee.relationshipId));
    expect(relationship!.status).toBe("ended");
    expect(relationship!.endedByUserId).toBe(trainee.userId);

    const exceptions = await db
      .select()
      .from(schema.exceptions)
      .where(eq(schema.exceptions.coachingRelationshipId, trainee.relationshipId));
    expect(exceptions).toHaveLength(2);
    for (const exception of exceptions) {
      expect(exception.status).toBe("resolved");
      expect(exception.closedReason).toBe("coaching_ended");
      // The source signal is kept.
      expect(exception.sourceEntityId).toMatch(/^aaaaaaaa-0002/);
    }

    // Revoked, not deleted (notification_deliveries references device tokens).
    const tokens = await db
      .select()
      .from(schema.deviceTokens)
      .where(eq(schema.deviceTokens.userId, trainee.userId));
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.status).toBe("revoked");
    const sessions = await db
      .select()
      .from(schema.webSessions)
      .where(eq(schema.webSessions.userId, trainee.userId));
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((session) => session.revokedAt === data.archivedAt)).toBe(true);

    // Data is kept: the identity and profile are untouched.
    const identities = await db
      .select()
      .from(schema.userIdentities)
      .where(eq(schema.userIdentities.userId, trainee.userId));
    expect(identities[0]!.email).toBe(trainee.email);
  });

  it("refuses deletion without a sign-in in the last 5 minutes and changes nothing", async () => {
    const trainer = await trainerSession("meera.coach@example.com");
    const trainee = await coachedTrainee(db, trainer, "stale");

    for (const headers of [
      bearer(trainee.uid, trainee.email, nowSeconds() - 6 * 60),
      bearer(trainee.uid, trainee.email),
    ]) {
      const refused = await call("/account/deletion", { method: "POST", headers });
      expect(refused.status).toBe(403);
      expect(refused.body.error).toMatchObject({
        code: "RECENT_SIGN_IN_REQUIRED",
        message: "Sign in again, then delete your account within 5 minutes.",
      });
    }
    expect((await userRow(db, trainee.userId)).accountState).toBe("active");
    const [relationship] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, trainee.relationshipId));
    expect(relationship!.status).toBe("active");

    // A sign-in 4 minutes ago is fresh.
    const fresh = await call("/account/deletion", {
      method: "POST",
      headers: bearer(trainee.uid, trainee.email, nowSeconds() - 4 * 60),
    });
    expect(fresh.status).toBe(200);
  });

  it("uses the web session's issue time as the sign-in time", async () => {
    const trainer = await trainerSession("kabir.coach@example.com");
    const old = new Date(Date.now() - 6 * 60_000).toISOString();
    await db
      .update(schema.webSessions)
      .set({ createdAt: old })
      .where(eq(schema.webSessions.userId, trainer.userId));
    const stale = await call("/account/deletion", { method: "POST", headers: trainer.headers });
    expect(stale.status).toBe(403);
    expect(stale.body.error!.code).toBe("RECENT_SIGN_IN_REQUIRED");

    const fresh = await trainerSession("kabir.coach@example.com");
    const deleted = await call("/account/deletion", { method: "POST", headers: fresh.headers });
    expect(deleted.status).toBe(200);
    // Every browser is signed out, including the session that asked.
    expect((await call("/me", { headers: fresh.headers })).status).toBe(401);
    expect((await call("/me", { headers: trainer.headers })).status).toBe(401);
  });

  it("blocks a trainer with active clients (409 ACTIVE_CLIENTS) until coaching is ended", async () => {
    const trainer = await trainerSession("nikhil.coach@example.com");
    const trainee = await coachedTrainee(db, trainer, "client");

    const blocked = await call("/account/deletion", { method: "POST", headers: trainer.headers });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatchObject({
      code: "ACTIVE_CLIENTS",
      message: "End coaching with your clients first.",
    });
    expect(blocked.body.error!.details).toBeUndefined();
    expect((await userRow(db, trainer.userId)).accountState).toBe("active");
    const [session] = await db
      .select()
      .from(schema.webSessions)
      .where(eq(schema.webSessions.userId, trainer.userId));
    expect(session!.revokedAt).toBeNull();

    const ended = await call(`/relationships/${trainee.relationshipId}/end`, {
      method: "POST",
      headers: trainer.headers,
      body: {},
    });
    expect(ended.status).toBe(200);
    const deleted = await call("/account/deletion", { method: "POST", headers: trainer.headers });
    expect(deleted.status).toBe(200);
  });

  it("lets an archived user sign in on mobile and see status, and blocks every other route with 403 ACCOUNT_ARCHIVED", async () => {
    const trainer = await trainerSession("sana.coach@example.com");
    const trainee = await coachedTrainee(db, trainer, "blocked");
    const deleted = await call("/account/deletion", {
      method: "POST",
      headers: await signIn(trainee.email),
    });
    const { purgeAfter, archivedAt } = deleted.body.data as {
      purgeAfter: string;
      archivedAt: string;
    };

    const headers = await signIn(trainee.email);
    const status = await call("/account/status", { headers });
    expect(status.status).toBe(200);
    expect(status.body.data).toEqual({ accountState: "archived", archivedAt, purgeAfter });

    const expectArchived = (result: { status: number; body: Json }) => {
      expect(result.status).toBe(403);
      expect(result.body.error).toMatchObject({
        code: "ACCOUNT_ARCHIVED",
        message: "This account is deleted. Sign in again and bring it back to continue.",
        details: { accountState: "archived", purgeAfter },
      });
    };
    expectArchived(await call("/me", { headers }));
    expectArchived(await call("/me/trainee-profile", { headers }));
    // A write route.
    expectArchived(
      await call("/notifications/device-tokens", {
        method: "POST",
        headers,
        body: {
          token: "ExponentPushToken[after-archive]",
          platform: "ios",
          provider: "expo",
          installationId: "install-after",
        },
      }),
    );
    // A route that does not use requireAuthMiddleware.
    expectArchived(
      await call(`/realtime/relationships/${trainee.relationshipId}/connection`, { headers }),
    );
    // A role-selected request is refused the same way.
    expectArchived(await call("/sync/pull", { headers: { ...headers, "x-fitbud-role": "trainee" } }));
    // Retrying the deletion is idempotent: same purge date, nothing restamped.
    expectArchived(await call("/account/deletion", { method: "POST", headers }));
    const user = await userRow(db, trainee.userId);
    expect(user.archivedAt).toBe(archivedAt);
    expect(user.purgeAfter).toBe(purgeAfter);
    // No device token was registered while archived.
    const tokens = await db
      .select()
      .from(schema.deviceTokens)
      .where(eq(schema.deviceTokens.userId, trainee.userId));
    expect(tokens.map((token) => token.status)).toEqual(["revoked"]);
  });

  it("reactivates after a new sign-in, clears both dates and keeps coaching ended", async () => {
    const trainer = await trainerSession("dev.coach@example.com");
    const trainee = await coachedTrainee(db, trainer, "react");
    const signedInEarlier = bearer(trainee.uid, trainee.email, nowSeconds() - 60);
    await call("/account/deletion", { method: "POST", headers: await signIn(trainee.email) });

    // A credential from before the deletion is not "signing in again".
    const early = await call("/account/reactivation", { method: "POST", headers: signedInEarlier });
    expect(early.status).toBe(403);
    expect(early.body.error!.code).toBe("RECENT_SIGN_IN_REQUIRED");
    expect((await userRow(db, trainee.userId)).accountState).toBe("archived");

    const headers = await signIn(trainee.email);
    const reactivated = await call("/account/reactivation", { method: "POST", headers });
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.data).toEqual({ accountState: "active" });
    const user = await userRow(db, trainee.userId);
    expect(user.accountState).toBe("active");
    expect(user.archivedAt).toBeNull();
    expect(user.purgeAfter).toBeNull();

    const [relationship] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, trainee.relationshipId));
    expect(relationship!.status).toBe("ended");
    expect((await call("/me", { headers })).status).toBe(200);
    expect((await call("/account/status", { headers })).body.data).toEqual({
      accountState: "active",
      archivedAt: null,
      purgeAfter: null,
    });
    // Repeating the confirm is harmless.
    expect((await call("/account/reactivation", { method: "POST", headers })).status).toBe(200);
  });

  it("refuses reactivation once purge_after has passed (support's delete-now step)", async () => {
    const trainer = await trainerSession("ira.coach@example.com");
    const trainee = await coachedTrainee(db, trainer, "purgedue");
    await call("/account/deletion", { method: "POST", headers: await signIn(trainee.email) });
    // The runbook sets purge_after to now; the account then waits for the purge.
    await db
      .update(schema.users)
      .set({ purgeAfter: new Date(Date.now() - 1000).toISOString() })
      .where(eq(schema.users.id, trainee.userId));

    const headers = await signIn(trainee.email);
    const refused = await call("/account/reactivation", { method: "POST", headers });
    expect(refused.status).toBe(410);
    expect(refused.body.error).toMatchObject({
      code: "ACCOUNT_DELETED",
      message: "This account has been deleted.",
    });
    expect((await userRow(db, trainee.userId)).accountState).toBe("archived");
  });

  it("issues a web session to an archived trainer, limited to status and reactivation", async () => {
    const trainer = await trainerSession("rohan.coach@example.com");
    await call("/account/deletion", { method: "POST", headers: trainer.headers });

    const again = await trainerSession("rohan.coach@example.com");
    expect(again.userId).toBe(trainer.userId);
    const status = await call("/account/status", { headers: again.headers });
    expect(status.status).toBe(200);
    expect((status.body.data as { accountState: string }).accountState).toBe("archived");
    for (const blocked of [
      await call("/clients", { headers: again.headers }),
      await call("/me", { headers: again.headers }),
      await call("/invitations", {
        method: "POST",
        headers: { ...again.headers, "Idempotency-Key": "archived-invite" },
        body: { recipientEmail: "new.client@example.com" },
      }),
    ]) {
      expect(blocked.status).toBe(403);
      expect(blocked.body.error!.code).toBe("ACCOUNT_ARCHIVED");
    }
    // Nothing was provisioned on the archived account by signing in.
    const roles = await db
      .select()
      .from(schema.userRoles)
      .where(eq(schema.userRoles.userId, trainer.userId));
    expect(roles.map((role) => role.role)).toEqual(["trainer"]);

    const reactivated = await call("/account/reactivation", {
      method: "POST",
      headers: again.headers,
    });
    expect(reactivated.status).toBe(200);
    expect((await call("/me", { headers: again.headers })).status).toBe(200);
  });

  it("refuses inviting an archived account and accepting as, or from, one", async () => {
    const trainerA = await trainerSession("tara.coach@example.com");
    const trainerB = await trainerSession("vikram.coach@example.com");
    const trainee = await coachedTrainee(db, trainerA, "invites");
    const pendingFromB = await invite(trainerB, trainee.email);
    await call("/account/deletion", { method: "POST", headers: await signIn(trainee.email) });

    const trainerD = await trainerSession("dia.coach@example.com");
    const create = await call("/invitations", {
      method: "POST",
      headers: { ...trainerD.headers, "Idempotency-Key": "inv-archived-again" },
      body: { recipientEmail: trainee.email.toUpperCase() },
    });
    expect(create.status).toBe(409);
    expect(create.body.error).toEqual({
      code: "RECIPIENT_UNAVAILABLE",
      message: "This person can't be invited right now.",
      requestId: expect.any(String),
    });

    const accept = await call("/invitations/accept", {
      method: "POST",
      headers: await signIn(trainee.email),
      body: { token: pendingFromB },
    });
    expect(accept.status).toBe(409);
    expect(accept.body.error).toMatchObject({
      code: "INVITATION_UNAVAILABLE",
      message: "This invitation can't be accepted right now.",
    });
    const relationships = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.traineeUserId, trainee.userId));
    expect(relationships).toHaveLength(1);

    // An invitation from a trainer who has since deleted their account.
    const trainerC = await trainerSession("leela.coach@example.com");
    const fromC = await invite(trainerC, "new.person@example.com");
    expect((await call("/account/deletion", { method: "POST", headers: trainerC.headers })).status).toBe(200);
    const acceptFromArchived = await call("/invitations/accept", {
      method: "POST",
      headers: bearer("new-person", "new.person@example.com", nowSeconds()),
      body: { token: fromC },
    });
    expect(acceptFromArchived.status).toBe(409);
    expect(acceptFromArchived.body.error!.code).toBe("INVITATION_UNAVAILABLE");
    const trainerCClients = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.trainerUserId, trainerC.userId));
    expect(trainerCClients).toHaveLength(0);
  });

  it("refuses the new-account invite path (password + code) for an archived trainee or trainer", async () => {
    async function inviteProof(email: string) {
      await call("/auth/otp/start", { method: "POST", body: { identifier: email, purpose: "invite" } });
      const mail = await call(`/dev/mail?to=${encodeURIComponent(email)}&limit=1`);
      const items = (mail.body.data as { items: Array<{ textBody: string }> }).items;
      const code = items[0]?.textBody.match(/\b(\d{6})\b/)?.[1];
      expect(code).toBeTruthy();
      const verify = await call("/auth/otp/verify", {
        method: "POST",
        body: { identifier: email, purpose: "invite", code },
      });
      expect(verify.status).toBe(200);
      return verify.body.data!.otpProof as string;
    }

    const trainerA = await trainerSession("uma.coach@example.com");
    const trainerB = await trainerSession("yash.coach@example.com");
    const trainee = await coachedTrainee(db, trainerA, "newpath");
    const pendingFromB = await invite(trainerB, trainee.email);
    await call("/account/deletion", { method: "POST", headers: await signIn(trainee.email) });
    const asArchived = await call("/invitations/accept", {
      method: "POST",
      body: {
        token: pendingFromB,
        password: "Another-pass-2026",
        otpProof: await inviteProof(trainee.email),
      },
    });
    expect(asArchived.status).toBe(409);
    expect(asArchived.body.error!.code).toBe("INVITATION_UNAVAILABLE");

    const fromArchived = await invite(trainerB, "fresh.person@example.com");
    expect(
      (await call("/relationships/" + trainee.relationshipId, { headers: trainerA.headers })).status,
    ).toBe(200);
    const trainerBActive = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.trainerUserId, trainerB.userId));
    expect(trainerBActive).toHaveLength(0);
    expect((await call("/account/deletion", { method: "POST", headers: trainerB.headers })).status).toBe(200);
    const fromArchivedTrainer = await call("/invitations/accept", {
      method: "POST",
      body: {
        token: fromArchived,
        password: "Fresh-pass-2026",
        otpProof: await inviteProof("fresh.person@example.com"),
      },
    });
    expect(fromArchivedTrainer.status).toBe(409);
    expect(fromArchivedTrainer.body.error!.code).toBe("INVITATION_UNAVAILABLE");
    const created = await db
      .select()
      .from(schema.userIdentities)
      .where(eq(schema.userIdentities.emailNorm, "fresh.person@example.com"));
    expect(created).toHaveLength(0);
  });

  it("keeps the ended relationship and its history readable for the trainer", async () => {
    const trainer = await trainerSession("anil.coach@example.com");
    const trainee = await coachedTrainee(db, trainer, "history");
    const rows = openExceptions(trainee.relationshipId, "bbbbbbbb");
    await db.insert(schema.exceptions).values([...rows]);
    await call("/account/deletion", { method: "POST", headers: await signIn(trainee.email) });

    const relationship = await call(`/relationships/${trainee.relationshipId}`, {
      headers: trainer.headers,
    });
    expect(relationship.status).toBe(200);
    expect((relationship.body.data as { status: string }).status).toBe("ended");
    const exception = await call(`/exceptions/${rows[0].id}`, { headers: trainer.headers });
    expect(exception.status).toBe(200);
    expect(exception.body.data).toMatchObject({ id: rows[0].id, status: "resolved" });
    const history = await call(`/history/relationships/${trainee.relationshipId}`, {
      headers: trainer.headers,
    });
    expect(history.status).toBe(200);
    // The trainer's own account and its other routes are unaffected.
    expect((await call("/me", { headers: trainer.headers })).status).toBe(200);
  });

  /** Trainer ends coaching, then asks the trainee to come back (D-W6-35 setup). */
  async function endAndRequestReactivation(
    trainer: { headers: Record<string, string> },
    relationshipId: string,
  ) {
    const ended = await call(`/relationships/${relationshipId}/end`, {
      method: "POST",
      headers: trainer.headers,
      body: {},
    });
    expect(ended.status).toBe(200);
    const requested = await call(`/relationships/${relationshipId}/reactivate`, {
      method: "POST",
      headers: trainer.headers,
      body: {},
    });
    expect(requested.status).toBe(200);
    expect(requested.body.data).toMatchObject({ status: "pending" });
    return requested.body.data!.requestId as string;
  }

  async function expectNoReactivation(
    relationshipId: string,
    requestId: string,
    archivedAt: string,
    traineeHeaders: Record<string, string>,
  ) {
    const [request] = await db
      .select()
      .from(schema.reactivationRequests)
      .where(eq(schema.reactivationRequests.id, requestId));
    expect(request!.status).toBe("cancelled");
    expect(request!.resolvedAt).toBe(archivedAt);

    const confirmed = await call(`/relationships/${relationshipId}/reactivate/confirm`, {
      method: "POST",
      headers: traineeHeaders,
    });
    expect(confirmed.status).toBe(404);
    expect(confirmed.body.error).toMatchObject({
      code: "REACTIVATION_NOT_FOUND",
      message: "No pending reactivation request.",
    });
    const [relationship] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, relationshipId));
    expect(relationship!.status).toBe("ended");
  }

  it("cancels a pending reactivation request when the trainer deletes their account (D-W6-35)", async () => {
    const trainer = await trainerSession("farah.coach@example.com");
    const trainee = await coachedTrainee(db, trainer, "trainergone");
    const requestId = await endAndRequestReactivation(trainer, trainee.relationshipId);

    const deleted = await call("/account/deletion", { method: "POST", headers: trainer.headers });
    expect(deleted.status).toBe(200);
    const { archivedAt } = deleted.body.data as { archivedAt: string };

    await expectNoReactivation(
      trainee.relationshipId,
      requestId,
      archivedAt,
      await signIn(trainee.email),
    );
  });

  it("cancels a pending reactivation request when the trainee deletes their account, even after they bring it back (D-W6-35)", async () => {
    const trainer = await trainerSession("gautam.coach@example.com");
    const trainee = await coachedTrainee(db, trainer, "traineegone");
    const requestId = await endAndRequestReactivation(trainer, trainee.relationshipId);

    const deleted = await call("/account/deletion", {
      method: "POST",
      headers: await signIn(trainee.email),
    });
    expect(deleted.status).toBe(200);
    const { archivedAt } = deleted.body.data as { archivedAt: string };

    const headers = await signIn(trainee.email);
    expect((await call("/account/reactivation", { method: "POST", headers })).status).toBe(200);
    await expectNoReactivation(trainee.relationshipId, requestId, archivedAt, headers);
  });

  it("lets an archived web user sign out, revoking the cookie session, and nothing else (D-W6-35)", async () => {
    const trainer = await trainerSession("hema.coach@example.com");
    await call("/account/deletion", { method: "POST", headers: trainer.headers });
    const again = await trainerSession("hema.coach@example.com");

    const blocked = await call("/clients", { headers: again.headers });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error!.code).toBe("ACCOUNT_ARCHIVED");

    const signedOut = await app.request(
      "/auth/session",
      { method: "DELETE", headers: again.headers },
      testEnv(),
    );
    expect(signedOut.status).toBe(200);
    expect(await signedOut.json()).toMatchObject({ data: { ended: true } });
    expect(signedOut.headers.get("set-cookie")).toMatch(/fitbud_session=;/);
    const sessions = await db
      .select()
      .from(schema.webSessions)
      .where(eq(schema.webSessions.userId, trainer.userId));
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);
    // The revoked cookie no longer resolves an actor.
    expect((await call("/account/status", { headers: again.headers })).status).toBe(401);

    // Only the exact method and path are allowed: everything else stays 403.
    const third = await trainerSession("hema.coach@example.com");
    for (const result of [
      await call("/me", { headers: third.headers }),
      await call("/clients", { headers: third.headers }),
      await call("/account/deletion", { method: "POST", headers: third.headers }),
      await call("/invitations", {
        method: "POST",
        headers: { ...third.headers, "Idempotency-Key": "archived-signout-invite" },
        body: { recipientEmail: "someone.new@example.com" },
      }),
    ]) {
      expect(result.status).toBe(403);
      expect(result.body.error!.code).toBe("ACCOUNT_ARCHIVED");
    }
  });

  it("archives once when two deletes arrive together: one 200, one 403, dates not restamped (D-W6-35)", async () => {
    const trainer = await trainerSession("ishaan.coach@example.com");
    // Hold each archive batch until both requests have reached it, then run them
    // one after the other, as D1 would.
    const realBatch = db.batch.bind(db);
    let arrived = 0;
    let release!: () => void;
    const bothArrived = new Promise<void>((resolve) => {
      release = resolve;
    });
    let chain: Promise<unknown> = Promise.resolve();
    vi.spyOn(db, "batch").mockImplementation((async (queries: Parameters<typeof db.batch>[0]) => {
      arrived += 1;
      if (arrived === 2) release();
      await bothArrived;
      const run = chain.then(() => realBatch(queries));
      chain = run.catch(() => undefined);
      return run;
    }) as unknown as typeof db.batch);
    const lines: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });

    const results = await Promise.all([
      call("/account/deletion", { method: "POST", headers: trainer.headers }),
      call("/account/deletion", { method: "POST", headers: trainer.headers }),
    ]);
    expect(arrived).toBe(2);
    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual([200, 403]);
    const winner = results.find((result) => result.status === 200)!;
    const loser = results.find((result) => result.status === 403)!;
    const { archivedAt, purgeAfter } = winner.body.data as {
      archivedAt: string;
      purgeAfter: string;
    };
    // The static archived body only: no internal error, ids or request data.
    expect(loser.body.error).toEqual({
      code: "ACCOUNT_ARCHIVED",
      message: "This account is deleted. Sign in again and bring it back to continue.",
      details: { accountState: "archived", purgeAfter },
      requestId: expect.any(String),
    });
    const user = await userRow(db, trainer.userId);
    expect(user.accountState).toBe("archived");
    expect(user.archivedAt).toBe(archivedAt);
    expect(user.purgeAfter).toBe(purgeAfter);
    expect(lines).toEqual([]);
  });

  it("logs no personal data while deleting and reactivating", async () => {
    const lines: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });
    }
    const trainer = await trainerSession("zoya.coach@example.com");
    const trainee = await coachedTrainee(db, trainer, "logs");
    const signInHeaders = await signIn(trainee.email);
    await call("/account/deletion", { method: "POST", headers: signInHeaders });
    await call("/me", { headers: signInHeaders });
    await call("/account/reactivation", { method: "POST", headers: await signIn(trainee.email) });

    const output = lines.join("\n");
    expect(output).toContain("account.archive");
    expect(output).toContain("account.reactivate");
    for (const forbidden of [
      trainee.email,
      trainee.uid,
      "Priya",
      PASSWORD,
      signInHeaders.Authorization.slice("Bearer ".length),
      trainer.email,
    ]) {
      expect(output).not.toContain(forbidden);
    }
  });
});
