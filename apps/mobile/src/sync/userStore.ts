import { reportError } from "../lib/reportError";
import {
  createDurableSyncStore,
  syncStorageKeys,
  type DurableSyncStore,
} from "./durableStore";
import { createMemorySyncStore, type TraineeSyncStore } from "./engine";
import { deviceStorage, type AsyncKeyValue } from "./storage";
import { discardHeldFeedback } from "../trainee/workout/pendingFeedbackStore";
import { discardSheetDrafts } from "../trainee/workout/sheetDrafts";

/**
 * One sync store per signed-in user (Z12-41).
 *
 * The outbox used to be one process-wide store with no owner: after a
 * sign-out the next account on the phone inherited the previous account's
 * unsent logs, pushed them under its own session, and the server refused
 * every one ("Couldn't send" with a 200 on the wire).
 *
 * Now every stored key carries the user id from `/me` (or from the snapshot
 * of that same `/me`, on a cold start with no network), and the device
 * remembers one owner. Opening a store for a different user first removes the
 * previous owner's data, so a store is never read for another user.
 */

const OWNER_KEY = "fitbud.sync.owner";
/** The unscoped web store written by builds before Z12-41. */
const LEGACY_WEB_KEY = "fitbud.trainee.sync.v1";

export function syncPrefixFor(userId: string): string {
  return `fitbud.sync.${userId.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

async function removeOwnerData(
  storage: AsyncKeyValue,
  userId: string,
): Promise<void> {
  for (const key of syncStorageKeys(syncPrefixFor(userId))) {
    await storage.remove(key);
  }
}

/**
 * Make `userId` the device's sync owner. A different stored owner's data is
 * removed first; the owner marker is written last, so a failure part-way is
 * repeated on the next open.
 */
export async function claimSyncOwner(
  storage: AsyncKeyValue,
  userId: string,
): Promise<void> {
  const previous = await storage.get(OWNER_KEY);
  if (previous === userId) return;
  if (previous) await removeOwnerData(storage, previous);
  await storage.remove(LEGACY_WEB_KEY);
  await storage.set(OWNER_KEY, userId);
}

const signedOutStore = createMemorySyncStore();
let current: { userId: string; store: TraineeSyncStore } | null = null;

/**
 * The store for the signed-in user, or an empty memory store while nobody is
 * signed in. The same user gets the same instance for the life of the process.
 */
export function syncStoreForUser(userId: string | null): TraineeSyncStore {
  if (!userId) return signedOutStore;
  if (current?.userId === userId) return current.store;
  const device = deviceStorage();
  let store: TraineeSyncStore;
  if (device.capacity === "memory") {
    store = createMemorySyncStore();
  } else {
    const durable: DurableSyncStore = createDurableSyncStore({
      storage: device.storage,
      prefix: syncPrefixFor(userId),
      capacity: device.capacity,
      beforeOpen: () => claimSyncOwner(device.storage, userId),
      onError: reportError,
    });
    store = durable;
  }
  current = { userId, store };
  return store;
}

/**
 * Explicit sign-out: the unsent logs are dropped, as the sign-out sheet says
 * (TR-20f). A session the server ended is different: nothing is cleared, so
 * the same user signing in again still has their unsent logs, and a different
 * user's first open removes them (`claimSyncOwner`).
 */
export async function clearSyncDataOnSignOut(): Promise<void> {
  const active = current;
  current = null;
  await signedOutStore.clear();
  const device = deviceStorage();
  try {
    if (active) await active.store.clear();
    const owner = await device.storage.get(OWNER_KEY);
    if (owner) await removeOwnerData(device.storage, owner);
    await device.storage.remove(OWNER_KEY);
    await device.storage.remove(LEGACY_WEB_KEY);
  } catch (error) {
    reportError("sync.signOut.clear", error);
  }
  // Held workout ratings and notes and Workout-tab drafts (Z14-37): dropped
  // with the unsent logs. Both never throw.
  await discardHeldFeedback();
  await discardSheetDrafts();
}

/** Tests only. */
export function resetSyncStoresForTests(): void {
  current = null;
}
