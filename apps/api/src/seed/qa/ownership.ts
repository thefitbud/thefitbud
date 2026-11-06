/**
 * The ownership plan: which rows belong to a set of user ids, table by table.
 *
 * This single declaration drives both directions of the QA world (D-QA1-3):
 *
 * - the seed reads the QA-owned rows out of a scratch demo world (strict scope:
 *   a row is taken only when every user column it carries is a QA id),
 * - the reset deletes them again from staging (reset scope: the strict scope plus
 *   any row whose own user column is a QA id, so rows the nightly run
 *   created on a QA account are cleaned up too — D-QA1-7).
 *
 * Every predicate is derived from the literal id list and from subqueries on
 * tables that appear EARLIER in this list, so:
 *
 * - no predicate can ever match a row that does not reference one of those ids
 *   (there is no clause that is not anchored on the list), and
 * - deleting in reverse order is safe: a table's parents are still present when
 *   its own rows are deleted.
 *
 * `apps/api/scripts/qa-seed.test.ts` asserts both properties, reads the schema's
 * foreign keys to check this order against them, and proves the boundary from a
 * source other than these predicates: the reset changes nothing at all when no QA
 * row is present, and leaves every non-QA row untouched beside the demo world.
 *
 * The schema declares 132 foreign-key columns, 19 of them `ON DELETE CASCADE` and none
 * `ON DELETE SET NULL` (`PRAGMA foreign_key_list`, migrations in `drizzle/`).
 * They are why the order matters, and they are also safe for the reset: every
 * cascading child of a table in this plan is itself in this plan, so a cascade from
 * a QA row can only reach rows that reference that QA row — it can never leave the
 * QA world. **Adding a table to the schema with an `ON DELETE CASCADE` reference to
 * one of the tables below, without adding it here, breaks that argument.** Re-check
 * it when you touch this file, and treat a change here as a data-destruction change.
 */

export type QaTablePlan = {
  table: string;
  /** Primary key columns; also the deterministic sort order of emitted rows. */
  pk: string[];
  /** Columns holding a user id. A row is only ever in scope when all of them are QA ids. */
  userColumns?: string[];
  /**
   * References to an earlier table in this list; any match anchors the row. The seed
   * also requires every non-`loose` reference to stay inside the QA world, so a row
   * that points at someone else's relationship is not ours. `loose` is for a column
   * that may legitimately point outside it (a global form template, or a column whose
   * entity type varies).
   */
  parents?: Array<{ column: string; table: string; loose?: boolean }>;
  /** Extra literal anchors (no user or parent column available), e.g. hashed emails. */
  literalAnchors?: Array<{ column: string; values: (ids: QaScopeIdentity) => string[] }>;
  /** The seed never emits rows for this table (auth noise, delivery projections). */
  resetOnly?: boolean;
  /** Narrows the table to the rows the QA world may own at all (e.g. trainer-owned). */
  always?: string;
  /** Extra narrowing for the seed only; the reset stays broad enough to clean up. */
  seedAlways?: string;
};

/** Identity values a scope needs beyond the user ids. */
export type QaScopeIdentity = {
  userIds: readonly string[];
  /** sha256 hex of each account's normalised email, as `auth_otps.identifier_hash` stores it. */
  identifierHashes: readonly string[];
};

/**
 * Insert order. Reset order is exactly the reverse.
 *
 * `auth_rate_limits` is deliberately absent: it is keyed by an IP hash, not by a
 * user, so it cannot be scoped to the QA accounts and the reset must not touch it.
 */
export const QA_TABLE_PLAN: readonly QaTablePlan[] = [
  { table: "users", pk: ["id"], userColumns: ["id"] },
  { table: "user_roles", pk: ["id"], userColumns: ["user_id"] },
  { table: "trainer_profiles", pk: ["id"], userColumns: ["user_id"] },
  { table: "trainee_profiles", pk: ["id"], userColumns: ["user_id"] },
  { table: "user_identities", pk: ["user_id"], userColumns: ["user_id"] },
  { table: "notification_preferences", pk: ["user_id"], userColumns: ["user_id"] },
  { table: "device_tokens", pk: ["id"], userColumns: ["user_id"] },
  { table: "reminder_states", pk: ["trainee_user_id"], userColumns: ["trainee_user_id"] },
  {
    table: "onboarding_form_templates",
    pk: ["id"],
    userColumns: ["trainer_user_id"],
    always: "ownership = 'trainer'",
  },
  {
    table: "onboarding_form_versions",
    pk: ["id"],
    userColumns: ["trainer_user_id"],
    parents: [{ column: "template_id", table: "onboarding_form_templates", loose: true }],
    always: "scope = 'trainer'",
  },
  {
    table: "checkin_form_templates",
    pk: ["id"],
    userColumns: ["trainer_user_id"],
    always: "ownership = 'trainer'",
  },
  {
    table: "checkin_form_versions",
    pk: ["id"],
    userColumns: ["trainer_user_id"],
    parents: [{ column: "template_id", table: "checkin_form_templates", loose: true }],
    always: "scope = 'trainer'",
  },
  {
    table: "plan_templates",
    pk: ["id"],
    userColumns: ["trainer_user_id"],
    always: "ownership = 'trainer'",
  },
  {
    // Only invitations a QA account accepted: a pending invitation would put a live
    // token hash in the QA world, and no QA journey needs one.
    table: "client_invitations",
    pk: ["id"],
    userColumns: ["trainer_user_id", "accepted_user_id"],
    seedAlways: "accepted_user_id IS NOT NULL",
  },
  {
    table: "coaching_relationships",
    pk: ["id"],
    userColumns: ["trainer_user_id", "trainee_user_id", "ended_by_user_id"],
  },
  {
    // Steps read from a phone (Z6-4): a projection the demo seed never emits.
    // Reset only; the row cascades with its relationship.
    table: "daily_steps",
    pk: ["id"],
    resetOnly: true,
    parents: [{ column: "coaching_relationship_id", table: "coaching_relationships" }],
  },
  {
    table: "coaching_configurations",
    pk: ["id"],
    parents: [{ column: "coaching_relationship_id", table: "coaching_relationships" }],
  },
  {
    table: "workout_expectations",
    pk: ["id"],
    parents: [{ column: "coaching_configuration_id", table: "coaching_configurations" }],
  },
  {
    table: "nutrition_expectations",
    pk: ["id"],
    parents: [{ column: "coaching_configuration_id", table: "coaching_configurations" }],
  },
  {
    table: "tracking_requirements",
    pk: ["id"],
    parents: [{ column: "coaching_configuration_id", table: "coaching_configurations" }],
  },
  {
    table: "checkin_schedules",
    pk: ["id"],
    parents: [{ column: "coaching_relationship_id", table: "coaching_relationships" }],
  },
  {
    table: "subscription_versions",
    pk: ["id"],
    parents: [{ column: "coaching_relationship_id", table: "coaching_relationships" }],
  },
  {
    table: "onboarding_form_responses",
    pk: ["id"],
    userColumns: ["trainee_user_id"],
    parents: [{ column: "coaching_relationship_id", table: "coaching_relationships" }],
  },
  {
    table: "onboarding_reviews",
    pk: ["id"],
    userColumns: ["trainer_user_id"],
    parents: [
      { column: "coaching_relationship_id", table: "coaching_relationships" },
      { column: "onboarding_form_response_id", table: "onboarding_form_responses" },
    ],
  },
  {
    table: "plans",
    pk: ["id"],
    parents: [{ column: "coaching_relationship_id", table: "coaching_relationships" }],
  },
  { table: "plan_versions", pk: ["id"], parents: [{ column: "plan_id", table: "plans" }] },
  {
    table: "plan_assignment_policies",
    pk: ["plan_version_id"],
    parents: [{ column: "plan_version_id", table: "plan_versions" }],
  },
  {
    table: "checkins",
    pk: ["id"],
    parents: [{ column: "coaching_relationship_id", table: "coaching_relationships" }],
  },
  {
    table: "checkin_reviews",
    pk: ["id"],
    userColumns: ["trainer_user_id"],
    parents: [
      { column: "coaching_relationship_id", table: "coaching_relationships" },
      { column: "checkin_id", table: "checkins" },
    ],
  },
  {
    table: "media_assets",
    pk: ["id"],
    userColumns: ["uploader_user_id"],
    parents: [{ column: "coaching_relationship_id", table: "coaching_relationships" }],
  },
  {
    table: "measurements",
    pk: ["id"],
    userColumns: ["trainee_user_id"],
    parents: [{ column: "coaching_relationship_id", table: "coaching_relationships" }],
  },
  {
    table: "progress_entries",
    pk: ["id"],
    userColumns: ["trainee_user_id"],
    parents: [{ column: "coaching_relationship_id", table: "coaching_relationships" }],
  },
  {
    table: "workout_assignments",
    pk: ["id"],
    parents: [
      { column: "coaching_relationship_id", table: "coaching_relationships" },
      { column: "plan_id", table: "plans" },
    ],
  },
  {
    table: "workout_executions",
    pk: ["id"],
    userColumns: ["trainee_user_id"],
    parents: [
      { column: "coaching_relationship_id", table: "coaching_relationships" },
      { column: "assignment_id", table: "workout_assignments" },
    ],
  },
  {
    table: "exercise_executions",
    pk: ["id"],
    parents: [{ column: "workout_execution_id", table: "workout_executions" }],
  },
  {
    table: "set_executions",
    pk: ["id"],
    parents: [{ column: "exercise_execution_id", table: "exercise_executions" }],
  },
  {
    table: "meal_assignments",
    pk: ["id"],
    parents: [
      { column: "coaching_relationship_id", table: "coaching_relationships" },
      { column: "plan_id", table: "plans" },
    ],
  },
  {
    table: "meal_compliance",
    pk: ["id"],
    userColumns: ["trainee_user_id"],
    parents: [
      { column: "coaching_relationship_id", table: "coaching_relationships" },
      { column: "assignment_id", table: "meal_assignments" },
    ],
  },
  {
    table: "meal_time_overrides",
    pk: ["relationship_id", "slot_key", "day_pattern"],
    parents: [{ column: "relationship_id", table: "coaching_relationships" }],
  },
  {
    table: "exceptions",
    pk: ["id"],
    parents: [{ column: "coaching_relationship_id", table: "coaching_relationships" }],
  },
  {
    table: "exception_actions",
    pk: ["id"],
    userColumns: ["trainer_user_id"],
    parents: [{ column: "exception_id", table: "exceptions" }],
  },
  {
    table: "interventions",
    pk: ["id"],
    userColumns: ["trainer_user_id"],
    parents: [{ column: "coaching_relationship_id", table: "coaching_relationships" }],
  },
  {
    table: "trainer_notes",
    pk: ["id"],
    userColumns: ["trainer_user_id"],
    parents: [{ column: "coaching_relationship_id", table: "coaching_relationships" }],
  },
  {
    table: "coach_asks",
    pk: ["id"],
    userColumns: ["trainee_user_id", "answered_by"],
    parents: [
      { column: "relationship_id", table: "coaching_relationships" },
      { column: "trainer_note_id", table: "trainer_notes" },
    ],
  },
  {
    table: "reactivation_requests",
    pk: ["id"],
    userColumns: ["trainer_user_id"],
    parents: [{ column: "relationship_id", table: "coaching_relationships" }],
  },
  {
    table: "reminder_rules",
    pk: ["id"],
    parents: [{ column: "coaching_relationship_id", table: "coaching_relationships" }],
  },
  {
    table: "notifications",
    pk: ["id"],
    userColumns: ["recipient_user_id"],
    parents: [{ column: "coaching_relationship_id", table: "coaching_relationships" }],
  },
  {
    table: "notification_deliveries",
    pk: ["id"],
    resetOnly: true,
    parents: [
      { column: "notification_id", table: "notifications", loose: true },
      { column: "device_token_id", table: "device_tokens", loose: true },
    ],
  },
  {
    table: "trainee_custom_foods",
    pk: ["id"],
    userColumns: ["trainee_user_id"],
    parents: [{ column: "relationship_id", table: "coaching_relationships" }],
  },
  {
    table: "change_log",
    pk: ["id"],
    resetOnly: true,
    userColumns: ["trainee_user_id"],
    parents: [{ column: "coaching_relationship_id", table: "coaching_relationships" }],
  },
  { table: "sync_mutations", pk: ["id"], resetOnly: true, userColumns: ["actor_user_id"] },
  { table: "idempotency_records", pk: ["id"], resetOnly: true, userColumns: ["actor_user_id"] },
  { table: "web_sessions", pk: ["id"], resetOnly: true, userColumns: ["user_id"] },
  {
    table: "auth_otps",
    pk: ["id"],
    resetOnly: true,
    literalAnchors: [
      { column: "identifier_hash", values: (identity) => [...identity.identifierHashes] },
    ],
  },
  {
    table: "whatsapp_messages",
    pk: ["id"],
    resetOnly: true,
    userColumns: ["trainee_user_id"],
    parents: [{ column: "relationship_id", table: "coaching_relationships" }],
  },
  {
    // Cost ledger rows hang off a message; they are deleted with it so the message
    // delete is not blocked by the foreign key.
    table: "whatsapp_ledger",
    pk: ["id"],
    resetOnly: true,
    parents: [{ column: "message_id", table: "whatsapp_messages", loose: true }],
  },
  { table: "whatsapp_opt_outs", pk: ["user_id"], resetOnly: true, userColumns: ["user_id"] },
  {
    table: "scheduled_jobs",
    pk: ["id"],
    resetOnly: true,
    parents: [
      { column: "domain_entity_id", table: "coaching_relationships", loose: true },
      { column: "domain_entity_id", table: "workout_assignments", loose: true },
      { column: "domain_entity_id", table: "meal_assignments", loose: true },
      { column: "domain_entity_id", table: "checkins", loose: true },
      { column: "domain_entity_id", table: "subscription_versions", loose: true },
    ],
  },
] as const;

export function qaTablePlan(table: string): QaTablePlan {
  const plan = QA_TABLE_PLAN.find((entry) => entry.table === table);
  if (!plan) {
    throw new Error(`No QA ownership plan for table ${table}`);
  }
  return plan;
}

function sqlStringList(values: readonly string[]): string {
  if (values.length === 0) {
    throw new Error("QA scope would be unanchored: empty id list");
  }
  return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(", ");
}

export type QaScopeMode = "seed" | "reset";

/**
 * SQL predicate for the rows of `table` that belong to `identity`.
 *
 * Every branch is anchored on the literal id list (directly, through a subquery on
 * an earlier table's scope, or through a literal hash of a QA email), so the
 * predicate cannot match a row that references nothing of the QA accounts'.
 */
export function qaScopePredicate(
  table: string,
  identity: QaScopeIdentity,
  mode: QaScopeMode,
): string {
  const plan = qaTablePlan(table);
  const ids = sqlStringList(identity.userIds);
  const anchors: string[] = [];
  const strictParents: string[] = [];
  for (const column of plan.userColumns ?? []) {
    anchors.push(`${column} IN (${ids})`);
  }
  for (const parent of plan.parents ?? []) {
    const parentPlan = qaTablePlan(parent.table);
    if (parentPlan.pk.length !== 1) {
      throw new Error(`Parent ${parent.table} needs a single-column primary key`);
    }
    const inParent = `${parent.column} IN (SELECT ${parentPlan.pk[0]} FROM ${parent.table} WHERE ${qaScopePredicate(parent.table, identity, mode)})`;
    anchors.push(inParent);
    if (!parent.loose) {
      strictParents.push(`(${parent.column} IS NULL OR ${inParent})`);
    }
  }
  for (const literal of plan.literalAnchors ?? []) {
    anchors.push(`${literal.column} IN (${sqlStringList(literal.values(identity))})`);
  }
  if (anchors.length === 0) {
    throw new Error(`QA scope for ${table} has no anchor`);
  }
  const clauses = [`(${anchors.join(" OR ")})`];
  if (mode === "seed") {
    // Strict: a row that also references a user or a parent row outside the QA
    // world is not ours, so the seed never emits a dangling reference.
    for (const column of plan.userColumns ?? []) {
      clauses.push(`(${column} IS NULL OR ${column} IN (${ids}))`);
    }
    clauses.push(...strictParents);
  }
  if (plan.always) {
    clauses.push(`(${plan.always})`);
  }
  if (mode === "seed" && plan.seedAlways) {
    clauses.push(`(${plan.seedAlways})`);
  }
  return clauses.join(" AND ");
}
