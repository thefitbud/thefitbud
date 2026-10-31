import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportPKCS8, generateKeyPair } from "jose";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { sha256Hex } from "../lib/crypto.js";
import type { Env } from "../types.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import * as schema from "../db/schema.js";

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

async function createInvitation(trainerCookie: string, recipientEmail: string) {
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainerCookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-${recipientEmail}`,
      },
      body: JSON.stringify({ recipientEmail }),
    },
    testEnv(),
  );
  expect(created.status).toBe(200);
  return (await created.json()) as {
    data: { token: string; id: string };
  };
}

async function inviteOtpProof(recipientEmail: string): Promise<string> {
  await app.request(
    "/auth/otp/start",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: recipientEmail, purpose: "invite" }),
    },
    testEnv(),
  );
  const mail = await app.request(
    `/dev/mail?to=${encodeURIComponent(recipientEmail)}&limit=1`,
    {},
    testEnv(),
  );
  const mailBody = (await mail.json()) as { data: { items: Array<{ textBody: string }> } };
  const code = mailBody.data.items[0]?.textBody.match(/\b(\d{6})\b/)?.[1];
  expect(code).toBeTruthy();
  const verify = await app.request(
    "/auth/otp/verify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: recipientEmail, purpose: "invite", code }),
    },
    testEnv(),
  );
  expect(verify.status).toBe(200);
  return ((await verify.json()) as { data: { otpProof: string } }).data.otpProof;
}

describe("invitations accept (password + otp)", () => {
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

  it("accepts with password and otpProof and returns an auth token", async () => {
    const trainer = await createTrainerSession("invite-pw-coach@example.com");
    const recipientEmail = "invite-pw-trainee@example.com";
    const invite = await createInvitation(trainer.cookie, recipientEmail);

    await app.request(
      "/auth/otp/start",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: recipientEmail, purpose: "invite" }),
      },
      testEnv(),
    );
    const mail = await app.request(
      `/dev/mail?to=${encodeURIComponent(recipientEmail)}&limit=1`,
      {},
      testEnv(),
    );
    expect(mail.status).toBe(200);
    const mailBody = (await mail.json()) as {
      data: { items: Array<{ textBody: string }> };
    };
    expect(mailBody.data.items.length).toBeGreaterThan(0);
    const codeMatch = mailBody.data.items[0]?.textBody.match(/\b(\d{6})\b/);
    expect(codeMatch?.[1]).toBeTruthy();
    const verify = await app.request(
      "/auth/otp/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: recipientEmail,
          purpose: "invite",
          code: codeMatch![1],
        }),
      },
      testEnv(),
    );
    expect(verify.status).toBe(200);
    const verifyBody = (await verify.json()) as {
      data: { otpProof: string };
    };

    const accept = await app.request(
      "/invitations/accept",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: invite.data.token,
          password: "Str0ng-enough",
          otpProof: verifyBody.data.otpProof,
          displayName: "Invite Trainee",
        }),
      },
      testEnv(),
    );
    expect(accept.status).toBe(200);
    const acceptBody = (await accept.json()) as {
      data: { token: string; relationshipId: string; userId: string };
    };
    expect(acceptBody.data.token).toBeTruthy();
    expect(acceptBody.data.relationshipId).toBeTruthy();
    expect(acceptBody.data.userId).toBeTruthy();
  });

  it("returns an exchanged Firebase ID token when AUTH_MODE=firebase", async () => {
    const trainer = await createTrainerSession("invite-fb-coach@example.com");
    const recipientEmail = "invite-fb-trainee@example.com";
    const invite = await createInvitation(trainer.cookie, recipientEmail);
    const otpProof = await inviteOtpProof(recipientEmail);

    const serviceAccount = await generateKeyPair("RS256", { extractable: true });
    const googleFetch = vi.fn(async () =>
      Response.json({ idToken: "invite-id-token", refreshToken: "invite-refresh", expiresIn: "3600" }),
    );
    vi.stubGlobal("fetch", googleFetch);
    try {
      const accept = await app.request(
        "/invitations/accept",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: invite.data.token,
            password: "Str0ng-enough",
            otpProof,
            displayName: "Invite Trainee",
          }),
        },
        {
          ...testEnv(),
          AUTH_MODE: "firebase",
          FIREBASE_WEB_API_KEY: "test-web-api-key",
          FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
            client_email: "firebase-adminsdk@fitbud-local.iam.gserviceaccount.com",
            private_key: await exportPKCS8(serviceAccount.privateKey),
          }),
        },
      );
      expect(accept.status).toBe(200);
      const body = (await accept.json()) as { data: Record<string, unknown> };
      expect(body.data).toMatchObject({
        token: "invite-id-token",
        tokenKind: "firebase_id_token",
        refreshToken: "invite-refresh",
        expiresIn: 3600,
      });
      expect(googleFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns 409 INVITATION_EXPIRED for an expired token", async () => {
    const trainer = await createTrainerSession("invite-exp-coach@example.com");
    const invite = await createInvitation(trainer.cookie, "invite-exp@example.com");
    const tokenHash = await sha256Hex(invite.data.token);
    await db
      .update(schema.clientInvitations)
      .set({
        expiresAt: "2000-01-01T00:00:00.000Z",
        status: "pending",
      })
      .where(eq(schema.clientInvitations.tokenHash, tokenHash));

    const traineeToken = createTestIdToken(
      "invite-exp-trainee",
      "invite-exp@example.com",
    );
    const response = await app.request(
      "/invitations/accept",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: invite.data.token }),
      },
      testEnv(),
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVITATION_EXPIRED");
  });

  it("returns 410 INVITATION_REVOKED for a revoked token", async () => {
    const trainer = await createTrainerSession("invite-rev-coach@example.com");
    const invite = await createInvitation(trainer.cookie, "invite-rev@example.com");
    const revoked = await app.request(
      `/invitations/${invite.data.id}/revoke`,
      {
        method: "POST",
        headers: { Cookie: trainer.cookie, "Content-Type": "application/json" },
      },
      testEnv(),
    );
    expect(revoked.status).toBe(200);

    const response = await app.request(
      "/invitations/accept",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: invite.data.token }),
      },
      testEnv(),
    );
    expect(response.status).toBe(410);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVITATION_REVOKED");
  });
});
