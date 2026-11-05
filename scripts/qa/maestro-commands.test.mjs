// Z5-12 (W4 gap G7). Run with: node --test scripts/qa/maestro-commands.test.mjs
// Unknown Maestro command names must fail. See maestro-commands.mjs.
// Skips when js-yaml is not installed (the qa-scripts job runs with Node only).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { findUnknownCommands, loadJsYaml, validateDirectory } from "./maestro-commands.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../..");
const maestroRoot = join(repoRoot, "apps/mobile/.maestro");
const cli = join(here, "maestro-commands.mjs");
const yaml = loadJsYaml();
const skip = yaml ? false : "js-yaml is not installed; the ci job runs this after pnpm install";

const HEADER = "appId: in.fitbud.app\n---\n";
const unknown = (body) => findUnknownCommands(HEADER + body, yaml);

test("every real flow under apps/mobile/.maestro uses only known commands", { skip }, () => {
  assert.deepEqual(validateDirectory(maestroRoot, yaml), []);
});

test("accepts bare, mapped, string-valued and clearKeychain-style commands", { skip }, () => {
  const body = [
    "- launchApp:",
    "    clearState: true",
    "    clearKeychain: true",
    "- hideKeyboard",
    "- runFlow: ../common/x.yaml",
    "- tapOn: Save",
    "",
  ].join("\n");
  assert.deepEqual(unknown(body), []);
});

test("a typo'd top-level command fails with its line", { skip }, () => {
  const found = unknown("- launchApp\n- tapOnn: Save\n");
  assert.deepEqual(found, [{ line: 4, command: "tapOnn" }]);
});

test("a typo'd bare-string command fails", { skip }, () => {
  assert.deepEqual(unknown("- hideKeyboardd\n"), [{ line: 3, command: "hideKeyboardd" }]);
});

test("unknown commands nested in runFlow, repeat and retry are found", { skip }, () => {
  const body = [
    "- runFlow:",
    "    when:",
    "      visible: Hi",
    "    commands:",
    "      - tapOnn: A",
    "- repeat:",
    "    times: 2",
    "    commands:",
    "      - assertVisble: B",
    "- retry:",
    "    maxRetries: 2",
    "    commands:",
    "      - runFlow:",
    "          commands:",
    "            - inputTxt: C",
    "",
  ].join("\n");
  assert.deepEqual(
    unknown(body).map(({ command, line }) => `${line}:${command}`),
    ["7:tapOnn", "11:assertVisble", "17:inputTxt"],
  );
});

test("parameters and conditions are not treated as commands", { skip }, () => {
  const body = [
    "- runFlow:",
    "    file: a.yaml",
    "    when:",
    "      notVisible: X",
    "    env:",
    "      FOO: bar",
    "- extendedWaitUntil:",
    "    visible: Y",
    "    timeout: 5000",
    "",
  ].join("\n");
  assert.deepEqual(unknown(body), []);
});

test("the CLI exits 1 and prints file:line for a bad flow, 0 for a good one", { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), "maestro-cmds-"));
  try {
    mkdirSync(join(dir, "flows"));
    writeFileSync(join(dir, "config.yaml"), "flows:\n  - flows/*\n");
    writeFileSync(join(dir, "flows/ok.yaml"), `${HEADER}- launchApp\n- tapOn: A\n`);
    const ok = spawnSync(process.execPath, [cli, dir], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stderr);

    writeFileSync(join(dir, "flows/bad.yaml"), `${HEADER}- launchApp\n- tapOnn: A\n`);
    const bad = spawnSync(process.execPath, [cli, dir], { encoding: "utf8", cwd: dir });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /flows[\\/]bad\.yaml:4: unknown Maestro command "tapOnn"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
