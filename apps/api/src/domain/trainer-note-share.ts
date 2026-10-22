import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  coachingRelationships,
  notifications,
  trainerNotes,
} from "../db/schema.js";
import { nowIso } from "../lib/crypto.js";
import { storeInboxNotification } from "./inbox-notify.js";

const NOTE_PUSH_MERGE_MS = 15 * 60 * 1000;
const NOTE_PUSH_DAILY_CAP = 2;

export async function notifyTraineeNoteShared(
  db: Db,
  input: {
    noteId: string;
    relationshipId: string;
    traineeUserId: string;
    skipPush?: boolean;
  },
): Promise<void> {
  if (input.skipPush) {
    return;
  }
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayStartIso = dayStart.toISOString();

  const sentToday = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientUserId, input.traineeUserId),
        eq(notifications.notificationType, "trainer_note_shared"),
        gte(notifications.createdAt, dayStartIso),
      ),
    );
  if (sentToday.length >= NOTE_PUSH_DAILY_CAP) {
    await storeInboxNotification(db, {
      recipientUserId: input.traineeUserId,
      relationshipId: input.relationshipId,
      notificationType: "trainer_note_shared",
      domainEntityId: input.noteId,
      dedupeKey: `trainer_note_shared:${input.noteId}`,
    });
    return;
  }

  const recent = await db
    .select({ createdAt: notifications.createdAt })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientUserId, input.traineeUserId),
        eq(notifications.notificationType, "trainer_note_shared"),
        eq(notifications.coachingRelationshipId, input.relationshipId),
      ),
    )
    .orderBy(sql`${notifications.createdAt} DESC`)
    .limit(1);
  const lastAt = recent[0]?.createdAt;
  if (lastAt) {
    const elapsed = Date.now() - Date.parse(lastAt);
    if (elapsed < NOTE_PUSH_MERGE_MS) {
      await storeInboxNotification(db, {
        recipientUserId: input.traineeUserId,
        relationshipId: input.relationshipId,
        notificationType: "trainer_note_shared",
        domainEntityId: input.noteId,
        dedupeKey: `trainer_note_shared:${input.noteId}`,
      });
      return;
    }
  }

  await storeInboxNotification(db, {
    recipientUserId: input.traineeUserId,
    relationshipId: input.relationshipId,
    notificationType: "trainer_note_shared",
    domainEntityId: input.noteId,
    dedupeKey: `trainer_note_shared:${input.noteId}`,
  });
}

export async function setTrainerNoteVisibility(
  db: Db,
  input: {
    noteId: string;
    relationshipId: string;
    trainerUserId: string;
    visibility: "private" | "client";
    skipPush?: boolean;
  },
): Promise<typeof trainerNotes.$inferSelect | null> {
  const rel = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.id, input.relationshipId))
    .limit(1);
  const relationship = rel[0];
  if (!relationship || relationship.trainerUserId !== input.trainerUserId) {
    return null;
  }

  const rows = await db
    .select()
    .from(trainerNotes)
    .where(
      and(
        eq(trainerNotes.id, input.noteId),
        eq(trainerNotes.coachingRelationshipId, input.relationshipId),
      ),
    )
    .limit(1);
  const note = rows[0];
  if (!note) {
    return null;
  }

  const now = nowIso();
  if (input.visibility === "client" && note.visibility !== "client") {
    await db
      .update(trainerNotes)
      .set({
        visibility: "client",
        sharedAt: now,
        unsharedAt: null,
        updatedAt: now,
      })
      .where(eq(trainerNotes.id, input.noteId));
    await notifyTraineeNoteShared(db, {
      noteId: input.noteId,
      relationshipId: input.relationshipId,
      traineeUserId: relationship.traineeUserId,
      skipPush: input.skipPush,
    });
  } else if (input.visibility === "private" && note.visibility === "client") {
    await db
      .update(trainerNotes)
      .set({
        visibility: "private",
        unsharedAt: now,
        updatedAt: now,
      })
      .where(eq(trainerNotes.id, input.noteId));
  }

  const updated = await db
    .select()
    .from(trainerNotes)
    .where(eq(trainerNotes.id, input.noteId))
    .limit(1);
  return updated[0] ?? null;
}
