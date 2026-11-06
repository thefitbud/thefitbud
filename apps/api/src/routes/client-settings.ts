import { Hono } from "hono";
import { fail } from "../lib/envelope.js";
import type { Env, Variables } from "../types.js";

// W6 Z6-8: scaffold from Z5-4. Every path answers 404 not_implemented until the task replaces this router.
export const clientSettingsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

clientSettingsRoutes.all("*", (c) => fail(c, 404, "not_implemented", "This endpoint is not available yet."));
