import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDemoSeedSql } from "./build.js";
import { loadDemoLibraryIndex } from "./personas.js";
import { createMemoryDb, type MemoryDbHandle } from "../../test-support/memory-db.js";
import { evaluateRelationshipExceptions } from "../../domain/exceptions.js";

/**
 * Task QS3: the persona overlays (history.ts) and generated open asks must respect
 * meal / workout windows at any reset time. A client log or a coach ask only exists
 * once its item's window has opened; an overdue / skipped / missed exception only
 * once it has closed. Otherwise the first coach read auto-resolves seeded attention
 * items (evaluateRelationshipExceptions finds no matching candidate). Same instants
 * as seed-timestamps.test.ts (several local times of day plus a Monday).
 */
const REFERENCE_INSTANTS = [
  "2026-10-17T14:30:00.000Z",
  "2026-10-22T21:06:00.000Z",
  "2026-10-22T02:00:00.000Z",
  "2026-10-22T12:37:00.000Z",
  "2026-10-22T00:30:00.000Z",
  "2026-10-26T00:30:00.000Z",
];

const CLOSED_WINDOW_TYPES = "('overdue_meal', 'skipped_meal', 'missed_workout', 'skipped_workout')";
const DETECTED_AFTER_CLOSE_TYPES = "('overdue_meal', 'missed_workout')";

/** Exceptions joined to their meal / workout item (window columns null when the item is missing). */
const EXCEPTION_ITEMS = `select e.id, e.type, e.status, e.detected_at,
    coalesce(m.window_starts_at, w.window_starts_at) as window_starts_at,
    coalesce(m.window_ends_at, w.window_ends_at) as window_ends_at,
    coalesce(m.id, w.id) as item_id
  from exceptions e
  left join meal_assignments m on e.source_entity_type = 'meal_assignment' and m.id = e.source_entity_id
  left join workout_assignments w on e.source_entity_type = 'workout_assignment' and w.id = e.source_entity_id
  where e.source_entity_type in ('meal_assignment', 'workout_assignment')`;

/** Client logs and coach asks joined to their item's window. */
const LOGS_AND_ASKS = `
  select 'meal_compliance' as tbl, c.id, m.window_starts_at, c.logged_at as at from meal_compliance c
    join meal_assignments m on m.id = c.assignment_id
  union all select 'workout_executions', x.id, w.window_starts_at, x.started_at from workout_executions x
    join workout_assignments w on w.id = x.assignment_id
  union all select 'coach_asks', a.id, m.window_starts_at, a.asked_at from coach_asks a
    join meal_assignments m on a.item_type = 'meal_assignment' and m.id = a.item_id
  union all select 'coach_asks', a.id, w.window_starts_at, a.asked_at from coach_asks a
    join workout_assignments w on a.item_type = 'workout_assignment' and w.id = a.item_id`;

describe.each(REFERENCE_INSTANTS)("demo seed overlay windows at %s", (now) => {
  let handle: MemoryDbHandle;
  const q = (sql: string) => handle.sqlite.exec(sql)[0]?.values ?? [];
  const rows = (sql: string) => q(sql).map((r) => r.map(String).join(" | "));

  beforeAll(async () => {
    handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
    const libraryIndex = loadDemoLibraryIndex(handle.sqlite);
    handle.sqlite.exec(buildDemoSeedSql({ referenceInstant: now, passwordHash: "qs3-test-hash", libraryIndex }));
  }, 60_000);

  afterAll(() => handle?.close());

  it("logs and asks only on items whose window has opened", () => {
    expect(rows(`select tbl, id, window_starts_at, at from (${LOGS_AND_ASKS}) where window_starts_at > '${now}'`)).toEqual([]);
    // Not vacuous: open asks and today's logs exist.
    expect(Number(q(`select count(*) from coach_asks where status = 'open'`)[0]?.[0])).toBeGreaterThan(0);
    expect(Number(q(`select count(*) from (${LOGS_AND_ASKS})`)[0]?.[0])).toBeGreaterThan(0);
  });

  it("raises overdue / skipped / missed exceptions only on items whose window has closed", () => {
    expect(
      rows(`select id, type, status, window_ends_at from (${EXCEPTION_ITEMS})
        where type in ${CLOSED_WINDOW_TYPES} and window_ends_at >= '${now}'`),
    ).toEqual([]);
    expect(
      rows(`select id, type, status, window_starts_at from (${EXCEPTION_ITEMS})
        where type not in ${CLOSED_WINDOW_TYPES} and window_starts_at > '${now}'`),
    ).toEqual([]);
    // An unresolved overdue / missed exception is detected no earlier than the window closed.
    expect(
      rows(`select id, type, detected_at, window_ends_at from (${EXCEPTION_ITEMS})
        where status <> 'resolved' and type in ${DETECTED_AFTER_CLOSE_TYPES} and detected_at < window_ends_at`),
    ).toEqual([]);
    expect(rows(`select id, type, status from (${EXCEPTION_ITEMS}) where status <> 'resolved' and item_id is null`)).toEqual([]);
    expect(Number(q(`select count(*) from (${EXCEPTION_ITEMS}) where status <> 'resolved' and type in ${CLOSED_WINDOW_TYPES}`)[0]?.[0])).toBeGreaterThan(0);
  });

  it("auto-resolves nothing on the first coach read after reset", async () => {
    const before = Number(q("select count(*) from exceptions where status <> 'resolved'")[0]?.[0]);
    expect(before).toBeGreaterThan(0);
    const resolved: string[] = [];
    for (const [relId] of q("select id from coaching_relationships where status = 'active' order by id")) {
      const result = await evaluateRelationshipExceptions(handle.db, String(relId), now);
      for (const exception of result.resolvedExceptions) {
        resolved.push(`${exception.id} ${exception.type} ${exception.sourceEntityType}`);
      }
    }
    expect(resolved).toEqual([]);
    // Evaluate keeps at most ten open per client; the seed must not start above it.
    expect(
      rows(`select coaching_relationship_id, count(*) from exceptions
        where status in ('detected', 'active', 'acknowledged') group by 1 having count(*) > 10`),
    ).toEqual([]);
  });
});
