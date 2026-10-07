import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env, Variables } from "../types";

export type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

export function ok<T>(c: AppContext, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ data }, status);
}

export function fail(
  c: AppContext,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return c.json(
    {
      error: {
        code,
        message,
        requestId: c.get("requestId"),
        ...(details ? { details } : {}),
      },
    },
    status,
  );
}
