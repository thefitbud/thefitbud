import { inArray } from "drizzle-orm";
import { isTrainerClientNotificationType } from "@fitbud/core";
import type { NotificationType } from "@fitbud/contracts";
import type { Db } from "../db/client.js";
import { coachingRelationships, traineeProfiles } from "../db/schema.js";
import { mapNotification } from "./mappers.js";

type NamedNotificationRow = {
  id: string;
  recipientUserId: string;
  coachingRelationshipId: string | null;
  notificationType: NotificationType;
  domainEntityType:
    | "workout_assignment"
    | "meal_assignment"
    | "checkin"
    | "coaching_relationship";
  domainEntityId: string;
  state:
    | "pending"
    | "queued"
    | "delivered"
    | "read"
    | "failed"
    | "suppressed"
    | "deferred";
  dedupeKey: string;
  createdAt: string;
  readAt: string | null;
};

export async function traineeDisplayNamesByRelationship(
  db: Db,
  relationshipIds: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      relationshipIds.filter((id): id is string => Boolean(id && id.trim())),
    ),
  ];
  if (ids.length === 0) return new Map();

  const rels = await db
    .select({
      id: coachingRelationships.id,
      traineeUserId: coachingRelationships.traineeUserId,
    })
    .from(coachingRelationships)
    .where(inArray(coachingRelationships.id, ids));
  const userIds = [...new Set(rels.map((rel) => rel.traineeUserId))];
  if (userIds.length === 0) return new Map();

  const profiles = await db
    .select({
      userId: traineeProfiles.userId,
      displayName: traineeProfiles.displayName,
    })
    .from(traineeProfiles)
    .where(inArray(traineeProfiles.userId, userIds));
  const nameByUser = new Map<string, string>();
  for (const profile of profiles) {
    const name = profile.displayName.trim();
    if (name) nameByUser.set(profile.userId, name);
  }

  const nameByRelationship = new Map<string, string>();
  for (const rel of rels) {
    const name = nameByUser.get(rel.traineeUserId);
    if (name) nameByRelationship.set(rel.id, name);
  }
  return nameByRelationship;
}

export async function presentNotifications(
  db: Db,
  rows: NamedNotificationRow[],
) {
  const names = await traineeDisplayNamesByRelationship(
    db,
    rows
      .filter((row) => isTrainerClientNotificationType(row.notificationType))
      .map((row) => row.coachingRelationshipId),
  );
  return rows.map((row) => {
    const mapped = mapNotification(row);
    if (
      !row.coachingRelationshipId ||
      !isTrainerClientNotificationType(row.notificationType)
    ) {
      return mapped;
    }
    const clientDisplayName = names.get(row.coachingRelationshipId)?.trim();
    if (!clientDisplayName) return mapped;
    return {
      ...mapped,
      clientDisplayName: clientDisplayName.slice(0, 320),
    };
  });
}
