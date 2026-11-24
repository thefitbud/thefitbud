#!/usr/bin/env node
/**
 * Local D1 migrations, then `PRAGMA optimize` on the same local database (Z14-4).
 * `pnpm db:migrate:local` (and so `pnpm db:reset`) runs this.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { localMigrateCommands } from "./lib/d1-optimize.js";
import { runCommandSync } from "./lib/run-command.js";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// runCommandSync exits on failure, so a failed migration never reaches optimize.
for (const command of localMigrateCommands()) runCommandSync("pnpm", command, { cwd: apiRoot });
