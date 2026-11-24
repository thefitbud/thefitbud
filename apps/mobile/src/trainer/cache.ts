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
  sessionValues.clear();
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
  sessionValues.clear();
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

// ---------------------------------------------------------------------------
// Z14-3: session cache and the per-client header entry
// ---------------------------------------------------------------------------

/**
 * Values kept for the running session only (never written to the device
 * store), for example a review item's exception and source assignment. Cleared
 * on every owner change and every clear, like the snapshots.
 */
const sessionValues = new Map<string, unknown>();

export function readTrainerSession<T>(key: string): T | null {
  if (owner === null) return null;
  const value = sessionValues.get(`${owner}:${key}`);
  return value === undefined ? null : (value as T);
}

export function writeTrainerSession(
  key: string,
  value: unknown,
  startedAt: number,
): void {
  if (startedAt !== epoch || owner === null) return;
  sessionValues.set(`${owner}:${key}`, value);
}

/** A snapshot older than this is refreshed in the background (Z14-3). */
export const TRAINER_STALE_MS = 30_000;

/**
 * What the review and detail screens need for a client's header: filled by any
 * workspace or clients read, so a screen paints it before its own read ends.
 */
export type ClientMeta = {
  name: string | null;
  goalShort: string | null;
  /** Coaching start (ISO instant); the week is counted from it. */
  startedAt: string | null;
  endedAt: string | null;
  week: number | null;
  timeZone: string | null;
  whatsappE164: string | null;
  status: string | null;
};

export function clientMetaKey(relationshipId: string): string {
  return `trainer:client-meta:${relationshipId}`;
}

export function readClientMeta(relationshipId: string): ClientMeta | null {
  if (!relationshipId) return null;
  return readTrainerCache<ClientMeta>(clientMetaKey(relationshipId));
}

/**
 * Merge `patch` over the stored entry. Fields the patch leaves `undefined` keep
 * their stored value; a clients read has no time zone or WhatsApp number and
 * must not erase the ones a workspace read stored.
 */
export function writeClientMeta(
  relationshipId: string,
  patch: Partial<ClientMeta>,
  startedAt: number,
): void {
  if (!relationshipId) return;
  const current = readClientMeta(relationshipId);
  const merged: ClientMeta = {
    name: null,
    goalShort: null,
    startedAt: null,
    endedAt: null,
    week: null,
    timeZone: null,
    whatsappE164: null,
    status: null,
    ...(current ?? {}),
  };
  for (const [field, value] of Object.entries(patch)) {
    if (value !== undefined) (merged as Record<string, unknown>)[field] = value;
  }
  writeTrainerCache(clientMetaKey(relationshipId), merged, startedAt);
}

/** Whole coaching weeks since `startedAt`, counted from 1; null when unknown. */
export function clientMetaWeek(
  startedAt: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!startedAt) return null;
  const elapsed = nowMs - Date.parse(startedAt);
  if (!Number.isFinite(elapsed)) return null;
  if (elapsed < 0) return 1;
  return Math.max(1, Math.floor(elapsed / (7 * 24 * 60 * 60 * 1000)) + 1);
}

/** The header fields of a workspace read, for `writeClientMeta`. */
export function clientMetaFromWorkspaceHeader(header: {
  traineeDisplayName?: string | null;
  goalShort?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  traineeTimezone?: string | null;
  clientWhatsappE164?: string | null;
  onboardingStatus?: string | null;
}): Partial<ClientMeta> {
  return {
    name: header.traineeDisplayName ?? null,
    goalShort: header.goalShort ?? null,
    startedAt: header.startedAt ?? null,
    endedAt: header.endedAt ?? null,
    week: clientMetaWeek(header.startedAt),
    timeZone: header.traineeTimezone ?? null,
    whatsappE164: header.clientWhatsappE164 ?? null,
    status: header.onboardingStatus ?? null,
  };
}

/** The same fields from a clients-list row (no time zone or WhatsApp number). */
export function clientMetaFromDirectoryItem(item: {
  traineeDisplayName?: string | null;
  goalShort?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  week?: number | null;
  status?: string | null;
}): Partial<ClientMeta> {
  const patch: Partial<ClientMeta> = {
    name: item.traineeDisplayName ?? null,
    goalShort: item.goalShort ?? null,
    status: item.status ?? null,
  };
  if (item.startedAt !== undefined) patch.startedAt = item.startedAt;
  if (item.endedAt !== undefined) patch.endedAt = item.endedAt;
  const week = item.week ?? clientMetaWeek(item.startedAt);
  if (week != null) patch.week = week;
  return patch;
}
