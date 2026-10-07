import { z } from "zod";
import { Hono } from "hono";
import {
  adherenceStateSchema,
  clientDirectoryListResponseSchema,
  onboardingStatusSchema,
} from "@fitbud/contracts";
import { createDb } from "../db/client";
import { loadClientDirectory } from "../domain/directory";
import { nowIso } from "../lib/crypto";
import { decodeCursor } from "../lib/cursor";
import { fail, ok } from "../lib/envelope";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth";
import { cursorParameter, limitParameter, operation } from "../openapi/document";
import type { Env, Variables } from "../types";

export const clientRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

const repeatable = <T extends z.ZodTypeAny>(schema: T) =>
  z.array(schema).optional();

clientRoutes.get(
  "/",
  operation({
    tag: "Clients",
    summary: "Lists the trainer's clients and pending invitations.",
    description:
      "Trainer-only directory. Pending invitations are included. Accepted, expired, and revoked invitations are not separate rows. Filters run before paging. This read does not publish plans.",
    roles: ["trainer"],
    parameters: [
      {
        name: "q",
        in: "query",
        required: false,
        description: "Case-insensitive display name or email search.",
        schema: { type: "string" },
      },
      {
        name: "status",
        in: "query",
        required: false,
        description:
          "Repeatable derived client lifecycle filter. Repeat the parameter to match any listed status.",
        schema: {
          type: "string",
          enum: [
            "invited",
            "onboarding_pending",
            "onboarding_submitted",
            "coaching_ready",
            "active",
            "ended",
          ],
        },
      },
      {
        name: "adherenceState",
        in: "query",
        required: false,
        description:
          "Repeatable adherence filter. Repeat the parameter to match any listed state.",
        schema: {
          type: "string",
          enum: [
            "on_track",
            "needs_attention",
            "no_recent_data",
            "not_available",
          ],
        },
      },
      {
        name: "goal",
        in: "query",
        required: false,
        description:
          "Repeatable exact match against the active configuration short goal.",
        schema: { type: "string" },
      },
      limitParameter({ defaultValue: 30, maximum: 50 }),
      cursorParameter(),
    ],
    response: clientDirectoryListResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const statusParsed = repeatable(onboardingStatusSchema).safeParse(
      c.req.queries("status"),
    );
    const adherenceParsed = repeatable(adherenceStateSchema).safeParse(
      c.req.queries("adherenceState"),
    );
    const goalParsed = repeatable(z.string().trim().min(1).max(120)).safeParse(
      c.req.queries("goal"),
    );
    if (!statusParsed.success || !adherenceParsed.success || !goalParsed.success) {
      return fail(
        c,
        400,
        "INVALID_REQUEST",
        "Invalid client directory filter.",
      );
    }

    const q = c.req.query("q")?.trim();
    const limitParam = c.req.query("limit");
    const limit = Math.min(
      Math.max(Number.parseInt(limitParam ?? "30", 10) || 30, 1),
      50,
    );
    const cursorParam = c.req.query("cursor");
    const cursor = cursorParam ? decodeCursor(cursorParam) : null;
    if (cursorParam && !cursor) {
      return fail(c, 400, "INVALID_CURSOR", "Cursor is not valid.");
    }

    const db = createDb(c.env.DB);
    const page = await loadClientDirectory(db, {
      trainerUserId: actor.userId,
      nowIso: nowIso(),
      q: q || undefined,
      status: statusParsed.data,
      adherenceState: adherenceParsed.data,
      goal: goalParsed.data,
      cursor,
      limit,
    });
    return ok(c, page);
  },
);
