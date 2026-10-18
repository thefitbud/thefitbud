import { DEMO_ACCOUNTS, DEMO_PASSWORD_PLAINTEXT } from "./spec.js";
import { buildDemoHistorySql } from "./history.js";
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

function kolkataLocalDate(instant: string): string {
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
DELETE FROM workout_executions;
DELETE FROM meal_assignments;
DELETE FROM workout_assignments;
DELETE FROM checkin_reviews;
DELETE FROM checkins;
DELETE FROM checkin_schedules;
DELETE FROM progress_entries;
DELETE FROM measurements;
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
      `INSERT INTO trainee_profiles (id, user_id, display_name, date_of_birth, gender, created_at, updated_at) VALUES (${sqlQuote(profileId)}, ${sqlQuote(userId)}, ${sqlQuote(input.displayName)}, NULL, NULL, ${sqlQuote(input.now)}, ${sqlQuote(input.now)});`,
    );
  }
  lines.push(
    `INSERT INTO user_identities (user_id, email, email_norm, mobile_e164, password_hash, password_updated_at, failed_login_count, locked_until, created_at, updated_at) VALUES (${sqlQuote(userId)}, ${sqlQuote(input.email)}, ${sqlQuote(input.email.toLowerCase())}, ${input.phone ? sqlQuote(input.phone) : "NULL"}, ${sqlQuote(input.passwordHash)}, ${sqlQuote(input.now)}, 0, NULL, ${sqlQuote(input.now)}, ${sqlQuote(input.now)});`,
  );
  return lines.join("\n");
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
  for (const account of DEMO_ACCOUNTS) {
    if (account.role === "invite") {
      continue;
    }
    const phone = `+9190000000${String(phoneIndex++).padStart(2, "0")}`;
    const displayName =
      account.state === "first_run"
        ? ""
        : account.displayName ||
          titleCaseDemoName(account.email.split("@")[0]!.replace(/\./g, " "));
    const timezone =
      account.email.startsWith("deepak.") ? "Asia/Dubai" : "Asia/Kolkata";
    parts.push(
      insertUser({
        email: account.email,
        role: account.role,
        displayName,
        timezone,
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

  for (const account of DEMO_ACCOUNTS) {
    parts.push(`-- ${account.email} (${account.state})`);
  }

  return `${parts.join("\n")}\n`;
}

