import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { linkKindSchema, linkResolveResponseSchema } from "@fitbud/contracts";
import { routeForLinkKind } from "@fitbud/core";
import { createDb } from "../db/client.js";
import {
  checkins,
  coachAsks,
  coachingRelationships,
  exceptions,
  mealAssignments,
  trainerNotes,
  workoutAssignments,
} from "../db/schema.js";
import { fail, ok } from "../lib/envelope.js";
import { operation } from "../openapi/document.js";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
} from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const linkRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

linkRoutes.get(
  "/resolve",
  operation({
    tag: "Links",
    summary: "Resolve deep link",
    description: "Maps a domain id to an in-app route for the current actor.",
    response: linkResolveResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const kind = linkKindSchema.safeParse(c.req.query("kind"));
    const id = c.req.query("id")?.trim();
    if (!kind.success || !id) {
      return fail(c, 400, "INVALID_REQUEST", "kind and id are required.");
    }
    const db = createDb(c.env.DB);
    const role = actor.selectedRole;
    let available = false;
    let reason: "not_found" | "not_yours" | "ended" | undefined;
    switch (kind.data) {
      case "client":
      case "reactivate": {
        const [rel] = await db
          .select()
          .from(coachingRelationships)
          .where(eq(coachingRelationships.id, id))
          .limit(1);
        if (!rel) {
          reason = "not_found";
          break;
        }
        const owns =
          role === "trainer"
            ? rel.trainerUserId === actor.userId
            : rel.traineeUserId === actor.userId;
        if (!owns) {
          reason = "not_yours";
          break;
        }
        if (rel.status === "ended" && kind.data !== "reactivate") {
          reason = "ended";
          break;
        }
        available = true;
        break;
      }
      case "exception": {
        const [row] = await db.select().from(exceptions).where(eq(exceptions.id, id)).limit(1);
        if (!row) {
          reason = "not_found";
          break;
        }
        available = await canAccessRel(db, row.coachingRelationshipId, actor.userId, role);
        if (!available) reason = "not_yours";
        break;
      }
      case "ask": {
        const [row] = await db.select().from(coachAsks).where(eq(coachAsks.id, id)).limit(1);
        if (!row) {
          reason = "not_found";
          break;
        }
        available = await canAccessRel(db, row.relationshipId, actor.userId, role);
        if (!available) reason = "not_yours";
        break;
      }
      case "note": {
        const [row] = await db
          .select({ note: trainerNotes, rel: coachingRelationships })
          .from(trainerNotes)
          .innerJoin(
            coachingRelationships,
            eq(trainerNotes.coachingRelationshipId, coachingRelationships.id),
          )
          .where(eq(trainerNotes.id, id))
          .limit(1);
        if (!row || row.note.visibility !== "client") {
          reason = "not_found";
          break;
        }
        available = row.rel.traineeUserId === actor.userId;
        if (!available) reason = "not_yours";
        break;
      }
      case "meal": {
        const [row] = await db
          .select()
          .from(mealAssignments)
          .where(eq(mealAssignments.id, id))
          .limit(1);
        if (!row) {
          reason = "not_found";
          break;
        }
        available = await canAccessRel(db, row.coachingRelationshipId, actor.userId, role);
        if (!available) reason = "not_yours";
        break;
      }
      case "workout": {
        const [row] = await db
          .select()
          .from(workoutAssignments)
          .where(eq(workoutAssignments.id, id))
          .limit(1);
        if (!row) {
          reason = "not_found";
          break;
        }
        available = await canAccessRel(db, row.coachingRelationshipId, actor.userId, role);
        if (!available) reason = "not_yours";
        break;
      }
      case "checkin": {
        const [row] = await db.select().from(checkins).where(eq(checkins.id, id)).limit(1);
        if (!row) {
          reason = "not_found";
          break;
        }
        available = await canAccessRel(db, row.coachingRelationshipId, actor.userId, role);
        if (!available) reason = "not_yours";
        break;
      }
      default:
        available = true;
    }
    const route = routeForLinkKind(kind.data, id);
    return ok(
      c,
      linkResolveResponseSchema.parse({
        role,
        route,
        available,
        reason: available ? undefined : reason ?? "not_found",
      }),
    );
  },
);

async function canAccessRel(
  db: ReturnType<typeof createDb>,
  relationshipId: string,
  userId: string,
  role: "trainer" | "trainee",
): Promise<boolean> {
  const [rel] = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.id, relationshipId))
    .limit(1);
  if (!rel) return false;
  return role === "trainer"
    ? rel.trainerUserId === userId
    : rel.traineeUserId === userId;
}
