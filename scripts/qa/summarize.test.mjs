// Run with: node --test scripts/qa/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildSummary, classifyCrash, iosLogProvesCapture, main, makeRedactor, parseFrameMap, parseJUnit, scanIosLog, MalformedInput, SUITES } from "./summarize.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "fixtures");
const schema = JSON.parse(fs.readFileSync(path.join(here, "report.schema.json"), "utf8"));
const FAKE_ENV = { QA_TEST_OTP_CODE: "482913", FITBUD_QA_PASSWORD: "dummy-not-a-real-password", EXPO_TOKEN: "expo-dummy-token" };
// The scenarios written before the ios suite existed (CU19) hold no ios/ directory,
// so they expect the four original suites. Leaving them on the default would make
// every one of them `partial` for a suite they were never about, and the ios
// behaviour is covered by its own fixtures under fixtures/ios/ instead.
const LEGACY_SUITES = SUITES.filter((n) => n !== "ios");
const META = { runId: "9876543210", gitSha: "7bd0f3a", branch: "main", trigger: "nightly", startedAt: "2026-11-03T20:30:00Z", finishedAt: "2026-11-03T21:10:00Z" };

// ---- a small hand-written JSON Schema validator (no dependency) ----
function validate(value, sch, root = schema, at = "$") {
  const errs = [];
  if (sch.$ref) return validate(value, sch.$ref.split("/").slice(1).reduce((o, k) => o[k], root), root, at);
  if (sch.oneOf) {
    const ok = sch.oneOf.some((s) => validate(value, s, root, at).length === 0);
    return ok ? [] : [`${at}: matches none of oneOf`];
  }
  if ("const" in sch && value !== sch.const) errs.push(`${at}: expected ${sch.const}`);
  if (sch.enum && !sch.enum.includes(value)) errs.push(`${at}: ${JSON.stringify(value)} not in enum`);
  if (sch.type) {
    const types = [].concat(sch.type);
    const actual = value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value;
    const ok = types.some((t) => t === actual || (t === "number" && typeof value === "number"));
    if (!ok) return [...errs, `${at}: expected ${types.join("|")}, got ${actual}`];
  }
  if (typeof value === "string") {
    if (sch.pattern && !new RegExp(sch.pattern).test(value)) errs.push(`${at}: does not match ${sch.pattern}`);
    if (sch.minLength !== undefined && value.length < sch.minLength) errs.push(`${at}: too short`);
    if (sch.maxLength !== undefined && value.length > sch.maxLength) errs.push(`${at}: too long (${value.length})`);
  }
  if (typeof value === "number" && sch.minimum !== undefined && value < sch.minimum) errs.push(`${at}: below minimum`);
  if (Array.isArray(value) && sch.items) value.forEach((v, i) => errs.push(...validate(v, sch.items, root, `${at}[${i}]`)));
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const k of sch.required ?? []) if (!(k in value)) errs.push(`${at}: missing ${k}`);
    for (const [k, v] of Object.entries(value)) {
      if (sch.properties?.[k]) errs.push(...validate(v, sch.properties[k], root, `${at}.${k}`));
      else if (sch.additionalProperties === false) errs.push(`${at}: unexpected property ${k}`);
    }
  }
  return errs;
}

function run(scenario, extra = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "qa-report-"));
  const frames = parseFrameMap(fs.readFileSync(path.join(fixtures, "frames.md"), "utf8"));
  const res = buildSummary({
    inDir: path.join(fixtures, scenario),
    outDir: out,
    frameMap: frames,
    expect: LEGACY_SUITES,
    meta: META,
    redact: makeRedactor(FAKE_ENV),
    ...extra,
  });
  const onDisk = JSON.parse(fs.readFileSync(path.join(out, "summary.json"), "utf8"));
  assert.deepEqual(validate(onDisk, schema), [], `${scenario}: summary.json must validate`);
  return { ...res, out, summary: onDisk };
}
const suite = (s, name) => s.suites.find((x) => x.name === name);

test("the validator itself rejects bad documents", () => {
  const { summary } = run("all-pass");
  assert.notDeepEqual(validate({ ...summary, status: "ok" }, schema), []);
  assert.notDeepEqual(validate({ ...summary, schemaVersion: 2 }, schema), []);
  assert.notDeepEqual(validate({ ...summary, extra: 1 }, schema), []);
  const { runId: _omit, ...noRun } = summary;
  assert.notDeepEqual(validate(noRun, schema), []);
});

test("all pass: pass, every suite in order, screenshots copied with frames", () => {
  const { summary, out } = run("all-pass");
  assert.equal(summary.schemaVersion, 1);
  assert.equal(summary.status, "pass");
  assert.deepEqual(summary.suites.map((s) => s.name), SUITES);
  const expected = summary.suites.filter((s) => LEGACY_SUITES.includes(s.name));
  assert.ok(expected.every((s) => s.status === "pass" && s.failed === 0 && s.reason === null));
  assert.equal(suite(summary, "ios").status, "not-requested");
  assert.equal(suite(summary, "mobile").total, 4);
  assert.equal(suite(summary, "mobile").durationMs, 157600);
  assert.deepEqual(summary.crashes, []);
  assert.deepEqual(summary.latency, { p50Ms: 310, p95Ms: 520 });
  assert.equal(summary.startedAt, "2026-11-03T20:30:00Z");
  const today = summary.screenshots.find((s) => s.name === "trainee-today__loaded");
  assert.deepEqual(today, { suite: "mobile", name: "trainee-today__loaded", path: "screenshots/mobile/trainee-today__loaded.png", frame: "04-trainee-today-android-v3-partial.png" });
  assert.ok(fs.existsSync(path.join(out, today.path)));
  assert.equal(summary.screenshots.find((s) => s.name === "web-signin__form").frame, "01-trainer-web-signin.png");
  assert.ok(summary.files.includes("raw/mobile/junit.xml") && summary.files.includes("logs/logcat.log"));
});

test("one failure per suite: fail, each failure carries test, message, log", () => {
  const { summary } = run("one-failure-per-suite");
  assert.equal(summary.status, "fail");
  for (const n of LEGACY_SUITES) {
    const s = suite(summary, n);
    assert.equal(s.status, "fail", n);
    assert.equal(s.failed, 1, n);
    assert.equal(s.passed, s.total - 1, n);
    assert.equal(s.failures.length, 1, n);
  }
  assert.equal(suite(summary, "mobile").failures[0].test, "trainee-workout-log");
  assert.equal(suite(summary, "mobile").failures[0].log, "logs/logcat.log");
  assert.equal(suite(summary, "web").failures[0].test, "e2e-staging/clients.spec.ts > clients list loads");
  assert.equal(suite(summary, "api").failures[0].log, "logs/api.log");
  assert.deepEqual(summary.crashes, [], "an ordinary assertion failure is not a crash");
});

test("mobile crash is detected from assert-no-crash failure text", () => {
  const { summary } = run("mobile-crash");
  assert.equal(summary.status, "fail");
  assert.equal(summary.crashes.length, 1);
  assert.equal(summary.crashes[0].suite, "mobile");
  assert.equal(summary.crashes[0].flow, "trainee-workout-log");
  assert.equal(summary.crashes[0].kind, "redbox");
  assert.match(summary.crashes[0].evidence, /Invalid accessibility role value/);
  assert.equal(suite(summary, "mobile").failures[0].screenshot, "screenshots/mobile/trainee-workout-log__crashed.png");
});

test("assert-no-crash failing with unknown text is still a crash", () => {
  const { summary } = run("mobile-crash-unrecognised-text");
  assert.equal(summary.crashes[0].kind, "fatal");
  assert.equal(summary.crashes[0].flow, "trainer-home");
  assert.equal(classifyCrash('Assertion is false: "There was a problem loading the project" is not visible'), "load-error");
  assert.equal(classifyCrash("Application Not Responding"), "anr");
  assert.equal(classifyCrash('Element not found: "Save"'), null);
});

test("a crash in logcat fails the suite even when every flow passed", () => {
  const { summary } = run("logcat-crash");
  assert.equal(suite(summary, "mobile").failed, 0);
  assert.equal(suite(summary, "mobile").status, "fail");
  assert.equal(summary.status, "fail");
  assert.equal(summary.crashes[0].kind, "fatal");
  assert.equal(summary.crashes[0].flow, "unknown");
  assert.match(summary.crashes[0].evidence, /com\.thefitbud\.mobile\.staging/);
});

test("missing suites are not-run and the run is partial, never pass", () => {
  const { summary } = run("missing-suite");
  assert.equal(summary.status, "partial");
  assert.equal(suite(summary, "web").status, "not-run");
  assert.equal(suite(summary, "unit").status, "not-run");
  assert.match(suite(summary, "unit").reason, /no results/);
  assert.equal(suite(summary, "mobile").status, "pass");
  for (const n of ["web", "unit"]) assert.equal(suite(summary, n).total, 0);
});

test("a failing suite plus a missing suite is fail, not partial", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "qa-report-"));
  const inDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-in-"));
  fs.cpSync(path.join(fixtures, "one-failure-per-suite", "api"), path.join(inDir, "api"), { recursive: true });
  const { summary } = buildSummary({ inDir, outDir: out, meta: META, redact: makeRedactor({}) });
  assert.equal(summary.status, "fail");
});

test("nothing at all is partial with every suite not-run, never pass", () => {
  const inDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-empty-"));
  const { summary } = buildSummary({ inDir, outDir: fs.mkdtempSync(path.join(os.tmpdir(), "qa-report-")), meta: META, redact: makeRedactor({}) });
  assert.equal(summary.status, "partial");
  assert.deepEqual(summary.suites.map((s) => s.status), SUITES.map(() => "not-run"));
  assert.deepEqual(validate(summary, schema), []);
});

test("a PR smoke run that expects only mobile passes, other suites are not-requested", () => {
  const { summary } = run("missing-suite", { expect: ["mobile"] });
  assert.equal(summary.status, "pass");
  assert.deepEqual(summary.expectedSuites, ["mobile"]);
  assert.equal(suite(summary, "web").status, "not-requested");
  // ...but expecting mobile does not hide a missing mobile suite.
  const inDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-empty-"));
  const r = buildSummary({ inDir, outDir: fs.mkdtempSync(path.join(os.tmpdir(), "qa-report-")), expect: ["mobile"], meta: META, redact: makeRedactor({}) });
  assert.equal(r.summary.status, "partial");
});

test("a mobile run killed before junit.xml was written is error, not pass and not not-run", () => {
  const { summary, out } = run("killed-mobile");
  assert.equal(suite(summary, "mobile").status, "error");
  assert.match(suite(summary, "mobile").reason, /no junit\.xml.*1 screenshots/);
  assert.equal(summary.status, "fail");
  assert.ok(fs.existsSync(path.join(out, "screenshots/mobile/trainee-today__loaded.png")), "evidence is still collected");
});

test("truncated and non-JUnit reports are error, flagged malformed, never pass", () => {
  for (const sc of ["truncated-junit", "not-junit"]) {
    const { summary, malformed } = run(sc);
    const bad = summary.suites.find((s) => s.status === "error");
    assert.ok(bad, sc);
    assert.equal(malformed.length, 1, sc);
    assert.equal(summary.status, "fail", sc);
  }
  assert.throws(() => parseJUnit(""), MalformedInput);
  assert.throws(() => parseJUnit("<testsuite name='x' tests='3'><testcase name='a'/></testsuite>"), /declares 3 tests/);
});

test("zero tests and all-skipped suites are error, not pass", () => {
  assert.equal(suite(run("zero-tests").summary, "unit").status, "error");
  const skipped = suite(run("all-skipped").summary, "unit");
  assert.equal(skipped.status, "error");
  assert.equal(skipped.skipped, 2);
  assert.equal(run("zero-tests").summary.status, "fail");
});

test("secrets and personal data are redacted in messages, evidence and copied files", () => {
  const { summary, out } = run("secret-in-message");
  const msg = suite(summary, "mobile").failures[0].message;
  assert.ok(!msg.includes("482913") && !msg.includes("dummy-not-a-real-password") && !msg.includes("trainee@gmail.com"), msg);
  assert.ok(!msg.includes("abc123.def456"), msg);
  assert.match(msg, /qa\+trainer@thefitbud\.com/, "QA account addresses stay readable");
  assert.ok(msg.length <= 500);
  const all = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".png") || all.push(fs.readFileSync(path.join(d, e.name), "utf8"))));
  walk(out);
  const blob = all.join("\n");
  for (const secret of [...Object.values(FAKE_ENV), "trainee@gmail.com"]) assert.ok(!blob.includes(secret), `${secret} leaked into the artifact`);
  assert.equal(makeRedactor({})("OTP 123456 for a@b.co"), "OTP [redacted] for [redacted]");
});

test("messages are cut to 500 characters after redaction", () => {
  const long = `${"x".repeat(498)}${FAKE_ENV.QA_TEST_OTP_CODE}`;
  const redacted = makeRedactor(FAKE_ENV)(long).slice(0, 500);
  assert.ok(!redacted.includes("482"), "a secret split by the cut must not leak its prefix");
});

test("frame map parses markdown tables, config comments and JSON", () => {
  const m = parseFrameMap(fs.readFileSync(path.join(fixtures, "frames.md"), "utf8"));
  assert.equal(m.get("web-clients__list"), "136-trainer-web-clients-web.png");
  assert.equal(m.size, 5);
  assert.equal(parseFrameMap('{"a__b.png":"c.png"}').get("a__b"), "c.png");
});

test("mapping to a frame that does not exist warns", () => {
  const { summary } = run("all-pass", { frameDir: path.join(here, "..", "..", "docs", "design", "mockups", "png") });
  assert.ok(summary.warnings.some((w) => w.includes("99-does-not-exist.png")));
  assert.ok(!summary.warnings.some((w) => w.includes("04-trainee-today")));
});

test("CLI: exit 0 with failures, 2 for malformed input and bad usage", () => {
  const cli = path.join(here, "summarize.mjs");
  const go = (sc, ...extra) => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "qa-cli-"));
    const r = spawnSync("node", [cli, "--in", path.join(fixtures, sc), "--out", out, ...extra], { encoding: "utf8", env: { ...process.env, ...FAKE_ENV } });
    return { ...r, out };
  };
  const failing = go("one-failure-per-suite");
  assert.equal(failing.status, 0, failing.stderr);
  // The default --expect covers every suite including ios, so a run that did not
  // produce ios results says so instead of quietly leaving it out (CU19).
  assert.match(failing.stdout, /^summarize: fail \(mobile=fail ios=not-run web=fail api=fail unit=fail\)/);
  const bad = go("truncated-junit");
  assert.equal(bad.status, 2);
  assert.ok(fs.existsSync(path.join(bad.out, "summary.json")), "summary.json is still written when exiting 2");
  assert.equal(JSON.parse(fs.readFileSync(path.join(bad.out, "summary.json"), "utf8")).status, "fail");
  assert.equal(go("all-pass", "--expect", "bogus").status, 2);
  assert.equal(spawnSync("node", [cli], { encoding: "utf8" }).status, 2);
  assert.equal(go("all-pass", "--frames", "/nonexistent/frames.md").status, 2);
  assert.equal(main(["--in", "x"], {}), 2);
});

test("CLI takes run metadata from the GitHub Actions environment", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "qa-cli-"));
  const env = { ...process.env, GITHUB_RUN_ID: "123", GITHUB_REPOSITORY: "thefitbud/thefitbud", GITHUB_SERVER_URL: "https://github.com", GITHUB_SHA: "7bd0f3a1c2", GITHUB_REF_NAME: "main", GITHUB_EVENT_NAME: "schedule" };
  const r = spawnSync("node", [path.join(here, "summarize.mjs"), "--in", path.join(fixtures, "all-pass"), "--out", out], { encoding: "utf8", env });
  assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(fs.readFileSync(path.join(out, "summary.json"), "utf8"));
  assert.equal(s.trigger, "nightly");
  assert.equal(s.runUrl, "https://github.com/thefitbud/thefitbud/actions/runs/123");
  assert.equal(s.gitSha, "7bd0f3a1c2");
  assert.deepEqual(validate(s, schema), []);
});

test("truncation is caught even when no tests attribute exists to cross-check", () => {
  const cut = '<testsuites><testsuite name="mobile"><testcase name="a" time="1"/><testcase name="b" time="1">';
  assert.throws(() => parseJUnit(cut), /truncated/);
  assert.throws(() => parseJUnit('<testsuite name="x"><testcase name="a" time="1"/>'), /truncated/);
});

test("credential-looking env vars and key shapes are redacted, QA addresses stay", () => {
  const redact = makeRedactor({ CLOUDFLARE_API_TOKEN: "cfut_abcdef0123456789", SOME_SECRET: "s3cr3t-value", HOME: "/root" });
  const out = redact("auth cfut_abcdef0123456789 and s3cr3t-value; CF_THING=abcdefghij0123456789xyz key sk_live_abcdef123456 for qa+trainer@thefitbud.com in /root");
  assert.ok(!/cfut_|s3cr3t|abcdefghij|sk_live/.test(out), out);
  assert.match(out, /qa\+trainer@thefitbud\.com in \/root/);
});

test("short credential values are redacted on token boundaries only; long ones anywhere", () => {
  const redact = makeRedactor({
    SOME_SECRET: "s3cr3t", // 6 characters: boundary rule
    QA_TEST_OTP_CODE: "482913",
    FITBUD_QA_PASSWORD: "dummy-not-a-real-password", // 8+: everywhere
  });
  // A short value inside a longer word is left alone, so failure messages stay readable.
  assert.equal(redact("unders3cr3tive wording"), "unders3cr3tive wording");
  assert.equal(redact("s3cr3ts3cr3t"), "s3cr3ts3cr3t");
  // The same value standing on its own, or bounded by punctuation, is redacted.
  assert.equal(redact("value s3cr3t here"), "value [redacted] here");
  assert.equal(redact('{"password":"s3cr3t"}'), '{"password":"[redacted]"}');
  assert.equal(redact("https://x.test/?t=s3cr3t&u=1"), "https://x.test/?t=[redacted]&u=1");
  assert.equal(redact("header token:s3cr3t"), "header token:[redacted]");
  // An 8+ value is replaced even in the middle of a word.
  assert.equal(redact("saw dummy-not-a-real-passwordish once"), "saw [redacted]ish once");
  // The 6-digit OTP stays redacted wherever it is a standalone number: a digit edge is
  // only continued by another digit, never by a letter, quote, `=`, `:`, `_` or `/`.
  for (const [input, want] of [
    ["482913", "[redacted]"],
    ["sms 482913 arrived", "sms [redacted] arrived"],
    ['"482913"', '"[redacted]"'],
    ["id=482913", "id=[redacted]"],
    ["OTP_482913", "OTP_[redacted]"],
    ["ref/482913.json", "ref/[redacted].json"],
    ["x482913y", "x[redacted]y"],
  ]) {
    assert.equal(redact(input), want, input);
  }
  // Inside a longer number it is not a standalone number, so it is left alone.
  assert.equal(redact("1482913"), "1482913");
});

test("a short value with BOTH edges non-alphanumeric is redacted everywhere", () => {
  // `\b` would anchor on the value's own edges and miss these; the boundary test looks at
  // the surrounding text instead, and the scan is indexOf, so nothing needs escaping.
  const redact = makeRedactor({ FLAG_TOKEN: "-ab-", META_SECRET: "*a.c*", PAD_KEY: "=b64==" });
  assert.equal(redact("q-ab-r"), "q[redacted]r");
  assert.equal(redact("x*a.c*y"), "x[redacted]y");
  assert.equal(redact("v=b64==y"), "v[redacted]y");
  // A metacharacter value must not be interpreted as a pattern: this text does not hold it.
  assert.equal(redact("abc and axc"), "abc and axc");
});

test("a short value with punctuation on ONE edge only is still left alone inside a token", () => {
  // The two edge tests are ORed, so one-sided punctuation does NOT make a short value
  // redacted everywhere: the alphanumeric edge can still be continued. This is CU9's
  // specced limit (a short value is "replaced only on token boundaries"), pinned here so
  // the real boundary is documented by a test rather than by prose, and so nobody widens
  // it by accident without a decision.
  for (const [secret, text] of [
    ["-ab", "x-abz"],
    ["ab-", "xab-z"],
    ["ab=", "xab=y"],
    ["_ab", "x_aby"],
    ["b64==", "xb64==y"],
    ["a.c*", "xa.c*y"],
    ["eyJ-_a", "xeyJ-_ay"], // JWT-shaped but 6 characters; a real JWT is 8+ and replaced anywhere
  ]) {
    assert.equal(makeRedactor({ A_SECRET: secret })(text), text, `${secret} in ${text}`);
    // ...while the same value on a boundary is redacted, so this is a token rule, not a miss.
    assert.equal(makeRedactor({ A_SECRET: secret })(`saw ${secret} here`), "saw [redacted] here", secret);
  }
});

// ---- the ios suite (CU19) ----
//
// The ios job runs the same Maestro flows as `android` on an iOS simulator, so the
// four cases that matter are the ones the acceptance criteria name: a pass, a fail,
// a run that did not happen at all, and a crash in the simulator log while every
// flow passed. The last is the CU17 class of bug: a Hermes Intl rejection red-boxes
// a screen without necessarily failing an assertion.

const iosFixture = (scenario) => path.join(fixtures, "ios", scenario);

function runIos(scenario, extra = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "qa-report-ios-"));
  const res = buildSummary({
    inDir: iosFixture(scenario),
    outDir: out,
    expect: ["ios"],
    meta: META,
    redact: makeRedactor(FAKE_ENV),
    ...extra,
  });
  const onDisk = JSON.parse(fs.readFileSync(path.join(out, "summary.json"), "utf8"));
  assert.deepEqual(validate(onDisk, schema), [], `ios/${scenario}: summary.json must validate`);
  return { ...res, out, summary: onDisk };
}

test("ios pass: the suite reports its own status and the simulator log is copied", () => {
  const { summary } = runIos("pass");
  assert.equal(summary.status, "pass");
  const s = suite(summary, "ios");
  assert.equal(s.status, "pass");
  assert.equal(s.total, 4);
  assert.equal(s.passed, 4);
  assert.equal(s.durationMs, 188400);
  assert.deepEqual(summary.crashes, []);
  assert.deepEqual(summary.expectedSuites, ["ios"]);
  assert.ok(summary.files.includes("logs/ios-sim.log"));
  assert.ok(summary.files.includes("raw/ios/junit.xml"));
  // The Android suite is a separate suite, not a shared one.
  assert.equal(suite(summary, "mobile").status, "not-requested");
});

test("ios fail: a failed flow fails the ios suite and carries the simulator log", () => {
  const { summary } = runIos("fail");
  assert.equal(summary.status, "fail");
  const s = suite(summary, "ios");
  assert.equal(s.status, "fail");
  assert.equal(s.failed, 1);
  assert.equal(s.passed, 3);
  // A Maestro flow name is used as-is, like the mobile suite's, not "classname > name".
  assert.equal(s.failures[0].test, "trainer-attention");
  assert.equal(s.failures[0].log, "logs/ios-sim.log");
  assert.deepEqual(summary.crashes, [], "an ordinary assertion failure is not a crash");
});

test("ios not-run: an expected ios suite with no results is partial, never a silent pass", () => {
  // The whole point of adding ios to --expect: a run that asked for it and produced
  // nothing must not report pass.
  const { summary } = buildSummary({
    inDir: path.join(fixtures, "all-pass"),
    outDir: fs.mkdtempSync(path.join(os.tmpdir(), "qa-report-ios-")),
    expect: SUITES,
    meta: META,
    redact: makeRedactor(FAKE_ENV),
  });
  assert.equal(suite(summary, "ios").status, "not-run");
  assert.match(suite(summary, "ios").reason, /no results found in ios\//);
  assert.equal(summary.status, "partial");
  // ...and a run that did not ask for it reports not-requested and can still pass.
  const { summary: legacy } = buildSummary({
    inDir: path.join(fixtures, "all-pass"),
    outDir: fs.mkdtempSync(path.join(os.tmpdir(), "qa-report-ios-")),
    expect: LEGACY_SUITES,
    meta: META,
    redact: makeRedactor(FAKE_ENV),
  });
  assert.equal(suite(legacy, "ios").status, "not-requested");
  assert.equal(legacy.status, "pass");
});

test("a Hermes RangeError in the simulator log fails ios even when every flow passed", () => {
  const { summary } = runIos("crash-in-log");
  assert.equal(suite(summary, "ios").failed, 0, "every flow passed");
  assert.equal(suite(summary, "ios").status, "fail");
  assert.match(suite(summary, "ios").reason, /crashed/);
  assert.equal(summary.status, "fail");
  assert.equal(summary.crashes.length, 1);
  assert.equal(summary.crashes[0].suite, "ios");
  assert.equal(summary.crashes[0].flow, "unknown");
  assert.equal(summary.crashes[0].kind, "fatal");
  assert.match(summary.crashes[0].evidence, /Incorrect timeZone information provided/);
});

test("the ios log scan reads red boxes and load errors, and ignores ordinary lines", () => {
  const redact = makeRedactor({});
  assert.deepEqual(scanIosLog('Df FitBudStaging: today loaded\nDf FitBudStaging: 3 cards', redact), []);
  assert.equal(scanIosLog("Er FitBudStaging: Render Error: Text strings must be rendered", redact)[0].kind, "redbox");
  assert.equal(scanIosLog("Er FitBudStaging: Unable to load script", redact)[0].kind, "load-error");
  assert.equal(scanIosLog("Er FitBudStaging: RangeError: bad zone", redact)[0].kind, "fatal");
});

test("an Android crash is never attributed to the ios suite, or the other way round", () => {
  const inDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-in-both-"));
  fs.cpSync(path.join(fixtures, "logcat-crash", "mobile"), path.join(inDir, "mobile"), { recursive: true });
  fs.cpSync(path.join(fixtures, "logcat-crash", "logs"), path.join(inDir, "logs"), { recursive: true });
  fs.cpSync(path.join(iosFixture("pass"), "ios"), path.join(inDir, "ios"), { recursive: true });
  fs.cpSync(path.join(iosFixture("pass"), "logs"), path.join(inDir, "logs"), { recursive: true });
  const { summary } = buildSummary({
    inDir,
    outDir: fs.mkdtempSync(path.join(os.tmpdir(), "qa-report-ios-")),
    expect: ["mobile", "ios"],
    meta: META,
    redact: makeRedactor(FAKE_ENV),
  });
  assert.equal(suite(summary, "mobile").status, "fail", "the Android crash fails Android");
  assert.equal(suite(summary, "ios").status, "pass", "and leaves iOS alone");
  assert.deepEqual(summary.crashes.map((c) => c.suite), ["mobile"]);
});

// The crash scan is only worth anything if it had something to scan. The iOS log
// is a backgrounded `log stream` whose --predicate can silently match no process,
// and a scan over an empty file finds no crashes -- which is indistinguishable
// from "no crash". That is precisely the CU17 bug class this job exists to catch,
// so an ios `pass` with an uncaptured log must not be a pass.

test("ios pass with an uncaptured simulator log is error, never a silent pass", () => {
  const { summary } = runIos("log-not-captured");
  const s = suite(summary, "ios");
  assert.equal(s.failed, 0, "every flow passed");
  assert.notEqual(s.status, "pass", "a pass here would ship the bug the scan exists to catch");
  assert.equal(s.status, "error");
  assert.match(s.reason, /holds none of the app's own output/);
  assert.match(s.reason, /proved nothing/);
  assert.equal(summary.status, "fail");
  assert.ok(
    summary.warnings.some((w) => w.includes("ios-sim.log") && w.includes("no app output")),
    `expected a warning naming the log, got ${JSON.stringify(summary.warnings)}`,
  );
});

test("ios pass with no simulator log at all is error too", () => {
  const inDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-in-nolog-"));
  fs.cpSync(path.join(iosFixture("pass"), "ios"), path.join(inDir, "ios"), { recursive: true });
  const { summary } = buildSummary({
    inDir,
    outDir: fs.mkdtempSync(path.join(os.tmpdir(), "qa-report-ios-")),
    expect: ["ios"],
    meta: META,
    redact: makeRedactor(FAKE_ENV),
  });
  assert.equal(suite(summary, "ios").status, "error");
  assert.match(suite(summary, "ios").reason, /is missing/);
  assert.equal(summary.status, "fail");
});

test("the capture check cannot mask a real crash, and passes a captured log", () => {
  // crash-in-log holds the sentinel AND a RangeError: still fail, with the crash.
  const { summary } = runIos("crash-in-log");
  assert.equal(suite(summary, "ios").status, "fail");
  assert.equal(summary.crashes.length, 1);
  assert.match(summary.crashes[0].evidence, /Incorrect timeZone information provided/);
  // ...and a genuinely captured log still lets a clean run pass.
  assert.equal(suite(runIos("pass").summary, "ios").status, "pass");
  // The sentinel itself: RN's bundle-start line is the proof of capture.
  assert.equal(iosLogProvesCapture(''), false);
  assert.equal(iosLogProvesCapture('log: Invalid predicate: process == "X"'), false);
  assert.equal(iosLogProvesCapture('Df FitBudStaging: today loaded'), false);
  assert.equal(iosLogProvesCapture('Df FitBudStaging: Running "main"'), true);
});
