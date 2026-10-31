import { reminderQueueMessageSchema } from "@fitbud/contracts";
import { createDb } from "../db/client";
import {
  deliverReminderMessage,
  evaluateAndEnqueueReminders,
} from "../domain/reminders";
import { resolvePushProviderMode } from "../lib/push-provider";
import type { Env } from "../types";

/**
 * Cron Trigger entry: evaluate due reminders from authoritative schedules
 * and completion state, then enqueue deduplicated delivery jobs.
 */
export async function handleScheduledReminders(
  env: Env,
  scheduledTime: Date = new Date(),
): Promise<void> {
  const db = createDb(env.DB);
  const queue = env.REMINDER_QUEUE
    ? {
        send: async (message: { notificationId: string; deliveryId: string }) => {
          await env.REMINDER_QUEUE!.send(message);
        },
      }
    : null;

  await evaluateAndEnqueueReminders(db, {
    now: scheduledTime.toISOString(),
    queue,
    pushProviderMode: resolvePushProviderMode(env.PUSH_PROVIDER_MODE),
    expoAccessToken: env.EXPO_ACCESS_TOKEN,
    deliverInline: !queue,
  });
}

/**
 * Queue consumer: send push via the provider (Expo, or the local double) and record provider
 * acceptance separately from application completion.
 */
export async function handleReminderQueueBatch(
  batch: MessageBatch<unknown>,
  env: Env,
): Promise<void> {
  const db = createDb(env.DB);
  const mode = resolvePushProviderMode(env.PUSH_PROVIDER_MODE);

  for (const message of batch.messages) {
    const parsed = reminderQueueMessageSchema.safeParse(message.body);
    if (!parsed.success) {
      message.ack();
      continue;
    }
    try {
      await deliverReminderMessage(db, parsed.data, mode, undefined, {
        expoAccessToken: env.EXPO_ACCESS_TOKEN,
      });
      message.ack();
    } catch {
      message.retry();
    }
  }
}
