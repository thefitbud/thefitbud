#!/usr/bin/env node
/**
 * Local D1 reset: wipe state, migrate, library seed, demo seed (T25).
 */
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const d1State = path.join(apiRoot, ".wrangler", "state", "v3", "d1");

const allowed = path.normalize(d1State);
if (!allowed.endsWith(`${path.sep}.wrangler${path.sep}state${path.sep}v3${path.sep}d1`)) {
  console.error("Refusing to delete unexpected path:", allowed);
  process.exit(1);
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: apiRoot, stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`Removing ${allowed}`);
rmSync(allowed, { recursive: true, force: true });

run("pnpm", ["db:migrate:local"]);
run("pnpm", ["db:seed:library"]);
run("pnpm", ["seed:demo"]);

console.log("db:reset complete.");
