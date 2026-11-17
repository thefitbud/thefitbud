#!/usr/bin/env node
// Decides which failed Android flows the device gate may run ONCE more, because they
// failed on the emulator's adb link and not in the app (Z12-35 harness follow-up).
//
//   node scripts/qa/device/infra-retry.mjs --junit <report> --theme <light|dark> \
//     --log <logcat file> [--log-from <byte offset>] --out <retry.json> [--outputs <maestro dir>]
//
// Prints the flow files to retry, one per line, and appends every decision (retry or
// not, with the reason) to --out, which gate-summary.mjs shows in the summary.
//
// Why: in runs 44130567993 (both attempts), 44135603252 and 44114041962 the emulator's
// adb transport dropped during the light pass. Maestro then failed whatever flow was
// running within 2-4 s with "Unknown error" (once with dadb's "device 'emulator-5554'
// not found"), and the one `adb logcat` stream exited, so the scan saw no app output
// (capture-empty) although the app ran every later flow.
//
// A failed flow is retried only when ALL of these hold, so a real app failure is never
// masked:
//   1. the failure is an infrastructure signature: Maestro's bare "Unknown error", or an
//      adb transport error (device not found / offline, host:transport failed);
//   2. it failed within MAX_SECONDS: a cold start plus sign-in takes over 30 s, so the
//      flow cannot have reached an app screen;
//   3. Maestro's command log for the flow exists and shows no completed command past
//      launching the app, so no screen step ran (a missing log fails closed: no retry);
//   4. the flow starts from a clean install (its first command is launchApp with
//      clearState: true), so running it again, later, does not depend on other flows;
//   5. the device log since this pass began shows no app crash, ANR, tombstone or red box.
// One retry per flow per pass, never more. Android only: the iOS driver has its own
// warm-up in run-gate.sh.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJUnit } from "../summarize.mjs";
import { scanAndroid } from "./scan-logs.mjs";

export const MAX_SECONDS = 15;
export const INFRA_MESSAGE =
  /^Unknown error$|device '[^']*' not found|\bdevice offline\b|Command failed \(host:transport|no devices\/emulators found/;
export const ASSERTION_MESSAGE = /^\s*(Assertion is false|Element not found)/i;
// Commands that run before any app screen exists. Anything else completed means the
// flow got as far as the app.
const SETUP_COMMANDS = new Set([
  "applyConfigurationCommand",
  "defineVariablesCommand",
  "launchAppCommand",
  "stopAppCommand",
  "clearStateCommand",
  "clearKeychainCommand",
  "setPermissionsCommand",
]);
const APP_FAILURE_KINDS = new Set(["crash", "redbox"]);

/** The testcases of a Maestro JUnit report with the flow file each came from. */
export function junitCases(xml, label = "junit.xml") {
  const { cases } = parseJUnit(xml, label);
  const files = [...xml.matchAll(/<testcase\b((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g)].map((m) => {
    const f = /\bfile="([^"]*)"/.exec(m[1]);
    return f ? f[1] : null;
  });
  return cases.map((c, i) => ({ ...c, file: files[i] ?? null }));
}

/** True when the flow's first command is `launchApp` with `clearState: true`. */
export function startsClean(flowText) {
  const parts = flowText.split(/^---\s*$/m);
  const body = parts.length > 1 ? parts.slice(1).join("---") : parts[0];
  const lines = body.split("\n").filter((l) => l.trim() && !/^\s*#/.test(l));
  if (!lines.length || !/^-\s+launchApp:\s*$/.test(lines[0])) return false;
  for (const l of lines.slice(1)) {
    if (/^-\s/.test(l)) break;
    if (/^\s+clearState:\s*true\s*$/.test(l)) return true;
  }
  return false;
}

/**
 * The completed command names in Maestro's `commands-(<flow>).json` for this flow, or
 * null when no such file exists. Maestro names the file after the flow file or its
 * `name:`; both are tried.
 */
export function completedCommands(outputsDir, flowName, flowFile) {
  if (!outputsDir || !fs.existsSync(outputsDir)) return null;
  const wanted = [flowName, flowFile ? path.basename(flowFile).replace(/\.ya?ml$/, "") : null].filter(Boolean);
  const found = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/^commands-.*\.json$/.test(e.name) && wanted.some((w) => e.name === `commands-(${w.replace(/\//g, "_")}).json`)) found.push(p);
    }
  };
  walk(outputsDir);
  if (!found.length) return null;
  const done = [];
  for (const f of found.sort()) {
    let entries;
    try {
      entries = JSON.parse(fs.readFileSync(f, "utf8"));
    } catch {
      continue;
    }
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      if (e?.metadata?.status !== "COMPLETED" || !e.command || typeof e.command !== "object") continue;
      done.push(...Object.keys(e.command));
    }
  }
  return done;
}

/** One failed flow's decision: { retry, reason }. */
export function classify({ testCase, flowText, completed, appFailures, maxSeconds = MAX_SECONDS }) {
  const message = String(testCase.message ?? "").split("\n")[0].trim();
  if (testCase.status !== "fail") return { retry: false, reason: "did not fail" };
  // An assertion or lookup failure quotes screen text; that text must never qualify.
  if (ASSERTION_MESSAGE.test(message) || !INFRA_MESSAGE.test(message)) return { retry: false, reason: "not an infrastructure failure" };
  const seconds = testCase.durationMs / 1000;
  if (seconds > maxSeconds) return { retry: false, reason: `ran ${seconds.toFixed(1)} s, long enough to reach the app` };
  // Fail closed: without Maestro's command log (missing, or named differently than the
  // lookup expects) there is no proof that no app step ran.
  if (completed == null) return { retry: false, reason: "no Maestro command log for the flow, so app steps cannot be ruled out" };
  const appSteps = completed.filter((c) => !SETUP_COMMANDS.has(c));
  if (appSteps.length) return { retry: false, reason: `completed app steps (${appSteps.slice(0, 3).join(", ")})` };
  if (flowText == null) return { retry: false, reason: "flow file not found" };
  if (!startsClean(flowText)) return { retry: false, reason: "does not start from a clean install" };
  if (appFailures.length) return { retry: false, reason: `the device log shows an app ${appFailures[0].kind} in this pass` };
  return {
    retry: true,
    reason: `"${message}" after ${seconds.toFixed(1)} s with no app step completed and no app crash in the log`,
  };
}

/** App crashes and red boxes in the logcat text (the scan's own rules). */
export function appFailuresIn(logText) {
  return scanAndroid(logText).findings.filter((f) => APP_FAILURE_KINDS.has(f.kind));
}

export function decide({ junitXml, junitLabel, theme, logText, outputsDir, readFlow = (f) => fs.readFileSync(f, "utf8") }) {
  const appFailures = appFailuresIn(logText);
  return junitCases(junitXml, junitLabel)
    .filter((c) => c.status === "fail")
    .map((c) => {
      let flowText = null;
      if (c.file) {
        try {
          flowText = readFlow(c.file);
        } catch {
          flowText = null;
        }
      }
      const completed = completedCommands(outputsDir, c.name, c.file);
      const { retry, reason } = classify({ testCase: c, flowText, completed, appFailures });
      return { theme, flow: c.name, file: c.file, message: c.message.split("\n")[0].slice(0, 300), retry, reason };
    });
}

function parseArgs(argv) {
  const args = { logFrom: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === "--junit") args.junit = v();
    else if (a === "--theme") args.theme = v();
    else if (a === "--log") args.log = v();
    else if (a === "--log-from") args.logFrom = Number(v()) || 0;
    else if (a === "--out") args.out = v();
    else if (a === "--outputs") args.outputs = v();
    else throw new Error(`unknown argument ${a}`);
  }
  if (!args.junit || !args.theme || !args.out) throw new Error("--junit, --theme and --out are required");
  return args;
}

export function main(argv) {
  const args = parseArgs(argv);
  if (!fs.existsSync(args.junit)) return 0;
  let logText = "";
  if (args.log && fs.existsSync(args.log)) logText = fs.readFileSync(args.log).subarray(args.logFrom).toString("utf8");
  const decisions = decide({
    junitXml: fs.readFileSync(args.junit, "utf8"),
    junitLabel: path.basename(args.junit),
    theme: args.theme,
    logText,
    outputsDir: args.outputs,
  });
  const previous = fs.existsSync(args.out) ? JSON.parse(fs.readFileSync(args.out, "utf8")) : [];
  fs.writeFileSync(args.out, `${JSON.stringify([...previous, ...decisions], null, 2)}\n`);
  for (const d of decisions) {
    process.stderr.write(`infra-retry: ${d.theme} · ${d.flow}: ${d.retry ? "RETRY" : "no retry"} (${d.reason})\n`);
    if (d.retry) process.stdout.write(`${d.file}\n`);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`infra-retry: ${err.message}`);
    process.exitCode = 2;
  }
}
