import { replenishRollingHorizons } from "../domain/assignment-schedule";
import { createDb } from "../db/client";
import type { Env } from "../types";

/**
 * Cron entry for the rolling seven-day assignment horizon.
 * Separate from reminder evaluation. Active relationships only.
 */
export async function handleScheduledReplenishment(
  env: Env,
  scheduledTime: Date = new Date(),
): Promise<void> {
  const db = createDb(env.DB);
  await replenishRollingHorizons(db, scheduledTime.toISOString());
}
