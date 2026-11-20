#!/usr/bin/env node
/**
 * Z12-64 guard: fail when UI code feeds a raw error `.message` into
 * setError / setFormError / JSX, or when apps still embed the old
 * api-client fallback "Request failed with status".
 *
 * Run from repo root: `node scripts/check-user-facing-errors.mjs`
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCAN_ROOTS = [
  path.join(ROOT, "apps/mobile/src"),
  path.join(ROOT, "apps/trainer-web/src"),
];

const SKIP_FILE =
  /\.(test|spec)\.(tsx?|jsx?)$|\/test\/|\/__tests__\/|eslint-rules/;

/** setError(err.message) and friends — must go through userFacingMessage. */
const RAW_SETTER =
  /\b(set(?:Error|FormError|LocalError|ErrorMessage|SaveError|ForkError|SessionError|NudgeHint|LoadError|Hint))\(\s*(?:err|error|failure)\.message\s*\)/;

/** JSX / props that pass error.message straight through. */
const RAW_JSX_MESSAGE =
  /\b(?:message|error|copy)=\{(?:err|error|failure)\.message\}/;

/** Ternary / expression that still picks err.message for UI (common catch). */
const RAW_TERNARY_MESSAGE =
  /instanceof\s+(?:ApiClientError|Error)\s*\?\s*(?:err|error)\.message\b/;

const BANNED_LITERAL = /Request failed with status/;

/** @type {{ file: string; line: number; kind: string; text: string }[]} */
const hits = [];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "dist") continue;
      walk(p, out);
    } else if (/\.(tsx|ts|jsx|js)$/.test(ent.name) && !SKIP_FILE.test(p)) {
      out.push(p);
    }
  }
  return out;
}

for (const root of SCAN_ROOTS) {
  for (const file of walk(root)) {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

      if (RAW_SETTER.test(line)) {
        hits.push({
          file: path.relative(ROOT, file),
          line: i + 1,
          kind: "raw-setter",
          text: trimmed,
        });
      }
      if (RAW_JSX_MESSAGE.test(line)) {
        hits.push({
          file: path.relative(ROOT, file),
          line: i + 1,
          kind: "raw-jsx-message",
          text: trimmed,
        });
      }
      if (RAW_TERNARY_MESSAGE.test(line)) {
        hits.push({
          file: path.relative(ROOT, file),
          line: i + 1,
          kind: "raw-ternary-message",
          text: trimmed,
        });
      }
      if (BANNED_LITERAL.test(line)) {
        hits.push({
          file: path.relative(ROOT, file),
          line: i + 1,
          kind: "request-failed-literal",
          text: trimmed,
        });
      }
    }
  }
}

// Also ban the literal in api-client production source (tests may mention it).
const apiClientSrc = path.join(ROOT, "packages/api-client/src");
for (const file of walk(apiClientSrc)) {
  if (file.endsWith(".test.ts") || file.endsWith("errors.ts")) continue;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (BANNED_LITERAL.test(lines[i]) && !lines[i].trim().startsWith("*") && !lines[i].trim().startsWith("//")) {
      hits.push({
        file: path.relative(ROOT, file),
        line: i + 1,
        kind: "request-failed-literal",
        text: lines[i].trim(),
      });
    }
  }
}

if (hits.length > 0) {
  console.error("Z12-64 user-facing error guard failed:\n");
  for (const h of hits) {
    console.error(`  [${h.kind}] ${h.file}:${h.line}`);
    console.error(`    ${h.text}`);
  }
  console.error(
    "\nUse userFacingMessage(err) / userFacingError(err) from @fitbud/api-client.",
  );
  process.exit(1);
}

console.log("Z12-64 user-facing error guard: ok");
