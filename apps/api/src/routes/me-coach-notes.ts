import { and, desc, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createDb } from "../db/client.js";
import { coachingRelationships, trainerNotes } from "../db/schema.js";
import { nowIso } from "../lib/crypto.js";
import { fail, ok } from "../lib/envelope.js";
import { operation } from "../openapi/document.js";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

const coachNoteSchema = z.object({
  id: z.string().uuid(),
  body: z.string(),
  sharedAt: z.string().nullable(),
  seenAt: z.string().nullable(),
  createdAt: z.string(),
});

export const meCoachNoteRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

meCoachNoteRoutes.get(
  "/",
  operation({
    tag: "CoachNotes",
    summary: "Client-visible coach notes",
    description: "Trainee reads shared trainer notes.",
    roles: ["trainee"],
    response: z.object({ items: z.array(coachNoteSchema) }),
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const since = c.req.query("since")?.trim();
    const db = createDb(c.env.DB);
    const rows = await db
      .select({ note: trainerNotes })
      .from(trainerNotes)
      .innerJoin(
        coachingRelationships,
        eq(trainerNotes.coachingRelationshipId, coachingRelationships.id),
      )
      .where(
        and(
          eq(coachingRelationships.traineeUserId, actor.userId),
          eq(trainerNotes.visibility, "client"),
          since ? gt(trainerNotes.sharedAt, since) : undefined,
        ),
      )
      .orderBy(desc(trainerNotes.sharedAt));
    return ok(c, {
      items: rows.map(({ note: row }) => ({
        id: row.id,
        body: row.body,
        sharedAt: row.sharedAt,
        seenAt: row.seenAt,
        createdAt: row.createdAt,
      })),
    });
  },
);

meCoachNoteRoutes.post(
  "/:noteId/seen",
  operation({
    tag: "CoachNotes",
    summary: "Mark coach note seen",
    description: "Sets seen_at on a shared coach note.",
    roles: ["trainee"],
    response: z.object({ seenAt: z.string() }),
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const noteId = c.req.param("noteId");
    const db = createDb(c.env.DB);
    const [row] = await db
      .select({ note: trainerNotes })
      .from(trainerNotes)
      .innerJoin(
        coachingRelationships,
        eq(trainerNotes.coachingRelationshipId, coachingRelationships.id),
      )
      .where(
        and(
          eq(trainerNotes.id, noteId),
          eq(coachingRelationships.traineeUserId, actor.userId),
          eq(trainerNotes.visibility, "client"),
        ),
      )
      .limit(1);
    const note = row?.note;
    if (!note) {
      return fail(c, 404, "NOTE_NOT_FOUND", "Note not found.");
    }
    const seenAt = nowIso();
    await db.update(trainerNotes).set({ seenAt }).where(eq(trainerNotes.id, noteId));
    return ok(c, { seenAt });
  },
);
