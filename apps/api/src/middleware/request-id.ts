import { createMiddleware } from "hono/factory";
import type { Env, Variables } from "../types";

export const requestIdMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  const incoming = c.req.header("x-request-id");
  const requestId =
    incoming && incoming.trim().length > 0 ? incoming.trim() : crypto.randomUUID();
  c.set("requestId", requestId);
  await next();
  c.header("x-request-id", requestId);
});
