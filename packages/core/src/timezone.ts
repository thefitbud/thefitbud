/**
 * Convert a trainee-local calendar date + wall time into a UTC ISO string.
 * Uses Intl so Workers and Node share the same behavior without extra deps.
 */
export function localDateTimeToUtcIso(
  localDate: string,
  timeZone: string,
  hour = 0,
  minute = 0,
  second = 0,
): string {
  const [year, month, day] = localDate.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error("Invalid local date");
  }

  let utcMillis = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 4; i += 1) {
    const parts = getZonedParts(new Date(utcMillis), timeZone);
    const asUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const desired = Date.UTC(year, month - 1, day, hour, minute, second);
    const delta = desired - asUtc;
    if (delta === 0) break;
    utcMillis += delta;
  }
  return new Date(utcMillis).toISOString();
}

export function formatLocalDate(instant: Date, timeZone: string): string {
  const parts = getZonedParts(instant, timeZone);
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return `${parts.year}-${mm}-${dd}`;
}

function getZonedParts(
  instant: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map = Object.fromEntries(
    dtf.formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Window: local midnight → +completionWindowHours. */
export function workoutWindowForLocalDate(input: {
  localDate: string;
  timeZone: string;
  completionWindowHours: number;
}): { windowStartsAt: string; windowEndsAt: string } {
  return confirmationWindowForLocalDate({
    localDate: input.localDate,
    timeZone: input.timeZone,
    windowHours: input.completionWindowHours,
  });
}

/** Meal confirmation window: local midnight → +confirmationWindowHours. */
export function mealWindowForLocalDate(input: {
  localDate: string;
  timeZone: string;
  confirmationWindowHours: number;
}): { windowStartsAt: string; windowEndsAt: string } {
  return confirmationWindowForLocalDate({
    localDate: input.localDate,
    timeZone: input.timeZone,
    windowHours: input.confirmationWindowHours,
  });
}

/** Check-in due window: local midnight of due date → +dueWindowHours. */
export function checkinWindowForLocalDate(input: {
  localDate: string;
  timeZone: string;
  dueWindowHours: number;
}): { windowStartsAt: string; windowEndsAt: string } {
  return confirmationWindowForLocalDate({
    localDate: input.localDate,
    timeZone: input.timeZone,
    windowHours: input.dueWindowHours,
  });
}

function confirmationWindowForLocalDate(input: {
  localDate: string;
  timeZone: string;
  windowHours: number;
}): { windowStartsAt: string; windowEndsAt: string } {
  const windowStartsAt = localDateTimeToUtcIso(
    input.localDate,
    input.timeZone,
    0,
    0,
    0,
  );
  const startMs = Date.parse(windowStartsAt);
  const windowEndsAt = new Date(
    startMs + input.windowHours * 60 * 60 * 1000,
  ).toISOString();
  return { windowStartsAt, windowEndsAt };
}
