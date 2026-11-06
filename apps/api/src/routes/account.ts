import { Hono } from "hono";
import { fail } from "../lib/envelope.js";
import type { Env, Variables } from "../types.js";

// W6 Z6-14: scaffold from Z5-4. Every path answers 404 not_implemented until the task replaces this router.
export const accountRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

accountRoutes.all("*", (c) => fail(c, 404, "not_implemented", "This endpoint is not available yet."));
