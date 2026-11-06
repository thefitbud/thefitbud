/**
 * Network layer of the staging API smoke suite (QT6).
 *
 * Everything the suite sends goes through `SmokeHttp.fetch`, which
 *   - re-applies the host guard to every request URL (`host-guard.ts`),
 *   - refuses redirects (a redirect could leave the allowed origin),
 *   - times out instead of hanging a nightly run, and
 *   - never logs headers, bodies or tokens.
 *
 * Calls are raw `fetch` plus the shared contract schema (`dataOf`). The spec prefers
 * `@fitbud/api-client` where it covers a call, but `@fitbud/api` does not declare it
 * as a dependency and `apps/api/package.json` is outside this task's `files_owned`
 * (BT2 owns it), so it cannot be imported from here.
 */
import { apiErrorBodySchema } from "@fitbud/contracts";
import type { z } from "zod";
import { guardRequestUrl, type GuardedTarget } from "./host-guard.js";

export const REQUEST_TIMEOUT_MS = 30_000;

export type RawResponse = {
  status: number;
  headers: Headers;
  json: unknown;
};

export type RequestOptions = {
  token?: string;
  /** Sent as `x-fitbud-role`, like the real clients. */
  role?: "trainer" | "trainee";
  body?: unknown;
  idempotencyKey?: string;
  cookie?: string;
};

export class SmokeHttp {
  constructor(
    readonly target: GuardedTarget,
    private readonly inner: typeof fetch = (input, init) => globalThis.fetch(input, init),
  ) {}

  /** Guarded `fetch`, used by `request`. */
  readonly fetch: typeof fetch = async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = guardRequestUrl(raw, this.target);
    return this.inner(url.href, {
      ...init,
      redirect: "error",
      signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  };

  /** Builds the headers of one request. Pure, so a unit test can assert it. */
  static headers(options: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.role) headers["x-fitbud-role"] = options.role;
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
    if (options.cookie) headers.Cookie = options.cookie;
    return headers;
  }

  async request(method: string, path: string, options: RequestOptions = {}): Promise<RawResponse> {
    if (!path.startsWith("/") || path.startsWith("//")) {
      throw new Error("Request paths must start with a single '/'.");
    }
    const response = await this.fetch(`${this.target.baseUrl}${path}`, {
      method,
      headers: SmokeHttp.headers(options),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const json: unknown = await response.json().catch(() => null);
    return { status: response.status, headers: response.headers, json };
  }
}

/** Parses a `{ data }` success envelope with a contract schema; checks the status first. */
export function dataOf<S extends z.ZodTypeAny>(
  response: RawResponse,
  schema: S,
  expectedStatus = 200,
): z.infer<S> {
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected HTTP ${expectedStatus} but got ${response.status}${describeError(response)}`,
    );
  }
  const envelope = response.json as { data?: unknown } | null;
  return schema.parse(envelope?.data);
}

/** Parses the one error body shape (`apiErrorBodySchema`) and returns code and status. */
export function errorOf(response: RawResponse): { status: number; code: string } {
  const parsed = apiErrorBodySchema.parse(response.json);
  return { status: response.status, code: parsed.error.code };
}

/** ` (CODE)` when the body is a valid error body, else empty. Never includes the message or body. */
function describeError(response: RawResponse): string {
  const parsed = apiErrorBodySchema.safeParse(response.json);
  return parsed.success ? ` (${parsed.data.error.code})` : "";
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/**
 * The `Cookie` request header that replays a response's `Set-Cookie` values. Node's
 * `Headers` has `getSetCookie`; the Workers lib types, which this package compiles
 * against, do not declare it.
 */
export function cookieHeaderFrom(headers: Headers): string {
  const withSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  return (withSetCookie.getSetCookie?.() ?? [])
    .map((value) => value.split(";")[0] ?? "")
    .filter((value) => value !== "")
    .join("; ");
}
