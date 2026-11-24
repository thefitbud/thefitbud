import { Platform } from "react-native";
import { reportError } from "../lib/reportError";
import { secureDelete, secureGet, secureSet } from "../lib/secureSessionStore";

/**
 * Where the outbox and the offline snapshots are kept between app launches
 * (Z12-41, D-W14-7).
 *
 * - Web: `localStorage`.
 * - Native: one SQLite table (`expo-sqlite`, Z14-5), capacity `full`, so the
 *   outbox, every synced record and the pull cursor survive a kill. On the
 *   first launch of a build with SQLite, each value the app reads is moved out
 *   of the keychain chunks older builds wrote: copied, read back and compared,
 *   and only then removed from the keychain. A copy that fails keeps the
 *   keychain value and reports; a row is never dropped.
 * - Native without the SQLite module (a dev build made before Z14-5):
 *   `expo-secure-store` chunks, capacity `small`, exactly as before.
 *
 * SecureStore keeps the session tokens; this adapter only reads it to migrate.
 *
 * Values are JSON text. Keys use letters, digits, ".", "-" and "_" only (the
 * SecureStore rule, still followed so every key can be migrated).
 */
export type AsyncKeyValue = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

export function createMemoryKeyValue(
  map: Map<string, string> = new Map(),
): AsyncKeyValue {
  return {
    async get(key) {
      return map.get(key) ?? null;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async remove(key) {
      map.delete(key);
    },
  };
}

export type SyncWebStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function createWebKeyValue(storage: SyncWebStorage): AsyncKeyValue {
  return {
    async get(key) {
      return storage.getItem(key);
    },
    async set(key, value) {
      storage.setItem(key, value);
    },
    async remove(key) {
      storage.removeItem(key);
    },
  };
}

/** SecureStore warns above about 2048 bytes on some Android versions. */
export const SECURE_CHUNK_CHARS = 1800;

export type SecureBackend = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

/**
 * JSON text with every non-ASCII character written as a `\uXXXX` escape. It
 * parses to the same value, and one character is then one byte, so a chunk's
 * size is known and no chunk can end in half a character.
 */
export function asciiJson(json: string): string {
  return json.replace(
    /[\u0080-￿]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

type ChunkHeader = { g: number; n: number };

function parseHeader(raw: string | null): ChunkHeader | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ChunkHeader> | null;
    if (
      parsed &&
      (parsed.g === 0 || parsed.g === 1) &&
      typeof parsed.n === "number" &&
      Number.isInteger(parsed.n) &&
      parsed.n >= 0
    ) {
      return { g: parsed.g, n: parsed.n };
    }
  } catch {
    // An unreadable header reads as "nothing stored".
  }
  return null;
}

/**
 * A key-value store over small-value storage. A value is written as chunks
 * under a generation the header does not point at yet, then the header is
 * switched in one write, then the old generation is removed. A crash at any
 * point leaves either the whole old value or the whole new one: never a mix.
 */
export function createChunkedKeyValue(
  backend: SecureBackend,
  chunkChars: number = SECURE_CHUNK_CHARS,
): AsyncKeyValue {
  const chunkKey = (key: string, generation: number, index: number) =>
    `${key}.c${generation}.${index}`;

  async function removeChunks(key: string, header: ChunkHeader) {
    for (let index = 0; index < header.n; index += 1) {
      await backend.remove(chunkKey(key, header.g, index));
    }
  }

  return {
    async get(key) {
      const header = parseHeader(await backend.get(key));
      if (!header) return null;
      const parts: string[] = [];
      for (let index = 0; index < header.n; index += 1) {
        const part = await backend.get(chunkKey(key, header.g, index));
        // A missing chunk means the value is not whole: report nothing
        // rather than a truncated value.
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join("");
    },
    async set(key, value) {
      const previous = parseHeader(await backend.get(key));
      const generation = previous?.g === 0 ? 1 : 0;
      const text = asciiJson(value);
      const count = Math.ceil(text.length / chunkChars);
      for (let index = 0; index < count; index += 1) {
        await backend.set(
          chunkKey(key, generation, index),
          text.slice(index * chunkChars, (index + 1) * chunkChars),
        );
      }
      const header: ChunkHeader = { g: generation, n: count };
      await backend.set(key, JSON.stringify(header));
      if (previous) await removeChunks(key, previous);
    },
    async remove(key) {
      const header = parseHeader(await backend.get(key));
      await backend.remove(key);
      if (header) await removeChunks(key, header);
    },
  };
}

const secureBackend: SecureBackend = {
  get: secureGet,
  set: secureSet,
  remove: secureDelete,
};

type SqlParam = string | number | null;

/**
 * The part of `expo-sqlite`'s `SQLiteDatabase` this adapter uses. Tests pass
 * Node's own SQLite through the same three calls.
 */
export type SqlDatabase = {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: SqlParam[]): Promise<unknown>;
  getFirstAsync<T>(source: string, ...params: SqlParam[]): Promise<T | null>;
};

/** The device database file, in the app's private documents directory. */
export const DEVICE_DB_NAME = "fitbud-device.db";

/**
 * `kv` holds the values. `legacy_checked` lists the keys whose keychain copy
 * is settled (moved, replaced, removed or never there), so a key is looked up
 * in the keychain only until then, not on every launch.
 */
export const DEVICE_DB_SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS legacy_checked (key TEXT PRIMARY KEY NOT NULL);
`;

export type SqliteKeyValue = AsyncKeyValue & {
  /** True once the key's keychain copy no longer needs a look. */
  legacyChecked(key: string): Promise<boolean>;
  markLegacyChecked(key: string): Promise<void>;
};

/**
 * A key-value store in one SQLite table. Each `set` is one upsert statement,
 * so a value is replaced whole or not at all. The database is opened on first
 * use; an open that fails is tried again on the next call.
 */
export function createSqliteKeyValue(
  open: () => Promise<SqlDatabase>,
): SqliteKeyValue {
  let ready: Promise<SqlDatabase> | null = null;
  function db(): Promise<SqlDatabase> {
    if (!ready) {
      const attempt = (async () => {
        const database = await open();
        await database.execAsync(DEVICE_DB_SCHEMA);
        return database;
      })();
      ready = attempt;
      attempt.catch(() => {
        if (ready === attempt) ready = null;
      });
    }
    return ready;
  }
  return {
    async get(key) {
      const row = await (await db()).getFirstAsync<{ value: string }>(
        "SELECT value FROM kv WHERE key = ?",
        key,
      );
      return row ? row.value : null;
    },
    async set(key, value) {
      await (await db()).runAsync(
        "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        key,
        value,
      );
    },
    async remove(key) {
      await (await db()).runAsync("DELETE FROM kv WHERE key = ?", key);
    },
    async legacyChecked(key) {
      const row = await (await db()).getFirstAsync<{ key: string }>(
        "SELECT key FROM legacy_checked WHERE key = ?",
        key,
      );
      return row !== null;
    },
    async markLegacyChecked(key) {
      await (await db()).runAsync(
        "INSERT OR IGNORE INTO legacy_checked (key) VALUES (?)",
        key,
      );
    },
  };
}

/** The copy read back from SQLite is not the value that was written. */
export class StorageMigrationMismatchError extends Error {
  constructor() {
    super("The migrated value did not read back the same.");
    this.name = "StorageMigrationMismatchError";
  }
}

export type MigratingKeyValueOptions = {
  /** Where values live from now on. */
  next: SqliteKeyValue;
  /** The keychain chunks earlier builds wrote. Read to migrate, then emptied. */
  legacy: AsyncKeyValue;
  /** A copy or a clean-up that failed. Never receives a value. */
  onError?: (scope: string, error: unknown) => void;
};

/**
 * SQLite in front, the old keychain store behind it, moved key by key (D-W14-7).
 *
 * The app's keys are owner-scoped (`fitbud.sync.<userId>.…`, see
 * `sync/userStore.ts`) and the keychain cannot list its keys, so a value is
 * moved the first time the app reads it rather than from a key list kept here.
 * A cold start reads the owner, the outbox and the plan before anything else,
 * so those move on the first launch, under exactly the keys the app uses.
 *
 * - `get`: SQLite first. Missing and not yet settled: read the keychain. A
 *   keychain read that fails throws (the caller tries again), so a later write
 *   can never replace a value that could not be read. Found: written to
 *   SQLite, read back and compared, and only then removed from the keychain.
 *   A copy that fails or does not match keeps the keychain value, reports, and
 *   still returns the value, so this launch works from it.
 * - `set`: SQLite, then the keychain copy is removed (the new value replaces
 *   it). Callers read before they write (the sync store hydrates first), so a
 *   keychain value is never replaced unseen.
 * - `remove`: both. A keychain removal that fails throws, so an owner change
 *   stops and is repeated rather than leaving the previous owner's data.
 */
export function createMigratingKeyValue(
  options: MigratingKeyValueOptions,
): AsyncKeyValue {
  const { next, legacy } = options;
  const settled = new Set<string>();
  const moving = new Map<string, Promise<string | null>>();
  const report = (scope: string, error: unknown) => {
    try {
      options.onError?.(scope, error);
    } catch {
      // Reporting must never break storage.
    }
  };

  async function isSettled(key: string): Promise<boolean> {
    if (settled.has(key)) return true;
    if (await next.legacyChecked(key)) {
      settled.add(key);
      return true;
    }
    return false;
  }

  async function settle(key: string): Promise<void> {
    await next.markLegacyChecked(key);
    settled.add(key);
  }

  async function move(key: string): Promise<string | null> {
    const value = await legacy.get(key);
    if (value === null) {
      await settle(key);
      return null;
    }
    try {
      await next.set(key, value);
      if ((await next.get(key)) !== value) throw new StorageMigrationMismatchError();
    } catch (error) {
      report("storage.migrate.copy", error);
      // A copy that did not verify must not sit where `get` looks first.
      await next.remove(key).catch((cleanup: unknown) => {
        report("storage.migrate.copy", cleanup);
      });
      return value;
    }
    try {
      await legacy.remove(key);
      await settle(key);
    } catch (error) {
      // SQLite holds the verified copy and is read first from now on; the
      // keychain copy goes with the next `set` or `remove` of this key.
      report("storage.migrate.cleanup", error);
    }
    return value;
  }

  return {
    async get(key) {
      const value = await next.get(key);
      if (value !== null) return value;
      if (await isSettled(key)) return null;
      let pending = moving.get(key);
      if (!pending) {
        pending = move(key).finally(() => moving.delete(key));
        moving.set(key, pending);
      }
      return pending;
    },
    async set(key, value) {
      await next.set(key, value);
      if (await isSettled(key)) return;
      try {
        await legacy.remove(key);
        await settle(key);
      } catch (error) {
        // The new value is in SQLite, which `get` reads first.
        report("storage.migrate.cleanup", error);
      }
    },
    async remove(key) {
      await next.remove(key);
      if (await isSettled(key)) return;
      await legacy.remove(key);
      await settle(key);
    },
  };
}

export type DeviceStorage = {
  storage: AsyncKeyValue;
  /**
   * `full`: room for every synced record (web, native SQLite). `small`: the
   * keychain; keep only what a cold start needs (the outbox, the plan, the
   * account snapshot). `memory`: nothing survives a restart (tests, a browser
   * without storage).
   */
  capacity: "full" | "small" | "memory";
};

export type NativeDeviceStorageDeps = {
  /** Whether this build has the `ExpoSQLite` native module. */
  sqliteAvailable: () => boolean;
  openDatabase: () => Promise<SqlDatabase>;
  /** The keychain store earlier builds wrote. */
  legacy: AsyncKeyValue;
  onError?: (scope: string, error: unknown) => void;
};

/** SQLite when the build has it (D-W14-7); the keychain chunks otherwise. */
export function createNativeDeviceStorage(deps: NativeDeviceStorageDeps): DeviceStorage {
  if (!deps.sqliteAvailable()) {
    return { storage: deps.legacy, capacity: "small" };
  }
  return {
    storage: createMigratingKeyValue({
      next: createSqliteKeyValue(deps.openDatabase),
      legacy: deps.legacy,
      onError: deps.onError,
    }),
    capacity: "full",
  };
}

/**
 * Expo registers each native module of the build on `globalThis.expo.modules`
 * (the registry `requireOptionalNativeModule` reads, and the only one
 * `expo-sqlite` works with). Read directly, so this file needs no native
 * import on web or in tests.
 */
function sqliteModuleAvailable(): boolean {
  try {
    const registry = (globalThis as { expo?: { modules?: Record<string, unknown> } })
      .expo?.modules;
    return registry?.ExpoSQLite != null;
  } catch {
    return false;
  }
}

async function openDeviceDatabase(): Promise<SqlDatabase> {
  const sqlite = await import("expo-sqlite");
  const database = await sqlite.openDatabaseAsync(DEVICE_DB_NAME);
  return {
    execAsync: (source) => database.execAsync(source),
    runAsync: (source, ...params) => database.runAsync(source, ...params),
    getFirstAsync: <T,>(source: string, ...params: SqlParam[]) =>
      database.getFirstAsync<T>(source, ...params),
  };
}

let cached: DeviceStorage | null = null;

/** The device's storage, picked once per process. */
export function deviceStorage(): DeviceStorage {
  if (cached) return cached;
  if (Platform.OS === "web") {
    let web: SyncWebStorage | null = null;
    try {
      web = typeof localStorage === "undefined" ? null : localStorage;
    } catch {
      web = null;
    }
    cached = web
      ? { storage: createWebKeyValue(web), capacity: "full" }
      : { storage: createMemoryKeyValue(), capacity: "memory" };
    return cached;
  }
  cached = createNativeDeviceStorage({
    sqliteAvailable: sqliteModuleAvailable,
    openDatabase: openDeviceDatabase,
    legacy: createChunkedKeyValue(secureBackend),
    onError: reportError,
  });
  return cached;
}

/** Tests only: forget the picked storage. */
export function resetDeviceStorageForTests(next: DeviceStorage | null = null): void {
  cached = next;
}
