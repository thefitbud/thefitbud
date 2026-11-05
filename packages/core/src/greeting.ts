import { FALLBACK_DISPLAY_TIME_ZONE, zonedDateTimeFormat } from "./zone.js";

/**
 * Greeting from the client's timezone. Never the device clock.
 * Morning before 12:00, afternoon before 17:00, evening from 17:00.
 *
 * A missing or blank zone falls back to `FALLBACK_DISPLAY_TIME_ZONE`, the same
 * explicit India-first rule the trainer screens use (D-W3b-11 (b)) — stated as
 * that rule rather than left as an incidental `||`. A zone that is *present
 * but unresolvable* still throws `UnsupportedTimeZoneError` naming it; this
 * fallback covers only the absence of a zone.
 */
export function greetingFor(
  name: string,
  timeZone: string = FALLBACK_DISPLAY_TIME_ZONE,
  now = new Date(),
): string {
  const first = name.trim().split(/\s+/)[0] || "there";
  const hour = readHour(timeZone.trim() || FALLBACK_DISPLAY_TIME_ZONE, now);
  if (hour < 12) return `Good morning, ${first}`;
  if (hour < 17) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}

function readHour(timeZone: string, now: Date): number {
  const parts = zonedDateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const raw = parts.find((part) => part.type === "hour")?.value ?? "0";
  const hour = Number.parseInt(raw, 10);
  if (!Number.isFinite(hour)) return 0;
  return hour % 24;
}
