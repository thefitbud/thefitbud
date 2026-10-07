import { describe, expect, it } from "vitest";
import { app } from "../index.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";

function testEnv(): Env {
  return {
    DB: {
      prepare() {
        throw new Error("D1 should not be queried by documentation routes");
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
  };
}

function normalizePath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

describe("OpenAPI documentation", () => {
  it("serves an OpenAPI document that matches mounted routes", async () => {
    const response = await app.request("/openapi.json", { method: "GET" }, testEnv());
    expect(response.status).toBe(200);
    const spec = (await response.json()) as {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, Record<string, { description?: string; security?: unknown[] }>>;
    };
    expect(spec.openapi.startsWith("3.")).toBe(true);
    expect(spec.info.title).toBe("FitBud API");
    expect(spec.info.version).toBeTruthy();

    const documented = new Set<string>();
    for (const [specPath, item] of Object.entries(spec.paths)) {
      for (const method of Object.keys(item)) {
        if (["get", "post", "put", "patch", "delete"].includes(method)) {
          documented.add(`${method.toUpperCase()} ${specPath}`);
        }
      }
    }

    const mounted = app.routes
      .filter((route) => route.method !== "ALL")
      .map((route) => `${route.method} ${normalizePath(route.path)}`);
    const mountedSet = new Set(mounted);
    const missing = [...mountedSet].filter((item) => !documented.has(item)).sort();
    const extra = [...documented].filter((item) => !mountedSet.has(item)).sort();
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    expect([...documented].some((item) => item.includes("/intake"))).toBe(false);

    const health = spec.paths["/health"]?.get;
    expect(health?.security).toEqual([]);
    expect(health?.description).toContain("serving requests");

    const session = spec.paths["/auth/session"]?.post;
    expect(session?.security).toEqual([]);
    expect(JSON.stringify(session)).toContain("idToken");

    const me = spec.paths["/me"]?.get;
    expect(JSON.stringify(me?.security)).toContain("sessionCookie");
    expect(JSON.stringify(me?.security)).toContain("bearerAuth");
    expect(JSON.stringify(me)).toContain("userId");
    expect(me?.description).toContain("actor");

    const accept = spec.paths["/invitations/accept"]?.post;
    expect(accept?.security).toEqual([{ bearerAuth: [] }]);

    const history = spec.paths["/history/relationships/{relationshipId}"]?.get;
    expect(history?.description).toContain("30");

    const pull = spec.paths["/sync/pull"]?.get;
    expect(pull?.description).toContain("50");
    expect(pull?.description).toContain("100");

    const evaluate = spec.paths["/notifications/reminders/evaluate"]?.post;
    expect(evaluate?.description).toContain("AUTH_MODE");

    const socket = spec.paths["/realtime/relationships/{relationshipId}/ws"]?.get;
    expect(socket?.description).toContain("realtimeEventSchema");
    expect(JSON.stringify(socket)).toContain("eventType");
    expect(socket?.description).toContain("not an HTTP body");

    const subscription = spec.paths["/relationships/{relationshipId}/subscription"]?.put;
    expect(subscription?.description?.toLowerCase()).toContain("subscription");

    const onboarding = spec.paths["/onboarding/forms/current"]?.get;
    expect(onboarding?.description?.toLowerCase()).toContain("onboarding");
  });

  it("serves HTML docs that reference the same-origin spec", async () => {
    const response = await app.request("/docs", { method: "GET" }, testEnv());
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html.toLowerCase()).toContain("<!doctype html");
    expect(html).toContain("/openapi.json");
    expect(html).not.toContain("MEDIA_SIGNING_SECRET");
  });

  it("does not make the current actor public", async () => {
    const response = await app.request("/me", { method: "GET" }, testEnv());
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });
});
