import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  GLOBAL_CHECKIN_FORM_V1_VERSION_ID,
  GLOBAL_CHECKIN_FORM_V2_VERSION_ID,
  GLOBAL_CHECKIN_FORM_VERSION_ID,
  formatLocalDate,
} from "@fitbud/core";
import * as schema from "../db/schema.js";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import type { Env } from "../types.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb } from "../test-support/memory-db.js";

/**
 * Z6-2b: check-in submit follows the pinned form's required questions, and
 * every answered measurement question is stored with its unit (D-W6-42).
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

const TZ = "Asia/Kolkata";

/** The v2 standard questions (D-W6-17): all optional, no `wellbeing`. */
const std = (id: string, label: string, type: string, extra: Record<string, unknown> = {}) => ({
  id,
  key: id,
  label,
  type,
  required: false,
  ...extra,
});
const V2_FIELDS = [
  std("weight", "Weight", "measurement", { measurementType: "body_weight_kg" }),
  std("waist", "Waist", "measurement", { measurementType: "waist_cm" }),
  std("hips", "Hips", "measurement", { measurementType: "hip_cm" }),
  std("chest", "Chest", "measurement", { measurementType: "chest_cm" }),
  std("arm", "Arm", "measurement", { measurementType: "other", unit: "cm" }),
  std("thigh", "Thigh", "measurement", { measurementType: "other", unit: "cm" }),
  std("photo_front", "Front", "photo_intent", { photoSlot: "front" }),
  std("photo_side", "Side", "photo_intent", { photoSlot: "side" }),
  std("photo_back", "Back", "photo_intent", { photoSlot: "back" }),
  std("energy", "Energy", "scale_1_5"),
  std("sleep_quality", "Sleep quality", "scale_1_5"),
  std("stress", "Stress", "scale_1_5"),
  std("hunger", "Hunger", "scale_1_5"),
  std("notes", "Notes", "long_text", { maxLength: 2000 }),
];

type Ctx = {
  trainerCookie: string;
  traineeToken: string;
  relationshipId: string;
  today: string;
};

async function request(
  path: string,
  init: { method: string; headers: Record<string, string>; body?: unknown },
) {
  return app.request(
    path,
    {
      method: init.method,
      headers: { "Content-Type": "application/json", ...init.headers },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    },
    testEnv(),
  );
}

async function asTrainer(ctx: Ctx, method: string, path: string, idem: string | null, body?: unknown) {
  return request(path, {
    method,
    headers: { Cookie: ctx.trainerCookie, ...(idem ? { "Idempotency-Key": idem } : {}) },
    body,
  });
}

async function asTrainee(ctx: Ctx, method: string, path: string, idem: string | null, body?: unknown) {
  return request(path, {
    method,
    headers: {
      Authorization: `Bearer ${ctx.traineeToken}`,
      "x-fitbud-role": "trainee",
      ...(idem ? { "Idempotency-Key": idem } : {}),
    },
    body,
  });
}

/** Invitation → intake → coaching-ready → active configuration, all through the API. */
async function reachActive(suffix: string): Promise<Ctx> {
  const email = `fr-coach-${suffix}@example.com`;
  const session = await request("/auth/session", {
    method: "POST",
    headers: {},
    body: { idToken: createTestIdToken(`trainer-${email}`, email), timezone: TZ },
  });
  expect(session.status).toBe(200);
  const trainerCookie = session.headers.get("set-cookie")!.split(";")[0]!;
  const traineeEmail = `fr-trainee-${suffix}@example.com`;
  const traineeToken = createTestIdToken(`fr-trainee-${suffix}`, traineeEmail);
  const ctx: Ctx = {
    trainerCookie,
    traineeToken,
    relationshipId: "",
    today: formatLocalDate(new Date(), TZ),
  };

  const invite = await asTrainer(ctx, "POST", "/invitations", `fr-inv-${suffix}`, {
    recipientEmail: traineeEmail,
  });
  const token = ((await invite.json()) as { data: { token: string } }).data.token;
  const accept = await request("/invitations/accept", {
    method: "POST",
    headers: { Authorization: `Bearer ${traineeToken}` },
    body: { token, timezone: TZ },
  });
  ctx.relationshipId = ((await accept.json()) as { data: { relationship: { id: string } } }).data
    .relationship.id;
  const rel = ctx.relationshipId;

  await asTrainee(ctx, "PUT", `/onboarding/relationships/${rel}/draft`, null, {
    expectedVersion: 0,
    answers: {
      goals: "Recomp",
      relevant_history: "None",
      preferences: "Home food",
      schedule: "Evenings",
      limitations: "None",
    },
  });
  await asTrainee(ctx, "POST", `/onboarding/relationships/${rel}/submit`, `fr-ob-${suffix}`, {
    expectedVersion: 1,
  });
  await asTrainer(ctx, "POST", `/onboarding/relationships/${rel}/review`, `fr-rv-${suffix}`, {
    outcome: "coaching_ready",
  });
  await asTrainer(ctx, "PUT", `/configurations/relationships/${rel}/draft`, null, {
    expectedVersion: 0,
    goalShort: "Recomp by spring",
    workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
    nutrition: { mealsPerDay: 3, confirmationWindowHours: 24, photoRequirement: "none" },
    checkin: { cadence: "weekly", dueWindowHours: 48 },
    tracking: { requireBodyWeight: false, requireProgressPhotos: false, requireSessionRpe: false },
  });
  await asTrainer(ctx, "POST", `/configurations/relationships/${rel}/configure`, `fr-cf-${suffix}`, {
    expectedVersion: 1,
  });
  const activate = await asTrainer(
    ctx,
    "POST",
    `/configurations/relationships/${rel}/activate`,
    `fr-ac-${suffix}`,
    { expectedVersion: 1 },
  );
  expect(activate.status).toBe(200);
  return ctx;
}

type ScheduledCheckin = { id: string; recordVersion: number; checkinFormVersionId: string };

/** Trainer saves the v2-shaped form, pins it as preferred, then schedules today's check-in. */
async function scheduleV2Checkin(
  ctx: Ctx,
  suffix: string,
  fields: unknown[] = V2_FIELDS,
): Promise<ScheduledCheckin> {
  const created = await asTrainer(ctx, "POST", "/checkins/form-templates", `fr-form-${suffix}`, {
    name: "Weekly check-in (standard questions)",
    fields,
  });
  expect(created.status).toBe(201);
  const versionId = ((await created.json()) as { data: { versions: Array<{ id: string }> } }).data
    .versions[0]!.id;
  const pinned = await asTrainer(
    ctx,
    "PUT",
    `/checkins/relationships/${ctx.relationshipId}/preferred-form`,
    null,
    { checkinFormVersionId: versionId },
  );
  expect(pinned.status).toBe(200);
  const checkin = await scheduleCheckin(ctx, suffix);
  expect(checkin.checkinFormVersionId).toBe(versionId);
  return checkin;
}

async function scheduleCheckin(ctx: Ctx, suffix: string): Promise<ScheduledCheckin> {
  const scheduled = await asTrainer(
    ctx,
    "POST",
    `/checkins/relationships/${ctx.relationshipId}/schedule`,
    `fr-sched-${suffix}`,
    { localDate: ctx.today },
  );
  expect(scheduled.status).toBe(200);
  return ((await scheduled.json()) as { data: { checkin: ScheduledCheckin } }).data.checkin;
}

function submit(ctx: Ctx, checkin: ScheduledCheckin, idem: string, answers: unknown) {
  return asTrainee(ctx, "POST", `/checkins/${checkin.id}/submit`, idem, {
    expectedVersion: checkin.recordVersion,
    answers,
  });
}

const V2_ANSWERS = {
  fieldAnswers: { weight: 74.2, arm: 32, thigh: 55, energy: 4, notes: "Knee felt fine on squats" },
};

describe("check-in submit follows the pinned form (Z6-2b)", () => {
  let db: Db;
  let close: () => void;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    db = memory.db;
    close = memory.close;
    setTestDbOverride(memory.db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    close();
  });

  function measurementsFor(checkinId: string) {
    return db
      .select()
      .from(schema.measurements)
      .where(eq(schema.measurements.checkinId, checkinId));
  }

  it("submits a v2 check-in without wellbeing and stores arm and thigh as two cm rows", async () => {
    const ctx = await reachActive("v2ok");
    const checkin = await scheduleV2Checkin(ctx, "v2ok");

    const res = await submit(ctx, checkin, "fr-submit-v2ok", V2_ANSWERS);
    expect(res.status, await res.clone().text()).toBe(200);
    const body = (await res.json()) as {
      data: { recordStatus: string; answers: Record<string, unknown> };
    };
    expect(body.data.recordStatus).toBe("submitted");
    // Only what the trainee sent is stored: no invented wellbeing.
    expect(body.data.answers).toEqual(V2_ANSWERS);
    expect(body.data.answers).not.toHaveProperty("wellbeing");

    const rows = await measurementsFor(checkin.id);
    const others = rows
      .filter((row) => row.type === "other")
      .map((row) => ({ value: row.value, unit: row.unit, source: row.source }))
      .sort((a, b) => a.value - b.value);
    expect(others).toEqual([
      { value: 32, unit: "cm", source: "checkin" },
      { value: 55, unit: "cm", source: "checkin" },
    ]);
    const weight = rows.filter((row) => row.type === "body_weight_kg");
    expect(weight.map((row) => [row.value, row.unit])).toEqual([[74.2, "kg"]]);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.coachingRelationshipId === ctx.relationshipId)).toBe(true);
  });

  it("replays the same v2 submit without storing extra measurement rows", async () => {
    const ctx = await reachActive("v2replay");
    const checkin = await scheduleV2Checkin(ctx, "v2replay");

    const first = await submit(ctx, checkin, "fr-submit-v2replay", V2_ANSWERS);
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    const replay = await submit(ctx, checkin, "fr-submit-v2replay", V2_ANSWERS);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(firstBody);
    expect(await measurementsFor(checkin.id)).toHaveLength(3);
  });

  it("still rejects a blank wellbeing when it is sent", async () => {
    const ctx = await reachActive("v2blank");
    const checkin = await scheduleV2Checkin(ctx, "v2blank");
    const res = await submit(ctx, checkin, "fr-submit-v2blank", { ...V2_ANSWERS, wellbeing: "   " });
    expect(res.status).toBe(400);
    expect(await measurementsFor(checkin.id)).toHaveLength(0);
  });

  it("keeps Z6-6 key validation on the v2 submit", async () => {
    const ctx = await reachActive("v2range");
    const checkin = await scheduleV2Checkin(ctx, "v2range");
    const res = await submit(ctx, checkin, "fr-submit-v2range", {
      fieldAnswers: { arm: 5, thigh: 55 },
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; details: { invalid: string[] } } };
    expect(body.error.code).toBe("CHECKIN_ANSWER_INVALID");
    expect(body.error.details.invalid).toEqual(["arm"]);
    expect(await measurementsFor(checkin.id)).toHaveLength(0);
  });

  it("stores one body-weight row when weight comes through the question and legacy bodyWeightKg", async () => {
    const ctx = await reachActive("v2weight");
    const checkin = await scheduleV2Checkin(ctx, "v2weight");
    const res = await submit(ctx, checkin, "fr-submit-v2weight", {
      bodyWeightKg: 74.2,
      fieldAnswers: { weight: 74.2 },
    });
    expect(res.status).toBe(200);
    const rows = await measurementsFor(checkin.id);
    expect(rows.map((row) => [row.type, row.value, row.unit])).toEqual([
      ["body_weight_kg", 74.2, "kg"],
    ]);
  });

  it("stores one body-weight row when a second, unkeyed weight question is answered alongside legacy bodyWeightKg", async () => {
    const ctx = await reachActive("v2twoweights");
    const checkin = await scheduleV2Checkin(ctx, "v2twoweights", [
      ...V2_FIELDS,
      {
        id: "weight_pm",
        label: "Evening weight",
        type: "measurement",
        measurementType: "body_weight_kg",
        required: false,
      },
    ]);
    const res = await submit(ctx, checkin, "fr-submit-v2twoweights", {
      bodyWeightKg: 75,
      fieldAnswers: { weight_pm: 75 },
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const rows = await measurementsFor(checkin.id);
    expect(rows.map((row) => [row.type, row.value, row.unit])).toEqual([
      ["body_weight_kg", 75, "kg"],
    ]);
  });

  it("submits a required photo answered with a file id", async () => {
    const ctx = await reachActive("v2photoid");
    const checkin = await scheduleV2Checkin(ctx, "v2photoid", [
      std("photo_front", "Front", "photo_intent", { photoSlot: "front", required: true }),
    ]);
    const res = await submit(ctx, checkin, "fr-submit-v2photoid", {
      fieldAnswers: { photo_front: "media-file-1" },
    });
    expect(res.status, await res.clone().text()).toBe(200);
  });

  it("pins a new assignment to global v2 and accepts a v2 submit without wellbeing (Z6-2)", async () => {
    const ctx = await reachActive("v2default");
    const checkin = await scheduleCheckin(ctx, "v2default");
    expect(GLOBAL_CHECKIN_FORM_VERSION_ID).toBe(GLOBAL_CHECKIN_FORM_V2_VERSION_ID);
    expect(checkin.checkinFormVersionId).toBe(GLOBAL_CHECKIN_FORM_V2_VERSION_ID);

    const res = await submit(ctx, checkin, "fr-submit-v2default", {
      fieldAnswers: { weight: 72.5, energy: 4 },
    });
    expect(res.status, await res.clone().text()).toBe(200);
  });

  it("rejects a v1 submit without wellbeing with 422 CHECKIN_ANSWERS_INCOMPLETE", async () => {
    const ctx = await reachActive("v1missing");
    // v1 is no longer the default (Z6-2); a schedule that pins it keeps it.
    const pinnedV1 = await asTrainer(
      ctx,
      "PUT",
      `/checkins/relationships/${ctx.relationshipId}/preferred-form`,
      null,
      { checkinFormVersionId: GLOBAL_CHECKIN_FORM_V1_VERSION_ID },
    );
    expect(pinnedV1.status).toBe(200);
    const checkin = await scheduleCheckin(ctx, "v1missing");
    expect(checkin.checkinFormVersionId).toBe(GLOBAL_CHECKIN_FORM_V1_VERSION_ID);

    const res = await submit(ctx, checkin, "fr-submit-v1missing", {
      notes: "Busy week",
      bodyWeightKg: 71,
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: { code: string; message: string; details: { missing: string[] } };
    };
    expect(body.error.code).toBe("CHECKIN_ANSWERS_INCOMPLETE");
    expect(body.error.message).toBe("Required check-in answers are missing.");
    expect(body.error.details.missing).toEqual(["wellbeing"]);
    expect(await measurementsFor(checkin.id)).toHaveLength(0);

    const ok = await submit(ctx, checkin, "fr-submit-v1ok", {
      wellbeing: "Steady week",
      bodyWeightKg: 71,
    });
    expect(ok.status).toBe(200);
  });

  it("submits the v2 check-in through POST /sync/push (checkin.submit)", async () => {
    const ctx = await reachActive("v2sync");
    const checkin = await scheduleV2Checkin(ctx, "v2sync");
    const mutationId = "5b2c6f1e-8d3a-4c7e-9f10-2a6b7c8d9e01";
    const mutation = {
      mutationId,
      idempotencyKey: mutationId,
      entityType: "checkin",
      recordId: checkin.id,
      operation: "checkin.submit",
      expectedServerVersion: checkin.recordVersion,
      clientOccurredAt: new Date().toISOString(),
      payload: {
        checkinId: checkin.id,
        body: { expectedVersion: checkin.recordVersion, answers: V2_ANSWERS },
      },
    };
    const push = () => asTrainee(ctx, "POST", "/sync/push", null, { mutations: [mutation] });

    const res = await push();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { results: Array<{ status: string; recordId: string | null; error: unknown }> };
    };
    expect(body.data.results[0]).toMatchObject({
      status: "applied",
      recordId: checkin.id,
      error: null,
    });
    const rows = await measurementsFor(checkin.id);
    expect(
      rows
        .filter((row) => row.type === "other")
        .map((row) => [row.value, row.unit])
        .sort((a, b) => Number(a[0]) - Number(b[0])),
    ).toEqual([
      [32, "cm"],
      [55, "cm"],
    ]);

    // Duplicate delivery of the same mutation stores nothing new.
    const again = await push();
    expect(again.status).toBe(200);
    expect(await measurementsFor(checkin.id)).toHaveLength(3);
  });
});
