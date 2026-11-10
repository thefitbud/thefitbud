import { and, eq, exists, isNull, notExists, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  coachingRelationships,
  deviceTokens,
  reactivationRequests,
  userIdentities,
  users,
  webSessions,
} from "../db/schema.js";
import { endCoachingRelationship } from "./relationship-lifecycle.js";

/**
 * Z6-14 (D-W6-7, D-W6-8, D-W6-27, D-W6-31): deleting an account archives it for
 * 6 calendar months. Reactivation is a new sign-in plus one confirm. The purge
 * itself is Z6-17's (jobs/account-purge.ts).
 */

/** How long an archived account is kept before the purge may remove it. */
export const ACCOUNT_ARCHIVE_MONTHS = 6;

/** Deletion needs a sign-in no older than this (D-W6-31). */
export const ACCOUNT_DELETION_PROOF_WINDOW_MS = 5 * 60_000;

/** Clock skew tolerated for a sign-in time slightly in the future. */
const PROOF_CLOCK_SKEW_MS = 60_000;

export type AccountStateRow = {
  accountState: "active" | "disabled" | "archived";
  archivedAt: string | null;
  purgeAfter: string | null;
};

/**
 * `iso` plus `months` calendar months in UTC, keeping the time of day. A day that
 * does not exist in the target month is clamped to its last day (31 Aug + 6
 * months = 28 Feb, or 29 Feb in a leap year).
 */
export function addCalendarMonthsUtc(iso: string, months: number): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error("INVALID_INSTANT");
  }
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDay);
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      day,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  ).toISOString();
}

/** True when the sign-in at `authTime` is recent enough to delete the account. */
export function isFreshDeletionProof(
  authTime: string | null | undefined,
  now: string,
): boolean {
  if (!authTime) return false;
  const signedIn = Date.parse(authTime);
  const at = Date.parse(now);
  if (Number.isNaN(signedIn) || Number.isNaN(at)) return false;
  if (signedIn > at + PROOF_CLOCK_SKEW_MS) return false;
  return at - signedIn <= ACCOUNT_DELETION_PROOF_WINDOW_MS;
}

/**
 * True when the sign-in at `authTime` happened after the account was archived,
 * so reactivation is "signing in again" (D-W6-8), never a credential that was
 * already live before the deletion. Firebase `auth_time` has second precision.
 */
export function signedInAfterArchive(
  authTime: string | null | undefined,
  archivedAt: string,
): boolean {
  if (!authTime) return false;
  const signedIn = Date.parse(authTime);
  const archived = Date.parse(archivedAt);
  if (Number.isNaN(signedIn) || Number.isNaN(archived)) return false;
  return signedIn >= Math.floor(archived / 1000) * 1000;
}

export async function loadAccountState(
  db: Db,
  userId: string,
): Promise<AccountStateRow | null> {
  const [row] = await db
    .select({
      accountState: users.accountState,
      archivedAt: users.archivedAt,
      purgeAfter: users.purgeAfter,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

async function hasActiveClients(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: coachingRelationships.id })
    .from(coachingRelationships)
    .where(
      and(
        eq(coachingRelationships.trainerUserId, userId),
        eq(coachingRelationships.status, "active"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function activeTraineeRelationshipIds(db: Db, userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: coachingRelationships.id })
    .from(coachingRelationships)
    .where(
      and(
        eq(coachingRelationships.traineeUserId, userId),
        eq(coachingRelationships.status, "active"),
      ),
    );
  return rows.map((row) => row.id);
}

export type ArchiveAccountResult =
  | { kind: "archived"; archivedAt: string; purgeAfter: string }
  | { kind: "active_clients" }
  | { kind: "not_active" };

/**
 * Archives an active account (D-W6-31 order):
 * 1. a trainer with an active client is refused (`active_clients`);
 * 2. every active relationship where the user is the trainee is ended through
 *    the existing `endCoachingRelationship` (exceptions close with
 *    `coaching_ended`, schedules and reminders stop);
 * 3. one batch archives the account (only while it is active and has no active
 *    relationship), revokes its web sessions and device tokens and cancels
 *    pending reactivation requests on its relationships (D-W6-35). Device tokens
 *    are revoked, not deleted: `notification_deliveries` references them.
 *
 * Retry-safe: a crash after step 2 leaves the relationships ended and the
 * account active, and a retry finishes the job. Data is otherwise untouched.
 */
export async function archiveAccount(
  db: Db,
  input: { userId: string; now: string },
): Promise<ArchiveAccountResult> {
  // A relationship can start between step 2 and step 3 (an invitation accepted
  // in between); the guarded batch then changes nothing and step 2 runs again.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const state = await loadAccountState(db, input.userId);
    if (!state || state.accountState !== "active") {
      return { kind: "not_active" };
    }
    if (await hasActiveClients(db, input.userId)) {
      return { kind: "active_clients" };
    }

    for (const relationshipId of await activeTraineeRelationshipIds(db, input.userId)) {
      await endCoachingRelationship(db, {
        relationshipId,
        endedByUserId: input.userId,
        reason: null,
      });
    }

    const archivedAt = input.now;
    const purgeAfter = addCalendarMonthsUtc(archivedAt, ACCOUNT_ARCHIVE_MONTHS);
    // The revokes run only when the account is archived at this call's instant,
    // so a refused archive signs nobody out. Two calls that read the same
    // millisecond both pass this guard; the loser's revokes then match nothing,
    // because each statement skips rows that are already revoked or cancelled.
    // Whether this call archived the account is decided from the UPDATE's row
    // count below, never from the timestamp.
    const archivedByThisCall = exists(
      db
        .select({ one: sql`1` })
        .from(users)
        .where(
          and(
            eq(users.id, input.userId),
            eq(users.accountState, "archived"),
            eq(users.archivedAt, archivedAt),
          ),
        ),
    );
    const [archived] = await db.batch([
      // State and both dates in one write: the 0038 CHECKs need all three (D-W6-27).
      db
        .update(users)
        .set({
          accountState: "archived",
          archivedAt,
          purgeAfter,
          updatedAt: archivedAt,
        })
        .where(
          and(
            eq(users.id, input.userId),
            eq(users.accountState, "active"),
            notExists(
              db
                .select({ one: sql`1` })
                .from(coachingRelationships)
                .where(
                  and(
                    eq(coachingRelationships.status, "active"),
                    or(
                      eq(coachingRelationships.trainerUserId, input.userId),
                      eq(coachingRelationships.traineeUserId, input.userId),
                    ),
                  ),
                ),
            ),
          ),
        ),
      revokeAllWebSessions(db, input.userId, archivedAt, archivedByThisCall),
      revokeAllDeviceTokens(db, input.userId, archivedAt, archivedByThisCall),
      cancelPendingReactivations(db, input.userId, archivedAt, archivedByThisCall),
    ]);

    // D1 runs the batch as one transaction, so exactly one of two concurrent
    // calls changes the users row; the other gets zero changes and answers
    // `not_active` (403 ACCOUNT_ARCHIVED) even when both read the same
    // millisecond (D-W6-35, Z7-30).
    if (archived.meta.changes === 1) {
      return { kind: "archived", archivedAt, purgeAfter };
    }
    if (archived.meta.changes !== 0) {
      throw new Error("archiveAccount changed more than one users row");
    }
    const after = await loadAccountState(db, input.userId);
    if (after?.accountState !== "active") {
      // Archived (or disabled) by a concurrent request; this call changed nothing.
      return { kind: "not_active" };
    }
  }
  throw new Error("ACCOUNT_ARCHIVE_CONFLICT");
}

/** Revokes every live web session of the user (signs out every browser). */
export function revokeAllWebSessions(
  db: Db,
  userId: string,
  now: string,
  guard: SQL,
) {
  return db
    .update(webSessions)
    .set({ revokedAt: now })
    .where(and(eq(webSessions.userId, userId), isNull(webSessions.revokedAt), guard));
}

/** Revokes every active device token of the user (no more pushes to any device). */
export function revokeAllDeviceTokens(
  db: Db,
  userId: string,
  now: string,
  guard: SQL,
) {
  return db
    .update(deviceTokens)
    .set({ status: "revoked", updatedAt: now })
    .where(
      and(eq(deviceTokens.userId, userId), eq(deviceTokens.status, "active"), guard),
    );
}

/**
 * Cancels every pending reactivation request on a relationship where the user is
 * trainer or trainee (D-W6-35), the same way ending coaching does, so an
 * archived account never regains an active relationship through a request sent
 * before the deletion.
 */
export function cancelPendingReactivations(
  db: Db,
  userId: string,
  now: string,
  guard: SQL,
) {
  return db
    .update(reactivationRequests)
    .set({ status: "cancelled", resolvedAt: now })
    .where(
      and(
        eq(reactivationRequests.status, "pending"),
        exists(
          db
            .select({ one: sql`1` })
            .from(coachingRelationships)
            .where(
              and(
                eq(coachingRelationships.id, reactivationRequests.relationshipId),
                or(
                  eq(coachingRelationships.trainerUserId, userId),
                  eq(coachingRelationships.traineeUserId, userId),
                ),
              ),
            ),
        ),
        guard,
      ),
    );
}

export type ReactivateAccountResult =
  | { kind: "reactivated" }
  | { kind: "already_active" }
  | { kind: "purge_due" }
  | { kind: "not_archived" };

/**
 * Archived → active, clearing both dates in the same write (D-W6-27). Refused
 * once `purge_after` has passed: the account is due for the purge (including
 * the support runbook's "delete now"). Relationships stay ended (D-W6-8).
 */
export async function reactivateAccount(
  db: Db,
  input: { userId: string; now: string },
): Promise<ReactivateAccountResult> {
  const state = await loadAccountState(db, input.userId);
  if (!state) return { kind: "not_archived" };
  if (state.accountState === "active") return { kind: "already_active" };
  if (state.accountState !== "archived") return { kind: "not_archived" };
  if (!state.purgeAfter || state.purgeAfter <= input.now) {
    return { kind: "purge_due" };
  }
  await db
    .update(users)
    .set({
      accountState: "active",
      archivedAt: null,
      purgeAfter: null,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(users.id, input.userId),
        eq(users.accountState, "archived"),
        sql`${users.purgeAfter} > ${input.now}`,
      ),
    );
  const after = await loadAccountState(db, input.userId);
  if (after?.accountState === "active") return { kind: "reactivated" };
  return after?.accountState === "archived" ? { kind: "purge_due" } : { kind: "not_archived" };
}

/**
 * True when the identity behind `by` is an archived account. Invitations use it
 * to refuse inviting, or accepting as, an archived account (D-W6-31).
 */
export async function isArchivedAccount(
  db: Db,
  by: { userId: string } | { firebaseUid: string } | { emailNorm: string },
): Promise<boolean> {
  if ("emailNorm" in by) {
    const [row] = await db
      .select({ id: users.id })
      .from(userIdentities)
      .innerJoin(users, eq(users.id, userIdentities.userId))
      .where(
        and(
          eq(userIdentities.emailNorm, by.emailNorm),
          eq(users.accountState, "archived"),
        ),
      )
      .limit(1);
    return Boolean(row);
  }
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        "userId" in by
          ? eq(users.id, by.userId)
          : eq(users.firebaseUid, by.firebaseUid),
        eq(users.accountState, "archived"),
      ),
    )
    .limit(1);
  return Boolean(row);
}
