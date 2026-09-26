import { createMiddleware } from "hono/factory";
import {
  safeRequestPath,
  writeStructuredLog,
  type SafeLogFields,
} from "../lib/log";
import type { Env, Variables } from "../types";

/**
 * Emits one structured access log per request.
 * Never logs bodies, cookies, tokens, or signed URL query strings.
 */
export const requestLogMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  const started = Date.now();
  const path = safeRequestPath(c.req.url);
  const method = c.req.method;

  await next();

  const actor = c.get("actor");
  const status = c.res.status;
  const fields: SafeLogFields = {
    level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
    message: "request.completed",
    requestId: c.get("requestId"),
    operation: `${method} ${path}`,
    method,
    path,
    status,
    latencyMs: Date.now() - started,
    actorType: actor?.selectedRole ?? (actor ? "unknown" : "anonymous"),
    actorUserId: actor?.userId,
    surface: actor?.surface,
    authMethod: actor?.authMethod,
  };
  // Keep vitest output readable — access logs are for Workers observability.
  if (typeof process !== "undefined" && process.env.VITEST) {
    return;
  }
  writeStructuredLog(fields);
});
