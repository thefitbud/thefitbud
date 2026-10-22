import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
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

function testEnv(): Env {
  return {
    DB: dummyD1(),
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    ENVIRONMENT: "local",
    EMAIL_PROVIDER: "dev_sink",
    APP_HOST: "app.fitbud.test",
  };
}

async function createTrainerSession(email: string) {
  const token = createTestIdToken(`trainer-${email}`, email);
  const sessionResponse = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token, timezone: "Asia/Kolkata" }),
    },
    testEnv(),
  );
  expect(sessionResponse.status).toBe(200);
  const setCookie = sessionResponse.headers.get("set-cookie");
  return { cookie: setCookie!.split(";")[0]! };
}

describe("invitation reissue + duplicate", () => {
  let db: Db;
  let close: () => void;

  beforeEach(async () => {
    const handle = await createMemoryDb();
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
    void db;
  });

  afterEach(() => {
    setTestDbOverride(null);
    close();
  });

  it("reissue returns a new invite URL and revokes the old one", async () => {
    const { cookie } = await createTrainerSession("coach.reissue@example.com");
    const email = `trainee.reissue.${Date.now()}@example.com`;
    const created = await app.request(
      "/invitations",
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": `reissue-create-${Date.now()}`,
        },
        body: JSON.stringify({
          recipientEmail: email,
          recipientDisplayName: "Reissue Test",
        }),
      },
      testEnv(),
    );
    expect(created.status).toBe(200);
    const createdBody = (await created.json()) as {
      data: { id: string; inviteUrl: string; token: string };
    };

    const reissue = await app.request(
      `/invitations/${createdBody.data.id}/reissue`,
      {
        method: "POST",
        headers: { Cookie: cookie },
      },
      testEnv(),
    );
    expect(reissue.status).toBe(200);
    const next = (await reissue.json()) as {
      data: { id: string; inviteUrl: string; token: string };
    };
    expect(next.data.id).not.toBe(createdBody.data.id);
    expect(next.data.inviteUrl).not.toBe(createdBody.data.inviteUrl);
    expect(next.data.token).not.toBe(createdBody.data.token);

    const old = await app.request(`/invitations/${createdBody.data.id}`, {
      headers: { Cookie: cookie },
    }, testEnv());
    const oldBody = (await old.json()) as { data: { status: string } };
    expect(oldBody.data.status).toBe("revoked");
  });

  it("duplicate pending email returns INVITE_PENDING", async () => {
    const { cookie } = await createTrainerSession("coach.dup@example.com");
    const email = `dup.${Date.now()}@example.com`;
    const first = await app.request(
      "/invitations",
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": `dup-a-${Date.now()}`,
        },
        body: JSON.stringify({
          recipientEmail: email,
          recipientDisplayName: "Dup Client",
        }),
      },
      testEnv(),
    );
    expect(first.status).toBe(200);

    const second = await app.request(
      "/invitations",
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": `dup-b-${Date.now()}`,
        },
        body: JSON.stringify({
          recipientEmail: email,
          recipientDisplayName: "Dup Client",
        }),
      },
      testEnv(),
    );
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVITE_PENDING");
  });
});
