#!/usr/bin/env node
/**
 * Ensures apps/api/.dev.vars exists for local wrangler dev (copied from example).
 */
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(apiRoot, ".dev.vars");
const example = path.join(apiRoot, ".dev.vars.example");

if (!existsSync(example)) {
  console.error("Missing .dev.vars.example at", example);
  process.exit(1);
}

if (existsSync(target)) {
  console.log(`.dev.vars already present (${target})`);
} else {
  copyFileSync(example, target);
  console.log(`Created ${target} from .dev.vars.example`);
}
