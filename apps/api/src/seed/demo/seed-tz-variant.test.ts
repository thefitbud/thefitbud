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
