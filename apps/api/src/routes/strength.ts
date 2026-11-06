import { Hono } from "hono";
import { strengthQuerySchema, strengthReadModelSchema } from "@fitbud/contracts";
import { createDb } from "../db/client.js";
import {
  buildStrengthReadModel,
  loadStrengthRawData,
  localDateIn,
  resolveStrengthWindow,
} from "../domain/strength-read-model.js";
import { fail, ok } from "../lib/envelope.js";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth.js";
import { operation } from "../openapi/document.js";
import type { Env, Variables } from "../types.js";

// W6 Z6-5: strength read model for the trainer's Progress > Workouts view.
export const strengthRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

strengthRoutes.get(
  "/relationships/:relationshipId",
  operation({
    tag: "Strength",
    summary: "Top set per exercise, workouts per week and uncharted sets for a client.",
    description:
      "Readable by the relationship's trainer or trainee, including after the relationship has ended. Dates are the trainee's local dates.",
    roles: ["trainer", "trainee"],
    parameters: [
      {
        name: "range",
        in: "query",
        description: "4w, 12w (default) or all. Ignored when from or to is given.",
        schema: { type: "string", enum: ["4w", "12w", "all"] },
      },
      {
        name: "from",
        in: "query",
        description: "First trainee-local date, YYYY-MM-DD.",
        schema: { type: "string" },
      },
      {
        name: "to",
        in: "query",
        description: "Last trainee-local date, YYYY-MM-DD.",
        schema: { type: "string" },
      },
    ],
    response: strengthReadModelSchema,
    errors: [
      { status: 400, description: "The range or dates are invalid." },
      { status: 403, description: "The relationship belongs to someone else." },
      { status: 404, description: "The relationship does not exist." },
    ],
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const parsed = strengthQuerySchema.safeParse({
      range: c.req.query("range") || undefined,
      from: c.req.query("from") || undefined,
      to: c.req.query("to") || undefined,
    });
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid strength filter.", {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path,
          code: issue.code,
        })),
      });
    }

    const now = new Date();
    const raw = await loadStrengthRawData(
      createDb(c.env.DB),
      c.req.param("relationshipId"),
      parsed.data,
      now,
    );
    const relationship = raw.relationship;
    if (!relationship) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }
    const owns =
      actor.selectedRole === "trainer"
        ? relationship.trainerUserId === actor.userId
        : relationship.traineeUserId === actor.userId;
    if (!owns) {
      return fail(c, 403, "FORBIDDEN", "You cannot view this client's strength data.");
    }

    const localToday = localDateIn(relationship.traineeTimezone, now);
    const window = resolveStrengthWindow(parsed.data, localToday);
    return ok(c, buildStrengthReadModel(raw, window, localToday));
  },
);
