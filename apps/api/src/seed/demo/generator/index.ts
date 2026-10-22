/**
 * Realistic demo world (SEED_DESIGN.md §6). Called from history.ts:
 * - trainerLibrarySql: Rahul's templates/forms (+ Priya copies) before any plan row
 * - legacy plan chains for the original personas (fixed ids kept)
 * - deep history before the 28-day window + the 8 generated personas
 */
export { addTrainerLibrary, planTemplateId } from "./library-rows.js";
export { addGeneratedPersona, addLegacyDeepHistory, startedAtFor, checkinFormFor, type WorldInput } from "./generated.js";
export { buildPlanChain, insertPlanRows, insertSubscriptionChain, versionForDate, type ChainVersion } from "./plans.js";
export { PERSONA_CONFIGS, GENERATED_PERSONA_EMAILS, personaConfig } from "./personas.js";
export { SeedRows } from "./sql.js";

import type { SeedRows } from "./sql.js";

export function rowsToSql(rows: SeedRows): string {
  return rows.statements().map((s) => s.sql).join("\n");
}
