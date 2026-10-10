import { and, desc, eq, gte, lte, or } from "drizzle-orm";
import type {
  EvaluateRemindersResponse,
  NotificationDomainEntityType,
  NotificationType,
  NudgeActivityType,
  ReminderQueueMessage,
  ReminderType,
} from "@fitbud/contracts";
import { mealPrescriptionSchema } from "@fitbud/contracts";
import {
  ACTIVITY_NUDGE_HOURLY_LIMIT,
  DEFAULT_REMINDER_TYPES,
  activityNudgeDedupeKey,
  addDaysToLocalDate,
  dailySummaryDedupeKey,
  deferredReminderDedupeKey,
  deliveryDedupeKeyFromDeferred,
  deriveRenewalState,
  domainEntityTypeForActivity,
  dueMealReminderPhases,
  dueWorkoutReminderTimes,
  formatLocalDate,
  isActivityUnresolved,
  isCategoryEnabled,
  isCheckinReminderEligible,
  isDailySummaryClockDue,
  isSubscriptionRenewalReminderEligible,
  isWithinQuietHours,
  isWorkoutResolved,
  localDateFromDailySummaryKey,
  localTimeHhMm,
  mealReminderDedupeKey,
  reminderDeliveryDecision,
  reminderDedupeKey,
  reminderPreferenceForActivity,
  reminderPreferenceForNotification,
  subscriptionRenewalDedupeKey,
  workoutReminderDedupeKey,
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
type NotificationRow = typeof notifications.$inferSelect;
type RelationshipRow = typeof coachingRelationships.$inferSelect;

export type ReminderQueue = {
  send(message: ReminderQueueMessage): Promise<void>;
};

type DeliveryOptions = {
  queue: ReminderQueue | null;
  pushProviderMode: PushProviderMode;
  deliverInline: boolean;
};

type ReminderCounters = {
  notificationsCreated: number;
  notificationsDeduped: number;
  deliveriesEnqueued: number;
  suppressed: number;
  deferred: number;
};

type ReminderCandidate = {
  type: NotificationType;
  preferenceType: ReminderType | null;
  /** Null reads the preference category. False is a final category-off suppression. */
  categoryAllowed: boolean | null;
  recipientUserId: string;
  coachingRelationshipId: string;
  domainEntityType: NotificationDomainEntityType;
  domainEntityId: string;
  dedupeKey: string;
};

type PersistResult =
  | { outcome: "deduped" }
  | { outcome: "stored"; notificationId: string };

type RemainingLogs = {
  workouts: number;
  meals: number;
  checkins: number;
};

export type ActivityNudgeResult =
  | { ok: true; notification: NotificationRow; deduped: boolean }
  | {
      ok: false;
      code:
        | "RELATIONSHIP_NOT_FOUND"
        | "RELATIONSHIP_ENDED"
        | "ACTIVITY_NOT_FOUND"
        | "ACTIVITY_RESOLVED"
        | "NUDGE_RATE_LIMITED";
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

async function enabledReminderTypes(
  db: Db,
  relationshipId: string,
  now: string,
): Promise<Set<ReminderType>> {
  await ensureDefaultReminderRules(db, relationshipId, now);
  const rules = await db
    .select()
    .from(reminderRules)
    .where(eq(reminderRules.coachingRelationshipId, relationshipId));
  return new Set(
    rules.filter((rule) => rule.enabled).map((rule) => rule.reminderType),
  );
}

async function findByDedupeKey(
  db: Db,
  dedupeKey: string,
): Promise<NotificationRow | null> {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.dedupeKey, dedupeKey))
    .limit(1);
  return rows[0] ?? null;
}

function readMealLocalTime(mealPrescriptionJson: string): string | null {
  try {
    const parsed = mealPrescriptionSchema.safeParse(
      JSON.parse(mealPrescriptionJson),
    );
    if (!parsed.success) return null;
    return parsed.data.localTime ?? null;
  } catch {
    return null;
  }
}

function summaryCategoryAllowed(
  prefs: Awaited<ReturnType<typeof loadOrDefaultPreferences>>,
  remaining: RemainingLogs,
): boolean {
  if (!prefs.pushEnabled) return false;
  if (remaining.workouts > 0 && prefs.categories.workoutReminder) return true;
  if (remaining.meals > 0 && prefs.categories.mealReminder) return true;
  if (remaining.checkins > 0 && prefs.categories.checkinReminder) return true;
  return false;
}

async function countRemainingLogs(
  db: Db,
  relationshipId: string,
  localDate: string,
  enabled: Set<ReminderType>,
  now: string,
): Promise<RemainingLogs> {
  const remaining: RemainingLogs = { workouts: 0, meals: 0, checkins: 0 };
  if (enabled.has("workout_reminder")) {
    const assignments = await db
      .select()
      .from(workoutAssignments)
      .where(
        and(
          eq(workoutAssignments.coachingRelationshipId, relationshipId),
          eq(workoutAssignments.scheduleStatus, "scheduled"),
          eq(workoutAssignments.localDate, localDate),
        ),
      )
      .limit(50);
    for (const assignment of assignments) {
      const executions = await db
        .select()
        .from(workoutExecutions)
        .where(eq(workoutExecutions.assignmentId, assignment.id))
        .limit(1);
      if (!isWorkoutResolved(executions[0]?.status ?? null)) {
        remaining.workouts += 1;
      }
    }
  }
  if (enabled.has("meal_reminder")) {
    const assignments = await db
      .select()
      .from(mealAssignments)
      .where(
        and(
          eq(mealAssignments.coachingRelationshipId, relationshipId),
          eq(mealAssignments.scheduleStatus, "scheduled"),
          eq(mealAssignments.localDate, localDate),
        ),
      )
      .limit(50);
    for (const assignment of assignments) {
      const complianceRows = await db
        .select()
        .from(mealCompliance)
        .where(eq(mealCompliance.assignmentId, assignment.id))
        .limit(1);
      if (!complianceRows[0]) remaining.meals += 1;
    }
  }
  if (enabled.has("checkin_reminder")) {
    const rows = await db
      .select()
      .from(checkins)
      .where(
        and(
          eq(checkins.coachingRelationshipId, relationshipId),
          eq(checkins.localDate, localDate),
          eq(checkins.recordStatus, "draft"),
        ),
      )
      .limit(5);
    for (const checkin of rows) {
      if (
        isCheckinReminderEligible({
          nowIso: now,
          windowStartsAt: checkin.windowStartsAt,
          windowEndsAt: checkin.windowEndsAt,
          recordStatus: checkin.recordStatus,
          hasReview: false,
        })
      ) {
        remaining.checkins += 1;
      }
    }
  }
  return remaining;
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
    const enabled = await enabledReminderTypes(db, relationship.id, now);
    const trainee = await db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, relationship.traineeUserId))
      .limit(1);
    const timeZone = trainee[0]?.timezone ?? "UTC";
    const today = formatLocalDate(new Date(now), timeZone);
    const tomorrow = addDaysToLocalDate(today, 1);

    if (enabled.has("workout_reminder")) {
      const assignments = await db
        .select()
        .from(workoutAssignments)
        .where(
          and(
            eq(workoutAssignments.coachingRelationshipId, relationship.id),
            eq(workoutAssignments.scheduleStatus, "scheduled"),
            eq(workoutAssignments.localDate, today),
          ),
        )
        .limit(50);
      for (const assignment of assignments) {
        const executions = await db
          .select()
          .from(workoutExecutions)
          .where(eq(workoutExecutions.assignmentId, assignment.id))
          .limit(1);
        const slots = dueWorkoutReminderTimes({
          nowIso: now,
          assignmentLocalDate: assignment.localDate,
          timeZone,
          resolved: isWorkoutResolved(executions[0]?.status ?? null),
        });
        for (const slot of slots) {
          candidates.push({
            type: "workout_reminder",
            preferenceType: "workout_reminder",
            categoryAllowed: null,
            recipientUserId: relationship.traineeUserId,
            coachingRelationshipId: relationship.id,
            domainEntityType: "workout_assignment",
            domainEntityId: assignment.id,
            dedupeKey: workoutReminderDedupeKey(assignment.id, slot),
          });
        }
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
            or(
              eq(mealAssignments.localDate, today),
              eq(mealAssignments.localDate, tomorrow),
            ),
          ),
        )
        .limit(50);
      for (const assignment of assignments) {
        const complianceRows = await db
          .select()
          .from(mealCompliance)
          .where(eq(mealCompliance.assignmentId, assignment.id))
          .limit(1);
        const phases = dueMealReminderPhases({
          nowIso: now,
          localDate: assignment.localDate,
          timeZone,
          localTime: readMealLocalTime(assignment.mealPrescriptionJson),
          logged: Boolean(complianceRows[0]),
          windowEndsAt: assignment.windowEndsAt,
        });
        for (const phase of phases) {
          candidates.push({
            type: "meal_reminder",
            preferenceType: "meal_reminder",
            categoryAllowed: null,
            recipientUserId: relationship.traineeUserId,
            coachingRelationshipId: relationship.id,
            domainEntityType: "meal_assignment",
            domainEntityId: assignment.id,
            dedupeKey: mealReminderDedupeKey(assignment.id, phase),
          });
        }
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
          preferenceType: "checkin_reminder",
          categoryAllowed: null,
          recipientUserId: relationship.traineeUserId,
          coachingRelationshipId: relationship.id,
          domainEntityType: "checkin",
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
        const trainerToday = formatLocalDate(
          new Date(now),
          trainer[0]?.timezone ?? "UTC",
        );
        const renewalState = deriveRenewalState({
          today: trainerToday,
          renewsOn: current.renewsOn,
        });
        if (isSubscriptionRenewalReminderEligible(renewalState)) {
          candidates.push({
            type: "subscription_renewal_reminder",
            preferenceType: "subscription_renewal_reminder",
            categoryAllowed: null,
            recipientUserId: relationship.traineeUserId,
            coachingRelationshipId: relationship.id,
            domainEntityType: "coaching_relationship",
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

    if (isDailySummaryClockDue({ nowIso: now, timeZone })) {
      const remaining = await countRemainingLogs(
        db,
        relationship.id,
        today,
        enabled,
        now,
      );
      const total = remaining.workouts + remaining.meals + remaining.checkins;
      if (total > 0) {
        const prefs = await loadOrDefaultPreferences(
          db,
          relationship.traineeUserId,
        );
        candidates.push({
          type: "daily_summary",
          preferenceType: null,
          categoryAllowed: summaryCategoryAllowed(prefs, remaining),
          recipientUserId: relationship.traineeUserId,
          coachingRelationshipId: relationship.id,
          domainEntityType: "coaching_relationship",
          domainEntityId: relationship.id,
          dedupeKey: dailySummaryDedupeKey(relationship.id, today),
        });
      }
    }
  }

  return candidates;
}

async function enqueueReminderDelivery(
  db: Db,
  input: {
    notificationId: string;
    candidate: ReminderCandidate;
    now: string;
    options: DeliveryOptions;
  },
): Promise<void> {
  const deliveryId = createId();
  await db.insert(notificationDeliveries).values({
    id: deliveryId,
    notificationId: input.notificationId,
    deviceTokenId: null,
    channel: "push",
    providerStatus: "queued",
    providerMessageId: null,
    failureCategory: null,
    attemptNumber: 1,
    acceptedAt: null,
    createdAt: input.now,
    updatedAt: input.now,
  });

  const jobDedupe = `deliver:${input.candidate.dedupeKey}`;
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
      dueAt: input.now,
      state: "pending",
      domainEntityType: input.candidate.domainEntityType,
      domainEntityId: input.candidate.domainEntityId,
      attemptCount: 0,
      lastErrorCategory: null,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  await db
    .update(notifications)
    .set({ state: "queued" })
    .where(eq(notifications.id, input.notificationId));

  const message: ReminderQueueMessage = {
    notificationId: input.notificationId,
    deliveryId,
  };
  if (input.options.queue) {
    await input.options.queue.send(message);
  } else if (input.options.deliverInline) {
    await deliverReminderMessage(db, message, input.options.pushProviderMode, input.now);
  }
}

/**
 * Category-off writes the delivery dedupe key and is not retried.
 * Quiet hours write `deferred:<delivery key>` and leave the delivery key free.
 */
async function persistReminder(
  db: Db,
  candidate: ReminderCandidate,
  now: string,
  options: DeliveryOptions,
  counters: ReminderCounters,
): Promise<PersistResult> {
  const existingDelivery = await findByDedupeKey(db, candidate.dedupeKey);
  if (existingDelivery) {
    counters.notificationsDeduped += 1;
    return { outcome: "deduped" };
  }

  const prefs = await loadOrDefaultPreferences(db, candidate.recipientUserId);
  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.id, candidate.recipientUserId))
    .limit(1);
  const timezone = userRows[0]?.timezone ?? "UTC";
  const localTime = localTimeHhMm(now, timezone) ?? "12:00";
  const categoryOk =
    candidate.categoryAllowed !== null
      ? candidate.categoryAllowed
      : candidate.preferenceType
        ? isCategoryEnabled({
            pushEnabled: prefs.pushEnabled,
            categories: prefs.categories,
            type: candidate.preferenceType,
          })
        : false;
  const decision = reminderDeliveryDecision({
    categoryEnabled: categoryOk,
    withinQuietHours: isWithinQuietHours({
      localTimeHhMm: localTime,
      quietHoursStart: prefs.quietHoursStart,
      quietHoursEnd: prefs.quietHoursEnd,
    }),
  });
  const deferredKey = deferredReminderDedupeKey(candidate.dedupeKey);
  const deferredRow = await findByDedupeKey(db, deferredKey);

  if (decision === "suppress") {
    if (deferredRow) {
      try {
        await db
          .update(notifications)
          .set({ dedupeKey: candidate.dedupeKey, state: "suppressed" })
          .where(eq(notifications.id, deferredRow.id));
      } catch {
        counters.notificationsDeduped += 1;
        return { outcome: "deduped" };
      }
      counters.suppressed += 1;
      return { outcome: "stored", notificationId: deferredRow.id };
    }
    const notificationId = createId();
    try {
      await db.insert(notifications).values({
        id: notificationId,
        recipientUserId: candidate.recipientUserId,
        coachingRelationshipId: candidate.coachingRelationshipId,
        notificationType: candidate.type,
        domainEntityType: candidate.domainEntityType,
        domainEntityId: candidate.domainEntityId,
        state: "suppressed",
        dedupeKey: candidate.dedupeKey,
        createdAt: now,
        readAt: null,
      });
    } catch {
      counters.notificationsDeduped += 1;
      return { outcome: "deduped" };
    }
    counters.notificationsCreated += 1;
    counters.suppressed += 1;
    return { outcome: "stored", notificationId };
  }

  if (decision === "defer") {
    if (deferredRow) {
      counters.notificationsDeduped += 1;
      return { outcome: "deduped" };
    }
    const notificationId = createId();
    try {
      await db.insert(notifications).values({
        id: notificationId,
        recipientUserId: candidate.recipientUserId,
        coachingRelationshipId: candidate.coachingRelationshipId,
        notificationType: candidate.type,
        domainEntityType: candidate.domainEntityType,
        domainEntityId: candidate.domainEntityId,
        state: "deferred",
        dedupeKey: deferredKey,
        createdAt: now,
        readAt: null,
      });
    } catch {
      counters.notificationsDeduped += 1;
      return { outcome: "deduped" };
    }
    counters.notificationsCreated += 1;
    counters.deferred += 1;
    return { outcome: "stored", notificationId };
  }

  let notificationId: string;
  if (deferredRow?.state === "deferred") {
    try {
      await db
        .update(notifications)
        .set({ dedupeKey: candidate.dedupeKey, state: "pending" })
        .where(eq(notifications.id, deferredRow.id));
    } catch {
      counters.notificationsDeduped += 1;
      return { outcome: "deduped" };
    }
    notificationId = deferredRow.id;
  } else {
    notificationId = createId();
    try {
      await db.insert(notifications).values({
        id: notificationId,
        recipientUserId: candidate.recipientUserId,
        coachingRelationshipId: candidate.coachingRelationshipId,
        notificationType: candidate.type,
        domainEntityType: candidate.domainEntityType,
        domainEntityId: candidate.domainEntityId,
        state: "pending",
        dedupeKey: candidate.dedupeKey,
        createdAt: now,
        readAt: null,
      });
    } catch {
      counters.notificationsDeduped += 1;
      return { outcome: "deduped" };
    }
    counters.notificationsCreated += 1;
  }

  await enqueueReminderDelivery(db, {
    notificationId,
    candidate,
    now,
    options,
  });
  counters.deliveriesEnqueued += 1;
  return { outcome: "stored", notificationId };
}

async function suppressDeferredRow(db: Db, notificationId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ state: "suppressed" })
    .where(eq(notifications.id, notificationId));
}

async function rebuildDeferredCandidate(
  db: Db,
  row: NotificationRow,
  logicalKey: string,
  relationship: RelationshipRow,
  now: string,
): Promise<ReminderCandidate | null> {
  const enabled = await enabledReminderTypes(db, relationship.id, now);
  const base = {
    recipientUserId: row.recipientUserId,
    coachingRelationshipId: relationship.id,
    dedupeKey: logicalKey,
  };

  if (row.notificationType === "workout_reminder") {
    if (!enabled.has("workout_reminder")) return null;
    const assignments = await db
      .select()
      .from(workoutAssignments)
      .where(eq(workoutAssignments.id, row.domainEntityId))
      .limit(1);
    const assignment = assignments[0];
    if (
      !assignment ||
      assignment.coachingRelationshipId !== relationship.id ||
      assignment.scheduleStatus !== "scheduled"
    ) {
      return null;
    }
    const executions = await db
      .select()
      .from(workoutExecutions)
      .where(eq(workoutExecutions.assignmentId, assignment.id))
      .limit(1);
    if (isWorkoutResolved(executions[0]?.status ?? null)) return null;
    return {
      ...base,
      type: "workout_reminder",
      preferenceType: "workout_reminder",
      categoryAllowed: null,
      domainEntityType: "workout_assignment",
      domainEntityId: assignment.id,
    };
  }

  if (row.notificationType === "meal_reminder") {
    if (!enabled.has("meal_reminder")) return null;
    const assignments = await db
      .select()
      .from(mealAssignments)
      .where(eq(mealAssignments.id, row.domainEntityId))
      .limit(1);
    const assignment = assignments[0];
    if (
      !assignment ||
      assignment.coachingRelationshipId !== relationship.id ||
      assignment.scheduleStatus !== "scheduled"
    ) {
      return null;
    }
    const complianceRows = await db
      .select()
      .from(mealCompliance)
      .where(eq(mealCompliance.assignmentId, assignment.id))
      .limit(1);
    if (complianceRows[0]) return null;
    return {
      ...base,
      type: "meal_reminder",
      preferenceType: "meal_reminder",
      categoryAllowed: null,
      domainEntityType: "meal_assignment",
      domainEntityId: assignment.id,
    };
  }

  if (row.notificationType === "checkin_reminder") {
    if (!enabled.has("checkin_reminder")) return null;
    const rows = await db
      .select()
      .from(checkins)
      .where(eq(checkins.id, row.domainEntityId))
      .limit(1);
    const checkin = rows[0];
    if (!checkin || checkin.coachingRelationshipId !== relationship.id) {
      return null;
    }
    if (
      !isCheckinReminderEligible({
        nowIso: now,
        windowStartsAt: checkin.windowStartsAt,
        windowEndsAt: checkin.windowEndsAt,
        recordStatus: checkin.recordStatus,
        hasReview: false,
      })
    ) {
      return null;
    }
    return {
      ...base,
      type: "checkin_reminder",
      preferenceType: "checkin_reminder",
      categoryAllowed: null,
      domainEntityType: "checkin",
      domainEntityId: checkin.id,
    };
  }

  if (row.notificationType === "subscription_renewal_reminder") {
    if (!enabled.has("subscription_renewal_reminder")) return null;
    const versions = await db
      .select()
      .from(subscriptionVersions)
      .where(eq(subscriptionVersions.coachingRelationshipId, relationship.id))
      .orderBy(desc(subscriptionVersions.versionNumber))
      .limit(1);
    const current = versions[0];
    if (!current) return null;
    const trainer = await db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, relationship.trainerUserId))
      .limit(1);
    const renewalState = deriveRenewalState({
      today: formatLocalDate(new Date(now), trainer[0]?.timezone ?? "UTC"),
      renewsOn: current.renewsOn,
    });
    if (!isSubscriptionRenewalReminderEligible(renewalState)) return null;
    const currentKey = subscriptionRenewalDedupeKey({
      relationshipId: relationship.id,
      renewsOn: current.renewsOn,
      renewalState,
    });
    if (currentKey !== logicalKey) return null;
    return {
      ...base,
      type: "subscription_renewal_reminder",
      preferenceType: "subscription_renewal_reminder",
      categoryAllowed: null,
      domainEntityType: "coaching_relationship",
      domainEntityId: relationship.id,
    };
  }

  if (row.notificationType === "daily_summary") {
    const localDate = localDateFromDailySummaryKey(logicalKey);
    if (!localDate) return null;
    const remaining = await countRemainingLogs(
      db,
      relationship.id,
      localDate,
      enabled,
      now,
    );
    const total = remaining.workouts + remaining.meals + remaining.checkins;
    if (total === 0) return null;
    const prefs = await loadOrDefaultPreferences(db, row.recipientUserId);
    return {
      ...base,
      type: "daily_summary",
      preferenceType: null,
      categoryAllowed: summaryCategoryAllowed(prefs, remaining),
      domainEntityType: "coaching_relationship",
      domainEntityId: relationship.id,
    };
  }

  if (row.notificationType === "activity_nudge") {
    const activity = await loadNudgeActivity(
      db,
      relationship.id,
      nudgeActivityTypeForEntity(row.domainEntityType),
      row.domainEntityId,
    );
    if (!activity || !activity.unresolved) return null;
    return {
      ...base,
      type: "activity_nudge",
      preferenceType: reminderPreferenceForActivity(activity.activityType),
      categoryAllowed: null,
      domainEntityType: domainEntityTypeForActivity(activity.activityType),
      domainEntityId: activity.activityId,
    };
  }

  return null;
}

function nudgeActivityTypeForEntity(
  domainEntityType: NotificationDomainEntityType,
): NudgeActivityType | null {
  if (domainEntityType === "workout_assignment") return "workout";
  if (domainEntityType === "meal_assignment") return "meal";
  if (domainEntityType === "checkin") return "checkin";
  return null;
}

async function loadNudgeActivity(
  db: Db,
  relationshipId: string,
  activityType: NudgeActivityType | null,
  activityId: string,
): Promise<{
  activityType: NudgeActivityType;
  activityId: string;
  unresolved: boolean;
} | null> {
  if (activityType === "workout") {
    const assignments = await db
      .select()
      .from(workoutAssignments)
      .where(eq(workoutAssignments.id, activityId))
      .limit(1);
    const assignment = assignments[0];
    if (
      !assignment ||
      assignment.coachingRelationshipId !== relationshipId ||
      assignment.scheduleStatus !== "scheduled"
    ) {
      return null;
    }
    const executions = await db
      .select()
      .from(workoutExecutions)
      .where(eq(workoutExecutions.assignmentId, assignment.id))
      .limit(1);
    return {
      activityType,
      activityId,
      unresolved: isActivityUnresolved({
        activityType,
        workoutExecutionStatus: executions[0]?.status ?? null,
        mealLogged: false,
        checkinRecordStatus: null,
      }),
    };
  }
  if (activityType === "meal") {
    const assignments = await db
      .select()
      .from(mealAssignments)
      .where(eq(mealAssignments.id, activityId))
      .limit(1);
    const assignment = assignments[0];
    if (
      !assignment ||
      assignment.coachingRelationshipId !== relationshipId ||
      assignment.scheduleStatus !== "scheduled"
    ) {
      return null;
    }
    const complianceRows = await db
      .select()
      .from(mealCompliance)
      .where(eq(mealCompliance.assignmentId, assignment.id))
      .limit(1);
    return {
      activityType,
      activityId,
      unresolved: isActivityUnresolved({
        activityType,
        workoutExecutionStatus: null,
        mealLogged: Boolean(complianceRows[0]),
        checkinRecordStatus: null,
      }),
    };
  }
  if (activityType === "checkin") {
    const rows = await db
      .select()
      .from(checkins)
      .where(eq(checkins.id, activityId))
      .limit(1);
    const checkin = rows[0];
    if (!checkin || checkin.coachingRelationshipId !== relationshipId) {
      return null;
    }
    return {
      activityType,
      activityId,
      unresolved: isActivityUnresolved({
        activityType,
        workoutExecutionStatus: null,
        mealLogged: false,
        checkinRecordStatus: checkin.recordStatus,
      }),
    };
  }
  return null;
}

async function retryDeferredReminders(
  db: Db,
  now: string,
  candidateKeys: Set<string>,
  options: DeliveryOptions,
  counters: ReminderCounters,
): Promise<void> {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.state, "deferred"));
  for (const row of rows) {
    const logicalKey = deliveryDedupeKeyFromDeferred(row.dedupeKey);
    if (!logicalKey || candidateKeys.has(logicalKey)) continue;
    if (!row.coachingRelationshipId) {
      await suppressDeferredRow(db, row.id);
      counters.suppressed += 1;
      continue;
    }
    const relationships = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, row.coachingRelationshipId))
      .limit(1);
    const relationship = relationships[0];
    if (!relationship || relationship.status !== "active") {
      await suppressDeferredRow(db, row.id);
      counters.suppressed += 1;
      continue;
    }
    const rebuilt = await rebuildDeferredCandidate(
      db,
      row,
      logicalKey,
      relationship,
      now,
    );
    if (!rebuilt) {
      await suppressDeferredRow(db, row.id);
      counters.suppressed += 1;
      continue;
    }
    await persistReminder(db, rebuilt, now, options, counters);
  }
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
  const delivery: DeliveryOptions = {
    queue: options.queue,
    pushProviderMode: options.pushProviderMode,
    deliverInline: options.deliverInline,
  };
  const counters: ReminderCounters = {
    notificationsCreated: 0,
    notificationsDeduped: 0,
    deliveriesEnqueued: 0,
    suppressed: 0,
    deferred: 0,
  };
  const candidates = await collectCandidates(db, now);
  const candidateKeys = new Set(candidates.map((candidate) => candidate.dedupeKey));
  for (const candidate of candidates) {
    await persistReminder(db, candidate, now, delivery, counters);
  }
  await retryDeferredReminders(db, now, candidateKeys, delivery, counters);
  return {
    evaluatedAt: now,
    ...counters,
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

export async function createActivityNudge(
  db: Db,
  input: {
    relationshipId: string;
    activityType: NudgeActivityType;
    activityId: string;
    now?: string;
    queue: ReminderQueue | null;
    pushProviderMode: PushProviderMode;
    deliverInline: boolean;
  },
): Promise<ActivityNudgeResult> {
  const now = input.now ?? nowIso();
  const relationships = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.id, input.relationshipId))
    .limit(1);
  const relationship = relationships[0];
  if (!relationship) return { ok: false, code: "RELATIONSHIP_NOT_FOUND" };
  if (relationship.status !== "active") {
    return { ok: false, code: "RELATIONSHIP_ENDED" };
  }

  const activity = await loadNudgeActivity(
    db,
    relationship.id,
    input.activityType,
    input.activityId,
  );
  if (!activity) return { ok: false, code: "ACTIVITY_NOT_FOUND" };

  const trainee = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, relationship.traineeUserId))
    .limit(1);
  const timeZone = trainee[0]?.timezone ?? "UTC";
  const localDate = formatLocalDate(new Date(now), timeZone);
  const dedupeKey = activityNudgeDedupeKey(activity.activityId, localDate);
  const deferredKey = deferredReminderDedupeKey(dedupeKey);

  if (!activity.unresolved) {
    const deferred = await findByDedupeKey(db, deferredKey);
    if (deferred?.state === "deferred") {
      await suppressDeferredRow(db, deferred.id);
    }
    return { ok: false, code: "ACTIVITY_RESOLVED" };
  }

  const existingDelivery = await findByDedupeKey(db, dedupeKey);
  if (existingDelivery) {
    return { ok: true, notification: existingDelivery, deduped: true };
  }
  const existingDeferred = await findByDedupeKey(db, deferredKey);
  if (existingDeferred?.state === "deferred") {
    return { ok: true, notification: existingDeferred, deduped: true };
  }

  const hourAgo = new Date(Date.parse(now) - 60 * 60 * 1000).toISOString();
  const recent = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.coachingRelationshipId, relationship.id),
        eq(notifications.notificationType, "activity_nudge"),
        gte(notifications.createdAt, hourAgo),
      ),
    );
  if (recent.length >= ACTIVITY_NUDGE_HOURLY_LIMIT) {
    return { ok: false, code: "NUDGE_RATE_LIMITED" };
  }

  const counters: ReminderCounters = {
    notificationsCreated: 0,
    notificationsDeduped: 0,
    deliveriesEnqueued: 0,
    suppressed: 0,
    deferred: 0,
  };
  const result = await persistReminder(
    db,
    {
      type: "activity_nudge",
      preferenceType: reminderPreferenceForActivity(activity.activityType),
      categoryAllowed: null,
      recipientUserId: relationship.traineeUserId,
      coachingRelationshipId: relationship.id,
      domainEntityType: domainEntityTypeForActivity(activity.activityType),
      domainEntityId: activity.activityId,
      dedupeKey,
    },
    now,
    {
      queue: input.queue,
      pushProviderMode: input.pushProviderMode,
      deliverInline: input.deliverInline,
    },
    counters,
  );
  const notificationId =
    result.outcome === "stored"
      ? result.notificationId
      : (await findByDedupeKey(db, dedupeKey))?.id ??
        (await findByDedupeKey(db, deferredKey))?.id;
  if (!notificationId) return { ok: false, code: "NUDGE_RATE_LIMITED" };
  const stored = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, notificationId))
    .limit(1);
  if (!stored[0]) return { ok: false, code: "ACTIVITY_NOT_FOUND" };
  return {
    ok: true,
    notification: stored[0],
    deduped: result.outcome === "deduped",
  };
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

  if (notification.coachingRelationshipId) {
    const relationships = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, notification.coachingRelationshipId))
      .limit(1);
    if (!relationships[0] || relationships[0].status !== "active") {
      await db
        .update(notificationDeliveries)
        .set({
          providerStatus: "skipped",
          failureCategory: "relationship_inactive",
          updatedAt: now,
        })
        .where(eq(notificationDeliveries.id, delivery.id));
      await db
        .update(notifications)
        .set({ state: "suppressed" })
        .where(eq(notifications.id, notification.id));
      return;
    }
  }

  const prefs = await loadOrDefaultPreferences(db, notification.recipientUserId);
  const preference = reminderPreferenceForNotification({
    notificationType: notification.notificationType,
    domainEntityType: notification.domainEntityType,
  });
  const categoryOk =
    preference === "daily_summary"
      ? prefs.pushEnabled
      : preference
        ? isCategoryEnabled({
            pushEnabled: prefs.pushEnabled,
            categories: prefs.categories,
            type: preference,
          })
        : false;
  if (!categoryOk) {
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

  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.id, notification.recipientUserId))
    .limit(1);
  const timezone = userRows[0]?.timezone ?? "UTC";
  const localTime = localTimeHhMm(now, timezone) ?? "12:00";
  if (
    !notification.dedupeKey.startsWith("deferred:") &&
    isWithinQuietHours({
      localTimeHhMm: localTime,
      quietHoursStart: prefs.quietHoursStart,
      quietHoursEnd: prefs.quietHoursEnd,
    })
  ) {
    await db
      .update(notificationDeliveries)
      .set({
        providerStatus: "skipped",
        failureCategory: "quiet_hours",
        updatedAt: now,
      })
      .where(eq(notificationDeliveries.id, delivery.id));
    await db
      .update(notifications)
      .set({
        state: "deferred",
        dedupeKey: deferredReminderDedupeKey(notification.dedupeKey),
      })
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
