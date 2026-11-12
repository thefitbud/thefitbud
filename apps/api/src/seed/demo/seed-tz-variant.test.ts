import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDemoSeedSql } from "./build.js";
import { PERSONA_CONFIGS } from "./generator/personas.js";
import { demoUuid } from "./ids.js";
import { loadDemoLibraryIndex } from "./personas.js";
import { createMemoryDb, type MemoryDbHandle, yieldToEventLoop } from "../../test-support/memory-db.js";
import { evaluateRelationshipExceptions } from "../../domain/exceptions.js";

/**
 * Task QS4 (QA-PR30 finding 1): every generated coverage path (meals, workouts
 * and check-ins) has to start at detection's client-local lookback, not at the
 * IST refDate - 2. No shipped persona lives far enough west of IST for the
 * check-in path to show this, so this in-memory variant moves Pooja (whose most
 * recent check-in stays an overdue draft) to America/Los_Angeles. The instants
 * are the ones QA found where LA is still a civil day behind IST and the first
 * coach read used to create her overdue_checkin. Nothing outside this file's
 * in-memory DBs is affected; the config is restored afterwards.
 */
const POOJA = "pooja.silent@demo.fitbud.test";
const POOJA_NAME = "Pooja Agarwal";
const VARIANT_TIMEZONE = "America/Los_Angeles";
const LAG_INSTANTS = [
  "2026-10-20T20:01:00.000Z",
  "2026-10-20T22:01:00.000Z",
  "2026-10-21T00:01:00.000Z",
  "2026-10-21T02:01:00.000Z",
  "2026-10-21T04:01:00.000Z",
  "2026-10-21T06:01:00.000Z",
  "2026-10-27T20:01:00.000Z",
  "2026-10-27T22:01:00.000Z",
  "2026-10-28T00:01:00.000Z",
  "2026-10-28T02:01:00.000Z",
  "2026-10-28T04:01:00.000Z",
  "2026-10-28T06:01:00.000Z",
];

const pooja = PERSONA_CONFIGS.find((cfg) => cfg.email === POOJA);
if (!pooja) throw new Error(`no persona ${POOJA}`);
const originalTimezone = pooja.timezone;

beforeAll(() => {
  pooja.timezone = VARIANT_TIMEZONE;
});
afterAll(() => {
  pooja.timezone = originalTimezone;
});

describe.each(LAG_INSTANTS)(`demo seed with Pooja in ${VARIANT_TIMEZONE} at %s`, (now) => {
  let handle: MemoryDbHandle;
  const q = (sql: string) => handle.sqlite.exec(sql)[0]?.values ?? [];
  const rows = (sql: string) => q(sql).map((r) => r.map(String).join(" | "));
  const poojaRel = () =>
    String(q(`select r.id from coaching_relationships r join trainee_profiles tp on tp.user_id = r.trainee_user_id where tp.display_name = '${POOJA_NAME}' and r.status = 'active'`)[0]?.[0]);

  beforeAll(async () => {
    handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
    const libraryIndex = loadDemoLibraryIndex(handle.sqlite);
    const sql = buildDemoSeedSql({ referenceInstant: now, passwordHash: "qs4-tz-test-hash", libraryIndex });
    await yieldToEventLoop();
    handle.sqlite.exec(sql);
    await yieldToEventLoop();
  }, 60_000);

  afterAll(() => handle?.close());

  it("first coach read creates, resolves and changes nothing", async () => {
    // The override took effect.
    expect(rows(`select u.timezone from users u join trainee_profiles tp on tp.user_id = u.id where tp.display_name = '${POOJA_NAME}'`)).toEqual([VARIANT_TIMEZONE]);

    const tableBefore = rows("select * from exceptions order by id");
    const created: string[] = [];
    const resolved: string[] = [];
    let activated = 0;
    const relationships = q(
      `select r.id, coalesce(u.display_name, r.id) from coaching_relationships r
         left join trainee_profiles u on u.user_id = r.trainee_user_id
         where r.status = 'active' order by r.id`,
    );
    for (const [rel, name] of relationships) {
      const before = new Set(rows(`select id from exceptions where coaching_relationship_id = '${String(rel)}'`));
      const result = await evaluateRelationshipExceptions(handle.db, String(rel), now);
      for (const exception of result.exceptions) {
        if (!before.has(exception.id)) created.push(`${String(name)}: ${exception.type}`);
      }
      for (const exception of result.resolvedExceptions) resolved.push(`${String(name)}: ${exception.type}`);
      activated += result.activated;
    }
    expect(created).toEqual([]);
    expect(resolved).toEqual([]);
    expect(activated).toBe(0);
    expect(rows("select * from exceptions order by id")).toEqual(tableBefore);
    // Not vacuous: the seed holds Pooja's overdue check-in (resolved: she is in
    // CLEARED_LOOKBACK), which is what blocks detection from re-creating it.
    expect(rows(`select status from exceptions where type = 'overdue_checkin' and coaching_relationship_id = '${poojaRel()}'`)).toEqual(["resolved"]);
  }, 60_000);
});

/**
 * Z11-4: the history overlays for Meera, Lakshmi, Farhan and Rohan used to
 * build their times in a literal IST zone. With those clients in New York the
 * seeded local clock times must be the ones the IST run has, and history.ts
 * must not name a zone of its own.
 */
// Relies on the file-level beforeAll (Pooja in Los Angeles); the four clients below are not Pooja.
describe("history overlays follow the persona's zone (Z11-4)", () => {
  const NOW = "2026-10-28T12:15:00.000Z";
  const EMAILS = [
    "meera.ack@demo.fitbud.test",
    "lakshmi.foods@demo.fitbud.test",
    "farhan.paused@demo.fitbud.test",
    "rohan.slipping@demo.fitbud.test",
  ];
  const NY = "America/New_York";

  const localClock = (iso: string, zone: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

  // [table, id column, time column, relationship column]
  const TIME_COLUMNS: readonly (readonly [string, string, string, string])[] = [
    ["measurements", "id", "observed_at", "coaching_relationship_id"],
    ["checkins", "id", "window_starts_at", "coaching_relationship_id"],
    ["checkins", "id", "submitted_at", "coaching_relationship_id"],
    ["checkin_reviews", "id", "created_at", "coaching_relationship_id"],
    ["trainer_notes", "id", "created_at", "coaching_relationship_id"],
    ["exceptions", "id", "detected_at", "coaching_relationship_id"],
    ["notifications", "id", "created_at", "coaching_relationship_id"],
    ["notifications", "id", "read_at", "coaching_relationship_id"],
    ["notifications", "id", "opened_at", "coaching_relationship_id"],
    ["meal_compliance", "id", "logged_at", "coaching_relationship_id"],
    ["workout_executions", "id", "started_at", "coaching_relationship_id"],
  ];

  // Compared by row id and by clock time of day only. Two kinds of row are not comparable and are
  // skipped: rows that exist in one run only, and rows seeded as "now minus whole hours" (an instant,
  // not a local clock time: Meera's open check-in, aged exceptions). The reference minute (:15)
  // keeps zone-anchored times, which sit on :05/:20/:25/:30 clocks, off whole hours before NOW.
  // The seed's refDate is the IST date of the reference instant (build.ts), so both runs share NOW.
  // Rows within 6 h of NOW are skipped too: the seed clamps logs to "now" and picks the latest slot
  // that has opened, which depends on the client's local time of day.
  const isNowRelative = (iso: string) => {
    const ago = Date.parse(NOW) - Date.parse(iso);
    return ago % 3_600_000 === 0 || Math.abs(ago) < 6 * 3_600_000;
  };

  async function localTimes(now: string): Promise<Map<string, { clock: string; nowRelative: boolean }>> {
    const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
    try {
      const libraryIndex = loadDemoLibraryIndex(handle.sqlite);
      handle.sqlite.exec(buildDemoSeedSql({ referenceInstant: now, passwordHash: "z11-4-tz-hash", libraryIndex }));
      const all = (sql: string) => handle.sqlite.exec(sql)[0]?.values ?? [];
      const zoneOfRel = new Map(
        all(`select r.id, u.timezone from coaching_relationships r join users u on u.id = r.trainee_user_id join user_identities i on i.user_id = u.id where i.email in (${EMAILS.map((e) => `'${e}'`).join(", ")})`).map((r) => [String(r[0]), String(r[1])]),
      );
      expect(zoneOfRel.size).toBe(EMAILS.length);
      // Meera's "resolved" overlay (history.ts) still fixes its detected / logged instants in UTC
      // (T09:00Z and friends), not in her zone. Out of scope for Z11-4 (IST literals only); skipped here.
      const utcFixedExceptionId = demoUuid("exception", "meera-resolved");
      const utcFixed = new Set([
        utcFixedExceptionId,
        ...all(`select c.id from meal_compliance c join exceptions e on e.source_entity_id = c.assignment_id where e.id = '${utcFixedExceptionId}'`).map((r) => String(r[0])),
      ]);
      expect(utcFixed.size).toBe(2);
      const out = new Map<string, { clock: string; nowRelative: boolean }>();
      for (const [table, idCol, col, relCol] of TIME_COLUMNS) {
        for (const row of all(`select ${idCol}, ${col}, ${relCol} from ${table} where ${col} is not null order by ${idCol}`)) {
          const zone = zoneOfRel.get(String(row[2]));
          if (zone && !utcFixed.has(String(row[0]))) out.set(`${table}.${col} ${String(row[0])}`, { clock: localClock(String(row[1]), zone), nowRelative: isNowRelative(String(row[1])) });
        }
      }
      return out;
    } finally {
      handle.close();
    }
  }

  it("keeps the IST clock times when the clients move to New York", async () => {
    const baseline = await localTimes(NOW);
    const configs = EMAILS.map((email) => {
      const cfg = PERSONA_CONFIGS.find((p) => p.email === email);
      if (!cfg) throw new Error(`no persona ${email}`);
      return { cfg, original: cfg.timezone };
    });
    let moved: Map<string, { clock: string; nowRelative: boolean }>;
    try {
      for (const { cfg } of configs) cfg.timezone = NY;
      moved = await localTimes(NOW);
    } finally {
      for (const { cfg, original } of configs) cfg.timezone = original;
    }
    const compared = new Map<string, number>();
    const mismatches: string[] = [];
    for (const [key, base] of baseline) {
      const other = moved.get(key);
      if (!other || base.nowRelative || other.nowRelative) continue;
      const column = key.split(" ")[0]!;
      compared.set(column, (compared.get(column) ?? 0) + 1);
      if (other.clock !== base.clock) mismatches.push(`${key}: IST run ${base.clock}, New York run ${other.clock}`);
    }
    expect(mismatches).toEqual([]);
    // Not vacuous: every column was compared on real rows.
    for (const [table, , col] of TIME_COLUMNS) {
      expect(compared.get(`${table}.${col}`) ?? 0, `${table}.${col}`).toBeGreaterThan(0);
    }
  }, 120_000);

  it("names no zone literal outside the timezone helper", () => {
    const source = readFileSync(new URL("./history.ts", import.meta.url), "utf8");
    const lines = source.split("\n").filter((line) => line.includes('"Asia/Kolkata"'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("personaConfig(email)?.timezone");
  });
});
