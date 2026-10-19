import { MEAL_REMINDER_SNOOZE_MINUTES } from "@fitbud/core";

/**
 * Expo category ids cannot contain ":" or "-".
 * OS buttons are registered for a dev build. Expo web has no notification UI.
 */
export const MEAL_ACTION_CATEGORY = "meal_actions";

export const MEAL_NOTIFICATION_ACTIONS = [
  {
    identifier: "meal_open",
    buttonTitle: "Open",
    opensAppToForeground: true,
  },
  {
    identifier: "meal_snooze_30",
    buttonTitle: "Snooze 30 min",
    opensAppToForeground: false,
  },
] as const;

export const IN_APP_MEAL_ACTIONS = ["Eaten as planned", "Open"] as const;
export const IN_APP_NOTE_ACTIONS = ["Read", "Later"] as const;
export const LIVE_ACTIVITY_ACTIONS = ["+30 s", "Skip rest"] as const;

export const DEV_BUILD_NOTE =
  "The Live Activity needs a dev build. The Dynamic Island needs a dev build. The lock screen needs a dev build.";

const SNOOZE_KEY = "fitbud.mealSnooze.v1";
const HIDE_KEY = "fitbud.hideLockDetails";

type SnoozeMap = Record<string, { until: string }>;

const memory = new Map<string, string>();

function readRaw(key: string): string | null {
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(key);
      if (stored != null) return stored;
    }
  } catch {
    // Private mode and native have no durable web store.
  }
  return memory.get(key) ?? null;
}

function writeRaw(key: string, value: string): void {
  memory.set(key, value);
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    // Keep the in-memory copy.
  }
}

function readSnoozes(): SnoozeMap {
  const raw = readRaw(SNOOZE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as SnoozeMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function resetNotificationActionState(): void {
  memory.delete(SNOOZE_KEY);
  memory.delete(HIDE_KEY);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(SNOOZE_KEY);
      localStorage.removeItem(HIDE_KEY);
    }
  } catch {
    // Ignore.
  }
}

export function isMealSnoozed(mealId: string, now = new Date()): boolean {
  const row = readSnoozes()[mealId];
  if (!row?.until) return false;
  return new Date(row.until).getTime() > now.getTime();
}

/** One snooze per meal. A second tap does not move the clock. */
export function snoozeMeal(
  mealId: string,
  now = new Date(),
): { ok: true; until: Date } | { ok: false } {
  const existing = readSnoozes();
  if (existing[mealId]) return { ok: false };
  const until = new Date(
    now.getTime() + MEAL_REMINDER_SNOOZE_MINUTES * 60_000,
  );
  writeRaw(
    SNOOZE_KEY,
    JSON.stringify({ ...existing, [mealId]: { until: until.toISOString() } }),
  );
  return { ok: true, until };
}

export function readHideLockDetails(): boolean {
  return readRaw(HIDE_KEY) === "1";
}

export function writeHideLockDetails(value: boolean): void {
  writeRaw(HIDE_KEY, value ? "1" : "0");
}

