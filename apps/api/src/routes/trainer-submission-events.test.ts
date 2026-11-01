import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAFE_PUSH_PAYLOAD_KEYS } from "@fitbud/contracts";
import { formatLocalDate } from "@fitbud/core";
import * as schema from "../db/schema.js";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { nowIso } from "../lib/crypto.js";
import { storeInboxNotification } from "../domain/inbox-notify.js";
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
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    PUSH_PROVIDER_MODE: "expo",
    EXPO_ACCESS_TOKEN: "test-expo-access-token-x4h",
  };
}

type Actor = { headers: Record<string, string> };
type Ctx = Awaited<ReturnType<typeof setup>>;

async function call(
  actor: Actor,
  method: string,
  path: string,
  key: string | null,
  body: unknown,
) {
  return app.request(
    path,
    {
      method,
      headers: {
        ...actor.headers,
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: JSON.stringify(body),
    },
    testEnv(),
  );
}

async function setup(suffix: string) {
  const session = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken: createTestIdToken(`tse-coach-${suffix}`, `tse-coach-${suffix}@example.com`),
        timezone: "Asia/Kolkata",
      }),
    },
    testEnv(),
  );
  const trainer: Actor = {
    headers: { Cookie: session.headers.get("set-cookie")!.split(";")[0]! },
  };
  const invite = await call(trainer, "POST", "/invitations", `tse-inv-${suffix}`, {
    recipientEmail: `tse-trainee-${suffix}@example.com`,
  });
  const token = ((await invite.json()) as { data: { token: string } }).data.token;
  const trainee: Actor = {
    headers: {
      Authorization: `Bearer ${createTestIdToken(`tse-trainee-${suffix}`, `tse-trainee-${suffix}@example.com`)}`,
      "x-fitbud-role": "trainee",
    },
  };
  const accept = await call(trainee, "POST", "/invitations/accept", null, {
    token,
    timezone: "Asia/Kolkata",
  });
  const relationshipId = (
    (await accept.json()) as { data: { relationship: { id: string } } }
  ).data.relationship.id;
  return { trainer, trainee, relationshipId };
}

const INTAKE_ANSWERS = {
  goals: "Recomp",
  relevant_history: "None",
  preferences: "Home food",
  schedule: "Evenings",
  limitations: "None",
};

async function saveIntakeDraft(ctx: Ctx, answers: Record<string, string>) {
  const res = await call(
    ctx.trainee,
    "PUT",
    `/onboarding/relationships/${ctx.relationshipId}/draft`,
    null,
    { expectedVersion: 0, answers },
  );
  expect(res.status).toBe(201);
}

function submitIntake(ctx: Ctx, key: string) {
  return call(
    ctx.trainee,
    "POST",
    `/onboarding/relationships/${ctx.relationshipId}/submit`,
    key,
    { expectedVersion: 1 },
  );
}

async function reachActive(ctx: Ctx, suffix: string) {
  const { trainer, relationshipId } = ctx;
  await saveIntakeDraft(ctx, INTAKE_ANSWERS);
  expect((await submitIntake(ctx, `tse-int-${suffix}`)).status).toBe(200);
  await call(
    trainer,
    "POST",
    `/onboarding/relationships/${relationshipId}/review`,
    `tse-rev-${suffix}`,
    { outcome: "coaching_ready" },
  );
  await call(trainer, "PUT", `/configurations/relationships/${relationshipId}/draft`, null, {
    expectedVersion: 0,
    goalShort: "Check-in cadence",
    workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
    nutrition: { mealsPerDay: 2, confirmationWindowHours: 24, photoRequirement: "none" },
    checkin: { cadence: "weekly", dueWindowHours: 48 },
    tracking: { requireBodyWeight: false, requireProgressPhotos: false, requireSessionRpe: false },
  });
  await call(
    trainer,
    "POST",
    `/configurations/relationships/${relationshipId}/configure`,
    `tse-cfg-${suffix}`,
    { expectedVersion: 1 },
  );
  await call(
    trainer,
    "POST",
    `/configurations/relationships/${relationshipId}/activate`,
    `tse-act-${suffix}`,
    { expectedVersion: 2 },
  );
}

async function scheduleCheckin(ctx: Ctx, suffix: string) {
  const res = await call(
    ctx.trainer,
    "POST",
    `/checkins/relationships/${ctx.relationshipId}/schedule`,
    `tse-sch-${suffix}`,
    { localDate: formatLocalDate(new Date(), "Asia/Kolkata") },
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { checkin: { id: string; recordVersion: number } } }).data
    .checkin;
}

async function endRelationship(db: Db, relationshipId: string) {
  const endedAt = nowIso();
  await db
    .update(schema.coachingRelationships)
    .set({ status: "ended", endedAt, updatedAt: endedAt })
    .where(eq(schema.coachingRelationships.id, relationshipId));
}

const TRAINER_DEVICE_TOKEN = "ExponentPushToken[x4h-trainer-phone]";
type ExpoMessage = Record<string, unknown> & {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
};

const CHECKIN_ANSWERS = { wellbeing: "Strong week", notes: "Sleep was better", bodyWeightKg: 72.5 };

describe("trainer inbox events on submit (X4h)", () => {
  let db: Db;
  let close: () => void;
  let expoCalls: ExpoMessage[];

  function events(type: "trainer_checkin_submitted" | "trainer_intake_submitted") {
    return db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.notificationType, type));
  }

  async function trainerUserId(relationshipId: string) {
    const [row] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, relationshipId));
    return row!.trainerUserId;
  }

  /** Registers an active Expo device for the relationship's trainer. */
  async function registerTrainerDevice(relationshipId: string) {
    const userId = await trainerUserId(relationshipId);
    const now = nowIso();
    await db.insert(schema.deviceTokens).values({
      id: "x4h-trainer-phone",
      userId,
      platform: "android",
      provider: "expo",
      token: TRAINER_DEVICE_TOKEN,
      installationId: "x4h-trainer-phone-install",
      status: "active",
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  function deliveries() {
    return db.select().from(schema.notificationDeliveries);
  }

  beforeEach(async () => {
    // Midday in the trainer's timezone, so the default quiet hours never apply.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const noonIst = new Date();
    noonIst.setUTCHours(6, 30, 0, 0);
    vi.setSystemTime(noonIst);
    expoCalls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (_url, init) => {
        const body = JSON.parse(String(init!.body)) as ExpoMessage[];
        expoCalls.push(...body);
        return Response.json({
          data: body.map((_, i) => ({ status: "ok", id: `ticket-${expoCalls.length}-${i}` })),
        });
      }),
    );
    const handle = await createMemoryDb();
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setTestDbOverride(null);
    close();
  });

  it("intake submit stores one event for the trainer, routed by relationship id; replay adds none", async () => {
    const ctx = await setup("intake");
    await saveIntakeDraft(ctx, INTAKE_ANSWERS);
    await registerTrainerDevice(ctx.relationshipId);
    expect(await events("trainer_intake_submitted")).toHaveLength(0);

    expect((await submitIntake(ctx, "tse-intake-1")).status).toBe(200);
    const stored = await events("trainer_intake_submitted");
    expect(stored).toHaveLength(1);
    const event = stored[0]!;
    expect(event.recipientUserId).toBe(await trainerUserId(ctx.relationshipId));
    expect(event.coachingRelationshipId).toBe(ctx.relationshipId);
    expect(event.domainEntityType).toBe("coaching_relationship");
    expect(event.domainEntityId).toBe(ctx.relationshipId);

    expect(expoCalls).toHaveLength(1);
    expect(expoCalls[0]!.to).toBe(TRAINER_DEVICE_TOKEN);
    expect(Object.keys(expoCalls[0]!.data).sort()).toEqual([...SAFE_PUSH_PAYLOAD_KEYS].sort());
    expect(expoCalls[0]!.data).toMatchObject({
      notificationId: event.id,
      notificationType: "trainer_intake_submitted",
      domainEntityType: "coaching_relationship",
      domainEntityId: ctx.relationshipId,
    });
    expect(expoCalls[0]!.title).toBe("FitBud");
    expect(expoCalls[0]!.body).toBe("Intake submitted");
    expect(await deliveries()).toHaveLength(1);

    // Same key replays; a new key on the already-submitted response also adds nothing.
    expect((await submitIntake(ctx, "tse-intake-1")).status).toBe(200);
    expect((await submitIntake(ctx, "tse-intake-2")).status).toBe(200);
    expect(await events("trainer_intake_submitted")).toHaveLength(1);
    expect(expoCalls).toHaveLength(1);
    expect(await deliveries()).toHaveLength(1);
  });

  it("rejected intake submits (incomplete, ended) store nothing", async () => {
    const ctx = await setup("intake-bad");
    await saveIntakeDraft(ctx, { goals: "Recomp" });
    expect((await submitIntake(ctx, "tse-bad-1")).status).toBe(422);
    expect(await events("trainer_intake_submitted")).toHaveLength(0);

    await endRelationship(db, ctx.relationshipId);
    expect((await submitIntake(ctx, "tse-bad-2")).status).toBe(409);
    expect(await events("trainer_intake_submitted")).toHaveLength(0);
  });

  it("check-in submit stores one event routed by check-in id; replay adds none", async () => {
    const ctx = await setup("checkin");
    await reachActive(ctx, "checkin");
    const checkin = await scheduleCheckin(ctx, "checkin");
    await registerTrainerDevice(ctx.relationshipId);
    expoCalls.length = 0;
    expect(await events("trainer_checkin_submitted")).toHaveLength(0);

    const submit = (key: string, version = checkin.recordVersion) =>
      call(ctx.trainee, "POST", `/checkins/${checkin.id}/submit`, key, {
        expectedVersion: version,
        answers: CHECKIN_ANSWERS,
      });

    expect((await submit("tse-ci-1")).status).toBe(200);
    const stored = await events("trainer_checkin_submitted");
    expect(stored).toHaveLength(1);
    const event = stored[0]!;
    expect(event.recipientUserId).toBe(await trainerUserId(ctx.relationshipId));
    expect(event.coachingRelationshipId).toBe(ctx.relationshipId);
    expect(event.domainEntityType).toBe("checkin");
    expect(event.domainEntityId).toBe(checkin.id);
    expect(event.dedupeKey).toBe(`checkin-submitted:${checkin.id}`);

    expect(expoCalls).toHaveLength(1);
    expect(expoCalls[0]!.to).toBe(TRAINER_DEVICE_TOKEN);
    expect(Object.keys(expoCalls[0]!.data).sort()).toEqual([...SAFE_PUSH_PAYLOAD_KEYS].sort());
    expect(expoCalls[0]!.data).toMatchObject({
      notificationId: event.id,
      notificationType: "trainer_checkin_submitted",
      domainEntityType: "checkin",
      domainEntityId: checkin.id,
    });
    expect(expoCalls[0]!.title).toBe("FitBud");
    expect(expoCalls[0]!.body).toBe("Check-in submitted");
    expect(await deliveries()).toHaveLength(1);

    // Idempotent replay, then a different key on the already-submitted check-in (422).
    expect((await submit("tse-ci-1")).status).toBe(200);
    expect((await submit("tse-ci-2", 1)).status).toBe(422);
    expect(await events("trainer_checkin_submitted")).toHaveLength(1);
    expect(expoCalls).toHaveLength(1);
    expect(await deliveries()).toHaveLength(1);
  });

  it("rejected check-in submits (stale version, missing answers, ended) store nothing", async () => {
    const ctx = await setup("checkin-bad");
    await reachActive(ctx, "checkin-bad");
    const checkin = await scheduleCheckin(ctx, "checkin-bad");
    const submit = (key: string, version: number, answers: Record<string, unknown>) =>
      call(ctx.trainee, "POST", `/checkins/${checkin.id}/submit`, key, {
        expectedVersion: version,
        answers,
      });

    expect((await submit("tse-cib-1", checkin.recordVersion + 5, CHECKIN_ANSWERS)).status).toBe(409);
    expect([400, 422]).toContain((await submit("tse-cib-2", checkin.recordVersion, { notes: "x" })).status);
    expect(await events("trainer_checkin_submitted")).toHaveLength(0);

    await endRelationship(db, ctx.relationshipId);
    expect((await submit("tse-cib-3", checkin.recordVersion, CHECKIN_ANSWERS)).status).toBe(409);
    expect(await events("trainer_checkin_submitted")).toHaveLength(0);
  });

  it("a retry after a crash between storing the event and the idempotency record stores and pushes nothing more", async () => {
    const ctx = await setup("checkin-crash");
    await reachActive(ctx, "checkin-crash");
    const checkin = await scheduleCheckin(ctx, "checkin-crash");
    await registerTrainerDevice(ctx.relationshipId);
    expoCalls.length = 0;

    // The first attempt stored (and pushed) the event, then died before saving the idempotency record.
    const earlier = await storeInboxNotification(db, {
      recipientUserId: await trainerUserId(ctx.relationshipId),
      relationshipId: ctx.relationshipId,
      notificationType: "trainer_checkin_submitted",
      domainEntityId: checkin.id,
      domainEntityType: "checkin",
      dedupeKey: `checkin-submitted:${checkin.id}`,
    });
    expect(earlier.inserted).toBe(true);

    const retry = await call(ctx.trainee, "POST", `/checkins/${checkin.id}/submit`, "tse-crash-1", {
      expectedVersion: checkin.recordVersion,
      answers: CHECKIN_ANSWERS,
    });
    expect(retry.status).toBe(200);
    expect(await events("trainer_checkin_submitted")).toHaveLength(1);
    expect(expoCalls).toHaveLength(0);
    expect(await deliveries()).toHaveLength(0);
  });
});
