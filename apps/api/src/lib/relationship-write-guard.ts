import type { Context } from "hono";
import type { Db } from "../db/client.js";
import {
  RelationshipEndedError,
  assertRelationshipWritable,
} from "../domain/relationship-lifecycle.js";
import { coachingRelationships } from "../db/schema.js";
import { fail } from "./envelope.js";
import type { Env, Variables } from "../types.js";

export type WritableGuardResult =
  | { ok: true; relationship: typeof coachingRelationships.$inferSelect }
  | { ok: false; response: Response };

export async function requireWritableRelationship(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  db: Db,
  relationshipId: string,
): Promise<WritableGuardResult> {
  try {
    const relationship = await assertRelationshipWritable(db, relationshipId);
    return { ok: true, relationship };
  } catch (error) {
    if (error instanceof RelationshipEndedError) {
      return {
        ok: false,
        response: fail(
          c,
          409,
          "RELATIONSHIP_ENDED",
          "Coaching relationship has ended.",
        ),
      };
    }
    if (error instanceof Error && error.message === "RELATIONSHIP_NOT_FOUND") {
      return {
        ok: false,
        response: fail(
          c,
          404,
          "RELATIONSHIP_NOT_FOUND",
          "Coaching relationship not found.",
        ),
      };
    }
    throw error;
  }
}
