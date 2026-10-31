import { createMiddleware } from "hono/factory";
import { fail } from "../lib/envelope";
import { writeStructuredLog, type SafeLogFields } from "../lib/log";
import type { Env, Variables } from "../types";

/**
 * Refuses to serve when a deployed environment (staging or production) runs a
 * local test double (test auth, the test push provider, the dev email sink) or a
 * mode this build does not implement yet (e.g. a provider wrangler.toml already
 * names ahead of the task that adds it). Unset modes count as their local
 * defaults (wrangler envs do not inherit the top-level [vars]). `local`,
 * `preview` and an unset ENVIRONMENT are not guarded.
 */

const GUARDED_ENVIRONMENTS = new Set(["staging", "production"]);

/** Non-test modes this build implements. Extend when a provider task lands (X4a, I5). */
const DEPLOYABLE_PUSH_MODES: ReadonlySet<string> = new Set<NonNullable<Env["PUSH_PROVIDER_MODE"]>>(["fcm"]);
const DEPLOYABLE_EMAIL_PROVIDERS: ReadonlySet<string> = new Set<NonNullable<Env["EMAIL_PROVIDER"]>>([
  "disabled",
  "resend",
  "ses",
]);

let misconfigurationLogged = false;

/** Offending settings as `NAME=mode` (mode names only, never secret values). */
export function runtimeMisconfigurations(env: Env): string[] {
  if (!env.ENVIRONMENT || !GUARDED_ENVIRONMENTS.has(env.ENVIRONMENT)) {
    return [];
  }
  const problems: string[] = [];
  if (env.AUTH_MODE !== "firebase") {
    problems.push(`AUTH_MODE=${env.AUTH_MODE ?? "unset"}`);
  }
  if (!env.PUSH_PROVIDER_MODE || !DEPLOYABLE_PUSH_MODES.has(env.PUSH_PROVIDER_MODE)) {
    problems.push(`PUSH_PROVIDER_MODE=${env.PUSH_PROVIDER_MODE ?? "unset"}`);
  }
  if (!env.EMAIL_PROVIDER || !DEPLOYABLE_EMAIL_PROVIDERS.has(env.EMAIL_PROVIDER)) {
    problems.push(`EMAIL_PROVIDER=${env.EMAIL_PROVIDER ?? "unset"}`);
  }
  return problems;
}

export const runtimeGuardMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  const problems = runtimeMisconfigurations(c.env);
  if (problems.length === 0) {
    await next();
    return;
  }
  if (!misconfigurationLogged) {
    misconfigurationLogged = true;
    const fields: SafeLogFields & { environment: string; misconfigured: string[] } = {
      level: "error",
      message: "RUNTIME_MISCONFIGURED",
      errorCode: "RUNTIME_MISCONFIGURED",
      requestId: c.get("requestId"),
      environment: c.env.ENVIRONMENT ?? "unset",
      misconfigured: problems,
    };
    writeStructuredLog(fields);
  }
  return fail(
    c,
    500,
    "RUNTIME_MISCONFIGURED",
    "This environment is misconfigured and cannot serve requests.",
  );
});

/** Tests only: allow the once-per-isolate log to fire again. */
export function resetRuntimeGuardLogForTests(): void {
  misconfigurationLogged = false;
}
