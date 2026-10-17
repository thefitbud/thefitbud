import { createHash } from "node:crypto";
import { addDaysToLocalDate } from "@fitbud/core";

const NAMESPACE = "fitbud-demo-v1";

export function demoUuid(...parts: string[]): string {
  const hex = createHash("sha256")
    .update([NAMESPACE, ...parts].join("|"))
    .digest("hex");
  const variant = ((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

export function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function sha256HexSync(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function addDaysFromLocalDate(localDate: string, days: number): string {
  return addDaysToLocalDate(localDate, days);
}

/** ISO instant for start of local civil day in a timezone (demo seed windows). */
export function localDayStartIso(localDate: string, time: string, timeZone: string): string {
  const [year, month, day] = localDate.split("-").map((part) => Number(part));
  const [hour, minute] = time.split(":").map((part) => Number(part));
  const utcGuess = Date.UTC(
    year ?? 0,
    (month ?? 1) - 1,
    day ?? 1,
    hour ?? 0,
    minute ?? 0,
    0,
  );
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(new Date(utcGuess));
  const pick = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const displayed = Date.UTC(
    Number(pick("year")),
    Number(pick("month")) - 1,
    Number(pick("day")),
    Number(pick("hour")),
    Number(pick("minute")),
    Number(pick("second")),
  );
  const offsetMinutes = Math.round((displayed - utcGuess) / 60_000);
  return new Date(utcGuess - offsetMinutes * 60_000).toISOString();
}
