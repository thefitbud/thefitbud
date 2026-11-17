import { Platform } from "react-native";
import { secureDelete, secureGet, secureSet } from "../lib/secureSessionStore";

/**
 * Where the outbox and the offline snapshots are kept between app launches
 * (Z12-41).
 *
 * - Web: `localStorage`.
 * - Native: `expo-secure-store` (the OS keychain / keystore), with each value
 *   split into small chunks. This is the JS fallback D-W12-13 asks for: the
 *   app has no SQLite or AsyncStorage module yet, and before this the native
 *   outbox lived in memory only, so killing the app lost every unsent log.
 *   Z12-57 may swap this adapter for a database; nothing above it changes.
 *
 * Values are JSON text. Keys use letters, digits, ".", "-" and "_" only (the
 * SecureStore rule).
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

export type DeviceStorage = {
  storage: AsyncKeyValue;
  /**
   * `full`: room for every synced record (web). `small`: the keychain; keep
   * only what a cold start needs (the outbox, the plan, the account snapshot).
   * `memory`: nothing survives a restart (tests, a browser without storage).
   */
  capacity: "full" | "small" | "memory";
};

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
  cached = {
    storage: createChunkedKeyValue(secureBackend),
    capacity: "small",
  };
  return cached;
}

/** Tests only: forget the picked storage. */
export function resetDeviceStorageForTests(next: DeviceStorage | null = null): void {
  cached = next;
}
