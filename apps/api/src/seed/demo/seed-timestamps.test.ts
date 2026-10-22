import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDemoSeedSql } from "./build.js";
import { loadDemoLibraryIndex } from "./personas.js";
import { demoUuid } from "./ids.js";
import { createMemoryDb, type MemoryDbHandle } from "../../test-support/memory-db.js";
import {
  auditSeedTimestamps,
  auditTimestampOrder,
  snapshotRowKeys,
  summarizeFindings,
  type TimestampAudit,
} from "../../test-support/seed-timestamp-audit.js";

/**
 * Task QS2: no seeded fact may be stamped after the seed's reference instant, and
 * ended relationships carry no activity after `ended_at`. Violations depend on the
 * time of day of the reference instant (which local slots have started), so this
 * runs at several instants: the frozen test instant, QA's 21:06Z reset (02:36 IST,
 * just past local midnight), 02:00Z (before Dubai's 07:00 workout slot) and
 * 12:37Z (a long workout session's last sets would land just after now), 00:30Z
 * (an exception acknowledged within hours of detection would land after now) and a
 * Monday (start of the plan week).
 */
const REFERENCE_INSTANTS = [
  "2026-10-17T14:30:00.000Z",
  "2026-10-22T21:06:00.000Z",
  "2026-10-22T02:00:00.000Z",
  "2026-10-22T12:37:00.000Z",
  "2026-10-22T00:30:00.000Z",
  "2026-10-26T00:30:00.000Z",
];

/**
 * Pre-existing created_at > updated_at rows outside QS2's exception scope, tracked as
 * follow-ups. Anything else fails the test.
 *  - plan_templates e9efffa5: a trainer-library template (generator/library-rows.ts)
 *    whose updated_at offset is older than its created_at offset.
 *  - checkin_reviews: history.ts's Rohan overlay copies the Friday reply onto his
 *    latest Sunday review with updated_at = the Friday submission, before that review.
 */
const KNOWN_PLAN_TEMPLATE_FOLLOW_UPS = ["e9efffa5-29ac-4846-b1b9-870af8242cb4"];
const ROHAN_SUNDAY_REVIEW_SQL = `select cr.id from checkin_reviews cr
  join coaching_relationships r on r.id = cr.coaching_relationship_id
  where r.trainee_user_id = '${demoUuid("user", "rohan.slipping@demo.fitbud.test")}'
    and cr.notes = 'Solid effort this week — lock in sleep and we will rebuild training next.'`;

/** Seeded tables that hold user- or trainer-level rows, not relationship activity. */
const USER_LEVEL_TABLES = new Set([
  "users",
  "user_roles",
  "user_identities",
  "trainer_profiles",
  "trainee_profiles",
  "device_tokens",
  "notification_preferences",
  "reminder_states",
  "client_invitations",
  "plan_templates",
  "onboarding_form_templates",
  "onboarding_form_versions",
  "checkin_form_templates",
  "checkin_form_versions",
  "exercise_library_items",
  "food_library_items",
  "food_library_servings",
]);

const ENDED_RELATIONSHIPS = 2; // Kavya (ended) and Nikhil (reactivation pending)

describe.each(REFERENCE_INSTANTS)("demo seed timestamps at %s", (now) => {
  let handle: MemoryDbHandle;
  let audit: TimestampAudit;
  let baseRowKeys: Map<string, Set<string>>;
  const q = (sql: string) => handle.sqlite.exec(sql)[0]?.values ?? [];

  beforeAll(async () => {
    handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
    baseRowKeys = snapshotRowKeys(handle.sqlite);
    const libraryIndex = loadDemoLibraryIndex(handle.sqlite);
    handle.sqlite.exec(buildDemoSeedSql({ referenceInstant: now, passwordHash: "qs2-test-hash", libraryIndex }));
    audit = auditSeedTimestamps(handle.sqlite, { now, baseRowKeys });
  }, 60_000);

  afterAll(() => handle?.close());

  it("scans the activity tables (the audit is not vacuous)", () => {
    for (const column of [
      "exception_actions.created_at",
      "meal_assignments.created_at",
      "meal_assignments.updated_at",
      "workout_assignments.created_at",
      "workout_executions.started_at",
      "plan_versions.updated_at",
      "coaching_configurations.updated_at",
      "notifications.created_at",
    ]) {
      expect(audit.scannedColumns.get(column) ?? 0, column).toBeGreaterThan(0);
    }
    expect(q("select count(*) from coaching_relationships where ended_at is not null")[0]?.[0]).toBe(ENDED_RELATIONSHIPS);
    // A new seeded table that holds timestamps must be tied to a relationship or listed as user-level.
    expect(audit.unscopedTables.filter((t) => !USER_LEVEL_TABLES.has(t))).toEqual([]);
  });

  it("stamps no fact that already happened after the reference instant", () => {
    expect(summarizeFindings(audit.findings.filter((f) => f.kind === "after_now"))).toEqual([]);
  });

  it("records no activity for ended relationships after ended_at", () => {
    expect(summarizeFindings(audit.findings.filter((f) => f.kind === "after_end"))).toEqual([]);
  });

  it("closes Kavya's ended-coaching exception by the end, not at reset time", () => {
    const [row] = q(
      `select e.created_at, e.updated_at, r.ended_at from exceptions e join coaching_relationships r on r.id = e.coaching_relationship_id where e.id = '${demoUuid("exception", "kavya-ended")}'`,
    );
    expect(row).toBeDefined();
    const [createdAt, updatedAt, endedAt] = row as string[];
    expect(Date.parse(createdAt!)).toBeLessThanOrEqual(Date.parse(endedAt!));
    expect(updatedAt).toBe(endedAt);
  });

  it("keeps scheduled items in the future", () => {
    const n = (sql: string) => Number(q(sql)[0]?.[0] ?? 0);
    const active = "coaching_relationship_id in (select id from coaching_relationships where status = 'active')";
    expect(n(`select count(*) from meal_assignments where ${active} and schedule_status = 'scheduled' and window_starts_at > '${now}'`)).toBeGreaterThan(0);
    expect(n(`select count(*) from workout_assignments where ${active} and schedule_status = 'scheduled' and window_starts_at > '${now}'`)).toBeGreaterThan(0);
    expect(n(`select count(*) from checkins where ${active} and submitted_at is null and window_ends_at > '${now}'`)).toBeGreaterThan(0);
    expect(n(`select count(*) from reminder_states where paused_until > '${now}'`)).toBeGreaterThan(0);
    expect(n(`select count(*) from reactivation_requests where status = 'pending' and expires_at > '${now}'`)).toBeGreaterThan(0);
    expect(n(`select count(*) from client_invitations where expires_at > '${now}'`)).toBeGreaterThan(0);
  });

  it("never creates an exception after it was acknowledged or resolved", () => {
    const { violations } = auditTimestampOrder(handle.sqlite, {
      baseRowKeys,
      pairs: [
        { table: "exceptions", earlier: "created_at", later: "acknowledged_at" },
        { table: "exceptions", earlier: "created_at", later: "resolved_at" },
        { table: "exceptions", earlier: "detected_at", later: "acknowledged_at" },
        { table: "exceptions", earlier: "detected_at", later: "resolved_at" },
      ],
    });
    expect(violations).toEqual([]);
    // The invariant is checked on real data, not an empty set.
    expect(Number(q("select count(*) from exceptions where acknowledged_at is not null")[0]?.[0])).toBeGreaterThan(0);
    expect(Number(q("select count(*) from exceptions where resolved_at is not null")[0]?.[0])).toBeGreaterThan(0);
  });

  it("never stamps created_at after updated_at", () => {
    const { violations, checkedTables } = auditTimestampOrder(handle.sqlite, { baseRowKeys });
    expect(checkedTables).toEqual(expect.arrayContaining(["exceptions", "meal_assignments", "workout_executions", "plans"]));
    const known: Record<string, string[]> = {
      plan_templates: KNOWN_PLAN_TEMPLATE_FOLLOW_UPS,
      checkin_reviews: q(ROHAN_SUNDAY_REVIEW_SQL).map((r) => String(r[0])),
    };
    const unexpected = violations.filter((v) => !known[v.table]?.includes(v.rowKey));
    expect(unexpected.map((v) => `${v.table} ${v.rowKey}: ${v.earlierValue} > ${v.laterValue}`)).toEqual([]);
  });
});
