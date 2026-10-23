import { DEMO_ACCOUNTS, DEMO_PASSWORD_PLAINTEXT } from "./spec.js";
import { DEMO_EXTRA_ACCOUNTS } from "./spec-extra.js";
import { personaConfig } from "./generator/personas.js";

/** Original 19 accounts + the 8 generated Rahul clients. */
export const DEMO_ALL_ACCOUNTS = [...DEMO_ACCOUNTS, ...DEMO_EXTRA_ACCOUNTS];
import { buildDemoHistorySql, legacyTimezoneFor } from "./history.js";
import { demoUuid, sqlQuote } from "./ids.js";
import type { DemoLibraryIndex } from "./personas.js";

export type DemoSeedInput = {
  /** ISO timestamp used as "now" for the seeded world */
  referenceInstant: string;
  /** PBKDF2 hash for {@link DEMO_PASSWORD_PLAINTEXT} */
  passwordHash: string;
  /** Resolved v2 library rows (required for honest snapshots). */
  libraryIndex: DemoLibraryIndex;
};

export function kolkataLocalDate(instant: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

/** Title-case fallback when an account has no explicit displayName. */
function titleCaseDemoName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((part) =>
      part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part,
    )
    .join(" ");
}

type DemoTraineeBio = { age: number; birthMonthDay: string; gender: string };

/** Realistic profile facts (header age/gender, pronouns). Birthdays are fixed month/day. */
const DEMO_TRAINEE_BIO: Record<string, DemoTraineeBio> = {
  "vikram.onboarding@demo.fitbud.test": { age: 33, birthMonthDay: "05-22", gender: "Male" },
  "sneha.review@demo.fitbud.test": { age: 31, birthMonthDay: "08-09", gender: "Female" },
  "aarav.ontrack@demo.fitbud.test": { age: 34, birthMonthDay: "02-17", gender: "Male" },
  "rohan.slipping@demo.fitbud.test": { age: 29, birthMonthDay: "03-14", gender: "Male" },
  "meera.ack@demo.fitbud.test": { age: 38, birthMonthDay: "11-03", gender: "Female" },
  "farhan.paused@demo.fitbud.test": { age: 36, birthMonthDay: "01-28", gender: "Male" },
  "ishita.pushoff@demo.fitbud.test": { age: 27, birthMonthDay: "06-30", gender: "Female" },
  "kavya.ended@demo.fitbud.test": { age: 32, birthMonthDay: "09-12", gender: "Female" },
  "nikhil.reactivate@demo.fitbud.test": { age: 41, birthMonthDay: "04-05", gender: "Male" },
  "deepak.dubai@demo.fitbud.test": { age: 35, birthMonthDay: "07-19", gender: "Male" },
  "arjun.attention@demo.fitbud.test": { age: 30, birthMonthDay: "10-02", gender: "Male" },
  "neha.attention@demo.fitbud.test": { age: 28, birthMonthDay: "12-08", gender: "Female" },
  "tanvi.attention@demo.fitbud.test": { age: 26, birthMonthDay: "03-25", gender: "Female" },
  "lakshmi.foods@demo.fitbud.test": { age: 37, birthMonthDay: "09-01", gender: "Female" },
  "karan.dual@demo.fitbud.test": { age: 33, birthMonthDay: "05-06", gender: "Male" },
};

function demoDateOfBirth(bio: DemoTraineeBio, refDate: string): string {
  const refYear = Number(refDate.slice(0, 4));
  const birthdayPassed = bio.birthMonthDay <= refDate.slice(5);
  const year = refYear - bio.age - (birthdayPassed ? 0 : 1);
  return `${year}-${bio.birthMonthDay}`;
}

function wipeAppData(): string {
  return `
DELETE FROM reminder_states;
DELETE FROM notification_deliveries;
DELETE FROM notifications;
DELETE FROM scheduled_jobs;
DELETE FROM device_tokens;
DELETE FROM notification_preferences;
DELETE FROM reminder_rules;
DELETE FROM coach_asks;
DELETE FROM reactivation_requests;
DELETE FROM meal_time_overrides;
DELETE FROM trainer_notes;
DELETE FROM interventions;
DELETE FROM exception_actions;
DELETE FROM exceptions;
DELETE FROM meal_compliance;
DELETE FROM set_executions;
DELETE FROM exercise_executions;
DELETE FROM workout_executions;
DELETE FROM meal_assignments;
DELETE FROM workout_assignments;
DELETE FROM measurements;
DELETE FROM progress_entries;
DELETE FROM checkin_reviews;
DELETE FROM checkins;
DELETE FROM checkin_schedules;
DELETE FROM media_assets;
DELETE FROM plan_assignment_policies;
DELETE FROM plan_versions;
DELETE FROM plans;
DELETE FROM subscription_versions;
DELETE FROM tracking_requirements;
DELETE FROM nutrition_expectations;
DELETE FROM workout_expectations;
DELETE FROM coaching_configurations;
DELETE FROM onboarding_reviews;
DELETE FROM onboarding_form_responses;
DELETE FROM coaching_relationships;
DELETE FROM client_invitations;
DELETE FROM auth_otps;
DELETE FROM auth_rate_limits;
DELETE FROM web_sessions;
DELETE FROM idempotency_records;
DELETE FROM sync_mutations;
DELETE FROM change_log;
DELETE FROM trainee_custom_foods;
DELETE FROM plan_templates WHERE ownership='trainer';
DELETE FROM checkin_form_versions WHERE template_id IN (SELECT id FROM checkin_form_templates WHERE ownership='trainer');
DELETE FROM checkin_form_templates WHERE ownership='trainer';
DELETE FROM onboarding_form_versions WHERE template_id IN (SELECT id FROM onboarding_form_templates WHERE ownership='trainer');
DELETE FROM onboarding_form_templates WHERE ownership='trainer';
DELETE FROM user_identities;
DELETE FROM user_roles;
DELETE FROM trainer_profiles;
DELETE FROM trainee_profiles;
DELETE FROM users;
`.trim();
}

function insertUser(input: {
  email: string;
  role: "trainer" | "trainee";
  displayName: string;
  timezone: string;
  phone?: string;
  passwordHash: string;
  now: string;
  dateOfBirth?: string;
  gender?: string;
}): string {
  const userId = demoUuid("user", input.email);
  const firebaseUid = `demo-${input.email}`;
  const profileId = demoUuid("profile", input.email);
  const lines: string[] = [];
  lines.push(`INSERT INTO users (id, firebase_uid, account_state, timezone, created_at, updated_at) VALUES (${sqlQuote(userId)}, ${sqlQuote(firebaseUid)}, 'active', ${sqlQuote(input.timezone)}, ${sqlQuote(input.now)}, ${sqlQuote(input.now)});`);
  lines.push(`INSERT INTO user_roles (id, user_id, role, created_at) VALUES (${sqlQuote(demoUuid("role", input.email, input.role))}, ${sqlQuote(userId)}, ${sqlQuote(input.role)}, ${sqlQuote(input.now)});`);
  if (input.role === "trainer") {
    lines.push(
      `INSERT INTO trainer_profiles (id, user_id, display_name, whatsapp_e164, created_at, updated_at) VALUES (${sqlQuote(profileId)}, ${sqlQuote(userId)}, ${sqlQuote(input.displayName)}, ${input.phone ? sqlQuote(input.phone) : "NULL"}, ${sqlQuote(input.now)}, ${sqlQuote(input.now)});`,
    );
  } else {
    lines.push(
      `INSERT INTO trainee_profiles (id, user_id, display_name, date_of_birth, gender, created_at, updated_at) VALUES (${sqlQuote(profileId)}, ${sqlQuote(userId)}, ${sqlQuote(input.displayName)}, ${input.dateOfBirth ? sqlQuote(input.dateOfBirth) : "NULL"}, ${input.gender ? sqlQuote(input.gender) : "NULL"}, ${sqlQuote(input.now)}, ${sqlQuote(input.now)});`,
    );
  }
  lines.push(
    `INSERT INTO user_identities (user_id, email, email_norm, mobile_e164, password_hash, password_updated_at, failed_login_count, locked_until, created_at, updated_at) VALUES (${sqlQuote(userId)}, ${sqlQuote(input.email)}, ${sqlQuote(input.email.toLowerCase())}, ${input.phone ? sqlQuote(input.phone) : "NULL"}, ${sqlQuote(input.passwordHash)}, ${sqlQuote(input.now)}, 0, NULL, ${sqlQuote(input.now)}, ${sqlQuote(input.now)});`,
  );
  return lines.join("\n");
}

/** (table, user column, timestamp) facts that can come before a relationship starts. */
const ACCOUNT_ANCHORS: Array<[table: string, userColumn: string, column: string]> = [
  ["coaching_relationships", "trainer_user_id", "started_at"],
  ["coaching_relationships", "trainer_user_id", "created_at"],
  ["coaching_relationships", "trainee_user_id", "started_at"],
  ["coaching_relationships", "trainee_user_id", "created_at"],
  ["client_invitations", "trainer_user_id", "created_at"],
  ["client_invitations", "accepted_user_id", "created_at"],
  ["onboarding_form_responses", "trainee_user_id", "created_at"],
  ["plan_templates", "trainer_user_id", "created_at"],
  ["onboarding_form_templates", "trainer_user_id", "created_at"],
  ["onboarding_form_versions", "trainer_user_id", "created_at"],
  ["checkin_form_templates", "trainer_user_id", "created_at"],
  ["checkin_form_versions", "trainer_user_id", "created_at"],
  ["trainer_notes", "trainer_user_id", "created_at"],
];

/** Days an account existed before its first seeded fact (or now, with none). */
export const ACCOUNT_LEAD_DAYS = 7;

/**
 * Accounts are inserted before history at now; once history exists, backdate
 * each account (users, roles, profiles, identity created_at) to a week before
 * its earliest relationship, invitation, intake or library row, so a client
 * never joins after their coaching started (QS5). Deterministic: derived from
 * the seeded rows. updated_at and password_updated_at stay at the reset time.
 */
function backdateAccountsSql(now: string): string {
  const earliest = ACCOUNT_ANCHORS.map(
    ([table, userColumn, column]) => `SELECT min(${column}) FROM ${table} WHERE ${userColumn} = users.id`,
  );
  const anchor = `min(${[...earliest.map((sql) => `coalesce((${sql}), ${sqlQuote(now)})`), sqlQuote(now)].join(", ")})`;
  const since = (table: string) =>
    `UPDATE ${table} SET created_at = (SELECT u.created_at FROM users u WHERE u.id = ${table}.user_id);`;
  return [
    `UPDATE users SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', ${anchor}, '-${ACCOUNT_LEAD_DAYS} days');`,
    since("user_roles"),
    since("trainer_profiles"),
    since("trainee_profiles"),
    since("user_identities"),
  ].join("\n");
}

/**
 * Builds idempotent demo seed SQL (T24). Wipes app data, inserts accounts and history.
 */
export function buildDemoSeedSql(input: DemoSeedInput): string {
  const refDate = kolkataLocalDate(input.referenceInstant);
  const now = input.referenceInstant;
  const parts: string[] = [
    `-- FitBud demo seed reference=${refDate} password=${DEMO_PASSWORD_PLAINTEXT}`,
    "PRAGMA defer_foreign_keys = true;",
    wipeAppData(),
  ];

  let phoneIndex = 1;
  for (const account of DEMO_ALL_ACCOUNTS) {
    if (account.role === "invite") {
      continue;
    }
    const phone = `+9190000000${String(phoneIndex++).padStart(2, "0")}`;
    const displayName =
      account.state === "first_run"
        ? ""
        : account.displayName ||
          titleCaseDemoName(account.email.split("@")[0]!.replace(/\./g, " "));
    const cfg = personaConfig(account.email);
    const timezone = cfg?.timezone ?? legacyTimezoneFor(account.email);
    const bio =
      account.role === "trainee" ? DEMO_TRAINEE_BIO[account.email] ??
          (cfg?.bio ? { ...cfg.bio, gender: cfg.sex } : undefined)
        : undefined;
    parts.push(
      insertUser({
        email: account.email,
        role: account.role,
        displayName,
        timezone,
        dateOfBirth: bio ? demoDateOfBirth(bio, refDate) : undefined,
        gender: bio?.gender,
        phone: account.state === "first_run" ? undefined : phone,
        passwordHash: input.passwordHash,
        now,
      }),
    );
    if (account.state === "dual_role" && account.role === "trainee") {
      const userId = demoUuid("user", account.email);
      parts.push(
        `INSERT INTO user_roles (id, user_id, role, created_at) VALUES (${sqlQuote(demoUuid("role", account.email, "trainer"))}, ${sqlQuote(userId)}, 'trainer', ${sqlQuote(now)});`,
      );
      parts.push(
        `INSERT INTO trainer_profiles (id, user_id, display_name, whatsapp_e164, created_at, updated_at) VALUES (${sqlQuote(demoUuid("profile-trainer", account.email))}, ${sqlQuote(userId)}, ${sqlQuote(displayName)}, ${sqlQuote(phone)}, ${sqlQuote(now)}, ${sqlQuote(now)});`,
      );
    }
  }

  parts.push(
    buildDemoHistorySql({
      referenceDate: refDate,
      referenceInstant: now,
      libraryIndex: input.libraryIndex,
    }),
  );

  parts.push(backdateAccountsSql(now));

  for (const account of DEMO_ALL_ACCOUNTS) {
    parts.push(`-- ${account.email} (${account.state})`);
  }

  return `${parts.join("\n")}\n`;
}

