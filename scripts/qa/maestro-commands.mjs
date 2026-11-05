// Z5-12 (W4 gap G7): reject Maestro flows that use a command name Maestro does not have.
//
// `maestro check-syntax` is the real check but the required `ci` job only runs it when the CLI
// is on PATH, which it is not. maestro-parse.test.mjs proves the YAML parses and has a config
// section; it does not look at command names, so a typo such as `tapOnn:` passed `ci` and failed
// only in the slow Maestro job. This module checks command names against Maestro's documented
// command set (https://docs.maestro.dev/reference/commands-available). The installed CLI is not
// pinned (qa.yml installs the current release), so the list is the documented set, not a version
// snapshot; add a name here when Maestro documents a new command and a flow needs it.
//
// Only command names are checked, never their parameters (`clearKeychain` in `launchApp:` is a
// parameter, `when:` is a condition). Nesting is followed through `commands:` of `runFlow`,
// `repeat` and `retry`.
//
// Use from a test or script:  import { validateDirectory } from "./maestro-commands.mjs"
// Use from ci.yml:            node scripts/qa/maestro-commands.mjs apps/mobile/.maestro
// The CLI exits 1 and prints `file:line: unknown Maestro command "x"` for each bad command.
// Like maestro-parse.test.mjs it needs js-yaml (reached through eslint). With no install it
// exits 2, or 0 when --allow-missing-yaml is passed.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

export const MAESTRO_COMMANDS = new Set([
  "addMedia",
  "assertNoDefectsWithAI",
  "assertNotVisible",
  "assertScreenshot",
  "assertTrue",
  "assertVisible",
  "assertWithAI",
  "back",
  "clearKeychain",
  "clearState",
  "copyTextFrom",
  "doubleTapOn",
  "eraseText",
  "evalScript",
  "extendedWaitUntil",
  "extractTextWithAI",
  "hideKeyboard",
  "inputRandomEmail",
  "inputRandomNumber",
  "inputRandomPersonName",
  "inputRandomText",
  "inputText",
  "killApp",
  "launchApp",
  "longPressOn",
  "openLink",
  "pasteText",
  "pressKey",
  "repeat",
  "retry",
  "runFlow",
  "runScript",
  "scroll",
  "scrollUntilVisible",
  "setAirplaneMode",
  "setLocation",
  "setOrientation",
  "setPermissions",
  "startRecording",
  "stopApp",
  "stopRecording",
  "swipe",
  "takeScreenshot",
  "tapOn",
  "toggleAirplaneMode",
  "travel",
  "waitForAnimationToEnd",
]);

// Commands whose value may hold a nested `commands:` list.
const NESTING_COMMANDS = new Set(["runFlow", "repeat", "retry"]);

export function loadJsYaml() {
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

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Unknown command names in one flow file's text.
 * Returns [{ line, command }] (line is 1-based, best effort), or throws if the file is not a
 * flow (no `---`) or its YAML does not parse; maestro-parse.test.mjs owns those failures.
 */
export function findUnknownCommands(text, yaml, allowed = MAESTRO_COMMANDS) {
  const lines = text.split(/\r?\n/);
  const separator = lines.findIndex((line) => line.trim() === "---");
  if (separator === -1) throw new Error("no --- separator before commands");
  const commands = yaml.load(lines.slice(separator + 1).join("\n"));
  if (!Array.isArray(commands)) throw new Error("commands must be a list");

  const found = [];
  let cursor = separator + 1;

  // Names are visited in document order, so a forward-moving cursor finds each one's line.
  function locate(name) {
    const pattern = new RegExp(`^\\s*(?:-\\s+)?${escapeRegExp(name)}\\s*(?::|$)`);
    for (let i = cursor; i < lines.length; i += 1) {
      if (pattern.test(lines[i])) {
        cursor = i + 1;
        return i + 1;
      }
    }
    return separator + 2;
  }

  function visit(name, value) {
    const line = locate(name);
    if (!allowed.has(name)) {
      found.push({ line, command: name });
      return;
    }
    if (
      NESTING_COMMANDS.has(name) &&
      value !== null &&
      typeof value === "object" &&
      Array.isArray(value.commands)
    ) {
      walk(value.commands);
    }
  }

  function walk(list) {
    for (const item of list) {
      if (typeof item === "string") {
        visit(item, undefined);
      } else if (item !== null && typeof item === "object" && !Array.isArray(item)) {
        for (const [name, value] of Object.entries(item)) visit(name, value);
      } else {
        found.push({ line: locate(String(item)), command: String(item) });
      }
    }
  }

  walk(commands);
  return found;
}

function yamlFiles(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...yamlFiles(path));
    else if (name.endsWith(".yaml") || name.endsWith(".yml")) found.push(path);
  }
  return found.sort();
}

/** Validate every flow under `dir` (config.yaml is the workspace file, not a flow). */
export function validateDirectory(dir, yaml = loadJsYaml(), root = repoRoot) {
  if (!yaml) throw new Error("js-yaml is not installed");
  const problems = [];
  for (const path of yamlFiles(dir)) {
    if (/^config\.ya?ml$/.test(relative(dir, path))) continue;
    const label = relative(root, path) || path;
    let unknown;
    try {
      unknown = findUnknownCommands(readFileSync(path, "utf8"), yaml);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      problems.push(`${label}: ${message}`);
      continue;
    }
    for (const { line, command } of unknown) {
      problems.push(`${label}:${line}: unknown Maestro command "${command}"`);
    }
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const allowMissing = args.includes("--allow-missing-yaml");
  const dir = args.find((arg) => !arg.startsWith("--"));
  if (!dir) {
    console.error("usage: node scripts/qa/maestro-commands.mjs <dir> [--allow-missing-yaml]");
    process.exit(2);
  }
  const yaml = loadJsYaml();
  if (!yaml) {
    console.error("js-yaml is not installed (run pnpm install); cannot validate Maestro commands");
    process.exit(allowMissing ? 0 : 2);
  }
  const problems = validateDirectory(dir, yaml, process.cwd());
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
}
