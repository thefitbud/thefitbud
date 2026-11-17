import type { CoachingRelationship, MeResponse } from "@fitbud/contracts";
import { coachingRelationshipSchema, meResponseSchema } from "@fitbud/contracts";
import { reportError } from "../lib/reportError";
import { deviceStorage, type AsyncKeyValue } from "../sync/storage";

/**
 * The last `/me` and relationships the server gave this user, kept on the
 * phone so a cold start with no network opens the app on cached data instead
 * of the error screen (Z12-41, ISSUE-MAP #9).
 *
 * Privacy, the same rules as the trainer cache (Z11-8):
 * - The snapshot belongs to one user. It is stored with that user's id and
 *   `loadMeSnapshot(userId)` returns it only for the same id, checked against
 *   both the record and the `/me` inside it. It is never read for another user.
 * - It is written only from a `/me` the server answered in this session.
 * - Every path that ends the session clears it (`clearMeSnapshot`).
 * - Clears and saves run in call order, and a save that was asked for before
 *   a clear never lands after it.
 *
 * It holds routing data only (who the user is, their roles, their coaching
 * relationship). A trainer's client list is not kept here: the trainer shell
 * does not route on it.
 */

const SNAPSHOT_KEY = "fitbud.me.snapshot";

export type MeSnapshot = {
  me: MeResponse;
  relationships: CoachingRelationship[];
  /** When the server data was saved (ISO). */
  savedAt: string;
};

type StoredSnapshot = MeSnapshot & { v: 1; userId: string };

let storageOverride: AsyncKeyValue | null = null;
function storage(): AsyncKeyValue {
  return storageOverride ?? deviceStorage().storage;
}

/** Tests only: use this storage instead of the device's. */
export function setMeSnapshotStorageForTests(next: AsyncKeyValue | null): void {
  storageOverride = next;
  epoch += 1;
  queue = Promise.resolve();
}

// One chain keeps writes in call order; the epoch drops a save that a later
// clear has overtaken.
let queue: Promise<void> = Promise.resolve();
let epoch = 0;

function enqueue(job: () => Promise<void>): Promise<void> {
  queue = queue.then(job).catch((error: unknown) => {
    reportError("meSnapshot.write", error);
  });
  return queue;
}

/** Resolves when every queued write has finished. */
export function flushMeSnapshot(): Promise<void> {
  return queue;
}

export function saveMeSnapshot(input: {
  me: MeResponse;
  relationships: CoachingRelationship[];
}): Promise<void> {
  const startedAt = epoch;
  const record: StoredSnapshot = {
    v: 1,
    userId: input.me.userId,
    me: input.me,
    relationships: input.relationships,
    savedAt: new Date().toISOString(),
  };
  return enqueue(async () => {
    if (startedAt !== epoch) return;
    await storage().set(SNAPSHOT_KEY, JSON.stringify(record));
  });
}

/**
 * The snapshot for `userId`, or null. A stored snapshot for anyone else, one
 * that does not parse, or one whose `/me` is not this user's is never
 * returned. A read that throws propagates: the caller treats it as "no
 * snapshot", never as "signed out".
 */
export async function loadMeSnapshot(userId: string): Promise<MeSnapshot | null> {
  await flushMeSnapshot();
  if (!userId) return null;
  const raw = await storage().get(SNAPSHOT_KEY);
  if (!raw) return null;
  let stored: Partial<StoredSnapshot> | null;
  try {
    stored = JSON.parse(raw) as Partial<StoredSnapshot> | null;
  } catch {
    return null;
  }
  if (!stored || stored.v !== 1 || stored.userId !== userId) return null;
  const me = meResponseSchema.safeParse(stored.me);
  if (!me.success || me.data.userId !== userId) return null;
  // A relationship this build cannot read is left out, never guessed at.
  const relationships: CoachingRelationship[] = [];
  for (const item of Array.isArray(stored.relationships) ? stored.relationships : []) {
    const parsed = coachingRelationshipSchema.safeParse(item);
    if (parsed.success) relationships.push(parsed.data);
  }
  return {
    me: me.data,
    relationships,
    savedAt: typeof stored.savedAt === "string" ? stored.savedAt : "",
  };
}

/** Sign-out, a refused session and account deletion all call this. */
export function clearMeSnapshot(): Promise<void> {
  epoch += 1;
  return enqueue(() => storage().remove(SNAPSHOT_KEY));
}
