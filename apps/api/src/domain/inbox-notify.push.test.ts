import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SAFE_PUSH_PAYLOAD_KEYS } from "@fitbud/contracts";
import { app } from "../index.js";
import { setTestDbOverride } from "../db/client.js";
import {
  coachingRelationships,
  deviceTokens,
  notificationDeliveries,
  notificationPreferences,
  notifications,
} from "../db/schema.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createId } from "../lib/crypto.js";
import { DEMO_PASSWORD_PLAINTEXT } from "../seed/demo/spec.js";
import type { MemoryDbHandle } from "../test-support/memory-db.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import type { Env } from "../types.js";
import { pushTrainerInboxEvent, storeInboxNotification } from "./inbox-notify.js";

/**
 * X4f / D-W3-1: trainer inbox events are pushed through the production Expo sender.
 * Real routes on the demo seed (Rohan Mehta, Rahul Verma's active client); only the
 * outbound call to exp.host is replaced.
 *
 * 14:30 UTC is 20:00 in Asia/Kolkata: before the 22:00 default quiet hours start.
 */
const SEED = "2026-10-17T14:30:00.000Z";
const TRAINER_TOKEN = "ExponentPushToken[x4f-rahul-phone]";

type ExpoMessage = Record<string, unknown> & { to: string; data: Record<string, unknown>; body: string };

function env(): Env {
  return {
    DB: {
      prepare() {
        throw new Error("D1 should not be used when test DB override is set");
      },
    } as unknown as D1Database,
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    PUSH_PROVIDER_MODE: "expo",
    EXPO_ACCESS_TOKEN: "test-expo-access-token-x4f",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    ENVIRONMENT: "local",
  };
}

describe("trainer inbox events are pushed (X4f)", () => {
  let handle: MemoryDbHandle;
  let expoCalls: ExpoMessage[];
  let traineeHeaders: Record<string, string>;
  let relationshipId: string;
  let trainerUserId: string;

  beforeAll(async () => {
    await prepareDemoSeededDb(SEED);
  }, 120_000);

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(SEED));
    handle = await createDemoSeededDb(SEED);
    setTestDbOverride(handle.db);
    expoCalls = [];

    const login = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: "rohan.slipping@demo.fitbud.test",
          password: DEMO_PASSWORD_PLAINTEXT,
        }),
      },
      env(),
    );
    expect(login.status).toBe(200);
    const { data } = (await login.json()) as { data: { token: string } };
    traineeHeaders = {
      Authorization: `Bearer ${data.token}`,
      "x-fitbud-role": "trainee",
      "Content-Type": "application/json",
    };
    const rels = await app.request("/relationships", { headers: traineeHeaders }, env());
    const relBody = (await rels.json()) as { data: { items: Array<{ id: string }> } };
    relationshipId = relBody.data.items[0]!.id;
    const [rel] = await handle.db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, relationshipId));
    trainerUserId = rel!.trainerUserId;
    await setTrainerTokens([{ id: "x4f-rahul-phone", token: TRAINER_TOKEN }]);
    mockExpo();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setTestDbOverride(null);
    handle.close();
  });

  /** Mocks only the outbound Expo call. */
  function mockExpo(status: "ok" | "error" = "ok") {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (_url, init) => {
        const body = JSON.parse(String(init!.body)) as ExpoMessage[];
        expoCalls.push(...body);
        if (status === "error") return new Response("upstream down", { status: 503 });
        return Response.json({ data: body.map((_, i) => ({ status: "ok", id: `ticket-${expoCalls.length}-${i}` })) });
      }),
    );
  }

  async function setTrainerTokens(tokens: Array<{ id: string; token: string }>) {
    await handle.db.delete(deviceTokens).where(eq(deviceTokens.userId, trainerUserId));
    for (const t of tokens) {
      await handle.db.insert(deviceTokens).values({
        id: t.id,
        userId: trainerUserId,
        platform: "android",
        provider: "expo",
        token: t.token,
        installationId: `${t.id}-install`,
        status: "active",
        lastSeenAt: SEED,
        createdAt: SEED,
        updatedAt: SEED,
      });
    }
  }

  async function setTrainerPrefs(patch: Partial<typeof notificationPreferences.$inferInsert>) {
    await handle.db
      .insert(notificationPreferences)
      .values({ userId: trainerUserId, createdAt: SEED, updatedAt: SEED, ...patch })
      .onConflictDoUpdate({ target: notificationPreferences.userId, set: { ...patch, updatedAt: SEED } });
  }

  async function askCoach(itemId = createId()) {
    return app.request(
      "/coach-asks",
      {
        method: "POST",
        headers: traineeHeaders,
        body: JSON.stringify({ relationshipId, itemType: "checkin", itemId, topic: "Form check" }),
      },
      env(),
    );
  }

  async function putMealTime(time: string) {
    return app.request(
      "/me/meal-times",
      {
        method: "PUT",
        headers: traineeHeaders,
        body: JSON.stringify({ overrides: [{ slotKey: "breakfast", dayPattern: "all", time }] }),
      },
      env(),
    );
  }

  async function trainerNotifications(type: string) {
    return handle.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.recipientUserId, trainerUserId), eq(notifications.notificationType, type as never)));
  }

  async function deliveriesFor(notificationId: string) {
    return handle.db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.notificationId, notificationId));
  }

  it("ask coach: one routing-only push to the trainer's device, marked before the call", async () => {
    const res = await askCoach();
    expect(res.status).toBe(201);

    const [stored] = await trainerNotifications("trainer_ask_coach");
    expect(stored).toBeDefined();
    expect(expoCalls).toHaveLength(1);
    const sent = expoCalls[0]!;
    expect(sent.to).toBe(TRAINER_TOKEN);
    expect(Object.keys(sent.data).sort()).toEqual([...SAFE_PUSH_PAYLOAD_KEYS].sort());
    expect(sent.data).toMatchObject({
      notificationId: stored!.id,
      notificationType: "trainer_ask_coach",
      domainEntityType: "coaching_relationship",
      domainEntityId: stored!.domainEntityId,
    });
    // Lock-screen text is the generic type label: no client name, topic ("Form check") or ids.
    expect(sent.title).toBe("FitBud");
    expect(sent.body).toBe("Asked coach");

    const deliveries = await deliveriesFor(stored!.id);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      providerStatus: "accepted",
      deviceTokenId: "x4f-rahul-phone",
      attemptStartedAt: expect.any(String),
    });
  });

  it("meal times changed: one push, and a second edit in the same window sends nothing", async () => {
    const before = await trainerNotifications("trainer_meal_times_changed");
    const first = await putMealTime("09:00");
    expect(first.status).toBe(200);
    const after = await trainerNotifications("trainer_meal_times_changed");
    expect(after).toHaveLength(before.length + 1);
    expect(expoCalls).toHaveLength(1);
    expect(expoCalls[0]!.data).toMatchObject({
      notificationType: "trainer_meal_times_changed",
      domainEntityType: "coaching_relationship",
      domainEntityId: relationshipId,
    });
    expect(Object.keys(expoCalls[0]!.data).sort()).toEqual([...SAFE_PUSH_PAYLOAD_KEYS].sort());
    expect(expoCalls[0]!.body).toBe("Meal times changed");

    const second = await putMealTime("09:15");
    expect(second.status).toBe(200);
    expect(await trainerNotifications("trainer_meal_times_changed")).toHaveLength(after.length);
    expect(expoCalls).toHaveLength(1);
  });

  it("sends one push per active device and none to a revoked one", async () => {
    await setTrainerTokens([
      { id: "x4f-phone", token: "ExponentPushToken[x4f-phone]" },
      { id: "x4f-tablet", token: "ExponentPushToken[x4f-tablet]" },
    ]);
    await handle.db.insert(deviceTokens).values({
      id: "x4f-old",
      userId: trainerUserId,
      platform: "android",
      provider: "expo",
      token: "ExponentPushToken[x4f-old]",
      installationId: "revoked:x4f-old",
      status: "revoked",
      lastSeenAt: SEED,
      createdAt: SEED,
      updatedAt: SEED,
    });
    expect((await askCoach()).status).toBe(201);
    expect(expoCalls.map((m) => m.to).sort()).toEqual([
      "ExponentPushToken[x4f-phone]",
      "ExponentPushToken[x4f-tablet]",
    ]);
  });

  it("trainer push toggle off: stored, not pushed", async () => {
    await setTrainerPrefs({ pushEnabled: false });
    expect((await askCoach()).status).toBe(201);
    expect(await trainerNotifications("trainer_ask_coach")).toHaveLength(1);
    expect(expoCalls).toHaveLength(0);
  });

  it("matching category off: stored, not pushed; another category still pushes", async () => {
    await setTrainerPrefs({ trainerCategoriesJson: JSON.stringify({ askCoach: false }) });
    expect((await askCoach()).status).toBe(201);
    expect(await trainerNotifications("trainer_ask_coach")).toHaveLength(1);
    expect(expoCalls).toHaveLength(0);

    expect((await putMealTime("09:00")).status).toBe(200);
    expect(expoCalls).toHaveLength(1);
    expect(expoCalls[0]!.data.notificationType).toBe("trainer_meal_times_changed");
  });

  it("quiet hours: stored, not pushed, and not deferred", async () => {
    // 20:00 IST falls inside this trainer-chosen window.
    await setTrainerPrefs({ quietHoursStart: "19:00", quietHoursEnd: "21:00" });
    expect((await askCoach()).status).toBe(201);
    const [stored] = await trainerNotifications("trainer_ask_coach");
    expect(stored!.state).toBe("delivered");
    expect(expoCalls).toHaveLength(0);
    expect(await deliveriesFor(stored!.id)).toHaveLength(0);
  });

  it("a deduped event sends nothing", async () => {
    const itemId = createId();
    expect((await askCoach(itemId)).status).toBe(201);
    expect(expoCalls).toHaveLength(1);
    // Same dedupe key again: the store reports a dedupe hit, so the caller does not push.
    const [stored] = await trainerNotifications("trainer_ask_coach");
    const again = await storeInboxNotification(handle.db, {
      recipientUserId: trainerUserId,
      relationshipId,
      notificationType: "trainer_ask_coach",
      domainEntityId: stored!.domainEntityId,
      dedupeKey: stored!.dedupeKey,
    });
    expect(again).toEqual({ inserted: false });
    expect(expoCalls).toHaveLength(1);
    expect(await trainerNotifications("trainer_ask_coach")).toHaveLength(1);
  });

  it("a real insert error is not a dedupe hit, even when an old row has that dedupe key", async () => {
    expect((await askCoach()).status).toBe(201);
    const [old] = await trainerNotifications("trainer_ask_coach");
    const poisoned = createId();
    // A trigger makes the insert fail for a reason that is not the dedupe key.
    handle.sqlite.exec(
      `CREATE TRIGGER x4f_block_insert BEFORE INSERT ON notifications
       WHEN NEW.domain_entity_id = '${poisoned}'
       BEGIN SELECT RAISE(ABORT, 'x4f insert blocked'); END;`,
    );
    await expect(
      storeInboxNotification(handle.db, {
        recipientUserId: trainerUserId,
        relationshipId,
        notificationType: "trainer_ask_coach",
        domainEntityId: poisoned,
        dedupeKey: old!.dedupeKey,
      }),
    ).rejects.toBeDefined();
    expect(expoCalls).toHaveLength(1);
  });

  it("trainee-facing inbox types are stored only", async () => {
    const [rel] = await handle.db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, relationshipId));
    await setTokensFor(rel!.traineeUserId);
    const stored = await storeInboxNotification(handle.db, {
      recipientUserId: rel!.traineeUserId,
      relationshipId,
      notificationType: "plan_published",
      domainEntityId: relationshipId,
      dedupeKey: `x4f-plan-${createId()}`,
    });
    expect(stored.inserted).toBe(true);
    if (stored.inserted) {
      await pushTrainerInboxEvent(handle.db, stored.notificationId, {
        pushProviderMode: "expo",
        expoAccessToken: "test-expo-access-token-x4f",
      });
    }
    expect(expoCalls).toHaveLength(0);
  });

  async function setTokensFor(userId: string) {
    await handle.db.insert(deviceTokens).values({
      id: "x4f-trainee-phone",
      userId,
      platform: "android",
      provider: "expo",
      token: "ExponentPushToken[x4f-trainee]",
      installationId: "x4f-trainee-install",
      status: "active",
      lastSeenAt: SEED,
      createdAt: SEED,
      updatedAt: SEED,
    });
  }

  it("an ended relationship gets no push", async () => {
    await handle.db
      .update(coachingRelationships)
      .set({ status: "ended" })
      .where(eq(coachingRelationships.id, relationshipId));
    const stored = await storeInboxNotification(handle.db, {
      recipientUserId: trainerUserId,
      relationshipId,
      notificationType: "trainer_ask_coach",
      domainEntityId: createId(),
      dedupeKey: `x4f-ended-${createId()}`,
    });
    expect(stored.inserted).toBe(true);
    if (stored.inserted) {
      await pushTrainerInboxEvent(handle.db, stored.notificationId, { pushProviderMode: "expo" });
    }
    expect(expoCalls).toHaveLength(0);
  });

  it("provider error: the request still succeeds, the marker stays, and nothing is resent", async () => {
    mockExpo("error");
    const res = await askCoach();
    expect(res.status).toBe(201);
    const [stored] = await trainerNotifications("trainer_ask_coach");
    expect(stored).toBeDefined();
    expect(expoCalls).toHaveLength(1);
    const deliveries = await deliveriesFor(stored!.id);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ providerStatus: "failed", failureCategory: "provider_error" });
    // The attempt stays marked: an unanswered provider call is never silently retried.
    expect(deliveries[0]!.attemptStartedAt).toEqual(expect.any(String));
  });

  it("a failed outcome write after a send does not fail the request or resend", async () => {
    // A trigger aborts any UPDATE of a delivery row, so the post-send outcome write throws.
    handle.sqlite.exec(
      `CREATE TRIGGER x4f_block_delivery_update BEFORE UPDATE ON notification_deliveries
       BEGIN SELECT RAISE(ABORT, 'x4f outcome write blocked'); END;`,
    );
    const res = await askCoach();
    expect(res.status).toBe(201);
    expect(expoCalls).toHaveLength(1);
    const [stored] = await trainerNotifications("trainer_ask_coach");
    const deliveries = await deliveriesFor(stored!.id);
    // Outcome unrecorded, but the marker was written first and no retry path exists.
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ providerStatus: "queued" });
    expect(deliveries[0]!.attemptStartedAt).toEqual(expect.any(String));
  });
});
