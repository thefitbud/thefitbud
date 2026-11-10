import {
  DEFAULT_QUIET_HOURS_END,
  DEFAULT_QUIET_HOURS_START,
  formatHhMmTime,
  isWithinQuietHours,
  localTimeHhMm,
} from "@fitbud/core";

/**
 * Short zone name for the client's timezone, e.g. "IST" for Asia/Kolkata.
 * Falls back to a GMT offset ("GMT+4") where the zone has no short name.
 */
export function zoneShortLabel(timeZone: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-IN", {
      timeZone,
      timeZoneName: "short",
      hour: "numeric",
    }).formatToParts(at);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    // Unknown zone: no label rather than a wrong one.
    return "";
  }
}

/** "7:00 am (client's time, IST)" — when a deferred nudge arrives. */
export function clientTimeLabel(
  hhmm: string,
  timeZone: string | null,
  at: Date = new Date(),
): string {
  const clock = formatHhMmTime(hhmm);
  const zone = timeZone ? zoneShortLabel(timeZone, at) : "";
  return zone ? `${clock} (client's time, ${zone})` : `${clock} (client's time)`;
}

/**
 * Frames 131 / 199: when it is the client's quiet hours right now, the panel
 * says so before the trainer nudges. Quiet hours fall back to the same
 * defaults the server uses for delivery (22:00–07:00).
 * Returns null outside quiet hours or when the client's timezone is unknown.
 */
export function quietHoursNotice(input: {
  firstName: string;
  timeZone: string | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  now?: Date;
}): string | null {
  if (!input.timeZone) return null;
  const now = input.now ?? new Date();
  let local: string | null;
  try {
    local = localTimeHhMm(now.toISOString(), input.timeZone);
  } catch {
    return null;
  }
  if (!local) return null;
  const start = input.quietHoursStart ?? DEFAULT_QUIET_HOURS_START;
  const end = input.quietHoursEnd ?? DEFAULT_QUIET_HOURS_END;
  if (
    !isWithinQuietHours({
      localTimeHhMm: local,
      quietHoursStart: start,
      quietHoursEnd: end,
    })
  ) {
    return null;
  }
  return `It's ${formatHhMmTime(local)} for ${input.firstName} and quiet hours are on. A nudge now arrives after ${clientTimeLabel(end, input.timeZone, now)}.`;
}

/** "40 min" under 90 minutes, else whole hours ("4 h"). */
export function waitLabel(ms: number): string {
  const mins = Math.max(1, Math.ceil(ms / 60_000));
  if (mins < 90) return `${mins} min`;
  return `${Math.ceil(mins / 60)} h`;
}

/** Frame 131 nudge-limit notice; the wait comes from the API's retryAfter. */
export function nudgeLimitNotice(remainingMs: number): string {
  return `Nudge limit reached. You can nudge again in ${waitLabel(remainingMs)}.`;
}

/**
 * Frame 02 resolve helper. Resolving a workout or meal locks late logging
 * for that day (core `canLog`: resolved exception → locked).
 */
export function resolveLockHelper(input: {
  firstName: string;
  sourceEntityType: string;
  dayLabel: string | null;
  otherOpen: number;
}): string {
  const lock =
    (input.sourceEntityType === "workout_assignment" ||
      input.sourceEntityType === "meal_assignment") &&
    input.dayLabel
      ? `Resolving locks this item, so ${input.firstName} can't log ${input.dayLabel} late anymore.`
      : "Resolving closes this item.";
  if (input.otherOpen <= 0) return lock;
  const others =
    input.otherOpen === 1
      ? `${input.firstName}'s other item stays open.`
      : `${input.firstName}'s other ${input.otherOpen} items stay open.`;
  return `${lock} ${others}`;
}
