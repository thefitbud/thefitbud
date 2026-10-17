import { configResponseSchema } from "@fitbud/contracts";
import { Hono } from "hono";
import { getFlags } from "../config/flags";
import { createDb } from "../db/client";
import { ok } from "../lib/envelope";
import { operation } from "../openapi/document";
import type { Env, Variables } from "../types";

export const configRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

configRoutes.get(
  "/",
  operation({
    tag: "Config",
    summary: "Public feature flags and support contact",
    description: "Cacheable public configuration for clients.",
    security: "public",
    response: configResponseSchema,
  }),
  async (c) => {
    const db = createDb(c.env.DB);
    const flags = await getFlags(c.env, db);
    const body = configResponseSchema.parse({
      flags,
      supportEmail: c.env.SUPPORT_EMAIL ?? "tech@thefitbud.com",
    });
    c.header("Cache-Control", "public, max-age=3600");
    return ok(c, body);
  },
);
