import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deviceTokens } from "../db/schema.js";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import type { Env } from "../types.js";

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
    PUSH_PROVIDER_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
  };
}

/** Signs a trainer into trainer web and returns their session cookie. */
async function createTrainerSession(email: string) {
  const idToken = createTestIdToken(`trainer-${email}`, email);
  const response = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, timezone: "Asia/Kolkata" }),
    },
    testEnv(),
  );
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return { cookie: setCookie!.split(";")[0]!, idToken };
}

async function createInvitation(cookie: string, suffix: string) {
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-dt-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `dt-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  expect(created.status).toBe(200);
  const body = (await created.json()) as { data: { token: string } };
  return body.data.token;
}

/** A trainer and an accepted trainee of theirs, with the trainee's bearer token. */
async function createCoachingPair(suffix: string) {
  const trainer = await createTrainerSession(`dt-coach-${suffix}@example.com`);
  const invitationToken = await createInvitation(trainer.cookie, suffix);
  const traineeToken = createTestIdToken(
    `dt-trainee-${suffix}`,
    `dt-trainee-${suffix}@example.com`,
  );
  const accept = await app.request(
    "/invitations/accept",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: invitationToken,
        timezone: "Asia/Kolkata",
      }),
    },
    testEnv(),
  );
  expect(accept.status).toBe(200);
  return { trainerCookie: trainer.cookie, traineeToken };
}

type RegisterBody = {
  token: string;
  platform: "ios" | "android" | "web";
  installationId: string;
  provider?: "fcm" | "expo";
};

async function register(
  auth: { bearer?: string; cookie?: string; role?: "trainer" | "trainee" },
  body: RegisterBody,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (auth.bearer) headers.Authorization = `Bearer ${auth.bearer}`;
  if (auth.cookie) headers.Cookie = auth.cookie;
  if (auth.role) headers["x-fitbud-role"] = auth.role;
  return app.request(
    "/notifications/device-tokens",
    { method: "POST", headers, body: JSON.stringify(body) },
    testEnv(),
  );
}

type DeviceTokenPayload = {
  data: {
    deviceToken: {
      id: string;
      userId: string;
      token: string;
      provider: string;
      platform: string;
      status: string;
      lastSeenAt: string;
    };
  };
};

describe("device tokens (X4b)", () => {
  let closeDb: (() => void) | undefined;
  let db: Db;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    setTestDbOverride(memory.db);
    db = memory.db;
    closeDb = memory.close;
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb?.();
  });

  it("accepts an Expo push token from a trainee", async () => {
    const { traineeToken } = await createCoachingPair("expo");
    const response = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[trainee-expo-token-1]",
        platform: "ios",
        installationId: "install-expo-1",
        provider: "expo",
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as DeviceTokenPayload;
    expect(body.data.deviceToken.provider).toBe("expo");
    expect(body.data.deviceToken.status).toBe("active");
    expect(body.data.deviceToken.token).toBe(
      "ExponentPushToken[trainee-expo-token-1]",
    );

    const rows = await db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.id, body.data.deviceToken.id));
    expect(rows[0]?.provider).toBe("expo");
  });

  it("accepts an Expo push token from a trainer", async () => {
    const trainer = await createTrainerSession("dt-expo-trainer@example.com");
    const response = await register(
      { cookie: trainer.cookie },
      {
        token: "ExponentPushToken[trainer-expo-token-1]",
        platform: "android",
        installationId: "install-expo-trainer",
        provider: "expo",
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as DeviceTokenPayload;
    expect(body.data.deviceToken.provider).toBe("expo");
  });

  it("defaults the provider to fcm for clients that omit it", async () => {
    const { traineeToken } = await createCoachingPair("default");
    const response = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "legacy-fcm-token-abcdefgh",
        platform: "android",
        installationId: "install-default",
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as DeviceTokenPayload;
    expect(body.data.deviceToken.provider).toBe("fcm");
  });

  it("replaces the token of an existing installation instead of failing", async () => {
    const { traineeToken } = await createCoachingPair("reregister");
    const first = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "legacy-fcm-token-reregister",
        platform: "android",
        installationId: "install-reregister",
        provider: "fcm",
      },
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as DeviceTokenPayload;

    const second = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[rotated-expo-token]",
        platform: "ios",
        installationId: "install-reregister",
        provider: "expo",
      },
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as DeviceTokenPayload;

    expect(secondBody.data.deviceToken.id).toBe(firstBody.data.deviceToken.id);
    expect(secondBody.data.deviceToken.token).toBe(
      "ExponentPushToken[rotated-expo-token]",
    );
    expect(secondBody.data.deviceToken.provider).toBe("expo");
    expect(secondBody.data.deviceToken.platform).toBe("ios");
    expect(secondBody.data.deviceToken.status).toBe("active");
    expect(
      secondBody.data.deviceToken.lastSeenAt >=
        firstBody.data.deviceToken.lastSeenAt,
    ).toBe(true);

    const rows = await db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.userId, secondBody.data.deviceToken.userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.token).toBe("ExponentPushToken[rotated-expo-token]");
  });

  it("re-activates a revoked installation on re-registration", async () => {
    const { traineeToken } = await createCoachingPair("revoked");
    const first = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[revoked-then-back]",
        platform: "ios",
        installationId: "install-revoked",
        provider: "expo",
      },
    );
    expect(first.status).toBe(200);
    const remove = await app.request(
      "/notifications/device-tokens",
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ installationId: "install-revoked" }),
      },
      testEnv(),
    );
    expect(remove.status).toBe(200);

    const again = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[revoked-then-back-2]",
        platform: "ios",
        installationId: "install-revoked",
        provider: "expo",
      },
    );
    expect(again.status).toBe(200);
    const body = (await again.json()) as DeviceTokenPayload;
    expect(body.data.deviceToken.status).toBe("active");
    const rows = await db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.userId, body.data.deviceToken.userId));
    expect(rows).toHaveLength(1);
  });

  it("moves a token to a new installation of the same user without duplicates", async () => {
    const { traineeToken } = await createCoachingPair("moved");
    const first = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[moved-token]",
        platform: "ios",
        installationId: "install-old",
        provider: "expo",
      },
    );
    expect(first.status).toBe(200);
    const second = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[new-installation-token]",
        platform: "ios",
        installationId: "install-new",
        provider: "expo",
      },
    );
    expect(second.status).toBe(200);

    // The same token now reports from the newer installation.
    const third = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[moved-token]",
        platform: "ios",
        installationId: "install-new",
        provider: "expo",
      },
    );
    expect(third.status).toBe(200);
    const body = (await third.json()) as DeviceTokenPayload;
    const rows = await db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.userId, body.data.deviceToken.userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.installationId).toBe("install-new");
    expect(rows[0]?.token).toBe("ExponentPushToken[moved-token]");
  });

  it("rejects a token owned by another user with 403 DEVICE_TOKEN_OWNED", async () => {
    const a = await createCoachingPair("owned-a");
    const b = await createCoachingPair("owned-b");
    const first = await register(
      { bearer: a.traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[shared-expo-token]",
        platform: "ios",
        installationId: "install-owned-a",
        provider: "expo",
      },
    );
    expect(first.status).toBe(200);

    const second = await register(
      { bearer: b.traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[shared-expo-token]",
        platform: "ios",
        installationId: "install-owned-b",
        provider: "expo",
      },
    );
    expect(second.status).toBe(403);
    const raw = await second.text();
    const body = JSON.parse(raw) as { error: { code: string } };
    expect(body.error.code).toBe("DEVICE_TOKEN_OWNED");
    // The error body never echoes the token value.
    expect(raw).not.toContain("shared-expo-token");
  });

  it("lets a trainee register and delete a device token", async () => {
    const { traineeToken } = await createCoachingPair("trainee-crud");
    const response = await register(
      { bearer: traineeToken, role: "trainee" },
      {
        token: "ExponentPushToken[trainee-crud-token]",
        platform: "android",
        installationId: "install-trainee-crud",
        provider: "expo",
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as DeviceTokenPayload;

    const remove = await app.request(
      "/notifications/device-tokens",
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ deviceTokenId: body.data.deviceToken.id }),
      },
      testEnv(),
    );
    expect(remove.status).toBe(200);
    const removeBody = (await remove.json()) as { data: { revoked: number } };
    expect(removeBody.data.revoked).toBe(1);

    const rows = await db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.id, body.data.deviceToken.id));
    expect(rows[0]?.status).toBe("revoked");
  });

  it("returns 403 FORBIDDEN_ROLE when the client selects no role", async () => {
    // A user permitted both roles on mobile has no role until the client picks one.
    const inviter = await createTrainerSession("dt-inviter@example.com");
    const dual = await createTrainerSession("dt-dual@example.com");
    const invitationToken = await createInvitation(inviter.cookie, "dual");
    const accept = await app.request(
      "/invitations/accept",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${dual.idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: invitationToken,
          timezone: "Asia/Kolkata",
        }),
      },
      testEnv(),
    );
    expect(accept.status).toBe(200);

    const response = await register(
      { bearer: dual.idToken },
      {
        token: "ExponentPushToken[no-role-token]",
        platform: "ios",
        installationId: "install-no-role",
        provider: "expo",
      },
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN_ROLE");
  });

  it("returns 401 for an unauthenticated registration", async () => {
    const response = await register(
      {},
      {
        token: "ExponentPushToken[anonymous-token]",
        platform: "ios",
        installationId: "install-anonymous",
        provider: "expo",
      },
    );
    expect(response.status).toBe(401);
  });
});
