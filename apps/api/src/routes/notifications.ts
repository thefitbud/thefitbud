import { z } from "zod";
import {
  operation,
  limitParameter,
} from "../openapi/document";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  evaluateRemindersRequestSchema,
  evaluateRemindersResponseSchema,
  notificationListResponseSchema,
  notificationPreferencesSchema,
  notificationSchema,
  nudgeActivityRequestSchema,
  nudgeActivityResponseSchema,
  reengagementCandidatesResponseSchema,
  responsivenessResponseSchema,
  registerDeviceTokenRequestSchema,
  registerDeviceTokenResponseSchema,
  reminderRulesResponseSchema,
  reminderStatusSchema,
  removeDeviceTokenRequestSchema,
  updateNotificationPreferencesRequestSchema,
  updateReminderRulesRequestSchema,
} from "@fitbud/contracts";
import { createDb } from "../db/client";
import { getFlags } from "../config/flags.js";
import {
  coachingRelationships,
  deviceTokens,
  notificationPreferences,
  reminderRules,
  reminderStates,
  users,
} from "../db/schema";
import {
  mapNotification,
  mapNotificationPreferences,
  mapReminderRule,
} from "../domain/mappers";
import { presentNotifications } from "../domain/notification-client-names.js";
import {
  parseTrainerCategoriesJson,
  serializeTrainerCategories,
} from "../domain/trainer-categories.js";
import {
  createActivityNudge,
  ensureDefaultReminderRules,
  evaluateAndEnqueueReminders,
  listRecentNotifications,
  markNotificationRead,
  nudgeBodyHasLink,
  nudgeDisplayCopy,
  type ReminderQueue,
} from "../domain/reminders";
import { deriveReminderStatus } from "../domain/reminder-status.js";
import { createId, nowIso } from "../lib/crypto";
import { fail, ok } from "../lib/envelope";
import { resolvePushProviderMode } from "../lib/push-provider.js";
import { requireWritableRelationship } from "../lib/relationship-write-guard.js";
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

/**
 * Adds a nudge's stored title and body (Z12-50) to its presented row, so the
 * trainee's inbox shows the same text the push carried. Other rows unchanged.
 */
function withNudgeCopy<T extends object>(
  presented: T,
  row: Parameters<typeof nudgeDisplayCopy>[0],
): T | (T & { title: string; body: string }) {
  const copy = nudgeDisplayCopy(row);
  return copy ? { ...presented, ...copy } : presented;
}

/**
 * Device-token row → contract shape. Local to these routes because the shared
 * `mapDeviceToken` in `domain/mappers.ts` still types `provider` as `"fcm"`
 * only and that file is outside X4b's `files_owned` (D-W3-2 added `"expo"`).
 */
function mapDeviceTokenRow(row: typeof deviceTokens.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    platform: row.platform,
    provider: row.provider,
    status: row.status,
    token: row.token,
    installationId: row.installationId,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

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
    dailySummaryReminder: true,
    channelPreference: "app",
    trainerCategoriesJson: "[]",
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

/**
 * Sentinel value that frees a unique index on `device_tokens` without deleting
 * the row. X4b parks a superseded `installationId` this way; D-W3-9 parks a
 * released token.
 *
 * It carries the row id so a parked value can be traced back, plus a fresh
 * random id so every park is a distinct value. The random part is what makes
 * the write safe, not the prefix: `token` accepts any string of 8 to 4096
 * characters (`registerDeviceTokenRequestSchema`), so a client is free to post
 * `revoked:<something>` itself. Without it, parking a row whose token already
 * equals its own sentinel would be a no-op, the row would keep the token, and
 * the insert that follows would hit `device_tokens_token_uidx`.
 */
function revokedSentinel(rowId: string) {
  return `revoked:${rowId}:${createId()}`;
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
    const tokenRows = await db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.token, parsed.data.token))
      .limit(1);

    // D-W3-9: an Expo push token identifies the installation, not the person,
    // so every FitBud user of one phone reports the same token (in
    // AUTH_MODE=test the token and the installation id are constants). A
    // signed-in user registering a token that currently belongs to someone
    // else means that other user has signed out on this device: always
    // reassign the token, whether their row is active or revoked. This route
    // never answers 403 DEVICE_TOKEN_OWNED.
    const foreignRow =
      tokenRows[0] && tokenRows[0].userId !== actor.userId
        ? tokenRows[0]
        : null;
    if (foreignRow) {
      // Release the token's unique index without deleting the row:
      // `notification_deliveries.device_token_id` references device_tokens
      // with no ON DELETE clause, so a hard delete would raise a foreign-key
      // error and destroy the delivery history the receipts job reads. Park
      // the token on a sentinel and revoke the row. A revoked row is inert:
      // the sender selects `status = "active"` (domain/reminders.ts), the
      // receipts job updates by id and `status = "active"`, and responsiveness
      // reads only the status. The previous user stops getting pushes here.
      await db
        .update(deviceTokens)
        .set({
          status: "revoked",
          token: revokedSentinel(foreignRow.id),
          updatedAt: now,
        })
        .where(eq(deviceTokens.id, foreignRow.id));
    }

    // Once a foreign row has released the token, no row holds it any more, so
    // the rest of the flow is the plain "token new to this user" path.
    const existingByToken = foreignRow ? [] : tokenRows;

    const existingByInstallation = await db
      .select()
      .from(deviceTokens)
      .where(
        and(
          eq(deviceTokens.userId, actor.userId),
          eq(deviceTokens.installationId, parsed.data.installationId),
        ),
      )
      .limit(1);

    const ownedByToken = existingByToken[0];
    const ownedByInstallation = existingByInstallation[0];
    // The same token reported from another installation of this user (app
    // reinstalled, stable Expo token): two different rows hold the two unique
    // keys we need.
    const movedInstallation =
      ownedByToken &&
      ownedByInstallation &&
      ownedByToken.id !== ownedByInstallation.id
        ? ownedByInstallation
        : null;
    // One row per (user, installation): re-registering replaces the stored
    // token. On a move we keep the row that already holds this token, because
    // `notification_deliveries.device_token_id` references it.
    const target = movedInstallation
      ? ownedByToken
      : (ownedByInstallation ?? ownedByToken);

    if (target) {
      if (movedInstallation) {
        // Free the (user, installation) unique key without deleting a row:
        // deliveries reference device tokens with no ON DELETE clause, so a
        // hard delete would fail and lose the delivery history. The superseded
        // row is revoked and parked on a sentinel installation id; revoked rows
        // are never sent to (domain/reminders.ts selects status "active").
        await db
          .update(deviceTokens)
          .set({
            status: "revoked",
            installationId: `revoked:${movedInstallation.id}`,
            updatedAt: now,
          })
          .where(eq(deviceTokens.id, movedInstallation.id));
      }
      await db
        .update(deviceTokens)
        .set({
          token: parsed.data.token,
          platform: parsed.data.platform,
          provider: parsed.data.provider,
          installationId: parsed.data.installationId,
          status: "active",
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(eq(deviceTokens.id, target.id));
      const updated = await db
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.id, target.id))
        .limit(1);
      return ok(
        c,
        registerDeviceTokenResponseSchema.parse({
          deviceToken: mapDeviceTokenRow(updated[0]!),
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
        deviceToken: mapDeviceTokenRow(created[0]!),
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
      // Signing out releases the token as well as revoking the row, so the
      // unique index `device_tokens_token_uidx` is not held by a signed-out
      // user: the next person to sign in on this device registers the same
      // Expo token on a row of their own (D-W3-9). The row itself is kept --
      // never deleted -- so its delivery history stays attributed to this user.
      await db
        .update(deviceTokens)
        .set({
          status: "revoked",
          token: revokedSentinel(row.id),
          updatedAt: now,
        })
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
    const [userRow] = await db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1);
    return ok(
      c,
      notificationPreferencesSchema.parse(
        mapNotificationPreferences(row, userRow?.timezone ?? null),
      ),
    );
  },
);

async function readReminderStatus(db: Db, userId: string) {
  const now = nowIso();
  const [state] = await db
    .select()
    .from(reminderStates)
    .where(eq(reminderStates.traineeUserId, userId))
    .limit(1);
  const tokens = await db
    .select({ status: deviceTokens.status })
    .from(deviceTokens)
    .where(eq(deviceTokens.userId, userId));
  const rels = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.traineeUserId, userId));
  const rel =
    rels.find((row) => row.status === "active") ??
    rels.find((row) => row.status === "ended") ??
    rels[0];
  const rules = rel
    ? await db
        .select({
          reminderType: reminderRules.reminderType,
          enabled: reminderRules.enabled,
        })
        .from(reminderRules)
        .where(eq(reminderRules.coachingRelationshipId, rel.id))
    : [];
  return reminderStatusSchema.parse(
    deriveReminderStatus({
      mode: state?.mode ?? "normal",
      pausedUntil: state?.pausedUntil ?? null,
      nowIso: now,
      tokens,
      rules,
    }),
  );
}

notificationRoutes.get(
  "/reminder-status",
  operation({
    tag: "Notifications",
    summary: "Trainee reminder status",
    description:
      "Pause, phone delivery, and trainer-disabled categories for the signed-in trainee.",
    roles: ["trainee"],
    response: reminderStatusSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const db = createDb(c.env.DB);
    return ok(c, await readReminderStatus(db, actor.userId));
  },
);

notificationRoutes.post(
  "/reminder-status/resume",
  operation({
    tag: "Notifications",
    summary: "Turn paused reminders back on",
    description: "Clears a trainee reminder pause immediately.",
    roles: ["trainee"],
    response: reminderStatusSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const db = createDb(c.env.DB);
    const now = nowIso();
    const [existing] = await db
      .select()
      .from(reminderStates)
      .where(eq(reminderStates.traineeUserId, actor.userId))
      .limit(1);
    if (existing) {
      await db
        .update(reminderStates)
        .set({
          mode: "normal",
          pausedUntil: null,
          consecutiveIgnores: 0,
          updatedAt: now,
        })
        .where(eq(reminderStates.traineeUserId, actor.userId));
    }
    return ok(c, await readReminderStatus(db, actor.userId));
  },
);

function isValidIanaTimezone(zone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

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
    const flags = await getFlags(c.env, db);
    const current = await ensurePreferences(db, actor.userId, now);
    const nextTrainerCategories = parsed.data.trainerCategories
      ? {
          ...parseTrainerCategoriesJson(current.trainerCategoriesJson),
          ...parsed.data.trainerCategories,
        }
      : parseTrainerCategoriesJson(current.trainerCategoriesJson);

    let nextChannel = current.channelPreference;
    if (parsed.data.channelPreference !== undefined) {
      if (
        parsed.data.channelPreference === "app_and_whatsapp" &&
        !flags.wa_automation
      ) {
        return fail(
          c,
          400,
          "FEATURE_DISABLED",
          "WhatsApp automation is not enabled.",
        );
      }
      nextChannel = parsed.data.channelPreference;
    } else if (!flags.wa_automation && nextChannel === "app_and_whatsapp") {
      nextChannel = "app";
    }

    let whatsappGranted = current.whatsappOptInGranted;
    let whatsappAt = current.whatsappOptInAt;
    let whatsappSource = current.whatsappOptInSource;
    let whatsappTextVersion = current.whatsappOptInTextVersion;
    if (parsed.data.whatsappOptIn !== undefined) {
      if (parsed.data.whatsappOptIn.granted && !flags.wa_automation) {
        return fail(
          c,
          400,
          "FEATURE_DISABLED",
          "WhatsApp opt-in is not available.",
        );
      }
      whatsappGranted = parsed.data.whatsappOptIn.granted;
      if (whatsappGranted) {
        whatsappAt = now;
        whatsappSource = parsed.data.whatsappOptIn.source ?? "settings";
        whatsappTextVersion = parsed.data.whatsappOptIn.textVersion ?? null;
      } else {
        whatsappAt = null;
        whatsappSource = null;
        whatsappTextVersion = null;
      }
    }

    if (parsed.data.traineeTimezone !== undefined) {
      const zone = parsed.data.traineeTimezone;
      if (zone !== null && !isValidIanaTimezone(zone)) {
        return fail(c, 400, "INVALID_REQUEST", "Invalid traineeTimezone.");
      }
      await db
        .update(users)
        .set({ timezone: zone ?? "UTC", updatedAt: now })
        .where(eq(users.id, actor.userId));
    }

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
        dailySummaryReminder:
          parsed.data.categories?.dailySummaryReminder ??
          current.dailySummaryReminder,
        channelPreference: nextChannel,
        whatsappOptInGranted: whatsappGranted,
        whatsappOptInAt: whatsappAt,
        whatsappOptInSource: whatsappSource,
        whatsappOptInTextVersion: whatsappTextVersion,
        locale:
          parsed.data.locale === undefined ? current.locale : parsed.data.locale,
        trainerCategoriesJson: serializeTrainerCategories(nextTrainerCategories),
        coachLogUpdates: parsed.data.coachLogUpdates ?? current.coachLogUpdates,
        preferredWorkoutTime:
          parsed.data.preferredWorkoutTime === undefined
            ? current.preferredWorkoutTime
            : parsed.data.preferredWorkoutTime,
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
    const [userRow] = await db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1);
    return ok(
      c,
      notificationPreferencesSchema.parse(
        mapNotificationPreferences(updated[0]!, userRow?.timezone ?? null),
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
        items: (await presentNotifications(db, rows)).map((item, index) =>
          withNudgeCopy(item, rows[index]!),
        ),
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
    body: evaluateRemindersRequestSchema,
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
    const parsed = evaluateRemindersRequestSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid reminder evaluation request.", {
        issues: parsed.error.issues,
      });
    }
    const db = createDb(c.env.DB);
    const queue = reminderQueueFromEnv(c.env);
    const result = await evaluateAndEnqueueReminders(db, {
      now: parsed.data.now,
      queue,
      pushProviderMode: resolvePushProviderMode(c.env.PUSH_PROVIDER_MODE),
      expoAccessToken: c.env.EXPO_ACCESS_TOKEN,
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
    const [presented] = await presentNotifications(db, [updated]);
    if (!presented) {
      return fail(c, 404, "NOTIFICATION_NOT_FOUND", "Notification not found.");
    }
    return ok(c, notificationSchema.parse(withNudgeCopy(presented, updated)));
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
    roles: ["trainer"],
    body: updateReminderRulesRequestSchema,
    response: reminderRulesResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
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
    if (!relationship || relationship.trainerUserId !== actor.userId) {
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

notificationRoutes.post(
  "/relationships/:relationshipId/nudges",
  operation({
    tag: "Notifications",
    summary: "Trainer nudge for one unresolved activity",
    description: [
      "Sends one activity nudge (Z12-50). Distinct from automatic reminders; it does not change execution or adherence.",
      "Copy: the title is fixed, \"{Coach first name} nudged you\", from the coach's profile. `body` is optional (trimmed, 1-200 characters, no links, else 400 NUDGE_BODY_HAS_LINK); absent, the server uses the Gentle template for the activity type. The trainee's push and inbox row carry the same title and body; the push data stays routing only.",
      "Delivery: reminders paused (the client paused them) → inbox only, `delivery: \"inbox\"`, `inboxReason: \"reminders_paused\"`. FitBud push off, or no active device token → inbox only, `inboxReason: \"push_off\"`. Otherwise `delivery: \"push\"`; inside the client's quiet hours the push is held until they end (`deferredForQuietHours`, `quietHoursEnd`) while the inbox row is written immediately. Reminder categories do not gate a nudge.",
      "Limits: 2 nudges per client per client civil day (the client's stored zone), across activities and delivery modes → 429 NUDGE_LIMIT (static message, `retryAfter` = seconds to the client's next day). The trainer-wide hourly limit stays → 429 NUDGE_RATE_LIMITED. One nudge per item per client day: a repeat returns the stored nudge with `deduped: true` and does not count again (retry-safe). Ended relationships → 409 RELATIONSHIP_ENDED.",
    ].join("\n\n"),
    roles: ["trainer"],
    body: nudgeActivityRequestSchema,
    response: nudgeActivityResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const parsed = nudgeActivityRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid nudge request.", {
        issues: parsed.error.issues,
      });
    }
    if (parsed.data.body !== undefined && nudgeBodyHasLink(parsed.data.body)) {
      return fail(c, 400, "NUDGE_BODY_HAS_LINK", "Nudges can't include links.");
    }
    const db = createDb(c.env.DB);
    const relationship = await loadAccessibleRelationship(
      db,
      c.req.param("relationshipId"),
      actor,
    );
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }
    const writableNudge = await requireWritableRelationship(
      c,
      db,
      relationship.id,
    );
    if (!writableNudge.ok) return writableNudge.response;
    const result = await createActivityNudge(db, {
      relationshipId: relationship.id,
      trainerUserId: actor.userId,
      activityType: parsed.data.activityType,
      activityId: parsed.data.activityId,
      body: parsed.data.body,
      now: c.env.AUTH_MODE === "test" ? parsed.data.now : undefined,
      queue: reminderQueueFromEnv(c.env),
      pushProviderMode: resolvePushProviderMode(c.env.PUSH_PROVIDER_MODE),
      expoAccessToken: c.env.EXPO_ACCESS_TOKEN,
      deliverInline: !c.env.REMINDER_QUEUE,
    });
    if (!result.ok) {
      const status =
        result.code === "NUDGE_LIMIT" || result.code === "NUDGE_RATE_LIMITED"
          ? 429
          : result.code === "ACTIVITY_NOT_FOUND" ||
              result.code === "RELATIONSHIP_NOT_FOUND"
            ? 404
            : 409;
      const retryAfter =
        "retryAfter" in result ? result.retryAfter : undefined;
      const retryMins =
        typeof retryAfter === "number"
          ? Math.max(1, Math.ceil(retryAfter / 60))
          : null;
      const message =
        result.code === "RELATIONSHIP_ENDED"
          ? "Ended relationships do not send nudges."
          : result.code === "ACTIVITY_RESOLVED"
            ? "This activity is already resolved."
            : result.code === "NUDGE_LIMIT"
              ? // D-W12-22: static; the sheet composes the TM-04n line.
                "You can nudge this client again tomorrow."
              : result.code === "NUDGE_RATE_LIMITED"
                ? retryMins
                  ? `You can nudge again in ${retryMins} min`
                  : "Nudge limit reached. Try again later."
                : "Activity not found.";
      return fail(c, status, result.code, message, {
        retryAfter,
      });
    }
    return ok(
      c,
      nudgeActivityResponseSchema.parse({
        notification: withNudgeCopy(
          mapNotification(result.notification),
          result.notification,
        ),
        deduped: result.deduped,
        nudgedAt: result.notification.createdAt,
        delivery: result.delivery,
        inboxReason: result.inboxReason,
        deferredForQuietHours: result.deferredForQuietHours,
        quietHoursEnd: result.quietHoursEnd,
      }),
    );
  },
);

notificationRoutes.get(
  "/relationships/:relationshipId/responsiveness",
  operation({
    tag: "Notifications",
    summary: "Responsiveness label for one client",
    description: "Returns a single responsiveness label and counts for the client.",
    roles: ["trainer"],
    response: responsivenessResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const db = createDb(c.env.DB);
    const relationship = await loadAccessibleRelationship(
      db,
      c.req.param("relationshipId"),
      actor,
    );
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }
    const days = Math.min(
      Math.max(Number(c.req.query("days") ?? "14") || 14, 1),
      90,
    );
    const { deriveResponsiveness } = await import("../domain/responsiveness.js");
    const body = await deriveResponsiveness(db, {
      relationshipId: relationship.id,
      days,
      nowIso: nowIso(),
    });
    return ok(c, responsivenessResponseSchema.parse(body));
  },
);

notificationRoutes.get(
  "/reengagement-candidates",
  operation({
    tag: "Notifications",
    summary: "Clients eligible for trainer re-engagement via WhatsApp",
    description: "Lists trainees with no recent logs and several unanswered reminders.",
    roles: ["trainer"],
    response: reengagementCandidatesResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const db = createDb(c.env.DB);
    const rels = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.trainerUserId, actor.userId));
    const { deriveReengagementCandidates } = await import(
      "../domain/responsiveness.js"
    );
    const items = await deriveReengagementCandidates(db, {
      relationships: rels,
      nowIso: nowIso(),
    });
    return ok(c, reengagementCandidatesResponseSchema.parse({ items }));
  },
);
