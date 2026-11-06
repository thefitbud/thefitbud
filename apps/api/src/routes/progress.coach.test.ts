/**
 * Z6-20 (PLAN-v2 D-P2-21, D-W6-IP R1–R5, D-W6-32, D-W6-33, D-W6-34, D-W6-38):
 * a trainer logs or edits a client's body measurement. Real routes on
 * persisted data: invitation → accepted relationship, then the trainer's POST
 * and PATCH, the trainee's reads and writes, sync pull and push, the activity
 * feed and the coach-updates notification.
 *
 * The clock is pinned (Date only): Thursday 5 Nov 2026 06:00 UTC is 11:30 in
 * Asia/Kolkata, so "within the last 7 days" and quiet hours are exact.
 */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import { createId } from "../lib/crypto.js";
import type { Env } from "../types.js";

const THURSDAY = "2026-11-05T06:00:00.000Z";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const TZ = "Asia/Kolkata";

function testEnv(): Env {
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
    ENVIRONMENT: "local",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
  };
}

function at(iso: string | number) {
  vi.setSystemTime(new Date(iso));
}

async function call(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
) {
  const response = await app.request(
    path,
    {
      method: init.method ?? "GET",
      headers: {
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    },
    testEnv(),
  );
  const text = await response.text();
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : null) as {
      data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      error?: { code: string; message: string };
    },
  };
}

async function trainerSession(email: string) {
  const token = createTestIdToken(`trainer-${email}`, email);
  const response = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token, timezone: TZ }),
    },
    testEnv(),
  );
  expect(response.status).toBe(200);
  return { Cookie: response.headers.get("set-cookie")!.split(";")[0]! };
}

type Fixture = Awaited<ReturnType<typeof activeClient>>;

async function activeClient(suffix: string) {
  const trainer = await trainerSession(`coach-meas-${suffix}@example.com`);
  const invite = await call("/invitations", {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `inv-${suffix}` },
    body: { recipientEmail: `coach-meas-client-${suffix}@example.com` },
  });
  const traineeToken = createTestIdToken(
    `coach-meas-client-${suffix}`,
    `coach-meas-client-${suffix}@example.com`,
  );
  const trainee = { Authorization: `Bearer ${traineeToken}`, "x-fitbud-role": "trainee" };
  const accepted = await call("/invitations/accept", {
    method: "POST",
    headers: { Authorization: `Bearer ${traineeToken}` },
    body: { token: invite.body.data.token, timezone: TZ },
  });
  expect(accepted.status).toBeLessThan(300);
  return { trainer, trainee, relationshipId: accepted.body.data.relationship.id as string };
}

describe("trainer logs and edits a client's measurement (Z6-20)", () => {
  let db: Db;
  let close: () => void;
  let f: Fixture;

  const weight = (value: number, extra: Record<string, unknown> = {}) => ({
    type: "body_weight_kg",
    value,
    unit: "kg",
    ...extra,
  });

  async function postMeasurement(
    body: unknown,
    key = `coach-meas-${createId()}`,
    headers: Record<string, string> = f.trainer,
    relationshipId = f.relationshipId,
  ) {
    return call(`/progress/relationships/${relationshipId}/measurements`, {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": key },
      body,
    });
  }

  async function patchMeasurement(
    id: string,
    body: unknown,
    headers: Record<string, string> = f.trainer,
  ) {
    return call(`/progress/measurements/${id}`, { method: "PATCH", headers, body });
  }

  async function auditRows(entityId: string) {
    return db
      .select()
      .from(schema.logEditEvents)
      .where(eq(schema.logEditEvents.entityId, entityId))
      .orderBy(schema.logEditEvents.createdAt);
  }

  async function people() {
    const [rel] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, f.relationshipId));
    return { traineeUserId: rel!.traineeUserId, trainerUserId: rel!.trainerUserId };
  }

  async function coachNotifications() {
    const { traineeUserId } = await people();
    return db
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.recipientUserId, traineeUserId),
          eq(schema.notifications.notificationType, "coach_log_updated"),
        ),
      )
      .orderBy(schema.notifications.createdAt);
  }

  async function deliveries(notificationId: string) {
    return db
      .select()
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.notificationId, notificationId));
  }

  async function registerTraineePhone() {
    const res = await call("/notifications/device-tokens", {
      method: "POST",
      headers: f.trainee,
      body: {
        token: "ExponentPushToken[coach-meas-phone]",
        platform: "android",
        provider: "expo",
        installationId: "coach-meas-install",
      },
    });
    expect(res.status).toBeLessThan(300);
  }

  type Change = { entityType: string; recordId: string; payload: Record<string, unknown> };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(THURSDAY);
    const handle = await createMemoryDb();
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
    f = await activeClient(createId().slice(0, 8));
  }, 60_000);

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    close();
  });

  it("a trainer POST records the coach, writes one audit row, and the trainee reads and syncs it", async () => {
    const firstPull = await call("/sync/pull", { headers: f.trainee });
    expect(firstPull.status).toBe(200);
    // Nothing has changed yet, so there may be no cursor: the next pull then starts from the beginning.
    const cursor: string | null = firstPull.body.data.nextCursor;

    const observedAt = new Date(Date.parse(THURSDAY) - 2 * DAY).toISOString();
    const res = await postMeasurement(weight(72.4, { observedAt }));
    expect(res.status).toBe(200);
    const entry = res.body.data;
    expect(entry).toMatchObject({
      type: "body_weight_kg",
      value: 72.4,
      unit: "kg",
      observedAt,
      source: "trainer_entry",
      recordVersion: 0,
      loggedByRole: "coach",
      lastEditedByRole: null,
    });

    const { trainerUserId, traineeUserId } = await people();
    const [row] = await db.select().from(schema.measurements).where(eq(schema.measurements.id, entry.id));
    expect(row).toMatchObject({
      loggedByRole: "coach",
      loggedByUserId: trainerUserId,
      traineeUserId,
      source: "trainer_entry",
      lastEditedByRole: null,
    });
    const audit = await auditRows(entry.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "create",
      actorRole: "coach",
      actorUserId: trainerUserId,
      entityType: "measurement",
      beforeJson: null,
    });
    expect(JSON.parse(audit[0]!.afterJson)).toMatchObject({
      type: "body_weight_kg",
      value: 72.4,
      unit: "kg",
      localDate: "2026-11-03",
    });

    const list = await call(`/progress/relationships/${f.relationshipId}/measurements`, { headers: f.trainee });
    expect(list.body.data.items[0]).toMatchObject({ id: entry.id, loggedByRole: "coach" });

    const pull = await call(cursor ? `/sync/pull?cursor=${encodeURIComponent(cursor)}` : "/sync/pull", {
      headers: f.trainee,
    });
    const change = (pull.body.data.changes as Change[]).find(
      (c) => c.entityType === "measurement" && c.recordId === entry.id,
    );
    expect(change?.payload).toMatchObject({ id: entry.id, loggedByRole: "coach", lastEditedByRole: null });
  });

  it("a retried POST returns the stored response; a replayed client id writes no second audit row", async () => {
    const id = "00000000-0000-4000-8000-00000000c201";
    const key = "coach-meas-retry";
    const first = await postMeasurement(weight(71, { id }), key);
    expect(first.status).toBe(200);
    const retried = await postMeasurement(weight(71, { id }), key);
    expect(retried.body.data).toEqual(first.body.data);
    const reused = await postMeasurement(weight(80, { id }), key);
    expect(reused.status).toBe(409);
    expect(reused.body.error?.code).toBe("IDEMPOTENCY_KEY_REUSE");

    // A new key with the same client id returns the entry as it is: no new row, no audit row.
    const replay = await postMeasurement(weight(71, { id }), "coach-meas-retry-2");
    expect(replay.status).toBe(200);
    expect(replay.body.data.id).toBe(id);
    expect(await db.select().from(schema.measurements)).toHaveLength(1);
    expect(await auditRows(id)).toHaveLength(1);
  });

  it("a PATCH changes the value, audits before and after, sets last_edited_*, and refuses stale or empty edits", async () => {
    const created = await postMeasurement(weight(72.4));
    const id: string = created.body.data.id;
    at(Date.now() + 60_000);

    const edit = await patchMeasurement(id, { recordVersion: 0, value: 71.9 });
    expect(edit.status).toBe(200);
    expect(edit.body.data).toMatchObject({
      id,
      value: 71.9,
      recordVersion: 1,
      loggedByRole: "coach",
      lastEditedByRole: "coach",
    });
    const { trainerUserId } = await people();
    const [row] = await db.select().from(schema.measurements).where(eq(schema.measurements.id, id));
    expect(row).toMatchObject({ lastEditedByRole: "coach", lastEditedByUserId: trainerUserId, value: 71.9 });
    expect(row!.lastEditedAt).not.toBeNull();

    const audit = await auditRows(id);
    expect(audit.map((a) => a.action)).toEqual(["create", "edit"]);
    expect(JSON.parse(audit[1]!.beforeJson!)).toMatchObject({ value: 72.4 });
    expect(JSON.parse(audit[1]!.afterJson)).toMatchObject({ value: 71.9 });

    const stale = await patchMeasurement(id, { recordVersion: 0, value: 70 });
    expect(stale.status).toBe(409);
    expect(stale.body.error?.code).toBe("VERSION_CONFLICT");
    const empty = await patchMeasurement(id, { recordVersion: 1 });
    expect(empty.status).toBe(400);

    // A change that changes nothing writes no audit row and no new version.
    const noop = await patchMeasurement(id, { recordVersion: 1, value: 71.9, unit: "kg" });
    expect(noop.status).toBe(200);
    expect(noop.body.data.recordVersion).toBe(1);
    expect(await auditRows(id)).toHaveLength(2);

    const missing = await patchMeasurement(createId(), { recordVersion: 0, value: 70 });
    expect(missing.status).toBe(404);
  });

  it("concurrent edits on one version: one wins, the other gets 409 and writes nothing", async () => {
    const created = await postMeasurement(weight(72.4));
    const id: string = created.body.data.id;
    const [a, b] = await Promise.all([
      patchMeasurement(id, { recordVersion: 0, value: 71 }),
      patchMeasurement(id, { recordVersion: 0, value: 70 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await auditRows(id)).toHaveLength(2);
    const [row] = await db.select().from(schema.measurements).where(eq(schema.measurements.id, id));
    expect(row!.recordVersion).toBe(1);
  });

  it("an edit of a trainee-logged or earlier trainer-entered measurement keeps it the trainee's (no backfill, D-W6-34)", async () => {
    const own = await postMeasurement(weight(80), "trainee-own", f.trainee);
    expect(own.status).toBe(200);
    expect(own.body.data).toMatchObject({ source: "trainee_entry", loggedByRole: "trainee" });
    // A trainer_entry row from before Z6-20 stays trainee-owned.
    const { traineeUserId } = await people();
    const legacyId = createId();
    const stamp = new Date().toISOString();
    await db.insert(schema.measurements).values({
      id: legacyId,
      coachingRelationshipId: f.relationshipId,
      traineeUserId,
      type: "waist_cm",
      value: 84,
      unit: "cm",
      observedAt: stamp,
      source: "trainer_entry",
      checkinId: null,
      mediaAssetId: null,
      recordVersion: 0,
      loggedByRole: "trainee",
      loggedByUserId: null,
      lastEditedByRole: null,
      lastEditedByUserId: null,
      lastEditedAt: null,
      createdAt: stamp,
      updatedAt: stamp,
    });

    for (const [id, value] of [
      [own.body.data.id as string, 79.5],
      [legacyId, 83],
    ] as const) {
      const edit = await patchMeasurement(id, { recordVersion: 0, value });
      expect(edit.status).toBe(200);
      expect(edit.body.data).toMatchObject({ loggedByRole: "trainee", lastEditedByRole: "coach", value });
      expect((await auditRows(id)).map((a) => a.action)).toEqual(["edit"]);
    }

    // A measurement that came from a check-in is the client's own answer: not editable here.
    const fromCheckinId = createId();
    await db.insert(schema.measurements).values({
      id: fromCheckinId,
      coachingRelationshipId: f.relationshipId,
      traineeUserId,
      type: "body_weight_kg",
      value: 79,
      unit: "kg",
      observedAt: stamp,
      source: "checkin",
      checkinId: null,
      mediaAssetId: null,
      recordVersion: 0,
      loggedByRole: "trainee",
      loggedByUserId: null,
      lastEditedByRole: null,
      lastEditedByUserId: null,
      lastEditedAt: null,
      createdAt: stamp,
      updatedAt: stamp,
    });
    const blocked = await patchMeasurement(fromCheckinId, { recordVersion: 0, value: 70 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error?.code).toBe("INVALID_TRANSITION");
    expect(await auditRows(fromCheckinId)).toHaveLength(0);
  });

  it("R2: dates outside the last 7 days or in the future return 422 BACKDATE_LIMIT, for create and edit", async () => {
    const future = await postMeasurement(weight(72, { observedAt: new Date(Date.now() + DAY).toISOString() }));
    expect(future.status).toBe(422);
    expect(future.body.error?.code).toBe("BACKDATE_LIMIT");
    const tooOld = await postMeasurement(weight(72, { observedAt: new Date(Date.now() - 8 * DAY).toISOString() }));
    expect(tooOld.status).toBe(422);
    expect(tooOld.body.error?.code).toBe("BACKDATE_LIMIT");
    // Seven days back is still open (same civil day, a week earlier).
    const edge = await postMeasurement(weight(72, { observedAt: new Date(Date.now() - 7 * DAY).toISOString() }));
    expect(edge.status).toBe(200);
    expect(await db.select().from(schema.measurements)).toHaveLength(1);

    // An edit cannot move an entry out of the window, nor touch one that is already outside it.
    const recent = await postMeasurement(weight(72, { observedAt: new Date(Date.now() - DAY).toISOString() }));
    const moved = await patchMeasurement(recent.body.data.id, {
      recordVersion: 0,
      observedAt: new Date(Date.now() - 9 * DAY).toISOString(),
    });
    expect(moved.status).toBe(422);
    expect(moved.body.error?.code).toBe("BACKDATE_LIMIT");
    at(Date.now() + 3 * DAY);
    const aged = await patchMeasurement(edge.body.data.id, { recordVersion: 0, value: 70 });
    expect(aged.status).toBe(422);
    expect(aged.body.error?.code).toBe("BACKDATE_LIMIT");
    expect(await auditRows(edge.body.data.id)).toHaveLength(1);
    expect(await auditRows(recent.body.data.id)).toHaveLength(1);
  });

  it("the activity feed lists the create and the edit with the actor and a short summary", async () => {
    const created = await postMeasurement(weight(72.4));
    at(Date.now() + 60_000);
    await patchMeasurement(created.body.data.id, { recordVersion: 0, value: 71.9 });

    const feed = await call("/activity/feed?limit=50", { headers: f.trainer });
    expect(feed.status).toBe(200);
    const coachEvents = (
      feed.body.data.events as Array<{ type: string; subtype: string; summary: string; relationshipId: string }>
    ).filter((e) => e.type === "coach_logged" || e.type === "coach_edited");
    expect(coachEvents.map((e) => e.type)).toEqual(["coach_edited", "coach_logged"]);
    expect(coachEvents.every((e) => e.relationshipId === f.relationshipId && e.subtype === "Measurement")).toBe(true);
    expect(coachEvents[1]!.summary).toMatch(/ logged body weight for Thu 5 Nov: 72\.4 kg$/);
    expect(coachEvents[0]!.summary).toMatch(/ edited body weight for Thu 5 Nov: 72\.4 kg → 71\.9 kg$/);
    for (const event of coachEvents) {
      expect(event.summary).not.toMatch(/_|[0-9a-f]{8}-[0-9a-f]{4}/);
    }
  });

  it("notifies the trainee once per entry within 10 minutes, routing only, with the measurement in the key", async () => {
    await registerTraineePhone();
    const created = await postMeasurement(weight(72.4));
    const id: string = created.body.data.id;

    let rows = await coachNotifications();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      domainEntityType: "coaching_relationship",
      domainEntityId: f.relationshipId,
      mergeGroup: id,
      payloadJson: null,
    });
    expect(rows[0]!.dedupeKey).toMatch(/^coach_log_updated:create:measurement:/);
    const first = await deliveries(rows[0]!.id);
    expect(first).toHaveLength(1);
    expect(first[0]!.providerStatus).toBe("accepted");

    at(Date.now() + 2 * 60_000);
    await patchMeasurement(id, { recordVersion: 0, value: 72 });
    at(Date.now() + 5 * 60_000);
    await patchMeasurement(id, { recordVersion: 1, value: 71.5 });
    rows = await coachNotifications();
    expect(rows).toHaveLength(1);
    expect(await deliveries(rows[0]!.id)).toHaveLength(1);
    expect(await auditRows(id)).toHaveLength(3);

    at(Date.now() + 11 * 60_000);
    await patchMeasurement(id, { recordVersion: 2, value: 71 });
    rows = await coachNotifications();
    expect(rows).toHaveLength(2);
    expect(rows[1]!.dedupeKey).toMatch(/^coach_log_updated:edit:measurement:/);
    expect(await deliveries(rows[1]!.id)).toHaveLength(1);

    const inbox = await call("/notifications", { headers: f.trainee });
    const listed = (inbox.body.data.items as Array<{ type: string; routing: Record<string, unknown> }>).filter(
      (n) => n.type === "coach_log_updated",
    );
    expect(listed).toHaveLength(2);
    for (const item of listed) {
      expect(Object.keys(item.routing).sort()).toEqual([
        "createdAt",
        "domainEntityId",
        "domainEntityType",
        "notificationId",
        "notificationType",
      ]);
    }
  });

  it("coach updates off: audit and activity event stay, no notification and no push", async () => {
    await registerTraineePhone();
    const put = await call("/notifications/preferences", {
      method: "PUT",
      headers: f.trainee,
      body: { coachLogUpdates: false },
    });
    expect(put.status).toBe(200);
    const created = await postMeasurement(weight(72.4));
    await patchMeasurement(created.body.data.id, { recordVersion: 0, value: 72 });
    expect(await coachNotifications()).toHaveLength(0);
    expect(await db.select().from(schema.notificationDeliveries)).toHaveLength(0);
    expect(await auditRows(created.body.data.id)).toHaveLength(2);
    const feed = await call("/activity/feed?limit=50", { headers: f.trainer });
    expect(
      (feed.body.data.events as Array<{ type: string }>).filter(
        (e) => e.type === "coach_logged" || e.type === "coach_edited",
      ),
    ).toHaveLength(2);
  });

  it("push off or quiet hours: the notification is stored but not pushed", async () => {
    await registerTraineePhone();
    await call("/notifications/preferences", {
      method: "PUT",
      headers: f.trainee,
      body: { pushEnabled: false },
    });
    const created = await postMeasurement(weight(72.4));
    let rows = await coachNotifications();
    expect(rows).toHaveLength(1);
    expect(await deliveries(rows[0]!.id)).toHaveLength(0);

    await call("/notifications/preferences", {
      method: "PUT",
      headers: f.trainee,
      body: { pushEnabled: true, quietHoursStart: "22:00", quietHoursEnd: "07:00" },
    });
    // 23:30 in Kolkata, past the merge window.
    at(Date.parse(THURSDAY) + 12 * HOUR);
    const edit = await patchMeasurement(created.body.data.id, { recordVersion: 0, value: 72 });
    expect(edit.status).toBe(200);
    rows = await coachNotifications();
    expect(rows).toHaveLength(2);
    expect(await deliveries(rows[1]!.id)).toHaveLength(0);
  });

  it("R1: trainee writes on a coach-created measurement return 409 COACH_LOGGED_READ_ONLY, on REST and sync push", async () => {
    const id = "00000000-0000-4000-8000-00000000c301";
    await postMeasurement(weight(72.4, { id }));

    const rest = await postMeasurement(weight(60, { id }), "r1-rest", f.trainee);
    expect(rest.status).toBe(409);
    expect(rest.body.error).toMatchObject({
      code: "COACH_LOGGED_READ_ONLY",
      message: "This measurement was logged by your coach and cannot be changed.",
    });

    const mutationId = "00000000-0000-4000-8000-00000000c302";
    const push = await call("/sync/push", {
      method: "POST",
      headers: f.trainee,
      body: {
        mutations: [
          {
            mutationId,
            idempotencyKey: mutationId,
            entityType: "measurement",
            recordId: id,
            operation: "measurement.create",
            expectedServerVersion: null,
            clientOccurredAt: new Date().toISOString(),
            payload: {
              coachingRelationshipId: f.relationshipId,
              id,
              body: { id, type: "body_weight_kg", value: 60, unit: "kg" },
            },
          },
        ],
      },
    });
    expect(push.status).toBe(200);
    expect(push.body.data.results[0]).toMatchObject({ status: "conflicted", error: { code: "COACH_LOGGED_READ_ONLY" } });

    // The trainee cannot use the trainer edit route either, and the entry is untouched.
    const traineePatch = await patchMeasurement(id, { recordVersion: 0, value: 60 }, f.trainee);
    expect(traineePatch.status).toBe(403);
    const [row] = await db.select().from(schema.measurements).where(eq(schema.measurements.id, id));
    expect(row).toMatchObject({ value: 72.4, recordVersion: 0, loggedByRole: "coach" });

    // A new measurement of the trainee's own is unaffected.
    const own = await postMeasurement(weight(72.1), "r1-own", f.trainee);
    expect(own.status).toBe(200);
    expect(own.body.data).toMatchObject({ loggedByRole: "trainee", source: "trainee_entry" });
    expect(await auditRows(own.body.data.id)).toHaveLength(0);
  });

  it("another trainer gets 403 and an ended client 409, for create and edit", async () => {
    const created = await postMeasurement(weight(72.4));
    const other = await trainerSession("coach-meas-other-trainer@example.com");

    const otherCreate = await postMeasurement(weight(70), undefined, other);
    expect(otherCreate.status).toBe(403);
    expect(otherCreate.body.error?.code).toBe("FORBIDDEN");
    const otherEdit = await patchMeasurement(created.body.data.id, { recordVersion: 0, value: 70 }, other);
    expect(otherEdit.status).toBe(403);
    const unknownClient = await postMeasurement(weight(70), undefined, f.trainer, createId());
    expect(unknownClient.status).toBe(404);

    const ended = await call(`/relationships/${f.relationshipId}/end`, {
      method: "POST",
      headers: f.trainer,
      body: {},
    });
    expect(ended.status).toBe(200);
    const endedEdit = await patchMeasurement(created.body.data.id, { recordVersion: 0, value: 70 });
    expect(endedEdit.status).toBe(409);
    expect(endedEdit.body.error?.code).toBe("RELATIONSHIP_ENDED");
    const endedCreate = await postMeasurement(weight(70));
    expect(endedCreate.status).toBe(409);
    expect(endedCreate.body.error?.code).toBe("RELATIONSHIP_ENDED");
    expect(await auditRows(created.body.data.id)).toHaveLength(1);
    expect(await db.select().from(schema.measurements)).toHaveLength(1);
  });

  it("D-W6-20: an entry dated before the reactivation day is frozen, 422 ENDED_PERIOD", async () => {
    await db
      .update(schema.coachingRelationships)
      .set({ reactivatedAt: new Date(Date.parse(THURSDAY) - 1 * DAY + HOUR).toISOString() })
      .where(eq(schema.coachingRelationships.id, f.relationshipId));
    const frozen = await postMeasurement(
      weight(72, { observedAt: new Date(Date.parse(THURSDAY) - 3 * DAY).toISOString() }),
    );
    expect(frozen.status).toBe(422);
    expect(frozen.body.error?.code).toBe("ENDED_PERIOD");
    const open = await postMeasurement(weight(72));
    expect(open.status).toBe(200);
  });

  it("D-W6-40: a frozen measurement cannot be edited by moving its date to now", async () => {
    const observedAt = new Date(Date.parse(THURSDAY) - 3 * DAY).toISOString();
    const created = await postMeasurement(weight(72, { observedAt }));
    expect(created.status).toBe(200);
    await db
      .update(schema.coachingRelationships)
      .set({ reactivatedAt: new Date(Date.parse(THURSDAY) - 1 * DAY + HOUR).toISOString() })
      .where(eq(schema.coachingRelationships.id, f.relationshipId));
    const moved = await patchMeasurement(created.body.data.id, {
      recordVersion: 0,
      observedAt: new Date().toISOString(),
    });
    expect(moved.status).toBe(422);
    expect(moved.body.error?.code).toBe("ENDED_PERIOD");
    const [row] = await db
      .select()
      .from(schema.measurements)
      .where(eq(schema.measurements.id, created.body.data.id));
    expect(row).toMatchObject({ observedAt, value: 72, recordVersion: 0 });
    expect(await auditRows(created.body.data.id)).toHaveLength(1);
  });
});
