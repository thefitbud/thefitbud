import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  saveSubscriptionRequestSchema,
  subscriptionAttentionResponseSchema,
  subscriptionSchema,
  type RenewalState,
  type SubscriptionAttentionItem,
} from "@fitbud/contracts";
import { deriveRenewalState, formatLocalDate } from "@fitbud/core";
import { createDb, type Db } from "../db/client";
import {
  coachingRelationships,
  subscriptionVersions,
  users,
} from "../db/schema";
import { addDaysIso, createId, nowIso, sha256Hex } from "../lib/crypto";
import { fail, ok } from "../lib/envelope";
import {
  findIdempotencyRecord,
  saveIdempotencyRecord,
} from "../lib/idempotency";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth";
import type { Env, Variables } from "../types";

const SAVE_OPERATION = "subscription.save";

export const subscriptionRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

type SubscriptionRow = typeof subscriptionVersions.$inferSelect;

async function latestSubscription(db: Db, relationshipId: string) {
  const rows = await db
    .select()
    .from(subscriptionVersions)
    .where(eq(subscriptionVersions.coachingRelationshipId, relationshipId))
    .orderBy(desc(subscriptionVersions.versionNumber))
    .limit(1);
  return rows[0] ?? null;
}

async function trainerToday(db: Db, trainerUserId: string, now = nowIso()) {
  const rows = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, trainerUserId))
    .limit(1);
  const timezone = rows[0]?.timezone ?? "UTC";
  return formatLocalDate(new Date(now), timezone);
}

function presentSubscription(
  row: SubscriptionRow,
  renewalState: RenewalState,
) {
  return subscriptionSchema.parse({
    id: row.id,
    coachingRelationshipId: row.coachingRelationshipId,
    versionNumber: row.versionNumber,
    planName: row.planName,
    paymentFrequency: row.paymentFrequency,
    startsOn: row.startsOn,
    renewsOn: row.renewsOn,
    renewalState,
    createdAt: row.createdAt,
  });
}

subscriptionRoutes.get(
  "/:relationshipId/subscription",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const relationshipId = c.req.param("relationshipId");
    const db = createDb(c.env.DB);
    const relationships = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, relationshipId))
      .limit(1);
    const relationship = relationships[0];
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Coaching relationship not found.");
    }
    const current = await latestSubscription(db, relationshipId);
    if (!current) {
      return fail(c, 404, "SUBSCRIPTION_NOT_FOUND", "Subscription not found.");
    }
    const today = await trainerToday(db, relationship.trainerUserId);
    return ok(
      c,
      presentSubscription(
        current,
        deriveRenewalState({ today, renewsOn: current.renewsOn }),
      ),
    );
  },
);

subscriptionRoutes.put(
  "/:relationshipId/subscription",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const parsed = saveSubscriptionRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid subscription request.", {
        issues: parsed.error.issues,
      });
    }
    const idempotencyKey = c.req.header("idempotency-key")?.trim();
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required to save a subscription.",
      );
    }

    const relationshipId = c.req.param("relationshipId");
    const fingerprint = await sha256Hex(
      JSON.stringify({ relationshipId, ...parsed.data }),
    );
    const db = createDb(c.env.DB);
    const existingIdempotency = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: SAVE_OPERATION,
      idempotencyKey,
    });
    if (existingIdempotency) {
      if (existingIdempotency.requestFingerprint !== fingerprint) {
        return fail(
          c,
          409,
          "IDEMPOTENCY_KEY_REUSE",
          "Idempotency key was reused with a different request payload.",
        );
      }
      return c.json(
        JSON.parse(existingIdempotency.responseBody),
        existingIdempotency.responseStatus as 200,
      );
    }

    const relationships = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, relationshipId))
      .limit(1);
    const relationship = relationships[0];
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Coaching relationship not found.");
    }
    if (relationship.status === "ended") {
      return fail(
        c,
        409,
        "RELATIONSHIP_ENDED",
        "Ended relationships cannot change subscription.",
      );
    }

    const current = await latestSubscription(db, relationshipId);
    const currentVersion = current?.versionNumber ?? 0;
    if (currentVersion !== parsed.data.expectedVersion) {
      return fail(
        c,
        409,
        "SUBSCRIPTION_VERSION_CONFLICT",
        "Subscription was changed after this version was loaded.",
        {
          expectedVersion: parsed.data.expectedVersion,
          currentVersion,
        },
      );
    }

    const timestamp = nowIso();
    const id = createId();
    await db.insert(subscriptionVersions).values({
      id,
      coachingRelationshipId: relationshipId,
      versionNumber: currentVersion + 1,
      planName: parsed.data.planName,
      paymentFrequency: parsed.data.paymentFrequency,
      startsOn: parsed.data.startsOn,
      renewsOn: parsed.data.renewsOn,
      createdAt: timestamp,
    });
    const created = (
      await db
        .select()
        .from(subscriptionVersions)
        .where(eq(subscriptionVersions.id, id))
        .limit(1)
    )[0]!;
    const today = await trainerToday(db, relationship.trainerUserId, timestamp);
    const data = presentSubscription(
      created,
      deriveRenewalState({ today, renewsOn: created.renewsOn }),
    );
    const responseBody = { data };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: SAVE_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: current ? 200 : 201,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return ok(c, data, current ? 200 : 201);
  },
);

export const subscriptionAttentionRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

subscriptionAttentionRoutes.get(
  "/attention",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const db = createDb(c.env.DB);
    const relationships = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.trainerUserId, actor.userId));
    const today = await trainerToday(db, actor.userId);
    const items: SubscriptionAttentionItem[] = [];
    for (const relationship of relationships) {
      if (relationship.status === "ended") continue;
      const current = await latestSubscription(db, relationship.id);
      if (!current) continue;
      const renewalState = deriveRenewalState({
        today,
        renewsOn: current.renewsOn,
      });
      if (renewalState === "current") continue;
      items.push({
        coachingRelationshipId: relationship.id,
        traineeUserId: relationship.traineeUserId,
        planName: current.planName,
        paymentFrequency: current.paymentFrequency,
        renewsOn: current.renewsOn,
        renewalState,
        versionNumber: current.versionNumber,
      });
    }
    items.sort((left, right) => left.renewsOn.localeCompare(right.renewsOn));
    return ok(c, subscriptionAttentionResponseSchema.parse({ items }));
  },
);
