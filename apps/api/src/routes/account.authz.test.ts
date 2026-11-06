import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import { ACCOUNT_DELETION_PAGE_TEXT } from "./account-deletion-page.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import type { Env } from "../types.js";

/**
 * Z6-14 authorization: the account routes act only on the caller's own
 * account, resolved on the server; nothing in the request can name another.
 */

function testEnv(): Env {
  return {
    DB: {
      prepare() {
        throw new Error("D1 should not be used when test DB override is set");
      },
      dump: async () => new ArrayBuffer(0),
      batch: async () => [],
      exec: async () => ({ count: 0, duration: 0 }),
    } as unknown as D1Database,
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    ENVIRONMENT: "local",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
  };
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

async function call(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
) {
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
  return {
    status: response.status,
    body: (text && response.headers.get("content-type")?.includes("json")
      ? JSON.parse(text)
      : {}) as {
      data?: Record<string, unknown>;
      error?: { code: string; details?: Record<string, unknown> };
    },
    text,
    contentType: response.headers.get("content-type") ?? "",
  };
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
    headers: { Cookie: response.headers.get("set-cookie")!.split(";")[0]! },
  };
}

function bearer(uid: string, email: string) {
  return {
    Authorization: `Bearer ${createTestIdToken(uid, email, nowSeconds())}`,
    "x-fitbud-role": "trainee",
  };
}

async function coachedTrainee(trainer: { headers: Record<string, string> }, slug: string) {
  const email = `client.${slug}@example.com`;
  const created = await call("/invitations", {
    method: "POST",
    headers: { ...trainer.headers, "Idempotency-Key": `inv-${slug}` },
    body: { recipientEmail: email },
  });
  expect(created.status).toBe(200);
  const accepted = await call("/invitations/accept", {
    method: "POST",
    headers: bearer(`trainee-${slug}`, email),
    body: { token: created.body.data!.token, timezone: "Asia/Kolkata" },
  });
  expect(accepted.status).toBe(200);
  return {
    uid: `trainee-${slug}`,
    email,
    headers: bearer(`trainee-${slug}`, email),
    relationshipId: (accepted.body.data!.relationship as { id: string }).id,
  };
}

async function stateOf(db: Db, uid: string) {
  const [row] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.firebaseUid, uid));
  return row!.accountState;
}

describe("account routes authorization (Z6-14)", () => {
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

  it("requires authentication for status, deletion and reactivation", async () => {
    for (const [method, path] of [
      ["GET", "/account/status"],
      ["POST", "/account/deletion"],
      ["POST", "/account/reactivation"],
    ] as const) {
      const anonymous = await call(path, { method });
      expect(anonymous.status).toBe(401);
      expect(anonymous.body.error!.code).toBe("UNAUTHENTICATED");
      const badToken = await call(path, {
        method,
        headers: { Authorization: "Bearer not-a-token" },
      });
      expect(badToken.status).toBe(401);
    }
  });

  it("deletes only the caller's account, whatever the request names", async () => {
    const trainer = await trainerSession("owner.coach@example.com");
    const a = await coachedTrainee(trainer, "a");
    const b = await coachedTrainee(trainer, "b");
    const [bUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.firebaseUid, b.uid));

    const deleted = await call("/account/deletion", {
      method: "POST",
      headers: { ...a.headers, "x-fitbud-role": "trainer" },
      body: { userId: bUser!.id, firebaseUid: b.uid },
    });
    expect(deleted.status).toBe(200);
    expect(await stateOf(db, a.uid)).toBe("archived");
    expect(await stateOf(db, b.uid)).toBe("active");
    const [bRelationship] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, b.relationshipId));
    expect(bRelationship!.status).toBe("active");
    // B keeps working; the trainer keeps working and still has an active client.
    expect((await call("/me", { headers: b.headers })).status).toBe(200);
    expect((await call("/me", { headers: trainer.headers })).status).toBe(200);
    const trainerDelete = await call("/account/deletion", {
      method: "POST",
      headers: trainer.headers,
    });
    expect(trainerDelete.status).toBe(409);
    expect(trainerDelete.body.error!.code).toBe("ACTIVE_CLIENTS");
  });

  it("blocks a user who is also a trainer with an active client, even when signed in as trainee", async () => {
    const coach = await trainerSession("head.coach@example.com");
    const dual = await trainerSession("second.coach@example.com");
    await coachedTrainee(dual, "own-client");
    // The second coach is also coached by the head coach (same sign-in, trainee role).
    const created = await call("/invitations", {
      method: "POST",
      headers: { ...coach.headers, "Idempotency-Key": "inv-coach-of-coach" },
      body: { recipientEmail: "second.coach@example.com" },
    });
    const dualAsTrainee = bearer("trainer-second.coach@example.com", "second.coach@example.com");
    const accepted = await call("/invitations/accept", {
      method: "POST",
      headers: dualAsTrainee,
      body: { token: created.body.data!.token },
    });
    expect(accepted.status).toBe(200);

    const blocked = await call("/account/deletion", { method: "POST", headers: dualAsTrainee });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error!.code).toBe("ACTIVE_CLIENTS");
    // Nothing was ended on the trainee side either.
    const [asClient] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.trainerUserId, coach.userId));
    expect(asClient!.status).toBe("active");
    expect(asClient!.traineeUserId).toBe(dual.userId);
  });

  it("gives an archived actor no roles: role-gated routes refuse it, status answers whatever role is asked", async () => {
    const trainer = await trainerSession("roles.coach@example.com");
    const trainee = await coachedTrainee(trainer, "roles");
    expect((await call("/account/deletion", { method: "POST", headers: trainee.headers })).status).toBe(200);

    for (const role of ["trainee", "trainer"]) {
      const headers = { ...bearer(trainee.uid, trainee.email), "x-fitbud-role": role };
      expect((await call("/account/status", { headers })).status).toBe(200);
      const roleGated = await call(`/history/relationships/${trainee.relationshipId}`, { headers });
      expect(roleGated.status).toBe(403);
      expect(roleGated.body.error!.code).toBe("ACCOUNT_ARCHIVED");
    }
    // The trainee's ended relationship stays readable by the trainer.
    expect(
      (await call(`/history/relationships/${trainee.relationshipId}`, { headers: trainer.headers }))
        .status,
    ).toBe(200);
  });

  it("does not treat a disabled account as archived", async () => {
    const trainer = await trainerSession("disabled.coach@example.com");
    await db
      .update(schema.users)
      .set({ accountState: "disabled" })
      .where(eq(schema.users.id, trainer.userId));
    for (const [method, path] of [
      ["GET", "/account/status"],
      ["POST", "/account/reactivation"],
      ["GET", "/me"],
    ] as const) {
      const result = await call(path, { method, headers: trainer.headers });
      expect(result.status).toBe(401);
    }
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, trainer.userId));
    expect(row!.accountState).toBe("disabled");
  });

  it("serves the public deletion page to anyone, with the exact text and no data", async () => {
    const trainer = await trainerSession("page.coach@example.com");
    const trainee = await coachedTrainee(trainer, "page");
    await call("/account/deletion", { method: "POST", headers: trainee.headers });

    for (const headers of [{}, trainee.headers, trainer.headers]) {
      const page = await call("/account/delete", { headers });
      expect(page.status).toBe(200);
      expect(page.contentType).toContain("text/html");
      const text = page.text.replace(/<[^>]+>/g, "");
      expect(text).toContain(
        "Delete your account in the FitBud app: More → Privacy → Delete account. Your account is archived for 6 months and you can bring it back by signing in again. After 6 months it is deleted for good. To delete it permanently straight away, email tech@thefitbud.com from the email or phone number on your account.",
      );
      expect(text).toContain(ACCOUNT_DELETION_PAGE_TEXT.join(" "));
      expect(page.text).not.toContain(trainee.email);
      expect(page.text).not.toContain("page.coach@example.com");
    }
  });
});
