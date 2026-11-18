/**
 * Z12-43 (D-W12-11, D-W12-24): a trainee's own foods. Created inside a
 * logged-foods log (`customFood` on POST /meals/assignments/:id/deviate),
 * saved to "my foods" unless `saveToMyFoods` is false, found again in search
 * and Recent by that trainee only, and shown to the coach as added by the
 * client. Real routes on persisted data: invitation → intake → configuration
 * → published plan → generated meals, with the food library seeded.
 */
import { eq } from "drizzle-orm";
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

/** Mon 2 Nov 2026 06:00 UTC is 11:30 in Kolkata; meals are generated then. */
const MONDAY = "2026-11-02T06:00:00.000Z";
/** Mon 2 Nov 14:30 in Kolkata: breakfast and lunch are both open to log. */
const MONDAY_AFTERNOON = "2026-11-02T09:00:00.000Z";
const TZ = "Asia/Kolkata";
const CHAPATI_ID = "f1000001-0000-4000-8000-000000000001";
const BREAKFAST_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LUNCH_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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

function at(iso: string) {
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
        instructions: "Poha and chai",
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
        instructions: "Roti and dal",
        photoRequired: false,
      },
    ],
  };
}

type AssignmentRow = { id: string; localDate: string; mealName: string };

/** An active client with a published meal plan and today's generated meals. */
async function activeClient(name: string) {
  const suffix = `${name}-${createId().slice(0, 6)}`;
  const trainer = await trainerSession(`coach-${suffix}@example.com`);
  const invite = await call("/invitations", {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `inv-${suffix}` },
    body: { recipientEmail: `client-${suffix}@example.com` },
  });
  const traineeToken = createTestIdToken(`client-${suffix}`, `client-${suffix}@example.com`);
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
        goals: "Lose 4 kg",
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
    body: { fromDate: today, toDate: addDaysToLocalDate(today, 1) },
  });
  expect(generated.status).toBe(200);
  const assignments = generated.body.data.assignments as AssignmentRow[];
  const pick = (mealName: string) =>
    assignments.find((a) => a.localDate === today && a.mealName === mealName)!;
  return {
    trainer,
    trainee,
    relationshipId,
    breakfast: pick("Breakfast"),
    lunch: pick("Lunch"),
  };
}

type Client = Awaited<ReturnType<typeof activeClient>>;

describe("trainee custom foods (Z12-43, D-W12-24)", () => {
  let db: Db;
  let close: () => void;
  let asha: Client;
  let vikram: Client;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(MONDAY);
    const handle = await createMemoryDb({ librarySeed: true });
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
    asha = await activeClient("asha");
    vikram = await activeClient("vikram");
    at(MONDAY_AFTERNOON);
  }, 60_000);

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    close();
  });

  function deviate(client: Client, assignment: AssignmentRow, body: unknown) {
    return call(`/meals/assignments/${assignment.id}/deviate`, {
      method: "POST",
      headers: { ...client.trainee, "Idempotency-Key": `deviate-${createId()}` },
      body,
    });
  }

  async function ownFoods(client: Client) {
    const { traineeUserId } = (
      await db
        .select()
        .from(schema.coachingRelationships)
        .where(eq(schema.coachingRelationships.id, client.relationshipId))
    )[0]!;
    return db
      .select()
      .from(schema.traineeCustomFoods)
      .where(eq(schema.traineeCustomFoods.traineeUserId, traineeUserId));
  }

  it("saves a custom food by default, finds it in search and Recent for that trainee only, and shows it to the coach", async () => {
    const logged = await deviate(asha, asha.lunch, {
      deviationKind: "logged_foods",
      items: [
        {
          customFood: {
            name: "Ragi dosa",
            kcal: 120,
            protein: 3,
            carbs: 22,
            servingLabel: "1 piece",
          },
        },
      ],
    });
    expect(logged.status).toBe(200);
    expect(logged.body.data.loggedTotals).toMatchObject({ energyKcal: 120, proteinG: 3, carbsG: 22 });
    expect(logged.body.data.loggedItems).toEqual([
      expect.objectContaining({ name: "Ragi dosa", energyKcal: 120, custom: true }),
    ]);

    const saved = await ownFoods(asha);
    expect(saved.map((row) => row.name)).toEqual(["Ragi dosa"]);
    expect(saved[0]).toMatchObject({
      relationshipId: asha.relationshipId,
      kcalScaled: 120_000_000,
      servingLabel: "1 piece",
    });

    const search = await call("/me/foods/search?q=ragi&limit=10", { headers: asha.trainee });
    expect(search.status).toBe(200);
    expect(search.body.data.items[0]).toMatchObject({
      id: saved[0]!.id,
      name: "Ragi dosa",
      source: "custom",
      serving: { label: "1 piece", kcalScaled: 120_000_000, proteinScaled: 3_000_000 },
    });

    const recent = await call("/me/foods/recent", { headers: asha.trainee });
    expect(recent.status).toBe(200);
    expect(recent.body.data.items).toEqual([
      expect.objectContaining({ name: "Ragi dosa", source: "custom" }),
    ]);

    // Another trainee never sees it, in search or in Recent.
    const otherSearch = await call("/me/foods/search?q=ragi&limit=10", { headers: vikram.trainee });
    expect(otherSearch.status).toBe(200);
    expect(
      (otherSearch.body.data.items as Array<{ source?: string }>).filter((i) => i.source === "custom"),
    ).toEqual([]);
    const otherRecent = await call("/me/foods/recent", { headers: vikram.trainee });
    expect(otherRecent.body.data.items).toEqual([]);

    // The coach sees it as added by the client; another coach does not.
    const coachView = await call(
      `/libraries/foods/custom-logged?rid=${asha.relationshipId}`,
      { headers: asha.trainer },
    );
    expect(coachView.status).toBe(200);
    expect(coachView.body.data.items).toEqual([
      expect.objectContaining({ name: "Ragi dosa", kcalScaled: 120_000_000, servingLabel: "1 piece" }),
    ]);
    const strangerView = await call(
      `/libraries/foods/custom-logged?rid=${asha.relationshipId}`,
      { headers: vikram.trainer },
    );
    expect(strangerView.status).toBe(404);
  });

  it("saveToMyFoods false keeps the food on that log only, still marked as added by the client", async () => {
    const logged = await deviate(asha, asha.breakfast, {
      deviationKind: "logged_foods",
      items: [{ customFood: { name: "Office samosa", kcal: 260 }, saveToMyFoods: false }],
    });
    expect(logged.status).toBe(200);
    expect(logged.body.data.loggedTotals.energyKcal).toBe(260);
    expect(logged.body.data.loggedItems).toEqual([
      expect.objectContaining({ name: "Office samosa", energyKcal: 260, custom: true }),
    ]);

    expect(await ownFoods(asha)).toEqual([]);
    const search = await call("/me/foods/search?q=samosa&limit=10", { headers: asha.trainee });
    expect(
      (search.body.data.items as Array<{ source?: string }>).filter((i) => i.source === "custom"),
    ).toEqual([]);
    const recent = await call("/me/foods/recent", { headers: asha.trainee });
    expect(recent.body.data.items).toEqual([]);
    const coachView = await call(
      `/libraries/foods/custom-logged?rid=${asha.relationshipId}`,
      { headers: asha.trainer },
    );
    expect(coachView.body.data.items).toEqual([]);
  });

  it("a library food logs with its name and default serving and comes back in Recent with its serving", async () => {
    const search = await call("/me/foods/search?q=chapati&limit=10", { headers: asha.trainee });
    const chapati = (search.body.data.items as Array<Record<string, any>>).find( // eslint-disable-line @typescript-eslint/no-explicit-any
      (item) => item.id === CHAPATI_ID,
    );
    expect(chapati).toMatchObject({
      name: "Chapati / roti",
      source: "library",
      serving: { label: "1 medium chapati (40 g)" },
    });
    // One medium chapati (40 g) of a 202 kcal / 100 g food.
    expect(Math.round(chapati!.serving.kcalScaled / 1_000_000)).toBe(81);

    const logged = await deviate(asha, asha.lunch, {
      deviationKind: "logged_foods",
      items: [{ foodId: CHAPATI_ID, servingId: chapati!.defaultServingId, quantity: 2 }],
    });
    expect(logged.status).toBe(200);
    expect(logged.body.data.loggedItems).toEqual([
      expect.objectContaining({
        name: "Chapati / roti",
        quantity: 2,
        servingLabel: "1 medium chapati (40 g)",
        energyKcal: 162,
        foodId: CHAPATI_ID,
        custom: false,
      }),
    ]);
    expect(logged.body.data.loggedTotals.energyKcal).toBe(162);
    // A library line is never saved as the trainee's own food.
    expect(await ownFoods(asha)).toEqual([]);

    const recent = await call("/me/foods/recent", { headers: asha.trainee });
    expect(recent.body.data.items).toEqual([
      expect.objectContaining({
        id: CHAPATI_ID,
        source: "library",
        serving: expect.objectContaining({ label: "1 medium chapati (40 g)" }),
      }),
    ]);
  });

  it("an ate-out kcal and a changed portion count their lines but never save a food", async () => {
    const ateOut = await deviate(asha, asha.lunch, {
      deviationKind: "restaurant",
      notes: "Office party",
      items: [{ customFood: { name: "Ate out", kcal: 1120 } }],
    });
    expect(ateOut.status).toBe(200);
    expect(ateOut.body.data).toMatchObject({ deviationKind: "restaurant", notes: "Office party" });
    expect(ateOut.body.data.loggedTotals.energyKcal).toBe(1120);
    // Not a client-created food — coach must not see "Add to my food library".
    expect(ateOut.body.data.loggedItems).toEqual([
      expect.objectContaining({ name: "Ate out", energyKcal: 1120 }),
    ]);
    expect(ateOut.body.data.loggedItems[0].custom).toBeFalsy();

    const portion = await deviate(asha, asha.breakfast, {
      deviationKind: "portion_adjustment",
      items: [{ customFood: { name: "Vegetable poha", kcal: 300 } }],
    });
    expect(portion.status).toBe(200);
    expect(portion.body.data.loggedTotals.energyKcal).toBe(300);
    expect(portion.body.data.loggedItems).toEqual([
      expect.objectContaining({ name: "Vegetable poha", energyKcal: 300 }),
    ]);
    expect(portion.body.data.loggedItems[0].custom).toBeFalsy();

    expect(await ownFoods(asha)).toEqual([]);
  });
});
