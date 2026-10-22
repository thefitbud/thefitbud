import {
  DEFAULT_QUIET_HOURS_END,
  DEFAULT_QUIET_HOURS_START,
  MEAL_REMINDER_SNOOZE_MINUTES,
  addDaysToLocalDate,
  formatLocalDate,
  isWithinQuietHours,
  localDateTimeToUtcIso,
  localTimeHhMm,
} from "@fitbud/core";

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

export const DEV_BUILD_NOTE =
  "The Live Activity needs a dev build. The Dynamic Island needs a dev build. The lock screen needs a dev build. The Android workout notification needs a dev build. Log set uses a LiveActivityIntent in that build and moves to the next set. iOS asks for Face ID on the first tap and does not open the app. The Open and Snooze buttons inside the meal card need a dev build. Snooze re-sends once from that build, and a time inside quiet hours waits until they end.";

export type QuietHoursInput = {
  start: string | null;
  end: string | null;
  timeZone: string;
};

export function quietWindow(
  timeZone: string,
  start?: string | null,
  end?: string | null,
): QuietHoursInput {
  return {
    start: start ?? DEFAULT_QUIET_HOURS_START,
    end: end ?? DEFAULT_QUIET_HOURS_END,
    timeZone,
  };
}

/** 30 minutes on, or the end of quiet hours when that instant falls inside them. */
export function snoozeFireAt(now: Date, quiet?: QuietHoursInput | null): Date {
  const plus = new Date(now.getTime() + MEAL_REMINDER_SNOOZE_MINUTES * 60_000);
  const start = quiet?.start || DEFAULT_QUIET_HOURS_START;
  const end = quiet?.end || DEFAULT_QUIET_HOURS_END;
  const timeZone = quiet?.timeZone || "Asia/Kolkata";
  const local = localTimeHhMm(plus.toISOString(), timeZone);
  if (
    !local ||
    !isWithinQuietHours({
      localTimeHhMm: local,
      quietHoursStart: start,
      quietHoursEnd: end,
    })
  ) {
    return plus;
  }
  const [hour, minute] = end.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return plus;
  const localDate = formatLocalDate(plus, timeZone);
  let endAt = new Date(
    localDateTimeToUtcIso(localDate, timeZone, hour, minute, 0),
  );
  if (endAt.getTime() <= plus.getTime()) {
    endAt = new Date(
      localDateTimeToUtcIso(
        addDaysToLocalDate(localDate, 1),
        timeZone,
        hour,
        minute,
        0,
      ),
    );
  }
  return endAt;
}

export function snoozeNotice(now: Date, until: Date): string {
  const extra =
    until.getTime() - now.getTime() - MEAL_REMINDER_SNOOZE_MINUTES * 60_000;
  if (extra > 60_000) return "Snoozed until quiet hours end.";
  return "Snoozed for 30 minutes.";
}

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
  quiet?: QuietHoursInput | null,
): { ok: true; until: Date } | { ok: false } {
  const existing = readSnoozes();
  if (existing[mealId]) return { ok: false };
  const until = snoozeFireAt(now, quiet);
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

