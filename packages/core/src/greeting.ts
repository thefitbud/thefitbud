import { IST_TIME_ZONE } from "./clock.js";

/**
 * Greeting from the client's timezone. Never the device clock.
 * Morning before 12:00, afternoon before 17:00, evening from 17:00.
 */
export function greetingFor(
  name: string,
  timeZone: string = IST_TIME_ZONE,
  now = new Date(),
): string {
  const first = name.trim().split(/\s+/)[0] || "there";
  const hour = hourInTimeZone(timeZone.trim() || IST_TIME_ZONE, now);
  if (hour < 12) return `Good morning, ${first}`;
  if (hour < 17) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}

function hourInTimeZone(timeZone: string, now: Date): number {
  try {
    return readHour(timeZone, now);
  } catch {
    return readHour(IST_TIME_ZONE, now);
  }
}

function readHour(timeZone: string, now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const raw = parts.find((part) => part.type === "hour")?.value ?? "0";
  const hour = Number.parseInt(raw, 10);
  if (!Number.isFinite(hour)) return 0;
  return hour % 24;
}
