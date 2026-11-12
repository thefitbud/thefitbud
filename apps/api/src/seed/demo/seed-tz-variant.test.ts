import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDemoSeedSql } from "./build.js";
import { PERSONA_CONFIGS } from "./generator/personas.js";
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
describe("history overlays follow the persona's zone (Z11-4)", () => {
  const NOW = "2026-10-28T12:00:00.000Z";
  const EMAILS = [
    "meera.ack@demo.fitbud.test",
    "lakshmi.foods@demo.fitbud.test",
    "farhan.paused@demo.fitbud.test",
    "rohan.slipping@demo.fitbud.test",
  ];
  const NY = "America/New_York";

  const localClock = (iso: string, zone: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, dateStyle: "short", timeStyle: "short", hourCycle: "h23" }).format(new Date(iso));

  async function localTimes(): Promise<string[]> {
    const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
    try {
      const libraryIndex = loadDemoLibraryIndex(handle.sqlite);
      handle.sqlite.exec(buildDemoSeedSql({ referenceInstant: NOW, passwordHash: "z11-4-tz-hash", libraryIndex }));
      const owned = `(select r.id from coaching_relationships r join user_identities i on i.user_id = r.trainee_user_id where i.email in (${EMAILS.map((e) => `'${e}'`).join(", ")}))`;
      const zones = new Map(
        (handle.sqlite.exec(`select i.email, u.timezone from users u join user_identities i on i.user_id = u.id`)[0]?.values ?? []).map((r) => [String(r[0]), String(r[1])]),
      );
      const out: string[] = [];
      const collect = (label: string, sql: string, email: (row: unknown[]) => string) => {
        for (const row of handle.sqlite.exec(sql)[0]?.values ?? []) {
          out.push(`${label} ${String(row[0])} ${localClock(String(row[1]), zones.get(email(row)) ?? "UTC")}`);
        }
      };
      const emailOfRel = new Map(
        (handle.sqlite.exec(`select r.id, i.email from coaching_relationships r join user_identities i on i.user_id = r.trainee_user_id`)[0]?.values ?? []).map((r) => [String(r[0]), String(r[1])]),
      );
      collect("measurement", `select type || coalesce(id, ''), observed_at, coaching_relationship_id from measurements where coaching_relationship_id in ${owned} order by id`, (r) => emailOfRel.get(String(r[2])) ?? "");
      collect("checkin-start", `select id, window_starts_at, coaching_relationship_id from checkins where coaching_relationship_id in ${owned} and window_starts_at is not null and window_starts_at <> '2026-10-28T10:00:00.000Z' order by id`, (r) => emailOfRel.get(String(r[2])) ?? "");
      collect("note", `select id, created_at, coaching_relationship_id from trainer_notes where coaching_relationship_id in ${owned} order by id`, (r) => emailOfRel.get(String(r[2])) ?? "");
      return out;
    } finally {
      handle.close();
    }
  }

  it("keeps the IST clock times when the clients move to New York", async () => {
    // Meera's open check-in starts at now - 2h by design (an instant, not a local clock time), so it is left out of the comparison.
    const baseline = await localTimes();
    const configs = EMAILS.map((email) => {
      const cfg = PERSONA_CONFIGS.find((p) => p.email === email);
      if (!cfg) throw new Error(`no persona ${email}`);
      return { cfg, original: cfg.timezone };
    });
    let moved: string[];
    try {
      for (const { cfg } of configs) cfg.timezone = NY;
      moved = await localTimes();
    } finally {
      for (const { cfg, original } of configs) cfg.timezone = original;
    }
    // Not vacuous: rows from all three families exist, and they were really in IST.
    expect(baseline.length).toBeGreaterThan(10);
    for (const family of ["measurement", "checkin-start", "note"]) {
      expect(baseline.some((line) => line.startsWith(family))).toBe(true);
    }
    expect(moved.filter((l, i) => l !== baseline[i]).slice(0, 8)).toEqual([]);
    expect(moved).toEqual(baseline);
  }, 120_000);

  it("names no zone literal outside the timezone helper", () => {
    const source = readFileSync(new URL("./history.ts", import.meta.url), "utf8");
    const lines = source.split("\n").filter((line) => line.includes('"Asia/Kolkata"'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("personaConfig(email)?.timezone");
  });
});
