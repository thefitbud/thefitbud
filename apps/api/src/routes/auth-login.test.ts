import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../auth/password.js";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createId, nowIso } from "../lib/crypto.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import * as schema from "../db/schema.js";
import type { Env } from "../types.js";
import { createMemoryDb } from "../test-support/memory-db.js";

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

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: dummyD1(),
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    ENVIRONMENT: "local",
    EMAIL_PROVIDER: "dev_sink",
    ...overrides,
  };
}

async function seedPasswordUser(
  db: Db,
  email: string,
  password: string,
  options?: { failedLoginCount?: number; lockedUntil?: string | null },
) {
  const userId = createId();
  const timestamp = nowIso();
  const passwordHash = await hashPassword(password);
  await db.insert(schema.users).values({
    id: userId,
    firebaseUid: `login-${email}`,
    accountState: "active",
    timezone: "UTC",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db.insert(schema.userIdentities).values({
    userId,
    email,
    emailNorm: email.toLowerCase(),
    mobileE164: null,
    passwordHash,
    passwordUpdatedAt: timestamp,
    failedLoginCount: options?.failedLoginCount ?? 0,
    lockedUntil: options?.lockedUntil ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db.insert(schema.userRoles).values({
    id: createId(),
    userId,
    role: "trainee",
    createdAt: timestamp,
  });
  await db.insert(schema.traineeProfiles).values({
    id: createId(),
    userId,
    displayName: "Test Trainee",
    dateOfBirth: null,
    gender: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return { userId, email };
}

describe("auth login routes", () => {
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
  });

  it("logs in with a valid password", async () => {
    const password = "Str0ng-enough";
    await seedPasswordUser(db, "login-ok@example.com", password);
    const response = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: "login-ok@example.com",
          password,
        }),
      },
      testEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { token: string; userId: string } };
    expect(body.data.token).toBeTruthy();
    expect(body.data.userId).toBeTruthy();
  });

  it("returns generic 401 for an unknown user", async () => {
    const response = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: "missing@example.com",
          password: "whatever-12",
        }),
      },
      testEnv(),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("locks the account after ten failed attempts", async () => {
    const password = "Str0ng-enough";
    const { email } = await seedPasswordUser(db, "lock@example.com", password);
    for (let i = 0; i < 10; i += 1) {
      const attempt = await app.request(
        "/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: email, password: "wrong-pass1" }),
        },
        testEnv(),
      );
      expect(attempt.status).toBe(401);
    }
    const locked = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: email, password }),
      },
      testEnv(),
    );
    expect(locked.status).toBe(401);
    const rows = await db
      .select()
      .from(schema.userIdentities)
      .where(eq(schema.userIdentities.emailNorm, email.toLowerCase()));
    expect(rows[0]?.failedLoginCount).toBeGreaterThanOrEqual(10);
    expect(rows[0]?.lockedUntil).toBeTruthy();
  });

  it("rate limits by IP after thirty attempts", async () => {
    const password = "Str0ng-enough";
    await seedPasswordUser(db, "rate@example.com", password);
    let saw429 = false;
    for (let i = 0; i < 35; i += 1) {
      const response = await app.request(
        "/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "CF-Connecting-IP": "203.0.113.50",
          },
          body: JSON.stringify({
            identifier: "rate@example.com",
            password: "wrong-pass1",
          }),
        },
        testEnv(),
      );
      if (response.status === 429) {
        saw429 = true;
        const body = (await response.json()) as { error: { code: string } };
        expect(body.error.code).toBe("RATE_LIMITED");
        break;
      }
    }
    expect(saw429).toBe(true);
  });

  it("returns a generic OTP start response for unknown and known identifiers", async () => {
    await seedPasswordUser(db, "otp-known@example.com", "Str0ng-enough");
    const unknown = await app.request(
      "/auth/otp/start",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: "otp-unknown@example.com",
          purpose: "login",
        }),
      },
      testEnv(),
    );
    expect(unknown.status).toBe(202);
    const unknownBody = await unknown.json();
    expect(unknownBody).toEqual({ sent: true, channels: ["email"] });

    const known = await app.request(
      "/auth/otp/start",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: "otp-known@example.com",
          purpose: "login",
        }),
      },
      testEnv(),
    );
    expect(known.status).toBe(202);
    const knownBody = await known.json();
    expect(knownBody).toMatchObject({ sent: true, channels: ["email"] });
  });

  it("returns generic OTP invalid for a bad verify attempt", async () => {
    await seedPasswordUser(db, "otp-verify@example.com", "Str0ng-enough");
    const response = await app.request(
      "/auth/otp/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: "otp-verify@example.com",
          purpose: "login",
          code: "000000",
        }),
      },
      testEnv(),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("OTP_INVALID");
  });

  it("rejects breached passwords on set", async () => {
    const password = "Str0ng-enough";
    const { email, userId } = await seedPasswordUser(db, "breach@example.com", password);
    const login = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: email, password }),
      },
      testEnv(),
    );
    expect(login.status).toBe(200);
    const loginBody = (await login.json()) as { data: { token: string } };
    const response = await app.request(
      "/auth/password/set",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${loginBody.data.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ newPassword: "password" }),
      },
      testEnv(),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PASSWORD_BREACHED");
    const rows = await db
      .select()
      .from(schema.userIdentities)
      .where(eq(schema.userIdentities.userId, userId));
    expect(rows[0]?.passwordHash).toBeTruthy();
  });

  it("returns AUTH_NOT_CONFIGURED when test auth runs outside local", async () => {
    const response = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: "any@example.com",
          password: "whatever-12",
        }),
      },
      testEnv({ ENVIRONMENT: "staging" }),
    );
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("AUTH_NOT_CONFIGURED");
  });

  it("uses email-only channels for mobile OTP when wa_otp is off", async () => {
    const response = await app.request(
      "/auth/otp/start",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: "+919876543210",
          purpose: "login",
        }),
      },
      testEnv({ FLAG_WA_OTP: "false" }),
    );
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body).toEqual({ sent: true, channels: ["email"] });
  });
});
