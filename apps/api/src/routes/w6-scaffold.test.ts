import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as contracts from "@fitbud/contracts";
import worker, { app } from "../index.js";
import { setTestDbOverride } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import { runAccountPurge } from "../jobs/account-purge.js";
import type { Env } from "../types.js";

vi.mock("../jobs/account-purge.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../jobs/account-purge.js")>();
  return { runAccountPurge: vi.fn(actual.runAccountPurge) };
});

/**
 * Z5-4: W6 module scaffolds. Every W6 mount answers 404 `not_implemented` (static
 * text, no data) until its W6 task replaces the router; nothing here grants access.
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

const MOUNTS = [
  "/strength",
  "/client-settings",
  "/steps",
  "/account",
] as const;

async function expectNotImplemented(response: Response) {
  expect(response.status).toBe(404);
  const body = (await response.json()) as {
    error: { code: string; message: string };
  };
  expect(body.error.code).toBe("not_implemented");
  expect(body.error.message).toBe("This endpoint is not available yet.");
  expect(Object.keys(body)).toEqual(["error"]);
}

describe("W6 scaffold mounts", () => {
  let closeDb: () => void;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    closeDb = memory.close;
    setTestDbOverride(memory.db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb();
  });

  async function trainerCookie() {
    const token = createTestIdToken(
      "trainer-w6-scaffold",
      "w6.scaffold@demo.fitbud.test",
    );
    const response = await app.request(
      "/auth/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token, timezone: "Asia/Kolkata" }),
      },
      testEnv(),
    );
    expect(response.status).toBe(200);
    return response.headers.get("set-cookie")!.split(";")[0]!;
  }

  for (const mount of MOUNTS) {
    it(`${mount} answers 404 not_implemented for a signed-in trainer on the root and sub-paths, any method`, async () => {
      const cookie = await trainerCookie();
      for (const [path, method] of [
        [mount, "GET"],
        [`${mount}/anything/else`, "POST"],
        [`${mount}/x`, "DELETE"],
      ] as const) {
        await expectNotImplemented(
          await app.request(
            path,
            { method, headers: { Cookie: cookie } },
            testEnv(),
          ),
        );
      }
    });

    it(`${mount} answers 404 not_implemented to unauthenticated callers (no data, no bypass)`, async () => {
      await expectNotImplemented(await app.request(mount, {}, testEnv()));
      await expectNotImplemented(
        await app.request(`${mount}/sub`, { method: "POST" }, testEnv()),
      );
    });
  }

  it("/exceptions/bulk/resolve reaches the real bulk router (Z6-10, D-W6-15), and the existing exceptions router is unchanged", async () => {
    const cookie = await trainerCookie();
    // Unauthenticated: the bulk router's own auth answers 401, not the scaffold.
    const anonBulk = await app.request(
      "/exceptions/bulk/resolve",
      { method: "POST" },
      testEnv(),
    );
    expect(anonBulk.status).toBe(401);
    // Signed in without a body: the bulk router's validation answers, so the path
    // is matched before /exceptions/:exceptionId.
    const bulk = await app.request(
      "/exceptions/bulk/resolve",
      { method: "POST", headers: { Cookie: cookie } },
      testEnv(),
    );
    expect(bulk.status).toBe(400);
    const bulkBody = (await bulk.json()) as {
      error: { code: string; message: string };
    };
    expect(bulkBody.error.code).toBe("INVALID_REQUEST");
    expect(bulkBody.error.message).toBe("Invalid bulk resolve request.");

    // The existing exceptions router answers /exceptions/:id with its own auth and
    // lookup errors: unauthenticated callers get 401, a trainer gets a domain error
    // that is not the scaffold's.
    const uuid = "00000000-0000-4000-8000-000000000000";
    const anonExisting = await app.request(`/exceptions/${uuid}`, {}, testEnv());
    expect(anonExisting.status).toBe(401);
    const existing = await app.request(
      `/exceptions/${uuid}`,
      { headers: { Cookie: cookie } },
      testEnv(),
    );
    const body = (await existing.json()) as { error?: { code: string } };
    expect(body.error?.code).not.toBe("not_implemented");
    const anon = await app.request("/exceptions/attention", {}, testEnv());
    expect(anon.status).toBe(401);
  });
});

describe("W6 account-purge stub", () => {
  it("runAccountPurge does nothing", async () => {
    await expect(
      runAccountPurge(testEnv(), new Date()),
    ).resolves.toBeUndefined();
  });

  it("scheduled() calls runAccountPurge once with the env and the scheduled time", async () => {
    const memory = await createMemoryDb();
    setTestDbOverride(memory.db);
    vi.mocked(runAccountPurge).mockClear();
    const scheduledTime = Date.parse("2026-11-06T06:00:00.000Z");
    const env = testEnv();
    try {
      // The Sentry wrapper takes a third (execution context) argument.
      const run = worker.scheduled as unknown as (
        controller: ScheduledController,
        env: Env,
        ctx: ExecutionContext,
      ) => Promise<void>;
      await run(
        { scheduledTime, cron: "*/5 * * * *" } as ScheduledController,
        env,
        { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext,
      ).catch(() => {
          // Other cron jobs may fail without providers; only the purge call matters here.
        });
      expect(runAccountPurge).toHaveBeenCalledTimes(1);
      expect(runAccountPurge).toHaveBeenCalledWith(
        expect.objectContaining({ FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID }),
        new Date(scheduledTime),
      );
    } finally {
      setTestDbOverride(null);
      memory.close();
    }
  });
});

describe("W6 scaffold exports resolve", () => {
  it("contracts index exports each W6 placeholder type (enforced by typecheck)", () => {
    const placeholders: [
      contracts.W6StrengthContract,
      contracts.W6CheckinFormV2Contract,
      contracts.W6ClientSettingsContract,
      contracts.W6StepsContract,
      contracts.W6AccountContract,
      contracts.W6CoachLogContract,
    ] = [{}, {}, {}, {}, {}, {}];
    expect(placeholders).toHaveLength(6);
  });
});
