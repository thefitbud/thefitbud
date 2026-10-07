import { z } from "zod";
import {
  operation,
  limitParameter,
} from "../openapi/document";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  evaluateRemindersResponseSchema,
  notificationListResponseSchema,
  notificationPreferencesSchema,
  notificationSchema,
  registerDeviceTokenRequestSchema,
  registerDeviceTokenResponseSchema,
  reminderRulesResponseSchema,
  removeDeviceTokenRequestSchema,
  updateNotificationPreferencesRequestSchema,
  updateReminderRulesRequestSchema,
} from "@fitbud/contracts";
import { createDb } from "../db/client";
import {
  coachingRelationships,
  deviceTokens,
  notificationPreferences,
  reminderRules,
} from "../db/schema";
import {
  mapDeviceToken,
  mapNotification,
  mapNotificationPreferences,
  mapReminderRule,
} from "../domain/mappers";
import {
  ensureDefaultReminderRules,
  evaluateAndEnqueueReminders,
  listRecentNotifications,
  markNotificationRead,
  type ReminderQueue,
} from "../domain/reminders";
import { createId, nowIso } from "../lib/crypto";
import { fail, ok } from "../lib/envelope";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth";
import type { ActorContext, Env, Variables } from "../types";
import { canAccessRelationship } from "./relationships";

export const notificationRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

type Db = ReturnType<typeof createDb>;

function reminderQueueFromEnv(env: Env): ReminderQueue | null {
  if (!env.REMINDER_QUEUE) return null;
  return {
    async send(message) {
      await env.REMINDER_QUEUE!.send(message);
    },
  };
}

async function loadAccessibleRelationship(
  db: Db,
  relationshipId: string,
  actor: ActorContext,
) {
  const rows = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.id, relationshipId))
    .limit(1);
  const row = rows[0];
  if (!row || !canAccessRelationship(actor, row)) return null;
  return row;
}

async function ensurePreferences(db: Db, userId: string, now: string) {
  const existing = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0];
  await db.insert(notificationPreferences).values({
    userId,
    pushEnabled: true,
    workoutReminder: true,
    mealReminder: true,
    checkinReminder: true,
    subscriptionRenewalReminder: true,
    quietHoursStart: null,
    quietHoursEnd: null,
    createdAt: now,
    updatedAt: now,
  });
  const created = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  return created[0]!;
}

notificationRoutes.post(
  "/device-tokens",
  operation({
    tag: "Notifications",
    summary: "Notifications operation for POST /notifications/device-tokens.",
    description: "Notifications operation for POST /notifications/device-tokens.",
    roles: ["trainer", "trainee"],
    body: registerDeviceTokenRequestSchema,
    response: registerDeviceTokenResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const parsed = registerDeviceTokenRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid device token request.", {
        issues: parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const now = nowIso();
    const existingByToken = await db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.token, parsed.data.token))
      .limit(1);

    if (existingByToken[0] && existingByToken[0].userId !== actor.userId) {
      return fail(
        c,
        403,
        "DEVICE_TOKEN_OWNED",
        "This device token is registered to another user.",
      );
    }

    if (existingByToken[0]) {
      const row = existingByToken[0];
      await db
        .update(deviceTokens)
        .set({
          platform: parsed.data.platform,
          provider: parsed.data.provider,
          installationId: parsed.data.installationId,
          status: "active",
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(eq(deviceTokens.id, row.id));
      const updated = await db
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.id, row.id))
        .limit(1);
      return ok(
        c,
        registerDeviceTokenResponseSchema.parse({
          deviceToken: mapDeviceToken(updated[0]!),
        }),
      );
    }

    const id = createId();
    await db.insert(deviceTokens).values({
      id,
      userId: actor.userId,
      platform: parsed.data.platform,
      provider: parsed.data.provider,
      token: parsed.data.token,
      installationId: parsed.data.installationId,
      status: "active",
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const created = await db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.id, id))
      .limit(1);
    return ok(
      c,
      registerDeviceTokenResponseSchema.parse({
        deviceToken: mapDeviceToken(created[0]!),
      }),
    );
  },
);

notificationRoutes.delete(
  "/device-tokens",
  operation({
    tag: "Notifications",
    summary: "Notifications operation for DELETE /notifications/device-tokens.",
    description: "Notifications operation for DELETE /notifications/device-tokens.",
    roles: ["trainer", "trainee"],
    body: removeDeviceTokenRequestSchema,
    response: z.object({ revoked: z.number().int().nonnegative() }),
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const parsed = removeDeviceTokenRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid remove token request.", {
        issues: parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const now = nowIso();
    const conditions = [eq(deviceTokens.userId, actor.userId)];
    if (parsed.data.deviceTokenId) {
      conditions.push(eq(deviceTokens.id, parsed.data.deviceTokenId));
    } else if (parsed.data.token) {
      conditions.push(eq(deviceTokens.token, parsed.data.token));
    } else if (parsed.data.installationId) {
      conditions.push(
        eq(deviceTokens.installationId, parsed.data.installationId),
      );
    }

    const rows = await db
      .select()
      .from(deviceTokens)
      .where(and(...conditions));
    if (rows.length === 0) {
      return fail(c, 404, "DEVICE_TOKEN_NOT_FOUND", "Device token not found.");
    }

    for (const row of rows) {
      await db
        .update(deviceTokens)
        .set({ status: "revoked", updatedAt: now })
        .where(eq(deviceTokens.id, row.id));
    }

    return ok(c, { revoked: rows.length });
  },
);

notificationRoutes.get(
  "/preferences",
  operation({
    tag: "Notifications",
    summary: "Notifications operation for GET /notifications/preferences.",
    description: "Notifications operation for GET /notifications/preferences.",
    roles: ["trainer", "trainee"],
    response: notificationPreferencesSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const db = createDb(c.env.DB);
    const row = await ensurePreferences(db, actor.userId, nowIso());
    return ok(
      c,
      notificationPreferencesSchema.parse(mapNotificationPreferences(row)),
    );
  },
);

notificationRoutes.put(
  "/preferences",
  operation({
    tag: "Notifications",
    summary: "Notifications operation for PUT /notifications/preferences.",
    description: "Notifications operation for PUT /notifications/preferences.",
    roles: ["trainer", "trainee"],
    body: updateNotificationPreferencesRequestSchema,
    response: notificationPreferencesSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const parsed = updateNotificationPreferencesRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid preferences request.", {
        issues: parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const now = nowIso();
    const current = await ensurePreferences(db, actor.userId, now);
    await db
      .update(notificationPreferences)
      .set({
        pushEnabled: parsed.data.pushEnabled ?? current.pushEnabled,
        workoutReminder:
          parsed.data.categories?.workoutReminder ?? current.workoutReminder,
        mealReminder:
          parsed.data.categories?.mealReminder ?? current.mealReminder,
        checkinReminder:
          parsed.data.categories?.checkinReminder ?? current.checkinReminder,
        subscriptionRenewalReminder:
          parsed.data.categories?.subscriptionRenewalReminder ??
          current.subscriptionRenewalReminder,
        quietHoursStart:
          parsed.data.quietHoursStart === undefined
            ? current.quietHoursStart
            : parsed.data.quietHoursStart,
        quietHoursEnd:
          parsed.data.quietHoursEnd === undefined
            ? current.quietHoursEnd
            : parsed.data.quietHoursEnd,
        updatedAt: now,
      })
      .where(eq(notificationPreferences.userId, actor.userId));

    const updated = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, actor.userId))
      .limit(1);
    return ok(
      c,
      notificationPreferencesSchema.parse(
        mapNotificationPreferences(updated[0]!),
      ),
    );
  },
);

notificationRoutes.get(
  "/",
  operation({
    tag: "Notifications",
    summary: "Lists recent notifications for the caller",
    description: "Lists recent notifications for the caller. nextCursor is always null.",
    roles: ["trainer", "trainee"],
    parameters: [
      limitParameter({ defaultValue: 20, maximum: 1 }),
    ],
    response: notificationListResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const db = createDb(c.env.DB);
    const limitRaw = Number(c.req.query("limit") ?? "20");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.trunc(limitRaw), 1), 50)
      : 20;
    const rows = await listRecentNotifications(db, actor.userId, limit);
    return ok(
      c,
      notificationListResponseSchema.parse({
        items: rows.map(mapNotification),
        nextCursor: null,
      }),
    );
  },
);

/**
 * Test/local trigger for reminder evaluation (AUTH_MODE=test only).
 * Production evaluation runs via Cron Triggers.
 * Registered before /:notificationId/read so "reminders" is not captured as an id.
 */
notificationRoutes.post(
  "/reminders/evaluate",
  operation({
    tag: "Notifications",
    summary: "Evaluates due reminders and enqueues delivery",
    description: "Evaluates due reminders and enqueues delivery. The handler rejects the call unless AUTH_MODE is test. Scheduled evaluation is not an HTTP route.",
    roles: ["trainer", "trainee"],
    response: evaluateRemindersResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    if (c.env.AUTH_MODE !== "test") {
      return fail(
        c,
        403,
        "FORBIDDEN",
        "Manual reminder evaluation is only available in test mode.",
      );
    }
    const db = createDb(c.env.DB);
    const queue = reminderQueueFromEnv(c.env);
    const result = await evaluateAndEnqueueReminders(db, {
      queue,
      pushProviderMode: c.env.PUSH_PROVIDER_MODE === "fcm" ? "fcm" : "test",
      deliverInline: !queue,
    });
    return ok(c, evaluateRemindersResponseSchema.parse(result));
  },
);

notificationRoutes.post(
  "/:notificationId/read",
  operation({
    tag: "Notifications",
    summary: "Notifications operation for POST /notifications/:notificationId/read.",
    description: "Notifications operation for POST /notifications/:notificationId/read.",
    roles: ["trainer", "trainee"],
    response: notificationSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const db = createDb(c.env.DB);
    const updated = await markNotificationRead(
      db,
      actor.userId,
      c.req.param("notificationId"),
    );
    if (!updated) {
      return fail(c, 404, "NOTIFICATION_NOT_FOUND", "Notification not found.");
    }
    return ok(c, notificationSchema.parse(mapNotification(updated)));
  },
);

notificationRoutes.get(
  "/relationships/:relationshipId/reminder-rules",
  operation({
    tag: "Notifications",
    summary: "Notifications operation for GET /notifications/relationships/:relationshipId/reminder-rules.",
    description: "Notifications operation for GET /notifications/relationships/:relationshipId/reminder-rules.",
    roles: ["trainer", "trainee"],
    response: reminderRulesResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const db = createDb(c.env.DB);
    const relationship = await loadAccessibleRelationship(
      db,
      c.req.param("relationshipId"),
      actor,
    );
    if (!relationship) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }
    await ensureDefaultReminderRules(db, relationship.id);
    const rows = await db
      .select()
      .from(reminderRules)
      .where(eq(reminderRules.coachingRelationshipId, relationship.id));
    return ok(
      c,
      reminderRulesResponseSchema.parse({
        items: rows.map(mapReminderRule),
      }),
    );
  },
);

notificationRoutes.put(
  "/relationships/:relationshipId/reminder-rules",
  operation({
    tag: "Notifications",
    summary: "Notifications operation for PUT /notifications/relationships/:relationshipId/reminder-rules.",
    description: "Notifications operation for PUT /notifications/relationships/:relationshipId/reminder-rules.",
    roles: ["trainer", "trainee"],
    body: updateReminderRulesRequestSchema,
    response: reminderRulesResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const parsed = updateReminderRulesRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid reminder rules request.", {
        issues: parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const relationship = await loadAccessibleRelationship(
      db,
      c.req.param("relationshipId"),
      actor,
    );
    if (!relationship) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    const now = nowIso();
    await ensureDefaultReminderRules(db, relationship.id, now);
    for (const rule of parsed.data.rules) {
      await db
        .update(reminderRules)
        .set({ enabled: rule.enabled, updatedAt: now })
        .where(
          and(
            eq(reminderRules.coachingRelationshipId, relationship.id),
            eq(reminderRules.reminderType, rule.reminderType),
          ),
        );
    }

    const rows = await db
      .select()
      .from(reminderRules)
      .where(eq(reminderRules.coachingRelationshipId, relationship.id));
    return ok(
      c,
      reminderRulesResponseSchema.parse({
        items: rows.map(mapReminderRule),
      }),
    );
  },
);
