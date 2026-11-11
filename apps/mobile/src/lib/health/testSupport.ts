/**
 * Test helpers for the steps sync: a contract-checked stand-in for the
 * `/me/steps/days/:localDate` endpoint behind a real `FitBudApiClient`, and
 * scriptable health providers. Imported by tests only.
 */
import { FitBudApiClient } from "@fitbud/api-client";
import { putStepsDayRequestSchema, putStepsDayResponseSchema, stepsLocalDateSchema, type StepsDay } from "@fitbud/contracts";
import type { PermissionMemory } from "./stepsSync";
import type { DailyStepTotal, DayWindow, HealthAvailability, HealthPermission, HealthStepsProvider } from "./types";

export const TRAINEE_TOKEN = "trainee-access-token";

/**
 * Stores days the way Z6-9 does: a write replaces a day only when its
 * `syncedAt` is newer. Every request body is parsed with the shared request
 * schema and every response with the shared response schema, so a body the
 * real API would reject fails the test.
 */
export function createStepsServer(options: { failDates?: readonly string[] } = {}) {
  const days = new Map<string, StepsDay>();
  const requests: { localDate: string; body: unknown; auth: string | null }[] = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const match = /^\/me\/steps\/days\/([^/]+)$/.exec(url.pathname);
    if (!match || init?.method !== "PUT") {
      return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "Not found.", requestId: "req-1" } }), { status: 404 });
    }
    const localDate = decodeURIComponent(match[1]!);
    const body: unknown = JSON.parse(String(init.body));
    const auth = new Headers(init.headers).get("Authorization");
    requests.push({ localDate, body, auth });
    const parsedDate = stepsLocalDateSchema.safeParse(localDate);
    const parsed = putStepsDayRequestSchema.safeParse(body);
    if (!parsedDate.success || !parsed.success || auth !== `Bearer ${TRAINEE_TOKEN}`) {
      return new Response(
        JSON.stringify({ error: { code: "VALIDATION_FAILED", message: "Invalid request.", requestId: "req-2" } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (options.failDates?.includes(localDate)) {
      return new Response(
        JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Something went wrong.", requestId: "req-3" } }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
    const syncedAt = parsed.data.syncedAt ?? new Date().toISOString();
    const stored = days.get(localDate);
    const applied = !stored || stored.syncedAt < syncedAt;
    if (applied) days.set(localDate, { localDate, steps: parsed.data.steps, source: parsed.data.source, syncedAt });
    const data = putStepsDayResponseSchema.parse({ ...days.get(localDate)!, applied });
    return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const api = new FitBudApiClient({
    baseUrl: "https://api.fitbud.test",
    getAccessToken: () => TRAINEE_TOKEN,
    fetch: fetchImpl,
  });
  return { api, days, requests };
}

export type FakeProviderScript = {
  source?: HealthStepsProvider["source"];
  availability?: HealthAvailability;
  /** Permission before any prompt; `askedBefore` is passed through for Android-style answers. */
  permission?: (askedBefore: boolean) => HealthPermission;
  /** Permission after the prompt. */
  afterPrompt?: HealthPermission;
  totals?: Record<string, number>;
  readError?: Error;
};

export function fakeProvider(script: FakeProviderScript) {
  const calls = { prompts: 0, reads: [] as DayWindow[][] };
  let prompted = false;
  const provider: HealthStepsProvider = {
    source: script.source ?? "health_connect",
    availability: async () => script.availability ?? "available",
    permission: async (askedBefore) =>
      prompted ? (script.afterPrompt ?? "granted") : (script.permission?.(askedBefore) ?? "granted"),
    requestPermission: async () => {
      calls.prompts += 1;
      prompted = true;
      return script.afterPrompt ?? "granted";
    },
    readDailyTotals: async (windows): Promise<DailyStepTotal[]> => {
      calls.reads.push([...windows]);
      if (script.readError) throw script.readError;
      return windows.map((w) => ({ localDate: w.localDate, steps: script.totals?.[w.localDate] ?? null }));
    },
  };
  return { provider, calls };
}

export function memoryFlag(initial = false): PermissionMemory & { asked: boolean } {
  const flag = {
    asked: initial,
    wasAsked: async () => flag.asked,
    markAsked: async () => {
      flag.asked = true;
    },
  };
  return flag;
}
