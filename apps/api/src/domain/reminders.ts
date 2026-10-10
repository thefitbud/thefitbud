import { and, desc, eq, lte } from "drizzle-orm";
import type {
  EvaluateRemindersResponse,
  NotificationType,
  ReminderQueueMessage,
} from "@fitbud/contracts";
import {
  DEFAULT_REMINDER_TYPES,
  deriveRenewalState,
  domainEntityTypeForReminder,
  formatLocalDate,
  isCategoryEnabled,
  isCheckinReminderEligible,
  isMealReminderEligible,
  isSubscriptionRenewalReminderEligible,
  isWithinQuietHours,
  isWorkoutReminderEligible,
  localTimeHhMm,
  reminderDedupeKey,
  subscriptionRenewalDedupeKey,
} from "@fitbud/core";
import type { createDb } from "../db/client";
import {
  checkins,
  coachingRelationships,
  deviceTokens,
  mealAssignments,
  mealCompliance,
  notificationDeliveries,
  notificationPreferences,
  notifications,
  reminderRules,
  scheduledJobs,
  subscriptionVersions,
  users,
  workoutAssignments,
  workoutExecutions,
} from "../db/schema";
import { createId, nowIso } from "../lib/crypto";
import {
  routingPayloadForNotification,
  sendPushToDevice,
  type PushProviderMode,
} from "../lib/push-provider";

type Db = ReturnType<typeof createDb>;

export type ReminderQueue = {
  send(message: ReminderQueueMessage): Promise<void>;
};

type ReminderCandidate = {
  type: NotificationType;
  recipientUserId: string;
  coachingRelationshipId: string;
  domainEntityId: string;
  dedupeKey: string;
};

async function loadOrDefaultPreferences(db: Db, userId: string) {
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  const row = rows[0];
  if (row) {
    return {
      pushEnabled: row.pushEnabled,
      categories: {
        workoutReminder: row.workoutReminder,
        mealReminder: row.mealReminder,
        checkinReminder: row.checkinReminder,
        subscriptionRenewalReminder: row.subscriptionRenewalReminder,
      },
      quietHoursStart: row.quietHoursStart,
      quietHoursEnd: row.quietHoursEnd,
    };
  }
  return {
    pushEnabled: true,
    categories: {
      workoutReminder: true,
      mealReminder: true,
      checkinReminder: true,
      subscriptionRenewalReminder: true,
    },
    quietHoursStart: null as string | null,
    quietHoursEnd: null as string | null,
  };
}

export async function ensureDefaultReminderRules(
  db: Db,
  relationshipId: string,
  now = nowIso(),
): Promise<void> {
  const existing = await db
    .select()
    .from(reminderRules)
    .where(eq(reminderRules.coachingRelationshipId, relationshipId));
  const present = new Set(existing.map((row) => row.reminderType));
  for (const type of DEFAULT_REMINDER_TYPES) {
    if (present.has(type)) continue;
    await db.insert(reminderRules).values({
      id: createId(),
      coachingRelationshipId: relationshipId,
      reminderType: type,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function collectCandidates(
  db: Db,
  now: string,
): Promise<ReminderCandidate[]> {
  const relationships = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.status, "active"));

  const candidates: ReminderCandidate[] = [];

  for (const relationship of relationships) {
    await ensureDefaultReminderRules(db, relationship.id, now);
    const rules = await db
      .select()
      .from(reminderRules)
      .where(eq(reminderRules.coachingRelationshipId, relationship.id));
    const enabled = new Set(
      rules.filter((rule) => rule.enabled).map((rule) => rule.reminderType),
    );

    if (enabled.has("workout_reminder")) {
      const assignments = await db
        .select()
        .from(workoutAssignments)
        .where(
          and(
            eq(workoutAssignments.coachingRelationshipId, relationship.id),
            eq(workoutAssignments.scheduleStatus, "scheduled"),
            lte(workoutAssignments.windowStartsAt, now),
          ),
        )
        .limit(100);
      for (const assignment of assignments) {
        const executions = await db
          .select()
          .from(workoutExecutions)
          .where(eq(workoutExecutions.assignmentId, assignment.id))
          .limit(1);
        const execution = executions[0] ?? null;
        if (
          !isWorkoutReminderEligible({
            nowIso: now,
            windowStartsAt: assignment.windowStartsAt,
            windowEndsAt: assignment.windowEndsAt,
            executionStatus: execution?.status ?? null,
          })
        ) {
          continue;
        }
        candidates.push({
          type: "workout_reminder",
          recipientUserId: relationship.traineeUserId,
          coachingRelationshipId: relationship.id,
          domainEntityId: assignment.id,
          dedupeKey: reminderDedupeKey({
            type: "workout_reminder",
            domainEntityId: assignment.id,
          }),
        });
      }
    }

    if (enabled.has("meal_reminder")) {
      const assignments = await db
        .select()
        .from(mealAssignments)
        .where(
          and(
            eq(mealAssignments.coachingRelationshipId, relationship.id),
            eq(mealAssignments.scheduleStatus, "scheduled"),
            lte(mealAssignments.windowStartsAt, now),
          ),
        )
        .limit(200);
      for (const assignment of assignments) {
        const complianceRows = await db
          .select()
          .from(mealCompliance)
          .where(eq(mealCompliance.assignmentId, assignment.id))
          .limit(1);
        const compliance = complianceRows[0] ?? null;
        if (
          !isMealReminderEligible({
            nowIso: now,
            windowStartsAt: assignment.windowStartsAt,
            windowEndsAt: assignment.windowEndsAt,
            complianceOutcome: compliance?.outcome ?? null,
            loggedAt: compliance?.loggedAt ?? null,
          })
        ) {
          continue;
        }
        candidates.push({
          type: "meal_reminder",
          recipientUserId: relationship.traineeUserId,
          coachingRelationshipId: relationship.id,
          domainEntityId: assignment.id,
          dedupeKey: reminderDedupeKey({
            type: "meal_reminder",
            domainEntityId: assignment.id,
          }),
        });
      }
    }

    if (enabled.has("checkin_reminder")) {
      const rows = await db
        .select()
        .from(checkins)
        .where(
          and(
            eq(checkins.coachingRelationshipId, relationship.id),
            eq(checkins.recordStatus, "draft"),
            lte(checkins.windowStartsAt, now),
          ),
        )
        .limit(50);
      for (const checkin of rows) {
        if (
          !isCheckinReminderEligible({
            nowIso: now,
            windowStartsAt: checkin.windowStartsAt,
            windowEndsAt: checkin.windowEndsAt,
            recordStatus: checkin.recordStatus,
            hasReview: false,
          })
        ) {
          continue;
        }
        candidates.push({
          type: "checkin_reminder",
          recipientUserId: relationship.traineeUserId,
          coachingRelationshipId: relationship.id,
          domainEntityId: checkin.id,
          dedupeKey: reminderDedupeKey({
            type: "checkin_reminder",
            domainEntityId: checkin.id,
          }),
        });
      }
    }

    if (enabled.has("subscription_renewal_reminder")) {
      const versions = await db
        .select()
        .from(subscriptionVersions)
        .where(eq(subscriptionVersions.coachingRelationshipId, relationship.id))
        .orderBy(desc(subscriptionVersions.versionNumber))
        .limit(1);
      const current = versions[0];
      if (current) {
        const trainer = await db
          .select({ timezone: users.timezone })
          .from(users)
          .where(eq(users.id, relationship.trainerUserId))
          .limit(1);
        const today = formatLocalDate(
          new Date(now),
          trainer[0]?.timezone ?? "UTC",
        );
        const renewalState = deriveRenewalState({
          today,
          renewsOn: current.renewsOn,
        });
        if (isSubscriptionRenewalReminderEligible(renewalState)) {
          candidates.push({
            type: "subscription_renewal_reminder",
            recipientUserId: relationship.traineeUserId,
            coachingRelationshipId: relationship.id,
            domainEntityId: relationship.id,
            dedupeKey: subscriptionRenewalDedupeKey({
              relationshipId: relationship.id,
              renewsOn: current.renewsOn,
              renewalState,
            }),
          });
        }
      }
    }
  }

  return candidates;
}

/**
 * Cron evaluation: create deduplicated notification intents and enqueue delivery.
 * Provider acceptance is recorded separately and never completes workflow state.
 */
export async function evaluateAndEnqueueReminders(
  db: Db,
  options: {
    now?: string;
    queue: ReminderQueue | null;
    pushProviderMode: PushProviderMode;
    deliverInline: boolean;
  },
): Promise<EvaluateRemindersResponse> {
  const now = options.now ?? nowIso();
  const candidates = await collectCandidates(db, now);
  let notificationsCreated = 0;
  let notificationsDeduped = 0;
  let deliveriesEnqueued = 0;
  let suppressed = 0;

  for (const candidate of candidates) {
    const existing = await db
      .select()
      .from(notifications)
      .where(eq(notifications.dedupeKey, candidate.dedupeKey))
      .limit(1);
    if (existing[0]) {
      notificationsDeduped += 1;
      continue;
    }

    const prefs = await loadOrDefaultPreferences(db, candidate.recipientUserId);
    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.id, candidate.recipientUserId))
      .limit(1);
    const timezone = userRows[0]?.timezone ?? "UTC";
    const localTime = localTimeHhMm(now, timezone) ?? "12:00";

    const categoryOk = isCategoryEnabled({
      pushEnabled: prefs.pushEnabled,
      categories: prefs.categories,
      type: candidate.type,
    });
    const quiet = isWithinQuietHours({
      localTimeHhMm: localTime,
      quietHoursStart: prefs.quietHoursStart,
      quietHoursEnd: prefs.quietHoursEnd,
    });

    const notificationId = createId();
    const state =
      !categoryOk || quiet ? ("suppressed" as const) : ("pending" as const);

    try {
      await db.insert(notifications).values({
        id: notificationId,
        recipientUserId: candidate.recipientUserId,
        coachingRelationshipId: candidate.coachingRelationshipId,
        notificationType: candidate.type,
        domainEntityType: domainEntityTypeForReminder(candidate.type),
        domainEntityId: candidate.domainEntityId,
        state,
        dedupeKey: candidate.dedupeKey,
        createdAt: now,
        readAt: null,
      });
    } catch {
      notificationsDeduped += 1;
      continue;
    }

    notificationsCreated += 1;

    if (state === "suppressed") {
      suppressed += 1;
      continue;
    }

    const deliveryId = createId();
    await db.insert(notificationDeliveries).values({
      id: deliveryId,
      notificationId,
      deviceTokenId: null,
      channel: "push",
      providerStatus: "queued",
      providerMessageId: null,
      failureCategory: null,
      attemptNumber: 1,
      acceptedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const jobDedupe = `deliver:${candidate.dedupeKey}`;
    const priorJob = await db
      .select()
      .from(scheduledJobs)
      .where(eq(scheduledJobs.dedupeKey, jobDedupe))
      .limit(1);
    if (!priorJob[0]) {
      await db.insert(scheduledJobs).values({
        id: createId(),
        jobType: "notification.deliver",
        dedupeKey: jobDedupe,
        dueAt: now,
        state: "pending",
        domainEntityType: domainEntityTypeForReminder(candidate.type),
        domainEntityId: candidate.domainEntityId,
        attemptCount: 0,
        lastErrorCategory: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    const message: ReminderQueueMessage = {
      notificationId,
      deliveryId,
    };

    await db
      .update(notifications)
      .set({ state: "queued" })
      .where(eq(notifications.id, notificationId));

    if (options.queue) {
      await options.queue.send(message);
      deliveriesEnqueued += 1;
    } else if (options.deliverInline) {
      await deliverReminderMessage(db, message, options.pushProviderMode);
      deliveriesEnqueued += 1;
    } else {
      deliveriesEnqueued += 1;
    }
  }

  return {
    evaluatedAt: now,
    notificationsCreated,
    notificationsDeduped,
    deliveriesEnqueued,
    suppressed,
  };
}

/** @deprecated Prefer evaluateAndEnqueueReminders */
export async function evaluateReminders(input: {
  db: Db;
  queue: ReminderQueue | null;
  now?: string;
}): Promise<EvaluateRemindersResponse> {
  return evaluateAndEnqueueReminders(input.db, {
    now: input.now,
    queue: input.queue,
    pushProviderMode: "test",
    deliverInline: !input.queue,
  });
}

/**
 * Queue consumer: hand off to FCM (or test double) and record provider acceptance.
 * Acceptance is never treated as workflow completion.
 */
export async function deliverReminderMessage(
  db: Db,
  message: ReminderQueueMessage,
  pushMode: PushProviderMode,
  now = nowIso(),
): Promise<void> {
  const notificationRows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, message.notificationId))
    .limit(1);
  const notification = notificationRows[0];
  if (!notification) return;

  const deliveryRows = await db
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.id, message.deliveryId))
    .limit(1);
  const delivery = deliveryRows[0];
  if (!delivery) return;

  if (delivery.providerStatus === "accepted") {
    if (notification.state !== "delivered") {
      await db
        .update(notifications)
        .set({ state: "delivered" })
        .where(eq(notifications.id, notification.id));
    }
    return;
  }

  const prefs = await loadOrDefaultPreferences(db, notification.recipientUserId);
  if (
    !isCategoryEnabled({
      pushEnabled: prefs.pushEnabled,
      categories: prefs.categories,
      type: notification.notificationType,
    })
  ) {
    await db
      .update(notificationDeliveries)
      .set({
        providerStatus: "skipped",
        failureCategory: "preferences",
        updatedAt: now,
      })
      .where(eq(notificationDeliveries.id, delivery.id));
    await db
      .update(notifications)
      .set({ state: "suppressed" })
      .where(eq(notifications.id, notification.id));
    return;
  }

  const tokens = await db
    .select()
    .from(deviceTokens)
    .where(
      and(
        eq(deviceTokens.userId, notification.recipientUserId),
        eq(deviceTokens.status, "active"),
      ),
    );

  if (tokens.length === 0) {
    await db
      .update(notificationDeliveries)
      .set({
        providerStatus: "skipped",
        failureCategory: "no_device_token",
        updatedAt: now,
      })
      .where(eq(notificationDeliveries.id, delivery.id));
    await db
      .update(notifications)
      .set({ state: "failed" })
      .where(eq(notifications.id, notification.id));
    return;
  }

  const payload = routingPayloadForNotification({
    notificationId: notification.id,
    notificationType: notification.notificationType,
    domainEntityType: notification.domainEntityType,
    domainEntityId: notification.domainEntityId,
    createdAt: notification.createdAt,
  });

  let anyAccepted = false;
  let lastMessageId: string | null = null;
  let lastFailure: string | null = null;
  let acceptedTokenId: string | null = null;

  for (const token of tokens) {
    const result = await sendPushToDevice({
      mode: pushMode,
      deviceToken: token.token,
      payload,
    });
    if (result.ok) {
      anyAccepted = true;
      lastMessageId = result.providerMessageId;
      acceptedTokenId = token.id;
      break;
    }
    lastFailure = result.failureCategory;
  }

  if (anyAccepted) {
    await db
      .update(notificationDeliveries)
      .set({
        providerStatus: "accepted",
        providerMessageId: lastMessageId,
        deviceTokenId: acceptedTokenId,
        acceptedAt: now,
        failureCategory: null,
        updatedAt: now,
      })
      .where(eq(notificationDeliveries.id, delivery.id));
    await db
      .update(notifications)
      .set({ state: "delivered" })
      .where(eq(notifications.id, notification.id));
  } else {
    await db
      .update(notificationDeliveries)
      .set({
        providerStatus: "failed",
        failureCategory: lastFailure ?? "provider_failure",
        updatedAt: now,
      })
      .where(eq(notificationDeliveries.id, delivery.id));
    await db
      .update(notifications)
      .set({ state: "failed" })
      .where(eq(notifications.id, notification.id));
  }

  const jobDedupe = `deliver:${notification.dedupeKey}`;
  await db
    .update(scheduledJobs)
    .set({
      state: anyAccepted ? "completed" : "failed",
      attemptCount: 1,
      lastErrorCategory: anyAccepted ? null : lastFailure,
      updatedAt: now,
    })
    .where(eq(scheduledJobs.dedupeKey, jobDedupe));
}

export async function listRecentNotifications(
  db: Db,
  recipientUserId: string,
  limit = 20,
) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientUserId, recipientUserId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markNotificationRead(
  db: Db,
  recipientUserId: string,
  notificationId: string,
  now = nowIso(),
) {
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.recipientUserId, recipientUserId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.state === "read") return row;
  await db
    .update(notifications)
    .set({ state: "read", readAt: now })
    .where(eq(notifications.id, notificationId));
  return { ...row, state: "read" as const, readAt: now };
}
