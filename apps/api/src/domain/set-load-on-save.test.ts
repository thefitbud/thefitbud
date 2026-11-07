import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index.js";
import {
  setTestDbOverride,
  type Db,
} from "../db/client.js";
import * as schema from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import { addDaysToLocalDate, formatLocalDate, weekdayFromLocalDate } from "@fitbud/core";
import type { Env } from "../types.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";



import { createMemoryDb as createSharedMemoryDb } from "../test-support/memory-db.js";

async function createMemoryDb(): Promise<{ db: Db; close: () => void }> {
  const handle = await createSharedMemoryDb();
  return { db: handle.db, close: handle.close };
}

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

function windowOpen(item: { windowStartsAt: string }): boolean {
  return Date.parse(item.windowStartsAt) <= Date.now();
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

async function createTrainerSession(email: string) {
  const token = createTestIdToken(`trainer-${email}`, email);
  const sessionResponse = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token, timezone: "Asia/Kolkata" }),
    },
    testEnv(),
  );
  expect(sessionResponse.status).toBe(200);
  const setCookie = sessionResponse.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return { cookie: setCookie!.split(";")[0]! };
}

function sampleContent(weekday = 1) {
  return {
    workoutDays: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        order: 1,
        name: "Day A",
        weekday,
        exercises: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            order: 1,
            name: "Squat",
            instructions: "Depth to parallel",
            setTargets: [
              {
                id: "33333333-3333-4333-8333-333333333333",
                order: 1,
                reps: 5,
                loadLabel: "60kg",
                rpe: 7,
              },
              {
                id: "33333333-3333-4333-8333-333333333334",
                order: 2,
                reps: 5,
                loadLabel: "RPE 7",
                rpe: 7,
              },
            ],
          },
        ],
      },
    ],
    mealPrescriptions: [],
  };
}

async function reachEffectivePlan(
  suffix: string,
  requireSessionRpe = false,
  sessionToday = false,
) {
  const trainer = await createTrainerSession(`wo-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-wo-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `wo-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `wo-trainee-${suffix}`,
    `wo-trainee-${suffix}@example.com`,
  );
  const accept = await app.request(
    "/invitations/accept",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: createdBody.data.token,
        timezone: "Asia/Kolkata",
      }),
    },
    testEnv(),
  );
  const acceptBody = (await accept.json()) as {
    data: { relationship: { id: string } };
  };
  const relationshipId = acceptBody.data.relationship.id;

  await app.request(
    `/onboarding/relationships/${relationshipId}/draft`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "x-fitbud-role": "trainee",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expectedVersion: 0,
        answers: {
          goals: "Strength",
          relevant_history: "None",
          preferences: "Gym",
          schedule: "Evenings",
          limitations: "Knee",
        },
      }),
    },
    testEnv(),
  );
  await app.request(
    `/onboarding/relationships/${relationshipId}/submit`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "x-fitbud-role": "trainee",
        "Content-Type": "application/json",
        "Idempotency-Key": `submit-wo-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 1 }),
    },
    testEnv(),
  );
  await app.request(
    `/onboarding/relationships/${relationshipId}/review`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `review-wo-${suffix}`,
      },
      body: JSON.stringify({ outcome: "coaching_ready" }),
    },
    testEnv(),
  );

  await app.request(
    `/configurations/relationships/${relationshipId}/draft`,
    {
      method: "PUT",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expectedVersion: 0,
        goalShort: "Strength",
        workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
        nutrition: {
          mealsPerDay: 3,
          confirmationWindowHours: 6,
          photoRequirement: "none",
        },
        checkin: { cadence: "weekly", dueWindowHours: 48 },
        tracking: {
          requireBodyWeight: false,
          requireProgressPhotos: false,
          requireSessionRpe,
        },
      }),
    },
    testEnv(),
  );
  await app.request(
    `/configurations/relationships/${relationshipId}/configure`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `cfg-wo-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 1 }),
    },
    testEnv(),
  );
  await app.request(
    `/configurations/relationships/${relationshipId}/activate`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `act-wo-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 1 }),
    },
    testEnv(),
  );

  const plan = await app.request(
    `/plans/relationships/${relationshipId}`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `plan-wo-${suffix}`,
      },
      body: JSON.stringify({
        title: "Foundation",
        content: sampleContent(
          sessionToday
            ? weekdayFromLocalDate(formatLocalDate(new Date(), "Asia/Kolkata"))
            : 1,
        ),
      }),
    },
    testEnv(),
  );
  const planBody = (await plan.json()) as {
    data: {
      plan: { id: string };
      version: { id: string; recordVersion: number };
    };
  };
  await app.request(
    `/plans/${planBody.data.plan.id}/versions/${planBody.data.version.id}/publish`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `pub-wo-${suffix}`,
      },
      body: JSON.stringify({
        expectedRecordVersion: planBody.data.version.recordVersion,
        mode: "immediate",
      }),
    },
    testEnv(),
  );

  const today = formatLocalDate(new Date(), "Asia/Kolkata");
  const toDate = addDaysToLocalDate(today, 13);
  const generated = await app.request(
    `/workouts/relationships/${relationshipId}/assignments/generate`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `gen-wo-${suffix}`,
      },
      body: JSON.stringify({ fromDate: today, toDate }),
    },
    testEnv(),
  );
  expect(generated.status).toBe(200);

  return {
    trainerCookie: trainer.cookie,
    traineeToken,
    relationshipId,
    planId: planBody.data.plan.id,
    versionId: planBody.data.version.id,
    today,
    toDate,
  };
}

function traineeHeaders(token: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${token}`,
    "x-fitbud-role": "trainee",
    "Content-Type": "application/json",
    ...extra,
  };
}

import { parseLoadLabel } from "./load-parser.js";

describe("set load columns on save (Z6-15)", () => {
  let db: Db;
  let closeDb: () => void;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    db = memory.db;
    closeDb = memory.close;
    setTestDbOverride(db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb();
  });

  async function startWorkout(suffix: string) {
    const ctx = await reachEffectivePlan(suffix, false, true);
    const listed = await app.request(
      `/workouts/relationships/${ctx.relationshipId}/assignments?fromDate=${ctx.today}&toDate=${ctx.toDate}`,
      { headers: traineeHeaders(ctx.traineeToken) },
      testEnv(),
    );
    const items = (
      (await listed.json()) as {
        data: { items: Array<{ id: string; status: string; windowStartsAt: string }> };
      }
    ).data.items;
    const assignment = items.find((i) => i.status === "assigned" && windowOpen(i));
    expect(assignment).toBeTruthy();
    const started = await app.request(
      `/workouts/assignments/${assignment!.id}/start`,
      {
        method: "POST",
        headers: traineeHeaders(ctx.traineeToken, { "Idempotency-Key": `start-${suffix}` }),
      },
      testEnv(),
    );
    expect(started.status).toBe(200);
    const body = (await started.json()) as {
      data: { id: string; exercises: Array<{ sets: Array<{ id: string }> }> };
    };
    return {
      ...ctx,
      executionId: body.data.id,
      setIds: body.data.exercises[0]!.sets.map((s) => s.id),
    };
  }

  async function setRow(id: string) {
    const [row] = await db
      .select()
      .from(schema.setExecutions)
      .where(eq(schema.setExecutions.id, id));
    return row!;
  }

  function completeSet(
    w: { traineeToken: string; executionId: string },
    setId: string,
    body: unknown,
  ) {
    return app.request(
      `/workouts/executions/${w.executionId}/sets/${setId}/complete`,
      {
        method: "POST",
        headers: traineeHeaders(w.traineeToken),
        body: JSON.stringify(body),
      },
      testEnv(),
    );
  }

  it("start copies the prescribed kg and kind from the plan's set targets", async () => {
    const w = await startWorkout("start");
    const kg = await setRow(w.setIds[0]!);
    expect(kg.prescribedLoadLabel).toBe("60kg");
    expect(kg.prescribedLoadKg).toBe(60);
    expect(kg.actualLoadKg).toBeNull();
    expect(kg.loadKind).toBe("kg");
    const text = await setRow(w.setIds[1]!);
    expect(text.prescribedLoadKg).toBeNull();
    expect(text.loadKind).toBe("text");
  });

  it("direct log without re-entry keeps the prescribed load as the actual load", async () => {
    const w = await startWorkout("direct");
    expect((await completeSet(w, w.setIds[0]!, {})).status).toBe(200);
    const row = await setRow(w.setIds[0]!);
    expect(row.status).toBe("completed");
    expect(row.prescribedLoadKg).toBe(60);
    expect(row.actualLoadKg).toBe(60);
    expect(row.loadKind).toBe("kg");
  });

  it("an edited label is parsed: kind follows the actual label", async () => {
    const w = await startWorkout("edit");
    expect((await completeSet(w, w.setIds[0]!, { actualLoadLabel: "62,5 kg" })).status).toBe(200);
    const kg = await setRow(w.setIds[0]!);
    expect(kg.status).toBe("modified");
    expect(kg.prescribedLoadKg).toBe(60);
    expect(kg.actualLoadKg).toBe(62.5);
    expect(kg.loadKind).toBe("kg");

    expect((await completeSet(w, w.setIds[1]!, { actualLoadLabel: "BW+10" })).status).toBe(200);
    const plus = await setRow(w.setIds[1]!);
    expect(plus.actualLoadKg).toBe(10);
    expect(plus.loadKind).toBe("bodyweight_plus");
  });

  it("a numeric actualLoadKg wins over the label, formats it and sets kind kg", async () => {
    const w = await startWorkout("numeric");
    const res = await completeSet(w, w.setIds[0]!, { actualLoadKg: 42.5, actualLoadLabel: "BW" });
    expect(res.status).toBe(200);
    const row = await setRow(w.setIds[0]!);
    expect(row.actualLoadKg).toBe(42.5);
    expect(row.actualLoadLabel).toBe("42.5 kg");
    expect(row.loadKind).toBe("kg");
    expect(row.prescribedLoadKg).toBe(60);
    expect(row.status).toBe("modified");

    // Over a text prescription the numeric load still makes the kind kg.
    expect((await completeSet(w, w.setIds[1]!, { actualLoadKg: 0 })).status).toBe(200);
    const zero = await setRow(w.setIds[1]!);
    expect(zero.actualLoadKg).toBe(0);
    expect(zero.loadKind).toBe("kg");
  });

  it.each([
    ["0.1+0.2", "a", 0.1 + 0.2, 0.3, "0.3 kg"],
    ["20+2*1.1", "b", 20 + 2 * 1.1, 22.2, "22.2 kg"],
    ["40.000000001", "c", 40.000000001, 40, "40 kg"],
  ])("rounds a float-artefact load to hundredths (%s)", async (_n, tag, input, kg, label) => {
    const w = await startWorkout(`round-${tag}`);
    expect((await completeSet(w, w.setIds[0]!, { actualLoadKg: input })).status).toBe(200);
    const row = await setRow(w.setIds[0]!);
    expect(row.actualLoadKg).toBe(kg);
    expect(row.actualLoadLabel).toBe(label);
    expect(row.loadKind).toBe("kg");
    expect(parseLoadLabel(row.actualLoadLabel)).toEqual({ kind: "kg", kg: row.actualLoadKg });
  });

  it("a numeric load equal to the prescribed kg is not a modification", async () => {
    const w = await startWorkout("numeq");
    expect((await completeSet(w, w.setIds[0]!, { actualLoadKg: 60 })).status).toBe(200);
    const row = await setRow(w.setIds[0]!);
    expect(row.status).toBe("completed");
    expect(row.actualLoadKg).toBe(60);
  });

  it.each([
    ["above 500", "over", 501],
    ["three decimals", "dec", 40.125],
    ["negative", "neg", -1],
  ])("rejects an invalid numeric load (%s) with a static 400", async (_name, tag, value) => {
    const w = await startWorkout(`bad-${tag}`);
    const res = await completeSet(w, w.setIds[0]!, { actualLoadKg: value });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(body.error.message).toBe("Invalid set completion.");
    const row = await setRow(w.setIds[0]!);
    expect(row.status).toBe("pending");
    expect(row.actualLoadKg).toBeNull();
  });

  it("skip keeps the start-time labels and columns", async () => {
    const w = await startWorkout("skip");
    const res = await app.request(
      `/workouts/executions/${w.executionId}/sets/${w.setIds[0]!}/skip`,
      { method: "POST", headers: traineeHeaders(w.traineeToken) },
      testEnv(),
    );
    expect(res.status).toBe(200);
    const row = await setRow(w.setIds[0]!);
    expect(row.status).toBe("skipped");
    expect(row.prescribedLoadLabel).toBe("60kg");
    expect(row.prescribedLoadKg).toBe(60);
    expect(row.actualLoadKg).toBeNull();
    expect(row.loadKind).toBe("kg");
  });

  it("sync replay of workout.complete_set writes the same columns, once", async () => {
    const w = await startWorkout("sync");
    const mutationId = "00000000-0000-4000-8000-00000000b201";
    const push = () =>
      app.request(
        "/sync/push",
        {
          method: "POST",
          headers: traineeHeaders(w.traineeToken),
          body: JSON.stringify({
            mutations: [
              {
                mutationId,
                idempotencyKey: mutationId,
                entityType: "workout_execution",
                recordId: w.executionId,
                operation: "workout.complete_set",
                expectedServerVersion: null,
                clientOccurredAt: new Date().toISOString(),
                payload: {
                  executionId: w.executionId,
                  setExecutionId: w.setIds[0],
                  body: { actualLoadKg: 55.25 },
                },
              },
            ],
          }),
        },
        testEnv(),
      );
    for (const expected of ["applied", "already_applied"]) {
      const res = await push();
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { results: Array<{ status: string }> } };
      expect(body.data.results[0]?.status).toBe(expected);
    }
    const row = await setRow(w.setIds[0]!);
    expect(row.actualLoadKg).toBe(55.25);
    expect(row.actualLoadLabel).toBe("55.25 kg");
    expect(row.loadKind).toBe("kg");
    expect(row.prescribedLoadKg).toBe(60);
  });
});
