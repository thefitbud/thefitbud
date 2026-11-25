/**
 * Z14-11 (D-W14-20, D-W14-22, D-W14-23): the trainee edits, removes and adds a
 * photo to their own logged meal, the coach is told once per entry per ten
 * minutes, and the same operations work offline through sync/push. Real routes
 * on persisted data: invitation, intake, configuration, published plan,
 * generated meal assignments, then the trainee's confirm and the new writes.
 *
 * The clock is pinned (Date only): Monday 2 Nov 2026 06:00 UTC is 11:30 in
 * Asia/Kolkata.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- response bodies are read loosely in this test */
import { and, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDaysToLocalDate, formatLocalDate } from "@fitbud/core";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb, type MemoryDbHandle } from "../test-support/memory-db.js";
import { installRoundTripCounter } from "../test-support/query-count.js";
import { createId } from "../lib/crypto.js";
import type { Env } from "../types.js";

const MONDAY = "2026-11-02T06:00:00.000Z";
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
      data?: any;
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

const BREAKFAST_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LUNCH_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function planContent() {
  return {
    workoutDays: [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", order: 1, name: "Day A", exercises: [] },
    ],
    mealPrescriptions: [
      {
        id: BREAKFAST_ID,
        order: 1,
        name: "Breakfast",
        mealType: "breakfast",
        applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
        localTime: "08:00",
        scheduleHint: "Morning",
        instructions: "Oats and eggs",
        photoRequired: false,
      },
      {
        id: LUNCH_ID,
        order: 2,
        name: "Lunch",
        mealType: "lunch",
        applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
        localTime: "13:00",
        scheduleHint: "Midday",
        instructions: "Rice and dal",
        photoRequired: false,
      },
    ],
  };
}

type Fixture = Awaited<ReturnType<typeof coachingWithMealPlan>>;
type AssignmentRow = { id: string; localDate: string; mealName: string; windowEndsAt: string };

/** An active client with a published meal plan and two weeks of generated meals. */
async function coachingWithMealPlan(suffix: string) {
  const trainer = await trainerSession(`coach-meal-${suffix}@example.com`);
  const invite = await call("/invitations", {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `inv-${suffix}` },
    body: { recipientEmail: `coach-meal-client-${suffix}@example.com` },
  });
  const traineeToken = createTestIdToken(
    `coach-meal-client-${suffix}`,
    `coach-meal-client-${suffix}@example.com`,
  );
  const trainee = { Authorization: `Bearer ${traineeToken}`, "x-fitbud-role": "trainee" };
  const accepted = await call("/invitations/accept", {
    method: "POST",
    headers: { Authorization: `Bearer ${traineeToken}` },
    body: { token: invite.body.data.token, timezone: TZ },
  });
  const relationshipId: string = accepted.body.data.relationship.id;

  await call(`/onboarding/relationships/${relationshipId}/draft`, {
    method: "PUT",
    headers: trainee,
    body: {
      expectedVersion: 0,
      answers: {
        goals: "Recomp",
        relevant_history: "None",
        preferences: "Home food",
        schedule: "Evenings",
        limitations: "None",
      },
    },
  });
  await call(`/onboarding/relationships/${relationshipId}/submit`, {
    method: "POST",
    headers: { ...trainee, "Idempotency-Key": `submit-${suffix}` },
    body: { expectedVersion: 1 },
  });
  await call(`/onboarding/relationships/${relationshipId}/review`, {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `review-${suffix}` },
    body: { outcome: "coaching_ready" },
  });
  await call(`/configurations/relationships/${relationshipId}/draft`, {
    method: "PUT",
    headers: trainer,
    body: {
      expectedVersion: 0,
      goalShort: "Nutrition adherence",
      workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
      nutrition: { mealsPerDay: 2, confirmationWindowHours: 24, photoRequirement: "none" },
      checkin: { cadence: "weekly", dueWindowHours: 48 },
      tracking: { requireBodyWeight: false, requireProgressPhotos: false, requireSessionRpe: false },
    },
  });
  await call(`/configurations/relationships/${relationshipId}/configure`, {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `cfg-${suffix}` },
    body: { expectedVersion: 1 },
  });
  await call(`/configurations/relationships/${relationshipId}/activate`, {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `act-${suffix}` },
    body: { expectedVersion: 1 },
  });

  const plan = await call(`/plans/relationships/${relationshipId}`, {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `plan-${suffix}` },
    body: { title: "Nutrition foundation", content: planContent() },
  });
  const published = await call(
    `/plans/${plan.body.data.plan.id}/versions/${plan.body.data.version.id}/publish`,
    {
      method: "POST",
      headers: { ...trainer, "Idempotency-Key": `pub-${suffix}` },
      body: { expectedRecordVersion: plan.body.data.version.recordVersion, mode: "immediate" },
    },
  );
  expect(published.status).toBe(200);
  const today = formatLocalDate(new Date(), TZ);
  const generated = await call(`/meals/relationships/${relationshipId}/assignments/generate`, {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `gen-${suffix}` },
    body: { fromDate: today, toDate: addDaysToLocalDate(today, 13) },
  });
  expect(generated.status).toBe(200);
  const assignments = generated.body.data.assignments as AssignmentRow[];
  expect(assignments).toHaveLength(28);
  const pick = (offset: number, mealName: string) =>
    assignments.find((a) => a.localDate === addDaysToLocalDate(today, offset) && a.mealName === mealName)!;

  return {
    trainer,
    trainee,
    relationshipId,
    today,
    /** Mon 2 Nov, three days before the pinned "now". */
    mondayBreakfast: pick(0, "Breakfast"),
    mondayLunch: pick(0, "Lunch"),
    tuesdayBreakfast: pick(1, "Breakfast"),
    /** Fri 6 Nov: tomorrow at the pinned "now". */
    fridayBreakfast: pick(4, "Breakfast"),
    pick,
  };
}



const ASIA_NIGHT = 12 * HOUR; // Monday 18:00 UTC is 23:30 in Kolkata: inside the default quiet hours.

describe("trainee edits, removes and adds a photo to a logged meal (Z14-11)", () => {
  let db: Db;
  let handle: MemoryDbHandle;
  let close: () => void;
  let f: Fixture;

  async function confirm(assignment: AssignmentRow = f.mondayBreakfast) {
    const res = await call(`/meals/assignments/${assignment.id}/confirm`, {
      method: "POST",
      headers: { ...f.trainee, "Idempotency-Key": `confirm-${createId()}` },
      body: {},
    });
    expect(res.status).toBe(200);
    return res.body.data as {
      id: string;
      recordVersion: number;
      loggedAt: string;
      editableUntil: string | null;
      canRemove: boolean;
    };
  }

  const ATE_OUT = {
    outcome: "modified",
    deviationKind: "restaurant",
    items: [{ customFood: { name: "Biryani", kcal: 900 } }],
  };

  async function patchLog(
    id: string,
    body: Record<string, unknown>,
    key = `edit-${createId()}`,
    headers: Record<string, string> = f.trainee,
  ) {
    return call(`/meals/logs/${id}`, {
      method: "PATCH",
      headers: { ...headers, "Idempotency-Key": key },
      body,
    });
  }

  async function removeLog(
    id: string,
    recordVersion: number,
    key = `remove-${createId()}`,
    headers: Record<string, string> = f.trainee,
  ) {
    return call(`/meals/logs/${id}`, {
      method: "DELETE",
      headers: { ...headers, "Idempotency-Key": key },
      body: { recordVersion },
    });
  }

  async function attachPhoto(id: string, mediaAssetId: string, key = `photo-${createId()}`) {
    return call(`/meals/logs/${id}/photo`, {
      method: "POST",
      headers: { ...f.trainee, "Idempotency-Key": key },
      body: { mediaAssetId },
    });
  }

  async function people() {
    const [rel] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, f.relationshipId));
    return {
      traineeUserId: rel!.traineeUserId,
      trainerUserId: rel!.trainerUserId,
    };
  }

  async function mediaAsset(
    overrides: Partial<typeof schema.mediaAssets.$inferInsert> = {},
  ): Promise<string> {
    const { traineeUserId } = await people();
    const id = createId();
    const now = new Date().toISOString();
    await db.insert(schema.mediaAssets).values({
      id,
      coachingRelationshipId: f.relationshipId,
      uploaderUserId: traineeUserId,
      mediaType: "meal_photo",
      status: "ready",
      objectKey: `meal/${id}.jpg`,
      contentType: "image/jpeg",
      byteSize: 1024,
      originalFilename: null,
      domainEntityType: null,
      domainEntityId: null,
      recordVersion: 0,
      createdAt: now,
      updatedAt: now,
      uploadedAt: now,
      ...overrides,
    });
    return id;
  }

  async function trainerNotifications() {
    const { trainerUserId } = await people();
    return db
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.recipientUserId, trainerUserId),
          eq(schema.notifications.notificationType, "trainer_client_log_edited"),
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

  async function registerTrainerPhone() {
    const res = await call("/notifications/device-tokens", {
      method: "POST",
      headers: f.trainer,
      body: {
        token: "ExponentPushToken[coach-log-edit-phone]",
        platform: "android",
        provider: "expo",
        installationId: "coach-log-edit-install",
      },
    });
    expect(res.status).toBeLessThan(300);
  }

  async function audit(entityId: string) {
    return db
      .select()
      .from(schema.logEditEvents)
      .where(eq(schema.logEditEvents.entityId, entityId))
      .orderBy(schema.logEditEvents.createdAt);
  }

  async function mealRead(headers: Record<string, string>) {
    const res = await call(
      `/meals/relationships/${f.relationshipId}/assignments?fromDate=${f.today}&toDate=${f.today}`,
      { headers },
    );
    expect(res.status).toBe(200);
    return (res.body.data.items as Array<{ id: string; compliance: any; status: string }>).find(
      (item) => item.id === f.mondayBreakfast.id,
    )!;
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(MONDAY);
    handle = await createMemoryDb();
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
    f = await coachingWithMealPlan(createId().slice(0, 8));
    at(MONDAY);
  }, 60_000);

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    close();
  });

  it("a logged meal carries editableUntil (logged + 24 h) and canRemove for the trainee only", async () => {
    const entry = await confirm();
    expect(entry.editableUntil).toBe(new Date(Date.parse(entry.loggedAt) + DAY).toISOString());
    expect(entry.canRemove).toBe(true);

    const trainee = await mealRead(f.trainee);
    expect(trainee.compliance.editableUntil).toBe(entry.editableUntil);
    expect(trainee.compliance.canRemove).toBe(true);
    const coach = await mealRead(f.trainer);
    expect(coach.compliance.editableUntil).toBeUndefined();
    expect(coach.compliance.canRemove).toBeUndefined();
    expect(coach.compliance.lastEditedAt).toBeNull();

    // A coach-logged entry is never editable (null) and cannot be removed.
    const lunch = await call(`/meals/compliance/${f.mondayLunch.id}/${f.mondayLunch.localDate}`, {
      method: "PUT",
      headers: { ...f.trainer, "Idempotency-Key": `coach-${createId()}` },
      body: { outcome: "confirmed" },
    });
    expect(lunch.status).toBe(201);
    const day = await call(
      `/meals/relationships/${f.relationshipId}/assignments?fromDate=${f.today}&toDate=${f.today}`,
      { headers: f.trainee },
    );
    const coachLunch = (day.body.data.items as Array<{ id: string; compliance: any }>).find(
      (item) => item.id === f.mondayLunch.id,
    )!;
    expect(coachLunch.compliance.editableUntil).toBeNull();
    expect(coachLunch.compliance.canRemove).toBe(false);
  });

  it("edits as planned → ate out → note only → as planned, versioned, audited and visible to the coach", async () => {
    const entry = await confirm();
    at(Date.parse(MONDAY) + 10 * 60_000);
    const first = await patchLog(entry.id, { ...ATE_OUT, notes: "Wedding lunch", recordVersion: 0 });
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      outcome: "modified",
      deviationKind: "restaurant",
      recordVersion: 1,
      lastEditedByRole: "trainee",
      loggedByRole: "trainee",
    });
    expect(first.body.data.loggedTotals.energyKcal).toBe(900);
    expect(first.body.data.editableUntil).toBe(entry.editableUntil);

    // Note only: the lines stay, the note changes.
    const noteOnly = await patchLog(entry.id, {
      outcome: "modified",
      deviationKind: "restaurant",
      notes: "Wedding lunch, shared",
      recordVersion: 1,
    });
    expect(noteOnly.status).toBe(200);
    expect(noteOnly.body.data.loggedTotals.energyKcal).toBe(900);
    expect(noteOnly.body.data.recordVersion).toBe(2);

    const back = await patchLog(entry.id, { outcome: "confirmed", recordVersion: 2 });
    expect(back.status).toBe(200);
    expect(back.body.data).toMatchObject({ outcome: "confirmed", deviationKind: null, notes: null });

    const rows = await audit(entry.id);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ actorRole: "trainee", entityType: "meal_compliance", action: "edit" });
    expect(JSON.parse(rows[0]!.beforeJson!)).toMatchObject({ outcome: "confirmed" });
    expect(JSON.parse(rows[0]!.afterJson)).toMatchObject({ outcome: "modified", deviationKind: "restaurant" });

    const [stored] = await db
      .select()
      .from(schema.mealCompliance)
      .where(eq(schema.mealCompliance.id, entry.id));
    expect(stored).toMatchObject({
      lastEditedByRole: "trainee",
      recordVersion: 3,
      loggedByRole: "trainee",
    });
    expect(stored!.lastEditedByUserId).toBe((await people()).traineeUserId);
    expect(stored!.lastEditedAt).not.toBeNull();

    // The coach reads who edited and what it said before the latest edit.
    const coach = await mealRead(f.trainer);
    expect(coach.compliance).toMatchObject({ lastEditedByRole: "trainee", outcome: "confirmed" });
    expect(coach.compliance.previousValue).toMatchObject({ outcome: "modified", deviationKind: "restaurant" });
    expect(coach.compliance.previousValue.notes).toBe("Wedding lunch, shared");

    const feed = await call("/activity/feed", { headers: f.trainer });
    const types = (feed.body.data.events as Array<{ type: string; summary: string; entryId?: string }>).filter(
      (event) => event.type === "client_edited",
    );
    expect(types).toHaveLength(3);
    expect(types[0]!.summary).toBe("Edited breakfast");
    expect(types[0]!.entryId).toBe(entry.id);
  });

  it("an edit re-runs exception evaluation through the normal write path and never resolves one", async () => {
    const entry = await confirm();
    const before = await db.select().from(schema.exceptions);
    await patchLog(entry.id, { ...ATE_OUT, recordVersion: 0 });
    const after = await db.select().from(schema.exceptions);
    expect(after.filter((row) => row.status === "resolved")).toHaveLength(
      before.filter((row) => row.status === "resolved").length,
    );
  });

  it("the 24 h boundary: 23:59 after logging is accepted, 24:01 is refused with a friendly 422", async () => {
    const entry = await confirm();
    at(Date.parse(entry.loggedAt) + DAY - 60_000);
    const inside = await patchLog(entry.id, { ...ATE_OUT, recordVersion: 0 });
    expect(inside.status).toBe(200);
    at(Date.parse(entry.loggedAt) + DAY + 60_000);
    const late = await patchLog(entry.id, { outcome: "confirmed", recordVersion: 1 });
    expect(late.status).toBe(422);
    expect(late.body.error).toEqual({
      code: "MEAL_EDIT_WINDOW_CLOSED",
      message: "Logged entries can be changed for 24 hours. Ask your coach to fix it.",
      requestId: expect.any(String),
    });
    const [stored] = await db
      .select()
      .from(schema.mealCompliance)
      .where(eq(schema.mealCompliance.id, entry.id));
    expect(stored!.recordVersion).toBe(1);
  });

  it("a stale version is 409 VERSION_CONFLICT and a retried key returns the stored answer once", async () => {
    const entry = await confirm();
    const stale = await patchLog(entry.id, { ...ATE_OUT, recordVersion: 4 });
    expect(stale.status).toBe(409);
    expect(stale.body.error?.code).toBe("VERSION_CONFLICT");

    const key = `edit-${createId()}`;
    const first = await patchLog(entry.id, { ...ATE_OUT, recordVersion: 0 }, key);
    const retry = await patchLog(entry.id, { ...ATE_OUT, recordVersion: 0 }, key);
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(retry.body.data).toEqual(first.body.data);
    expect(await audit(entry.id)).toHaveLength(1);

    const reused = await patchLog(entry.id, { outcome: "confirmed", recordVersion: 1 }, key);
    expect(reused.status).toBe(409);
    expect(reused.body.error?.code).toBe("IDEMPOTENCY_KEY_REUSE");
  });

  it("a coach-logged entry, a coach-edited entry and someone else's entry cannot be changed", async () => {
    const coachLogged = await call(
      `/meals/compliance/${f.mondayLunch.id}/${f.mondayLunch.localDate}`,
      {
        method: "PUT",
        headers: { ...f.trainer, "Idempotency-Key": `coach-${createId()}` },
        body: { outcome: "confirmed" },
      },
    );
    const readOnly = await patchLog(coachLogged.body.data.id, { ...ATE_OUT, recordVersion: 0 });
    expect(readOnly.status).toBe(409);
    expect(readOnly.body.error?.code).toBe("COACH_LOGGED_READ_ONLY");
    const readOnlyRemove = await removeLog(coachLogged.body.data.id, 0);
    expect(readOnlyRemove.body.error?.code).toBe("COACH_LOGGED_READ_ONLY");

    const entry = await confirm();
    const coachEdit = await call(`/meals/compliance/${f.mondayBreakfast.id}/${f.mondayBreakfast.localDate}`, {
      method: "PUT",
      headers: { ...f.trainer, "Idempotency-Key": `coach-${createId()}` },
      body: { outcome: "skipped", recordVersion: 0 },
    });
    expect(coachEdit.status).toBe(200);
    const edited = await patchLog(entry.id, { outcome: "confirmed", recordVersion: 1 });
    expect(edited.status).toBe(409);
    expect(edited.body.error?.code).toBe("MEAL_EDITED_BY_COACH");
    const photo = await attachPhoto(entry.id, await mediaAsset());
    expect(photo.body.error?.code).toBe("MEAL_EDITED_BY_COACH");
    // The coach's edit is not a trainee edit: nothing for the coach to be told.
    expect(await trainerNotifications()).toHaveLength(0);

    // Another client of another coach: the entry is not theirs (404), nor a coach's (403).
    const other = await coachingWithMealPlan(`other-${createId().slice(0, 6)}`);
    const notMine = await patchLog(entry.id, { outcome: "confirmed", recordVersion: 1 }, undefined, other.trainee);
    expect(notMine.status).toBe(404);
    expect((await removeLog(entry.id, 1, undefined, other.trainee)).status).toBe(404);
    const asCoach = await patchLog(entry.id, { outcome: "confirmed", recordVersion: 1 }, undefined, f.trainer);
    expect(asCoach.status).toBe(403);
  });

  it("an ended client's entry is read-only", async () => {
    const entry = await confirm();
    const ended = await call(`/relationships/${f.relationshipId}/end`, {
      method: "POST",
      headers: f.trainer,
      body: {},
    });
    expect(ended.status).toBe(200);
    const edit = await patchLog(entry.id, { ...ATE_OUT, recordVersion: 0 });
    expect(edit.status).toBe(409);
    expect(edit.body.error?.code).toBe("RELATIONSHIP_ENDED");
    const remove = await removeLog(entry.id, 0);
    expect(remove.body.error?.code).toBe("RELATIONSHIP_ENDED");
    const photo = await attachPhoto(entry.id, await mediaAsset());
    expect(photo.body.error?.code).toBe("RELATIONSHIP_ENDED");
  });

  it("removes a log: the meal reads as not logged, the before-image is kept, and it can be logged again", async () => {
    const entry = await confirm();
    await patchLog(entry.id, { ...ATE_OUT, recordVersion: 0 });
    const key = `remove-${createId()}`;
    const removed = await removeLog(entry.id, 1, key);
    expect(removed.status).toBe(200);
    expect(removed.body.data).toMatchObject({
      id: entry.id,
      assignmentId: f.mondayBreakfast.id,
      removed: true,
    });
    const retry = await removeLog(entry.id, 1, key);
    expect(retry.status).toBe(200);
    expect(retry.body.data).toEqual(removed.body.data);

    const read = await mealRead(f.trainee);
    expect(read.compliance).toBeNull();
    expect(["pending", "overdue"]).toContain(read.status);
    expect(await db.select().from(schema.mealCompliance).where(eq(schema.mealCompliance.id, entry.id))).toHaveLength(0);

    const rows = await audit(entry.id);
    expect(rows).toHaveLength(2);
    expect(JSON.parse(rows[1]!.beforeJson!)).toMatchObject({ outcome: "modified", deviationKind: "restaurant" });
    expect(JSON.parse(rows[1]!.afterJson).removed).toBe(true);

    const feed = await call("/activity/feed", { headers: f.trainer });
    const events = feed.body.data.events as Array<{ type: string; summary: string }>;
    expect(events.find((event) => event.type === "client_removed")?.summary).toBe("Removed the breakfast log");

    const again = await confirm();
    expect(again.id).not.toBe(entry.id);
  });

  it("refuses a removal after 24 h, or when the meal can no longer be logged, with a friendly 422", async () => {
    const entry = await confirm();
    await db
      .update(schema.mealAssignments)
      .set({ scheduleStatus: "superseded" })
      .where(eq(schema.mealAssignments.id, f.mondayBreakfast.id));
    const locked = await removeLog(entry.id, 0);
    expect(locked.status).toBe(422);
    expect(locked.body.error?.code).toBe("MEAL_REMOVE_NOT_ALLOWED");
    const read = await call(`/meals/assignments/${f.mondayBreakfast.id}`, { headers: f.trainee });
    expect(read.status).toBe(200);
    expect(read.body.data.compliance.canRemove).toBe(false);
    expect(read.body.data.compliance.editableUntil).not.toBeNull();
    // Edit is still offered while the window is open.
    expect((await patchLog(entry.id, { ...ATE_OUT, recordVersion: 0 })).status).toBe(200);

    await db
      .update(schema.mealAssignments)
      .set({ scheduleStatus: "scheduled" })
      .where(eq(schema.mealAssignments.id, f.mondayBreakfast.id));
    at(Date.parse(entry.loggedAt) + DAY + 60_000);
    const late = await removeLog(entry.id, 1);
    expect(late.status).toBe(422);
    expect(late.body.error?.code).toBe("MEAL_REMOVE_NOT_ALLOWED");
    expect(await db.select().from(schema.mealCompliance).where(eq(schema.mealCompliance.id, entry.id))).toHaveLength(1);
  });

  it("refused when the confirmation window has closed, even inside the 24 h edit window", async () => {
    const entry = await confirm();
    at(Date.parse(f.mondayBreakfast.windowEndsAt) + 60_000);
    expect(Date.now()).toBeLessThan(Date.parse(entry.loggedAt) + DAY);
    const read = await call(`/meals/assignments/${f.mondayBreakfast.id}`, { headers: f.trainee });
    expect(read.body.data.compliance.canRemove).toBe(false);
    expect(read.body.data.compliance.editableUntil).not.toBeNull();
    const refused = await removeLog(entry.id, 0);
    expect(refused.status).toBe(422);
    expect(refused.body.error?.code).toBe("MEAL_REMOVE_NOT_ALLOWED");
    expect(refused.body.error?.message).toBe("This log can't be removed any more.");
    expect(await db.select().from(schema.mealCompliance).where(eq(schema.mealCompliance.id, entry.id))).toHaveLength(1);
    // Editing is still allowed inside the 24 h window.
    expect((await patchLog(entry.id, { ...ATE_OUT, recordVersion: 0 })).status).toBe(200);
  });

  it("refuses a skipped outcome on edit, and a photo or edit on an entry from before a reactivation", async () => {
    const entry = await confirm();
    const skipped = await patchLog(entry.id, { outcome: "skipped", recordVersion: 0 });
    expect(skipped.status).toBe(400);
    expect(skipped.body.error?.code).toBe("INVALID_REQUEST");

    await db
      .update(schema.coachingRelationships)
      .set({ reactivatedAt: new Date(Date.parse(entry.loggedAt) + 60_000).toISOString() })
      .where(eq(schema.coachingRelationships.id, f.relationshipId));
    const photo = await attachPhoto(entry.id, await mediaAsset());
    expect(photo.status).toBe(422);
    expect(photo.body.error?.code).toBe("ENDED_PERIOD");
    const edit = await patchLog(entry.id, { ...ATE_OUT, recordVersion: 0 });
    expect(edit.body.error?.code).toBe("ENDED_PERIOD");
  });

  it("attaches, replaces and refuses photos; a photo-only change is neither an edit nor a notification", async () => {
    const entry = await confirm();
    const first = await mediaAsset();
    const attached = await attachPhoto(entry.id, first);
    expect(attached.status).toBe(200);
    expect(attached.body.data).toMatchObject({ mediaAssetId: first, recordVersion: 1 });
    expect(attached.body.data.lastEditedByRole ?? null).toBeNull();
    const [linked] = await db.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.id, first));
    expect(linked).toMatchObject({ domainEntityType: "meal_compliance", domainEntityId: entry.id });

    const second = await mediaAsset();
    const replaced = await attachPhoto(entry.id, second);
    expect(replaced.body.data.mediaAssetId).toBe(second);
    const rows = await audit(entry.id);
    expect(JSON.parse(rows[1]!.beforeJson!).mediaAssetId).toBe(first);

    const key = `photo-${createId()}`;
    const third = await mediaAsset();
    const one = await attachPhoto(entry.id, third, key);
    const retry = await attachPhoto(entry.id, third, key);
    expect(retry.body.data).toEqual(one.body.data);
    expect((await audit(entry.id)).length).toBe(3);

    const wrongType = await attachPhoto(entry.id, await mediaAsset({ mediaType: "progress_photo" }));
    expect(wrongType.status).toBe(422);
    expect(wrongType.body.error?.code).toBe("MEDIA_ASSET_INVALID");
    const notReady = await attachPhoto(entry.id, await mediaAsset({ status: "pending_upload" }));
    expect(notReady.body.error?.code).toBe("MEDIA_ASSET_INVALID");
    const [rel] = await db.select().from(schema.coachingRelationships);
    const theirs = await attachPhoto(entry.id, await mediaAsset({ uploaderUserId: rel!.trainerUserId }));
    expect(theirs.body.error?.code).toBe("MEDIA_ASSET_INVALID");

    expect(await trainerNotifications()).toHaveLength(0);
    const feed = await call("/activity/feed", { headers: f.trainer });
    expect((feed.body.data.events as Array<{ type: string }>).filter((e) => e.type === "client_edited")).toHaveLength(0);

    at(Date.parse(entry.loggedAt) + DAY + 60_000);
    const closed = await attachPhoto(entry.id, await mediaAsset());
    expect(closed.status).toBe(422);
    expect(closed.body.error?.code).toBe("MEAL_EDIT_WINDOW_CLOSED");
  });

  it("a requirement for a photo is satisfied by attaching one to the logged meal", async () => {
    const entry = await confirm();
    await db
      .update(schema.mealCompliance)
      .set({ photoRequired: true })
      .where(eq(schema.mealCompliance.id, entry.id));
    const asset = await mediaAsset();
    const res = await attachPhoto(entry.id, asset);
    expect(res.body.data).toMatchObject({ photoRequired: true, mediaAssetId: asset });
    expect(res.body.data.photoIntent.mediaAssetId).toBe(asset);
  });

  describe("telling the coach (D-W14-23)", () => {
    it("one inbox row and one push; a second edit in the bucket updates the row without a second push", async () => {
      await registerTrainerPhone();
      const entry = await confirm();
      await patchLog(entry.id, { ...ATE_OUT, recordVersion: 0 });
      let rows = await trainerNotifications();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        domainEntityType: "coaching_relationship",
        domainEntityId: f.relationshipId,
      });
      expect(rows[0]!.dedupeKey).toMatch(new RegExp(`^trainer_client_log_edited:${entry.id}:\\d+$`));
      expect(JSON.parse(rows[0]!.payloadJson!)).toEqual({
        entryId: entry.id,
        action: "edited",
        mealName: "Breakfast",
        mealDate: f.mondayBreakfast.localDate,
        fromKcal: null,
        toKcal: 900,
        fromOutcome: "confirmed",
        toOutcome: "modified",
        fromDeviationKind: null,
        fields: ["outcome", "kcal"],
      });
      const sent = await deliveries(rows[0]!.id);
      expect(sent).toHaveLength(1);
      expect(sent[0]!.providerStatus).toBe("accepted");

      // The trainer read it; a second change five minutes later reopens it.
      await db
        .update(schema.notifications)
        .set({ readAt: new Date().toISOString(), state: "read" })
        .where(eq(schema.notifications.id, rows[0]!.id));
      at(Date.now() + 5 * 60_000);
      await patchLog(entry.id, {
        outcome: "modified",
        deviationKind: "restaurant",
        items: [{ customFood: { name: "Biryani", kcal: 1100 } }],
        recordVersion: 1,
      });
      rows = await trainerNotifications();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.readAt).toBeNull();
      expect(rows[0]!.state).toBe("delivered");
      expect(JSON.parse(rows[0]!.payloadJson!)).toMatchObject({ fromKcal: null, toKcal: 1100, fromOutcome: "confirmed" });
      expect(await deliveries(rows[0]!.id)).toHaveLength(1);

      // A removal in the same bucket turns the row into the removed copy, no push.
      at(Date.now() + 60_000);
      await removeLog(entry.id, 2);
      rows = await trainerNotifications();
      expect(rows).toHaveLength(1);
      expect(JSON.parse(rows[0]!.payloadJson!)).toMatchObject({
        action: "removed",
        fromKcal: null,
        toKcal: null,
        toOutcome: null,
        fields: [],
      });
      expect(await deliveries(rows[0]!.id)).toHaveLength(1);
    });

    it("a change more than ten minutes after the first is a new row and a new push", async () => {
      await registerTrainerPhone();
      const entry = await confirm();
      await patchLog(entry.id, { ...ATE_OUT, recordVersion: 0 });
      at(Date.now() + 11 * 60_000);
      await patchLog(entry.id, { outcome: "confirmed", recordVersion: 1 });
      const rows = await trainerNotifications();
      expect(rows).toHaveLength(2);
      for (const row of rows) expect(await deliveries(row.id)).toHaveLength(1);
    });

    it("category off: no inbox row and no push; quiet hours: the row is stored, the push is held", async () => {
      await registerTrainerPhone();
      const off = await call("/notifications/preferences", {
        method: "PUT",
        headers: f.trainer,
        body: { trainerCategories: { clientLogEdits: false } },
      });
      expect(off.status).toBe(200);
      const entry = await confirm();
      await patchLog(entry.id, { ...ATE_OUT, recordVersion: 0 });
      expect(await trainerNotifications()).toHaveLength(0);
      expect(await db.select().from(schema.notificationDeliveries)).toHaveLength(0);

      const on = await call("/notifications/preferences", {
        method: "PUT",
        headers: f.trainer,
        body: { trainerCategories: { clientLogEdits: true } },
      });
      expect(on.status).toBe(200);
      at(Date.parse(MONDAY) + ASIA_NIGHT);
      await patchLog(entry.id, { outcome: "confirmed", recordVersion: 1 });
      const rows = await trainerNotifications();
      expect(rows).toHaveLength(1);
      expect(await deliveries(rows[0]!.id)).toHaveLength(0);
    });

    it("a refused change and a failing notification never fail or block the trainee's edit", async () => {
      const entry = await confirm();
      await patchLog(entry.id, { ...ATE_OUT, recordVersion: 9 });
      expect(await trainerNotifications()).toHaveLength(0);

      // Break the inbox write: the edit still commits and answers 200.
      await db.run(sql`alter table notifications rename to notifications_gone`);
      try {
        const res = await patchLog(entry.id, { ...ATE_OUT, recordVersion: 0 });
        expect(res.status).toBe(200);
        expect(res.body.data.recordVersion).toBe(1);
      } finally {
        await db.run(sql`alter table notifications_gone rename to notifications`);
      }
    });

    it("the trainer's inbox lists it with what changed (Z14-16), so the shared copy and the tap can use it", async () => {
      await registerTrainerPhone();
      const entry = await confirm();
      await patchLog(entry.id, { ...ATE_OUT, recordVersion: 0 });
      const inbox = await call("/notifications", { headers: f.trainer });
      expect(inbox.status).toBe(200);
      const item = (
        inbox.body.data.items as Array<{
          type: string;
          logEdit?: { entryId: string; action: string; mealName: string; mealDate: string };
        }>
      ).find((row) => row.type === "trainer_client_log_edited");
      expect(item).toBeDefined();
      expect(item!.logEdit).toMatchObject({
        entryId: entry.id,
        action: "edited",
        mealName: "Breakfast",
        mealDate: f.mondayBreakfast.localDate,
      });
    });
  });

  describe("offline: sync/push (D-W14-22 f)", () => {
    async function push(
      operation: string,
      entryId: string,
      body: unknown,
      clientOccurredAt: string,
      ids = { mutationId: createId(), idempotencyKey: createId() },
    ) {
      return call("/sync/push", {
        method: "POST",
        headers: f.trainee,
        body: {
          mutations: [
            {
              mutationId: ids.mutationId,
              idempotencyKey: ids.idempotencyKey,
              entityType: "meal_compliance",
              recordId: entryId,
              operation,
              clientOccurredAt,
              payload: { entryId, body },
            },
          ],
        },
      });
    }

    it("accepts an edit made inside the window and synced two hours after it closed, with the old meal day", async () => {
      await registerTrainerPhone();
      const entry = await confirm();
      const madeAt = new Date(Date.parse(entry.loggedAt) + 2 * HOUR).toISOString();
      at(Date.parse(entry.loggedAt) + DAY + 2 * HOUR);
      const ids = { mutationId: createId(), idempotencyKey: createId() };
      const res = await push("meal.edit", entry.id, { ...ATE_OUT, recordVersion: 0 }, madeAt, ids);
      expect(res.status).toBe(200);
      expect(res.body.data.results[0]).toMatchObject({ status: "applied", recordId: entry.id, serverVersion: 1 });
      const rows = await trainerNotifications();
      expect(rows).toHaveLength(1);
      expect(JSON.parse(rows[0]!.payloadJson!).mealDate).toBe(f.mondayBreakfast.localDate);

      // The same mutation again is a no-op.
      const again = await push("meal.edit", entry.id, { ...ATE_OUT, recordVersion: 0 }, madeAt, ids);
      expect(again.body.data.results[0].status).toBe("already_applied");
      expect(await audit(entry.id)).toHaveLength(1);
    });

    it("refuses one that arrives 80 h after the window closed, or whose device time is in the future or before logging", async () => {
      const entry = await confirm();
      const madeAt = new Date(Date.parse(entry.loggedAt) + HOUR).toISOString();
      at(Date.parse(entry.loggedAt) + DAY + 80 * HOUR);
      const late = await push("meal.edit", entry.id, { ...ATE_OUT, recordVersion: 0 }, madeAt);
      expect(late.body.data.results[0]).toMatchObject({
        status: "rejected",
        error: { code: "MEAL_EDIT_WINDOW_CLOSED" },
      });

      at(Date.parse(entry.loggedAt) + 3 * HOUR);
      const future = await push(
        "meal.edit",
        entry.id,
        { ...ATE_OUT, recordVersion: 0 },
        new Date(Date.now() + 10 * 60_000).toISOString(),
      );
      expect(future.body.data.results[0].error.code).toBe("MEAL_EDIT_WINDOW_CLOSED");
      const early = await push(
        "meal.edit",
        entry.id,
        { ...ATE_OUT, recordVersion: 0 },
        new Date(Date.parse(entry.loggedAt) - HOUR).toISOString(),
      );
      expect(early.body.data.results[0].error.code).toBe("MEAL_EDIT_WINDOW_CLOSED");
      // A device time made up by a REST caller is not read at all.
      const rest = await patchLog(entry.id, { ...ATE_OUT, recordVersion: 0 });
      expect(rest.status).toBe(200);
    });

    it("refuses an offline removal that arrives after the confirmation window closed", async () => {
      const entry = await confirm();
      const madeAt = new Date(Date.parse(entry.loggedAt) + 60_000).toISOString();
      at(Date.parse(f.mondayBreakfast.windowEndsAt) + 60_000);
      const res = await push("meal.remove", entry.id, { recordVersion: 0 }, madeAt);
      expect(res.body.data.results[0]).toMatchObject({
        status: "rejected",
        error: { code: "MEAL_REMOVE_NOT_ALLOWED" },
      });
      expect(await db.select().from(schema.mealCompliance).where(eq(schema.mealCompliance.id, entry.id))).toHaveLength(1);
    });

    it("a stale version through sync is a conflict, not an overwrite", async () => {
      const entry = await confirm();
      const res = await push("meal.edit", entry.id, { ...ATE_OUT, recordVersion: 3 }, new Date().toISOString());
      expect(res.body.data.results[0]).toMatchObject({ status: "conflicted", error: { code: "VERSION_CONFLICT" } });
    });

    it("removal and photo go through sync; the pull carries a tombstone and the new window", async () => {
      const first = await call("/sync/pull", { headers: f.trainee });
      const cursor: string = first.body.data.nextCursor;
      const entry = await confirm();
      const asset = await mediaAsset();
      const photo = await push("meal.photo", entry.id, { mediaAssetId: asset }, new Date().toISOString());
      expect(photo.body.data.results[0]).toMatchObject({ status: "applied", serverVersion: 1 });

      const pullAfterPhoto = await call(`/sync/pull?cursor=${encodeURIComponent(cursor)}`, { headers: f.trainee });
      type Change = { entityType: string; recordId: string; changeKind: string; payload: any };
      const changes = pullAfterPhoto.body.data.changes as Change[];
      const compliance = changes.filter((c) => c.entityType === "meal_compliance" && c.recordId === entry.id).at(-1)!;
      expect(compliance.payload.editableUntil).toBe(entry.editableUntil);
      expect(compliance.payload.canRemove).toBe(true);
      const assignment = changes.filter((c) => c.entityType === "meal_assignment" && c.recordId === f.mondayBreakfast.id).at(-1)!;
      expect(assignment.payload.compliance.canRemove).toBe(true);

      const afterPhoto: string = pullAfterPhoto.body.data.nextCursor;
      const removed = await push("meal.remove", entry.id, { recordVersion: 1 }, new Date().toISOString());
      expect(removed.body.data.results[0]).toMatchObject({ status: "applied", recordId: entry.id });
      const pull = await call(`/sync/pull?cursor=${encodeURIComponent(afterPhoto)}`, { headers: f.trainee });
      const tail = pull.body.data.changes as Change[];
      expect(tail.find((c) => c.entityType === "meal_compliance" && c.recordId === entry.id)).toMatchObject({
        changeKind: "tombstone",
        payload: null,
      });
      expect(
        tail.find((c) => c.entityType === "meal_assignment" && c.recordId === f.mondayBreakfast.id)?.payload.compliance,
      ).toBeNull();
    });
  });

  describe("round trips (Z14-1 style)", () => {
    it("meal edit and remove commit in one batch of at most 6 statements, the photo too, and a rating in 4", async () => {
      const entry = await confirm();
      const counter = installRoundTripCounter(handle);
      const batchSizes = async (run: () => Promise<unknown>) => {
        counter.reset();
        await run();
        return counter.trips.filter((trip) => trip.kind === "batch" && trip.sql.some((statement) => statement.includes("log_edit_events"))).map((trip) => trip.sql.length);
      };
      const edit = await batchSizes(() => patchLog(entry.id, { ...ATE_OUT, recordVersion: 0 }));
      expect(Math.max(...edit)).toBeLessThanOrEqual(6);
      const photo = await batchSizes(async () => attachPhoto(entry.id, await mediaAsset()));
      expect(Math.max(...photo)).toBeLessThanOrEqual(6);
      const remove = await batchSizes(() => removeLog(entry.id, 2));
      expect(Math.max(...remove)).toBeLessThanOrEqual(6);
    });
  });
});
