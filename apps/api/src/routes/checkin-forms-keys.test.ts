import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GLOBAL_CHECKIN_FORM_FIELDS,
  GLOBAL_CHECKIN_FORM_TEMPLATE_ID,
  formatLocalDate,
} from "@fitbud/core";
import * as schema from "../db/schema.js";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
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

async function reachActiveCheckinConfig(
  suffix: string,
  options: { dueWindowHours?: number } = {},
) {
  const dueWindowHours = options.dueWindowHours ?? 48;
  const trainer = await createTrainerSession(`checkin-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-checkin-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `checkin-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `checkin-trainee-${suffix}`,
    `checkin-trainee-${suffix}@example.com`,
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
          goals: "Recomp",
          relevant_history: "None",
          preferences: "Home food",
          schedule: "Evenings",
          limitations: "None",
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
        "Idempotency-Key": `submit-checkin-${suffix}`,
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
        "Idempotency-Key": `review-checkin-${suffix}`,
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
        goalShort: "Check-in cadence",
        workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
        nutrition: {
          mealsPerDay: 2,
          confirmationWindowHours: 24,
          photoRequirement: "none",
        },
        checkin: { cadence: "weekly", dueWindowHours },
        tracking: {
          requireBodyWeight: false,
          requireProgressPhotos: false,
          requireSessionRpe: false,
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
        "Idempotency-Key": `cfg-checkin-${suffix}`,
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
        "Idempotency-Key": `act-checkin-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 1 }),
    },
    testEnv(),
  );

  const today = formatLocalDate(new Date(), "Asia/Kolkata");
  return {
    trainerCookie: trainer.cookie,
    traineeToken,
    relationshipId,
    today,
  };
}

const key = (
  id: string,
  type: string,
  extra: Record<string, unknown> = {},
) => ({ id, key: id, label: id, type, required: false, ...extra });
const weightField = key("weight", "measurement", { measurementType: "body_weight_kg" });
const energyField = key("energy", "scale_1_5");
const stressField = key("stress", "scale_1_5");
const photoFront = key("photo_front", "photo_intent", { photoSlot: "front" });
const customField = {
  id: "mood_note",
  label: "Anything else on your mind?",
  type: "short_text",
  required: false,
};

describe("check-in form standard keys", () => {
  let closeDb: () => void;
  let db: Db;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    closeDb = memory.close;
    db = memory.db;
    setTestDbOverride(memory.db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb();
  });

  async function post(path: string, cookie: string, idem: string, body: unknown) {
    return app.request(
      path,
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": idem,
        },
        body: JSON.stringify(body),
      },
      testEnv(),
    );
  }

  async function createForm(cookie: string, fields: unknown[], idem: string) {
    return post("/checkins/form-templates", cookie, idem, {
      name: "Keyed check-in",
      fields,
    });
  }

  it("saves a keyed form, keeps the key and allows custom questions", async () => {
    const { trainerCookie } = await reachActiveCheckinConfig("keysave");
    const res = await createForm(
      trainerCookie,
      [weightField, energyField, customField, { ...customField, id: "other_note" }],
      "keys-ok",
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { versions: Array<{ fields: Array<{ id: string; key?: string }> }> };
    };
    expect(body.data.versions[0]!.fields.map((f) => f.key)).toEqual([
      "weight",
      "energy",
      undefined,
      undefined,
    ]);
  });

  it("rejects a duplicate standard key on create and on a new version with 422 naming it", async () => {
    const { trainerCookie } = await reachActiveCheckinConfig("keydup");
    const dup = await createForm(
      trainerCookie,
      [energyField, { ...energyField, id: "energy_2" }],
      "keys-dup",
    );
    expect(dup.status).toBe(422);
    const dupBody = (await dup.json()) as {
      error: { code: string; message: string; details: { key: string } };
    };
    expect(dupBody.error.code).toBe("DUPLICATE_CHECKIN_KEY");
    expect(dupBody.error.details.key).toBe("energy");
    expect(dupBody.error.message).not.toContain("energy");

    const created = await createForm(trainerCookie, [energyField], "keys-base");
    const createdBody = (await created.json()) as { data: { id: string } };
    const version = await post(
      `/checkins/form-templates/${createdBody.data.id}/versions`,
      trainerCookie,
      "keys-dup-version",
      { fields: [stressField, { ...stressField, id: "stress_again" }] },
    );
    expect(version.status).toBe(422);
    expect(
      ((await version.json()) as { error: { details: { key: string } } }).error
        .details.key,
    ).toBe("stress");
  });

  it("rejects a key whose id or type does not match", async () => {
    const { trainerCookie } = await reachActiveCheckinConfig("keymismatch");
    const res = await createForm(
      trainerCookie,
      [{ ...energyField, type: "yes_no" }],
      "keys-mismatch",
    );
    expect(res.status).toBe(422);
    expect(
      ((await res.json()) as { error: { code: string } }).error.code,
    ).toBe("CHECKIN_KEY_MISMATCH");
  });

  it("leaves v1 forms (no keys) saving and duplicate custom questions alone", async () => {
    const { trainerCookie } = await reachActiveCheckinConfig("keyv1");
    const res = await createForm(
      trainerCookie,
      [
        { id: "sleep", label: "Sleep", type: "scale_1_5", required: false },
        { id: "sleep_b", label: "Sleep again", type: "scale_1_5", required: false },
      ],
      "keys-v1",
    );
    expect(res.status).toBe(201);
  });

  async function submitWith(
    suffix: string,
    fields: unknown[],
    fieldAnswers: Record<string, unknown>,
    top: Record<string, unknown> = {},
  ) {
    const ctx = await reachActiveCheckinConfig(suffix);
    const created = await createForm(ctx.trainerCookie, fields, `form-${suffix}`);
    const createdBody = (await created.json()) as {
      data: { versions: Array<{ id: string }> };
    };
    const scheduled = await post(
      `/checkins/relationships/${ctx.relationshipId}/schedule`,
      ctx.trainerCookie,
      `sched-${suffix}`,
      {
        localDate: ctx.today,
        checkinFormVersionId: createdBody.data.versions[0]!.id,
      },
    );
    const scheduledBody = (await scheduled.json()) as {
      data: { checkin: { id: string; recordVersion: number } };
    };
    const res = await app.request(
      `/checkins/${scheduledBody.data.checkin.id}/submit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": `submit-${suffix}`,
        },
        body: JSON.stringify({
          expectedVersion: scheduledBody.data.checkin.recordVersion,
          answers: { wellbeing: "Fine", fieldAnswers, ...top },
        }),
      },
      testEnv(),
    );
    return res;
  }

  it("accepts valid keyed answers and a free-text custom answer", async () => {
    const res = await submitWith(
      "ansok",
      [weightField, energyField, photoFront, customField],
      { weight: 72.5, energy: 4, photo_front: "media-file-1", mood_note: "All good, slept badly Tuesday" },
    );
    expect(res.status).toBe(200);
  });

  it.each([0, 6, 2.5])("rejects rating %s on submit with 422", async (value) => {
    const res = await submitWith(`rating${String(value).replace(".", "p")}`, [energyField], {
      energy: value,
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: { code: string; details: { invalid: string[] } };
    };
    expect(body.error.code).toBe("CHECKIN_ANSWER_INVALID");
    expect(body.error.details.invalid).toEqual(["energy"]);
  });

  it("rejects an out-of-range weight on submit", async () => {
    const res = await submitWith("wt", [weightField], { weight: 19 });
    expect(res.status).toBe(422);
  });

  it("rejects an out-of-range top-level bodyWeightKg on a keyed form and writes no measurement", async () => {
    const res = await submitWith("legacywt", [weightField], {}, { bodyWeightKg: 450 });
    expect(res.status).toBe(422);
    expect(
      ((await res.json()) as { error: { code: string } }).error.code,
    ).toBe("CHECKIN_ANSWER_INVALID");
    const rows = await db.select().from(schema.measurements);
    expect(rows).toHaveLength(0);
  });

  it("accepts a valid top-level bodyWeightKg on a keyed form and links it", async () => {
    const res = await submitWith("legacywtok", [weightField], {}, { bodyWeightKg: 72.4 });
    expect(res.status).toBe(200);
    const rows = await db.select().from(schema.measurements);
    expect(rows.map((r) => r.value)).toEqual([72.4]);
  });

  it("submits a required keyed photo answered with a photo-intent object", async () => {
    const res = await submitWith(
      "photoobj",
      [{ ...photoFront, required: true }],
      { photo_front: { notedAt: new Date().toISOString(), contentType: "image/jpeg" } },
    );
    expect(res.status).toBe(200);
  });

  it("rejects photo_front on a side slot and arm without a cm unit", async () => {
    const { trainerCookie } = await reachActiveCheckinConfig("keyslotunit");
    const slot = await createForm(
      trainerCookie,
      [{ ...photoFront, photoSlot: "side" }],
      "keys-slot",
    );
    expect(slot.status).toBe(422);
    expect(
      ((await slot.json()) as { error: { code: string; details: { key: string } } }).error,
    ).toMatchObject({ code: "CHECKIN_KEY_MISMATCH", details: { key: "photo_front" } });

    const armField = key("arm", "measurement", { measurementType: "other" });
    const noUnit = await createForm(trainerCookie, [armField], "keys-arm-nounit");
    expect(noUnit.status).toBe(422);
    expect(
      ((await noUnit.json()) as { error: { code: string } }).error.code,
    ).toBe("CHECKIN_KEY_MISMATCH");
    const inches = await createForm(
      trainerCookie,
      [{ ...armField, unit: "in" }],
      "keys-arm-in",
    );
    expect(inches.status).toBe(422);
    const ok = await createForm(
      trainerCookie,
      [{ ...armField, unit: "cm" }, { ...armField, id: "thigh", key: "thigh", unit: "cm" }],
      "keys-arm-cm",
    );
    expect(ok.status).toBe(201);
  });

  it("does not validate a custom question's answer by key", async () => {
    const res = await submitWith(
      "customfree",
      [{ id: "sleep", label: "Sleep", type: "scale_1_5", required: false }],
      { sleep: 9 },
    );
    expect(res.status).toBe(200);
  });

  it("submits against the default v1 form without keys", async () => {
    const ctx = await reachActiveCheckinConfig("v1submit");
    const scheduled = await post(
      `/checkins/relationships/${ctx.relationshipId}/schedule`,
      ctx.trainerCookie,
      "sched-v1",
      { localDate: ctx.today },
    );
    const scheduledBody = (await scheduled.json()) as {
      data: { checkin: { id: string; recordVersion: number } };
    };
    const res = await app.request(
      `/checkins/${scheduledBody.data.checkin.id}/submit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "submit-v1",
        },
        body: JSON.stringify({
          expectedVersion: scheduledBody.data.checkin.recordVersion,
          answers: { wellbeing: "Good", fieldAnswers: { waist: 5 } },
        }),
      },
      testEnv(),
    );
    expect(res.status).toBe(200);
  });

  it("forks the default global version even when a later global version exists", async () => {
    const { trainerCookie } = await reachActiveCheckinConfig("forkdefault");
    // A later global version (v2 fixture) with a distinguishable field list.
    await db.insert(schema.checkinFormVersions).values({
      id: "c1000001-0000-4000-8000-0000000000f2",
      templateId: GLOBAL_CHECKIN_FORM_TEMPLATE_ID,
      key: GLOBAL_CHECKIN_FORM_TEMPLATE_ID,
      version: 2,
      scope: "global",
      trainerUserId: null,
      schemaJson: JSON.stringify({ fields: [weightField, energyField] }),
      createdAt: new Date().toISOString(),
    });
    const fork = await post(
      `/checkins/form-templates/${GLOBAL_CHECKIN_FORM_TEMPLATE_ID}/fork`,
      trainerCookie,
      "fork-default",
      { name: "My weekly" },
    );
    expect(fork.status).toBe(201);
    const body = (await fork.json()) as {
      data: { versions: Array<{ fields: unknown[] }> };
    };
    expect(body.data.versions[0]!.fields).toEqual(GLOBAL_CHECKIN_FORM_FIELDS);
  });
});
