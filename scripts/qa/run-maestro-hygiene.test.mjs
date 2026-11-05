// BT12. Run with: node --test scripts/qa/run-maestro-hygiene.test.mjs
//
// The Android crash scan used to ignore a failed logcat dump, and both Maestro
// runners used `find | head` under `set -o pipefail`, which exits 141 when head
// closes the pipe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const androidScript = path.join(here, "run-maestro.sh");
const iosScript = path.join(here, "run-maestro-ios.sh");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function writeExe(dir, name, body) {
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin, { recursive: true });
  const file = path.join(bin, name);
  fs.writeFileSync(file, body, { mode: 0o755 });
  return bin;
}

function fakeAdb(dir, logcat) {
  const logFile = path.join(dir, "logcat.txt");
  fs.writeFileSync(logFile, logcat.body);
  return writeExe(
    dir,
    "adb",
    `#!/bin/bash
set -euo pipefail
if [ "\$1" = "wait-for-device" ]; then exit 0; fi
if [ "\$1" = "logcat" ] && [ "\$2" = "-c" ]; then exit 0; fi
if [ "\$1" = "logcat" ] && [ "\$2" = "-d" ]; then
  cat ${JSON.stringify(logFile)}
  exit ${logcat.status}
fi
if [ "\$1" = "shell" ]; then
  shift
  cmd="\$*"
  case "\$cmd" in
    "settings put global hide_error_dialogs "*) exit 0 ;;
    "settings get global hide_error_dialogs") printf '1'; exit 0 ;;
    *) exit 0 ;;
  esac
fi
echo "unexpected adb: \$*" >&2
exit 1
`,
  );
}

function fakeMaestro(dir, { status, files }) {
  return writeExe(
    dir,
    "maestro",
    `#!/bin/bash
set -euo pipefail
status=${status}
${files}
exit "\$status"
`,
  );
}

function runAndroid(dir, { logcat, maestroStatus, maestroBody }) {
  const adbBin = fakeAdb(dir, logcat);
  const maestroBin = fakeMaestro(dir, { status: maestroStatus, files: maestroBody });
  const bin = path.join(dir, "bin");
  if (adbBin !== maestroBin) throw new Error("fakes must share a bin directory");
  return spawnSync("bash", [androidScript], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      QA_TEST_OTP_CODE: "000000",
      FITBUD_QA_PASSWORD: "not-a-real-password",
      QA_MAESTRO_SKIP_INSTALL: "1",
      QA_RESULTS_DIR: path.join(dir, "qa-results"),
      QA_MAESTRO_TAG: "smoke",
    },
    cwd: repo,
  });
}

test("a captured logcat that shows the app started leaves Maestro's pass in place", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bt12-logcat-"));
  const result = runAndroid(dir, {
    logcat: { body: '11-03 20:41:02.113  4121  4121 I ReactNativeJS: Running "main"\n', status: 0 },
    maestroStatus: 0,
    maestroBody: "printf '%s\\n' '<testsuite></testsuite>' > junit.xml",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /maestro exited 0/);
  assert.doesNotMatch(result.stderr, /crash scan proved nothing/);
});

test("a pass with no app output in logcat fails the job", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bt12-logcat-"));
  const result = runAndroid(dir, {
    logcat: { body: "11-03 20:41:02.113  1  1 I auditd: unrelated\n", status: 0 },
    maestroStatus: 0,
    maestroBody: "printf '%s\\n' '<testsuite></testsuite>' > junit.xml",
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /crash scan proved nothing/);
  assert.match(result.stdout, /::warning title=Logcat capture produced nothing::/);
  assert.match(result.stdout, /maestro exited 1/);
});

test("a failed logcat dump on a Maestro pass fails the job", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bt12-logcat-"));
  const result = runAndroid(dir, {
    logcat: { body: "", status: 1 },
    maestroStatus: 0,
    maestroBody: "printf '%s\\n' '<testsuite></testsuite>' > junit.xml",
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /logcat capture failed/);
  assert.match(result.stderr, /crash scan proved nothing/);
});

test("a Maestro failure is kept when the log proves nothing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bt12-logcat-"));
  const result = runAndroid(dir, {
    logcat: { body: "", status: 1 },
    maestroStatus: 3,
    maestroBody: "exit 3",
  });
  assert.equal(result.status, 3, result.stderr);
  assert.match(result.stdout, /maestro exited 3/);
});

test("the report lookup survives a large results directory under pipefail", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bt12-find-"));
  const result = runAndroid(dir, {
    logcat: { body: 'I ReactNativeJS: Running "main"\n', status: 0 },
    maestroStatus: 0,
    maestroBody: `
      for i in $(seq 1 5000); do : > "pad-$i.xml"; done
      printf '%s\\n' '<first/>' > aaa-report.xml
      printf '%s\\n' '<second/>' > zzz-report.xml
    `,
  });
  assert.equal(result.status, 0, result.stderr);
  const junit = fs.readFileSync(path.join(dir, "qa-results", "mobile", "junit.xml"), "utf8");
  assert.equal(junit.trim(), "<first/>");
  assert.match(result.stdout, /moved aaa-report.xml to junit.xml/);
});

test("neither Maestro runner pipes find into head", () => {
  for (const file of [androidScript, iosScript]) {
    assert.doesNotMatch(read(file), /\| *head\b/, path.basename(file));
  }
});

test("the iOS runner does not use mapfile or readarray (macos-15 bash is 3.2)", () => {
  assert.doesNotMatch(read(iosScript), /\b(mapfile|readarray)\b/);
});
