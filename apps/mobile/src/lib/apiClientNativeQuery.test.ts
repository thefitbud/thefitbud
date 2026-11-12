/**
 * Z11b-1 regression: on iOS and Android, Expo installs `whatwg-url-without-unicode`
 * as the global `URLSearchParams` (expo/src/winter/runtime.native.ts). That
 * implementation has no `size`, so the api-client's old `params.size > 0` check
 * dropped every query string on device: `listMealAssignments` returned every
 * meal since June ("676 of 747 meals logged").
 *
 * These tests swap in the exact module Expo ships, resolved through this app's
 * own `expo` dependency (no new package), and check the request URL of every
 * api-client method that builds a query string.
 */
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FitBudApiClient } from "@fitbud/api-client";
import { stage1Api } from "./stage1Api";

const expoRequire = createRequire(createRequire(import.meta.url).resolve("expo/package.json"));
const { URLSearchParams: ExpoNativeURLSearchParams } = expoRequire("whatwg-url-without-unicode") as {
  URLSearchParams: typeof URLSearchParams;
};

const REL = "1b65e3ad-84cf-4fe1-a546-0d62656c2c79";
const original = globalThis.URLSearchParams;

beforeAll(() => {
  globalThis.URLSearchParams = ExpoNativeURLSearchParams;
});
afterAll(() => {
  globalThis.URLSearchParams = original;
});

/** Records the URL of the one request a call makes; the response is a plain API error. */
function recordingClient() {
  const urls: string[] = [];
  const client = new FitBudApiClient({
    baseUrl: "https://api.example.test",
    getAccessToken: async () => "token",
    fetch: async (input: Parameters<typeof fetch>[0]) => {
      urls.push(String(input instanceof Request ? input.url : input));
      return new Response(
        JSON.stringify({ error: { code: "NOT_FOUND", message: "Not found.", requestId: "req-1" } }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    },
  });
  return { client, urls };
}

async function urlOf(call: (client: FitBudApiClient) => Promise<unknown>): Promise<string> {
  const { client, urls } = recordingClient();
  await call(client).catch(() => undefined);
  expect(urls).toHaveLength(1);
  return urls[0]!;
}

describe("Expo's native URLSearchParams", () => {
  it("is the polyfill without size (the reason for the bug)", () => {
    const params = new URLSearchParams();
    params.set("fromDate", "2026-11-12");
    expect(params).toBeInstanceOf(ExpoNativeURLSearchParams);
    expect((params as { size?: number }).size).toBeUndefined();
    expect(params.toString()).toBe("fromDate=2026-11-12");
  });
});

describe("api-client query strings on native (Z11b-1)", () => {
  it("listMealAssignments keeps the selected day", async () => {
    const url = await urlOf((c) =>
      c.listMealAssignments(REL, { fromDate: "2026-11-12", toDate: "2026-11-12" }),
    );
    expect(url).toBe(
      `https://api.example.test/meals/relationships/${REL}/assignments?fromDate=2026-11-12&toDate=2026-11-12`,
    );
  });

  it("listWorkoutAssignments keeps its date range", async () => {
    const url = await urlOf((c) =>
      c.listWorkoutAssignments(REL, { fromDate: "2026-11-09", toDate: "2026-11-15" }),
    );
    expect(url).toBe(
      `https://api.example.test/workouts/relationships/${REL}/assignments?fromDate=2026-11-09&toDate=2026-11-15`,
    );
  });

  it("pullSync keeps its cursor", async () => {
    const url = await urlOf((c) => c.pullSync({ cursor: "c-42", limit: 200 }));
    expect(url).toBe("https://api.example.test/sync/pull?cursor=c-42&limit=200");
  });

  it("listFoodLibrary keeps the search term", async () => {
    const url = await urlOf((c) => c.listFoodLibrary({ q: "paneer tikka", limit: 20 }));
    expect(url).toBe("https://api.example.test/libraries/foods?limit=20&q=paneer+tikka");
  });

  it("no params still means no question mark", async () => {
    expect(await urlOf((c) => c.pullSync())).toBe("https://api.example.test/sync/pull");
    expect(await urlOf((c) => c.listMealAssignments(REL))).toBe(
      `https://api.example.test/meals/relationships/${REL}/assignments`,
    );
  });

  // Every api-client method that builds a query string (the 25 call sites).
  const cases: Array<[string, (c: FitBudApiClient) => Promise<unknown>, string]> = [
    ["listInvitations", (c) => c.listInvitations({ cursor: "x", limit: 5 }), "/invitations?cursor=x&limit=5"],
    ["listRelationships", (c) => c.listRelationships({ cursor: "x", limit: 5 }), "/relationships?cursor=x&limit=5"],
    ["listOnboardingFormTemplates", (c) => c.listOnboardingFormTemplates({ limit: 5 }), "/onboarding/form-templates?limit=5"],
    ["listPlans", (c) => c.listPlans(REL, { limit: 5 }), `/plans/relationships/${REL}?limit=5`],
    ["listPlanTemplates", (c) => c.listPlanTemplates({ q: "fat loss" }), "/templates?q=fat+loss"],
    ["listClients", (c) => c.listClients({ q: "ananya", status: ["active"] }), "/clients?q=ananya&status=active"],
    ["listExerciseLibrary", (c) => c.listExerciseLibrary({ q: "squat" }), "/libraries/exercises?q=squat"],
    ["listFoodLibrary", (c) => c.listFoodLibrary({ q: "dal" }), "/libraries/foods?q=dal"],
    ["listWorkoutAssignments", (c) => c.listWorkoutAssignments(REL, { fromDate: "2026-11-12" }), `/workouts/relationships/${REL}/assignments?fromDate=2026-11-12`],
    ["getWorkoutAdherence", (c) => c.getWorkoutAdherence(REL, { fromDate: "2026-11-09", toDate: "2026-11-15" }), `/workouts/relationships/${REL}/adherence?fromDate=2026-11-09&toDate=2026-11-15`],
    ["listMealAssignments", (c) => c.listMealAssignments(REL, { toDate: "2026-11-12" }), `/meals/relationships/${REL}/assignments?toDate=2026-11-12`],
    ["getMealCompliance", (c) => c.getMealCompliance(REL, { fromDate: "2026-11-09" }), `/meals/relationships/${REL}/compliance?fromDate=2026-11-09`],
    ["listCheckins", (c) => c.listCheckins(REL, { fromDate: "2026-11-01", toDate: "2026-11-30", limit: 100 }), `/checkins/relationships/${REL}?fromDate=2026-11-01&toDate=2026-11-30&limit=100`],
    ["listCheckinFormTemplates", (c) => c.listCheckinFormTemplates({ scope: "mine" }), "/checkins/form-templates?scope=mine"],
    ["getAttentionFeed", (c) => c.getAttentionFeed({ limit: 10 }), "/exceptions/attention?limit=10"],
    ["listExceptions", (c) => c.listExceptions(REL, { status: "open" }), `/exceptions/relationships/${REL}?status=open`],
    ["listHistory", (c) => c.listHistory(REL, { occurredFrom: "2026-11-01T00:00:00.000Z" }), `/history/relationships/${REL}?occurredFrom=2026-11-01T00%3A00%3A00.000Z`],
    ["listMeasurements", (c) => c.listMeasurements(REL, { limit: 5 }), `/progress/relationships/${REL}/measurements?limit=5`],
    ["listProgressEntries", (c) => c.listProgressEntries(REL, { limit: 5 }), `/progress/relationships/${REL}/entries?limit=5`],
    ["pullSync", (c) => c.pullSync({ cursor: "c-1" }), "/sync/pull?cursor=c-1"],
    ["getActivityFeed", (c) => stage1Api(c).getActivityFeed({ rid: REL, limit: 5 }), `/activity/feed?limit=5&rid=${REL}`],
    ["listCoachAsks", (c) => stage1Api(c).listCoachAsks({ status: "open" }), "/coach-asks?status=open"],
    ["searchMeFoods", (c) => stage1Api(c).searchMeFoods({ q: "roti" }), "/me/foods/search?q=roti"],
    ["getStrength", (c) => c.getStrength(REL, { range: "12w" }), `/strength/relationships/${REL}?range=12w`],
  ];

  it.each(cases)("%s carries its query string", async (_name, call, expected) => {
    expect(await urlOf(call)).toBe(`https://api.example.test${expected}`);
  });
});
