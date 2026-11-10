import { and, asc, eq, lte, sql, type SQL } from "drizzle-orm";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
import { createDb, type Db } from "../db/client.js";
import {
  clientInvitations,
  coachingRelationships,
  mediaAssets,
  traineeProfiles,
  trainerProfiles,
  userIdentities,
  users,
} from "../db/schema.js";
import { identifierHash, normalizeIdentifier } from "../auth/identifiers.js";
import { mediaKey } from "../lib/media-key.js";
import { writeStructuredLog } from "../lib/log.js";
import { runtimeMisconfigurations } from "../middleware/runtime-guard.js";
import type { Env } from "../types.js";

/**
 * Z6-17 (D-W6-7, D-W6-8, D-W6-22, D-W6-27, D-W6-28, D-W6-31): the purge that
 * runs from the existing cron. It removes archived accounts whose
 * `purge_after` has passed (6 months after deletion, or "now" when support set
 * it through `docs/runbooks/account-deletion.md`).
 *
 * Per user, in this order:
 * 1. R2: delete the person's media objects, by the keys recorded in D1 (a
 *    missing object is fine; keys are never authorization).
 * 2. Firebase: delete the Firebase Auth user through the Admin REST API with
 *    the service account already configured for sign-in (no new secret). A
 *    user Firebase no longer has counts as deleted. Skipped only when
 *    ENVIRONMENT is local or unset, where no Firebase project exists (D-W6-39).
 * 3. D1: one batch, which D1 runs as a single transaction, deletes the
 *    person's own rows, anonymises the rows other users' records need and
 *    finally turns the users row into an anonymous `disabled` row with both
 *    dates NULL (D-W6-27 option 2). The row is never deleted: coaching
 *    relationships, log history (D-W6-28) and authorship columns reference it
 *    with NO ACTION foreign keys, and the other party's history must still read.
 *
 * Every step is safe to repeat and nothing in D1 changes before step 3, so a
 * crash at any point leaves the account `archived` and due, and the next run
 * starts that user again from step 1. Every statement of step 3 is guarded on
 * the account still being archived and due, so a run that races another one,
 * or a user that is no longer due, changes nothing.
 *
 * The job refuses to run (logs RUNTIME_MISCONFIGURED, writes nothing) when the
 * runtime configuration is invalid: `scheduled()` does not pass through the
 * fetch runtime guard (D-W6-39).
 *
 * Logs carry only the user id (an opaque UUID), counts and static codes, never
 * an email, phone number, name, Firebase uid or object key.
 */

/** Accounts purged per cron run (every 5 minutes), so one run stays short. */
export const ACCOUNT_PURGE_BATCH_LIMIT = 5;

/** What replaces the person's name wherever another user's history shows it. */
export const DELETED_USER_NAME = "Deleted user";

/** Placeholder for invitation emails (the column is NOT NULL). `.invalid` never routes. */
export const DELETED_USER_EMAIL = "deleted-user@deleted.invalid";

/** What replaces the person's email or phone inside free text kept for the other party. */
export const REMOVED_TEXT = "[removed]";

const FIREBASE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIREBASE_ADMIN_SCOPE = "https://www.googleapis.com/auth/identitytoolkit";
const R2_DELETE_CHUNK = 1000;

/** Renders the raw statements below to SQL text and bound parameters. */
const dialect = new SQLiteAsyncDialect();

export type AccountPurgeResult = {
  /** Due accounts picked this run (at most ACCOUNT_PURGE_BATCH_LIMIT). */
  selected: number;
  purged: number;
  failed: number;
};

type DueUser = { id: string; firebaseUid: string };

export type PersonValues = {
  /** Email exactly as stored on the identity, and its normalised form. */
  emails: string[];
  mobile: string | null;
  names: string[];
  /**
   * Contact phones trainers keep for the person on their relationships
   * (`coaching_relationships.contact_phone_e164`, Z6-8b), scrubbed like `mobile`.
   */
  contactPhones?: string[];
};

class PurgeStepError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "PurgeStepError";
  }
}

export async function runAccountPurge(env: Env, now: Date): Promise<AccountPurgeResult> {
  if (runtimeMisconfigurations(env).length > 0) {
    // Same check as the fetch runtime guard; only the static code is logged.
    writeStructuredLog({
      level: "error",
      message: "account.purge_refused",
      operation: "cron.account_purge",
      errorCode: "RUNTIME_MISCONFIGURED",
    });
    throw new PurgeStepError("RUNTIME_MISCONFIGURED");
  }
  const db = createDb(env.DB);
  const nowIso = now.toISOString();
  const due = await selectDueUsers(db, nowIso);
  const firebase = createFirebaseAdmin(env);
  let purged = 0;
  let failed = 0;
  for (const user of due) {
    const started = Date.now();
    try {
      const done = await purgeOneUser(db, env, firebase, user, nowIso);
      if (done) purged += 1;
      writeStructuredLog({
        level: "info",
        message: done ? "account.purged" : "account.purge_skipped",
        operation: "cron.account_purge",
        entityType: "user",
        entityId: user.id,
        latencyMs: Date.now() - started,
      });
    } catch (error) {
      failed += 1;
      writeStructuredLog({
        level: "error",
        message: "account.purge_failed",
        operation: "cron.account_purge",
        entityType: "user",
        entityId: user.id,
        latencyMs: Date.now() - started,
        errorName: error instanceof Error ? error.name : typeof error,
        errorCode: error instanceof PurgeStepError ? error.code : "ACCOUNT_PURGE_STEP_FAILED",
      });
    }
  }
  if (failed > 0) {
    // The cron wrapper logs and reports the run as failed; the users stay due.
    throw new PurgeStepError("ACCOUNT_PURGE_FAILED");
  }
  return { selected: due.length, purged, failed };
}

/** Archived users past `purge_after`, oldest first (uses `users_purge_after_idx`). */
async function selectDueUsers(db: Db, nowIso: string): Promise<DueUser[]> {
  return db
    .select({ id: users.id, firebaseUid: users.firebaseUid })
    .from(users)
    .where(and(eq(users.accountState, "archived"), lte(users.purgeAfter, nowIso)))
    .orderBy(asc(users.purgeAfter), asc(users.id))
    .limit(ACCOUNT_PURGE_BATCH_LIMIT);
}

/** Returns false when the user was no longer archived and due by step 3. */
async function purgeOneUser(
  db: Db,
  env: Env,
  firebase: FirebaseAdmin,
  user: DueUser,
  nowIso: string,
): Promise<boolean> {
  await deleteMedia(db, env, user.id);
  await firebase.deleteUser(user.firebaseUid);
  const values = await loadPersonValues(db, user.id);
  return purgeRows(db, user.id, values, nowIso);
}

/**
 * Media that is the person's (Z7-26 ownership rule, documented in
 * `docs/runbooks/account-deletion.md`):
 * - everything in a relationship where they are the trainee (their meal,
 *   check-in and progress photos, whoever uploaded them, the coach included);
 * - an avatar they uploaded themselves (a picture of them).
 * Photos a purged trainer uploaded into a client's relationship are the
 * client's coaching history and stay, like the rest of that history; the
 * client loses nothing when their trainer is purged.
 */
function personMediaCondition(userId: string): SQL {
  return sql`(coaching_relationship_id IN (SELECT r.id FROM coaching_relationships r WHERE r.trainee_user_id = ${userId})
    OR (uploader_user_id = ${userId} AND media_type = 'avatar'))`;
}

function personMediaIds(userId: string): SQL {
  return sql`SELECT id FROM media_assets WHERE ${personMediaCondition(userId)}`;
}

async function deleteMedia(db: Db, env: Env, userId: string): Promise<void> {
  const rows = await db
    .select({ objectKey: mediaAssets.objectKey })
    .from(mediaAssets)
    .where(personMediaCondition(userId));
  if (rows.length === 0) return;
  const keys = rows.map((row) => mediaKey(env, row.objectKey));
  try {
    for (let index = 0; index < keys.length; index += R2_DELETE_CHUNK) {
      await env.MEDIA.delete(keys.slice(index, index + R2_DELETE_CHUNK));
    }
  } catch {
    throw new PurgeStepError("ACCOUNT_PURGE_MEDIA_FAILED");
  }
}

/** Values to scrub from rows that stay, read before the identity is deleted. */
async function loadPersonValues(db: Db, userId: string): Promise<PersonValues> {
  const [identity] = await db
    .select({
      email: userIdentities.email,
      emailNorm: userIdentities.emailNorm,
      mobile: userIdentities.mobileE164,
    })
    .from(userIdentities)
    .where(eq(userIdentities.userId, userId))
    .limit(1);
  const [trainer] = await db
    .select({ name: trainerProfiles.displayName })
    .from(trainerProfiles)
    .where(eq(trainerProfiles.userId, userId))
    .limit(1);
  const [trainee] = await db
    .select({ name: traineeProfiles.displayName })
    .from(traineeProfiles)
    .where(eq(traineeProfiles.userId, userId))
    .limit(1);
  const emails = unique([identity?.email, identity?.emailNorm, identity?.email?.toLowerCase()]);
  const invited = await db
    .select({ name: clientInvitations.recipientDisplayName })
    .from(clientInvitations)
    .where(eq(clientInvitations.acceptedUserId, userId));
  // Z6-8b: what the person's trainers set for them (a name and a contact phone).
  const trainerSet = await db
    .select({
      name: coachingRelationships.clientDisplayName,
      phone: coachingRelationships.contactPhoneE164,
    })
    .from(coachingRelationships)
    .where(eq(coachingRelationships.traineeUserId, userId));
  const names = unique([
    trainer?.name,
    trainee?.name,
    ...invited.map((row) => row.name),
    ...trainerSet.map((row) => row.name),
  ]).filter((name) => name !== DELETED_USER_NAME);
  const mobile = identity?.mobile?.trim() || null;
  const contactPhones = unique(trainerSet.map((row) => row.phone)).filter(
    (phone) => phone !== mobile,
  );
  return { emails, mobile, names, contactPhones };
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

/**
 * Free text kept for the other party (and written by either side) in the
 * person's relationships. The text stays, because it is the other party's
 * coaching history, but inside it (D-W6-39):
 * - the person's email (any letter case, never part of a longer address)
 *   becomes `[removed]`;
 * - their phone, as stored (E.164) or in the national form, with or without
 *   the country code or a trunk 0, and with any spaces or dashes between the
 *   digits ("98123 12345", "98123  12345", "98123-12345", "09812312345",
 *   "+91 98123 12345"), becomes `[removed]` (Z7-26);
 * - their full display name, as a whole name in any letter case (never part of
 *   another word), becomes "Deleted user". One-word and short names ("Om") are scrubbed too:
 *   matching is by whole word only, so "Omelette" and "room" stay.
 * JSON columns are parsed and only their string values, and numbers that are
 * the person's phone, are rewritten, so the JSON stays valid.
 */
const RELATIONSHIP_FREE_TEXT: ReadonlyArray<{
  table: string;
  column: string;
  /** Column that ties the row to a relationship, or `exception` for exception_actions. */
  scope: string;
}> = [
  { table: "onboarding_form_responses", column: "answers_json", scope: "coaching_relationship_id" },
  { table: "checkins", column: "answers_json", scope: "coaching_relationship_id" },
  { table: "progress_entries", column: "title", scope: "coaching_relationship_id" },
  { table: "progress_entries", column: "body", scope: "coaching_relationship_id" },
  { table: "meal_compliance", column: "notes", scope: "coaching_relationship_id" },
  { table: "trainer_notes", column: "body", scope: "coaching_relationship_id" },
  { table: "checkin_reviews", column: "notes", scope: "coaching_relationship_id" },
  { table: "interventions", column: "summary", scope: "coaching_relationship_id" },
  { table: "coaching_configurations", column: "notes", scope: "coaching_relationship_id" },
  { table: "coaching_configurations", column: "goal_short", scope: "coaching_relationship_id" },
  { table: "coaching_configurations", column: "goal_description", scope: "coaching_relationship_id" },
  { table: "coaching_relationships", column: "end_reason", scope: "id" },
  { table: "exceptions", column: "summary", scope: "coaching_relationship_id" },
  { table: "exceptions", column: "details_json", scope: "coaching_relationship_id" },
  { table: "exceptions", column: "resolution_note", scope: "coaching_relationship_id" },
  { table: "exception_actions", column: "note", scope: "exception" },
  { table: "log_edit_events", column: "before_json", scope: "coaching_relationship_id" },
  { table: "log_edit_events", column: "after_json", scope: "coaching_relationship_id" },
];

export type Scrubber = {
  rewrite(text: string): string;
  prefilter(column: SQL): SQL;
  /** Which of the person's values the text holds (same rules as `rewrite`). */
  mentions(text: string): { contact: boolean; name: boolean };
};

/** Names to match in free text: every non-empty name, as a whole word. */
export function scrubbableNames(names: string[]): string[] {
  return names.filter((name) => name.trim().length > 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The national number: the last 10 digits of the stored E.164 phone. */
function nationalDigits(mobile: string | null): { national: string; country: string } | null {
  const digits = mobile?.replace(/\D/g, "") ?? "";
  if (digits.length < 10) return null;
  return { national: digits.slice(-10), country: digits.slice(0, -10) };
}

/** The sign-in phone and every trainer-kept contact phone, split for matching. */
function personPhones(values: PersonValues): Array<{ national: string; country: string }> {
  const seen = new Set<string>();
  const phones: Array<{ national: string; country: string }> = [];
  for (const raw of [values.mobile, ...(values.contactPhones ?? [])]) {
    const phone = nationalDigits(raw);
    if (!phone || seen.has(`${phone.country}:${phone.national}`)) continue;
    seen.add(`${phone.country}:${phone.national}`);
    phones.push(phone);
  }
  return phones;
}

export function buildScrubber(values: PersonValues): Scrubber | null {
  const contactRules: RegExp[] = [];
  const emails = unique(values.emails.map((email) => email.toLowerCase()));
  for (const email of emails) {
    // Never inside a longer address: "a@b.co" must not hit "xa@b.co" or "a@b.com".
    contactRules.push(
      new RegExp(`(?<![\\w.%+-])${escapeRegExp(email)}(?![\\w-]|\\.\\w)`, "giu"),
    );
  }
  const phones = personPhones(values);
  for (const phone of phones) {
    // Any run of spaces or dashes between digits; an optional country code
    // (with or without "+") or trunk 0 in front; never inside a longer number.
    const national = phone.national.split("").join("[\\s-]*");
    const prefixes = [`0[\\s-]*`];
    if (phone.country) prefixes.unshift(`\\+?${phone.country}[\\s-]*`);
    contactRules.push(
      new RegExp(`(?<![\\d+])(?:${prefixes.join("|")})?${national}(?!\\d)`, "gu"),
    );
  }
  const nameRules: RegExp[] = [];
  const names = scrubbableNames(values.names)
    .map((name) => name.trim().split(/\s+/u))
    .filter((parts) => parts.length > 0);
  for (const parts of names) {
    const pattern = parts.map(escapeRegExp).join("\\s+");
    nameRules.push(
      new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${pattern}(?![\\p{L}\\p{M}\\p{N}])`, "giu"),
    );
  }
  if (contactRules.length + nameRules.length === 0) return null;
  const firstTokens = unique(names.map((parts) => parts[0]!.toLowerCase()));
  return {
    rewrite(text) {
      let out = text;
      for (const pattern of contactRules) out = out.replace(pattern, REMOVED_TEXT);
      for (const pattern of nameRules) out = out.replace(pattern, DELETED_USER_NAME);
      return out;
    },
    // `search` ignores the global flag's lastIndex, so the shared rules stay stateless.
    mentions(text) {
      return {
        contact: contactRules.some((pattern) => text.search(pattern) >= 0),
        name: nameRules.some((pattern) => text.search(pattern) >= 0),
      };
    },
    // A cheap SQL superset of the rows the rules can match; the rules decide.
    prefilter(column) {
      const checks: SQL[] = [
        ...emails.map((email) => sql`instr(lower(${column}), ${email}) > 0`),
        ...firstTokens.map((token) => sql`instr(lower(${column}), ${token}) > 0`),
      ];
      for (const phone of phones) {
        checks.push(
          sql`instr(replace(replace(replace(replace(replace(${column}, ' ', ''), '-', ''), char(9), ''), char(10), ''), char(13), ''), ${phone.national}) > 0`,
        );
      }
      return sql.join(checks, sql` OR `);
    },
  };
}

/** Rewrites a stored value; JSON is parsed and only its string values change. */
export function scrubStoredText(raw: string, scrubber: Scrubber): string {
  const head = raw.trimStart()[0];
  if (head === "{" || head === "[" || head === '"') {
    try {
      const parsed: unknown = JSON.parse(raw);
      const walk = (value: unknown): unknown => {
        if (typeof value === "string") return scrubber.rewrite(value);
        // A phone saved as a JSON number (9812312345) becomes the "[removed]" string.
        if (typeof value === "number" && Number.isInteger(value)) {
          const text = String(value);
          return scrubber.rewrite(text) === text ? value : REMOVED_TEXT;
        }
        if (Array.isArray(value)) return value.map(walk);
        if (value && typeof value === "object") {
          return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, walk(nested)]),
          );
        }
        return value;
      };
      const before = JSON.stringify(parsed);
      const after = JSON.stringify(walk(parsed));
      return after === before ? raw : after;
    } catch {
      // Not JSON: plain text below.
    }
  }
  return scrubber.rewrite(raw);
}

/**
 * Reads the free-text rows that mention the person and returns one guarded
 * update per changed row, run inside the step 3 batch. The relationships are
 * ended, so these rows are read-only; the `= old value` check still makes a
 * concurrent edit win over the scrub instead of being overwritten.
 */
async function freeTextScrubStatements(
  client: D1Database,
  scrubber: Scrubber,
  personRelationships: SQL,
  guard: SQL,
): Promise<SQL[]> {
  const statements: SQL[] = [];
  for (const target of RELATIONSHIP_FREE_TEXT) {
    const table = sql.raw(`"${target.table}"`);
    const column = sql.raw(`"${target.column}"`);
    const scope =
      target.scope === "exception"
        ? sql`exception_id IN (SELECT e.id FROM exceptions e WHERE e.coaching_relationship_id IN (${personRelationships}))`
        : sql`${sql.raw(`"${target.scope}"`)} IN (${personRelationships})`;
    const query = dialect.sqlToQuery(
      sql`SELECT id, ${column} AS value FROM ${table} WHERE ${scope} AND ${column} IS NOT NULL AND (${scrubber.prefilter(column)})`,
    );
    const { results } = await client
      .prepare(query.sql)
      .bind(...query.params)
      .all<{ id: string; value: string }>();
    for (const row of results ?? []) {
      const next = scrubStoredText(row.value, scrubber);
      if (next !== row.value) {
        statements.push(
          sql`UPDATE ${table} SET ${column} = ${next} WHERE id = ${row.id} AND ${column} = ${row.value} AND ${guard}`,
        );
      }
    }
  }
  return statements;
}

/**
 * Step 3: one D1 batch (one transaction). Statements run in foreign-key order
 * (children before the rows they reference) and every one is guarded on the
 * account still being archived and due; the users row changes last.
 */
async function purgeRows(
  db: Db,
  userId: string,
  values: PersonValues,
  nowIso: string,
): Promise<boolean> {
  const guard = sql`EXISTS (SELECT 1 FROM users g WHERE g.id = ${userId} AND g.account_state = 'archived' AND g.purge_after <= ${nowIso})`;
  const personRelationships = sql`SELECT r.id FROM coaching_relationships r WHERE r.trainer_user_id = ${userId} OR r.trainee_user_id = ${userId}`;
  const media = personMediaIds(userId);
  const contacts = unique([
    ...values.emails,
    values.mobile,
    ...(values.contactPhones ?? []),
    ...personPhones(values).map((phone) => phone.national),
  ]);
  const otpHashes = await otpIdentifierHashes(values);
  const client = (db as Db & { $client?: D1Database }).$client;
  if (!client) throw new PurgeStepError("ACCOUNT_PURGE_DB_UNAVAILABLE");
  const scrubber = buildScrubber(values);

  const statements: SQL[] = [
    // Media: clear the references, then the rows (objects went in step 1).
    sql`UPDATE measurements SET media_asset_id = NULL WHERE media_asset_id IN (${media}) AND ${guard}`,
    sql`UPDATE progress_entries SET media_asset_id = NULL WHERE media_asset_id IN (${media}) AND ${guard}`,
    sql`UPDATE meal_compliance SET media_asset_id = NULL WHERE media_asset_id IN (${media}) AND ${guard}`,
    sql`DELETE FROM media_assets WHERE id IN (${media}) AND ${guard}`,

    // Notifications to the person and their delivery history, then device tokens
    // (D-W6-31: archive revoked them; deliveries reference them, so both go).
    sql`DELETE FROM notification_deliveries WHERE (notification_id IN (SELECT n.id FROM notifications n WHERE n.recipient_user_id = ${userId})
      OR device_token_id IN (SELECT t.id FROM device_tokens t WHERE t.user_id = ${userId})) AND ${guard}`,
    sql`DELETE FROM notifications WHERE recipient_user_id = ${userId} AND ${guard}`,
    sql`DELETE FROM device_tokens WHERE user_id = ${userId} AND ${guard}`,

    // Sign-in, settings and retry receipts that are only the person's.
    sql`DELETE FROM web_sessions WHERE user_id = ${userId} AND ${guard}`,
    sql`DELETE FROM notification_preferences WHERE user_id = ${userId} AND ${guard}`,
    sql`DELETE FROM reminder_states WHERE trainee_user_id = ${userId} AND ${guard}`,
    sql`DELETE FROM whatsapp_opt_outs WHERE user_id = ${userId} AND ${guard}`,
    sql`DELETE FROM idempotency_records WHERE actor_user_id = ${userId} AND ${guard}`,
    sql`DELETE FROM sync_mutations WHERE actor_user_id = ${userId} AND ${guard}`,

    // Payments in the person's relationships (D-W6-22: the purge deletes them).
    sql`DELETE FROM payment_records WHERE coaching_relationship_id IN (${personRelationships}) AND ${guard}`,

    // WhatsApp log rows keep their cost ledger link; the recipient hash goes.
    sql`UPDATE whatsapp_messages SET to_hash = 'purged', updated_at = ${nowIso} WHERE trainee_user_id = ${userId} AND to_hash <> 'purged' AND ${guard}`,

    // Invitations: the person as recipient is anonymised (and a pending one
    // revoked); pending invitations the person sent as a trainer are revoked.
    sql`UPDATE client_invitations SET
        status = CASE WHEN status = 'pending' THEN 'revoked' ELSE status END,
        revoked_at = CASE WHEN status = 'pending' THEN ${nowIso} ELSE revoked_at END,
        recipient_email = ${DELETED_USER_EMAIL},
        recipient_display_name = ${DELETED_USER_NAME},
        recipient_whatsapp_e164 = NULL,
        updated_at = ${nowIso}
      WHERE (accepted_user_id = ${userId}${
        values.emails.length > 0
          ? sql` OR lower(recipient_email) IN (${sql.join(
              values.emails.map((email) => sql`${email.toLowerCase()}`),
              sql`, `,
            )})`
          : sql``
      }) AND ${guard}`,
    sql`UPDATE client_invitations SET status = 'revoked', revoked_at = ${nowIso}, updated_at = ${nowIso}
      WHERE trainer_user_id = ${userId} AND status = 'pending' AND ${guard}`,

    // Profiles stay (other users' lists and history read the name from them).
    sql`UPDATE trainee_profiles SET display_name = ${DELETED_USER_NAME}, date_of_birth = NULL, gender = NULL, updated_at = ${nowIso}
      WHERE user_id = ${userId} AND ${guard}`,
    sql`UPDATE trainer_profiles SET display_name = ${DELETED_USER_NAME}, whatsapp_e164 = NULL, updated_at = ${nowIso}
      WHERE user_id = ${userId} AND ${guard}`,

    // Trainer-owned client basics on the relationship (Z6-8b, D-W6-34): a purged
    // client's trainers see "Deleted user" and keep no contact phone; a purged
    // trainer's copy of their clients' details goes (the clients' own data stays).
    sql`UPDATE coaching_relationships SET client_display_name = ${DELETED_USER_NAME}, contact_phone_e164 = NULL
      WHERE trainee_user_id = ${userId} AND ${guard}`,
    sql`UPDATE coaching_relationships SET client_display_name = NULL, contact_phone_e164 = NULL
      WHERE trainer_user_id = ${userId} AND ${guard}`,
  ];

  if (scrubber) {
    statements.push(...(await freeTextScrubStatements(client, scrubber, personRelationships, guard)));
  }

  // Other actors' retry receipts that echo the person's contact details or
  // name (for example the invitation a trainer sent them). They are short-lived
  // replay records, not history.
  if (scrubber) {
    statements.push(
      ...(await receiptDeleteStatements(client, userId, scrubber, personRelationships, values, guard)),
    );
  }
  // Local dev mail sink (never written outside ENVIRONMENT=local).
  const mailNeedles = [...contacts, ...scrubbableNames(values.names)];
  if (mailNeedles.length > 0) {
    statements.push(
      sql`DELETE FROM dev_mail_outbox WHERE (${containsAny(sql.raw("to_address"), mailNeedles)}
        OR ${containsAny(sql.raw("subject"), mailNeedles)}
        OR ${containsAny(sql.raw("text_body"), mailNeedles)}
        OR ${containsAny(sql.raw("coalesce(html_body, '')"), mailNeedles)}) AND ${guard}`,
    );
  }
  if (otpHashes.length > 0) {
    statements.push(
      sql`DELETE FROM auth_otps WHERE identifier_hash IN (${sql.join(
        otpHashes.map((hash) => sql`${hash}`),
        sql`, `,
      )}) AND ${guard}`,
    );
  }

  statements.push(
    // Identity (email, phone, password hash) and roles: sign-in for the identity is gone.
    sql`DELETE FROM user_identities WHERE user_id = ${userId} AND ${guard}`,
    sql`DELETE FROM user_roles WHERE user_id = ${userId} AND ${guard}`,
    // Last: the anonymous, disabled users row (D-W6-27). The Firebase uid is
    // replaced so a token for the old identity never matches this row again.
    sql`UPDATE users SET account_state = 'disabled', archived_at = NULL, purge_after = NULL,
        firebase_uid = ${`purged:${userId}`}, updated_at = ${nowIso}
      WHERE id = ${userId} AND account_state = 'archived' AND purge_after <= ${nowIso}`,
  );

  // D1 runs a batch as one transaction: all of these statements apply, or none.
  const results = await client.batch(
    statements.map((statement) => {
      const query = dialect.sqlToQuery(statement);
      return client.prepare(query.sql).bind(...query.params);
    }),
  );
  const last = results[results.length - 1];
  return (last?.meta?.changes ?? 0) === 1;
}

/**
 * Other actors' receipts (idempotency replays and sync results) that hold the
 * person's details. Z7-26: a receipt is deleted only when it really is about
 * the person, never on a bare substring hit:
 * - it holds their email or phone, matched with the scrubber's rules (whole
 *   address, whole number), or
 * - it holds their name (whole name, any length) AND
 *   names one of their records: their user id, one of their relationships or
 *   an invitation sent to them. A common name alone ("Rahul") never deletes
 *   another user's receipt.
 * The SQL prefilter only narrows the rows read; each delete is by id, guarded
 * on the stored body being unchanged and the account still due.
 */
async function receiptDeleteStatements(
  client: D1Database,
  userId: string,
  scrubber: Scrubber,
  personRelationships: SQL,
  values: PersonValues,
  guard: SQL,
): Promise<SQL[]> {
  const emailMatch =
    values.emails.length > 0
      ? sql` OR lower(recipient_email) IN (${sql.join(
          values.emails.map((email) => sql`${email.toLowerCase()}`),
          sql`, `,
        )})`
      : sql``;
  const idQuery = dialect.sqlToQuery(
    sql`SELECT id FROM coaching_relationships WHERE id IN (${personRelationships})
      UNION SELECT id FROM client_invitations WHERE accepted_user_id = ${userId}${emailMatch}`,
  );
  const { results: idRows } = await client
    .prepare(idQuery.sql)
    .bind(...idQuery.params)
    .all<{ id: string }>();
  const personIds = [userId, ...(idRows ?? []).map((row) => row.id)].map((id) => id.toLowerCase());

  const statements: SQL[] = [];
  for (const target of [
    { table: "idempotency_records", column: "response_body" },
    { table: "sync_mutations", column: "result_body" },
  ]) {
    const table = sql.raw(`"${target.table}"`);
    const column = sql.raw(`"${target.column}"`);
    const query = dialect.sqlToQuery(
      sql`SELECT id, ${column} AS value FROM ${table} WHERE actor_user_id <> ${userId} AND (${scrubber.prefilter(column)})`,
    );
    const { results } = await client
      .prepare(query.sql)
      .bind(...query.params)
      .all<{ id: string; value: string }>();
    for (const row of results ?? []) {
      const found = scrubber.mentions(row.value);
      const lower = row.value.toLowerCase();
      const aboutPerson = found.contact || (found.name && personIds.some((id) => lower.includes(id)));
      if (aboutPerson) {
        statements.push(
          sql`DELETE FROM ${table} WHERE id = ${row.id} AND ${column} = ${row.value} AND ${guard}`,
        );
      }
    }
  }
  return statements;
}

/** Case-insensitive substring match against any needle. */
function containsAny(column: SQL, needles: string[]): SQL {
  return sql.join(
    needles.map((needle) => sql`instr(lower(${column}), ${needle.toLowerCase()}) > 0`),
    sql` OR `,
  );
}

/** `auth_otps.identifier_hash` values for the person's email and phone (sign-in codes). */
async function otpIdentifierHashes(values: PersonValues): Promise<string[]> {
  const identifiers = unique([
    ...values.emails.map((email) => normalizeIdentifier(email)?.value),
    values.mobile ? normalizeIdentifier(values.mobile)?.value : null,
  ]);
  return Promise.all(identifiers.map((identifier) => identifierHash(identifier)));
}

// ---------------------------------------------------------------------------
// Firebase Admin REST (accounts:delete), authorised by the service account that
// sign-in already uses (FIREBASE_SERVICE_ACCOUNT_JSON). No new secret.

type FirebaseAdmin = { deleteUser(firebaseUid: string): Promise<void> };

function createFirebaseAdmin(env: Env): FirebaseAdmin {
  if (!env.ENVIRONMENT || env.ENVIRONMENT === "local") {
    // Local development has no Firebase project (test auth). Every other
    // environment must delete the Firebase user (D-W6-39).
    return { deleteUser: async () => {} };
  }
  let accessToken: Promise<string> | null = null;
  return {
    async deleteUser(firebaseUid) {
      const json = env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (!json || !env.FIREBASE_PROJECT_ID) {
        throw new PurgeStepError("FIREBASE_ADMIN_NOT_CONFIGURED");
      }
      accessToken ??= fetchAdminAccessToken(json);
      let token: string;
      try {
        token = await accessToken;
      } catch (error) {
        accessToken = null;
        throw error;
      }
      let response: Response;
      try {
        response = await fetch(
          `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/accounts:delete`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ localId: firebaseUid }),
          },
        );
      } catch {
        throw new PurgeStepError("FIREBASE_DELETE_UNAVAILABLE");
      }
      if (response.ok || response.status === 404) return;
      if (response.status === 400 && (await isUserNotFound(response))) return;
      throw new PurgeStepError("FIREBASE_DELETE_FAILED");
    },
  };
}

/** Identity Toolkit answers 400 USER_NOT_FOUND for a uid it does not have. */
async function isUserNotFound(response: Response): Promise<boolean> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    const message = body.error?.message;
    return typeof message === "string" && message.startsWith("USER_NOT_FOUND");
  } catch {
    return false;
  }
}

async function fetchAdminAccessToken(serviceAccountJson: string): Promise<string> {
  const assertion = await signAdminAssertion(serviceAccountJson);
  let response: Response;
  try {
    response = await fetch(FIREBASE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });
  } catch {
    throw new PurgeStepError("FIREBASE_TOKEN_UNAVAILABLE");
  }
  if (!response.ok) throw new PurgeStepError("FIREBASE_TOKEN_FAILED");
  const body = (await response.json().catch(() => null)) as { access_token?: unknown } | null;
  if (typeof body?.access_token !== "string" || !body.access_token) {
    throw new PurgeStepError("FIREBASE_TOKEN_FAILED");
  }
  return body.access_token;
}

/** OAuth 2.0 JWT-bearer assertion for the service account (RS256). */
async function signAdminAssertion(serviceAccountJson: string): Promise<string> {
  try {
    const account = JSON.parse(serviceAccountJson) as {
      client_email: string;
      private_key: string;
    };
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64Url(
      JSON.stringify({
        iss: account.client_email,
        scope: FIREBASE_ADMIN_SCOPE,
        aud: FIREBASE_TOKEN_URL,
        iat: issuedAt,
        exp: issuedAt + 3600,
      }),
    );
    const signingInput = `${header}.${payload}`;
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(account.private_key),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(signingInput),
    );
    return `${signingInput}.${base64UrlBytes(new Uint8Array(signature))}`;
  } catch {
    throw new PurgeStepError("FIREBASE_ADMIN_NOT_CONFIGURED");
  }
}

function base64Url(value: string): string {
  return base64UrlBytes(new TextEncoder().encode(value));
}

function base64UrlBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}
