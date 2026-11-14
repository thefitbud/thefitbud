/**
 * Trainer read-through cache for offline screens (Attention, Clients, client
 * status). Values live in `localStorage` (web) and a module-level map (every
 * platform; the only store on native).
 *
 * Privacy (Z11-8): every entry belongs to one signed-in trainer. The owner is
 * the user id from the server's `/me` response, set by `AuthProvider`, never
 * anything read from the cache itself. Callers keep passing their plain
 * `trainer:...` keys; this module stores them under an owner-scoped key, so a
 * different trainer on the same phone never reads the previous one's
 * snapshot. With no owner set, reads return `null` and writes are dropped.
 * Sign-out calls `clearTrainerCache()`, which removes every `trainer:` entry,
 * including unscoped keys written by builds before this change.
 *
 * Late writes (Z12-33): every owner change and every clear advances an epoch.
 * A caller reads `trainerCacheEpoch()` when it *starts* a fetch and passes it
 * to `writeTrainerCache`; a write whose epoch is no longer current is dropped,
 * so a fetch started under trainer A that resolves after A signs out and B
 * signs in never lands under B. Setting a new owner also removes every entry
 * that is not that owner's (another trainer's, or legacy unscoped keys), so a
 * user change without a sign-out (a new sign-in over a session that never
 * signed out, a web reload) still leaves nothing of the previous trainer.
 */

/** Every stored key starts with this, scoped or legacy. */
const CACHE_PREFIX = "trainer:";

const memory = new Map<string, string>();
let owner: string | null = null;
/** Advances on every owner change and every clear; never goes back. */
let epoch = 0;

function ownerPrefix(userId: string): string {
  return `${CACHE_PREFIX}owner:${encodeURIComponent(userId)}:`;
}

/**
 * Set the signed-in trainer (the `/me` user id), or `null` on sign-out.
 * Setting the same owner again is a no-op, so a `/me` reload for the same
 * trainer keeps in-flight writes valid. A different owner advances the epoch
 * and, unless it is `null`, removes every entry that is not the new owner's.
 */
export function setTrainerCacheOwner(userId: string | null): void {
  const next = userId && userId.length > 0 ? userId : null;
  if (next === owner) return;
  owner = next;
  epoch += 1;
  if (next !== null) {
    const keep = ownerPrefix(next);
    removeTrainerEntries((key) => !key.startsWith(keep));
  }
}

/**
 * The cache epoch to capture when a fetch starts, and pass to
 * `writeTrainerCache` when it resolves.
 */
export function trainerCacheEpoch(): number {
  return epoch;
}

function scopedKey(key: string): string | null {
  if (owner === null) return null;
  return `${ownerPrefix(owner)}${key}`;
}

function webStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function readTrainerCache<T>(key: string): T | null {
  const storageKey = scopedKey(key);
  if (storageKey === null) return null;
  try {
    const raw = webStorage()?.getItem(storageKey) ?? memory.get(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Store `value` for the current owner. `startedAt` is the `trainerCacheEpoch()`
 * read when the fetch that produced `value` started: if the owner changed or
 * the cache was cleared since, the write is dropped.
 */
export function writeTrainerCache(
  key: string,
  value: unknown,
  startedAt: number,
): void {
  if (startedAt !== epoch) return;
  const storageKey = scopedKey(key);
  if (storageKey === null) return;
  const raw = JSON.stringify(value);
  memory.set(storageKey, raw);
  try {
    webStorage()?.setItem(storageKey, raw);
  } catch {
    // Private mode can reject storage. The memory copy still serves this session.
  }
}

/**
 * Remove every trainer cache entry, for every owner, from both stores, and
 * advance the epoch so no fetch already in flight can write one back.
 */
export function clearTrainerCache(): void {
  epoch += 1;
  removeTrainerEntries(() => true);
}

/** Remove the `trainer:` entries that `shouldRemove` picks, from both stores. */
function removeTrainerEntries(shouldRemove: (key: string) => boolean): void {
  for (const key of [...memory.keys()]) {
    if (key.startsWith(CACHE_PREFIX) && shouldRemove(key)) memory.delete(key);
  }
  const storage = webStorage();
  if (!storage) return;
  try {
    const stale: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null && key.startsWith(CACHE_PREFIX) && shouldRemove(key)) {
        stale.push(key);
      }
    }
    for (const key of stale) storage.removeItem(key);
  } catch {
    // Storage that cannot be read cannot serve a snapshot either.
  }
}
