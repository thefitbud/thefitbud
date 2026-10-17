import { Hono } from "hono";
import {
  stepsSettingsResponseSchema,
  updateStepsSettingsRequestSchema,
} from "@fitbud/contracts";
import { getFlags } from "../config/flags.js";
import { createDb } from "../db/client.js";
import { fail, ok } from "../lib/envelope.js";
import { operation } from "../openapi/document.js";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const meStepRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

async function stepsDisabledResponse(c: Parameters<typeof ok>[0]) {
  return ok(
    c,
    stepsSettingsResponseSchema.parse({
      enabled: false,
      dailyGoal: null,
      source: null,
    }),
  );
}

meStepRoutes.get(
  "/",
  operation({
    tag: "Trainee",
    summary: "Steps settings",
    description: "Returns disabled stub while steps_enabled is false.",
    roles: ["trainee"],
    response: stepsSettingsResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const db = createDb(c.env.DB);
    const flags = await getFlags(c.env, db);
    if (!flags.steps_enabled) {
      return stepsDisabledResponse(c);
    }
    return ok(
      c,
      stepsSettingsResponseSchema.parse({
        enabled: true,
        dailyGoal: null,
        source: null,
      }),
    );
  },
);

meStepRoutes.put(
  "/",
  operation({
    tag: "Trainee",
    summary: "Update steps settings",
    description: "Rejected while steps_enabled is false.",
    roles: ["trainee"],
    body: updateStepsSettingsRequestSchema,
    response: stepsSettingsResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const parsed = updateStepsSettingsRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid steps settings.");
    }
    const db = createDb(c.env.DB);
    const flags = await getFlags(c.env, db);
    if (!flags.steps_enabled) {
      return fail(
        c,
        403,
        "FEATURE_DISABLED",
        "Steps tracking is not enabled.",
      );
    }
    return ok(
      c,
      stepsSettingsResponseSchema.parse({
        enabled: true,
        dailyGoal: parsed.data.dailyGoal ?? null,
        source: parsed.data.source ?? null,
      }),
    );
  },
);
