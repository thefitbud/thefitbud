import { and, eq, gte, inArray } from "drizzle-orm";
import type {
  ResponsivenessCategoryCounts,
  ResponsivenessLabel,
  ResponsivenessResponse,
} from "@fitbud/contracts";
import type { Db } from "../db/client.js";
import { whatsappHref } from "@fitbud/core";
import {
  checkins,
  coachingRelationships,
  deviceTokens,
  mealCompliance,
  notificationPreferences,
  notifications,
  reminderStates,
  traineeProfiles,
  userIdentities,
  workoutExecutions,
} from "../db/schema.js";

const REMINDER_TYPES = [
  "workout_reminder",
  "meal_reminder",
  "checkin_reminder",
] as const;

type ReminderType = (typeof REMINDER_TYPES)[number];

const TWO_HOURS_MS = 2 * 3_600_000;

function emptyCategory(): ResponsivenessCategoryCounts {
  return {
    sent: 0,
    opened: null,
    loggedAfter: 0,
    loggedOnOwn: 0,
    notLogged: 0,
    suppressed: 0,
  };
}

function isReminderEligible(row: { notificationType: string }): boolean {
  return REMINDER_TYPES.includes(row.notificationType as ReminderType);
}

function openedCount(
  rows: Array<{ openedAt: string | null; readAt: string | null; state: string }>,
): number | null {
  if (rows.length === 0) return null;
  const hasTracking = rows.some((r) => r.openedAt || r.readAt || r.state === "read");
  if (!hasTracking) return null;
  return rows.filter((r) => Boolean(r.openedAt) || Boolean(r.readAt) || r.state === "read")
    .length;
}

export async function deriveResponsiveness(
  db: Db,
  input: {
    relationshipId: string;
    days: number;
    nowIso: string;
  },
): Promise<ResponsivenessResponse> {
  const base = await deriveResponsivenessLabel(db, input);
  const [relationship] = await db
    .select({ traineeUserId: coachingRelationships.traineeUserId })
    .from(coachingRelationships)
    .where(eq(coachingRelationships.id, input.relationshipId))
    .limit(1);
  if (!relationship) return base;
  const [prefs] = await db
    .select({
      pushEnabled: notificationPreferences.pushEnabled,
      quietHoursStart: notificationPreferences.quietHoursStart,
      quietHoursEnd: notificationPreferences.quietHoursEnd,
      preferredWorkoutTime: notificationPreferences.preferredWorkoutTime,
    })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, relationship.traineeUserId))
    .limit(1);

  const preferredWorkoutTime = prefs?.preferredWorkoutTime ?? null;
  const preferredWorkoutTimeSource = preferredWorkoutTime
    ? ("learned" as const)
    : null;

  return {
    ...base,
    pushEnabled: prefs?.pushEnabled,
    quietHoursStart: prefs?.quietHoursStart ?? null,
    quietHoursEnd: prefs?.quietHoursEnd ?? null,
    preferredWorkoutTime,
    preferredWorkoutTimeSource,
  };
}

async function deriveResponsivenessLabel(
  db: Db,
  input: {
    relationshipId: string;
    days: number;
    nowIso: string;
  },
): Promise<ResponsivenessResponse> {
  const since = new Date(
    Date.parse(input.nowIso) - input.days * 86_400_000,
  ).toISOString();

  const [relationship] = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.id, input.relationshipId))
    .limit(1);
  if (!relationship) {
    return {
      label: "not_enough_data",
      counts: { sent: 0, opened: 0, loggedAfter: 0, loggedBefore: 0 },
    };
  }

  const [prefs] = await db
    .select({ pushEnabled: notificationPreferences.pushEnabled })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, relationship.traineeUserId))
    .limit(1);

  const tokens = await db
    .select()
    .from(deviceTokens)
    .where(eq(deviceTokens.userId, relationship.traineeUserId));
  const hasLiveToken = tokens.some((t) => t.status !== "revoked");
  if (prefs?.pushEnabled === false || !hasLiveToken) {
    return {
      label: "notifications_off",
      counts: { sent: 0, opened: 0, loggedAfter: 0, loggedBefore: 0 },
      pushEnabled: prefs?.pushEnabled ?? false,
    };
  }

  const [paused] = await db
    .select()
    .from(reminderStates)
    .where(
      and(
        eq(reminderStates.traineeUserId, relationship.traineeUserId),
        eq(reminderStates.mode, "paused"),
      ),
    )
    .limit(1);
  if (paused) {
    return {
      label: "reminders_paused",
      counts: { sent: 0, opened: 0, loggedAfter: 0, loggedBefore: 0 },
      pausedUntil: paused.pausedUntil ?? null,
    };
  }

  const reminderRows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.coachingRelationshipId, relationship.id),
        gte(notifications.createdAt, since),
        inArray(notifications.notificationType, [...REMINDER_TYPES]),
      ),
    );

  const eligible = reminderRows.filter((row) => isReminderEligible(row));
  const sent = eligible.filter((row) => row.state !== "suppressed").length;
  const opened = eligible.filter(
    (row) => row.openedAt || row.readAt || row.state === "read",
  ).length;

  const categories = await buildCategories(db, {
    relationshipId: relationship.id,
    since,
    reminderRows: eligible,
  });

  if (eligible.length < 5) {
    return {
      label: "not_enough_data",
      counts: { sent, opened, loggedAfter: 0, loggedBefore: 0 },
      categories,
    };
  }

  const complianceRows = await db
    .select()
    .from(mealCompliance)
    .where(
      and(
        eq(mealCompliance.coachingRelationshipId, relationship.id),
        gte(mealCompliance.loggedAt, since),
      ),
    );

  const workoutExecRows = await db
    .select()
    .from(workoutExecutions)
    .where(
      and(
        eq(workoutExecutions.coachingRelationshipId, relationship.id),
        gte(workoutExecutions.completedAt, since),
      ),
    );

  const checkinRows = await db
    .select()
    .from(checkins)
    .where(
      and(
        eq(checkins.coachingRelationshipId, relationship.id),
        gte(checkins.submittedAt, since),
      ),
    );

  let loggedBefore = 0;
  let loggedAfter = 0;
  let eligibleItems = 0;

  for (const row of complianceRows) {
    eligibleItems += 1;
    const matching = eligible.find(
      (n) =>
        n.domainEntityId === row.assignmentId &&
        n.notificationType === "meal_reminder",
    );
    if (!matching) {
      loggedBefore += 1;
      continue;
    }
    if (row.loggedAt > matching.createdAt) {
      loggedAfter += 1;
    } else {
      loggedBefore += 1;
    }
  }

  for (const row of workoutExecRows) {
    if (!row.completedAt) continue;
    eligibleItems += 1;
    const matching = eligible.find(
      (n) =>
        n.domainEntityId === row.assignmentId &&
        n.notificationType === "workout_reminder",
    );
    if (!matching) {
      loggedBefore += 1;
      continue;
    }
    if (row.completedAt > matching.createdAt) {
      loggedAfter += 1;
    } else {
      loggedBefore += 1;
    }
  }

  for (const row of checkinRows) {
    if (!row.submittedAt) continue;
    eligibleItems += 1;
    const matching = eligible.find(
      (n) =>
        n.domainEntityId === row.id && n.notificationType === "checkin_reminder",
    );
    if (!matching) {
      loggedBefore += 1;
      continue;
    }
    if (row.submittedAt > matching.createdAt) {
      loggedAfter += 1;
    } else {
      loggedBefore += 1;
    }
  }

  const itemCount = Math.max(eligibleItems, eligible.length);
  const beforeRatio = itemCount > 0 ? loggedBefore / itemCount : 0;

  const consecutiveMisses = countConsecutiveMisses(eligible, {
    complianceRows,
    workoutExecRows,
    checkinRows,
  });

  let label: ResponsivenessLabel = "responds";
  if (beforeRatio >= 0.7 && loggedBefore >= 1) {
    label = "logs_on_own";
  } else if (consecutiveMisses >= 3) {
    label = "often_misses";
  } else if (loggedAfter >= loggedBefore && loggedAfter > 0) {
    label = "responds";
  }

  return {
    label,
    counts: { sent, opened, loggedAfter, loggedBefore },
    categories,
  };
}

function countConsecutiveMisses(
  reminders: Array<(typeof notifications.$inferSelect)>,
  logs: {
    complianceRows: Array<(typeof mealCompliance.$inferSelect)>;
    workoutExecRows: Array<(typeof workoutExecutions.$inferSelect)>;
    checkinRows: Array<(typeof checkins.$inferSelect)>;
  },
): number {
  const sorted = [...reminders]
    .filter((r) => r.state !== "suppressed")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let maxStreak = 0;
  let streak = 0;
  for (const reminder of sorted) {
    const loggedWithin2h = logWithinTwoHours(reminder, logs);
    if (!loggedWithin2h) {
      streak += 1;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      streak = 0;
    }
  }
  return maxStreak;
}

function logWithinTwoHours(
  reminder: (typeof notifications.$inferSelect),
  logs: {
    complianceRows: Array<(typeof mealCompliance.$inferSelect)>;
    workoutExecRows: Array<(typeof workoutExecutions.$inferSelect)>;
    checkinRows: Array<(typeof checkins.$inferSelect)>;
  },
): boolean {
  const deadline = Date.parse(reminder.createdAt) + TWO_HOURS_MS;
  if (reminder.notificationType === "meal_reminder") {
    const row = logs.complianceRows.find(
      (r) => r.assignmentId === reminder.domainEntityId,
    );
    return row ? Date.parse(row.loggedAt) <= deadline : false;
  }
  if (reminder.notificationType === "workout_reminder") {
    const row = logs.workoutExecRows.find(
      (r) => r.assignmentId === reminder.domainEntityId,
    );
    return row?.completedAt ? Date.parse(row.completedAt) <= deadline : false;
  }
  if (reminder.notificationType === "checkin_reminder") {
    const row = logs.checkinRows.find((r) => r.id === reminder.domainEntityId);
    return row?.submittedAt ? Date.parse(row.submittedAt) <= deadline : false;
  }
  return false;
}

async function buildCategories(
  db: Db,
  input: {
    relationshipId: string;
    since: string;
    reminderRows: Array<(typeof notifications.$inferSelect)>;
  },
): Promise<ResponsivenessResponse["categories"]> {
  void db;
  const byType = (type: ReminderType) =>
    input.reminderRows.filter((r) => r.notificationType === type);

  const mealRows = byType("meal_reminder");
  const workoutRows = byType("workout_reminder");
  const checkinReminderRows = byType("checkin_reminder");

  const [complianceRows, workoutExecRows, checkinRows] = await Promise.all([
    db
      .select()
      .from(mealCompliance)
      .where(
        and(
          eq(mealCompliance.coachingRelationshipId, input.relationshipId),
          gte(mealCompliance.loggedAt, input.since),
        ),
      ),
    db
      .select()
      .from(workoutExecutions)
      .where(
        and(
          eq(workoutExecutions.coachingRelationshipId, input.relationshipId),
          gte(workoutExecutions.completedAt, input.since),
        ),
      ),
    db
      .select()
      .from(checkins)
      .where(
        and(
          eq(checkins.coachingRelationshipId, input.relationshipId),
          gte(checkins.submittedAt, input.since),
        ),
      ),
  ]);

  return {
    workouts: categoryFromReminders(workoutRows, (reminder) => {
      const exec = workoutExecRows.find(
        (r) => r.assignmentId === reminder.domainEntityId,
      );
      if (!exec?.completedAt) return "none";
      return exec.completedAt > reminder.createdAt ? "after" : "own";
    }),
    meals: categoryFromReminders(mealRows, (reminder) => {
      const row = complianceRows.find(
        (r) => r.assignmentId === reminder.domainEntityId,
      );
      if (!row) return "none";
      return row.loggedAt > reminder.createdAt ? "after" : "own";
    }),
    checkins: categoryFromReminders(checkinReminderRows, (reminder) => {
      const row = checkinRows.find((r) => r.id === reminder.domainEntityId);
      if (!row?.submittedAt) return "none";
      return row.submittedAt > reminder.createdAt ? "after" : "own";
    }),
  };
}

function categoryFromReminders(
  rows: Array<(typeof notifications.$inferSelect)>,
  classify: (
    reminder: (typeof notifications.$inferSelect),
  ) => "after" | "own" | "none",
): ResponsivenessCategoryCounts {
  if (rows.length === 0) return emptyCategory();
  const suppressed = rows.filter((r) => r.state === "suppressed").length;
  const active = rows.filter((r) => r.state !== "suppressed");
  let loggedAfter = 0;
  let loggedOnOwn = 0;
  let notLogged = 0;
  for (const reminder of active) {
    const outcome = classify(reminder);
    if (outcome === "after") loggedAfter += 1;
    else if (outcome === "own") loggedOnOwn += 1;
    else notLogged += 1;
  }
  return {
    sent: active.length,
    opened: openedCount(active),
    loggedAfter,
    loggedOnOwn,
    notLogged,
    suppressed,
  };
}

export async function deriveReengagementCandidates(
  db: Db,
  input: {
    relationships: Array<(typeof coachingRelationships.$inferSelect)>;
    nowIso: string;
  },
) {
  const active = input.relationships.filter((r) => r.status === "active");
  if (active.length === 0) return [];

  const traineeIds = active.map((r) => r.traineeUserId);
  const profiles = await db
    .select()
    .from(traineeProfiles)
    .where(inArray(traineeProfiles.userId, traineeIds));
  const nameByUser = new Map(profiles.map((p) => [p.userId, p.displayName]));

  const identities = await db
    .select({
      userId: userIdentities.userId,
      mobileE164: userIdentities.mobileE164,
    })
    .from(userIdentities)
    .where(inArray(userIdentities.userId, traineeIds));
  const phoneByUser = new Map(
    identities.map((row) => [row.userId, row.mobileE164]),
  );

  const since48h = new Date(
    Date.parse(input.nowIso) - 2 * 86_400_000,
  ).toISOString();
  const items = [];
  for (const rel of active) {
    const recentLog = await db
      .select({ id: mealCompliance.id })
      .from(mealCompliance)
      .where(
        and(
          eq(mealCompliance.coachingRelationshipId, rel.id),
          gte(mealCompliance.loggedAt, since48h),
        ),
      )
      .limit(1);
    if (recentLog[0]) continue;

    const recentReminders = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.coachingRelationshipId, rel.id),
          gte(notifications.createdAt, since48h),
        ),
      )
      .limit(10);
    if (recentReminders.length < 3) continue;

    const clientWhatsappE164 = phoneByUser.get(rel.traineeUserId) ?? null;
    const waMeUrl = clientWhatsappE164
      ? whatsappHref({
          phoneE164: clientWhatsappE164,
          draftText:
            "Hi — checking in on your FitBud plan. Reply when you can log today.",
        })
      : "https://wa.me/";
    items.push({
      relationshipId: rel.id,
      traineeDisplayName: nameByUser.get(rel.traineeUserId) ?? "Client",
      waMeUrl,
      clientWhatsappE164,
    });
  }
  return items;
}
