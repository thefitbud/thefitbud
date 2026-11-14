/**
 * Z12-50 · Nudge is a FitBud push (D-W12-9, D-W12-10, D-W12-22, D-W12-23), on the
 * full demo seed: Rahul's real clients (Rohan, push-off Ishita, reminders-paused
 * Farhan, ended Kavya), their persisted meal assignments, preferences, devices and
 * reminder states, through the production routes. Only the outbound Expo call is
 * mocked.
 */
import { and, eq, isNull } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SAFE_PUSH_PAYLOAD_KEYS } from "@fitbud/contracts";
import { addDaysToLocalDate, formatLocalDate, localDateTimeToUtcIso } from "@fitbud/core";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { GENTLE_NUDGE_BODY } from "../domain/reminders.js";
import { DEMO_PASSWORD_PLAINTEXT } from "../seed/demo/spec.js";
import type { MemoryDbHandle } from "../test-support/memory-db.js";
import { dummyD1 } from "../test-support/notification-routes.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";

const SEED = "2026-11-10T04:30:00.000Z";
const SEND_URL = "https://exp.host/--/api/v2/push/send";

type ExpoMessage = { to: string; title: string; body: string; data: Record<string, unknown> };
type NudgeData = {
  deduped: boolean;
  delivery: "push" | "inbox";
  inboxReason: "push_off" | "reminders_paused" | null;
  deferredForQuietHours: boolean;
  quietHoursEnd: string | null;
  notification: {
    id: string;
    state: string;
    type: string;
    createdAt: string;
    title?: string;
    body?: string;
  };
};

function env(): Env {
  return {
    DB: dummyD1(),
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    ENVIRONMENT: "local",
    // Inline delivery (no queue) through the real Expo sender; fetch is stubbed.
    PUSH_PROVIDER_MODE: "expo",
    EXPO_ACCESS_TOKEN: "test-expo-access-token-z12-50",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
  };
}

describe("coach nudges (Z12-50)", () => {
  let handle: MemoryDbHandle;
  let db: Db;
  let expoCalls: ExpoMessage[];

  beforeAll(async () => {
    await prepareDemoSeededDb(SEED);
  }, 180_000);

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(SEED));
    handle = await createDemoSeededDb(SEED);
    db = handle.db;
    setTestDbOverride(db);
    expoCalls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) => {
        if (String(url) !== SEND_URL) return new Response(null, { status: 404 });
        const body = JSON.parse(String(init!.body)) as ExpoMessage[];
        expoCalls.push(...body);
        return Response.json({ data: body.map((_, i) => ({ status: "ok", id: `t-${i}` })) });
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setTestDbOverride(null);
    handle.close();
  });

  async function login(email: string, role: "trainer" | "trainee") {
    const res = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: email, password: DEMO_PASSWORD_PLAINTEXT }),
      },
      env(),
    );
    expect(res.status, await res.clone().text()).toBe(200);
    const { data } = (await res.json()) as { data: { token: string } };
    return {
      Authorization: `Bearer ${data.token}`,
      "x-fitbud-role": role,
      "Content-Type": "application/json",
    };
  }

  async function userId(email: string) {
    const [row] = await db
      .select({ id: schema.users.id, timezone: schema.users.timezone })
      .from(schema.users)
      .innerJoin(schema.userIdentities, eq(schema.userIdentities.userId, schema.users.id))
      .where(eq(schema.userIdentities.email, email))
      .limit(1);
    return row!;
  }

  /** The client's relationship with Rahul, their stored zone, and unlogged meal assignments. */
  async function client(email: string) {
    const trainee = await userId(email);
    const rahul = await userId("rahul.coach@demo.fitbud.test");
    const [rel] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(
        and(
          eq(schema.coachingRelationships.traineeUserId, trainee.id),
          eq(schema.coachingRelationships.trainerUserId, rahul.id),
        ),
      )
      .limit(1);
    const meals = await db
      .select({ id: schema.mealAssignments.id })
      .from(schema.mealAssignments)
      .leftJoin(
        schema.mealCompliance,
        eq(schema.mealCompliance.assignmentId, schema.mealAssignments.id),
      )
      .where(
        and(
          eq(schema.mealAssignments.coachingRelationshipId, rel!.id),
          eq(schema.mealAssignments.scheduleStatus, "scheduled"),
          isNull(schema.mealCompliance.id),
        ),
      )
      .limit(6);
    return {
      traineeUserId: trainee.id,
      relationshipId: rel!.id,
      relationshipStatus: rel!.status,
      timeZone: trainee.timezone,
      mealIds: meals.map((m) => m.id),
    };
  }

  /** `hh:mm` on the client's civil date `offsetDays` from the seed day, in their stored zone. */
  function clientClock(timeZone: string, offsetDays: number, hh: number, mm: number) {
    const localDate = addDaysToLocalDate(formatLocalDate(new Date(SEED), timeZone), offsetDays);
    return localDateTimeToUtcIso(localDate, timeZone, hh, mm, 0);
  }

  async function nudge(
    headers: Record<string, string>,
    relationshipId: string,
    body: Record<string, unknown>,
  ) {
    return app.request(
      `/notifications/relationships/${relationshipId}/nudges`,
      { method: "POST", headers, body: JSON.stringify(body) },
      env(),
    );
  }

  async function nudgeRows(relationshipId: string) {
    return db
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.coachingRelationshipId, relationshipId),
          eq(schema.notifications.notificationType, "activity_nudge"),
        ),
      );
  }

  async function deliveriesFor(notificationId: string) {
    return db
      .select()
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.notificationId, notificationId));
  }

  async function inbox(email: string) {
    const headers = await login(email, "trainee");
    const res = await app.request("/notifications?limit=50", { headers }, env());
    expect(res.status).toBe(200);
    return ((await res.json()) as { data: { items: NudgeData["notification"][] } }).data.items;
  }

  /** Rohan has no device in the seed: register one the way the app does. */
  async function registerRohanDevice() {
    const headers = await login("rohan.slipping@demo.fitbud.test", "trainee");
    const res = await app.request(
      "/notifications/device-tokens",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          token: "ExponentPushToken[rohan-z12-50]",
          platform: "android",
          installationId: "rohan-z12-50-install",
          provider: "expo",
        }),
      },
      env(),
    );
    expect(res.status, await res.clone().text()).toBe(200);
  }

  it("validates the body: trimmed, 1-200 characters, no links; nothing is stored on a reject", async () => {
    const rahul = await login("rahul.coach@demo.fitbud.test", "trainer");
    const rohan = await client("rohan.slipping@demo.fitbud.test");
    const base = { activityType: "meal", activityId: rohan.mealIds[0] };

    for (const body of ["", "   ", "x".repeat(201)]) {
      const res = await nudge(rahul, rohan.relationshipId, { ...base, body });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
        "INVALID_REQUEST",
      );
    }
    for (const body of [
      "Log it here: https://example.com/x",
      "Open www.fitbud.test please",
      "Message me on wa.me/919999999999",
      "Short link bit.ly/abc",
      "mailto:coach@example.com",
    ]) {
      const res = await nudge(rahul, rohan.relationshipId, { ...base, body });
      expect(res.status, body).toBe(400);
      expect(((await res.json()) as { error: unknown }).error).toMatchObject({
        code: "NUDGE_BODY_HAS_LINK",
        message: "Nudges can't include links.",
      });
    }
    expect(await nudgeRows(rohan.relationshipId)).toHaveLength(0);

    // Exactly 200 characters after trimming is accepted, and stored trimmed.
    const exact = `  ${"Lunch is waiting. ".repeat(11)}ab  `;
    expect(exact.trim()).toHaveLength(200);
    const ok = await nudge(rahul, rohan.relationshipId, {
      ...base,
      body: exact,
      now: clientClock(rohan.timeZone, 0, 12, 0),
    });
    expect(ok.status, await ok.clone().text()).toBe(200);
    const data = ((await ok.json()) as { data: NudgeData }).data;
    expect(data.notification.body).toBe(exact.trim());
  });

  it("sends a push titled '{Coach first name} nudged you' with the coach's body; the inbox row matches and the push data stays routing only", async () => {
    await registerRohanDevice();
    const rahul = await login("rahul.coach@demo.fitbud.test", "trainer");
    const rohan = await client("rohan.slipping@demo.fitbud.test");

    const res = await nudge(rahul, rohan.relationshipId, {
      activityType: "meal",
      activityId: rohan.mealIds[0],
      body: "  Lunch wasn't logged. Can you add it, even roughly?  ",
      // Request fields cannot set the title or the coach.
      title: "Someone else nudged you",
      trainerUserId: rohan.traineeUserId,
      now: clientClock(rohan.timeZone, 0, 12, 0),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const data = ((await res.json()) as { data: NudgeData }).data;
    expect(data).toMatchObject({
      deduped: false,
      delivery: "push",
      inboxReason: null,
      deferredForQuietHours: false,
      quietHoursEnd: null,
    });
    expect(data.notification).toMatchObject({
      type: "activity_nudge",
      state: "delivered",
      title: "Rahul nudged you",
      body: "Lunch wasn't logged. Can you add it, even roughly?",
    });

    expect(expoCalls).toHaveLength(1);
    expect(expoCalls[0]).toMatchObject({
      to: "ExponentPushToken[rohan-z12-50]",
      title: "Rahul nudged you",
      body: "Lunch wasn't logged. Can you add it, even roughly?",
    });
    expect(Object.keys(expoCalls[0]!.data).sort()).toEqual([...SAFE_PUSH_PAYLOAD_KEYS].sort());
    expect(expoCalls[0]!.data.notificationId).toBe(data.notification.id);

    const row = (await inbox("rohan.slipping@demo.fitbud.test")).find(
      (item) => item.id === data.notification.id,
    );
    expect(row).toMatchObject({
      title: "Rahul nudged you",
      body: "Lunch wasn't logged. Can you add it, even roughly?",
    });

    // No body → the Gentle template (D-W12-23).
    const gentle = await nudge(rahul, rohan.relationshipId, {
      activityType: "meal",
      activityId: rohan.mealIds[1],
      now: clientClock(rohan.timeZone, 0, 12, 5),
    });
    expect(gentle.status).toBe(200);
    expect(((await gentle.json()) as { data: NudgeData }).data.notification.body).toBe(
      GENTLE_NUDGE_BODY.meal,
    );
    expect(expoCalls[1]).toMatchObject({ title: "Rahul nudged you", body: GENTLE_NUDGE_BODY.meal });
  });

  it("caps nudges at 2 per client civil day across items, at the client's midnight; a retry is not counted again", async () => {
    const rahul = await login("rahul.coach@demo.fitbud.test", "trainer");
    const rohan = await client("rohan.slipping@demo.fitbud.test");
    const [a, b, c] = rohan.mealIds;

    const first = await nudge(rahul, rohan.relationshipId, {
      activityType: "meal",
      activityId: a,
      body: "Lunch is waiting.",
      now: clientClock(rohan.timeZone, 0, 23, 30),
    });
    expect(first.status).toBe(200);
    const firstData = ((await first.json()) as { data: NudgeData }).data;

    // A retried request (same item, same client day) returns the stored nudge.
    const retry = await nudge(rahul, rohan.relationshipId, {
      activityType: "meal",
      activityId: a,
      body: "Lunch is waiting.",
      now: clientClock(rohan.timeZone, 0, 23, 31),
    });
    expect(retry.status).toBe(200);
    const retryData = ((await retry.json()) as { data: NudgeData }).data;
    expect(retryData.deduped).toBe(true);
    expect(retryData.notification.id).toBe(firstData.notification.id);

    const second = await nudge(rahul, rohan.relationshipId, {
      activityType: "meal",
      activityId: b,
      now: clientClock(rohan.timeZone, 0, 23, 35),
    });
    expect(second.status, await second.clone().text()).toBe(200);
    expect(((await second.json()) as { data: NudgeData }).data.deduped).toBe(false);

    const third = await nudge(rahul, rohan.relationshipId, {
      activityType: "meal",
      activityId: c,
      now: clientClock(rohan.timeZone, 0, 23, 45),
    });
    expect(third.status).toBe(429);
    const thirdError = ((await third.json()) as {
      error: { code: string; message: string; details?: { retryAfter?: number } };
    }).error;
    expect(thirdError).toMatchObject({
      code: "NUDGE_LIMIT",
      message: "You can nudge this client again tomorrow.",
    });
    // 15 minutes to the client's midnight.
    expect(thirdError.details?.retryAfter).toBe(15 * 60);
    expect(await nudgeRows(rohan.relationshipId)).toHaveLength(2);

    // 00:30 on the client's next day: a new civil day, so the cap is fresh,
    // and the item nudged yesterday can be nudged again.
    const nextDay = await nudge(rahul, rohan.relationshipId, {
      activityType: "meal",
      activityId: c,
      now: clientClock(rohan.timeZone, 1, 0, 30),
    });
    expect(nextDay.status, await nextDay.clone().text()).toBe(200);
    const again = await nudge(rahul, rohan.relationshipId, {
      activityType: "meal",
      activityId: a,
      now: clientClock(rohan.timeZone, 1, 0, 35),
    });
    expect(again.status, await again.clone().text()).toBe(200);
    expect(((await again.json()) as { data: NudgeData }).data.deduped).toBe(false);
  });

  it("delivers to the inbox only when the client's push is off (Ishita); the cap still applies", async () => {
    const rahul = await login("rahul.coach@demo.fitbud.test", "trainer");
    const ishita = await client("ishita.pushoff@demo.fitbud.test");
    const [a, b, c] = ishita.mealIds;

    const res = await nudge(rahul, ishita.relationshipId, {
      activityType: "meal",
      activityId: a,
      body: "Dinner wasn't logged on Friday. Can you add it, even roughly?",
      now: clientClock(ishita.timeZone, 0, 12, 0),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const data = ((await res.json()) as { data: NudgeData }).data;
    expect(data).toMatchObject({
      delivery: "inbox",
      inboxReason: "push_off",
      deferredForQuietHours: false,
    });
    expect(data.notification.state).toBe("delivered");
    expect(await deliveriesFor(data.notification.id)).toHaveLength(0);
    expect(expoCalls).toHaveLength(0);

    const row = (await inbox("ishita.pushoff@demo.fitbud.test")).find(
      (item) => item.id === data.notification.id,
    );
    expect(row).toMatchObject({
      title: "Rahul nudged you",
      body: "Dinner wasn't logged on Friday. Can you add it, even roughly?",
      state: "delivered",
    });

    expect(
      (
        await nudge(rahul, ishita.relationshipId, {
          activityType: "meal",
          activityId: b,
          now: clientClock(ishita.timeZone, 0, 12, 5),
        })
      ).status,
    ).toBe(200);
    const limited = await nudge(rahul, ishita.relationshipId, {
      activityType: "meal",
      activityId: c,
      now: clientClock(ishita.timeZone, 0, 12, 10),
    });
    expect(limited.status).toBe(429);
    expect(((await limited.json()) as { error: { code: string } }).error.code).toBe("NUDGE_LIMIT");
  });

  it("delivers to the inbox only, with the reason, when the client paused reminders (Farhan)", async () => {
    const rahul = await login("rahul.coach@demo.fitbud.test", "trainer");
    const farhan = await client("farhan.paused@demo.fitbud.test");
    const [state] = await db
      .select()
      .from(schema.reminderStates)
      .where(eq(schema.reminderStates.traineeUserId, farhan.traineeUserId));
    expect(state?.mode).toBe("paused");

    const res = await nudge(rahul, farhan.relationshipId, {
      activityType: "meal",
      activityId: farhan.mealIds[0],
      now: clientClock(farhan.timeZone, 0, 12, 0),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const data = ((await res.json()) as { data: NudgeData }).data;
    expect(data).toMatchObject({ delivery: "inbox", inboxReason: "reminders_paused" });
    expect(data.notification).toMatchObject({
      state: "delivered",
      title: "Rahul nudged you",
      body: GENTLE_NUDGE_BODY.meal,
    });
    expect(await deliveriesFor(data.notification.id)).toHaveLength(0);
    expect(expoCalls).toHaveLength(0);
    expect(
      (await inbox("farhan.paused@demo.fitbud.test")).some((item) => item.id === data.notification.id),
    ).toBe(true);
  });

  it("holds the push until the client's quiet hours end, with the inbox row written immediately", async () => {
    await registerRohanDevice();
    const rahul = await login("rahul.coach@demo.fitbud.test", "trainer");
    const rohan = await client("rohan.slipping@demo.fitbud.test");
    const [prefs] = await db
      .select()
      .from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.userId, rohan.traineeUserId));
    expect(prefs?.quietHoursStart).toBe("22:00");

    const res = await nudge(rahul, rohan.relationshipId, {
      activityType: "meal",
      activityId: rohan.mealIds[0],
      body: "Can you log lunch when you wake up?",
      now: clientClock(rohan.timeZone, 0, 22, 40),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const data = ((await res.json()) as { data: NudgeData }).data;
    expect(data).toMatchObject({
      delivery: "push",
      inboxReason: null,
      deferredForQuietHours: true,
      quietHoursEnd: prefs!.quietHoursEnd,
    });
    expect(data.notification.state).toBe("deferred");
    expect(expoCalls).toHaveLength(0);
    const held = (await inbox("rohan.slipping@demo.fitbud.test")).find(
      (item) => item.id === data.notification.id,
    );
    expect(held).toMatchObject({ title: "Rahul nudged you", body: "Can you log lunch when you wake up?" });

    // The cron after quiet hours end releases the same row as the push.
    vi.setSystemTime(new Date(clientClock(rohan.timeZone, 1, 7, 0)));
    const evaluated = await app.request(
      "/notifications/reminders/evaluate",
      {
        method: "POST",
        headers: rahul,
        body: JSON.stringify({ now: clientClock(rohan.timeZone, 1, 7, 0) }),
      },
      env(),
    );
    expect(evaluated.status, await evaluated.clone().text()).toBe(200);
    const pushed = expoCalls.filter((call) => call.data.notificationId === data.notification.id);
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({
      title: "Rahul nudged you",
      body: "Can you log lunch when you wake up?",
    });
    const [released] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, data.notification.id));
    expect(released?.state).toBe("delivered");
  });

  it("rejects a nudge to an ended client and to another trainer's client", async () => {
    const rahul = await login("rahul.coach@demo.fitbud.test", "trainer");
    const kavya = await client("kavya.ended@demo.fitbud.test");
    expect(kavya.relationshipStatus).not.toBe("active");
    const ended = await nudge(rahul, kavya.relationshipId, {
      activityType: "meal",
      activityId: kavya.mealIds[0] ?? "00000000-0000-4000-8000-000000000000",
    });
    expect(ended.status).toBe(409);
    expect(((await ended.json()) as { error: { code: string } }).error.code).toBe(
      "RELATIONSHIP_ENDED",
    );

    const priya = await login("priya.coach@demo.fitbud.test", "trainer");
    const rohan = await client("rohan.slipping@demo.fitbud.test");
    const foreign = await nudge(priya, rohan.relationshipId, {
      activityType: "meal",
      activityId: rohan.mealIds[0],
    });
    expect(foreign.status).toBe(404);
    expect(((await foreign.json()) as { error: { code: string } }).error.code).toBe(
      "RELATIONSHIP_NOT_FOUND",
    );
    expect(await nudgeRows(kavya.relationshipId)).toHaveLength(0);
    expect(await nudgeRows(rohan.relationshipId)).toHaveLength(0);
  });
});
