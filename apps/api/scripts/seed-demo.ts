#!/usr/bin/env node
/**
 * Demo world seed (T24). Writes SQL and applies to local D1.
 * Full account roster is built in src/seed/demo/build.ts (WIP).
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDemoSeedSql } from "../src/seed/demo/build.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const outFile = path.join(apiRoot, ".wrangler", "demo-seed.sql");

if (process.argv.includes("--remote")) {
  console.error("seed-demo refuses non-local runs.");
  process.exit(1);
}

const sql = buildDemoSeedSql();
writeFileSync(outFile, sql, "utf8");
console.log(`Wrote ${outFile} (${sql.length} bytes)`);

const result = spawnSync(
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
    outFile,
  ],
  { cwd: apiRoot, stdio: "inherit" },
);
process.exit(result.status ?? 1);
