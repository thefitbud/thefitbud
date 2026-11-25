import { useCallback, useEffect, useMemo, useRef } from "react";
import { reportError } from "../../lib/reportError";
import { deviceStorage, type AsyncKeyValue } from "../../sync/storage";

/**
 * Unsaved typing in Workout-tab sheets, kept on the device (Z14-37).
 *
 * The Workout tab is unmounted under a full-screen cover while it is
 * immersive (a summary, the live log), and an app restart drops everything in
 * memory. A note half-typed for the coach is then gone. Sheets whose input is
 * more than one tap save it here (debounced, `SHEET_DRAFT_DEBOUNCE_MS`) and
 * read it back when they open again; Save, Cancel and sign-out clear it.
 *
 * Storage is the same device store the outbox and the meal photo jobs use
 * (`deviceStorage`: SQLite on native, `localStorage` on web). Every record
 * carries its owner (the signed-in user id) and the index remembers one
 * owner: a different user writing first removes the previous owner's records,
 * as `claimSyncOwner` does for the outbox, and a read for another owner finds
 * nothing. Explicit sign-out removes them all (`discardWorkoutDrafts`); a
 * session the server ended keeps them for the same user.
 *
 * A store failure (storage full or unavailable) is reported and otherwise
 * ignored: it never blocks a save or a send, the in-memory path carries on.
 */

/** Keys use letters, digits, ".", "-" and "_" only (the device store rule). */
export const SHEET_DRAFTS_PREFIX = "fitbud.workoutDrafts.v1";
/** A draft older than this is ignored and removed. */
export const SHEET_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const SHEET_DRAFT_DEBOUNCE_MS = 500;

function safe(part: string): string {
  return part.replace(/[^A-Za-z0-9-]/g, "_");
}

type StoredIndex = { ownerId: string; ids: string[] };
type StoredRecord<T> = { ownerId: string; id: string; savedAt: number; value: T };

export type OwnedRecord<T> = { id: string; savedAt: number; value: T };

export type OwnedRecords<T> = {
  put(ownerId: string, id: string, value: T, savedAt?: number): Promise<void>;
  get(ownerId: string, id: string): Promise<OwnedRecord<T> | null>;
  remove(ownerId: string, id: string): Promise<void>;
  list(ownerId: string): Promise<Array<OwnedRecord<T>>>;
  /** Removes every record, whoever owns it (explicit sign-out). */
  clearAll(): Promise<void>;
};

/**
 * Owner-scoped JSON records under one key prefix in the device store. Calls
 * run one after another (the index is read-modify-write) and never throw: a
 * failure is reported under `scope` and reads as nothing stored.
 */
export function createOwnedRecords<T>(options: {
  prefix: string;
  scope: string;
  storage?: () => AsyncKeyValue;
  report?: (where: string, err: unknown) => void;
  now?: () => number;
}): OwnedRecords<T> {
  const { prefix, scope } = options;
  const storage = options.storage ?? (() => deviceStorage().storage);
  const report = options.report ?? reportError;
  const now = options.now ?? (() => Date.now());
  const indexKey = `${prefix}.index`;
  const recordKey = (ownerId: string, id: string) =>
    `${prefix}.${safe(ownerId)}.${safe(id)}`;

  let chain: Promise<unknown> = Promise.resolve();
  function run<R>(fn: (s: AsyncKeyValue) => Promise<R>, fallback: R): Promise<R> {
    const next = chain.then(async () => {
      try {
        return await fn(storage());
      } catch (err: unknown) {
        report(scope, err);
        return fallback;
      }
    });
    chain = next;
    return next;
  }

  async function readIndex(s: AsyncKeyValue): Promise<StoredIndex | null> {
    const raw = await s.get(indexKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredIndex | null;
      if (parsed && typeof parsed.ownerId === "string" && Array.isArray(parsed.ids)) {
        return parsed;
      }
    } catch {
      // An unreadable index reads as nothing stored; the next write replaces it.
    }
    return null;
  }

  async function readRecord(
    s: AsyncKeyValue,
    ownerId: string,
    id: string,
  ): Promise<StoredRecord<T> | null> {
    const raw = await s.get(recordKey(ownerId, id));
    if (!raw) return null;
    let parsed: StoredRecord<T> | null = null;
    try {
      parsed = JSON.parse(raw) as StoredRecord<T> | null;
    } catch {
      parsed = null;
    }
    // Never read for another owner: two ids can share a key after `safe`.
    if (!parsed || parsed.ownerId !== ownerId || parsed.id !== id) return null;
    if (typeof parsed.savedAt !== "number") return null;
    return parsed;
  }

  /** Makes `ownerId` the index owner, removing a previous owner's records. */
  async function claim(s: AsyncKeyValue, ownerId: string): Promise<StoredIndex> {
    const index = await readIndex(s);
    if (index && index.ownerId === ownerId) return index;
    if (index) {
      for (const id of index.ids) await s.remove(recordKey(index.ownerId, id));
    }
    return { ownerId, ids: [] };
  }

  return {
    put(ownerId, id, value, savedAt) {
      return run(async (s) => {
        const index = await claim(s, ownerId);
        const record: StoredRecord<T> = { ownerId, id, savedAt: savedAt ?? now(), value };
        await s.set(recordKey(ownerId, id), JSON.stringify(record));
        if (!index.ids.includes(id)) index.ids.push(id);
        await s.set(indexKey, JSON.stringify(index));
      }, undefined);
    },
    get(ownerId, id) {
      return run(async (s) => {
        const record = await readRecord(s, ownerId, id);
        return record ? { id, savedAt: record.savedAt, value: record.value } : null;
      }, null);
    },
    remove(ownerId, id) {
      return run(async (s) => {
        await s.remove(recordKey(ownerId, id));
        const index = await readIndex(s);
        if (index && index.ownerId === ownerId && index.ids.includes(id)) {
          index.ids = index.ids.filter((item) => item !== id);
          await s.set(indexKey, JSON.stringify(index));
        }
      }, undefined);
    },
    list(ownerId) {
      return run(async (s) => {
        const index = await readIndex(s);
        if (!index || index.ownerId !== ownerId) return [];
        const out: Array<OwnedRecord<T>> = [];
        for (const id of index.ids) {
          const record = await readRecord(s, ownerId, id);
          if (record) out.push({ id, savedAt: record.savedAt, value: record.value });
        }
        return out;
      }, []);
    },
    clearAll() {
      return run(async (s) => {
        const index = await readIndex(s);
        if (index) {
          for (const id of index.ids) await s.remove(recordKey(index.ownerId, id));
        }
        await s.remove(indexKey);
      }, undefined);
    },
  };
}

/** The sheets that keep a draft (only those where typing is more than a tap). */
export type DraftSheet = "workoutFeedback";

type StoredDraft<T> = { sheet: DraftSheet; entityId: string; value: T };

export type SheetDrafts = {
  save<T>(ownerId: string, sheet: DraftSheet, entityId: string, value: T): Promise<void>;
  /** The draft, or null when none, older than 24 h, or for another entity. */
  read<T>(ownerId: string, sheet: DraftSheet, entityId: string): Promise<T | null>;
  clear(ownerId: string, sheet: DraftSheet, entityId: string): Promise<void>;
  clearAll(): Promise<void>;
  /**
   * Bumped by every `clearAll` (sign-out). A write scheduled before it is
   * dropped instead of bringing a discarded draft back.
   */
  generation?(): number;
};

export function createSheetDrafts(options: {
  storage?: () => AsyncKeyValue;
  report?: (where: string, err: unknown) => void;
  now?: () => number;
} = {}): SheetDrafts {
  const now = options.now ?? (() => Date.now());
  const records = createOwnedRecords<StoredDraft<unknown>>({
    prefix: SHEET_DRAFTS_PREFIX,
    scope: "workout.sheetDrafts",
    storage: options.storage,
    report: options.report,
    now,
  });
  const idFor = (sheet: DraftSheet, entityId: string) => `${sheet}.${entityId}`;
  let generation = 0;
  return {
    save(ownerId, sheet, entityId, value) {
      return records.put(ownerId, idFor(sheet, entityId), { sheet, entityId, value });
    },
    async read<T>(ownerId: string, sheet: DraftSheet, entityId: string) {
      const id = idFor(sheet, entityId);
      const record = await records.get(ownerId, id);
      if (!record) return null;
      if (now() - record.savedAt > SHEET_DRAFT_MAX_AGE_MS) {
        await records.remove(ownerId, id);
        return null;
      }
      if (record.value.sheet !== sheet || record.value.entityId !== entityId) return null;
      return record.value.value as T;
    },
    clear(ownerId, sheet, entityId) {
      return records.remove(ownerId, idFor(sheet, entityId));
    },
    clearAll() {
      generation += 1;
      return records.clearAll();
    },
    generation() {
      return generation;
    },
  };
}

/** The app's drafts, on the device store. */
export const sheetDrafts: SheetDrafts = createSheetDrafts();

/**
 * One sheet's draft: `schedule` writes after `SHEET_DRAFT_DEBOUNCE_MS` of no
 * change (one write per pause, never per keystroke), a pending write is made
 * at once when the sheet unmounts (a cover arriving), `clear` drops both the
 * pending write and the stored draft. A pending write scheduled before the
 * drafts were discarded (sign-out) is dropped, never written after it. With
 * no owner or entity it does nothing. The returned functions are stable
 * across renders.
 */
export type SheetDraftHandle<T> = {
  read: () => Promise<T | null>;
  schedule: (value: T) => void;
  clear: () => void;
};

export function useSheetDraft<T>(input: {
  ownerId: string | null | undefined;
  sheet: DraftSheet;
  entityId: string | null | undefined;
  drafts?: SheetDrafts;
}): SheetDraftHandle<T> {
  const drafts = input.drafts ?? sheetDrafts;
  const target = useRef({ ownerId: input.ownerId, sheet: input.sheet, entityId: input.entityId, drafts });
  target.current = { ownerId: input.ownerId, sheet: input.sheet, entityId: input.entityId, drafts };
  const pending = useRef<{
    value: T;
    generation: number | undefined;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const write = useCallback((value: T, generation: number | undefined) => {
    const { ownerId, sheet, entityId, drafts: store } = target.current;
    if (!ownerId || !entityId) return;
    // Discarded since it was typed (sign-out): never write it back.
    if (generation !== store.generation?.()) return;
    void store.save(ownerId, sheet, entityId, value);
  }, []);

  const flush = useCallback(() => {
    const queued = pending.current;
    if (!queued) return;
    clearTimeout(queued.timer);
    pending.current = null;
    write(queued.value, queued.generation);
  }, [write]);

  const schedule = useCallback(
    (value: T) => {
      const { ownerId, entityId, drafts: store } = target.current;
      if (!ownerId || !entityId) return;
      if (pending.current) clearTimeout(pending.current.timer);
      const generation = store.generation?.();
      const timer = setTimeout(() => {
        pending.current = null;
        write(value, generation);
      }, SHEET_DRAFT_DEBOUNCE_MS);
      pending.current = { value, generation, timer };
    },
    [write],
  );

  const clear = useCallback(() => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
    const { ownerId, sheet, entityId, drafts: store } = target.current;
    if (!ownerId || !entityId) return;
    void store.clear(ownerId, sheet, entityId);
  }, []);

  const read = useCallback(async () => {
    const { ownerId, sheet, entityId, drafts: store } = target.current;
    if (!ownerId || !entityId) return null;
    return store.read<T>(ownerId, sheet, entityId);
  }, []);

  useEffect(() => flush, [flush]);

  return useMemo(() => ({ read, schedule, clear }), [read, schedule, clear]);
}

/** Explicit sign-out: drafts and held ratings and notes go with the unsent logs. */
export async function discardSheetDrafts(): Promise<void> {
  await sheetDrafts.clearAll();
}
