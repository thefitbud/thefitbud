import initSqlJs from "sql.js";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { GLOBAL_CHECKIN_FORM_VERSION_ID } from "@fitbud/core";
import { app } from "../index.js";
import * as schema from "../db/schema.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import type { Env } from "../types.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { drizzle } from "drizzle-orm/sql-js";

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

const MIGRATIONS_THROUGH_0018 = [
  "0000_identity.sql",
  "0001_relationship_onboarding.sql",
  "0012_invitation_whatsapp.sql",
  "0002_coaching_configuration.sql",
  "0003_plans.sql",
  "0004_workouts.sql",
  "0005_meals.sql",
  "0006_checkins.sql",
  "0007_exceptions.sql",
  "0008_progress_media.sql",
  "0009_sync.sql",
  "0010_notifications.sql",
  "0013_domain_contracts.sql",
  "0014_onboarding_form_templates.sql",
  "0011_templates_libraries.sql",
  "0015_iteration_a.sql",
  "0016_food_exercise_libraries.sql",
  "0017_plan_template_ownership.sql",
  "0018_assignment_schedule_status.sql",
];

const TRAINER_ID = "11111111-1111-4111-8111-111111111111";
const TRAINEE_ID = "22222222-2222-4222-8222-222222222222";
const RELATIONSHIP_ID = "33333333-3333-4333-8333-333333333333";
const SUBMITTED_CHECKIN_ID = "44444444-4444-4444-8444-444444444444";
const DRAFT_CHECKIN_ID = "55555555-5555-4555-8555-555555555555";
const OVERDUE_CHECKIN_EXCEPTION_ID = "66666666-6666-4666-8666-666666666666";
const MISSED_WORKOUT_EXCEPTION_ID = "77777777-7777-4777-8777-777777777777";
const WORKOUT_SOURCE_ID = "88888888-8888-4888-8888-888888888888";
const TRAINER_EMAIL = "legacy-inbox@example.com";

/**
 * Local D1 rejects ADD COLUMN that combines REFERENCES with a non-NULL default.
 * sql.js accepts that statement, so migration tests must reject it explicitly.
 */
function assertD1SafeAddColumn(sql: string, fileName: string) {
  for (const statement of sql.split(";")) {
    const compact = statement.replace(/\s+/g, " ").trim();
    if (!/^ALTER TABLE\b/i.test(compact) || !/\bADD COLUMN\b/i.test(compact)) {
      continue;
    }
    const hasReferences = /\bREFERENCES\b/i.test(compact);
    const hasNonNullDefault =
      /\bDEFAULT\b/i.test(compact) && !/\bDEFAULT\s+NULL\b/i.test(compact);
    expect(
      hasReferences && hasNonNullDefault,
      `${fileName} uses an ADD COLUMN that D1 cannot apply`,
    ).toBe(false);
  }
}

function testEnv(): Env {
  return {
    DB: {
      prepare() {
        throw new Error("D1 should not be used when test DB override is set");
      },
      dump: async () => new ArrayBuffer(0),
      batch: async () => [],
      exec: async () => ({ count: 0, duration: 0 }),
    } as unknown as D1Database,
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
  };
}

describe("legacy dev rows after check-in form and exception severity migrations", () => {
  let closeDb: (() => void) | null = null;

  afterEach(() => {
    setTestDbOverride(null);
    closeDb?.();
    closeDb = null;
  });

  it("rejects D1-incompatible ADD COLUMN statements in committed migrations", () => {
    const files = readdirSync(drizzleDir).filter((file) => file.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      assertD1SafeAddColumn(readFileSync(join(drizzleDir, file), "utf8"), file);
    }
  });

  it("serves attention and check-in inbox for rows shaped like the local dev database", async () => {
    const SQL = await initSqlJs();
    const sqlite = new SQL.Database();
    closeDb = () => sqlite.close();
    for (const file of MIGRATIONS_THROUGH_0018) {
      sqlite.exec(readFileSync(join(drizzleDir, file), "utf8"));
    }

    const answers = JSON.stringify({
      wellbeing: "Energy is good and I am sleeping about seven hours.",
      notes: "Squats felt heavy on Wednesday but recovered by Friday.",
      bodyWeightKg: 61.8,
    });
    const mealDetails = JSON.stringify({
      localDate: "2026-09-25",
      windowEndsAt: "2026-09-25T18:30:00.000Z",
      rule: "derived_missed_after_completion_window",
    });
    const checkinDetails = JSON.stringify({
      localDate: "2026-09-25",
      windowEndsAt: "2026-09-25T18:30:00.000Z",
      rule: "derived_overdue_after_due_window",
    });

    sqlite.run(
      `INSERT INTO users (id, firebase_uid, account_state, timezone, created_at, updated_at)
       VALUES (?, ?, 'active', 'Asia/Kolkata', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`,
      [TRAINER_ID, `trainer-${TRAINER_EMAIL}`],
    );
    sqlite.run(
      `INSERT INTO users (id, firebase_uid, account_state, timezone, created_at, updated_at)
       VALUES (?, ?, 'active', 'Asia/Kolkata', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`,
      [TRAINEE_ID, "trainee-legacy-inbox"],
    );
    sqlite.run(
      `INSERT INTO trainee_profiles (id, user_id, display_name, created_at, updated_at)
       VALUES ('99999999-9999-4999-8999-999999999999', ?, 'Asha Menon', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`,
      [TRAINEE_ID],
    );
    sqlite.run(
      `INSERT INTO coaching_relationships (
         id, trainer_user_id, trainee_user_id, status, started_at, created_at, updated_at
       ) VALUES (?, ?, ?, 'active', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`,
      [RELATIONSHIP_ID, TRAINER_ID, TRAINEE_ID],
    );
    sqlite.run(
      `INSERT INTO checkins (
         id, coaching_relationship_id, local_date, window_starts_at, window_ends_at,
         record_status, record_version, definition_version, answers_json, submitted_at,
         created_at, updated_at
       ) VALUES (
         ?, ?, '2026-09-20', '2026-09-20T02:30:00.000Z', '2026-09-21T02:30:00.000Z',
         'submitted', 0, 1, ?, '2026-10-04T14:27:19.382Z',
         '2026-09-20T02:30:00.000Z', '2026-10-04T14:27:19.382Z'
       )`,
      [SUBMITTED_CHECKIN_ID, RELATIONSHIP_ID, answers],
    );
    sqlite.run(
      `INSERT INTO checkins (
         id, coaching_relationship_id, local_date, window_starts_at, window_ends_at,
         record_status, record_version, definition_version, created_at, updated_at
       ) VALUES (
         ?, ?, '2026-09-25', '2026-09-25T02:30:00.000Z', '2026-09-25T18:30:00.000Z',
         'draft', 0, 1, '2026-09-25T02:30:00.000Z', '2026-09-25T02:30:00.000Z'
       )`,
      [DRAFT_CHECKIN_ID, RELATIONSHIP_ID],
    );
    sqlite.run(
      `INSERT INTO exceptions (
         id, coaching_relationship_id, type, status, rule_version, source_entity_type,
         source_entity_id, summary, details_json, detected_at, activated_at, created_at, updated_at
       ) VALUES (
         ?, ?, 'overdue_checkin', 'active', 'mvp.v1', 'checkin',
         ?, 'Overdue check-in for 2026-09-25', ?,
         '2026-09-26T00:00:00.000Z', '2026-09-26T00:00:00.000Z',
         '2026-09-26T00:00:00.000Z', '2026-09-26T00:00:00.000Z'
       )`,
      [OVERDUE_CHECKIN_EXCEPTION_ID, RELATIONSHIP_ID, DRAFT_CHECKIN_ID, checkinDetails],
    );
    sqlite.run(
      `INSERT INTO exceptions (
         id, coaching_relationship_id, type, status, rule_version, source_entity_type,
         source_entity_id, summary, details_json, detected_at, activated_at, created_at, updated_at
       ) VALUES (
         ?, ?, 'missed_workout', 'active', 'mvp.v1', 'workout_assignment',
         ?, 'Missed workout on 2026-09-25', ?,
         '2026-09-26T00:00:00.000Z', '2026-09-26T00:00:00.000Z',
         '2026-09-26T00:00:00.000Z', '2026-09-26T00:00:00.000Z'
       )`,
      [MISSED_WORKOUT_EXCEPTION_ID, RELATIONSHIP_ID, WORKOUT_SOURCE_ID, mealDetails],
    );

    sqlite.exec(readFileSync(join(drizzleDir, "0019_checkin_form_templates.sql"), "utf8"));
    sqlite.exec(readFileSync(join(drizzleDir, "0020_exception_severity.sql"), "utf8"));

    const pinned = sqlite.exec(
      `SELECT checkin_form_version_id FROM checkins WHERE id = '${SUBMITTED_CHECKIN_ID}'`,
    );
    expect(pinned[0]?.values[0]?.[0]).toBe(GLOBAL_CHECKIN_FORM_VERSION_ID);
    const severities = sqlite.exec(
      "SELECT type, severity FROM exceptions ORDER BY type",
    );
    expect(severities[0]?.values).toEqual([
      ["missed_workout", "critical"],
      ["overdue_checkin", "attention"],
    ]);

    const db = drizzle(sqlite, { schema }) as unknown as Db;
    setTestDbOverride(db);

    const token = createTestIdToken(`trainer-${TRAINER_EMAIL}`, TRAINER_EMAIL);
    const sessionResponse = await app.request(
      "/auth/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token, timezone: "Asia/Kolkata" }),
      },
      testEnv(),
    );
    expect(sessionResponse.status).toBe(200);
    const cookie = sessionResponse.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toBeTruthy();

    const inbox = await app.request(
      "/checkins/inbox",
      { headers: { Cookie: cookie! } },
      testEnv(),
    );
    expect(inbox.status).toBe(200);
    const inboxBody = (await inbox.json()) as {
      data: {
        items: Array<{
          checkin: {
            id: string;
            checkinFormVersionId: string;
            answers: { wellbeing: string; bodyWeightKg: number | null } | null;
            status: string;
          };
        }>;
      };
    };
    const submitted = inboxBody.data.items.find(
      (item) => item.checkin.id === SUBMITTED_CHECKIN_ID,
    );
    expect(submitted?.checkin.checkinFormVersionId).toBe(
      GLOBAL_CHECKIN_FORM_VERSION_ID,
    );
    expect(submitted?.checkin.status).toBe("submitted");
    expect(submitted?.checkin.answers?.bodyWeightKg).toBe(61.8);
    expect(submitted?.checkin.answers?.wellbeing).toContain("sleeping");

    const attention = await app.request(
      "/exceptions/attention",
      { headers: { Cookie: cookie! } },
      testEnv(),
    );
    expect(attention.status).toBe(200);
    const attentionBody = (await attention.json()) as {
      data: {
        items: Array<{
          exception: { id: string; type: string; severity: string };
          traineeDisplayName: string | null;
        }>;
      };
    };
    const overdue = attentionBody.data.items.find(
      (item) => item.exception.id === OVERDUE_CHECKIN_EXCEPTION_ID,
    );
    expect(overdue?.exception.severity).toBe("attention");
    expect(overdue?.exception.type).toBe("overdue_checkin");
    expect(overdue?.traineeDisplayName).toBe("Asha Menon");
  });
});
