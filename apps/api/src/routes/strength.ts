import { Hono } from "hono";
import { fail } from "../lib/envelope.js";
import type { Env, Variables } from "../types.js";

// W6 Z6-5: scaffold from Z5-4. Every path answers 404 not_implemented until the task replaces this router.
export const strengthRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

strengthRoutes.all("*", (c) => fail(c, 404, "not_implemented", "This endpoint is not available yet."));
