#!/usr/bin/env node
// Device-log scan for the W12 device gate (Z12-35, prompt §2 Z12-35 step 6 and §3 item 2).
//
//   node scripts/qa/device/scan-logs.mjs --platform android|ios --out <scan.json> <log> [<log> ...]
//
// THE RUN FAILS ON ANY of these in the app's device log:
//   crash          FATAL EXCEPTION for the app, ANR in the app, a native tombstone
//                  (">>> com.thefitbud.mobile..."), an iOS crash report (.ips), or one
//                  of the nightly scan's iOS crash patterns (RangeError, SIGABRT, ...)
//   redbox         a red box / LogBox / Render Error / Invariant Violation line
//   js-error       JS console.error (Android: E ReactNativeJS; iOS: "[fitbud-gate] js.error")
//   js-warn        JS console.warn  (Android: W ReactNativeJS; iOS: "[fitbud-gate] js.warn")
//   rn-error       React Native native-side error (Android: E ReactNative; iOS: native.error)
//   rn-warn        React Native native-side warning, which LogBox shows in a dev build
//                  (Android: W ReactNative; iOS: "[fitbud-gate] native.warn")
//   react-warning  "Requiring unknown module", "Encountered two children", "Each child in
//                  a list", "VirtualizedLists should never be nested", "Possible unhandled
//                  promise" anywhere in the app's output
//   capture-empty  the log never shows `Running "main"`, so the app's output was not
//                  captured and the scan proved nothing
// The "[fitbud-gate]" iOS markers come from the AppDelegate patch in patch-native.sh: a
// Release build otherwise drops warnings and writes no level next to a JS line.
//
// Allow-list: scripts/qa/device/allowlist.json, an array of
//   { "pattern": "<regex>", "platform": "ios"|"android"|"both", "reason": "<why>" }.
// A match moves the finding to `allowed` (still reported, not failing). An entry
// without a written reason (at least 20 characters) is refused and fails the scan.
// It ships empty: nothing is allowed without a reason in the PR (prompt §2 Z12-35).
//
// Exit 0 when nothing failed, 1 on findings, 2 on bad input. Node built-ins only.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanIosLog, scanLogcat } from "../summarize.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export const APP_ID_PREFIX = "com.thefitbud.mobile";
export const SENTINEL = /Running "main"/;
export const REACT_WARNINGS =
  /Requiring unknown module|Encountered two children|Each child in a list|VirtualizedLists should never be nested|Possible unhandled promise/;
const REDBOX = /RCTRedBox|\bLogBox\b|Render Error|Invariant Violation|Unhandled JS Exception|Invalid accessibility role value|Error while updating property/;
const MAX_TEXT = 400;
const MAX_FINDINGS = 300;

// `MM-DD HH:MM:SS.mmm  PID  TID L TAG: message` (adb logcat -v threadtime)
const LOGCAT_LINE = /^\d\d-\d\d \d\d:\d\d:\d\d\.\d+\s+\d+\s+\d+\s+([VDIWEFA])\s+(.+?)\s*: (.*)$/;
// `[fitbud-gate] js.warn <message>` (patch-native.sh)
const GATE_MARKER = /\[fitbud-gate\] (js|native)\.(warn|error) ?(.*)$/;
// Compact `log stream`: `2026-11-14 10:00:00.123 E  App[1:2] [com.facebook.react.log:javascript] msg`
const IOS_RN_JS_ERROR = /^\S+ \S+\s+(?:E|F)\s+.*\[com\.facebook\.react\.log:javascript\]/;

function clip(text) {
  return String(text).replace(/\s+$/, "").slice(0, MAX_TEXT);
}

/** Scans one logcat dump (threadtime). Returns { findings, sentinel }. */
export function scanAndroid(text, file = "logcat.log") {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    const at = { file, line: i + 1 };
    if (line.includes(`>>> ${APP_ID_PREFIX}`)) {
      findings.push({ kind: "crash", ...at, text: clip(line) });
      return;
    }
    const m = LOGCAT_LINE.exec(line);
    if (!m) return;
    const [, level, tag, message] = m;
    const rnTag = tag === "ReactNativeJS" || tag === "ReactNative";
    if (!rnTag) return;
    if (REACT_WARNINGS.test(message)) {
      findings.push({ kind: "react-warning", ...at, text: clip(line) });
    } else if (REDBOX.test(message) && (level === "E" || level === "F")) {
      findings.push({ kind: "redbox", ...at, text: clip(line) });
    } else if (tag === "ReactNativeJS" && (level === "E" || level === "F" || level === "A")) {
      findings.push({ kind: "js-error", ...at, text: clip(line) });
    } else if (tag === "ReactNativeJS" && level === "W") {
      findings.push({ kind: "js-warn", ...at, text: clip(line) });
    } else if (tag === "ReactNative" && (level === "E" || level === "F" || level === "A")) {
      findings.push({ kind: "rn-error", ...at, text: clip(line) });
    } else if (tag === "ReactNative" && level === "W") {
      findings.push({ kind: "rn-warn", ...at, text: clip(line) });
    }
  });
  // The nightly scan's crash detection (FATAL EXCEPTION window naming the app, ANR in
  // the app), reused as is.
  for (const c of scanLogcat(text, (s) => s)) {
    findings.push({ kind: "crash", file, line: 0, text: clip(c.evidence) });
  }
  return { findings, sentinel: SENTINEL.test(text) };
}

/** Scans one iOS simulator log stream (compact, app process only). */
export function scanIos(text, file = "ios.log") {
  const findings = [];
  const lines = text.split(/\r?\n/);
  const hasMarkers = lines.some((l) => GATE_MARKER.test(l));
  lines.forEach((line, i) => {
    const at = { file, line: i + 1 };
    const g = GATE_MARKER.exec(line);
    if (g) {
      const [, origin, level, message] = g;
      if (REACT_WARNINGS.test(message)) findings.push({ kind: "react-warning", ...at, text: clip(line) });
      else if (REDBOX.test(message) && level === "error") findings.push({ kind: "redbox", ...at, text: clip(line) });
      else findings.push({ kind: `${origin === "js" ? "js" : "rn"}-${level}`, ...at, text: clip(line) });
      return;
    }
    if (REACT_WARNINGS.test(line)) {
      findings.push({ kind: "react-warning", ...at, text: clip(line) });
      return;
    }
    // The nightly iOS crash patterns, one line at a time so each finding has a line.
    const crash = scanIosLog(line, (s) => s)[0];
    if (crash) {
      findings.push({ kind: crash.kind === "redbox" ? "redbox" : "crash", ...at, text: clip(line) });
      return;
    }
    // Without the AppDelegate patch a JS error still reaches the log at error level.
    if (!hasMarkers && IOS_RN_JS_ERROR.test(line)) {
      findings.push({ kind: "js-error", ...at, text: clip(line) });
    }
  });
  return { findings, sentinel: SENTINEL.test(text) };
}

/** Reads and validates the allow-list. Throws on an entry without a written reason. */
export function loadAllowlist(entries) {
  if (!Array.isArray(entries)) throw new Error("the allow-list must be a JSON array");
  return entries.map((e, i) => {
    if (!e || typeof e.pattern !== "string" || !e.pattern) throw new Error(`allow-list entry ${i} has no pattern`);
    if (typeof e.reason !== "string" || e.reason.trim().length < 20) {
      throw new Error(`allow-list entry ${i} (${e.pattern}) has no written reason; nothing is allowed without one`);
    }
    const platform = e.platform ?? "both";
    if (!["ios", "android", "both"].includes(platform)) throw new Error(`allow-list entry ${i} has platform "${platform}"`);
    return { re: new RegExp(e.pattern), platform, reason: e.reason.trim(), pattern: e.pattern };
  });
}

/** Scans every file for one platform and applies the allow-list. */
export function scanFiles({ platform, files, allowlist = [] }) {
  const findings = [];
  let sentinel = false;
  const scanned = [];
  for (const f of files) {
    const base = path.basename(f);
    if (f.endsWith(".ips")) {
      findings.push({ kind: "crash", file: base, line: 0, text: `crash report ${base}` });
      continue;
    }
    const text = fs.readFileSync(f, "utf8");
    const r = platform === "android" ? scanAndroid(text, base) : scanIos(text, base);
    findings.push(...r.findings);
    sentinel ||= r.sentinel;
    scanned.push(base);
  }
  if (!sentinel) {
    findings.push({
      kind: "capture-empty",
      file: scanned.join(", ") || "(none)",
      line: 0,
      text: `no log shows Running "main": the app's output was not captured, so the scan proved nothing`,
    });
  }
  const failing = [];
  const allowed = [];
  for (const f of findings) {
    const rule = allowlist.find((a) => (a.platform === "both" || a.platform === platform) && a.re.test(f.text));
    if (rule && f.kind !== "capture-empty") allowed.push({ ...f, reason: rule.reason });
    else failing.push(f);
  }
  const counts = {};
  for (const f of failing) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
  return {
    platform,
    files: files.map((f) => path.basename(f)),
    sentinel,
    status: failing.length ? "fail" : "pass",
    counts,
    findings: failing.slice(0, MAX_FINDINGS),
    truncated: Math.max(0, failing.length - MAX_FINDINGS),
    allowed,
  };
}

/** A short Markdown block for the job summary. */
export function toMarkdown(result) {
  const lines = [`**Device log scan (${result.platform}):** ${result.status === "pass" ? "clean" : "FAILED"}`];
  const kinds = Object.entries(result.counts);
  if (kinds.length) lines.push("", kinds.map(([k, n]) => `${k}: ${n}`).join(" · "));
  if (result.findings.length) {
    lines.push("", "<details><summary>First findings</summary>", "", "```");
    for (const f of result.findings.slice(0, 25)) lines.push(`[${f.kind}] ${f.file}:${f.line} ${f.text}`);
    lines.push("```", "</details>");
  }
  if (result.allowed.length) lines.push("", `Allowed by allowlist.json: ${result.allowed.length}`);
  return lines.join("\n");
}

function parseArgs(argv) {
  const args = { files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--platform" || a === "--out" || a === "--allowlist" || a === "--markdown") args[a.slice(2)] = argv[++i];
    else if (a.startsWith("--")) throw new Error(`unknown argument ${a}`);
    else args.files.push(a);
  }
  if (!["ios", "android"].includes(args.platform)) throw new Error("--platform must be ios or android");
  return args;
}

export function main(argv) {
  const args = parseArgs(argv);
  const allowPath = args.allowlist ?? path.join(here, "allowlist.json");
  const allowlist = loadAllowlist(JSON.parse(fs.readFileSync(allowPath, "utf8")));
  const files = args.files.filter((f) => fs.existsSync(f));
  const result = scanFiles({ platform: args.platform, files, allowlist });
  if (args.out) fs.writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`);
  if (args.markdown) fs.writeFileSync(args.markdown, `${toMarkdown(result)}\n`);
  const summary = Object.entries(result.counts).map(([k, n]) => `${k}=${n}`).join(" ") || "no findings";
  console.log(`scan-logs: ${args.platform} ${result.status} (${summary}; ${result.allowed.length} allowed)`);
  return result.status === "pass" ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`scan-logs: ${err.message}`);
    process.exitCode = 2;
  }
}
