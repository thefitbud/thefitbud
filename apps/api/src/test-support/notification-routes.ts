/**
 * Shared setup for the notification route tests (task X4v).
 *
 * `routes/notifications.test.ts` and `routes/notifications.device-tokens.test.ts`
 * each carried their own copy of this stack and the copies had drifted, which is
 * a maintenance trap on the auth, ownership and push-delivery surface AGENTS.md
 * singles out for extra scrutiny. Only helpers that behaved identically in both
 * files live here; helpers that genuinely differ stay in the file that owns them
 * (`reachActiveCheckinConfig` in the first, `createCoachingPair`,
 * `recordDelivery`, `queueDelivery` and `setNow` in the second).
 *
 * Everything here drives the real app over a real migrated database through the
 * production routes: no mock-only keys, no shortcut around role resolution,
 * ownership or state transitions.
 */
import { expect } from "vitest";
import { app } from "../index.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";

/** Fails loudly if a route reaches for D1 while the test DB override is set. */
export function dummyD1(): D1Database {
  return {
    prepare() {
      throw new Error("D1 should not be used when test DB override is set");
    },
    dump: async () => new ArrayBuffer(0),
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

export function testEnv(): Env {
  return {
    DB: dummyD1(),
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    ENVIRONMENT: "local",
    PUSH_PROVIDER_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
  };
}

/**
 * Signs a trainer into trainer web and returns their session cookie, plus the id
 * token the sign-in used (a mobile client sends that token as a bearer instead).
 */
export async function createTrainerSession(email: string) {
  const idToken = createTestIdToken(`trainer-${email}`, email);
  const response = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, timezone: "Asia/Kolkata" }),
    },
    testEnv(),
  );
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return { cookie: setCookie!.split(";")[0]!, idToken };
}

export type RegisterBody = {
  token: string;
  platform: "ios" | "android" | "web";
  installationId: string;
  provider?: "fcm" | "expo";
};

/**
 * `POST /notifications/device-tokens` as a client sends it. The caller is
 * identified the way production identifies it -- bearer token or session cookie,
 * with the selected role header -- and nothing here is asserted, so each test
 * keeps its own expectations about the response.
 */
export async function register(
  auth: { bearer?: string; cookie?: string; role?: "trainer" | "trainee" },
  body: RegisterBody,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (auth.bearer) headers.Authorization = `Bearer ${auth.bearer}`;
  if (auth.cookie) headers.Cookie = auth.cookie;
  if (auth.role) headers["x-fitbud-role"] = auth.role;
  return app.request(
    "/notifications/device-tokens",
    { method: "POST", headers, body: JSON.stringify(body) },
    testEnv(),
  );
}
