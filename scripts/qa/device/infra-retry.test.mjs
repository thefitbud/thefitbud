// Z12-35 harness follow-up: the Android adb-link drop that failed the first flow of
// runs 44130567993, 44135603252 and 44114041962. Run with:
//   node --test scripts/qa/device/infra-retry.test.mjs
// (the `device-harness-tests` job runs every scripts/qa test, this one included).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify, decide, main, startsClean } from "./infra-retry.mjs";
import { buildGateSummary, toMarkdown } from "./gate-summary.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "z12-35-retry-"));
}

function write(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const LOGCAT_CLEAN = [
  '11-17 17:32:30.000  1234  1250 I ReactNativeJS: Running "main" with {"rootTag":11}',
  "11-17 17:32:31.000   900   910 W ActivityManager: unrelated system warning",
].join("\n");
const LOGCAT_CRASH = [
  LOGCAT_CLEAN,
  "11-17 17:32:32.000  1234  1234 E AndroidRuntime: FATAL EXCEPTION: main",
  "11-17 17:32:32.000  1234  1234 E AndroidRuntime: Process: com.thefitbud.mobile.staging, PID: 1234",
].join("\n");

// The light report of run 44130567993 (refs/device-gate/44130567993): the first flow died
// in 4 s with "Unknown error" when the adb transport dropped; the next two passed.
const JUNIT_ADB_DROP = `<?xml version='1.0' encoding='UTF-8'?>
<testsuites>
  <testsuite name="Test Suite" device="test" tests="3" failures="1" time="193.389" timestamp="2026-11-17T16:56:36">
    <testcase id="Launch smoke, trainee Today loads" name="Launch smoke, trainee Today loads" classname="Launch smoke, trainee Today loads" file="${repo}/apps/mobile/.maestro/device/launch/1-trainee-today.yaml" time="4.339" timestamp="2026-11-17T16:56:36" status="ERROR">
      <properties>
        <property name="tags" value="device, launch, trainee"/>
      </properties>
      <failure>Unknown error</failure>
    </testcase>
    <testcase id="Launch smoke, trainer Attention loads" name="Launch smoke, trainer Attention loads" classname="Launch smoke, trainer Attention loads" file="${repo}/apps/mobile/.maestro/device/launch/2-trainer-attention.yaml" time="68.584" timestamp="2026-11-17T16:56:41" status="SUCCESS">
    </testcase>
    <testcase id="F13" name="F13 Notifications inbox and its taps (Z12-47)" classname="F13" file="${repo}/apps/mobile/.maestro/flows/v3/F13-notifications-deep-links.yaml" time="120.363" timestamp="2026-11-17T16:57:49" status="SUCCESS">
    </testcase>
  </testsuite>
</testsuites>`;

const CLEAN_FLOW = "appId: x\nname: n\n---\n# comment\n- launchApp:\n    clearState: true\n    clearKeychain: true\n- tapOn: A\n";
const failed = (message, seconds) => ({ status: "fail", message, durationMs: seconds * 1000 });

// ---------- classification ----------

test("only an early adb-link failure of a clean-install flow, with no app step and no app crash, is retried", () => {
  const ok = { flowText: CLEAN_FLOW, completed: ["launchAppCommand"], appFailures: [] };
  assert.equal(classify({ ...ok, testCase: failed("Unknown error", 3) }).retry, true);
  assert.equal(
    classify({ ...ok, testCase: failed("Command failed (host:transport:emulator-5554): device 'emulator-5554' not found", 2) }).retry,
    true,
  );
  assert.equal(classify({ ...ok, completed: null, testCase: failed("Unknown error", 3) }).retry, true);
  const refused = [
    [{ testCase: failed('Assertion is false: "Today\'s workout.*" is visible', 3) }, /not an infrastructure failure/],
    [{ testCase: failed("Unknown error: something", 3) }, /not an infrastructure failure/],
    [{ testCase: failed("Unknown error", 40) }, /long enough to reach the app/],
    [{ testCase: failed("Unknown error", 3), completed: ["launchAppCommand", "runFlowCommand"] }, /completed app steps \(runFlowCommand\)/],
    [{ testCase: failed("Unknown error", 3), appFailures: [{ kind: "crash" }] }, /app crash/],
    [{ testCase: failed("Unknown error", 3), flowText: "appId: x\n---\n- launchApp:\n    stopApp: false\n" }, /clean install/],
    [{ testCase: failed("Unknown error", 3), flowText: null }, /flow file not found/],
    [{ testCase: { status: "pass", message: "", durationMs: 1000 } }, /did not fail/],
  ];
  for (const [over, why] of refused) {
    const d = classify({ ...ok, ...over });
    assert.equal(d.retry, false, JSON.stringify(over));
    assert.match(d.reason, why);
  }
});

test("startsClean reads the flow's first command only", () => {
  assert.equal(startsClean(CLEAN_FLOW), true);
  assert.equal(startsClean("appId: x\n---\n- launchApp\n- tapOn: A\n"), false);
  assert.equal(startsClean("appId: x\n---\n- launchApp:\n    stopApp: false\n- tapOn:\n    clearState: true\n"), false);
  assert.equal(startsClean("appId: x\n---\n- tapOn: A\n- launchApp:\n    clearState: true\n"), false);
  // Both launch smoke flows start clean, so they can be run again on their own.
  for (const f of ["1-trainee-today.yaml", "2-trainer-attention.yaml"]) {
    assert.equal(startsClean(fs.readFileSync(path.join(repo, "apps/mobile/.maestro/device/launch", f), "utf8")), true, f);
  }
});

test("run 44130567993's report retries the first launch flow; a crash in the log or completed app steps stop it", () => {
  const base = { junitXml: JUNIT_ADB_DROP, junitLabel: "junit.xml", theme: "light", outputsDir: null };
  const d = decide({ ...base, logText: LOGCAT_CLEAN });
  assert.equal(d.length, 1);
  assert.equal(d[0].flow, "Launch smoke, trainee Today loads");
  assert.equal(d[0].retry, true, d[0].reason);
  assert.match(d[0].file, /device\/launch\/1-trainee-today\.yaml$/);

  assert.equal(decide({ ...base, logText: LOGCAT_CRASH })[0].retry, false);

  const dir = tmp();
  write(
    path.join(dir, "maestro/2026-11-17_165636/commands-(Launch smoke, trainee Today loads).json"),
    JSON.stringify([
      { command: { launchAppCommand: {} }, metadata: { status: "COMPLETED" } },
      { command: { runFlowCommand: {} }, metadata: { status: "COMPLETED" } },
      { command: { assertConditionCommand: {} }, metadata: { status: "FAILED" } },
    ]),
  );
  const stepped = decide({ ...base, logText: LOGCAT_CLEAN, outputsDir: path.join(dir, "maestro") });
  assert.equal(stepped[0].retry, false);
  assert.match(stepped[0].reason, /runFlowCommand/);
});

test("the CLI prints the flows to retry, appends every decision, and reads the log from the pass's offset", () => {
  const dir = tmp();
  write(path.join(dir, "light/junit.xml"), JUNIT_ADB_DROP);
  // A crash before this pass began (an earlier theme) does not block this pass's retry.
  write(path.join(dir, "logs/android-device.log"), `${LOGCAT_CRASH}\n`);
  const from = fs.statSync(path.join(dir, "logs/android-device.log")).size;
  fs.appendFileSync(path.join(dir, "logs/android-device.log"), `${LOGCAT_CLEAN}\n`);
  const run = (extra) =>
    spawnSync(process.execPath, [
      path.join(here, "infra-retry.mjs"),
      "--junit", path.join(dir, "light/junit.xml"),
      "--theme", "light",
      "--log", path.join(dir, "logs/android-device.log"),
      "--out", path.join(dir, "light/retry.json"),
      ...extra,
    ], { encoding: "utf8" });
  const r = run(["--log-from", String(from)]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout.trim(), /1-trainee-today\.yaml$/);
  assert.match(r.stderr, /RETRY/);
  // The whole log holds the crash: no retry.
  const whole = run([]);
  assert.equal(whole.stdout.trim(), "");
  assert.match(whole.stderr, /no retry \(the device log shows an app crash/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "light/retry.json"), "utf8")).map((x) => x.retry), [true, false]);
  assert.equal(main(["--junit", path.join(dir, "missing.xml"), "--theme", "light", "--out", path.join(dir, "x.json")]), 0);
});

// ---------- gate-summary ----------

const one = (body) => `<?xml version="1.0"?><testsuites><testsuite name="s" tests="1">${body}</testsuite></testsuites>`;
const FLOW = "Launch smoke, trainee Today loads";

function retryDir({ retryJunit, retryExit, decision } = {}) {
  const dir = tmp();
  write(path.join(dir, "light/junit.xml"), one(`<testcase id="a" name="${FLOW}" time="4"><failure>Unknown error</failure></testcase>`));
  write(path.join(dir, "light/maestro-exit"), "1\n");
  write(path.join(dir, "dark/junit.xml"), one(`<testcase id="a" name="${FLOW}" time="30"/>`));
  write(path.join(dir, "dark/maestro-exit"), "0\n");
  write(path.join(dir, "scan.json"), JSON.stringify({ status: "pass", counts: {}, findings: [], allowed: [] }));
  write(path.join(dir, "flows.txt"), "/r/apps/mobile/.maestro/device/launch/1-trainee-today.yaml\n");
  write(
    path.join(dir, "light/retry.json"),
    JSON.stringify([{ theme: "light", flow: FLOW, file: "f.yaml", message: "Unknown error", retry: true, reason: '"Unknown error" after 4.0 s', ...decision }]),
  );
  if (retryJunit) write(path.join(dir, "light/junit-retry.xml"), retryJunit);
  if (retryExit !== undefined) write(path.join(dir, "light/maestro-exit-retry"), `${retryExit}\n`);
  return dir;
}

test("a retried adb-link failure that passes counts as passed, and the summary shows the retry", () => {
  const s = buildGateSummary({ dir: retryDir({ retryJunit: one(`<testcase id="a" name="${FLOW}" time="35"/>`), retryExit: 0 }), platform: "android" });
  assert.equal(s.status, "pass", s.reasons.join("; "));
  assert.deepEqual(s.themes[0].retries.map((x) => x.outcome), ["passed"]);
  assert.equal(s.themes[0].failed, 0);
  assert.equal(s.themes[0].passed, 1);
  const md = toMarkdown(s);
  assert.match(md, /\*\*Infra retries:\*\* 1 /);
  assert.match(md, /light · Launch smoke, trainee Today loads: first run "Unknown error" → retried once → \*\*passed\*\*/);
});

test("a retry that fails or wrote no report, or a refused retry, keeps the flow failed and says why", () => {
  const again = buildGateSummary({
    dir: retryDir({ retryJunit: one(`<testcase id="a" name="${FLOW}" time="3"><failure>Unknown error</failure></testcase>`), retryExit: 1 }),
    platform: "android",
  });
  assert.equal(again.status, "fail");
  assert.deepEqual(again.reasons, ["light: 1 of 1 flows failed"]);
  assert.match(toMarkdown(again), /Unknown error \(infra retry: Unknown error\)/);
  assert.match(toMarkdown(again), /→ \*\*failed\*\*/);

  const lost = buildGateSummary({ dir: retryDir({ retryExit: 1 }), platform: "android" });
  assert.equal(lost.status, "fail");
  assert.deepEqual(lost.themes[0].retries.map((x) => x.outcome), ["no report"]);

  const refused = buildGateSummary({ dir: retryDir({ decision: { retry: false, reason: "the device log shows an app crash in this pass" } }), platform: "android" });
  assert.equal(refused.status, "fail");
  assert.match(toMarkdown(refused), /\(not retried: the device log shows an app crash in this pass\)/);
  assert.match(toMarkdown(refused), /\*\*Infra retries:\*\* none/);

  // A passing retry with a non-zero retry exit does not excuse Maestro's exit code.
  const exited = buildGateSummary({ dir: retryDir({ retryJunit: one(`<testcase id="a" name="${FLOW}" time="35"/>`), retryExit: 1 }), platform: "android" });
  assert.deepEqual(exited.reasons, ["light: Maestro exited 1"]);
});

// ---------- adb link and logcat stream (fake adb) ----------

function fakeAdb(dir, script) {
  write(path.join(dir, "bin/adb"), `#!/usr/bin/env bash\n${script}\n`);
  fs.chmodSync(path.join(dir, "bin/adb"), 0o755);
  return { ...process.env, PATH: `${path.join(dir, "bin")}:${process.env.PATH}`, FAKE_ADB_DIR: dir, DEVICE_RESULTS: path.join(dir, "results") };
}

const linuxOnly = process.platform !== "linux" && "Android-side helpers use GNU timeout (ubuntu runner)";

test("android_wait_stable waits out a dropped adb link, and gives up on a link that never comes back", { skip: linuxOnly }, () => {
  const dir = tmp();
  // get-state calls 2-3 fail (the device is gone), the rest say device.
  const env = fakeAdb(
    dir,
    `case "$1" in
  get-state)
    n=$(( $(cat "$FAKE_ADB_DIR/n" 2>/dev/null || echo 0) + 1 )); echo "$n" >"$FAKE_ADB_DIR/n"
    if [ "$n" -ge 2 ] && [ "$n" -le 3 ]; then echo "error: device 'emulator-5554' not found" >&2; exit 1; fi
    echo device ;;
  shell) case "$*" in *boot_completed*) echo 1 ;; *"pm path"*) echo package:/system/framework/framework-res.apk ;; esac ;;
  wait-for-device) exit 0 ;;
esac`,
  );
  const r = spawnSync("bash", ["-c", `source "${path.join(here, "lib.sh")}"; android_wait_stable 3 30`], { env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^steady for 3 checks after \d+s \(1 drop\(s\) seen\)$/);

  const gone = fakeAdb(tmp(), 'case "$1" in get-state) exit 1 ;; wait-for-device) exit 1 ;; esac');
  const g = spawnSync("bash", ["-c", `source "${path.join(here, "lib.sh")}"; android_wait_stable 3 2`], { env: gone, encoding: "utf8" });
  assert.equal(g.status, 1);
  assert.match(g.stdout, /^not steady after 2s/);
});

test("logs.sh restarts the logcat stream after an adb drop, from the last timestamp, and stops for good on stop", { skip: linuxOnly }, async () => {
  const dir = tmp();
  // Every streaming `adb logcat` prints one line and ends, as a dropped transport does.
  const env = fakeAdb(
    dir,
    `case "$*" in
  "logcat -v threadtime"*) echo "$*" >>"$FAKE_ADB_DIR/calls"; echo '11-17 17:32:09.123  1234  1250 I ReactNativeJS: Running "main" with {}'; exit 1 ;;
  *) exit 0 ;;
esac`,
  );
  const logs = path.join(here, "logs.sh");
  const start = spawnSync("bash", [logs, "android", "start", "t"], { env, encoding: "utf8" });
  assert.equal(start.status, 0, start.stderr);
  await sleep(3500);
  const stop = spawnSync("bash", [logs, "android", "stop", "t"], { env, encoding: "utf8" });
  assert.equal(stop.status, 0, stop.stderr);
  assert.match(stop.stderr + stop.stdout, /restarted \d+ time\(s\)/);
  const log = fs.readFileSync(path.join(dir, "results/logs/t.log"), "utf8");
  assert.match(log, /logcat stream ended at .* reconnecting/);
  const reconnects = fs.readFileSync(path.join(dir, "results/logs/t.reconnects"), "utf8").split("\n").filter(Boolean);
  assert.ok(reconnects.length >= 2, `restarted ${reconnects.length} time(s)`);
  const calls = fs.readFileSync(path.join(dir, "calls"), "utf8");
  assert.match(calls.split("\n")[0], /^logcat -v threadtime$/);
  assert.match(calls, /logcat -v threadtime -T 11-17 17:32:09\.123/);
  await sleep(1500);
  assert.equal(fs.readFileSync(path.join(dir, "calls"), "utf8"), calls, "the stream kept restarting after stop");
});

test("run-gate waits for a steady adb link before the install, each theme and a retry, and retries once, through infra-retry only", () => {
  const gate = fs.readFileSync(path.join(here, "run-gate.sh"), "utf8");
  assert.match(gate, /adb_wait "boot"/);
  assert.match(gate, /adb_wait "theme \$theme"/);
  assert.match(gate, /adb_wait "retry \(\$theme\)"/);
  assert.match(gate, /infra-retry\.mjs" --junit "\$junit"/);
  assert.match(gate, /\[ "\$PLATFORM" = "android" \] \|\| return 1/);
  // Two call sites (all flows in one run, or one flow at a time); neither reads a retry report.
  const calls = gate.split("\n").filter((l) => /retry_infra "\$dir" "\$theme"/.test(l));
  assert.equal(calls.length, 2);
  for (const c of calls) assert.match(c, /"\$dir\/junit.*\.xml" "\$dir\/junit-retry/);
  assert.match(gate, /MAESTRO_OUT=maestro-retry run_maestro/);
});
