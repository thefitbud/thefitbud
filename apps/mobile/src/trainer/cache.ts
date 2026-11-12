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
 */

/** Every stored key starts with this, scoped or legacy. */
const CACHE_PREFIX = "trainer:";

const memory = new Map<string, string>();
let owner: string | null = null;

/** Set the signed-in trainer (the `/me` user id), or `null` on sign-out. */
export function setTrainerCacheOwner(userId: string | null): void {
  owner = userId && userId.length > 0 ? userId : null;
}

function scopedKey(key: string): string | null {
  if (owner === null) return null;
  return `${CACHE_PREFIX}owner:${encodeURIComponent(owner)}:${key}`;
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

export function writeTrainerCache(key: string, value: unknown): void {
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

/** Remove every trainer cache entry, for every owner, from both stores. */
export function clearTrainerCache(): void {
  for (const key of [...memory.keys()]) {
    if (key.startsWith(CACHE_PREFIX)) memory.delete(key);
  }
  const storage = webStorage();
  if (!storage) return;
  try {
    const stale: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null && key.startsWith(CACHE_PREFIX)) stale.push(key);
    }
    for (const key of stale) storage.removeItem(key);
  } catch {
    // Storage that cannot be read cannot serve a snapshot either.
  }
}
