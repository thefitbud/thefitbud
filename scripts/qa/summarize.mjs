#!/usr/bin/env node
// Builds the `qa-report` artifact: summary.json (schema: report.schema.json, version 1),
// screenshots/<suite>/<name>.png and redacted copies of the raw reports and logs.
// Node built-ins only. Exit 0 even when tests failed (status lives in summary.json),
// 2 when an input report is malformed or the arguments are wrong. summary.json is
// written before exiting 2, so the artifact upload still has something to carry.
//
// Input layout (QT7 arranges it):
//   <in>/<suite>/junit.xml          suite = mobile | ios | web | api | unit
//   <in>/<suite>/**/*.png           screenshots (Maestro output dir, Playwright)
//   <in>/<suite>/results.json       optional raw JSON report (copied)
//   <in>/logs/*.log                 logs; logs/logcat.log (Android) and
//                                   logs/ios-sim.log (iOS simulator) are scanned
//                                   for app crashes
//
// Usage: node scripts/qa/summarize.mjs --in qa-results --out qa-report
//   [--expect mobile,ios,web,api,unit] [--frames <file.md|file.json|file.ts>]...
//   [--frame-dir docs/design/mockups/png] [--environment staging|local]
//   [--trigger nightly|pr|manual] [--run-id ..] [--run-url ..] [--sha ..] [--branch ..]
//   [--started-at ISO] [--finished-at ISO]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// `mobile` is the Android Maestro suite and `ios` the iOS simulator one (CU19).
// They run the same flows on different platforms, so they are separate suites
// rather than one: a flow that passes on Android and fails on iOS is the whole
// point of the ios job, and merging them would hide it.
export const SUITES = ["mobile", "ios", "web", "api", "unit"];

/** The Maestro suites, which carry device logs, screenshots and crash detection. */
const FLOW_SUITES = new Set(["mobile", "ios"]);

/** Which device log belongs to which Maestro suite. */
const DEVICE_LOGS = { mobile: "logcat.log", ios: "ios-sim.log" };
const MAX_MESSAGE = 500;
const APP_PACKAGE = "com.thefitbud.mobile";

export class MalformedInput extends Error {}

// ---------- redaction ----------

// A credential value this long is replaced wherever it appears: no ordinary word runs
// that long by accident, so there is nothing to protect it from.
const REDACT_ANYWHERE_MIN = 8;

const DIGIT = /[0-9]/;
const ALPHA = /[A-Za-z]/;
const ALNUM = /[A-Za-z0-9]/;

/**
 * Does the character next to an occurrence continue the kind of token the secret's own
 * edge character belongs to?
 *
 * The test reads the characters actually present in the text and never uses `\b`, because
 * `\b` anchors on the *secret's* edges: a value that starts or ends with `-`, `_`, `=`,
 * `+`, `/` or `.` (base64 padding, a JWT segment, a flag-shaped value) would anchor in
 * the opposite place from the one intended. For the same reason the scan below is a plain
 * `indexOf`, so a value made of regex metacharacters needs no escaping.
 *
 * - a digit edge is continued only by a digit, so a 6-digit OTP stays redacted next to
 *   letters, quotes, `=`, `:`, `_` or `/` and is left alone only inside a longer number;
 * - a letter edge is continued by any letter or digit, which is what stops a short value
 *   from garbling an ordinary word;
 * - a non-alphanumeric edge is never continued, so that edge is always a boundary.
 *
 * Be exact about what that last point does and does not buy, because `replaceOnBoundaries`
 * ORs the two edge tests: a short value is redacted *everywhere* only when **both** its
 * first and its last character are non-alphanumeric. With punctuation on one side only the
 * alphanumeric side can still be continued, and the occurrence is then left alone: `-ab`
 * inside `x-abz`, `ab=` inside `xab=y`, `b64==` inside `xb64==y` and `a.c*` inside `xa.c*y`
 * all stay intact. That is the behaviour CU9 specifies (a short value is replaced on token
 * boundaries, never inside a longer word) and `summarize.test.mjs` pins it — but do not
 * read this rule as "punctuation makes a short secret safe anywhere". The unconditional
 * guarantees are exactly two: 8+ characters, or both edges non-alphanumeric.
 */
function extendsToken(edge, neighbour) {
  if (neighbour === "") return false;
  if (DIGIT.test(edge)) return DIGIT.test(neighbour);
  if (ALPHA.test(edge)) return ALNUM.test(neighbour);
  return false;
}

/**
 * Replaces the token-boundary occurrences of `secret`; leaves the ones inside a longer
 * token. An occurrence counts as inside a longer token when *either* edge is continued
 * (see `extendsToken` for what one-sided punctuation does and does not guarantee).
 *
 * The scan does not overlap: after an occurrence is kept, it resumes past the whole match,
 * so a boundary-clean occurrence starting inside a kept one is skipped. That is reachable
 * only for a self-overlapping secret (one whose own prefix is also its suffix) and carries
 * no practical exposure, but it is a deliberate simplification rather than an oversight.
 */
function replaceOnBoundaries(text, secret) {
  const first = secret[0];
  const last = secret[secret.length - 1];
  let out = "";
  let from = 0;
  for (let i = text.indexOf(secret, from); i !== -1; i = text.indexOf(secret, from)) {
    const end = i + secret.length;
    const inWord =
      extendsToken(first, i > 0 ? text[i - 1] : "") || extendsToken(last, end < text.length ? text[end] : "");
    out += inWord ? text.slice(from, end) : `${text.slice(from, i)}[redacted]`;
    from = end;
  }
  return out + text.slice(from);
}

export function makeRedactor(env = process.env) {
  // The three named in the spec, plus any env var that looks like a credential
  // (CLOUDFLARE_API_TOKEN, a future *_SECRET, ...).
  const names = Object.keys(env).filter((k) => k === "QA_TEST_OTP_CODE" || /(TOKEN|SECRET|PASSWORD|KEY)$/.test(k));
  const secrets = [...new Set(names.map((k) => env[k]))]
    .filter((v) => typeof v === "string" && v.length >= 3)
    .sort((a, b) => b.length - a.length);
  return (text) => {
    let out = String(text);
    // Long values anywhere; short ones only on token boundaries, so a 3-7 character test
    // value cannot garble an ordinary word in a failure message (QT8 review follow-up).
    for (const s of secrets) {
      out = s.length >= REDACT_ANYWHERE_MIN ? out.split(s).join("[redacted]") : replaceOnBoundaries(out, s);
    }
    // Any email except the QA accounts.
    out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) =>
      /^qa\+[a-z0-9-]{1,32}@thefitbud\.com$/.test(m) ? m : "[redacted]",
    );
    // NAME=<20+ token-like chars> (wrangler / shell output), and well-known key shapes.
    out = out.replace(/\b([A-Z][A-Z0-9_]{2,})=[A-Za-z0-9_\-./+=]{20,}/g, "$1=[redacted]");
    out = out.replace(/\b(?:[sr]k|pk)_(?:live|test)_[A-Za-z0-9]{8,}|\bgh[pousr]_[A-Za-z0-9]{20,}/g, "[redacted]");
    out = out.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]");
    out = out.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, "[redacted]");
    // A 6-digit code written next to the words otp/code, even when the env var is not set.
    out = out.replace(/((?:otp|code)\W{0,12})\d{6}\b/gi, "$1[redacted]");
    return out;
  };
}

// ---------- JUnit ----------

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseAttrs(src) {
  const attrs = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(src))) attrs[m[1]] = decodeEntities(m[3] ?? m[4] ?? "");
  return attrs;
}

function textOf(inner) {
  const cdata = [...inner.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)].map((m) => m[1]).join("\n");
  const rest = decodeEntities(inner.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "").replace(/<[^>]*>/g, ""));
  return [rest.trim(), cdata.trim()].filter(Boolean).join("\n");
}

const ATTR_BODY = `((?:[^>"']|"[^"]*"|'[^']*')*?)`;

/** Parses a JUnit report. Throws MalformedInput for anything truncated or not JUnit. */
export function parseJUnit(xml, label = "junit.xml") {
  const body = xml.replace(/<\?xml[\s\S]*?\?>/, "").replace(/<!--[\s\S]*?-->/g, "").trim();
  if (!body) throw new MalformedInput(`${label}: empty file`);
  if (!/^<testsuites?[\s>/]/.test(body)) throw new MalformedInput(`${label}: root element is not testsuite(s)`);
  const selfClosingRoot = new RegExp(`^<testsuites?\\b${ATTR_BODY}/>$`).test(body);
  if (!selfClosingRoot && !/<\/testsuites?>$/.test(body)) {
    throw new MalformedInput(`${label}: truncated (no closing testsuite tag), the run was probably killed`);
  }
  const opens = (body.match(/<testcase\b/g) ?? []).length;
  const cases = [];
  const re = new RegExp(`<testcase\\b${ATTR_BODY}(?:/>|>([\\s\\S]*?)</testcase>)`, "g");
  let m;
  while ((m = re.exec(body))) {
    const attrs = parseAttrs(m[1]);
    const inner = m[2] ?? "";
    const seconds = Number.parseFloat(attrs.time ?? "0");
    const c = {
      name: attrs.name ?? "(unnamed)",
      classname: attrs.classname ?? "",
      durationMs: Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0,
      status: "pass",
      message: "",
    };
    const bad = new RegExp(`<(failure|error)\\b${ATTR_BODY}(?:/>|>([\\s\\S]*?)</\\1>)`).exec(inner);
    if (bad) {
      c.status = "fail";
      c.message = parseAttrs(bad[2]).message || textOf(bad[3] ?? "") || `(${bad[1]} with no message)`;
    } else if (/<skipped\b/.test(inner)) {
      c.status = "skipped";
    }
    cases.push(c);
  }
  if (cases.length !== opens) throw new MalformedInput(`${label}: ${opens} testcase tags but ${cases.length} parsed`);
  // Suite headers that declare more tests than the file holds mean a cut-off report.
  let declared = 0;
  for (const h of body.matchAll(new RegExp(`<testsuite\\b${ATTR_BODY}>`, "g"))) {
    declared += Number.parseInt(parseAttrs(h[1]).tests ?? "0", 10) || 0;
  }
  if (declared > cases.length) throw new MalformedInput(`${label}: declares ${declared} tests but contains ${cases.length}`);
  const timestamps = [...body.matchAll(/<testsuite\b[^>]*\btimestamp="([^"]+)"/g)]
    .map((t) => Date.parse(t[1]))
    .filter(Number.isFinite);
  return { cases, firstTimestamp: timestamps.length ? Math.min(...timestamps) : null };
}

// ---------- crash detection ----------

const CRASH_PATTERNS = [
  ["redbox", /Invalid accessibility role value|Render Error|Error while updating property|Unhandled JS Exception|Invariant Violation|LogBox|red ?box/i],
  ["load-error", /There was a problem loading the project|Unable to load script|Something went wrong|Could not connect to development server/i],
  ["anr", /\bANR\b|Application Not Responding|isn't responding/i],
  ["fatal", /FATAL EXCEPTION|has stopped|keeps stopping|process (?:has )?died|crashed/i],
];

/** Classifies a failed Maestro flow as a crash, or returns null for an ordinary failure. */
export function classifyCrash(message) {
  for (const [kind, re] of CRASH_PATTERNS) if (re.test(message)) return kind;
  // assert-no-crash failed but its text is not one we know: still a crash, kind unknown.
  if (/assert-no-crash/i.test(message)) return "fatal";
  return null;
}

/** Finds crashes of the app process in a logcat dump. */
export function scanLogcat(text, redact) {
  const lines = text.split(/\r?\n/);
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/FATAL EXCEPTION/.test(line)) {
      const window = lines.slice(i, i + 6).join("\n");
      if (window.includes(APP_PACKAGE)) found.push({ kind: "fatal", evidence: window });
    } else if (/ANR in /.test(line) && line.includes(APP_PACKAGE)) {
      found.push({ kind: "anr", evidence: line });
    }
  }
  return found.map((f) => ({ kind: f.kind, evidence: redact(f.evidence).slice(0, MAX_MESSAGE) }));
}

// The iOS simulator's unified log, filtered to the app process by
// scripts/qa/run-maestro-ios.sh, so every line already belongs to the app and
// there is no package name to match on (the Android scan needs one because logcat
// is system-wide).
//
// `RangeError` earns its own pattern and is the reason this scan exists: the CU17
// class of bug is a Hermes Intl rejection ("Incorrect timeZone information
// provided", D-W3b-11a) that surfaces as a RangeError and a red box. A flow can
// still pass over it — the screen renders an error state and a later assertion may
// be satisfied — so a crash in the log fails the suite on its own.
const IOS_LOG_PATTERNS = [
  ["redbox", /Invalid accessibility role value|Render Error|Error while updating property|Unhandled JS Exception|Invariant Violation|LogBox|RCTRedBox/],
  ["fatal", /\bRangeError\b|Incorrect timeZone information provided|Unhandled JS Exception|facebook::hermes|Fatal error|SIGABRT|EXC_BAD_ACCESS|Terminating app due to uncaught exception/],
  ["load-error", /There was a problem loading the project|Unable to load script|Could not connect to development server/],
];

/** Finds crashes of the app process in an iOS simulator log stream. */
export function scanIosLog(text, redact) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const [kind, re] of IOS_LOG_PATTERNS) {
      if (!re.test(lines[i])) continue;
      const window = lines.slice(i, i + 4).join("\n");
      out.push({ kind, evidence: redact(window).slice(0, MAX_MESSAGE) });
      break;
    }
  }
  return out;
}

// ---------- frames mapping ----------

/**
 * Reads screenshot -> frame pairs out of the README tables / config comment blocks that
 * QT3 and QT5 maintain. A line maps when it holds one `<name>__<step>` token and one
 * `*.png` token without `__` (the frame).
 */
export function parseFrameMap(text) {
  const map = new Map();
  if (text.trimStart().startsWith("{")) {
    for (const [k, v] of Object.entries(JSON.parse(text))) map.set(k.replace(/\.png$/, ""), v);
    return map;
  }
  for (const line of text.split(/\r?\n/)) {
    const names = [...line.matchAll(/[A-Za-z0-9][\w-]*__[\w-]+/g)].map((m) => m[0]);
    const frames = [...line.matchAll(/[A-Za-z0-9][\w.-]*\.png/g)]
      .map((m) => m[0])
      .filter((f) => !f.includes("__"));
    if (names.length === 1 && frames.length === 1) map.set(names[0], frames[0]);
  }
  return map;
}

// ---------- helpers ----------

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out.sort();
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

function copyRedacted(src, dest, redact) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, redact(fs.readFileSync(src, "utf8")));
}

// ---------- the builder ----------

export function buildSummary(opts) {
  const {
    inDir,
    outDir,
    expect = SUITES,
    frameMap = new Map(),
    frameDir = null,
    meta = {},
    redact = makeRedactor(),
  } = opts;
  const warnings = [];
  const files = [];
  const malformed = [];
  const screenshots = [];
  const crashes = [];
  const apiDurations = [];
  const timestamps = [];
  fs.mkdirSync(outDir, { recursive: true });

  const logsDir = path.join(inDir, "logs");
  const logFiles = walk(logsDir).filter((f) => /\.(log|txt)$/.test(f));
  for (const f of logFiles) {
    const rel = path.posix.join("logs", path.relative(logsDir, f).split(path.sep).join("/"));
    copyRedacted(f, path.join(outDir, rel), redact);
    files.push(rel);
  }

  const suites = SUITES.map((name) => {
    const requested = expect.includes(name);
    const dir = path.join(inDir, name);
    const all = walk(dir);
    const suite = {
      name, status: "not-run", reason: null, total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0, failures: [],
    };
    const finishEmpty = () => {
      suite.status = requested ? "not-run" : "not-requested";
      suite.reason = requested ? `no results found in ${name}/` : "not part of this run";
      return suite;
    };
    if (!all.length) return finishEmpty();

    // Screenshots and raw files are copied even if the report turns out unusable.
    const suiteShots = [];
    const used = new Set();
    for (const f of all.filter((p) => p.toLowerCase().endsWith(".png"))) {
      const base = path.basename(f, path.extname(f));
      let shot = /^(test-failed|test-finished|screenshot)/.test(base) ? `${path.basename(path.dirname(f))}__${base}` : base;
      shot = shot.replace(/[^\w.\-❌]+/gu, "_");
      let unique = shot;
      for (let n = 2; used.has(unique); n++) unique = `${shot}-${n}`;
      used.add(unique);
      const rel = `screenshots/${name}/${unique}.png`;
      fs.mkdirSync(path.join(outDir, path.dirname(rel)), { recursive: true });
      fs.copyFileSync(f, path.join(outDir, rel));
      const frame = frameMap.get(unique) ?? null;
      if (frame && frameDir && !fs.existsSync(path.join(frameDir, frame))) {
        warnings.push(`${name}/${unique}: mapped frame ${frame} not found in ${frameDir}`);
      }
      const entry = { suite: name, name: unique, path: rel, frame };
      suiteShots.push(entry);
      screenshots.push(entry);
    }
    for (const f of all.filter((p) => /(junit\.xml|results\.json)$/.test(p))) {
      const rel = `raw/${name}/${path.relative(dir, f).split(path.sep).join("/")}`;
      copyRedacted(f, path.join(outDir, rel), redact);
      files.push(rel);
    }

    const junitPath = path.join(dir, "junit.xml");
    if (!fs.existsSync(junitPath)) {
      suite.status = "error";
      suite.reason = `no junit.xml, runner probably died before writing results (${suiteShots.length} screenshots found)`;
      return suite;
    }
    let parsed;
    try {
      parsed = parseJUnit(fs.readFileSync(junitPath, "utf8"), `${name}/junit.xml`);
    } catch (err) {
      if (!(err instanceof MalformedInput)) throw err;
      malformed.push(err.message);
      suite.status = "error";
      suite.reason = err.message;
      return suite;
    }
    if (parsed.firstTimestamp) timestamps.push(parsed.firstTimestamp);
    const suiteLog = logFiles.some((l) => path.basename(l) === `${name}.log`) ? `logs/${name}.log` : null;
    const deviceLogName = DEVICE_LOGS[name];
    const deviceLog =
      deviceLogName && logFiles.some((l) => path.basename(l) === deviceLogName) ? `logs/${deviceLogName}` : null;

    for (const c of parsed.cases) {
      suite.total++;
      suite.durationMs += c.durationMs;
      if (name === "api") apiDurations.push(c.durationMs);
      if (c.status === "pass") suite.passed++;
      else if (c.status === "skipped") suite.skipped++;
      else {
        suite.failed++;
        const test = !FLOW_SUITES.has(name) && c.classname ? `${c.classname} > ${c.name}` : c.name;
        const message = redact(c.message).slice(0, MAX_MESSAGE);
        const failure = { test, message };
        const key = c.name.toLowerCase();
        const shot = suiteShots.find((s) => s.name.toLowerCase().includes(key) || s.name.toLowerCase().startsWith(`${key}__`));
        if (shot) failure.screenshot = shot.path;
        const log = deviceLog ?? suiteLog;
        if (log) failure.log = log;
        suite.failures.push(failure);
        if (FLOW_SUITES.has(name)) {
          const kind = classifyCrash(c.message);
          if (kind) crashes.push({ suite: name, flow: c.name, kind, evidence: message });
        }
      }
    }
    suite.passed = suite.total - suite.failed - suite.skipped;
    if (suite.total === 0) {
      suite.status = "error";
      suite.reason = "junit.xml holds zero tests";
    } else if (suite.failed > 0) {
      suite.status = "fail";
    } else if (suite.passed === 0) {
      suite.status = "error";
      suite.reason = "every test was skipped";
    } else {
      suite.status = "pass";
    }
    return suite;
  });

  // App crashes in the device log count against their own Maestro suite even when
  // every flow passed. Each suite is scanned from its own log and attributed to
  // itself: an Android crash must not fail the ios suite, or the one difference the
  // ios job exists to surface would be unreadable.
  const scanners = { mobile: scanLogcat, ios: scanIosLog };
  for (const name of FLOW_SUITES) {
    const file = logFiles.find((l) => path.basename(l) === DEVICE_LOGS[name]);
    if (!file) continue;
    for (const c of scanners[name](fs.readFileSync(file, "utf8"), redact)) {
      crashes.push({ suite: name, flow: "unknown", kind: c.kind, evidence: c.evidence });
    }
  }
  for (const name of FLOW_SUITES) {
    const s = suites.find((x) => x.name === name);
    if (s.status === "pass" && crashes.some((c) => c.suite === name)) {
      s.status = "fail";
      s.reason = "the app crashed during the run (see crashes)";
    }
  }

  const hasBad = crashes.length > 0 || suites.some((s) => s.status === "fail" || s.status === "error");
  const hasMissing = suites.some((s) => expect.includes(s.name) && s.status === "not-run");
  const status = hasBad ? "fail" : hasMissing ? "partial" : "pass";

  const sortedApi = [...apiDurations].sort((a, b) => a - b);
  const latency = sortedApi.length ? { p50Ms: percentile(sortedApi, 50), p95Ms: percentile(sortedApi, 95) } : null;

  for (const s of screenshots.filter((x) => FLOW_SUITES.has(x.suite) || x.suite === "web")) {
    if (!s.frame && /__/.test(s.name)) warnings.push(`${s.suite}/${s.name}: no frame mapping`);
  }

  const finishedMs = meta.finishedAt ? Date.parse(meta.finishedAt) : Date.now();
  const startedMs = meta.startedAt ? Date.parse(meta.startedAt) : timestamps.length ? Math.min(...timestamps) : finishedMs;
  const summary = {
    schemaVersion: 1,
    runId: meta.runId ?? `local-${Math.floor(finishedMs / 1000)}`,
    runUrl: meta.runUrl ?? null,
    gitSha: meta.gitSha ?? "unknown",
    branch: meta.branch ?? "unknown",
    trigger: meta.trigger ?? "manual",
    startedAt: iso(Math.min(startedMs, finishedMs)),
    finishedAt: iso(finishedMs),
    environment: meta.environment ?? "staging",
    status,
    expectedSuites: SUITES.filter((s) => expect.includes(s)),
    suites,
    screenshots,
    crashes,
    latency,
    files: files.sort(),
    warnings,
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return { summary, malformed };
}

// ---------- CLI ----------

function parseArgs(argv) {
  const args = { frames: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument ${a}`);
    const key = a.slice(2);
    const val = argv[++i];
    if (val === undefined) throw new Error(`${a} needs a value`);
    if (key === "frames") args.frames.push(val);
    else args[key] = val;
  }
  return args;
}

export function main(argv, env = process.env) {
  let args;
  try {
    args = parseArgs(argv);
    if (!args.in || !args.out) throw new Error("--in and --out are required");
  } catch (err) {
    console.error(`summarize: ${err.message}`);
    return 2;
  }
  const expect = (args.expect ?? SUITES.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  const bad = expect.filter((s) => !SUITES.includes(s));
  if (bad.length || !expect.length) {
    console.error(`summarize: --expect must list suites from ${SUITES.join(", ")}`);
    return 2;
  }
  const frameMap = new Map();
  for (const f of args.frames) {
    try {
      for (const [k, v] of parseFrameMap(fs.readFileSync(f, "utf8"))) frameMap.set(k, v);
    } catch (err) {
      console.error(`summarize: cannot read frame map ${f}: ${err.message}`);
      return 2;
    }
  }
  const event = env.GITHUB_EVENT_NAME;
  const trigger = args.trigger ?? (event === "schedule" ? "nightly" : event === "pull_request" ? "pr" : "manual");
  const meta = {
    runId: args["run-id"] ?? env.GITHUB_RUN_ID,
    runUrl: args["run-url"] ?? (env.GITHUB_RUN_ID && env.GITHUB_REPOSITORY
      ? `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : undefined),
    gitSha: args.sha ?? env.GITHUB_SHA,
    branch: args.branch ?? env.GITHUB_HEAD_REF ?? env.GITHUB_REF_NAME,
    trigger,
    environment: args.environment ?? env.QA_ENVIRONMENT,
    startedAt: args["started-at"] ?? env.QA_STARTED_AT,
    finishedAt: args["finished-at"],
  };
  for (const k of Object.keys(meta)) if (!meta[k]) delete meta[k];
  if (!["staging", "local", undefined].includes(meta.environment) || !["nightly", "pr", "manual"].includes(trigger)) {
    console.error("summarize: invalid --environment or --trigger");
    return 2;
  }
  const { summary, malformed } = buildSummary({
    inDir: args.in,
    outDir: args.out,
    expect,
    frameMap,
    frameDir: args["frame-dir"] ?? null,
    meta,
    redact: makeRedactor(env),
  });
  for (const m of malformed) console.error(`summarize: malformed input: ${m}`);
  const line = summary.suites.map((s) => `${s.name}=${s.status}`).join(" ");
  console.log(`summarize: ${summary.status} (${line}), ${summary.crashes.length} crashes, ${summary.screenshots.length} screenshots -> ${path.join(args.out, "summary.json")}`);
  return malformed.length ? 2 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
