import { and, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { createDb, type Db } from "../db/client";
import { deviceTokens, notificationDeliveries } from "../db/schema";
import { getExpoPushReceipts, type ExpoClientOptions } from "../lib/expo-push";
import { resolvePushProviderMode } from "../lib/push-provider";
import type { Env } from "../types";

/** Expo keeps receipts for 24 hours and usually has them within 15 minutes. */
export const RECEIPT_MIN_AGE_MS = 15 * 60_000;
export const RECEIPT_MAX_AGE_MS = 24 * 60 * 60_000;

export type PushReceiptRunResult = {
  checked: number;
  receiptErrors: number;
  tokensRevoked: number;
};

/**
 * Reads Expo receipts for accepted deliveries 15 min to 24 h old. A receipt
 * error is recorded in `failure_category`; `provider_status` stays `accepted`
 * (acceptance is not delivery, and receipts never change domain state).
 * `DeviceNotRegistered` revokes the delivery's device token.
 */
export async function checkExpoPushReceipts(
  db: Db,
  options: ExpoClientOptions & { now?: Date } = {},
): Promise<PushReceiptRunResult> {
  const now = options.now ?? new Date();
  const oldest = new Date(now.getTime() - RECEIPT_MAX_AGE_MS).toISOString();
  const newest = new Date(now.getTime() - RECEIPT_MIN_AGE_MS).toISOString();
  const rows = await db
    .select({
      id: notificationDeliveries.id,
      ticketId: notificationDeliveries.providerMessageId,
      deviceTokenId: notificationDeliveries.deviceTokenId,
    })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.providerStatus, "accepted"),
        isNotNull(notificationDeliveries.providerMessageId),
        // A receipt error already recorded is final.
        isNull(notificationDeliveries.failureCategory),
        gte(notificationDeliveries.acceptedAt, oldest),
        lte(notificationDeliveries.acceptedAt, newest),
      ),
    );
  const result: PushReceiptRunResult = { checked: rows.length, receiptErrors: 0, tokensRevoked: 0 };
  if (rows.length === 0) return result;

  const receipts = await getExpoPushReceipts(
    rows.map((row) => row.ticketId!),
    options,
  );
  const revoke = new Set<string>();
  const updatedAt = now.toISOString();
  for (const row of rows) {
    const receipt = receipts.get(row.ticketId!);
    if (!receipt || receipt.ok) continue;
    result.receiptErrors += 1;
    await db
      .update(notificationDeliveries)
      .set({ failureCategory: receipt.failureCategory, updatedAt })
      .where(eq(notificationDeliveries.id, row.id));
    if (receipt.failureCategory === "DeviceNotRegistered" && row.deviceTokenId) {
      revoke.add(row.deviceTokenId);
    }
  }
  const ids = [...revoke];
  // D1 caps bound parameters per statement; revoke in small chunks.
  for (let i = 0; i < ids.length; i += 50) {
    const revoked = await db
      .update(deviceTokens)
      .set({ status: "revoked", updatedAt })
      .where(and(inArray(deviceTokens.id, ids.slice(i, i + 50)), eq(deviceTokens.status, "active")))
      .returning({ id: deviceTokens.id });
    result.tokensRevoked += revoked.length;
  }
  return result;
}

/** Cron entry: runs only in `expo` mode, so local and test never call exp.host. */
export async function handleScheduledPushReceipts(
  env: Env,
  scheduledTime: Date = new Date(),
): Promise<PushReceiptRunResult | null> {
  if (resolvePushProviderMode(env.PUSH_PROVIDER_MODE) !== "expo") return null;
  return checkExpoPushReceipts(createDb(env.DB), {
    accessToken: env.EXPO_ACCESS_TOKEN,
    now: scheduledTime,
  });
}
