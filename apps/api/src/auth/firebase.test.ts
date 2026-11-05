import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWTPayload,
} from "jose";
import { app } from "../index.js";
import { setTestDbOverride, createDb } from "../db/client.js";
import { ensureRoleAndProfile, findOrCreateUserFromFirebase } from "./identity.js";
import {
  createTestIdToken,
  setFirebaseJwksForTests,
  verifyFirebaseIdToken,
} from "./firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import type { Env } from "../types.js";

const PROJECT_ID = "thefitbud-staging";
const KID = "local-key-1";
const firebaseMode = { projectId: PROJECT_ID, authMode: "firebase" as const };

let signingKey: CryptoKey;
let foreignKey: CryptoKey;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function validClaims(): JWTPayload & { auth_time: number; email: string } {
  const now = nowSeconds();
  return {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: "firebase-uid-coach",
    iat: now - 30,
    exp: now + 3600,
    auth_time: now - 120,
    email: "coach@example.com",
  };
}

async function sign(
  claims: JWTPayload,
  options: { key?: CryptoKey; kid?: string } = {},
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: options.kid ?? KID, typ: "JWT" })
    .sign(options.key ?? signingKey);
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  signingKey = pair.privateKey;
  foreignKey = (await generateKeyPair("RS256")).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: "RS256", use: "sig" };
  setFirebaseJwksForTests(createLocalJWKSet({ keys: [jwk] }));
});

afterAll(() => {
  setFirebaseJwksForTests(null);
});

describe("verifyFirebaseIdToken (firebase mode)", () => {
  it("accepts a correctly signed token for the configured project", async () => {
    const token = await sign(validClaims());
    await expect(verifyFirebaseIdToken(token, firebaseMode)).resolves.toEqual({
      uid: "firebase-uid-coach",
      email: "coach@example.com",
    });
  });

  it("omits email when the token has none", async () => {
    const claims: JWTPayload = { ...validClaims() };
    delete claims.email;
    await expect(verifyFirebaseIdToken(await sign(claims), firebaseMode)).resolves.toEqual({
      uid: "firebase-uid-coach",
      email: undefined,
    });
  });

  it("accepts iat slightly in the future within 60 s skew", async () => {
    const token = await sign({ ...validClaims(), iat: nowSeconds() + 30 });
    await expect(verifyFirebaseIdToken(token, firebaseMode)).resolves.not.toBeNull();
  });

  it("rejects a token signed by a key outside the JWKS", async () => {
    const token = await sign(validClaims(), { key: foreignKey });
    await expect(verifyFirebaseIdToken(token, firebaseMode)).resolves.toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const [header, , signature] = (await sign(validClaims())).split(".");
    const forged = base64Url(JSON.stringify({ ...validClaims(), sub: "someone-else" }));
    await expect(
      verifyFirebaseIdToken(`${header}.${forged}.${signature}`, firebaseMode),
    ).resolves.toBeNull();
  });

  it("rejects an unknown kid", async () => {
    const token = await sign(validClaims(), { kid: "not-in-jwks" });
    await expect(verifyFirebaseIdToken(token, firebaseMode)).resolves.toBeNull();
  });

  it("rejects alg none", async () => {
    const header = base64Url(JSON.stringify({ alg: "none", kid: KID, typ: "JWT" }));
    const payload = base64Url(JSON.stringify(validClaims()));
    await expect(
      verifyFirebaseIdToken(`${header}.${payload}.`, firebaseMode),
    ).resolves.toBeNull();
  });

  it("rejects HS256", async () => {
    const token = await new SignJWT(validClaims())
      .setProtectedHeader({ alg: "HS256", kid: KID, typ: "JWT" })
      .sign(new TextEncoder().encode("a-shared-secret-of-at-least-32-bytes!!"));
    await expect(verifyFirebaseIdToken(token, firebaseMode)).resolves.toBeNull();
  });

  it("rejects the wrong issuer", async () => {
    const token = await sign({
      ...validClaims(),
      iss: "https://securetoken.google.com/thefitbud-prod",
    });
    await expect(verifyFirebaseIdToken(token, firebaseMode)).resolves.toBeNull();
  });

  it("rejects the wrong audience", async () => {
    const token = await sign({ ...validClaims(), aud: "thefitbud-prod" });
    await expect(verifyFirebaseIdToken(token, firebaseMode)).resolves.toBeNull();
  });

  it("rejects a token from another project", async () => {
    const token = await sign(validClaims());
    await expect(
      verifyFirebaseIdToken(token, { projectId: "thefitbud-prod", authMode: "firebase" }),
    ).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    const now = nowSeconds();
    const token = await sign({ ...validClaims(), iat: now - 7200, exp: now - 120 });
    await expect(verifyFirebaseIdToken(token, firebaseMode)).resolves.toBeNull();
  });

  it("rejects iat more than 60 s in the future", async () => {
    const token = await sign({ ...validClaims(), iat: nowSeconds() + 120 });
    await expect(verifyFirebaseIdToken(token, firebaseMode)).resolves.toBeNull();
  });

  it("rejects an empty sub", async () => {
    const token = await sign({ ...validClaims(), sub: "" });
    await expect(verifyFirebaseIdToken(token, firebaseMode)).resolves.toBeNull();
  });

  it("rejects auth_time in the future", async () => {
    const token = await sign({ ...validClaims(), auth_time: nowSeconds() + 3600 });
    await expect(verifyFirebaseIdToken(token, firebaseMode)).resolves.toBeNull();
  });

  it("rejects a token without auth_time", async () => {
    const claims: JWTPayload = { ...validClaims() };
    delete claims.auth_time;
    await expect(verifyFirebaseIdToken(await sign(claims), firebaseMode)).resolves.toBeNull();
  });

  it.each(["", "not-a-jwt", "a.b.c", createTestIdToken("firebase-uid-coach")])(
    "rejects malformed token %#",
    async (token) => {
      await expect(verifyFirebaseIdToken(token, firebaseMode)).resolves.toBeNull();
    },
  );

  it("never logs token contents", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    try {
      await verifyFirebaseIdToken(await sign(validClaims(), { key: foreignKey }), firebaseMode);
      await verifyFirebaseIdToken("not-a-jwt", firebaseMode);
      await verifyFirebaseIdToken(await sign(validClaims()), firebaseMode);
      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled();
      }
    } finally {
      for (const spy of spies) {
        spy.mockRestore();
      }
    }
  });
});

describe("verifyFirebaseIdToken (test mode)", () => {
  it("still accepts structured test tokens", async () => {
    const token = createTestIdToken("firebase-uid-1", "trainer@example.com");
    await expect(
      verifyFirebaseIdToken(token, { projectId: "fitbud-local", authMode: "test" }),
    ).resolves.toEqual({ uid: "firebase-uid-1", email: "trainer@example.com" });
  });

  it("does not accept a real ID token as a test token", async () => {
    const token = await sign(validClaims());
    await expect(
      verifyFirebaseIdToken(token, { projectId: PROJECT_ID, authMode: "test" }),
    ).resolves.toBeNull();
  });
});

describe("protected routes with AUTH_MODE=firebase", () => {
  let closeDb: () => void;

  function dummyD1(): D1Database {
    return {
      prepare() {
        throw new Error("D1 should not be used when test DB override is set");
      },
    } as unknown as D1Database;
  }

  function firebaseEnv(): Env {
    return {
      DB: dummyD1(),
      MEDIA: createMemoryR2Bucket(),
      FIREBASE_PROJECT_ID: PROJECT_ID,
      SESSION_COOKIE_NAME: "fitbud_session",
      AUTH_MODE: "firebase",
      MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    };
  }

  beforeEach(async () => {
    const memory = await createMemoryDb();
    closeDb = memory.close;
    setTestDbOverride(memory.db);
    const db = createDb(dummyD1());
    const { userId } = await findOrCreateUserFromFirebase(db, {
      uid: "firebase-uid-coach",
      email: "coach@example.com",
    });
    await ensureRoleAndProfile(db, { userId, role: "trainer", displayName: "Coach" });
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb();
  });

  async function getMe(token: string): Promise<Response> {
    return app.request(
      "/me",
      { headers: { Authorization: `Bearer ${token}`, "x-fitbud-role": "trainer" } },
      firebaseEnv(),
    );
  }

  it("serves /me for a verified token", async () => {
    const response = await getMe(await sign(validClaims()));
    expect(response.status).toBe(200);
  });

  it.each([
    ["forged", async () => sign(validClaims(), { key: foreignKey })],
    [
      "expired",
      async () => sign({ ...validClaims(), iat: nowSeconds() - 7200, exp: nowSeconds() - 120 }),
    ],
    ["test-mode", async () => createTestIdToken("firebase-uid-coach", "coach@example.com")],
  ])("returns 401 UNAUTHENTICATED for a %s token", async (_label, makeToken) => {
    const response = await getMe(await makeToken());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
  });
});
