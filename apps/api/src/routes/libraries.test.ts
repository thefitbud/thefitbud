import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride } from "../db/client.js";
import type { Env } from "../types.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import { buildDemoSeedSql } from "../seed/demo/build.js";
import { hashPassword } from "../auth/password.js";
import { DEMO_PASSWORD_PLAINTEXT } from "../seed/demo/spec.js";
import { loadDemoLibraryIndex } from "../seed/demo/personas.js";

function testEnv(): Env {
  return {
    DB: {
      prepare() {
        throw new Error("D1 should not be used when test DB override is set");
      },
      dump: async () => new ArrayBuffer(0),
      batch: async () => [],
      exec: async () => ({ count: 0, duration: 0 }),
    } as unknown as D1Database,
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    ENVIRONMENT: "local",
  };
}

async function trainerHeaders(email: string) {
  const login = await app.request(
    "/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: email, password: DEMO_PASSWORD_PLAINTEXT }),
    },
    testEnv(),
  );
  expect(login.status).toBe(200);
  const body = (await login.json()) as { data: { token: string } };
  return {
    Authorization: `Bearer ${body.data.token}`,
    "x-fitbud-role": "trainer",
  };
}

describe("library search API (T08)", () => {
  let close: () => void = () => {};

  beforeEach(async () => {
    const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
    const passwordHash = await hashPassword(DEMO_PASSWORD_PLAINTEXT);
    const libraryIndex = loadDemoLibraryIndex(handle.sqlite);
    handle.sqlite.exec(
      buildDemoSeedSql({
        referenceInstant: new Date().toISOString(),
        passwordHash,
        libraryIndex,
      }),
    );
    setTestDbOverride(handle.db);
    close = handle.close;
  }, 120_000);

  afterEach(() => {
    setTestDbOverride(null);
    close();
  });

  it("finds roti via FTS and Hindi alias; protein query does not match roti", async () => {
    const headers = await trainerHeaders("rahul.coach@demo.fitbud.test");
    const roti = await app.request(
      "/libraries/foods?q=roti",
      { headers },
      testEnv(),
    );
    expect(roti.status).toBe(200);
    const rotiBody = (await roti.json()) as {
      data: { items: Array<{ name: string }> };
    };
    expect(
      rotiBody.data.items.some((i) => /chapati|roti/i.test(i.name)),
    ).toBe(true);

    const hindi = await app.request(
      "/libraries/foods?q=" + encodeURIComponent("रोटी"),
      { headers },
      testEnv(),
    );
    expect(hindi.status).toBe(200);
    const hindiBody = (await hindi.json()) as {
      data: { items: Array<{ name: string }> };
    };
    expect(hindiBody.data.items.length).toBeGreaterThan(0);

    const protein = await app.request(
      "/libraries/foods?q=" + encodeURIComponent("प्रोटीन"),
      { headers },
      testEnv(),
    );
    const proteinBody = (await protein.json()) as {
      data: { items: Array<{ name: string }> };
    };
    expect(
      proteinBody.data.items.some((i) => /chapati|roti/i.test(i.name)),
    ).toBe(false);
  });

  it("returns 403 for trainee creating trainer foods", async () => {
    const login = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: "aarav.ontrack@demo.fitbud.test",
          password: DEMO_PASSWORD_PLAINTEXT,
        }),
      },
      testEnv(),
    );
    const token = ((await login.json()) as { data: { token: string } }).data.token;
    const response = await app.request(
      "/libraries/foods",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Test",
          classification: "ingredient",
          basis: "per_100g",
          energyKcal: 100,
          servings: [{ label: "1 cup", unit: "cup", conversion: 1 }],
        }),
      },
      testEnv(),
    );
    expect(response.status).toBe(403);
  });
});
