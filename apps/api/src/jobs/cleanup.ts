import { and, asc, eq, inArray, lt, sql, type SQL } from "drizzle-orm";
import { createDb, type Db } from "../db/client.js";
import { notificationDeliveries as deliveriesTable, notifications } from "../db/schema.js";
import { writeStructuredLog, type SafeLogFields } from "../lib/log.js";
import type { Env } from "../types.js";

/**
 * Z14-4: the daily cleanup of rows that have done their job. It runs from the
 * existing 5-minute cron, once a day, on the tick at CLEANUP_UTC_HOUR:00 UTC
 * (02:30 IST, the quietest hour for Indian users).
 *
 * What it deletes, and nothing else:
 * - idempotency_records whose `expires_at` has passed. An expired record is
 *   already ignored by the lookup (`expires_at > now`, lib/idempotency.ts).
 * - sync_mutations verdicts with result `applied` or `already_applied` older
 *   than 30 days. Rejected and conflicted verdicts are kept (rare, and they are
 *   the record of what the server refused).
 * - web_sessions that are revoked or expired. Either kind already fails auth.
 * - auth_otps (sign-in codes) that are used, invalidated or expired, once they
 *   are a day old. Sign-in rate limits live in auth_rate_limits, not here.
 * - notifications in state `read` created more than 90 days ago, with their
 *   notification_deliveries rows (the foreign key has no cascade). The
 *   responsiveness label reads at most 90 days back. Unread, pending, queued,
 *   deferred, failed and suppressed notifications are never deleted.
 *
 * Coaching records (plans, logs, check-ins, exceptions, notes, change log,
 * media, payments) are never touched.
 *
 * Bounded: each kind deletes at most CLEANUP_BATCH_SIZE rows per statement and
 * at most CLEANUP_MAX_BATCHES statements per run, so one run stays short and
 * within D1's per-invocation query budget; a backlog drains over the following
 * days. Safe to repeat: every statement re-selects what is still eligible.
 */

/** 21:00 UTC = 02:30 IST. */
export const CLEANUP_UTC_HOUR = 21;
export const CLEANUP_BATCH_SIZE = 500;
export const CLEANUP_MAX_BATCHES = 4;

const DAY_MS = 86_400_000;
export const SYNC_VERDICT_RETENTION_DAYS = 30;
export const READ_NOTIFICATION_RETENTION_DAYS = 90;
export const LOGIN_CODE_RETENTION_DAYS = 1;

export type CleanupCounts = {
  idempotencyRecords: number;
  syncVerdicts: number;
  expiredWebLogins: number;
  loginCodes: number;
  readNotifications: number;
  notificationDeliveries: number;
};

export type CleanupOptions = {
  batchSize?: number;
  maxBatches?: number;
};

/**
 * True on the one cron tick a day that runs the cleanup. The cron fires every
 * 5 minutes on the minute boundary, so minutes 0–4 of the hour hold exactly one
 * tick (a late-delivered tick still counts; a skipped one waits a day).
 */
export function isDailyCleanupTick(at: Date): boolean {
  return at.getUTCHours() === CLEANUP_UTC_HOUR && at.getUTCMinutes() < 5;
}

function changesOf(result: unknown): number {
  const meta = (result as { meta?: { changes?: unknown } } | null)?.meta;
  return typeof meta?.changes === "number" ? meta.changes : 0;
}

/** Repeats `deleteBatch` until it deletes fewer than a full batch, or the cap. */
async function drain(
  deleteBatch: (limit: number) => Promise<number>,
  options: Required<CleanupOptions>,
): Promise<number> {
  let total = 0;
  for (let i = 0; i < options.maxBatches; i += 1) {
    const deleted = await deleteBatch(options.batchSize);
    total += deleted;
    if (deleted < options.batchSize) break;
  }
  return total;
}

/** `DELETE FROM <table> WHERE id IN (SELECT id … WHERE <predicate> LIMIT n)`. */
function boundedDelete(db: Db, table: string, predicate: SQL) {
  return async (limit: number) =>
    changesOf(
      await db.run(
        sql`DELETE FROM ${sql.identifier(table)} WHERE id IN (SELECT id FROM ${sql.identifier(table)} WHERE ${predicate} LIMIT ${limit})`,
      ),
    );
}

export async function runCleanup(
  db: Db,
  now: Date,
  options: CleanupOptions = {},
): Promise<CleanupCounts> {
  const opts: Required<CleanupOptions> = {
    batchSize: options.batchSize ?? CLEANUP_BATCH_SIZE,
    maxBatches: options.maxBatches ?? CLEANUP_MAX_BATCHES,
  };
  const nowIso = now.toISOString();
  const syncCutoff = new Date(now.getTime() - SYNC_VERDICT_RETENTION_DAYS * DAY_MS).toISOString();
  const notificationCutoff = new Date(now.getTime() - READ_NOTIFICATION_RETENTION_DAYS * DAY_MS).toISOString();
  const loginCodeCutoff = new Date(now.getTime() - LOGIN_CODE_RETENTION_DAYS * DAY_MS).toISOString();

  const idempotencyRecords = await drain(
    boundedDelete(db, "idempotency_records", sql`expires_at < ${nowIso}`),
    opts,
  );
  const syncVerdicts = await drain(
    boundedDelete(
      db,
      "sync_mutations",
      sql`result_status IN ('applied', 'already_applied') AND created_at < ${syncCutoff}`,
    ),
    opts,
  );
  const expiredWebLogins = await drain(
    boundedDelete(db, "web_sessions", sql`revoked_at IS NOT NULL OR expires_at < ${nowIso}`),
    opts,
  );
  const loginCodes = await drain(
    boundedDelete(
      db,
      "auth_otps",
      sql`(consumed_at IS NOT NULL OR invalidated_at IS NOT NULL OR expires_at < ${nowIso}) AND created_at < ${loginCodeCutoff}`,
    ),
    opts,
  );

  // Read notifications: the deliveries first (no cascade), then the rows, in
  // one D1 batch (one transaction), so both statements see the same oldest
  // `limit` rows (ordered on the state/created_at index, id breaks ties).
  let notificationDeliveries = 0;
  const readNotifications = await drain(async (limit) => {
    const eligible = db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.state, "read"), lt(notifications.createdAt, notificationCutoff)))
      .orderBy(asc(notifications.createdAt), asc(notifications.id))
      .limit(limit);
    const [deliveries, rows] = await db.batch([
      db.delete(deliveriesTable).where(inArray(deliveriesTable.notificationId, eligible)),
      db.delete(notifications).where(inArray(notifications.id, eligible)),
    ]);
    notificationDeliveries += changesOf(deliveries);
    return changesOf(rows);
  }, opts);

  return {
    idempotencyRecords,
    syncVerdicts,
    expiredWebLogins,
    loginCodes,
    readNotifications,
    notificationDeliveries,
  };
}

/** Cron entry: runs once a day (see `isDailyCleanupTick`); null on other ticks. */
export async function handleScheduledCleanup(env: Env, at: Date): Promise<CleanupCounts | null> {
  if (!isDailyCleanupTick(at)) return null;
  const counts = await runCleanup(createDb(env.DB), at);
  // Counts only: no ids, no row content.
  writeStructuredLog({
    level: "info",
    message: "cleanup.completed",
    operation: "cron.cleanup",
    ...counts,
  } as SafeLogFields & CleanupCounts);
  return counts;
}
