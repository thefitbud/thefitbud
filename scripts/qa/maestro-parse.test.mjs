// BT10 (D-W4-14, D-W3b-13, D-W3b-18).
// Run with: node --test scripts/qa/maestro-parse.test.mjs
//
// Maestro parses every file a flow reaches, including shared subflows, and
// rejects one that has no config section before `---` (the assert-no-crash
// failure: "Config Section Required"). This test is the stand-in for
// `maestro check-syntax` when the CLI is not installed. It uses js-yaml 4,
// already in the lockfile via @eslint/eslintrc; it does not add a dependency.
//
// config.yaml is the workspace file, not a flow: it has no `---` and no
// appId. Every other YAML file must have a mapping header with appId or url,
// then `---`, then a command list.
//
// The required `qa-scripts` job runs `node --test "scripts/qa/**/*.test.mjs"`
// with Node only (no `pnpm install`). js-yaml is not a direct dependency; it
// is reached through eslint. When that chain is absent the test skips. The
// `ci` job installs the lockfile and runs the same file with assertions on.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const maestroRoot = join(repoRoot, "apps/mobile/.maestro");

const JS_YAML_SKIP =
  "js-yaml is not installed (resolved via eslint and @eslint/eslintrc from packages/config). " +
  "The qa-scripts job does not install dependencies; the ci job runs this test after pnpm install.";

function loadJsYaml() {
  // eslint depends on @eslint/eslintrc, which depends on js-yaml 4. Resolve
  // from those packages so a version bump does not hardcode a pnpm path.
  // MODULE_NOT_FOUND means the chain is not installed. Any other error is a
  // real failure and must not become a skip.
  try {
    const require = createRequire(join(repoRoot, "packages/config/package.json"));
    const eslintDir = dirname(require.resolve("eslint/package.json"));
    const eslintrcDir = dirname(
      require.resolve("@eslint/eslintrc/package.json", { paths: [eslintDir] }),
    );
    return require(require.resolve("js-yaml", { paths: [eslintrcDir] }));
  } catch (error) {
    if (error && error.code === "MODULE_NOT_FOUND") return null;
    throw error;
  }
}

const yaml = loadJsYaml();

function yamlFiles(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      found.push(...yamlFiles(path));
    } else if (name.endsWith(".yaml") || name.endsWith(".yml")) {
      found.push(path);
    }
  }
  return found.sort();
}

function parseYaml(text, label) {
  try {
    return yaml.load(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label}: ${message}`);
  }
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function checkWorkspace(text) {
  const doc = parseYaml(text, "workspace YAML");
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("workspace config must be a mapping");
  }
  if (!Array.isArray(doc.flows) || doc.flows.length === 0) {
    throw new Error("workspace config must list flows");
  }
}

function checkFlow(text) {
  const lines = text.split(/\r?\n/);
  const separator = lines.findIndex((line) => line.trim() === "---");
  if (separator === -1) {
    throw new Error("config section required: no --- separator before commands");
  }
  const config = parseYaml(lines.slice(0, separator).join("\n"), "config YAML");
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("config section required: header is not a mapping");
  }
  if (!nonEmptyString(config.appId) && !nonEmptyString(config.url)) {
    throw new Error("config section required: missing appId or url");
  }
  const commands = parseYaml(lines.slice(separator + 1).join("\n"), "commands YAML");
  if (!Array.isArray(commands) || commands.length === 0) {
    throw new Error("commands must be a non-empty list");
  }
}

function checkFile(path) {
  const text = readFileSync(path, "utf8");
  const rel = relative(maestroRoot, path);
  if (rel === "config.yaml" || rel === "config.yml") {
    checkWorkspace(text);
    return;
  }
  checkFlow(text);
}

test(
  "every apps/mobile/.maestro YAML file parses and flows have a config section",
  { skip: yaml ? false : JS_YAML_SKIP },
  () => {
  const files = yamlFiles(maestroRoot);
  assert.ok(files.length > 0, "no Maestro YAML files found");
  const problems = [];
  for (const path of files) {
    try {
      checkFile(path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      problems.push(`${relative(repoRoot, path)}: ${message}`);
    }
  }
  assert.deepEqual(problems, []);
});
