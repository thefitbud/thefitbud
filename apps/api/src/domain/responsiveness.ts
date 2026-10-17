import { and, eq, gte, inArray } from "drizzle-orm";
import type {
  ResponsivenessLabel,
  ResponsivenessResponse,
} from "@fitbud/contracts";
import type { Db } from "../db/client.js";
import { whatsappHref } from "@fitbud/core";
import {
  coachingRelationships,
  deviceTokens,
  mealCompliance,
  notifications,
  reminderStates,
  traineeProfiles,
  trainerProfiles,
} from "../db/schema.js";

export async function deriveResponsiveness(
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
    };
  }

  const tokens = await db
    .select()
    .from(deviceTokens)
    .where(eq(deviceTokens.userId, relationship.traineeUserId));
  if (tokens.length > 0 && tokens.every((t) => t.status === "revoked")) {
    return {
      label: "notifications_off",
      counts: { sent: 0, opened: 0, loggedAfter: 0, loggedBefore: 0 },
    };
  }

  const reminderRows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.coachingRelationshipId, relationship.id),
        gte(notifications.createdAt, since),
      ),
    );

  const sent = reminderRows.length;
  const opened = reminderRows.filter((row) => row.openedAt).length;

  if (sent < 3) {
    return {
      label: "not_enough_data",
      counts: { sent, opened, loggedAfter: 0, loggedBefore: 0 },
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

  let loggedBefore = 0;
  let loggedAfter = 0;
  for (const row of complianceRows) {
    const matching = reminderRows.find(
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

  let label: ResponsivenessLabel = "responds";
  if (loggedBefore >= loggedAfter && loggedBefore >= 2) {
    label = "logs_on_own";
  } else if (loggedAfter === 0 && opened <= sent / 3) {
    label = "often_misses";
  }

  return {
    label,
    counts: { sent, opened, loggedAfter, loggedBefore },
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

  const trainerId = active[0]!.trainerUserId;
  const [trainerProfile] = await db
    .select()
    .from(trainerProfiles)
    .where(eq(trainerProfiles.userId, trainerId))
    .limit(1);

  const since48h = new Date(Date.parse(input.nowIso) - 48 * 86_400_000).toISOString();
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

    const waMeUrl = trainerProfile?.whatsappE164
      ? whatsappHref({
          phoneE164: trainerProfile.whatsappE164,
          draftText:
            "Hi — checking in on your FitBud plan. Reply when you can log today.",
        })
      : "https://wa.me/";
    items.push({
      relationshipId: rel.id,
      traineeDisplayName: nameByUser.get(rel.traineeUserId) ?? "Client",
      waMeUrl,
    });
  }
  return items;
}
