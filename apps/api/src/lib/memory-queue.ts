import type { ReminderQueueMessage } from "@fitbud/contracts";

/** In-memory queue producer for unit tests without Cloudflare Queues. */
export type MemoryJobsQueue = {
  send(message: ReminderQueueMessage): Promise<void>;
  drain(): ReminderQueueMessage[];
  peek(): ReminderQueueMessage[];
};

export function createMemoryJobsQueue(): MemoryJobsQueue {
  const messages: ReminderQueueMessage[] = [];
  return {
    async send(message) {
      messages.push(message);
    },
    drain() {
      return messages.splice(0, messages.length);
    },
    peek() {
      return [...messages];
    },
  };
}
