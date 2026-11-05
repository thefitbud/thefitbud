import * as Sentry from "@sentry/cloudflare";
import type { CloudflareOptions, ErrorEvent } from "@sentry/cloudflare";
import type { Env } from "../types";

/**
 * Worker crash reporting (BT2).
 *
 * On only when `SENTRY_DSN` is set and `SENTRY_ENVIRONMENT` is `staging` or
 * `production` (D-W4-1, D-W4-5). Errors only: `tracesSampleRate` is 0 (D-W4-6).
 * Local and tests leave the DSN unset, so nothing is sent.
 *
 * `release` is the git SHA when the deploy passes the `SENTRY_RELEASE` var
 * (`@sentry/cloudflare` reads that name). The deploy script does not pass it
 * today, so the tag stays unset until that var is present.
 */

const REPORTING_ENVIRONMENTS = new Set(["staging", "production"]);

/** Header names removed from the Sentry request (case-insensitive). */
const DROPPED_HEADERS = new Set(["authorization", "proxy-authorization", "cookie", "set-cookie"]);

/**
 * Person, note and health field names. Compared after stripping `_` and `-`
 * and lower-casing, so `body_weight_kg` and `displayName` both match.
 * `filename` / `errorName` and similar non-person keys are kept.
 */
const HEALTH_KEYS = new Set([
  "weight",
  "bodyweight",
  "bodyweightkg",
  "bodyfat",
  "bodyfatpct",
  "height",
  "heightcm",
  "bmi",
  "waist",
  "waistcm",
  "hip",
  "hipcm",
  "chest",
  "chestcm",
  "measurement",
  "measurements",
  "heartrate",
  "restingheartrate",
  "bloodpressure",
  "steps",
  "stepcount",
  "sleep",
  "sleephours",
  "calories",
  "kcal",
  "injury",
  "injuries",
  "condition",
  "conditions",
  "medication",
  "medications",
  "symptom",
  "symptoms",
  "diagnosis",
  "glucose",
  "spo2",
]);

const NAME_KEY_DENY = new Set([
  "filename",
  "pathname",
  "hostname",
  "errorname",
  "typename",
  "classname",
  "functionname",
  "operationname",
  "servicename",
]);

/**
 * Free-text and check-in answer keys. `body` is the progress-entry note,
 * `wellbeing` and `fieldAnswers` are the check-in health answers
 * (`packages/contracts` progress and check-in schemas).
 */
const FREE_TEXT_KEYS = new Set(["body", "wellbeing", "fieldanswers"]);

type SentryBreadcrumb = {
  data?: { [key: string]: unknown } | null;
};

export type SentryScrubTarget = {
  request?: {
    url?: string;
    query_string?: unknown;
    cookies?: unknown;
    headers?: Record<string, unknown>;
    data?: unknown;
  };
  extra?: Record<string, unknown> | null;
  contexts?: Record<string, unknown> | null;
  user?: Record<string, unknown> | null;
  breadcrumbs?: SentryBreadcrumb[] | { values?: SentryBreadcrumb[] | null } | null;
};

/** True when this Worker env should send events to Sentry. */
export function isSentryReportingEnabled(env: {
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
}): boolean {
  const dsn = env.SENTRY_DSN?.trim();
  return Boolean(dsn) && REPORTING_ENVIRONMENTS.has(env.SENTRY_ENVIRONMENT ?? "");
}

/**
 * Git SHA from the `SENTRY_RELEASE` var the deploy script may pass.
 * Absent, blank, or non-string values stay unset.
 */
export function sentryRelease(env: object): string | undefined {
  if (!("SENTRY_RELEASE" in env)) return undefined;
  const value = (env as Record<string, unknown>).SENTRY_RELEASE;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function sentryFieldKey(key: string): string {
  return key.replace(/[_-]/g, "").toLowerCase();
}

/** Emails, person names, notes, and health measurements. */
export function isSensitiveSentryKey(key: string): boolean {
  const norm = sentryFieldKey(key);
  if (norm.includes("email")) return true;
  if (norm === "note" || norm === "notes" || norm.endsWith("note") || norm.endsWith("notes")) return true;
  if (HEALTH_KEYS.has(norm) || FREE_TEXT_KEYS.has(norm)) return true;
  if (!NAME_KEY_DENY.has(norm) && (norm === "name" || norm.endsWith("name"))) return true;
  return false;
}

function stripQuery(url: string): string {
  const hash = url.indexOf("#");
  const withoutHash = hash >= 0 ? url.slice(0, hash) : url;
  const query = withoutHash.indexOf("?");
  return query >= 0 ? withoutHash.slice(0, query) : withoutHash;
}

function scrubRecord(value: unknown, depth: number): unknown {
  if (depth > 8 || value == null) return value;
  if (Array.isArray(value)) return value.map((item) => scrubRecord(item, depth + 1));
  if (typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveSentryKey(key)) continue;
    out[key] = scrubRecord(child, depth + 1);
  }
  return out;
}

function isUrlKey(key: string): boolean {
  const norm = sentryFieldKey(key);
  return norm === "url" || norm.endsWith("url");
}

/** Drop query strings and fragments from URL-shaped breadcrumb values. */
function stripUrls(value: unknown, depth: number): unknown {
  if (depth > 8 || value == null) return value;
  if (typeof value === "string" && value.includes("://")) return stripQuery(value);
  if (Array.isArray(value)) return value.map((item) => stripUrls(item, depth + 1));
  if (typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (typeof child === "string" && isUrlKey(key)) out[key] = stripQuery(child);
    else out[key] = stripUrls(child, depth + 1);
  }
  return out;
}

function scrubBreadcrumb<B extends { data?: { [key: string]: unknown } | null }>(breadcrumb: B): B {
  if (breadcrumb.data && typeof breadcrumb.data === "object") {
    const scrubbed = scrubRecord(breadcrumb.data, 0);
    breadcrumb.data = stripUrls(scrubbed, 0) as B["data"];
  }
  return breadcrumb;
}

function scrubBreadcrumbs(breadcrumbs: SentryScrubTarget["breadcrumbs"]): void {
  if (Array.isArray(breadcrumbs)) {
    for (const crumb of breadcrumbs) {
      if (crumb && typeof crumb === "object") scrubBreadcrumb(crumb);
    }
    return;
  }
  if (breadcrumbs && typeof breadcrumbs === "object" && Array.isArray(breadcrumbs.values)) {
    for (const crumb of breadcrumbs.values) {
      if (crumb && typeof crumb === "object") scrubBreadcrumb(crumb);
    }
  }
}

/** Keep an opaque id. Email, username, ip and any other user fields are dropped. */
function scrubUser(user: Record<string, unknown>): Record<string, unknown> {
  const id = user.id;
  if (typeof id === "string" || typeof id === "number") return { id };
  return {};
}

/**
 * Drops request bodies, cookies, `Authorization` and query strings, and removes
 * emails, names, notes and health fields from `extra` and `contexts`.
 * Returns the same event so Sentry still sends the scrubbed error.
 */
export function scrubSentryEvent<T extends SentryScrubTarget>(event: T): T {
  const request = event.request;
  if (request) {
    delete request.data;
    delete request.cookies;
    delete request.query_string;
    if (request.headers) {
      for (const key of Object.keys(request.headers)) {
        if (DROPPED_HEADERS.has(key.toLowerCase())) delete request.headers[key];
      }
    }
    if (typeof request.url === "string") request.url = stripQuery(request.url);
  }
  if (event.extra && typeof event.extra === "object") {
    event.extra = scrubRecord(event.extra, 0) as Record<string, unknown>;
  }
  if (event.contexts && typeof event.contexts === "object") {
    event.contexts = scrubRecord(event.contexts, 0) as Record<string, unknown>;
  }
  if (event.user && typeof event.user === "object") {
    event.user = scrubUser(event.user);
  }
  if (event.breadcrumbs) scrubBreadcrumbs(event.breadcrumbs);
  return event;
}

/**
 * SDK options for one request. No DSN means the client does not send.
 * `enabled: false` is required when reporting is off: `@sentry/cloudflare`
 * fills `dsn` back in from `env.SENTRY_DSN` when our value is undefined, and
 * a disabled client does not send (`enabled !== false` is the gate).
 */
export function sentryOptions(env: Env): CloudflareOptions {
  const enabled = isSentryReportingEnabled(env);
  const dsn = enabled ? env.SENTRY_DSN?.trim() : undefined;
  return {
    dsn,
    enabled,
    environment: env.SENTRY_ENVIRONMENT,
    release: sentryRelease(env),
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event: ErrorEvent) {
      return scrubSentryEvent(event as SentryScrubTarget) as ErrorEvent;
    },
    beforeBreadcrumb(breadcrumb) {
      return scrubBreadcrumb(breadcrumb);
    },
  };
}

/**
 * Wraps a Worker export or the Hono app with `@sentry/cloudflare`'s
 * `withSentry`. Fetch, scheduled and queue are instrumented when present.
 * Passing the Hono app also instruments its `errorHandler`, which is the only
 * way route exceptions (caught inside `fetch`) are reported.
 */
/**
 * Tests call `scheduled` and `queue` with no ExecutionContext. The SDK reads
 * `ctx.waitUntil` immediately, so a missing context gets a no-op one. Production
 * always passes the real context, which is left as-is.
 */
function noopExecutionContext(): ExecutionContext {
  return {
    waitUntil(promise: Promise<unknown>) {
      void promise.catch(() => undefined);
    },
    passThroughOnException() {},
  } as ExecutionContext;
}

function withExecutionContext(handler: ExportedHandler<Env>): ExportedHandler<Env> {
  if (handler.scheduled) {
    const scheduled = handler.scheduled.bind(handler);
    handler.scheduled = (controller, env, ctx) => scheduled(controller, env, ctx ?? noopExecutionContext());
  }
  if (handler.queue) {
    const queue = handler.queue.bind(handler);
    handler.queue = (batch, env, ctx) => queue(batch, env, ctx ?? noopExecutionContext());
  }
  return handler;
}

export function wrapWithSentry<T extends object>(handler: T): T {
  const wrapped = Sentry.withSentry<Env>((env) => sentryOptions(env), handler as ExportedHandler<Env>);
  return withExecutionContext(wrapped) as T;
}
