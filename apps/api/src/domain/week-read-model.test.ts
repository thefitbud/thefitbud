/**
 * Day-state rules (D-W6-10, Z6-22). `deriveWeekDayFromWorkouts` is the one
 * derivation; these pin each rule on assignment-shaped rows.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { WorkoutExecutionStatus } from "@fitbud/contracts";
import { deriveWeekDayFromWorkouts } from "./week-read-model.js";

const TODAY = "2026-10-14";
const PAST = "2026-10-13";
const NOW = "2026-10-14T08:00:00.000Z";
const OPEN_WINDOW = "2026-10-14T18:29:59.000Z";
const CLOSED_WINDOW = "2026-10-13T18:29:59.000Z";

function wo(
  name: string,
  executionStatus: WorkoutExecutionStatus | null,
  windowEndsAt: string,
) {
  return { workoutDayName: name, executionStatus, windowEndsAt };
}

function stateOf(date: string, workouts: ReturnType<typeof wo>[]): string {
  return deriveWeekDayFromWorkouts({
    date,
    today: TODAY,
    nowIso: NOW,
    workouts,
  }).state;
}

describe("deriveWeekDayFromWorkouts (D-W6-10)", () => {
  it("today with planned work and nothing logged is due", () => {
    expect(stateOf(TODAY, [wo("Upper A", null, OPEN_WINDOW)])).toBe("due");
  });

  it("today with 1 of 2 completed is partial", () => {
    expect(
      stateOf(TODAY, [
        wo("Upper A", "completed", OPEN_WINDOW),
        wo("Mobility", null, OPEN_WINDOW),
      ]),
    ).toBe("partial");
  });

  it("today started and not finished is partial", () => {
    expect(stateOf(TODAY, [wo("Upper A", "started", OPEN_WINDOW)])).toBe(
      "partial",
    );
  });

  it("today with everything skipped is done", () => {
    expect(
      stateOf(TODAY, [
        wo("Upper A", "skipped", OPEN_WINDOW),
        wo("Mobility", "skipped", OPEN_WINDOW),
      ]),
    ).toBe("done");
  });

  it("today with everything completed is done", () => {
    expect(
      stateOf(TODAY, [
        wo("Upper A", "completed", OPEN_WINDOW),
        wo("Mobility", "modified", OPEN_WINDOW),
      ]),
    ).toBe("done");
  });

  it("a past day with nothing logged is missed", () => {
    expect(stateOf(PAST, [wo("Legs A", null, CLOSED_WINDOW)])).toBe("missed");
  });

  it("today with a closed window and nothing logged is missed", () => {
    expect(
      stateOf(TODAY, [wo("Legs A", null, "2026-10-14T07:00:00.000Z")]),
    ).toBe("missed");
  });

  it("a past day with a started workout is partial", () => {
    expect(stateOf(PAST, [wo("Legs A", "started", CLOSED_WINDOW)])).toBe(
      "partial",
    );
  });

  it("a past day with 1 completed and 1 unlogged is partial", () => {
    expect(
      stateOf(PAST, [
        wo("Legs A", "completed", CLOSED_WINDOW),
        wo("Mobility", null, CLOSED_WINDOW),
      ]),
    ).toBe("partial");
  });

  it("no assignments today is rest, and after today is future", () => {
    expect(stateOf(TODAY, [])).toBe("rest");
    expect(stateOf("2026-10-15", [])).toBe("future");
  });

  it("a later assigned day is future", () => {
    expect(
      stateOf("2026-10-15", [wo("Pull", null, "2026-10-15T18:29:59.000Z")]),
    ).toBe("future");
  });
});

describe("day state has one derivation", () => {
  it("only week-read-model.ts maps execution statuses to day states", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const owner = join("domain", "week-read-model.ts");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) {
          if (full.endsWith(owner)) continue;
          const text = readFileSync(full, "utf8");
          if (/state:\s*"(due|partial|missed)"/.test(text)) hits.push(full);
        }
      }
    };
    walk(root);
    expect(hits).toEqual([]);
  });
});
