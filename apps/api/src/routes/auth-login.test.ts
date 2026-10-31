import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLocalJWKSet,
  decodeJwt,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
} from "jose";
import { setFirebaseJwksForTests } from "../auth/firebase.js";
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
    expect(unknownBody).toEqual({
      data: { sent: true, channels: ["email"] },
    });

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
    expect(knownBody).toMatchObject({
      data: { sent: true, channels: ["email"] },
    });
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

  it("returns 500 RUNTIME_MISCONFIGURED when test auth runs outside local", async () => {
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
      testEnv({ ENVIRONMENT: "production" }),
    );
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RUNTIME_MISCONFIGURED");
  });

  it("refuses test bearer tokens outside local with RUNTIME_MISCONFIGURED", async () => {
    const response = await app.request(
      "/me",
      { headers: { Authorization: "Bearer test.eyJ1aWQiOiJ4In0" } },
      testEnv({ ENVIRONMENT: "preview" }),
    );
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RUNTIME_MISCONFIGURED");
  });

  it("offers WhatsApp OTP for a mobile identifier in local when wa_otp is on", async () => {
    const response = await app.request(
      "/auth/otp/start",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: "+919876543210", purpose: "login" }),
      },
      testEnv({ FLAG_WA_OTP: "true" }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ data: { sent: true, channels: ["whatsapp"] } });
  });

  it("is email-only outside local even when wa_otp is on", async () => {
    const response = await app.request(
      "/auth/otp/start",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: "+919876543210", purpose: "login" }),
      },
      testEnv({
        ENVIRONMENT: "staging",
        AUTH_MODE: "firebase",
        PUSH_PROVIDER_MODE: "fcm",
        EMAIL_PROVIDER: "disabled",
        FLAG_WA_OTP: "true",
      }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ data: { sent: true, channels: ["email"] } });
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
    expect(body).toEqual({ data: { sent: true, channels: ["email"] } });
  });
});

describe("auth routes with AUTH_MODE=firebase", () => {
  const PROJECT_ID = "fitbud-local";
  const WEB_API_KEY = "test-web-api-key";
  const SIGN_IN_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`;
  const REFRESH_URL = `https://securetoken.googleapis.com/v1/token?key=${WEB_API_KEY}`;

  let db: Db;
  let close: () => void;
  let serviceAccountJson: string;
  let idTokenKey: CryptoKey;
  let googleFetch: ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>>;
  let googleFails: boolean;

  function firebaseEnv(overrides: Partial<Env> = {}): Env {
    return testEnv({
      AUTH_MODE: "firebase",
      FIREBASE_PROJECT_ID: PROJECT_ID,
      FIREBASE_SERVICE_ACCOUNT_JSON: serviceAccountJson,
      FIREBASE_WEB_API_KEY: WEB_API_KEY,
      ...overrides,
    });
  }

  /** A real Firebase-shaped ID token signed by the local key the API trusts in tests. */
  async function signIdToken(uid: string, email?: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ auth_time: now, ...(email ? { email } : {}) })
      .setProtectedHeader({ alg: "RS256", kid: "local-key-1", typ: "JWT" })
      .setIssuer(`https://securetoken.google.com/${PROJECT_ID}`)
      .setAudience(PROJECT_ID)
      .setSubject(uid)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(idTokenKey);
  }

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  function post(path: string, body: unknown, env: Env, headers: Record<string, string> = {}) {
    return app.request(
      path,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      },
      env,
    );
  }

  beforeAll(async () => {
    const serviceAccount = await generateKeyPair("RS256", { extractable: true });
    serviceAccountJson = JSON.stringify({
      client_email: "firebase-adminsdk@fitbud-local.iam.gserviceaccount.com",
      private_key: await exportPKCS8(serviceAccount.privateKey),
    });
    const idTokenPair = await generateKeyPair("RS256");
    idTokenKey = idTokenPair.privateKey;
    const jwk = { ...(await exportJWK(idTokenPair.publicKey)), kid: "local-key-1", alg: "RS256" };
    setFirebaseJwksForTests(createLocalJWKSet({ keys: [jwk] }));
  });

  afterAll(() => {
    setFirebaseJwksForTests(null);
  });

  beforeEach(async () => {
    const handle = await createMemoryDb();
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
    googleFails = false;
    // Stands in for Google: exchanges a custom token for an ID token for the same uid.
    googleFetch = vi.fn(async (url: string, init: RequestInit) => {
      if (googleFails) {
        return jsonResponse({ error: { code: 400, message: "INVALID_CUSTOM_TOKEN" } }, 400);
      }
      if (url === SIGN_IN_URL) {
        const { token } = JSON.parse(init.body as string) as { token: string };
        const claims = decodeJwt(token) as { uid: string; claims: { email?: string } };
        return jsonResponse({
          idToken: await signIdToken(claims.uid, claims.claims.email),
          refreshToken: `refresh-for-${claims.uid}`,
          expiresIn: "3600",
        });
      }
      if (url === REFRESH_URL) {
        return jsonResponse({
          id_token: "refreshed-id-token",
          refresh_token: "rotated-refresh-token",
          expires_in: "3600",
        });
      }
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", googleFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setTestDbOverride(null);
    close();
  });

  it("login returns an exchanged ID token that authenticates /me", async () => {
    const password = "Str0ng-enough";
    const { email, userId } = await seedPasswordUser(db, "firebase-login@example.com", password);

    const login = await post("/auth/login", { identifier: email, password }, firebaseEnv());
    expect(login.status).toBe(200);
    const body = (await login.json()) as {
      data: { token: string; tokenKind: string; refreshToken: string; expiresIn: number; userId: string };
    };
    expect(body.data).toMatchObject({
      tokenKind: "firebase_id_token",
      refreshToken: `refresh-for-login-${email}`,
      expiresIn: 3600,
      userId,
    });

    expect(googleFetch).toHaveBeenCalledTimes(1);
    const [url, init] = googleFetch.mock.calls[0]!;
    expect(url).toBe(SIGN_IN_URL);
    expect(init.method).toBe("POST");
    const exchangeBody = JSON.parse(init.body as string) as { token: string; returnSecureToken: boolean };
    expect(exchangeBody.returnSecureToken).toBe(true);
    expect(decodeJwt(exchangeBody.token)).toMatchObject({ uid: `login-${email}` });

    const me = await app.request(
      "/me",
      { headers: { Authorization: `Bearer ${body.data.token}`, "x-fitbud-role": "trainee" } },
      firebaseEnv(),
    );
    expect(me.status).toBe(200);
  });

  it("set-password returns a fresh exchanged token", async () => {
    const password = "Str0ng-enough";
    const { email } = await seedPasswordUser(db, "firebase-set@example.com", password);
    const bearer = await signIdToken(`login-${email}`, email);

    const response = await post(
      "/auth/password/set",
      { currentPassword: password, newPassword: "An0ther-strong-one" },
      firebaseEnv(),
      { Authorization: `Bearer ${bearer}`, "x-fitbud-role": "trainee" },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { tokenKind: string; refreshToken: string } };
    expect(body.data).toMatchObject({
      tokenKind: "firebase_id_token",
      refreshToken: `refresh-for-login-${email}`,
    });
  });

  it("OTP login returns an exchanged token", async () => {
    const { email } = await seedPasswordUser(db, "firebase-otp@example.com", "Str0ng-enough");
    await post("/auth/otp/start", { identifier: email, purpose: "login" }, testEnv());
    const mail = await app.request(`/dev/mail?to=${encodeURIComponent(email)}&limit=1`, {}, testEnv());
    const mailBody = (await mail.json()) as { data: { items: Array<{ textBody: string }> } };
    const code = mailBody.data.items[0]?.textBody.match(/\b(\d{6})\b/)?.[1];
    expect(code).toBeTruthy();

    const verify = await post(
      "/auth/otp/verify",
      { identifier: email, purpose: "login", code },
      firebaseEnv(),
    );
    expect(verify.status).toBe(200);
    const body = (await verify.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      purpose: "login",
      tokenKind: "firebase_id_token",
      refreshToken: `refresh-for-login-${email}`,
      expiresIn: 3600,
    });
  });

  it("returns 401 AUTH_EXCHANGE_FAILED when Google rejects the exchange", async () => {
    const password = "Str0ng-enough";
    const { email } = await seedPasswordUser(db, "firebase-fail@example.com", password);
    googleFails = true;

    const response = await post("/auth/login", { identifier: email, password }, firebaseEnv());
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("AUTH_EXCHANGE_FAILED");
    expect(JSON.stringify(body)).not.toContain("INVALID_CUSTOM_TOKEN");
  });

  it("returns 503 AUTH_PROVIDER_NOT_CONFIGURED without a web API key", async () => {
    const password = "Str0ng-enough";
    const { email } = await seedPasswordUser(db, "firebase-nokey@example.com", password);

    const response = await post(
      "/auth/login",
      { identifier: email, password },
      firebaseEnv({ FIREBASE_WEB_API_KEY: undefined }),
    );
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("AUTH_PROVIDER_NOT_CONFIGURED");
    expect(googleFetch).not.toHaveBeenCalled();
  });

  it("refresh returns a new ID token and the rotated refresh token", async () => {
    const response = await post("/auth/refresh", { refreshToken: "refresh-token-1" }, firebaseEnv());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        token: "refreshed-id-token",
        tokenKind: "firebase_id_token",
        refreshToken: "rotated-refresh-token",
        expiresIn: 3600,
      },
    });
    const [url, init] = googleFetch.mock.calls[0]!;
    expect(url).toBe(REFRESH_URL);
    expect(init.body).toBe("grant_type=refresh_token&refresh_token=refresh-token-1");
  });

  it("refresh returns 401 AUTH_REFRESH_FAILED when Google rejects the token", async () => {
    googleFails = true;
    const response = await post("/auth/refresh", { refreshToken: "expired-refresh" }, firebaseEnv());
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("AUTH_REFRESH_FAILED");
  });

  it("refresh returns 400 for a missing refresh token", async () => {
    const response = await post("/auth/refresh", {}, firebaseEnv());
    expect(response.status).toBe(400);
    expect(googleFetch).not.toHaveBeenCalled();
  });

  it("rate limits refresh by IP on the 16th call", async () => {
    const headers = { "CF-Connecting-IP": "203.0.113.7" };
    for (let attempt = 1; attempt <= 15; attempt += 1) {
      const response = await post("/auth/refresh", { refreshToken: "r" }, firebaseEnv(), headers);
      expect(response.status).toBe(200);
    }
    const limited = await post("/auth/refresh", { refreshToken: "r" }, firebaseEnv(), headers);
    expect(limited.status).toBe(429);
    const body = (await limited.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  it("refresh returns 400 REFRESH_NOT_SUPPORTED in test mode", async () => {
    const response = await post("/auth/refresh", { refreshToken: "r" }, testEnv());
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("REFRESH_NOT_SUPPORTED");
    expect(googleFetch).not.toHaveBeenCalled();
  });

  it("test-mode login keeps the { token, tokenKind, userId } shape", async () => {
    const password = "Str0ng-enough";
    const { email } = await seedPasswordUser(db, "test-shape@example.com", password);
    const response = await post("/auth/login", { identifier: email, password }, testEnv());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: Record<string, unknown> };
    expect(Object.keys(body.data)).toEqual(["token", "tokenKind", "userId"]);
    expect(body.data.tokenKind).toBe("test_id_token");
    expect(googleFetch).not.toHaveBeenCalled();
  });

  it("lists POST /auth/refresh in the OpenAPI document", async () => {
    const response = await app.request("/openapi.json", { method: "GET" }, testEnv());
    const document = (await response.json()) as { paths: Record<string, Record<string, unknown>> };
    expect(document.paths["/auth/refresh"]?.post).toBeTruthy();
  });
});
