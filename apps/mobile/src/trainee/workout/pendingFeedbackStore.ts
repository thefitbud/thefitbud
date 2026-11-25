import type { AsyncKeyValue } from "../../sync/storage";
import { createOwnedRecords, type OwnedRecords } from "./sheetDrafts";

/**
 * A session rating and note waiting for the finish to sync, kept on the
 * device (Z14-37).
 *
 * `saveWorkoutRating` holds a Save made while the workout's finish is still in
 * the outbox (or the server cannot be reached), and sends it once the finish
 * has been accepted, with the version read from the server (Z14-12). The hold
 * used to live only in that pending call: a restart in between lost the
 * rating and, since Z14-32, a typed note. Now the held change is written here
 * the moment it is held, read back after a restart
 * (`resumeHeldWorkoutFeedback`) and removed once the send has a verdict (the
 * row is then in the outbox, or the server answered).
 *
 * Records are owner-scoped (`createOwnedRecords`): another user on the phone
 * never reads or sends them. A held value older than 72 h (the server's late
 * window) is dropped without an error.
 */

export const PENDING_FEEDBACK_PREFIX = "fitbud.pendingFeedback.v1";
export const PENDING_FEEDBACK_MAX_AGE_MS = 72 * 60 * 60 * 1000;

export type HeldChange = { rpe?: number | null; note?: string | null };

export type HeldFeedback = {
  ownerId: string;
  executionId: string;
  change: HeldChange;
  /** When the trainee first saved it (ms); the 72 h rule counts from here. */
  heldAt: number;
  /** Which hold wrote it: only that hold's verdict removes it. */
  token: string;
};

type StoredHeld = Omit<HeldFeedback, "ownerId" | "executionId" | "heldAt">;

export type PendingFeedbackStore = {
  /** Writes the held change; a change already held for it is merged under it. */
  hold(entry: HeldFeedback): Promise<void>;
  /** Removes the held change if `token` still owns it. */
  release(ownerId: string, executionId: string, token: string): Promise<void>;
  list(ownerId: string): Promise<HeldFeedback[]>;
  clearAll(): Promise<void>;
};

export function createPendingFeedbackStore(options: {
  storage?: () => AsyncKeyValue;
  report?: (where: string, err: unknown) => void;
} = {}): PendingFeedbackStore {
  const records: OwnedRecords<StoredHeld> = createOwnedRecords<StoredHeld>({
    prefix: PENDING_FEEDBACK_PREFIX,
    scope: "workout.feedback.hold",
    storage: options.storage,
    report: options.report,
  });
  return {
    async hold(entry) {
      const existing = await records.get(entry.ownerId, entry.executionId);
      const change = { ...(existing?.value.change ?? {}), ...entry.change };
      const heldAt = existing ? Math.min(existing.savedAt, entry.heldAt) : entry.heldAt;
      await records.put(
        entry.ownerId,
        entry.executionId,
        { change, token: entry.token },
        heldAt,
      );
    },
    async release(ownerId, executionId, token) {
      const existing = await records.get(ownerId, executionId);
      if (existing && existing.value.token === token) {
        await records.remove(ownerId, executionId);
      }
    },
    async list(ownerId) {
      const rows = await records.list(ownerId);
      return rows.map((row) => ({
        ownerId,
        executionId: row.id,
        change: row.value.change ?? {},
        heldAt: row.savedAt,
        token: row.value.token,
      }));
    },
    clearAll() {
      return records.clearAll();
    },
  };
}

/** The app's held ratings and notes, on the device store. */
export const pendingFeedbackStore: PendingFeedbackStore = createPendingFeedbackStore();

/** Explicit sign-out: held ratings and notes go with the unsent logs (TR-20f). */
export async function discardHeldFeedback(): Promise<void> {
  await pendingFeedbackStore.clearAll();
}
