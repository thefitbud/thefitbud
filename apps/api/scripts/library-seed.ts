#!/usr/bin/env node
/**
 * Load library v2 into local D1 (.wrangler/state). Refuses --remote.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCommandSync } from "./lib/run-command.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const seedDir = path.join(apiRoot, "seed", "library");

const files = [
  "00_wipe_legacy_dev.sql",
  "sql/01_lookups.sql",
  "sql/02_foods.sql",
  "sql/02b_food_extras.sql",
  "sql/03_exercises.sql",
  "sql/04_templates.sql",
  "sql/05_search.sql",
  "sql/06_seed_version.sql",
  "07_post_wipe_dev.sql",
  "sql/08_post_seed.sql",
  "sql/05_search.sql",
];

function runFile(rel: string): void {
  const file = path.join(seedDir, rel);
  if (!existsSync(file)) {
    console.error(`Missing seed file: ${file}`);
    process.exit(1);
  }
  console.log(`→ ${rel}`);
  runCommandSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "fitbud",
      "--local",
      "--persist-to",
      ".wrangler/state",
      "--file",
      file,
    ],
    { cwd: apiRoot },
  );
}

const remote = process.argv.includes("--remote");
if (remote) {
  console.error("library-seed refuses --remote (local dev only).");
  process.exit(1);
}

console.log("Seeding FitBud library v2 into local D1…");
for (const rel of files) {
  runFile(rel);
}
console.log("Library seed complete.");
