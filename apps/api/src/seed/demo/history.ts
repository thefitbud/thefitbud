import { DEMO_ACCOUNTS } from "./spec.js";
import { demoUuid, sqlQuote } from "./ids.js";

function relId(trainerEmail: string, traineeEmail: string): string {
  return demoUuid(
    "relationship",
    trainerEmail.split("@")[0]!,
    traineeEmail.split("@")[0]!,
  );
}

function userId(email: string): string {
  return demoUuid("user", email);
}

function insertRelationship(input: {
  trainerEmail: string;
  traineeEmail: string;
  status: "active" | "ended";
  now: string;
  endedAt?: string | null;
}): string {
  const id = relId(input.trainerEmail, input.traineeEmail);
  return `INSERT INTO coaching_relationships (id, trainer_user_id, trainee_user_id, status, invitation_id, started_at, ended_at, ended_by_user_id, end_reason, reactivated_at, created_at, updated_at) VALUES (${sqlQuote(id)}, ${sqlQuote(userId(input.trainerEmail))}, ${sqlQuote(userId(input.traineeEmail))}, ${sqlQuote(input.status)}, NULL, ${sqlQuote(input.now)}, ${input.endedAt ? sqlQuote(input.endedAt) : "NULL"}, NULL, NULL, NULL, ${sqlQuote(input.now)}, ${sqlQuote(input.now)});`;
}

/** Assignment / log / exception SQL for demo personas (T24). */
export function buildDemoHistorySql(input: {
  referenceDate: string;
  referenceInstant: string;
}): string {
  const now = input.referenceInstant;
  const lines: string[] = [`-- history anchor ${input.referenceDate}`];

  for (const account of DEMO_ACCOUNTS) {
    if (account.role !== "trainee" || !account.trainerEmail) continue;
    const ended =
      account.state === "ended" ||
      account.state === "reactivation_pending";
    const endedAt =
      ended
        ? new Date(Date.parse(now) - 10 * 86_400_000).toISOString()
        : null;
    lines.push(
      insertRelationship({
        trainerEmail: account.trainerEmail,
        traineeEmail: account.email,
        status: ended ? "ended" : "active",
        now,
        endedAt,
      }),
    );
  }

  const farhanRel = relId("rahul.coach@demo.fitbud.test", "farhan.paused@demo.fitbud.test");
  void farhanRel;
  lines.push(
    `INSERT INTO reminder_states (trainee_user_id, consecutive_ignores, mode, paused_until, last_evaluated_at, updated_at) VALUES (${sqlQuote(userId("farhan.paused@demo.fitbud.test"))}, 5, 'paused', ${sqlQuote(new Date(Date.parse(now) + 7 * 86_400_000).toISOString())}, ${sqlQuote(now)}, ${sqlQuote(now)});`,
  );

  const rohanRel = relId("rahul.coach@demo.fitbud.test", "rohan.slipping@demo.fitbud.test");
  lines.push(
    `INSERT INTO exceptions (id, coaching_relationship_id, type, severity, status, rule_version, source_entity_type, source_entity_id, summary, detected_at, created_at, updated_at) VALUES (${sqlQuote(demoUuid("exception", "rohan-missed-workout"))}, ${sqlQuote(rohanRel)}, 'missed_workout', 'critical', 'active', 'demo-v1', 'workout_assignment', ${sqlQuote(demoUuid("workout_assignment", "rohan-missed"))}, 'Missed workout', ${sqlQuote(new Date(Date.parse(now) - 2 * 86_400_000).toISOString())}, ${sqlQuote(now)}, ${sqlQuote(now)});`,
  );

  const ishitaRel = relId("rahul.coach@demo.fitbud.test", "ishita.pushoff@demo.fitbud.test");
  lines.push(
    `INSERT INTO coach_asks (id, relationship_id, trainee_user_id, item_type, item_id, topic, asked_at, last_asked_at, ask_count, status) VALUES (${sqlQuote(demoUuid("coach_ask", "ishita"))}, ${sqlQuote(ishitaRel)}, ${sqlQuote(userId("ishita.pushoff@demo.fitbud.test"))}, 'meal_assignment', ${sqlQuote(demoUuid("meal_assignment", "ishita"))}, 'portion_size', ${sqlQuote(now)}, ${sqlQuote(now)}, 2, 'open');`,
  );

  const nikhilRel = relId("rahul.coach@demo.fitbud.test", "nikhil.reactivate@demo.fitbud.test");
  lines.push(
    `INSERT INTO reactivation_requests (id, relationship_id, trainer_user_id, status, intake_update_requested, expires_at, created_at) VALUES (${sqlQuote(demoUuid("reactivation", "nikhil"))}, ${sqlQuote(nikhilRel)}, ${sqlQuote(userId("rahul.coach@demo.fitbud.test"))}, 'pending', 0, ${sqlQuote(new Date(Date.parse(now) + 9 * 86_400_000).toISOString())}, ${sqlQuote(now)});`,
  );

  const deepakRel = relId("rahul.coach@demo.fitbud.test", "deepak.dubai@demo.fitbud.test");
  lines.push(
    `INSERT INTO meal_time_overrides (relationship_id, slot_key, day_pattern, time, updated_at) VALUES (${sqlQuote(deepakRel)}, 'lunch', 'all', '14:30', ${sqlQuote(now)}), (${sqlQuote(deepakRel)}, 'dinner', 'weekdays', '21:00', ${sqlQuote(now)});`,
  );

  lines.push(
    `INSERT INTO client_invitations (id, trainer_user_id, recipient_email, recipient_display_name, token_hash, status, expires_at, onboarding_form_template_version_id, created_at, updated_at) VALUES (${sqlQuote(demoUuid("invite", "anita-pending"))}, ${sqlQuote(userId("rahul.coach@demo.fitbud.test"))}, 'anita.invite@demo.fitbud.test', 'Anita Invite', 'demo-token-hash-anita', 'pending', ${sqlQuote(new Date(Date.parse(now) + 5 * 86_400_000).toISOString())}, (SELECT id FROM onboarding_form_versions ORDER BY version DESC LIMIT 1), ${sqlQuote(now)}, ${sqlQuote(now)});`,
  );

  return lines.join("\n");
}

export const DEMO_HISTORY_PLACEHOLDER = false;
