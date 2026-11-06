/**
 * Z6-20 (PLAN-v2 D-P2-21, D-W6-IP R1–R5, D-W6-32, D-W6-33, D-W6-38): a trainer
 * logs or corrects a client's meal entry. Real routes on persisted data:
 * invitation → intake → configuration → published plan → generated meal
 * assignments, then the trainer's PUT, the trainee's reads and writes, sync
 * pull and push, the adherence summary, the activity feed and the
 * coach-updates notification.
 *
 * The clock is pinned (Date only) so "within the last 7 days" and quiet hours
 * are exact: Monday 2 Nov 2026 06:00 UTC is 11:30 in Asia/Kolkata.
 */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDaysToLocalDate, formatLocalDate } from "@fitbud/core";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb } from "../test-support/memory-db.js";
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
type AssignmentRow = { id: string; localDate: string; mealName: string };

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

describe("trainer logs and edits a client's meal entry (Z6-20)", () => {
  let db: Db;
  let close: () => void;
  let f: Fixture;

  async function putMeal(
    assignment: AssignmentRow,
    body: unknown,
    key = `coach-meal-${createId()}`,
    headers: Record<string, string> = f.trainer,
    date = assignment.localDate,
  ) {
    return call(`/meals/compliance/${assignment.id}/${date}`, {
      method: "PUT",
      headers: { ...headers, "Idempotency-Key": key },
      body,
    });
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
        token: "ExponentPushToken[coach-meal-phone]",
        platform: "android",
        provider: "expo",
        installationId: "coach-meal-install",
      },
    });
    expect(res.status).toBeLessThan(300);
  }

  async function summary(fromDate: string, toDate: string) {
    const res = await call(
      `/meals/relationships/${f.relationshipId}/compliance?fromDate=${fromDate}&toDate=${toDate}`,
      { headers: f.trainer },
    );
    expect(res.status).toBe(200);
    return res.body.data as {
      items: Array<{ assignmentId: string; outcome: string | null; status: string }>;
      totals: Record<string, number>;
    };
  }

  type Change = { entityType: string; recordId: string; payload: Record<string, unknown> };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(MONDAY);
    const handle = await createMemoryDb();
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
    f = await coachingWithMealPlan(createId().slice(0, 8));
    // Thursday 5 Nov, 11:30 in Kolkata: Monday's meals are three days back.
    at(Date.parse(MONDAY) + 3 * DAY);
  }, 60_000);

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    close();
  });

  it("creates one coach meal entry, audited, readable by the trainee and pulled by sync", async () => {
    // The trainee has synced before (bootstrap), so the coach entry arrives as a change.
    const firstPull = await call("/sync/pull", { headers: f.trainee });
    expect(firstPull.status).toBe(200);
    const cursor: string = firstPull.body.data.nextCursor;

    const res = await putMeal(f.mondayBreakfast, {
      outcome: "modified",
      deviationKind: "substitute",
      notes: "Had poha instead",
    });
    expect(res.status).toBe(201);
    const entry = res.body.data;
    expect(entry).toMatchObject({
      assignmentId: f.mondayBreakfast.id,
      outcome: "modified",
      deviationKind: "substitute",
      notes: "Had poha instead",
      recordVersion: 0,
      loggedByRole: "coach",
      lastEditedByRole: null,
    });

    const { trainerUserId, traineeUserId } = await people();
    const [row] = await db
      .select()
      .from(schema.mealCompliance)
      .where(eq(schema.mealCompliance.id, entry.id));
    expect(row).toMatchObject({
      loggedByRole: "coach",
      loggedByUserId: trainerUserId,
      traineeUserId,
      lastEditedByRole: null,
      lastEditedByUserId: null,
      localDate: f.mondayBreakfast.localDate,
      loggedLate: true,
    });

    const audit = await auditRows(entry.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "create",
      actorRole: "coach",
      actorUserId: trainerUserId,
      entityType: "meal_compliance",
      beforeJson: null,
    });
    expect(JSON.parse(audit[0]!.afterJson)).toEqual({
      localDate: f.mondayBreakfast.localDate,
      mealName: "Breakfast",
      outcome: "modified",
      deviationKind: "substitute",
      notes: "Had poha instead",
    });

    // The trainee reads the same state, with the label source.
    const read = await call(`/meals/assignments/${f.mondayBreakfast.id}`, { headers: f.trainee });
    expect(read.status).toBe(200);
    expect(read.body.data.compliance).toMatchObject({
      id: entry.id,
      loggedByRole: "coach",
      lastEditedByRole: null,
    });

    const pull = await call(`/sync/pull?cursor=${encodeURIComponent(cursor)}`, { headers: f.trainee });
    expect(pull.status).toBe(200);
    const changes = pull.body.data.changes as Change[];
    const complianceChange = changes.find(
      (c) => c.entityType === "meal_compliance" && c.recordId === entry.id,
    );
    expect(complianceChange?.payload).toMatchObject({
      id: entry.id,
      loggedByRole: "coach",
      lastEditedByRole: null,
    });

    // After a coach edit, the next pull shows it as edited by the coach (also inside the assignment payload).
    const afterCreate: string = pull.body.data.nextCursor;
    const edit = await putMeal(f.mondayBreakfast, {
      outcome: "skipped",
      recordVersion: 0,
    });
    expect(edit.status).toBe(200);
    const pullAfterEdit = await call(`/sync/pull?cursor=${encodeURIComponent(afterCreate)}`, {
      headers: f.trainee,
    });
    const edited = (pullAfterEdit.body.data.changes as Change[]).find(
      (c) => c.entityType === "meal_compliance" && c.recordId === entry.id,
    );
    expect(edited?.payload).toMatchObject({
      recordVersion: 1,
      outcome: "skipped",
      loggedByRole: "coach",
      lastEditedByRole: "coach",
    });
  });

  it("a retried PUT returns the stored response and adherence counts the meal once", async () => {
    // Thursday breakfast is inside its window: logged on time, so it counts as confirmed.
    const thursday = f.pick(3, "Breakfast");
    const key = "coach-meal-retry";
    const first = await putMeal(thursday, { outcome: "confirmed", notes: "Done" }, key);
    expect(first.status).toBe(201);
    const retried = await putMeal(thursday, { outcome: "confirmed", notes: "Done" }, key);
    expect(retried.status).toBe(201);
    expect(retried.body.data).toEqual(first.body.data);

    // A different body under the same key is refused, never applied.
    const reused = await putMeal(thursday, { outcome: "skipped" }, key);
    expect(reused.status).toBe(409);
    expect(reused.body.error?.code).toBe("IDEMPOTENCY_KEY_REUSE");

    // Same content under a new key now meets an existing entry: it must name its version.
    const noVersion = await putMeal(thursday, { outcome: "confirmed", notes: "Done" });
    expect(noVersion.status).toBe(409);
    expect(noVersion.body.error?.code).toBe("VERSION_CONFLICT");

    const rows = await db
      .select()
      .from(schema.mealCompliance)
      .where(eq(schema.mealCompliance.assignmentId, thursday.id));
    expect(rows).toHaveLength(1);
    expect(await auditRows(first.body.data.id)).toHaveLength(1);

    // R3: one entry per meal, counted once, whoever wrote it.
    const adherence = await summary(thursday.localDate, thursday.localDate);
    expect(adherence.items.filter((i) => i.outcome === "confirmed")).toHaveLength(1);
    expect(adherence.totals).toMatchObject({ confirmed: 1, modified: 0, skipped: 0 });
  });

  it("a confirmed coach entry carries the prescription's own state and a late flag, never closing an exception", async () => {
    const res = await putMeal(f.mondayLunch, { outcome: "confirmed" });
    expect(res.status).toBe(201);
    const [row] = await db
      .select()
      .from(schema.mealCompliance)
      .where(eq(schema.mealCompliance.id, res.body.data.id));
    // Monday lunch's window closed on Tuesday; it is logged late, and nothing auto-resolves.
    expect(row).toMatchObject({ outcome: "confirmed", deviationKind: null, loggedLate: true, loggedAfterResolve: false });
    const exceptions = await db
      .select()
      .from(schema.exceptions)
      .where(eq(schema.exceptions.coachingRelationshipId, f.relationshipId));
    expect(exceptions.filter((e) => e.status === "resolved")).toHaveLength(0);
  });

  it("an edit replaces outcome, deviation and note, writes one audit row with before and after, and sets last_edited_*", async () => {
    const thursday = f.pick(3, "Breakfast");
    const created = await putMeal(thursday, { outcome: "confirmed" });
    const id: string = created.body.data.id;
    at(Date.now() + 60_000);

    const edit = await putMeal(thursday, {
      outcome: "modified",
      deviationKind: "restaurant",
      notes: "Ate out",
      recordVersion: 0,
    });
    expect(edit.status).toBe(200);
    expect(edit.body.data).toMatchObject({
      id,
      outcome: "modified",
      deviationKind: "restaurant",
      notes: "Ate out",
      recordVersion: 1,
      loggedByRole: "coach",
      lastEditedByRole: "coach",
    });
    const { trainerUserId } = await people();
    const [row] = await db.select().from(schema.mealCompliance).where(eq(schema.mealCompliance.id, id));
    expect(row).toMatchObject({
      lastEditedByRole: "coach",
      lastEditedByUserId: trainerUserId,
      loggedByRole: "coach",
      loggedByUserId: trainerUserId,
    });
    expect(row!.lastEditedAt).not.toBeNull();
    // The confirmed totals of the prescription do not carry over to a changed meal.
    expect(row).toMatchObject({ kcalScaled: null, itemsJson: null });

    const audit = await auditRows(id);
    expect(audit.map((a) => a.action)).toEqual(["create", "edit"]);
    expect(JSON.parse(audit[1]!.beforeJson!)).toMatchObject({ outcome: "confirmed", deviationKind: null, notes: null });
    expect(JSON.parse(audit[1]!.afterJson)).toMatchObject({
      outcome: "modified",
      deviationKind: "restaurant",
      notes: "Ate out",
    });

    // A stale version is refused and writes nothing.
    const stale = await putMeal(thursday, { outcome: "skipped", recordVersion: 0 });
    expect(stale.status).toBe(409);
    expect(stale.body.error?.code).toBe("VERSION_CONFLICT");
    expect(await auditRows(id)).toHaveLength(2);

    // An edit that changes nothing writes no audit row and no new version.
    const noop = await putMeal(thursday, {
      outcome: "modified",
      deviationKind: "restaurant",
      notes: "Ate out",
      recordVersion: 1,
    });
    expect(noop.status).toBe(200);
    expect(noop.body.data.recordVersion).toBe(1);
    expect(await auditRows(id)).toHaveLength(2);
    const adherence = await summary(thursday.localDate, thursday.localDate);
    expect(adherence.totals).toMatchObject({ confirmed: 0, modified: 1, skipped: 0 });
  });

  it("concurrent edits on one version: one wins, the other gets 409 and writes nothing", async () => {
    const created = await putMeal(f.mondayBreakfast, { outcome: "confirmed" });
    const id: string = created.body.data.id;
    const [a, b] = await Promise.all([
      putMeal(f.mondayBreakfast, { outcome: "skipped", recordVersion: 0 }),
      putMeal(f.mondayBreakfast, { outcome: "modified", deviationKind: "other", recordVersion: 0 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await auditRows(id)).toHaveLength(2);
    const [row] = await db.select().from(schema.mealCompliance).where(eq(schema.mealCompliance.id, id));
    expect(row!.recordVersion).toBe(1);
  });

  it("an edit of a trainee-logged meal keeps it the trainee's and keeps the client's food list when asked", async () => {
    const deviated = await call(`/meals/assignments/${f.mondayLunch.id}/deviate`, {
      method: "POST",
      headers: { ...f.trainee, "Idempotency-Key": "trainee-deviate" },
      body: {
        deviationKind: "logged_foods",
        items: [{ customFood: { name: "Paneer wrap", kcal: 520, protein: 24 } }],
        notes: "Office lunch",
      },
    });
    expect(deviated.status).toBe(200);
    expect(deviated.body.data).toMatchObject({ loggedByRole: "trainee", lastEditedByRole: null });
    const kcal = deviated.body.data.loggedTotals.energyKcal;
    expect(kcal).toBe(520);

    // A trainer cannot author a food list.
    const authored = await putMeal(f.mondayBreakfast, {
      outcome: "modified",
      deviationKind: "logged_foods",
    });
    expect(authored.status).toBe(400);

    at(Date.now() + 60_000);
    const edit = await putMeal(f.mondayLunch, {
      outcome: "modified",
      deviationKind: "logged_foods",
      notes: "Office lunch (checked with client)",
      recordVersion: 0,
    });
    expect(edit.status).toBe(200);
    expect(edit.body.data).toMatchObject({
      id: deviated.body.data.id,
      loggedByRole: "trainee",
      lastEditedByRole: "coach",
      recordVersion: 1,
      notes: "Office lunch (checked with client)",
    });
    expect(edit.body.data.loggedTotals.energyKcal).toBe(520);
    expect(edit.body.data.loggedItems).toHaveLength(1);
    const audit = await auditRows(deviated.body.data.id);
    expect(audit.map((a) => a.action)).toEqual(["edit"]);
    expect(JSON.parse(audit[0]!.beforeJson!)).toMatchObject({ notes: "Office lunch" });

    // The trainee still cannot change it (already recorded), and it is not R1-locked.
    const again = await call(`/meals/assignments/${f.mondayLunch.id}/skip`, {
      method: "POST",
      headers: { ...f.trainee, "Idempotency-Key": "trainee-skip-again" },
      body: {},
    });
    expect(again.status).toBe(409);
    expect(again.body.error?.code).not.toBe("COACH_LOGGED_READ_ONLY");

    // Replacing a changed meal with a confirmed one drops the client's food list.
    const replaced = await putMeal(f.mondayLunch, { outcome: "skipped", recordVersion: 1 });
    expect(replaced.status).toBe(200);
    expect(replaced.body.data.loggedItems).toBeUndefined();
    expect(replaced.body.data.loggedTotals).toBeUndefined();
  });

  it("R2: dates outside the last 7 days or in the future return 422 BACKDATE_LIMIT, and the date must match the meal", async () => {
    // Fri 6 Nov is tomorrow in Kolkata.
    const future = await putMeal(f.fridayBreakfast, { outcome: "confirmed" });
    expect(future.status).toBe(422);
    expect(future.body.error?.code).toBe("BACKDATE_LIMIT");

    // The 7th day back is still open: Thu 29 Oct would be, Mon 2 Nov is from Thursday 5 Nov.
    const open = await putMeal(f.mondayBreakfast, { outcome: "confirmed" });
    expect(open.status).toBe(201);

    // A mismatching or malformed date is not the meal.
    const wrong = await putMeal(f.mondayLunch, { outcome: "confirmed" }, undefined, f.trainer, f.tuesdayBreakfast.localDate);
    expect(wrong.status).toBe(404);
    const malformed = await putMeal(f.mondayLunch, { outcome: "confirmed" }, undefined, f.trainer, "02-11-2026");
    expect(malformed.status).toBe(400);

    // Wed 11 Nov: Monday is nine days back. Creating a new entry and editing an old one both fail.
    at(Date.parse(MONDAY) + 9 * DAY);
    const tooOld = await putMeal(f.mondayLunch, { outcome: "confirmed" });
    expect(tooOld.status).toBe(422);
    expect(tooOld.body.error?.code).toBe("BACKDATE_LIMIT");
    const editTooOld = await putMeal(f.mondayBreakfast, {
      outcome: "skipped",
      recordVersion: 0,
    });
    expect(editTooOld.status).toBe(422);
    expect(editTooOld.body.error?.code).toBe("BACKDATE_LIMIT");
    const [row] = await db
      .select()
      .from(schema.mealCompliance)
      .where(eq(schema.mealCompliance.id, open.body.data.id));
    expect(row).toMatchObject({ outcome: "confirmed", recordVersion: 0 });
    expect(await auditRows(open.body.data.id)).toHaveLength(1);
  });

  it("requires a valid body: a changed meal names its kind, other outcomes carry none", async () => {
    const missing = await putMeal(f.mondayBreakfast, { outcome: "modified" });
    expect(missing.status).toBe(400);
    const stray = await putMeal(f.mondayBreakfast, { outcome: "skipped", deviationKind: "other" });
    expect(stray.status).toBe(400);
    const noKey = await call(`/meals/compliance/${f.mondayBreakfast.id}/${f.mondayBreakfast.localDate}`, {
      method: "PUT",
      headers: f.trainer,
      body: { outcome: "confirmed" },
    });
    expect(noKey.status).toBe(400);
    expect(noKey.body.error?.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(await db.select().from(schema.mealCompliance)).toHaveLength(0);
    expect(await db.select().from(schema.logEditEvents)).toHaveLength(0);
  });

  it("the activity feed lists the create and the edit with the actor and a short summary", async () => {
    const created = await putMeal(f.mondayBreakfast, { outcome: "confirmed" });
    at(Date.now() + 60_000);
    await putMeal(f.mondayBreakfast, { outcome: "skipped", recordVersion: created.body.data.recordVersion });

    const feed = await call("/activity/feed?limit=50", { headers: f.trainer });
    expect(feed.status).toBe(200);
    const coachEvents = (
      feed.body.data.events as Array<{ type: string; subtype: string; summary: string; relationshipId: string }>
    ).filter((e) => e.type === "coach_logged" || e.type === "coach_edited");
    expect(coachEvents.map((e) => e.type)).toEqual(["coach_edited", "coach_logged"]);
    expect(coachEvents.every((e) => e.relationshipId === f.relationshipId && e.subtype === "Meal")).toBe(true);
    expect(coachEvents[1]!.summary).toMatch(/ logged Breakfast for Mon 2 Nov: Confirmed$/);
    expect(coachEvents[0]!.summary).toMatch(/ edited Breakfast for Mon 2 Nov: Confirmed → Skipped$/);
    for (const event of coachEvents) {
      expect(event.summary).not.toMatch(/_|[0-9a-f]{8}-[0-9a-f]{4}/);
    }
  });

  it("notifies the trainee once per entry within 10 minutes, routing only, with the meal in the key", async () => {
    await registerTraineePhone();
    const created = await putMeal(f.mondayBreakfast, { outcome: "confirmed" });
    const id: string = created.body.data.id;

    let rows = await coachNotifications();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      domainEntityType: "meal_assignment",
      domainEntityId: f.mondayBreakfast.id,
      mergeGroup: id,
      payloadJson: null,
    });
    expect(rows[0]!.dedupeKey).toMatch(/^coach_log_updated:create:meal_compliance:/);
    const first = await deliveries(rows[0]!.id);
    expect(first).toHaveLength(1);
    expect(first[0]!.providerStatus).toBe("accepted");

    // Two more edits within 10 minutes of the first notification merge into it.
    at(Date.now() + 2 * 60_000);
    await putMeal(f.mondayBreakfast, { outcome: "skipped", recordVersion: 0 });
    at(Date.now() + 5 * 60_000);
    await putMeal(f.mondayBreakfast, { outcome: "confirmed", recordVersion: 1 });
    rows = await coachNotifications();
    expect(rows).toHaveLength(1);
    expect(await deliveries(rows[0]!.id)).toHaveLength(1);
    expect(await auditRows(id)).toHaveLength(3);

    // After the window the next edit is a new notification and push.
    at(Date.now() + 11 * 60_000);
    await putMeal(f.mondayBreakfast, { outcome: "skipped", recordVersion: 2 });
    rows = await coachNotifications();
    expect(rows).toHaveLength(2);
    expect(rows[1]!.dedupeKey).toMatch(/^coach_log_updated:edit:meal_compliance:/);
    expect(await deliveries(rows[1]!.id)).toHaveLength(1);

    // A different entry is its own notification.
    await putMeal(f.mondayLunch, { outcome: "skipped" });
    expect(await coachNotifications()).toHaveLength(3);

    const inbox = await call("/notifications", { headers: f.trainee });
    const listed = (inbox.body.data.items as Array<{ type: string; routing: Record<string, unknown> }>).filter(
      (n) => n.type === "coach_log_updated",
    );
    expect(listed).toHaveLength(3);
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

    const created = await putMeal(f.mondayBreakfast, { outcome: "confirmed" });
    await putMeal(f.mondayBreakfast, { outcome: "skipped", recordVersion: 0 });
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
    await putMeal(f.mondayBreakfast, { outcome: "confirmed" });
    let rows = await coachNotifications();
    expect(rows).toHaveLength(1);
    expect(await deliveries(rows[0]!.id)).toHaveLength(0);

    await call("/notifications/preferences", {
      method: "PUT",
      headers: f.trainee,
      body: { pushEnabled: true, quietHoursStart: "22:00", quietHoursEnd: "07:00" },
    });
    // 23:30 in Kolkata, past the merge window.
    at(Date.parse(MONDAY) + 3 * DAY + 12 * HOUR);
    const edit = await putMeal(f.mondayBreakfast, { outcome: "skipped", recordVersion: 0 });
    expect(edit.status).toBe(200);
    rows = await coachNotifications();
    expect(rows).toHaveLength(2);
    expect(await deliveries(rows[1]!.id)).toHaveLength(0);
  });

  it("R1: trainee writes on a coach-created meal return 409 COACH_LOGGED_READ_ONLY, on every path", async () => {
    await putMeal(f.mondayBreakfast, { outcome: "confirmed" });
    const id = f.mondayBreakfast.id;
    const responses = await Promise.all([
      call(`/meals/assignments/${id}/confirm`, {
        method: "POST",
        headers: { ...f.trainee, "Idempotency-Key": "r1-confirm" },
        body: {},
      }),
      call(`/meals/assignments/${id}/deviate`, {
        method: "POST",
        headers: { ...f.trainee, "Idempotency-Key": "r1-deviate" },
        body: { deviationKind: "other", notes: "x" },
      }),
      call(`/meals/assignments/${id}/skip`, {
        method: "POST",
        headers: { ...f.trainee, "Idempotency-Key": "r1-skip" },
        body: {},
      }),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({
        code: "COACH_LOGGED_READ_ONLY",
        message: "This meal was logged by your coach and cannot be changed.",
      });
    }

    // A queued offline replay through sync push is refused the same way.
    const mutations = ["confirm", "skip", "deviate"].map((kind, index) => {
      const mutationId = `00000000-0000-4000-8000-00000000b10${index}`;
      return {
        mutationId,
        idempotencyKey: mutationId,
        entityType: "meal_compliance",
        recordId: "00000000-0000-4000-8000-00000000b1ff",
        operation: `meal.${kind}`,
        expectedServerVersion: null,
        clientOccurredAt: new Date().toISOString(),
        payload: {
          assignmentId: id,
          body: kind === "deviate" ? { deviationKind: "other", notes: "x" } : {},
        },
      };
    });
    const push = await call("/sync/push", { method: "POST", headers: f.trainee, body: { mutations } });
    expect(push.status).toBe(200);
    for (const result of push.body.data.results as Array<{ status: string; error: { code: string } }>) {
      expect(result.status).toBe("conflicted");
      expect(result.error.code).toBe("COACH_LOGGED_READ_ONLY");
    }

    // The trainee cannot use the trainer route either.
    const traineePut = await putMeal(f.mondayBreakfast, { outcome: "skipped", recordVersion: 0 }, undefined, f.trainee);
    expect(traineePut.status).toBe(403);
    const [row] = await db
      .select()
      .from(schema.mealCompliance)
      .where(eq(schema.mealCompliance.assignmentId, id));
    expect(row).toMatchObject({ outcome: "confirmed", recordVersion: 0, loggedByRole: "coach" });
  });

  it("another trainer gets 403 and an ended client 409, for create and edit", async () => {
    const created = await putMeal(f.mondayBreakfast, { outcome: "confirmed" });
    const other = await trainerSession("coach-meal-other-trainer@example.com");

    const otherCreate = await putMeal(f.mondayLunch, { outcome: "confirmed" }, undefined, other);
    expect(otherCreate.status).toBe(403);
    expect(otherCreate.body.error?.code).toBe("FORBIDDEN");
    const otherEdit = await putMeal(f.mondayBreakfast, { outcome: "skipped", recordVersion: 0 }, undefined, other);
    expect(otherEdit.status).toBe(403);

    const ended = await call(`/relationships/${f.relationshipId}/end`, {
      method: "POST",
      headers: f.trainer,
      body: {},
    });
    expect(ended.status).toBe(200);
    const endedEdit = await putMeal(f.mondayBreakfast, { outcome: "skipped", recordVersion: 0 });
    expect(endedEdit.status).toBe(409);
    expect(endedEdit.body.error?.code).toBe("RELATIONSHIP_ENDED");
    const endedCreate = await putMeal(f.mondayLunch, { outcome: "confirmed" });
    expect(endedCreate.status).toBe(409);
    expect(endedCreate.body.error?.code).toBe("RELATIONSHIP_ENDED");
    expect(await auditRows(created.body.data.id)).toHaveLength(1);
    const lunch = await db
      .select()
      .from(schema.mealCompliance)
      .where(eq(schema.mealCompliance.assignmentId, f.mondayLunch.id));
    expect(lunch).toHaveLength(0);
  });

  it("D-W6-20: a meal dated before the reactivation day is frozen, 422 ENDED_PERIOD", async () => {
    const reactivatedAt = new Date(Date.parse(MONDAY) + 2 * DAY + 2 * HOUR).toISOString();
    await db
      .update(schema.coachingRelationships)
      .set({ reactivatedAt })
      .where(eq(schema.coachingRelationships.id, f.relationshipId));
    const frozen = await putMeal(f.mondayBreakfast, { outcome: "confirmed" });
    expect(frozen.status).toBe(422);
    expect(frozen.body.error?.code).toBe("ENDED_PERIOD");
    // Wed 4 Nov (the reactivation day) is open.
    const open = await putMeal(f.pick(2, "Breakfast"), { outcome: "confirmed" });
    expect(open.status).toBe(201);
  });
});
