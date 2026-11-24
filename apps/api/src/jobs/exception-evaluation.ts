import { and, asc, eq, gt, sql } from "drizzle-orm";
import { createDb, type Db } from "../db/client.js";
import { coachingRelationships, scheduledJobs } from "../db/schema.js";
import {
  evaluateDueExceptions,
  exceptionEvaluationDedupeKey,
} from "../domain/exceptions.js";
import { writeStructuredLog, type SafeLogFields } from "../lib/log.js";
import type { Env } from "../types.js";

/**
 * Z14-1 / D-W14-8: exception evaluation on the existing 5-minute cron. Needs
 * you reads stored exceptions; trainee writes evaluate right after they land
 * and a read evaluates clients last evaluated more than 15 minutes ago. This
 * sweep evaluates the same "due" clients when nobody is reading, so items that
 * come from time passing (a meal or workout window closing) are stored within
 * one tick of becoming due, even with no trainer looking.
 *
 * Bounded: active relationships are read in pages of PAGE_SIZE (keyset on id),
 * each page is one batched evaluation (a read batch and a write batch), and a
 * run stops after MAX_PAGES. A page that fails is counted and skipped, so one
 * bad page never stops the rest; the run then throws a static error so the
 * cron runner logs it and the platform records the run as failed. Logs carry
 * counts only. Never resolves anything (only the trainer resolves), and ended
 * relationships are never evaluated.
 */
export const EXCEPTION_SWEEP_PAGE_SIZE = 90;
export const EXCEPTION_SWEEP_MAX_PAGES = 50;

export type ExceptionSweepCounts = {
  relationshipsChecked: number;
  relationshipsEvaluated: number;
  pagesFailed: number;
};

export class ExceptionSweepFailed extends Error {
  constructor() {
    super("Exception evaluation failed for at least one page.");
    this.name = "ExceptionSweepFailed";
  }
}

async function loadPage(db: Db, afterId: string | null) {
  return db
    .select({
      id: coachingRelationships.id,
      status: coachingRelationships.status,
      evaluatedAt: sql<string | null>`${scheduledJobs.updatedAt}`.as("evaluated_at"),
    })
    .from(coachingRelationships)
    .leftJoin(
      scheduledJobs,
      eq(
        scheduledJobs.dedupeKey,
        sql`${exceptionEvaluationDedupeKey("")} || ${coachingRelationships.id}`,
      ),
    )
    .where(
      and(
        eq(coachingRelationships.status, "active"),
        afterId ? gt(coachingRelationships.id, afterId) : undefined,
      ),
    )
    .orderBy(asc(coachingRelationships.id))
    .limit(EXCEPTION_SWEEP_PAGE_SIZE);
}

export async function runExceptionEvaluationSweep(
  db: Db,
  now: string,
): Promise<ExceptionSweepCounts> {
  const counts: ExceptionSweepCounts = {
    relationshipsChecked: 0,
    relationshipsEvaluated: 0,
    pagesFailed: 0,
  };
  let afterId: string | null = null;
  for (let page = 0; page < EXCEPTION_SWEEP_MAX_PAGES; page += 1) {
    const rows = await loadPage(db, afterId);
    if (rows.length === 0) break;
    afterId = rows[rows.length - 1]!.id;
    counts.relationshipsChecked += rows.length;
    try {
      const evaluated = await evaluateDueExceptions(db, rows, now);
      counts.relationshipsEvaluated += evaluated.length;
    } catch {
      // Counts only: no ids, no error text (it can carry SQL values).
      counts.pagesFailed += 1;
    }
    if (rows.length < EXCEPTION_SWEEP_PAGE_SIZE) break;
  }
  return counts;
}

export async function handleScheduledExceptionEvaluation(
  env: Env,
  at: Date,
): Promise<ExceptionSweepCounts> {
  const counts = await runExceptionEvaluationSweep(createDb(env.DB), at.toISOString());
  writeStructuredLog({
    level: counts.pagesFailed > 0 ? "warn" : "info",
    message: "exception_evaluation.completed",
    operation: "cron.exception_evaluation",
    ...counts,
  } as SafeLogFields & ExceptionSweepCounts);
  if (counts.pagesFailed > 0) throw new ExceptionSweepFailed();
  return counts;
}
