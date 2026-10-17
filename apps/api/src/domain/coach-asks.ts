import { and, eq, lt } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { coachAsks } from "../db/schema.js";
import { nowIso } from "../lib/crypto.js";

export async function expireStaleCoachAsks(db: Db, now: string): Promise<number> {
  const cutoff = new Date(Date.parse(now) - 7 * 86_400_000).toISOString();
  const open = await db
    .select({ id: coachAsks.id })
    .from(coachAsks)
    .where(and(eq(coachAsks.status, "open"), lt(coachAsks.lastAskedAt, cutoff)));
  for (const row of open) {
    await db
      .update(coachAsks)
      .set({ status: "expired" })
      .where(eq(coachAsks.id, row.id));
  }
  return open.length;
}

export async function runCoachAskMaintenance(db: Db): Promise<void> {
  await expireStaleCoachAsks(db, nowIso());
}
