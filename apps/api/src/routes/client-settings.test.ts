import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatLocalDate } from "@fitbud/core";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import type { Env } from "../types.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import * as schema from "../db/schema.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import { createDemoSeededDb } from "../test-support/seeded-db.js";
import { assertNoForeignKeyViolations } from "../test-support/foreign-key-check.js";
import { hashPassword } from "../auth/password.js";
import { buildDemoSeedSql } from "../seed/demo/build.js";
import { loadDemoLibraryIndex } from "../seed/demo/personas.js";
import { DEMO_PASSWORD_PLAINTEXT } from "../seed/demo/spec.js";
import { demoUuid } from "../seed/demo/ids.js";
import { loadOwnedRelationship, saveClientBasics } from "../domain/client-settings.js";

/**
 * Z6-8 client settings: every endpoint, validation (D-W6-22), versioning, ended
 * 409, idempotency and logs, on persisted data reached through production routes
 * (invite → accept → onboarding → review → configure → activate).
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

/** The phone as onboarding/sign-up stores it (user_identities.mobile_e164). */
async function setPhone(db: Db, userId: string, phone: string) {
  const now = new Date().toISOString();
  await db
    .insert(schema.userIdentities)
    .values({ userId, mobileE164: phone, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.userIdentities.userId,
      set: { mobileE164: phone },
    });
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

async function dataOf<T>(response: Response): Promise<T> {
  return ((await response.json()) as { data: T }).data;
}

type PaymentOut = {
  id: string;
  subscriptionVersionId: string;
  amountPaise: number;
  status: string;
  paidOn: string | null;
  method: string | null;
  note: string | null;
};

describe("Z6-8 client settings", () => {
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
    vi.restoreAllMocks();
  });

  const base = (id: string) => `/client-settings/relationships/${id}`;

  async function withSubscription(suffix: string) {
    const ctx = await reachActive(`cs-owner-${suffix}@example.com`, suffix);
    const saved = await send(
      "PUT",
      `${base(ctx.relationshipId)}/subscription`,
      ctx.trainer,
      subscriptionBody(),
      `sub-${suffix}-1`,
    );
    expect(saved.status).toBe(200);
    const subscription = await dataOf<{ id: string; versionNumber: number }>(saved);
    return { ...ctx, subscription };
  }

  describe("GET", () => {
    it("returns basics, no subscription and no payments for a new client", async () => {
      const { trainer, relationshipId } = await reachActive("cs-get@example.com", "get");
      const response = await send("GET", base(relationshipId), trainer);
      expect(response.status).toBe(200);
      const data = await dataOf<Record<string, unknown>>(response);
      expect(data).toMatchObject({
        relationshipId,
        relationshipStatus: "active",
        endedAt: null,
        readOnly: false,
        subscription: null,
        payments: [],
      });
      expect((data.basics as { displayName: string }).displayName.length).toBeGreaterThan(0);
    });

    it("returns the phone as stored, the newest subscription and payments newest due first", async () => {
      const { trainer, relationshipId, traineeUserId } = await withSubscription("getfull");
      await setPhone(db, traineeUserId, "+919000000123");
      const older = addDays(today(), -20);
      const newer = addDays(today(), 10);
      for (const [dueOn, key] of [
        [older, "p-old"],
        [newer, "p-new"],
      ] as const) {
        const created = await send(
          "POST",
          `${base(relationshipId)}/payments`,
          trainer,
          { amountPaise: 1_200_000, dueOn, status: "unpaid" },
          key,
        );
        expect(created.status).toBe(201);
      }
      const data = await dataOf<{
        basics: { phoneE164: string | null };
        subscription: { versionNumber: number; amountPaise: number; coachingMode: string; renewalState: string };
        payments: Array<{ dueOn: string }>;
      }>(await send("GET", base(relationshipId), trainer));
      expect(data.basics.phoneE164).toBe("+919000000123");
      expect(data.subscription).toMatchObject({
        versionNumber: 1,
        amountPaise: 1_200_000,
        coachingMode: "online",
        renewalState: "current",
      });
      expect(data.payments.map((p) => p.dueOn)).toEqual([newer, older]);
    });
  });

  describe("PUT subscription", () => {
    it("creates v1, then v2 keeping v1 unchanged; renewals and the subscription read v2", async () => {
      const { trainer, relationshipId, subscription } = await withSubscription("ver");
      const [v1Before] = await db
        .select()
        .from(schema.subscriptionVersions)
        .where(eq(schema.subscriptionVersions.id, subscription.id));
      // v2 renews in 3 days, so the renewals list must show it as upcoming.
      const v2Body = subscriptionBody({
        expectedVersion: 1,
        planName: "Hybrid coaching",
        startsOn: addDays(today(), -27),
        renewsOn: addDays(today(), 3),
        amountPaise: 0,
        subscriptionType: "custom",
        coachingMode: "hybrid",
      });
      const saved = await send(
        "PUT",
        `${base(relationshipId)}/subscription`,
        trainer,
        v2Body,
        "sub-ver-2",
      );
      expect(saved.status).toBe(200);
      const v2 = await dataOf<Record<string, unknown>>(saved);
      expect(v2).toMatchObject({
        versionNumber: 2,
        planName: "Hybrid coaching",
        amountPaise: 0,
        subscriptionType: "custom",
        coachingMode: "hybrid",
        renewalState: "upcoming",
      });

      const rows = await db
        .select()
        .from(schema.subscriptionVersions)
        .where(eq(schema.subscriptionVersions.coachingRelationshipId, relationshipId));
      expect(rows.map((r) => r.versionNumber).sort()).toEqual([1, 2]);
      expect(rows.find((r) => r.versionNumber === 1)).toEqual(v1Before);

      const attention = await dataOf<{
        items: Array<{ coachingRelationshipId: string; versionNumber: number; planName: string }>;
      }>(await send("GET", "/subscriptions/attention", trainer));
      expect(attention.items).toEqual([
        expect.objectContaining({
          coachingRelationshipId: relationshipId,
          versionNumber: 2,
          planName: "Hybrid coaching",
        }),
      ]);
      const current = await dataOf<{ versionNumber: number }>(
        await send("GET", `/relationships/${relationshipId}/subscription`, trainer),
      );
      expect(current.versionNumber).toBe(2);
      const settings = await dataOf<{ subscription: { versionNumber: number } }>(
        await send("GET", base(relationshipId), trainer),
      );
      expect(settings.subscription.versionNumber).toBe(2);
    });

    it("rejects a stale expectedVersion with 409 and writes nothing", async () => {
      const { trainer, relationshipId } = await withSubscription("stale");
      const response = await send(
        "PUT",
        `${base(relationshipId)}/subscription`,
        trainer,
        subscriptionBody({ expectedVersion: 0 }),
        "sub-stale-2",
      );
      expect(response.status).toBe(409);
      expect((await errorOf(response)).code).toBe("SUBSCRIPTION_VERSION_CONFLICT");
      const rows = await db.select().from(schema.subscriptionVersions);
      expect(rows).toHaveLength(1);
    });

    it.each([
      ["renewal on the start date", { renewsOn: addDays(today(), -20) }],
      ["renewal before the start date", { renewsOn: addDays(today(), -25) }],
      ["a negative amount", { amountPaise: -1 }],
      ["a fractional amount", { amountPaise: 10.5 }],
      ["an unknown subscription type", { subscriptionType: "session_pack" }],
      ["an unknown coaching mode", { coachingMode: "video" }],
      ["a date that is not on the calendar", { startsOn: "2026-02-30" }],
      ["an empty plan name", { planName: "  " }],
      ["a collection field", { invoiceNumber: "INV-1" }],
      ["a missing amount field", { amountPaise: undefined }],
    ])("rejects %s with 400 INVALID_REQUEST", async (_label, override) => {
      const { trainer, relationshipId } = await reachActive("cs-val@example.com", "val");
      const response = await send(
        "PUT",
        `${base(relationshipId)}/subscription`,
        trainer,
        subscriptionBody(override),
        "sub-val",
      );
      expect(response.status).toBe(400);
      const error = await errorOf(response);
      expect(error.code).toBe("INVALID_REQUEST");
      expect(error.message).toBe("Invalid subscription request.");
      expect(await db.select().from(schema.subscriptionVersions)).toHaveLength(0);
    });

    it("accepts a free plan (amount 0) and a null amount, type and mode", async () => {
      const { trainer, relationshipId } = await reachActive("cs-free@example.com", "free");
      const response = await send(
        "PUT",
        `${base(relationshipId)}/subscription`,
        trainer,
        subscriptionBody({ amountPaise: null, subscriptionType: null, coachingMode: null }),
        "sub-free",
      );
      expect(response.status).toBe(200);
      expect(await dataOf(response)).toMatchObject({
        amountPaise: null,
        subscriptionType: null,
        coachingMode: null,
      });
    });

    it("requires an Idempotency-Key and replays a retry without a second version", async () => {
      const { trainer, relationshipId } = await reachActive("cs-idem@example.com", "idem");
      const missing = await send(
        "PUT",
        `${base(relationshipId)}/subscription`,
        trainer,
        subscriptionBody(),
      );
      expect(missing.status).toBe(400);
      expect((await errorOf(missing)).code).toBe("IDEMPOTENCY_KEY_REQUIRED");

      const first = await send(
        "PUT",
        `${base(relationshipId)}/subscription`,
        trainer,
        subscriptionBody(),
        "sub-idem",
      );
      const retry = await send(
        "PUT",
        `${base(relationshipId)}/subscription`,
        trainer,
        subscriptionBody(),
        "sub-idem",
      );
      expect(first.status).toBe(200);
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual(await first.json());
      expect(await db.select().from(schema.subscriptionVersions)).toHaveLength(1);

      const reused = await send(
        "PUT",
        `${base(relationshipId)}/subscription`,
        trainer,
        subscriptionBody({ planName: "Another plan" }),
        "sub-idem",
      );
      expect(reused.status).toBe(409);
      expect((await errorOf(reused)).code).toBe("IDEMPOTENCY_KEY_REUSE");
      expect(await db.select().from(schema.subscriptionVersions)).toHaveLength(1);
    });
  });

  describe("payments", () => {
    it("records an unpaid payment against the newest subscription version", async () => {
      const { trainer, relationshipId, subscription } = await withSubscription("punpaid");
      const response = await send(
        "POST",
        `${base(relationshipId)}/payments`,
        trainer,
        { amountPaise: 1_200_000, dueOn: today(), status: "unpaid", note: "  Month 2  " },
        "pay-unpaid",
      );
      expect(response.status).toBe(201);
      const payment = await dataOf<PaymentOut>(response);
      expect(payment).toMatchObject({
        subscriptionVersionId: subscription.id,
        amountPaise: 1_200_000,
        status: "unpaid",
        paidOn: null,
        method: null,
        note: "Month 2",
      });
      const [row] = await db
        .select()
        .from(schema.paymentRecords)
        .where(eq(schema.paymentRecords.id, payment.id));
      expect(row).toMatchObject({ coachingRelationshipId: relationshipId, status: "unpaid" });
    });

    it("records a paid payment with its date and method", async () => {
      const { trainer, relationshipId } = await withSubscription("ppaid");
      const response = await send(
        "POST",
        `${base(relationshipId)}/payments`,
        trainer,
        {
          amountPaise: 1_800_000,
          dueOn: addDays(today(), -3),
          status: "paid",
          paidOn: addDays(today(), -2),
          method: "upi",
        },
        "pay-paid",
      );
      expect(response.status).toBe(201);
      expect(await dataOf(response)).toMatchObject({
        status: "paid",
        paidOn: addDays(today(), -2),
        method: "upi",
      });
    });

    it.each([
      ["a zero amount (D-W6-22: payments are > 0)", { amountPaise: 0, status: "unpaid" }],
      ["a negative amount", { amountPaise: -100, status: "unpaid" }],
      ["paid without a method", { status: "paid", paidOn: "2026-10-01" }],
      ["paid without a paid date", { status: "paid", method: "cash" }],
      ["unpaid with a method", { status: "unpaid", method: "cash" }],
      ["unpaid with a paid date", { status: "unpaid", paidOn: "2026-10-01" }],
      ["an unknown method", { status: "paid", paidOn: "2026-10-01", method: "card" }],
      ["a gateway field", { status: "unpaid", gatewayReference: "pay_123" }],
      ["a bad due date", { status: "unpaid", dueOn: "2026-13-01" }],
    ])("rejects %s with 400 and writes nothing (never a CHECK 500)", async (_label, override) => {
      const { trainer, relationshipId } = await withSubscription("pval");
      const response = await send(
        "POST",
        `${base(relationshipId)}/payments`,
        trainer,
        { amountPaise: 500_000, dueOn: today(), ...override },
        "pay-val",
      );
      expect(response.status).toBe(400);
      const error = await errorOf(response);
      expect(error.code).toBe("INVALID_REQUEST");
      expect(error.message).toBe("Invalid payment record.");
      expect(await db.select().from(schema.paymentRecords)).toHaveLength(0);
    });

    it("needs a subscription before a payment can be recorded (409)", async () => {
      const { trainer, relationshipId } = await reachActive("cs-nosub@example.com", "nosub");
      const response = await send(
        "POST",
        `${base(relationshipId)}/payments`,
        trainer,
        { amountPaise: 100, dueOn: today(), status: "unpaid" },
        "pay-nosub",
      );
      expect(response.status).toBe(409);
      expect((await errorOf(response)).code).toBe("SUBSCRIPTION_REQUIRED");
    });

    it("ties a payment recorded after a subscription edit to the new version", async () => {
      const { trainer, relationshipId } = await withSubscription("pver");
      const v2 = await dataOf<{ id: string }>(
        await send(
          "PUT",
          `${base(relationshipId)}/subscription`,
          trainer,
          subscriptionBody({ expectedVersion: 1, amountPaise: 1_500_000 }),
          "sub-pver-2",
        ),
      );
      const payment = await dataOf<PaymentOut>(
        await send(
          "POST",
          `${base(relationshipId)}/payments`,
          trainer,
          { amountPaise: 1_500_000, dueOn: today(), status: "unpaid" },
          "pay-pver",
        ),
      );
      expect(payment.subscriptionVersionId).toBe(v2.id);
    });

    it("replays a retried create and rejects a reused key with another body", async () => {
      const { trainer, relationshipId } = await withSubscription("pidem");
      const body = { amountPaise: 1_000, dueOn: today(), status: "unpaid" };
      const first = await send("POST", `${base(relationshipId)}/payments`, trainer, body, "pay-idem");
      const retry = await send("POST", `${base(relationshipId)}/payments`, trainer, body, "pay-idem");
      expect(first.status).toBe(201);
      expect(retry.status).toBe(201);
      expect(await retry.json()).toEqual(await first.json());
      expect(await db.select().from(schema.paymentRecords)).toHaveLength(1);
      const reused = await send(
        "POST",
        `${base(relationshipId)}/payments`,
        trainer,
        { ...body, amountPaise: 2_000 },
        "pay-idem",
      );
      expect(reused.status).toBe(409);
      expect((await errorOf(reused)).code).toBe("IDEMPOTENCY_KEY_REUSE");
      const missing = await send("POST", `${base(relationshipId)}/payments`, trainer, body);
      expect(missing.status).toBe(400);
      expect((await errorOf(missing)).code).toBe("IDEMPOTENCY_KEY_REQUIRED");
      expect(await db.select().from(schema.paymentRecords)).toHaveLength(1);
    });

    async function unpaidPayment(suffix: string) {
      const ctx = await withSubscription(suffix);
      const payment = await dataOf<PaymentOut>(
        await send(
          "POST",
          `${base(ctx.relationshipId)}/payments`,
          ctx.trainer,
          { amountPaise: 1_200_000, dueOn: today(), status: "unpaid", note: "Month 1" },
          `pay-${suffix}`,
        ),
      );
      return { ...ctx, payment, path: `${base(ctx.relationshipId)}/payments/${payment.id}` };
    }

    it("marks paid with date and method, then back to unpaid clears both (D-W6-22)", async () => {
      const { trainer, path, payment } = await unpaidPayment("ptoggle");
      const paid = await send(
        "PATCH",
        path,
        trainer,
        { status: "paid", paidOn: today(), method: "cash" },
        "patch-paid",
      );
      expect(paid.status).toBe(200);
      expect(await dataOf(paid)).toMatchObject({ status: "paid", paidOn: today(), method: "cash", note: "Month 1" });

      const unpaid = await send("PATCH", path, trainer, { status: "unpaid" }, "patch-unpaid");
      expect(unpaid.status).toBe(200);
      expect(await dataOf(unpaid)).toMatchObject({ status: "unpaid", paidOn: null, method: null });
      const [row] = await db
        .select()
        .from(schema.paymentRecords)
        .where(eq(schema.paymentRecords.id, payment.id));
      expect(row).toMatchObject({ status: "unpaid", paidOn: null, method: null, note: "Month 1" });
    });

    it("changes the method or note of a paid record without resending the rest", async () => {
      const { trainer, path } = await unpaidPayment("pedit");
      await send("PATCH", path, trainer, { status: "paid", paidOn: today(), method: "cash" }, "pedit-1");
      const method = await send("PATCH", path, trainer, { method: "bank" }, "pedit-2");
      expect(method.status).toBe(200);
      expect(await dataOf(method)).toMatchObject({ status: "paid", paidOn: today(), method: "bank" });
      const note = await send("PATCH", path, trainer, { note: null }, "pedit-3");
      expect(await dataOf(note)).toMatchObject({ method: "bank", note: null });
    });

    it.each([
      ["paid without a method", { status: "paid", paidOn: "2026-10-01" }, "PAYMENT_PAID_DETAILS_REQUIRED"],
      ["paid without a date", { status: "paid", method: "upi" }, "PAYMENT_PAID_DETAILS_REQUIRED"],
      ["a method on an unpaid record", { method: "upi" }, "PAYMENT_UNPAID_HAS_DETAILS"],
      ["a paid date on an unpaid record", { paidOn: "2026-10-01" }, "PAYMENT_UNPAID_HAS_DETAILS"],
      ["unpaid with a method", { status: "unpaid", method: "upi" }, "INVALID_REQUEST"],
      ["an amount change", { amountPaise: 5 }, "INVALID_REQUEST"],
      ["an empty body", {}, "INVALID_REQUEST"],
    ])("rejects %s with 400 and leaves the record unchanged", async (_label, body, code) => {
      const { trainer, path, payment } = await unpaidPayment("pbad");
      const [before] = await db
        .select()
        .from(schema.paymentRecords)
        .where(eq(schema.paymentRecords.id, payment.id));
      const response = await send("PATCH", path, trainer, body, "pbad-patch");
      expect(response.status).toBe(400);
      expect((await errorOf(response)).code).toBe(code);
      const [after] = await db
        .select()
        .from(schema.paymentRecords)
        .where(eq(schema.paymentRecords.id, payment.id));
      expect(after).toEqual(before);
    });

    it("clearing the method of a paid record is rejected (a paid record keeps a method)", async () => {
      const { trainer, path } = await unpaidPayment("pclear");
      await send("PATCH", path, trainer, { status: "paid", paidOn: today(), method: "cash" }, "pclear-1");
      const response = await send("PATCH", path, trainer, { method: null }, "pclear-2");
      expect(response.status).toBe(400);
      expect((await errorOf(response)).code).toBe("PAYMENT_PAID_DETAILS_REQUIRED");
    });

    it("replays a retried PATCH; an unknown payment id answers 404", async () => {
      const { trainer, path, relationshipId } = await unpaidPayment("pidemp");
      const body = { status: "paid", paidOn: today(), method: "upi" };
      const first = await send("PATCH", path, trainer, body, "pidemp-1");
      const retry = await send("PATCH", path, trainer, body, "pidemp-1");
      expect(await retry.json()).toEqual(await first.json());
      const missing = await send(
        "PATCH",
        `${base(relationshipId)}/payments/00000000-0000-4000-8000-000000000000`,
        trainer,
        body,
        "pidemp-2",
      );
      expect(missing.status).toBe(404);
      expect(await errorOf(missing)).toMatchObject({
        code: "PAYMENT_NOT_FOUND",
        message: "Payment record not found.",
      });
    });
  });

  describe("ended relationship", () => {
    it("reads still work and every write answers 409 RELATIONSHIP_ENDED with nothing written", async () => {
      const ctx = await withSubscription("ended");
      const payment = await dataOf<PaymentOut>(
        await send(
          "POST",
          `${base(ctx.relationshipId)}/payments`,
          ctx.trainer,
          { amountPaise: 1_000, dueOn: today(), status: "unpaid" },
          "ended-pay",
        ),
      );
      const ended = await send(
        "POST",
        `/relationships/${ctx.relationshipId}/end`,
        ctx.trainer,
        { reason: "paused" },
        "ended-end",
      );
      expect(ended.status).toBe(200);

      const read = await send("GET", base(ctx.relationshipId), ctx.trainer);
      expect(read.status).toBe(200);
      expect(await dataOf(read)).toMatchObject({ relationshipStatus: "ended", readOnly: true });

      const snapshot = async () => ({
        subs: await db.select().from(schema.subscriptionVersions),
        payments: await db.select().from(schema.paymentRecords),
      });
      const before = await snapshot();
      const writes: Array<[string, string, unknown]> = [
        ["PUT", `${base(ctx.relationshipId)}/subscription`, subscriptionBody({ expectedVersion: 1 })],
        ["POST", `${base(ctx.relationshipId)}/payments`, { amountPaise: 1, dueOn: today(), status: "unpaid" }],
        [
          "PATCH",
          `${base(ctx.relationshipId)}/payments/${payment.id}`,
          { status: "paid", paidOn: today(), method: "cash" },
        ],
      ];
      for (const [index, [method, path, body]] of writes.entries()) {
        for (let attempt = 0; attempt < 2; attempt++) {
          const response = await send(method, path, ctx.trainer, body, `ended-w-${index}`);
          expect(response.status, `${method} ${path}`).toBe(409);
          expect(await errorOf(response)).toMatchObject({
            code: "RELATIONSHIP_ENDED",
            message: "Coaching relationship has ended.",
          });
        }
      }
      expect(await snapshot()).toEqual(before);
    });

    it("a retry of a write that succeeded before the end replays the first answer", async () => {
      const ctx = await reachActive("cs-endreplay@example.com", "endreplay");
      const first = await send(
        "PUT",
        `${base(ctx.relationshipId)}/subscription`,
        ctx.trainer,
        subscriptionBody(),
        "endreplay-sub",
      );
      expect(first.status).toBe(200);
      await send("POST", `/relationships/${ctx.relationshipId}/end`, ctx.trainer, { reason: "paused" }, "endreplay-end");
      const retry = await send(
        "PUT",
        `${base(ctx.relationshipId)}/subscription`,
        ctx.trainer,
        subscriptionBody(),
        "endreplay-sub",
      );
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual(await first.json());
      expect(await db.select().from(schema.subscriptionVersions)).toHaveLength(1);
    });
  });

  describe("PATCH basic (Z6-8b, D-W6-42)", () => {
    type Basics = {
      displayName: string;
      phoneE164: string | null;
      clientDisplayName: string | null;
      contactPhoneE164: string | null;
    };

    async function relationshipBasics(relationshipId: string) {
      const [row] = await db
        .select({
          clientDisplayName: schema.coachingRelationships.clientDisplayName,
          contactPhoneE164: schema.coachingRelationships.contactPhoneE164,
          updatedAt: schema.coachingRelationships.updatedAt,
        })
        .from(schema.coachingRelationships)
        .where(eq(schema.coachingRelationships.id, relationshipId));
      return row!;
    }

    /** The client's own rows the PATCH must never write. */
    async function clientOwnRows(traineeUserId: string) {
      const [identity] = await db
        .select()
        .from(schema.userIdentities)
        .where(eq(schema.userIdentities.userId, traineeUserId));
      const [profile] = await db
        .select()
        .from(schema.traineeProfiles)
        .where(eq(schema.traineeProfiles.userId, traineeUserId));
      return { identity, profile };
    }

    it("stores a name and contact phone on the relationship only; GET returns them next to the client's own values", async () => {
      const ctx = await reachActive("cs-basic@example.com", "basic");
      await setPhone(db, ctx.traineeUserId, "+919000000123");
      const ownBefore = await clientOwnRows(ctx.traineeUserId);
      const relationshipBefore = await relationshipBasics(ctx.relationshipId);
      expect(relationshipBefore).toMatchObject({ clientDisplayName: null, contactPhoneE164: null });

      const response = await send(
        "PATCH",
        `${base(ctx.relationshipId)}/basic`,
        ctx.trainer,
        { displayName: "  Asha (Tuesday batch)  ", contactPhone: "+91 98765-43210" },
        "basic-set",
      );
      expect(response.status).toBe(200);
      const data = await dataOf<{ relationshipId: string; basics: Basics }>(response);
      expect(data.relationshipId).toBe(ctx.relationshipId);
      expect(data.basics).toEqual({
        displayName: ownBefore.profile!.displayName,
        phoneE164: "+919000000123",
        clientDisplayName: "Asha (Tuesday batch)",
        contactPhoneE164: "+919876543210",
      });
      expect(await relationshipBasics(ctx.relationshipId)).toEqual({
        clientDisplayName: "Asha (Tuesday batch)",
        contactPhoneE164: "+919876543210",
        // Nothing the client sees changed, so the relationship's version time stays.
        updatedAt: relationshipBefore.updatedAt,
      });
      // The sign-in identifier and the client's own profile are untouched.
      expect(await clientOwnRows(ctx.traineeUserId)).toEqual(ownBefore);

      const read = await dataOf<{ basics: Basics }>(
        await send("GET", base(ctx.relationshipId), ctx.trainer),
      );
      expect(read.basics).toEqual(data.basics);
    });

    it("changes only the field sent, and null clears a value", async () => {
      const ctx = await reachActive("cs-basicclear@example.com", "basicclear");
      const ownBefore = await clientOwnRows(ctx.traineeUserId);
      const patch = async (body: unknown, key: string) => {
        const response = await send("PATCH", `${base(ctx.relationshipId)}/basic`, ctx.trainer, body, key);
        expect(response.status, key).toBe(200);
        return (await dataOf<{ basics: Basics }>(response)).basics;
      };
      expect(await patch({ displayName: "Asha", contactPhone: "9876543210" }, "clr-1")).toMatchObject({
        clientDisplayName: "Asha",
        contactPhoneE164: "+919876543210",
      });
      expect(await patch({ contactPhone: "+44 7700 900123" }, "clr-2")).toMatchObject({
        clientDisplayName: "Asha",
        contactPhoneE164: "+447700900123",
      });
      expect(await patch({ displayName: null }, "clr-3")).toMatchObject({
        clientDisplayName: null,
        contactPhoneE164: "+447700900123",
      });
      expect(await patch({ contactPhone: null }, "clr-4")).toMatchObject({
        clientDisplayName: null,
        contactPhoneE164: null,
      });
      expect(await relationshipBasics(ctx.relationshipId)).toMatchObject({
        clientDisplayName: null,
        contactPhoneE164: null,
      });
      const longest = "N".repeat(120);
      expect(await patch({ displayName: longest }, "clr-5")).toMatchObject({ clientDisplayName: longest });
      expect(await clientOwnRows(ctx.traineeUserId)).toEqual(ownBefore);
    });

    it("rejects an empty body, a blank or too long name, a phone that does not normalise and unknown fields with static 400s", async () => {
      const ctx = await reachActive("cs-basicbad@example.com", "basicbad");
      await send(
        "PATCH",
        `${base(ctx.relationshipId)}/basic`,
        ctx.trainer,
        { displayName: "Kept name", contactPhone: "9876543210" },
        "bad-seed",
      );
      const before = await relationshipBasics(ctx.relationshipId);
      const ownBefore = await clientOwnRows(ctx.traineeUserId);
      const rejected: Array<[string, unknown, string]> = [
        ["empty body", {}, "Invalid client details."],
        ["blank name", { displayName: "    " }, "Invalid client details."],
        ["name over 120", { displayName: "N".repeat(121) }, "Invalid client details."],
        ["name not text", { displayName: 42 }, "Invalid client details."],
        ["phone too short to send", { contactPhone: "98765" }, "Invalid client details."],
        ["phone too long to send", { contactPhone: "9".repeat(21) }, "Invalid client details."],
        ["phone without digits", { contactPhone: "call-me-later" }, "Contact phone is not a valid phone number."],
        ["phone with too few digits", { contactPhone: "98-765-43" }, "Contact phone is not a valid phone number."],
        ["phone with too many digits", { contactPhone: "+1234567890123456" }, "Contact phone is not a valid phone number."],
        ["goal field", { displayName: "Asha", goal: "Lose 6 kg" }, "Invalid client details."],
        ["sign-in phone field", { phoneE164: "+919999999999" }, "Invalid client details."],
        ["not an object", "Asha", "Invalid client details."],
      ];
      for (const [index, [label, body, message]] of rejected.entries()) {
        const response = await send(
          "PATCH",
          `${base(ctx.relationshipId)}/basic`,
          ctx.trainer,
          body,
          `bad-${index}`,
        );
        expect(response.status, label).toBe(400);
        const text = await response.text();
        const error = (JSON.parse(text) as { error: { code: string; message: string } }).error;
        expect(error, label).toMatchObject({ code: "INVALID_REQUEST", message });
        // The rejected value is never echoed back.
        for (const secret of ["call-me-later", "98-765-43", "Lose 6 kg", "+919999999999"]) {
          expect(text, label).not.toContain(secret);
        }
      }
      expect(await relationshipBasics(ctx.relationshipId)).toEqual(before);
      expect(await clientOwnRows(ctx.traineeUserId)).toEqual(ownBefore);
    });

    it("needs an Idempotency-Key, replays a retry without a second write and rejects a reused key", async () => {
      const ctx = await reachActive("cs-basickey@example.com", "basickey");
      const path = `${base(ctx.relationshipId)}/basic`;
      const missing = await send("PATCH", path, ctx.trainer, { displayName: "Asha" });
      expect(missing.status).toBe(400);
      expect(await errorOf(missing)).toMatchObject({
        code: "IDEMPOTENCY_KEY_REQUIRED",
        message: "Idempotency-Key header is required.",
      });
      expect(await relationshipBasics(ctx.relationshipId)).toMatchObject({ clientDisplayName: null });

      const body = { displayName: "Asha", contactPhone: "9876543210" };
      const first = await send("PATCH", path, ctx.trainer, body, "basic-key-1");
      expect(first.status).toBe(200);
      const firstJson = await first.json();
      // A later change made elsewhere: a replay must not write the old values back.
      await db
        .update(schema.coachingRelationships)
        .set({ clientDisplayName: "Changed later" })
        .where(eq(schema.coachingRelationships.id, ctx.relationshipId));
      const replay = await send("PATCH", path, ctx.trainer, body, "basic-key-1");
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual(firstJson);
      expect(await relationshipBasics(ctx.relationshipId)).toMatchObject({
        clientDisplayName: "Changed later",
      });

      const reused = await send("PATCH", path, ctx.trainer, { displayName: "Someone else" }, "basic-key-1");
      expect(reused.status).toBe(409);
      expect(await errorOf(reused)).toMatchObject({
        code: "IDEMPOTENCY_KEY_REUSE",
        message: "Idempotency key was reused with a different request.",
      });
      expect(await relationshipBasics(ctx.relationshipId)).toMatchObject({
        clientDisplayName: "Changed later",
        contactPhoneE164: "+919876543210",
      });
      const receipts = await db
        .select()
        .from(schema.idempotencyRecords)
        .where(eq(schema.idempotencyRecords.operation, "client_settings.basics.patch"));
      expect(receipts).toHaveLength(1);
    });

    it("an ended relationship answers 409 and keeps its values; the owner still reads them", async () => {
      const ctx = await reachActive("cs-basicend@example.com", "basicend");
      const path = `${base(ctx.relationshipId)}/basic`;
      const set = await send("PATCH", path, ctx.trainer, { displayName: "Asha", contactPhone: "9876543210" }, "end-set");
      expect(set.status).toBe(200);
      const ended = await send("POST", `/relationships/${ctx.relationshipId}/end`, ctx.trainer, { reason: "paused" }, "end-basic");
      expect(ended.status).toBe(200);
      for (const [index, body] of [{ displayName: "Other" }, { contactPhone: null }].entries()) {
        const response = await send("PATCH", path, ctx.trainer, body, `end-w-${index}`);
        expect(response.status).toBe(409);
        expect(await errorOf(response)).toMatchObject({
          code: "RELATIONSHIP_ENDED",
          message: "Coaching relationship has ended.",
        });
      }
      expect(await relationshipBasics(ctx.relationshipId)).toMatchObject({
        clientDisplayName: "Asha",
        contactPhoneE164: "+919876543210",
      });
      const read = await send("GET", base(ctx.relationshipId), ctx.trainer);
      expect(read.status).toBe(200);
      expect(await dataOf<{ readOnly: boolean; basics: Basics }>(read)).toMatchObject({
        readOnly: true,
        basics: { clientDisplayName: "Asha", contactPhoneE164: "+919876543210" },
      });
      // A retry of the PATCH that succeeded before the end replays its answer.
      const retry = await send("PATCH", path, ctx.trainer, { displayName: "Asha", contactPhone: "9876543210" }, "end-set");
      expect(retry.status).toBe(200);
    });

    describe("write races and the active guard (Z7-25)", () => {
      async function receiptCount() {
        return (
          await db
            .select()
            .from(schema.idempotencyRecords)
            .where(eq(schema.idempotencyRecords.operation, "client_settings.basics.patch"))
        ).length;
      }

      /** The owning trainer, read from the relationship the routes created. */
      async function ownerOf(relationshipId: string) {
        const [row] = await db
          .select({ id: schema.coachingRelationships.trainerUserId })
          .from(schema.coachingRelationships)
          .where(eq(schema.coachingRelationships.id, relationshipId));
        return row;
      }

      function writeContext(trainerUserId: string, key: string) {
        return {
          actorUserId: trainerUserId,
          idempotencyKey: key,
          fingerprint: `fp-${key}`,
          now: new Date().toISOString(),
        };
      }

      it("overlapping name-only and phone-only PATCHes both persist", async () => {
        const ctx = await reachActive("cs-race@example.com", "race");
        const path = `${base(ctx.relationshipId)}/basic`;
        const ownBefore = await clientOwnRows(ctx.traineeUserId);
        const [named, phoned] = await Promise.all([
          send("PATCH", path, ctx.trainer, { displayName: "Asha" }, "race-name"),
          send("PATCH", path, ctx.trainer, { contactPhone: "9876543210" }, "race-phone"),
        ]);
        expect(named.status).toBe(200);
        expect(phoned.status).toBe(200);
        expect(await relationshipBasics(ctx.relationshipId)).toMatchObject({
          clientDisplayName: "Asha",
          contactPhoneE164: "+919876543210",
        });
        // Each answer carries at least its own field.
        expect((await dataOf<{ basics: Basics }>(named)).basics.clientDisplayName).toBe("Asha");
        expect((await dataOf<{ basics: Basics }>(phoned)).basics.contactPhoneE164).toBe("+919876543210");
        expect(await clientOwnRows(ctx.traineeUserId)).toEqual(ownBefore);
      });

      it("a write built from a stale read never puts back the other field's old value", async () => {
        const ctx = await reachActive("cs-stale@example.com", "stale");
        const path = `${base(ctx.relationshipId)}/basic`;
        const seeded = await send(
          "PATCH",
          path,
          ctx.trainer,
          { displayName: "Old name", contactPhone: "9000000001" },
          "stale-seed",
        );
        expect(seeded.status).toBe(200);
        const ownBefore = await clientOwnRows(ctx.traineeUserId);
        // Request A reads the relationship (both old values)...
        const trainer = await ownerOf(ctx.relationshipId);
        const staleRow = await loadOwnedRelationship(db, ctx.relationshipId, trainer!.id);
        expect(staleRow).toMatchObject({ clientDisplayName: "Old name" });
        // ...request B changes the name and lands first...
        const renamed = await send("PATCH", path, ctx.trainer, { displayName: "New name" }, "stale-b");
        expect(renamed.status).toBe(200);
        // ...then request A writes only the phone it was sent.
        const result = await saveClientBasics(
          db,
          staleRow!,
          { contactPhoneE164: "+919000000002" },
          writeContext(trainer!.id, "stale-a"),
        );
        expect(result.kind).toBe("saved");
        if (result.kind !== "saved") return;
        expect(result.body.data.basics).toMatchObject({
          clientDisplayName: "New name",
          contactPhoneE164: "+919000000002",
        });
        expect(await relationshipBasics(ctx.relationshipId)).toMatchObject({
          clientDisplayName: "New name",
          contactPhoneE164: "+919000000002",
        });
        expect(await clientOwnRows(ctx.traineeUserId)).toEqual(ownBefore);
      });

      it("a relationship that ends after the read is refused at write time with no change and no receipt", async () => {
        const ctx = await reachActive("cs-endrace@example.com", "endrace");
        const path = `${base(ctx.relationshipId)}/basic`;
        const seeded = await send(
          "PATCH",
          path,
          ctx.trainer,
          { displayName: "Asha", contactPhone: "9876543210" },
          "endrace-seed",
        );
        expect(seeded.status).toBe(200);
        const trainer = await ownerOf(ctx.relationshipId);
        const staleRow = await loadOwnedRelationship(db, ctx.relationshipId, trainer!.id);
        expect(staleRow?.status).toBe("active");
        const ended = await send(
          "POST",
          `/relationships/${ctx.relationshipId}/end`,
          ctx.trainer,
          { reason: "paused" },
          "endrace-end",
        );
        expect(ended.status).toBe(200);
        const before = await relationshipBasics(ctx.relationshipId);
        const ownBefore = await clientOwnRows(ctx.traineeUserId);
        const receiptsBefore = await receiptCount();
        for (const [index, patch] of [
          { clientDisplayName: "Late rename" },
          { contactPhoneE164: null },
          { clientDisplayName: null, contactPhoneE164: "+919000000003" },
        ].entries()) {
          const result = await saveClientBasics(
            db,
            staleRow!,
            patch,
            writeContext(trainer!.id, `endrace-${index}`),
          );
          expect(result).toEqual({ kind: "ended" });
        }
        expect(await relationshipBasics(ctx.relationshipId)).toEqual(before);
        expect(await clientOwnRows(ctx.traineeUserId)).toEqual(ownBefore);
        expect(await receiptCount()).toBe(receiptsBefore);
        // Through the route the same refusal is the static RELATIONSHIP_ENDED.
        const response = await send("PATCH", path, ctx.trainer, { displayName: "Late" }, "endrace-route");
        expect(response.status).toBe(409);
        expect(await errorOf(response)).toMatchObject({
          code: "RELATIONSHIP_ENDED",
          message: "Coaching relationship has ended.",
        });
        expect(await relationshipBasics(ctx.relationshipId)).toEqual(before);
      });

      it("a stale row for another trainer's relationship writes nothing", async () => {
        const ctx = await reachActive("cs-staleowner@example.com", "staleowner");
        const trainer = await ownerOf(ctx.relationshipId);
        const row = await loadOwnedRelationship(db, ctx.relationshipId, trainer!.id);
        const before = await relationshipBasics(ctx.relationshipId);
        const result = await saveClientBasics(
          db,
          { ...row!, trainerUserId: "00000000-0000-4000-8000-000000000000" },
          { clientDisplayName: "Taken over" },
          writeContext(trainer!.id, "staleowner"),
        );
        expect(result).toEqual({ kind: "not_found" });
        expect(await relationshipBasics(ctx.relationshipId)).toEqual(before);
        expect(await receiptCount()).toBe(0);
      });

      it("a same-key write that loses the receipt does not leave its update behind", async () => {
        const ctx = await reachActive("cs-loser@example.com", "loser");
        const trainer = await ownerOf(ctx.relationshipId);
        const row = await loadOwnedRelationship(db, ctx.relationshipId, trainer!.id);
        const first = await saveClientBasics(
          db,
          row!,
          { clientDisplayName: "Asha", contactPhoneE164: "+919876543210" },
          writeContext(trainer!.id, "lose-key"),
        );
        expect(first.kind).toBe("saved");
        if (first.kind !== "saved") return;
        expect(first.body.data.basics.clientDisplayName).toBe("Asha");
        // A third patch lands after the winner and before the loser.
        await db
          .update(schema.coachingRelationships)
          .set({ clientDisplayName: "Kept" })
          .where(eq(schema.coachingRelationships.id, ctx.relationshipId));
        const kept = await relationshipBasics(ctx.relationshipId);
        const receiptsBefore = await receiptCount();
        // Same key, different body: the loser already passed the route's receipt
        // lookup. Its UPDATE must roll back with the failed receipt insert.
        await expect(
          saveClientBasics(
            db,
            row!,
            { clientDisplayName: "Loser" },
            { ...writeContext(trainer!.id, "lose-key"), fingerprint: "fp-lose-other" },
          ),
        ).rejects.toThrow();
        expect(await relationshipBasics(ctx.relationshipId)).toEqual(kept);
        // Same key, same body as the winner: a retry must not put "Asha" back over "Kept".
        await expect(
          saveClientBasics(
            db,
            row!,
            { clientDisplayName: "Asha", contactPhoneE164: "+919876543210" },
            writeContext(trainer!.id, "lose-key"),
          ),
        ).rejects.toThrow();
        expect(await relationshipBasics(ctx.relationshipId)).toEqual(kept);
        expect(await receiptCount()).toBe(receiptsBefore);
        const [receipt] = await db
          .select()
          .from(schema.idempotencyRecords)
          .where(eq(schema.idempotencyRecords.operation, "client_settings.basics.patch"));
        expect(JSON.parse(receipt!.responseBody)).toEqual(first.body);
      });

      it("a relationship that ends before the batched write stores no success receipt", async () => {
        const ctx = await reachActive("cs-endbatch@example.com", "endbatch");
        const trainer = await ownerOf(ctx.relationshipId);
        const row = await loadOwnedRelationship(db, ctx.relationshipId, trainer!.id);
        const seeded = await saveClientBasics(
          db,
          row!,
          { clientDisplayName: "Asha", contactPhoneE164: "+919876543210" },
          writeContext(trainer!.id, "endbatch-seed"),
        );
        expect(seeded.kind).toBe("saved");
        const before = await relationshipBasics(ctx.relationshipId);
        const receiptsBefore = await receiptCount();
        const realBatch = db.batch.bind(db);
        vi.spyOn(db, "batch").mockImplementation((async (queries: Parameters<typeof db.batch>[0]) => {
          expect(queries).toHaveLength(2);
          await db
            .update(schema.coachingRelationships)
            .set({ status: "ended" })
            .where(eq(schema.coachingRelationships.id, ctx.relationshipId));
          return realBatch(queries);
        }) as unknown as typeof db.batch);
        const result = await saveClientBasics(
          db,
          row!,
          { clientDisplayName: "Late rename" },
          writeContext(trainer!.id, "endbatch-late"),
        );
        expect(result).toEqual({ kind: "ended" });
        expect(await relationshipBasics(ctx.relationshipId)).toEqual(before);
        expect(await receiptCount()).toBe(receiptsBefore);
      });
    });

    it("other unknown paths keep the static 404", async () => {
      const { trainer, relationshipId } = await reachActive("cs-unknown@example.com", "unknown");
      for (const [method, path] of [
        ["PATCH", `${base(relationshipId)}/goal`],
        ["PUT", `${base(relationshipId)}/basic`],
        ["GET", `${base(relationshipId)}/basic/extra`],
      ] as const) {
        const body = method === "GET" ? undefined : { displayName: "Asha" };
        const response = await send(method, path, trainer, body, `unknown-${method}`);
        expect(response.status, `${method} ${path}`).toBe(404);
        expect(await errorOf(response)).toMatchObject({
          code: "not_implemented",
          message: "This endpoint is not available yet.",
        });
      }
    });
  });

  it("logs no name, phone, note or amount across every endpoint, basics included (log spy)", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    const ctx = await reachActive("cs-logs@example.com", "logs");
    const phone = "+919876543210";
    await setPhone(db, ctx.traineeUserId, phone);
    const note = "Paid by cousin Ramesh";
    const planName = "Priya private plan";
    spies.forEach((spy) => spy.mockClear());

    const read = await dataOf<{ basics: { phoneE164: string | null } }>(
      await send("GET", base(ctx.relationshipId), ctx.trainer),
    );
    expect(read.basics.phoneE164).toBe(phone);
    await send(
      "PUT",
      `${base(ctx.relationshipId)}/subscription`,
      ctx.trainer,
      subscriptionBody({ planName, amountPaise: 4_242_400 }),
      "logs-sub",
    );
    // A rejected body must not be echoed to the logs either.
    await send(
      "PUT",
      `${base(ctx.relationshipId)}/subscription`,
      ctx.trainer,
      subscriptionBody({ planName, renewsOn: "2000-01-01" }),
      "logs-bad",
    );
    const payment = await dataOf<PaymentOut>(
      await send(
        "POST",
        `${base(ctx.relationshipId)}/payments`,
        ctx.trainer,
        { amountPaise: 4_242_400, dueOn: today(), status: "unpaid", note },
        "logs-pay",
      ),
    );
    await send(
      "PATCH",
      `${base(ctx.relationshipId)}/payments/${payment.id}`,
      ctx.trainer,
      { status: "paid", paidOn: today(), method: "upi", note },
      "logs-patch",
    );
    const clientName = "Kavitha nightshift";
    const contactPhone = "+91 90123 45678";
    await send(
      "PATCH",
      `${base(ctx.relationshipId)}/basic`,
      ctx.trainer,
      { displayName: clientName, contactPhone },
      "logs-basic",
    );
    // Rejected basics must not be echoed to the logs either.
    await send(
      "PATCH",
      `${base(ctx.relationshipId)}/basic`,
      ctx.trainer,
      { displayName: clientName, contactPhone: "90123-45" },
      "logs-basic-bad",
    );
    await send("GET", base(ctx.relationshipId), ctx.trainer);
    await send("POST", `/relationships/${ctx.relationshipId}/end`, ctx.trainer, { reason: "paused" }, "logs-end");
    await send(
      "PATCH",
      `${base(ctx.relationshipId)}/basic`,
      ctx.trainer,
      { displayName: clientName },
      "logs-basic-ended",
    );
    await send(
      "POST",
      `${base(ctx.relationshipId)}/payments`,
      ctx.trainer,
      { amountPaise: 4_242_400, dueOn: today(), status: "unpaid", note },
      "logs-ended",
    );

    const [profile] = await db
      .select()
      .from(schema.traineeProfiles)
      .where(eq(schema.traineeProfiles.userId, ctx.traineeUserId));
    const logged = spies
      .flatMap((spy) => spy.mock.calls)
      .map((args) => args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg) ?? String(arg))).join(" "))
      .join("\n");
    for (const secret of [
      phone,
      "9876543210",
      note,
      planName,
      "4242400",
      profile!.displayName,
      clientName,
      "9012345678",
      "90123 45678",
      "90123-45",
    ]) {
      expect(logged).not.toContain(secret);
    }
  });
});

describe("Z6-8 demo seed reset with payment records (D-W6-22)", () => {
  it(
    "a seeded DB holding a payment record re-applies the demo seed with valid foreign keys",
    async () => {
      const reference = "2026-10-17T14:30:00.000Z";
      const handle = await createDemoSeededDb(reference);
      try {
        setTestDbOverride(handle.db);
        // Rahul records a payment through the production route.
        const login = await app.request(
          "/auth/login",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              identifier: "rahul.coach@demo.fitbud.test",
              password: DEMO_PASSWORD_PLAINTEXT,
            }),
          },
          testEnv(),
        );
        expect(login.status).toBe(200);
        const token = ((await login.json()) as { data: { token: string } }).data.token;
        const trainer = { Authorization: `Bearer ${token}`, "x-fitbud-role": "trainer" };
        const rahulId = demoUuid("user", "rahul.coach@demo.fitbud.test");
        const relationshipId = (
          await handle.db
            .select()
            .from(schema.coachingRelationships)
            .where(eq(schema.coachingRelationships.trainerUserId, rahulId))
        ).find((row) => row.status === "active")!.id;
        const settings = await dataOf<{ subscription: { versionNumber: number } | null }>(
          await send("GET", `/client-settings/relationships/${relationshipId}`, trainer),
        );
        if (!settings.subscription) {
          const saved = await send(
            "PUT",
            `/client-settings/relationships/${relationshipId}/subscription`,
            trainer,
            {
              expectedVersion: 0,
              planName: "Fat loss 12-week",
              paymentFrequency: "monthly",
              startsOn: "2026-09-24",
              renewsOn: "2026-10-24",
              amountPaise: 1_200_000,
              subscriptionType: "monthly",
              coachingMode: "online",
            },
            "seed-wipe-sub",
          );
          expect(saved.status).toBe(200);
        }
        const created = await send(
          "POST",
          `/client-settings/relationships/${relationshipId}/payments`,
          trainer,
          { amountPaise: 1_200_000, dueOn: "2026-10-17", status: "paid", paidOn: "2026-10-17", method: "upi" },
          "seed-wipe-pay",
        );
        expect(created.status).toBe(201);
        const count = () =>
          handle.sqlite.exec("SELECT COUNT(*) FROM payment_records")[0]?.values[0]?.[0];
        expect(count()).toBe(1);

        const sql = buildDemoSeedSql({
          referenceInstant: reference,
          passwordHash: await hashPassword(DEMO_PASSWORD_PLAINTEXT),
          libraryIndex: loadDemoLibraryIndex(handle.sqlite),
        });
        handle.sqlite.exec(sql);
        assertNoForeignKeyViolations(handle.sqlite);
        expect(count()).toBe(0);
      } finally {
        setTestDbOverride(null);
        handle.close();
      }
    },
    180_000,
  );
});
