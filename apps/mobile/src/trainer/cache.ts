const memory = new Map<string, string>();

export function readTrainerCache<T>(key: string): T | null {
  try {
    const raw =
      (typeof localStorage !== "undefined"
        ? localStorage.getItem(key)
        : null) ?? memory.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeTrainerCache(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, raw);
  } catch {
    // Private mode can reject storage. The memory copy still serves this session.
  }
}
