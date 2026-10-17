import { DEMO_ACCOUNTS } from "./spec.js";

/**
 * Placeholder demo seed: PRAGMA only until history builder (T24) lands.
 * Re-running is a no-op aside from the header comment.
 */
export function buildDemoSeedSql(referenceDate = new Date()): string {
  const ref = referenceDate.toISOString();
  const roster = DEMO_ACCOUNTS.map((a) => `-- ${a.email} (${a.state})`).join("\n");
  return `-- FitBud demo seed (stub) reference=${ref}\nPRAGMA defer_foreign_keys = true;\n${roster}\n`;
}
