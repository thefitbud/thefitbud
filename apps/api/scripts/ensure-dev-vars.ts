#!/usr/bin/env node
/**
 * Ensures apps/api/.dev.vars exists for local wrangler dev (gitignored).
 */
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const example = path.join(apiRoot, ".dev.vars.example");
const target = path.join(apiRoot, ".dev.vars");

if (!existsSync(example)) {
  console.error("Missing .dev.vars.example at", example);
  process.exit(1);
}

if (!existsSync(target)) {
  copyFileSync(example, target);
  console.log(`Created ${target} from .dev.vars.example`);
} else {
  console.log(`Using existing ${target}`);
}
