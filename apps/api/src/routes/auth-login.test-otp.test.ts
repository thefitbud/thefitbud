import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import {
  createLocalJWKSet,
  decodeJwt,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
} from "jose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setFirebaseJwksForTests } from "../auth/firebase.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { app } from "../index.js";
import { createId, nowIso } from "../lib/crypto.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { ZEPTOMAIL_ENDPOINT } from "../lib/zeptomail.js";
import { runtimeMisconfigurations } from "../middleware/runtime-guard.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import type { Env } from "../types.js";

/**
 * QT1: the staging-only fixed QA OTP code, end to end on the in-memory D1.
 *
 * The runtime guard is replaced with a pass-through here so the production cases
 * can reach the route and prove the route itself refuses the fixed code. That the
 * guard makes production refuse *every* request is covered against the real app in
 * `src/middleware/runtime-guard.test.ts`; `runtimeMisconfigurations` below is the
 * real one, not a stub.
 */
vi.mock("../middleware/runtime-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/runtime-guard.js")>();
  return {
    ...actual,
    runtimeGuardMiddleware: createMiddleware(async (_c, next) => {
      await next();
    }),
  };
});

const QA_EMAIL = "qa+trainer@thefitbud.com";
/** Stands in for Firoz's 6-digit staging secret. Never a real value. */
const FIXED_CODE = "135790";
const ZEPTO_TOKEN = "zepto-test-token-do-not-log";
const PROJECT_ID = "fitbud-local";
const WEB_API_KEY = "test-web-api-key";
const SIGN_IN_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`;

function dummyD1(): D1Database {
  return {
    prepare() {
      throw new Error("D1 should not be used when test DB override is set");
    },
  } as unknown as D1Database;
}

describe("staging-only test-mode OTP (QT1)", () => {
  let db: Db;
  let close: () => void;
  let serviceAccountJson: string;
  let idTokenKey: CryptoKey;
  let zeptoSends: number;
  let logLines: string[];

  /**
   * A correctly configured deployed Worker: firebase auth, a real push mode and
   * ZeptoMail, so the runtime guard has nothing to complain about on staging.
   */
  function deployedEnv(overrides: Partial<Env> = {}): Env {
    return {
      DB: dummyD1(),
      MEDIA: createMemoryR2Bucket(),
      FIREBASE_PROJECT_ID: PROJECT_ID,
      FIREBASE_SERVICE_ACCOUNT_JSON: serviceAccountJson,
      FIREBASE_WEB_API_KEY: WEB_API_KEY,
      SESSION_COOKIE_NAME: "fitbud_session",
      AUTH_MODE: "firebase",
      PUSH_PROVIDER_MODE: "expo",
      EMAIL_PROVIDER: "zeptomail",
      ZEPTOMAIL_TOKEN: ZEPTO_TOKEN,
      MEDIA_SIGNING_SECRET: "fitbud-test-signing-secret",
      ENVIRONMENT: "staging",
      QA_TEST_OTP_ENABLED: "on",
      QA_TEST_OTP_CODE: FIXED_CODE,
      ...overrides,
    } as Env;
  }

  function post(path: string, body: unknown, env: Env) {
    return app.request(
      path,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      env,
    );
  }

  const start = (identifier: string, env: Env, purpose = "login") =>
    post("/auth/otp/start", { identifier, purpose }, env);
  const verify = (identifier: string, code: string, env: Env, purpose = "login") =>
    post("/auth/otp/verify", { identifier, purpose, code }, env);

  async function seedEmailUser(email: string, displayName: string) {
    const userId = createId();
    const timestamp = nowIso();
    await db.insert(schema.users).values({
      id: userId,
      firebaseUid: `qa-${email}`,
      accountState: "active",
      timezone: "Asia/Kolkata",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.insert(schema.userIdentities).values({
      userId,
      email,
      emailNorm: email.toLowerCase(),
      mobileE164: null,
      passwordHash: null,
      passwordUpdatedAt: null,
      failedLoginCount: 0,
      lockedUntil: null,
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
      displayName,
      dateOfBirth: null,
      gender: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return { userId, email };
  }

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

  /** The newest live OTP row for an identifier, by its stored hash. */
  async function otpRows(identifier: string) {
    const data = new TextEncoder().encode(identifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const idHash = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    return db.select().from(schema.authOtps).where(eq(schema.authOtps.identifierHash, idHash));
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
    zeptoSends = 0;
    logLines = [];
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logLines.push(args.map((arg) => String(arg)).join(" "));
      });
    }
    // Stands in for ZeptoMail and Google: counts every email send, and exchanges a
    // custom token for an ID token for the same uid.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const href = String(url);
        if (href === ZEPTOMAIL_ENDPOINT) {
          zeptoSends += 1;
          return new Response(JSON.stringify({ data: [] }), { status: 201 });
        }
        if (href === SIGN_IN_URL) {
          const { token } = JSON.parse(String(init?.body)) as { token: string };
          const claims = decodeJwt(token) as { uid: string; claims?: { email?: string } };
          return new Response(
            JSON.stringify({
              idToken: await signIdToken(claims.uid, claims.claims?.email),
              refreshToken: `refresh-for-${claims.uid}`,
              expiresIn: "3600",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("unexpected", { status: 500 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setTestDbOverride(null);
    close();
  });

  it("signs in an allowlisted QA account with the fixed code and sends no email", async () => {
    const { userId } = await seedEmailUser(QA_EMAIL, "QA Trainer");
    const env = deployedEnv();

    const started = await start(QA_EMAIL, env);
    expect(started.status).toBe(202);
    expect(await started.json()).toEqual({ data: { sent: true, channels: ["email"] } });
    expect(zeptoSends).toBe(0);
    expect(await db.select().from(schema.devMailOutbox)).toHaveLength(0);

    const verified = await verify(QA_EMAIL, FIXED_CODE, env);
    expect(verified.status).toBe(200);
    const body = (await verified.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      purpose: "login",
      tokenKind: "firebase_id_token",
      refreshToken: `refresh-for-qa-${QA_EMAIL}`,
      expiresIn: 3600,
      userId,
    });
    expect(body.data.token).toBeTruthy();
  });

  it("returns the same start body for a QA address as for an unknown one", async () => {
    await seedEmailUser(QA_EMAIL, "QA Trainer");
    const env = deployedEnv();
    const qa = await start(QA_EMAIL, env);
    const unknown = await start("qa+nobody@thefitbud.com", env);
    expect(qa.status).toBe(unknown.status);
    expect(await qa.json()).toEqual(await unknown.json());
  });

  it("logs auth.otp.test_mode with the identifier hash only", async () => {
    await seedEmailUser(QA_EMAIL, "QA Trainer");
    await start(QA_EMAIL, deployedEnv());
    const testModeLines = logLines.filter((line) => line.includes("auth.otp.test_mode"));
    expect(testModeLines).toHaveLength(1);
    const line = JSON.parse(testModeLines[0]!) as Record<string, unknown>;
    expect(line).toMatchObject({
      level: "info",
      message: "auth.otp.test_mode",
      operation: "auth.otp.start",
      entityType: "auth_otp",
    });
    expect(String(line.entityId)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never puts the fixed code, the QA address or a secret in any log line", async () => {
    await seedEmailUser(QA_EMAIL, "QA Trainer");
    const env = deployedEnv();
    await start(QA_EMAIL, env);
    await verify(QA_EMAIL, "000000", env);
    await verify(QA_EMAIL, FIXED_CODE, env);
    const logged = logLines.join("\n");
    expect(logged).not.toContain(FIXED_CODE);
    expect(logged).not.toContain(QA_EMAIL);
    expect(logged).not.toContain("qa+");
    expect(logged).not.toContain(ZEPTO_TOKEN);
    expect(logged).not.toContain("fitbud-test-signing-secret");
  });

  it("keeps the fixed code single use", async () => {
    await seedEmailUser(QA_EMAIL, "QA Trainer");
    const env = deployedEnv();
    await start(QA_EMAIL, env);
    expect((await verify(QA_EMAIL, FIXED_CODE, env)).status).toBe(200);

    const second = await verify(QA_EMAIL, FIXED_CODE, env);
    expect(second.status).toBe(401);
    expect(((await second.json()) as { error: { code: string } }).error.code).toBe("OTP_INVALID");
  });

  it("counts wrong attempts and invalidates the fixed code after five", async () => {
    await seedEmailUser(QA_EMAIL, "QA Trainer");
    const env = deployedEnv();
    await start(QA_EMAIL, env);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const wrong = await verify(QA_EMAIL, "000000", env);
      expect(wrong.status).toBe(401);
      const [row] = await otpRows(QA_EMAIL);
      expect(row?.attempts).toBe(attempt);
      expect(row?.invalidatedAt === null).toBe(attempt < 5);
    }
    // The real code no longer works on an invalidated row.
    const afterFive = await verify(QA_EMAIL, FIXED_CODE, env);
    expect(afterFive.status).toBe(401);
    expect(((await afterFive.json()) as { error: { code: string } }).error.code).toBe("OTP_INVALID");
  });

  it.each([
    ["tech+client2@thefitbud.com", "Firoz Client 2"],
    ["qa@thefitbud.com", "Plain QA"],
    ["qa+x@thefitbud.co", "Wrong TLD"],
  ])("leaves %s on the normal random-code path", async (email, displayName) => {
    await seedEmailUser(email, displayName);
    const env = deployedEnv();

    const started = await start(email, env);
    expect(started.status).toBe(202);
    expect(zeptoSends).toBe(1);

    const rejected = await verify(email, FIXED_CODE, env);
    expect(rejected.status).toBe(401);
    expect(((await rejected.json()) as { error: { code: string } }).error.code).toBe("OTP_INVALID");
  });

  it("rejects the fixed code for an upper-case non-allowlisted domain", async () => {
    await seedEmailUser("qa+x@evil.com", "Evil QA");
    const env = deployedEnv();
    expect((await start("QA+X@evil.com", env)).status).toBe(202);
    expect(zeptoSends).toBe(1);
    expect((await verify("QA+X@evil.com", FIXED_CODE, env)).status).toBe(401);
  });

  it.each([
    ["the flag is missing", { QA_TEST_OTP_ENABLED: undefined }],
    ["the flag is off", { QA_TEST_OTP_ENABLED: "off" }],
    ["the code is not six digits", { QA_TEST_OTP_CODE: "12345" }],
    ["the code is missing", { QA_TEST_OTP_CODE: undefined }],
    ["the purpose is not login", {}],
  ])("stays on the normal path on staging when %s", async (label, overrides) => {
    await seedEmailUser(QA_EMAIL, "QA Trainer");
    const env = deployedEnv(overrides as Partial<Env>);
    const purpose = label === "the purpose is not login" ? "reset" : "login";

    expect((await start(QA_EMAIL, env, purpose)).status).toBe(202);
    expect(zeptoSends).toBe(1);
    expect((await verify(QA_EMAIL, FIXED_CODE, env, purpose)).status).toBe(401);
  });

  describe("production", () => {
    it("reports both QA secrets to the runtime guard", () => {
      expect(
        runtimeMisconfigurations(deployedEnv({ ENVIRONMENT: "production" })),
      ).toEqual(["QA_TEST_OTP_ENABLED=set", "QA_TEST_OTP_CODE=set"]);
    });

    it("rejects the fixed code even with both secrets set and the guard bypassed", async () => {
      await seedEmailUser(QA_EMAIL, "QA Trainer");
      const env = deployedEnv({ ENVIRONMENT: "production" });

      const started = await start(QA_EMAIL, env);
      expect(started.status).toBe(202);
      // The normal path ran: a random code was emailed instead.
      expect(zeptoSends).toBe(1);

      const rejected = await verify(QA_EMAIL, FIXED_CODE, env);
      expect(rejected.status).toBe(401);
      expect(((await rejected.json()) as { error: { code: string } }).error.code).toBe(
        "OTP_INVALID",
      );
      expect(logLines.join("\n")).not.toContain("auth.otp.test_mode");
    });
  });
});
