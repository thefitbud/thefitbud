import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDemoSeedSql, kolkataLocalDate } from "./build.js";
import { previousWeekdayBefore } from "./history.js";
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
 * (an exception acknowledged within hours of detection would land after now), a
 * Monday (start of the plan week) and 03:31Z on 10-20 (one minute after Pooja's
 * check-in window closed: a detection stamped close + 5 min would land after now).
 */
const REFERENCE_INSTANTS = [
  "2026-10-17T14:30:00.000Z",
  "2026-10-22T21:06:00.000Z",
  "2026-10-22T02:00:00.000Z",
  "2026-10-22T12:37:00.000Z",
  "2026-10-22T00:30:00.000Z",
  "2026-10-26T00:30:00.000Z",
  "2026-10-20T03:31:00.000Z",
  // QS6 (QA-PR33 F1): Sunday 20:00 IST, and half an hour after today's 13:00 IST
  // lunch opened (Ishita's overlay ask used to sit at the window open).
  "2026-10-25T14:30:00.000Z",
  "2026-10-26T08:00:00.001Z",
];

const ROHAN = "rohan.slipping@demo.fitbud.test";
const rohanSundayReviewSql = (now: string) => `select cr.created_at, cr.updated_at from checkin_reviews cr
  where cr.checkin_id = '${demoUuid("checkin", ROHAN, previousWeekdayBefore(kolkataLocalDate(now), 0))}'`;

/** Columns that name the user a row belongs to or was acted on by. */
const USER_COLUMNS = ["user_id", "trainee_user_id", "trainer_user_id", "recipient_user_id", "accepted_user_id", "answered_by", "ended_by_user_id"];
const ACCOUNT_TABLES = ["users", "user_roles", "user_identities", "trainer_profiles", "trainee_profiles"];
const SCHEDULE = new Set(["window_starts_at", "window_ends_at", "expires_at", "paused_until", "effective_from", "effective_to", "due_at", "locked_until"]);

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
    expect(checkedTables).toEqual(expect.arrayContaining(["exceptions", "meal_assignments", "workout_executions", "plans", "plan_templates", "checkin_reviews"]));
    // QS5: no allowlist. plan_templates e9efffa5 and Rohan's Sunday review are ordered too.
    expect(violations.map((v) => `${v.table} ${v.rowKey}: ${v.earlierValue} > ${v.laterValue}`)).toEqual([]);
  });

  it("orders Rohan's latest Sunday review: submitted <= created < now, created <= updated <= now (QS5)", () => {
    const rows = q(rohanSundayReviewSql(now)) as string[][];
    expect(rows).toHaveLength(1);
    const [createdAt, updatedAt] = rows[0]!;
    const [submittedAt] = q(`select submitted_at from checkins where id = '${demoUuid("checkin", ROHAN, previousWeekdayBefore(kolkataLocalDate(now), 0))}'`)[0] as string[];
    expect(Date.parse(submittedAt!)).toBeLessThanOrEqual(Date.parse(createdAt!));
    expect(Date.parse(createdAt!)).toBeLessThan(Date.parse(now));
    expect(Date.parse(createdAt!)).toBeLessThanOrEqual(Date.parse(updatedAt!));
    expect(Date.parse(updatedAt!)).toBeLessThanOrEqual(Date.parse(now));
  });

  it("detects overdue check-ins after their window closed and never after now (QS5: Pooja, Rohan)", () => {
    const rows = q(`select e.id, coalesce(c.window_ends_at, json_extract(e.details_json, '$.windowEndsAt')), e.detected_at, e.created_at, e.activated_at
      from exceptions e left join checkins c on c.id = e.source_entity_id where e.type = 'overdue_checkin'`) as Array<Array<string | null>>;
    // Rohan's overlay and Pooja's generated draft are both covered.
    expect(rows.map((r) => r[0])).toEqual(expect.arrayContaining([demoUuid("exception", "rohan-overdue-checkin-active")]));
    const bad: string[] = [];
    for (const [id, windowEndsAt, ...stamps] of rows) {
      expect(windowEndsAt, String(id)).toBeTruthy();
      for (const stamp of stamps) {
        if (stamp == null) continue;
        if (Date.parse(stamp) < Date.parse(windowEndsAt!) || Date.parse(stamp) > Date.parse(now)) bad.push(`${id}: ${stamp} not in [${windowEndsAt}, ${now}]`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("finishes every set inside its workout session (QS5)", () => {
    const rows = q(`select s.id, s.completed_at, w.started_at, w.completed_at from set_executions s
      join exercise_executions x on x.id = s.exercise_execution_id join workout_executions w on w.id = x.workout_execution_id
      where s.completed_at is not null and (julianday(s.completed_at) > julianday(w.completed_at) or julianday(s.completed_at) < julianday(w.started_at))`);
    expect(rows).toEqual([]);
    expect(Number(q("select count(*) from set_executions where completed_at is not null")[0]?.[0])).toBeGreaterThan(0);
  });

  it("asks about a meal or workout at least an hour into its window, before it closed and never after now (QS5, QS6)", () => {
    // Every ask, open (current) or answered / expired, generated or overlay.
    const rows = q(`select a.id, a.status, a.asked_at, a.last_asked_at,
        coalesce(m.window_starts_at, w.window_starts_at) as opens, coalesce(m.window_ends_at, w.window_ends_at) as closes
      from coach_asks a
      left join meal_assignments m on a.item_type = 'meal_assignment' and m.id = a.item_id
      left join workout_assignments w on a.item_type = 'workout_assignment' and w.id = a.item_id`) as Array<Array<string | null>>;
    const bad: string[] = [];
    for (const [id, status, askedAt, lastAskedAt, opens, closes] of rows) {
      if (opens == null || closes == null) {
        bad.push(`${id} (${status}): no item`);
        continue;
      }
      for (const stamp of [askedAt!, lastAskedAt!]) {
        if (Date.parse(stamp) < Date.parse(opens) + 3_600_000) bad.push(`${id} (${status}): ${stamp} < opens ${opens} + 1h`);
        if (Date.parse(stamp) >= Date.parse(closes)) bad.push(`${id} (${status}): ${stamp} >= closes ${closes}`);
        if (Date.parse(stamp) > Date.parse(now)) bad.push(`${id} (${status}): ${stamp} > now`);
      }
    }
    expect(bad).toEqual([]);
    // Not vacuous: current open asks (generator OPEN_ASKS and Ishita's overlay) and past ones are checked.
    expect(rows.filter((r) => r[1] === "open").map((r) => r[0])).toEqual(expect.arrayContaining([demoUuid("coach_ask", "ishita")]));
    expect(rows.filter((r) => r[1] === "open").length).toBeGreaterThanOrEqual(4);
    expect(rows.filter((r) => r[1] === "answered" || r[1] === "expired").length).toBeGreaterThan(0);
  });

  it("creates every account before its own first seeded fact, in the past (QS5)", () => {
    const users = new Map((q("select id, created_at from users") as string[][]).map(([id, at]) => [id!, at!]));
    expect(users.size).toBeGreaterThan(20);
    for (const [id, createdAt] of users) {
      expect(Date.parse(createdAt), id).toBeLessThan(Date.parse(now));
    }
    for (const table of ACCOUNT_TABLES.slice(1)) {
      expect(q(`select t.rowid from ${table} t join users u on u.id = t.user_id where t.created_at != u.created_at`), table).toEqual([]);
    }
    const tables = (q("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '_cf_%' and name != 'd1_migrations' and sql not like 'CREATE VIRTUAL TABLE%'") as string[][]).map((r) => r[0]!);
    const early: string[] = [];
    for (const table of tables) {
      if (ACCOUNT_TABLES.includes(table)) continue;
      const columns = (q(`select name from pragma_table_info('${table}')`) as string[][]).map((r) => r[0]!);
      const owners = USER_COLUMNS.filter((c) => columns.includes(c)).map((c) => `t."${c}"`);
      const rel = columns.includes("coaching_relationship_id") ? "t.coaching_relationship_id" : columns.includes("relationship_id") ? "t.relationship_id" : table === "coaching_relationships" ? "t.id" : null;
      if (rel) owners.push(`(select r.trainer_user_id from coaching_relationships r where r.id = ${rel})`, `(select r.trainee_user_id from coaching_relationships r where r.id = ${rel})`);
      if (!owners.length) continue;
      for (const column of columns.filter((c) => !SCHEDULE.has(c))) {
        for (const owner of owners) {
          const rows = q(`select t.rowid, t."${column}", u.id, u.created_at from "${table}" t join users u on u.id = ${owner}
            where typeof(t."${column}") = 'text' and t."${column}" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*' and julianday(t."${column}") < julianday(u.created_at)`) as string[][];
          for (const [rowId, value, userId, userCreated] of rows) {
            early.push(`${table}.${column} rowid ${rowId} = ${value} < user ${userId} created ${userCreated}`);
          }
        }
      }
    }
    expect(early.slice(0, 20)).toEqual([]);
  });
});

describe("demo seed timezone rule (QS5)", () => {
  it("keeps the legacy Deepak → Dubai rule in one helper", () => {
    const sources = ["./history.ts", "./build.ts"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
    expect(sources.match(/startsWith\("deepak\."\)\s*\?\s*"Asia\/Dubai"/g) ?? []).toHaveLength(1);
    expect(sources).toMatch(/export function legacyTimezoneFor/);
    expect(readFileSync(new URL("./build.ts", import.meta.url), "utf8")).toMatch(/legacyTimezoneFor\(account\.email\)/);
  });
});
