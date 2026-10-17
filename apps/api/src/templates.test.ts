import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "./index.js";
import { setTestDbOverride } from "./db/client.js";
import { createTestIdToken } from "./auth/firebase.js";
import { createMemoryR2Bucket } from "./lib/memory-r2.js";
import type { Env } from "./types.js";
import { createMemoryDb } from "./test-support/memory-db.js";

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
  const setCookie = sessionResponse.headers.get("set-cookie");
  return { cookie: setCookie!.split(";")[0]! };
}

function workoutContent() {
  return {
    workoutDays: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        order: 1,
        name: "Day A",
        exercises: [],
      },
    ],
    mealPrescriptions: [],
  };
}

describe("template scope filters", () => {
  let close: () => void;

  beforeEach(async () => {
    const handle = await createMemoryDb({ librarySeed: true });
    setTestDbOverride(handle.db);
    close = handle.close;
  });

  afterEach(() => {
    setTestDbOverride(null);
    close();
  });

  it("filters scope=bases to global templates only", async () => {
    const trainer = await createTrainerSession("scope-bases@example.com");
    const response = await app.request(
      "/templates?scope=bases&limit=50",
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { items: Array<{ ownership: string }> };
    };
    expect(body.data.items.length).toBeGreaterThan(0);
    expect(body.data.items.every((item) => item.ownership === "global")).toBe(true);
  });

  it("filters scope=mine to trainer-owned templates only", async () => {
    const trainer = await createTrainerSession("scope-mine@example.com");
    const created = await app.request(
      "/templates",
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "scope-mine-create",
        },
        body: JSON.stringify({
          title: "Mine only",
          templateType: "workout",
          content: workoutContent(),
        }),
      },
      testEnv(),
    );
    expect(created.status).toBe(201);

    const response = await app.request(
      "/templates?scope=mine&limit=50",
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { items: Array<{ ownership: string; title: string }> };
    };
    expect(body.data.items.length).toBeGreaterThan(0);
    expect(body.data.items.every((item) => item.ownership === "trainer")).toBe(true);
    expect(body.data.items.some((item) => item.title === "Mine only")).toBe(true);
  });
});
