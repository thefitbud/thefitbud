import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatLocalDate } from "@fitbud/core";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import type { Env } from "../types.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import * as schema from "../db/schema.js";
import { createMemoryDb } from "../test-support/memory-db.js";

/**
 * Z6-8 authorization (D-W6-2: this module's cases live here, not in the shared
 * matrix). Only the trainer who owns the relationship reads or writes its client
 * settings. Another trainer, the trainee and unauthenticated callers get nothing,
 * learn nothing and change nothing; client-sent owner fields are never trusted.
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
  };
}

type Headers = Record<string, string>;

async function send(
  method: string,
  path: string,
  headers: Headers,
  body?: unknown,
  key?: string,
) {
  return app.request(
    path,
    {
      method,
      headers: {
        ...headers,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
    testEnv(),
  );
}

async function createTrainerSession(email: string) {
  const token = createTestIdToken(`trainer-${email}`, email);
  const response = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token, timezone: "Asia/Kolkata" }),
    },
    testEnv(),
  );
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";")[0]!;
}

/** Invite → accept → onboarding → review → configure → activate. */
async function reachActive(trainerEmail: string, suffix: string) {
  const trainer = { Cookie: await createTrainerSession(trainerEmail) };
  const created = await send(
    "POST",
    "/invitations",
    trainer,
    { recipientEmail: `cs-trainee-${suffix}@example.com` },
    `inv-cs-${suffix}`,
  );
  const { data: invite } = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `cs-trainee-${suffix}`,
    `cs-trainee-${suffix}@example.com`,
  );
  const trainee = { Authorization: `Bearer ${traineeToken}`, "x-fitbud-role": "trainee" };
  const accept = await send(
    "POST",
    "/invitations/accept",
    { Authorization: `Bearer ${traineeToken}` },
    { token: invite.token, timezone: "Asia/Kolkata" },
  );
  const accepted = (await accept.json()) as {
    data: { relationship: { id: string; traineeUserId: string } };
  };
  const relationshipId = accepted.data.relationship.id;
  const traineeUserId = accepted.data.relationship.traineeUserId;
  await send("PUT", `/onboarding/relationships/${relationshipId}/draft`, trainee, {
    expectedVersion: 0,
    answers: {
      goals: "Consistency",
      relevant_history: "None",
      preferences: "Home",
      schedule: "Mornings",
      limitations: "None",
    },
  });
  await send(
    "POST",
    `/onboarding/relationships/${relationshipId}/submit`,
    trainee,
    { expectedVersion: 1 },
    `submit-cs-${suffix}`,
  );
  await send(
    "POST",
    `/onboarding/relationships/${relationshipId}/review`,
    trainer,
    { outcome: "coaching_ready" },
    `review-cs-${suffix}`,
  );
  await send("PUT", `/configurations/relationships/${relationshipId}/draft`, trainer, {
    expectedVersion: 0,
    goalShort: "Adherence",
    workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
    nutrition: { mealsPerDay: 2, confirmationWindowHours: 24, photoRequirement: "none" },
    checkin: { cadence: "weekly", dueWindowHours: 1 },
    tracking: {
      requireBodyWeight: false,
      requireProgressPhotos: false,
      requireSessionRpe: false,
    },
  });
  await send(
    "POST",
    `/configurations/relationships/${relationshipId}/configure`,
    trainer,
    { expectedVersion: 1 },
    `cfg-cs-${suffix}`,
  );
  const activated = await send(
    "POST",
    `/configurations/relationships/${relationshipId}/activate`,
    trainer,
    { expectedVersion: 1 },
    `act-cs-${suffix}`,
  );
  expect(activated.status).toBe(200);
  return { trainer, trainee, relationshipId, traineeUserId };
}

function addDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

const today = () => formatLocalDate(new Date(), "Asia/Kolkata");

function subscriptionBody(overrides: Record<string, unknown> = {}) {
  const start = addDays(today(), -20);
  return {
    expectedVersion: 0,
    planName: "Fat loss 12-week",
    paymentFrequency: "monthly",
    startsOn: start,
    renewsOn: addDays(start, 30),
    amountPaise: 1_200_000,
    subscriptionType: "monthly",
    coachingMode: "online",
    ...overrides,
  };
}

async function errorOf(response: Response) {
  return ((await response.json()) as { error: { code: string; message: string } }).error;
}



/** Trainer-set basics (Z6-8b) on the owner's relationship; never shown to anyone else. */
const OWNER_SET_NAME = "Ravi early slot";
const OWNER_SET_PHONE = "+91 91234 56789";
const OWNER_SET_DIGITS = "919123456789";

describe("Z6-8 client settings authorization", () => {
  let db: Db;
  let closeDb: () => void;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    db = memory.db;
    closeDb = memory.close;
    setTestDbOverride(memory.db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb();
  });

  const base = (id: string) => `/client-settings/relationships/${id}`;

  async function snapshot() {
    const byId = <T extends { id: string }>(rows: T[]) =>
      [...rows].sort((a, b) => a.id.localeCompare(b.id));
    return {
      subscriptions: byId(await db.select().from(schema.subscriptionVersions)),
      payments: byId(await db.select().from(schema.paymentRecords)),
      // Z6-8b: the whole relationship rows, trainer-owned basics included.
      relationships: byId(await db.select().from(schema.coachingRelationships)),
      // The client's own name and sign-in identifier, which no write may touch.
      profiles: [...(await db.select().from(schema.traineeProfiles))].sort((a, b) =>
        a.userId.localeCompare(b.userId),
      ),
      identities: [...(await db.select().from(schema.userIdentities))].sort((a, b) =>
        a.userId.localeCompare(b.userId),
      ),
    };
  }

  async function setup(suffix: string) {
    const owner = await reachActive(`csz-owner-${suffix}@example.com`, `${suffix}-a`);
    const stranger = await reachActive(`csz-other-${suffix}@example.com`, `${suffix}-b`);
    const saved = await send(
      "PUT",
      `${base(owner.relationshipId)}/subscription`,
      owner.trainer,
      subscriptionBody(),
      `csz-sub-${suffix}`,
    );
    expect(saved.status).toBe(200);
    const created = await send(
      "POST",
      `${base(owner.relationshipId)}/payments`,
      owner.trainer,
      { amountPaise: 1_200_000, dueOn: today(), status: "unpaid", note: "Month 1" },
      `csz-pay-${suffix}`,
    );
    expect(created.status).toBe(201);
    const payment = ((await created.json()) as { data: { id: string } }).data;
    const basics = await send(
      "PATCH",
      `${base(owner.relationshipId)}/basic`,
      owner.trainer,
      { displayName: OWNER_SET_NAME, contactPhone: OWNER_SET_PHONE },
      `csz-basic-${suffix}`,
    );
    expect(basics.status).toBe(200);
    return { owner, stranger, paymentId: payment.id };
  }

  function writes(relationshipId: string, paymentId: string) {
    return [
      ["PUT", `${base(relationshipId)}/subscription`, subscriptionBody({ expectedVersion: 1 })],
      [
        "POST",
        `${base(relationshipId)}/payments`,
        { amountPaise: 100, dueOn: today(), status: "unpaid" },
      ],
      [
        "PATCH",
        `${base(relationshipId)}/payments/${paymentId}`,
        { status: "paid", paidOn: today(), method: "cash" },
      ],
      [
        "PATCH",
        `${base(relationshipId)}/basic`,
        { displayName: "Taken over", contactPhone: "9000000001" },
      ],
    ] as const;
  }

  it("another trainer gets 404 on read and every write, learns nothing and changes nothing", async () => {
    const { owner, stranger, paymentId } = await setup("cross");
    const before = await snapshot();
    const read = await send("GET", base(owner.relationshipId), stranger.trainer);
    expect(read.status).toBe(404);
    const readText = await read.text();
    expect(readText).toContain("RELATIONSHIP_NOT_FOUND");
    expect(readText).not.toContain(owner.relationshipId);
    expect(readText).not.toContain("Month 1");
    expect(readText).not.toContain(OWNER_SET_NAME);
    expect(readText).not.toContain(OWNER_SET_DIGITS);
    for (const [index, [method, path, body]] of writes(owner.relationshipId, paymentId).entries()) {
      const response = await send(method, path, stranger.trainer, body, `csz-cross-${index}`);
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(await errorOf(response)).toMatchObject({
        code: "RELATIONSHIP_NOT_FOUND",
        message: "Coaching relationship not found.",
      });
    }
    expect(await snapshot()).toEqual(before);
  });

  it("a payment id from another relationship is not found under my relationship", async () => {
    const { owner, stranger } = await setup("smuggle");
    const strangerSub = await send(
      "PUT",
      `${base(stranger.relationshipId)}/subscription`,
      stranger.trainer,
      subscriptionBody(),
      "csz-smuggle-sub",
    );
    expect(strangerSub.status).toBe(200);
    const theirs = await send(
      "POST",
      `${base(stranger.relationshipId)}/payments`,
      stranger.trainer,
      { amountPaise: 5_000, dueOn: today(), status: "unpaid" },
      "csz-smuggle-pay",
    );
    expect(theirs.status).toBe(201);
    const theirId = ((await theirs.json()) as { data: { id: string } }).data.id;
    const before = await snapshot();
    const response = await send(
      "PATCH",
      `${base(owner.relationshipId)}/payments/${theirId}`,
      owner.trainer,
      { status: "paid", paidOn: today(), method: "cash" },
      "csz-smuggle-patch",
    );
    expect(response.status).toBe(404);
    expect((await errorOf(response)).code).toBe("PAYMENT_NOT_FOUND");
    expect(await snapshot()).toEqual(before);
  });

  it("the trainee of the relationship cannot read or write it (403)", async () => {
    const { owner, paymentId } = await setup("trainee");
    const before = await snapshot();
    const read = await send("GET", base(owner.relationshipId), owner.trainee);
    expect(read.status).toBe(403);
    expect((await errorOf(read)).code).toBe("FORBIDDEN_ROLE");
    for (const [index, [method, path, body]] of writes(owner.relationshipId, paymentId).entries()) {
      const response = await send(method, path, owner.trainee, body, `csz-trainee-${index}`);
      expect(response.status, `${method} ${path}`).toBe(403);
    }
    expect(await snapshot()).toEqual(before);
  });

  it("an unrelated trainee (another trainer's client) cannot read or write (403)", async () => {
    const { owner, stranger, paymentId } = await setup("unrelated");
    const before = await snapshot();
    const read = await send("GET", base(owner.relationshipId), stranger.trainee);
    expect(read.status).toBe(403);
    expect(await read.text()).not.toContain(OWNER_SET_NAME);
    for (const [index, [method, path, body]] of writes(owner.relationshipId, paymentId).entries()) {
      const response = await send(method, path, stranger.trainee, body, `csz-unrelated-${index}`);
      expect(response.status, `${method} ${path}`).toBe(403);
      expect((await errorOf(response)).code).toBe("FORBIDDEN_ROLE");
    }
    expect(await snapshot()).toEqual(before);
  });

  it("the trainee's own relationship reads and sync pull never carry the trainer-set name or contact phone", async () => {
    const { owner } = await setup("traineeview");
    // A logged measurement, so the pull has records of this relationship to return.
    const measured = await send(
      "POST",
      `/progress/relationships/${owner.relationshipId}/measurements`,
      owner.trainee,
      { type: "body_weight_kg", value: 71.4, unit: "kg" },
      "csz-traineeview-meas",
    );
    expect(measured.status).toBe(200);
    const banned = [
      OWNER_SET_NAME,
      OWNER_SET_DIGITS,
      "clientDisplayName",
      "contactPhone",
      "client_display_name",
      "contact_phone",
    ];
    for (const path of ["/relationships", `/relationships/${owner.relationshipId}`]) {
      const response = await send("GET", path, owner.trainee);
      expect(response.status, path).toBe(200);
      const text = await response.text();
      // The read returns the trainee's own relationship, so the check is meaningful.
      expect(text, path).toContain(owner.relationshipId);
      for (const value of banned) {
        expect(text, `${path} carries ${value}`).not.toContain(value);
      }
    }
    // Every sync page, so no later page carries them either.
    let cursor: string | null = null;
    let pages = 0;
    let changes = 0;
    do {
      const path = `/sync/pull?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const response = await send("GET", path, owner.trainee);
      expect(response.status, path).toBe(200);
      const text = await response.text();
      for (const value of banned) {
        expect(text, `${path} carries ${value}`).not.toContain(value);
      }
      const body = JSON.parse(text) as {
        data: { changes: unknown[]; nextCursor: string | null; hasMore: boolean };
      };
      changes += body.data.changes.length;
      cursor = body.data.hasMore ? body.data.nextCursor : null;
      pages += 1;
    } while (cursor && pages < 50);
    expect(changes).toBeGreaterThan(0);
  });

  it("unauthenticated callers get 401 on read and every write", async () => {
    const { owner, paymentId } = await setup("anon");
    const before = await snapshot();
    expect((await send("GET", base(owner.relationshipId), {})).status).toBe(401);
    for (const [index, [method, path, body]] of writes(owner.relationshipId, paymentId).entries()) {
      const response = await send(method, path, {}, body, `csz-anon-${index}`);
      expect(response.status, `${method} ${path}`).toBe(401);
    }
    expect(await snapshot()).toEqual(before);
  });

  it("client-sent owner fields are rejected, never trusted", async () => {
    const { owner, stranger } = await setup("owner");
    const before = await snapshot();
    const smuggled = [
      [
        "PUT",
        `${base(owner.relationshipId)}/subscription`,
        subscriptionBody({ expectedVersion: 1, coachingRelationshipId: stranger.relationshipId }),
      ],
      [
        "POST",
        `${base(owner.relationshipId)}/payments`,
        { amountPaise: 100, dueOn: today(), status: "unpaid", createdBy: stranger.traineeUserId },
      ],
      [
        "POST",
        `${base(owner.relationshipId)}/payments`,
        { amountPaise: 100, dueOn: today(), status: "unpaid", relationshipId: stranger.relationshipId },
      ],
      [
        "PATCH",
        `${base(owner.relationshipId)}/basic`,
        { displayName: "Asha", coachingRelationshipId: stranger.relationshipId },
      ],
      [
        "PATCH",
        `${base(owner.relationshipId)}/basic`,
        { displayName: "Asha", traineeUserId: stranger.traineeUserId },
      ],
    ] as const;
    for (const [index, [method, path, body]] of smuggled.entries()) {
      const response = await send(method, path, owner.trainer, body, `csz-owner-${index}`);
      expect(response.status).toBe(400);
      expect((await errorOf(response)).code).toBe("INVALID_REQUEST");
    }
    expect(await snapshot()).toEqual(before);
  });

  it("idempotency receipts are per actor: another trainer reusing my key gets no replay of my answer", async () => {
    const { owner, stranger } = await setup("keys");
    const response = await send(
      "PUT",
      `${base(owner.relationshipId)}/subscription`,
      stranger.trainer,
      subscriptionBody(),
      "csz-sub-keys",
    );
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("Fat loss");
  });

  it("after the relationship ends the owner can still read and others still cannot", async () => {
    const { owner, stranger } = await setup("ended");
    const ended = await send(
      "POST",
      `/relationships/${owner.relationshipId}/end`,
      owner.trainer,
      { reason: "paused" },
      "csz-ended-end",
    );
    expect(ended.status).toBe(200);
    expect((await send("GET", base(owner.relationshipId), owner.trainer)).status).toBe(200);
    expect((await send("GET", base(owner.relationshipId), stranger.trainer)).status).toBe(404);
  });
});
