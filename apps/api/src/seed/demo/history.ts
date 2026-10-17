import { demoUuid, sqlQuote } from "./ids.js";

/** Assignment / log / exception SQL for demo personas (T24). */
export function buildDemoHistorySql(input: {
  referenceDate: string;
  referenceInstant: string;
}): string {
  const rahulId = demoUuid("user", "rahul.coach@demo.fitbud.test");
  const aaravId = demoUuid("user", "aarav.ontrack@demo.fitbud.test");
  const relId = demoUuid("relationship", "rahul", "aarav");
  const now = input.referenceInstant;
  const lines: string[] = [
    `-- history anchor ${input.referenceDate}`,
    `INSERT INTO coaching_relationships (id, trainer_user_id, trainee_user_id, status, invitation_id, started_at, ended_at, ended_by_user_id, end_reason, reactivated_at, created_at, updated_at) VALUES (${sqlQuote(relId)}, ${sqlQuote(rahulId)}, ${sqlQuote(aaravId)}, 'active', NULL, ${sqlQuote(now)}, NULL, NULL, NULL, NULL, ${sqlQuote(now)}, ${sqlQuote(now)});`,
  ];
  return lines.join("\n");
}

export const DEMO_HISTORY_PLACEHOLDER = false;
