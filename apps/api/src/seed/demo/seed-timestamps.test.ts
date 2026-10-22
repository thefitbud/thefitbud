import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDemoSeedSql } from "./build.js";
import { loadDemoLibraryIndex } from "./personas.js";
import { demoUuid } from "./ids.js";
import { createMemoryDb, type MemoryDbHandle } from "../../test-support/memory-db.js";
import {
  auditSeedTimestamps,
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
 * 12:37Z (a long workout session's last sets would land just after now).
 */
const REFERENCE_INSTANTS = [
  "2026-10-17T14:30:00.000Z",
  "2026-10-22T21:06:00.000Z",
  "2026-10-22T02:00:00.000Z",
  "2026-10-22T12:37:00.000Z",
];

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
  const q = (sql: string) => handle.sqlite.exec(sql)[0]?.values ?? [];

  beforeAll(async () => {
    handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
    const baseRowKeys = snapshotRowKeys(handle.sqlite);
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
});
