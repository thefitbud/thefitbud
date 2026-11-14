// Z12-35 device gate harness. Run with: node --test scripts/qa/device/harness.test.mjs
// (the `device-harness-tests` job runs every scripts/qa test, this one included).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllowlist, scanAndroid, scanFiles, scanIos } from "./scan-logs.mjs";
import { centre, findElement, parseIdb, parseUiautomator } from "./find-element.mjs";
import { collect, targetFor } from "./collect-shots.mjs";
import { buildGateSummary, toMarkdown } from "./gate-summary.mjs";
import { androidData, buildRouting, iosPayload } from "./push-payload.mjs";
import { flowTags, globToRegExp, selectFlows } from "./select-flows.mjs";
import { pngLuma, summarise } from "./shot-luma.mjs";
import zlib from "node:zlib";
import { findHeadPipes, literalGrepsWithoutF, logicalLines } from "../shell-patterns.test.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "z12-35-"));
}

function write(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

// ---------- scan-logs ----------

const LOGCAT_CLEAN = [
  "11-14 10:00:00.000  1234  1250 I ReactNativeJS: Running \"main\" with {\"rootTag\":11}",
  "11-14 10:00:01.000  1234  1250 I ReactNativeJS: plain console.log is fine",
  "11-14 10:00:01.500   900   910 W ActivityManager: unrelated system warning",
].join("\n");

test("a clean logcat with the app's start line passes", () => {
  const { findings, sentinel } = scanAndroid(LOGCAT_CLEAN);
  assert.equal(sentinel, true);
  assert.deepEqual(findings, []);
});

test("logcat: console.warn, console.error, native RN errors, React warnings and crashes all fail", () => {
  const log = [
    LOGCAT_CLEAN,
    "11-14 10:00:02.000  1234  1250 W ReactNativeJS: a console.warn",
    "11-14 10:00:03.000  1234  1250 E ReactNativeJS: a console.error",
    "11-14 10:00:04.000  1234  1250 W ReactNativeJS: Warning: Each child in a list should have a unique \"key\" prop.",
    "11-14 10:00:05.000  1234  1251 E ReactNative: Exception in native call",
    "11-14 10:00:05.500  1234  1251 W ReactNative: native-side warning",
    "11-14 10:00:06.000  1234  1250 E ReactNativeJS: Invariant Violation: boom",
    "11-14 10:00:07.000  1234  1234 E AndroidRuntime: FATAL EXCEPTION: main",
    "11-14 10:00:07.000  1234  1234 E AndroidRuntime: Process: com.thefitbud.mobile.staging, PID: 1234",
    "11-14 10:00:08.000  2000  2000 F DEBUG   : pid: 1234, tid: 1234, name: mqt_js  >>> com.thefitbud.mobile.staging <<<",
  ].join("\n");
  const kinds = scanAndroid(log).findings.map((f) => f.kind).sort();
  assert.deepEqual(kinds, ["crash", "crash", "js-error", "js-warn", "react-warning", "redbox", "rn-error", "rn-warn"]);
});

test("ios: the [fitbud-gate] markers carry the level; React warnings and crash patterns fail", () => {
  const log = [
    "2026-11-14 10:00:00.000 Df FitBudStaging[1:2] [com.facebook.react.log:javascript] Running \"main\" with {}",
    "2026-11-14 10:00:01.000 Df FitBudStaging[1:2] [fitbud-gate] js.warn a console.warn",
    "2026-11-14 10:00:02.000 Df FitBudStaging[1:2] [fitbud-gate] js.error a console.error",
    "2026-11-14 10:00:03.000 Df FitBudStaging[1:2] [fitbud-gate] native.warn Sending `x` with no listeners registered.",
    "2026-11-14 10:00:04.000 Df FitBudStaging[1:2] [fitbud-gate] js.warn VirtualizedLists should never be nested inside plain ScrollViews",
    "2026-11-14 10:00:05.000 E  FitBudStaging[1:2] [com.facebook.react.log:javascript] a console.error (already marked above)",
    "2026-11-14 10:00:06.000 F  FitBudStaging[1:2] RangeError: Incorrect timeZone information provided",
  ].join("\n");
  const kinds = scanIos(log).findings.map((f) => f.kind).sort();
  // The unmarked error line is not double-counted once markers exist.
  assert.deepEqual(kinds, ["crash", "js-error", "js-warn", "react-warning", "rn-warn"]);
});

test("ios without the AppDelegate patch still fails on a JS error-level line", () => {
  const log = [
    "2026-11-14 10:00:00.000 Df FitBudStaging[1:2] [com.facebook.react.log:javascript] Running \"main\" with {}",
    "2026-11-14 10:00:05.000 E  FitBudStaging[1:2] [com.facebook.react.log:javascript] a console.error",
  ].join("\n");
  assert.deepEqual(scanIos(log).findings.map((f) => f.kind), ["js-error"]);
});

test("a log that never shows the app starting fails as capture-empty; a crash report fails as crash", () => {
  const dir = tmp();
  write(path.join(dir, "ios-device.log"), "2026-11-14 10:00:00.000 Df other[1:2] nothing from the app\n");
  write(path.join(dir, "ios-device.crash-1.ips"), "{}");
  const r = scanFiles({ platform: "ios", files: [path.join(dir, "ios-device.log"), path.join(dir, "ios-device.crash-1.ips")] });
  assert.equal(r.status, "fail");
  assert.deepEqual(Object.keys(r.counts).sort(), ["capture-empty", "crash"]);
});

test("the allow-list needs a written reason, and a match is reported, not failed", () => {
  assert.throws(() => loadAllowlist([{ pattern: "x" }]), /no written reason/);
  assert.throws(() => loadAllowlist([{ pattern: "x", reason: "because" }]), /no written reason/);
  assert.throws(() => loadAllowlist({}), /JSON array/);
  const allow = loadAllowlist([
    { pattern: "known emulator-only warning", platform: "android", reason: "Emulator image quirk, never on a phone: see PR #000" },
  ]);
  const dir = tmp();
  write(
    path.join(dir, "a.log"),
    `${LOGCAT_CLEAN}\n11-14 10:00:02.000  1234  1250 W ReactNativeJS: known emulator-only warning\n`,
  );
  const r = scanFiles({ platform: "android", files: [path.join(dir, "a.log")], allowlist: allow });
  assert.equal(r.status, "pass");
  assert.equal(r.allowed.length, 1);
  // The same entry does not apply to the other platform.
  const ios = scanFiles({ platform: "ios", files: [path.join(dir, "a.log")], allowlist: allow });
  assert.equal(ios.allowed.length, 0);
});

test("the committed allow-list is valid and empty", () => {
  const entries = JSON.parse(fs.readFileSync(path.join(here, "allowlist.json"), "utf8"));
  assert.deepEqual(loadAllowlist(entries), []);
});

test("scan-logs CLI exits 1 on findings and 0 on a clean log", () => {
  const dir = tmp();
  write(path.join(dir, "clean.log"), LOGCAT_CLEAN);
  write(path.join(dir, "bad.log"), `${LOGCAT_CLEAN}\n11-14 10:00:02.000  1234  1250 E ReactNativeJS: boom\n`);
  const run = (f) =>
    spawnSync("node", [path.join(here, "scan-logs.mjs"), "--platform", "android", "--out", path.join(dir, "s.json"), f], { encoding: "utf8" });
  assert.equal(run(path.join(dir, "clean.log")).status, 0);
  const bad = run(path.join(dir, "bad.log"));
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "s.json"), "utf8")).counts["js-error"], 1);
});

// ---------- find-element ----------

test("find-element reads an idb describe-all dump and returns the centre in points", () => {
  const dump = JSON.stringify([
    { AXLabel: "Lock screen", type: "Application", frame: { x: 0, y: 0, width: 393, height: 852 } },
    { AXLabel: "FitBud, Daily summary, now", type: "Button", frame: { x: 16, y: 400, width: 361, height: 80 } },
  ]);
  const el = findElement(parseIdb(dump), { match: "FitBud" });
  assert.deepEqual(centre(el), { x: 197, y: 440 });
  assert.equal(findElement(parseIdb(dump), { match: "FitBud", type: "Application" }), null);
});

test("find-element reads a uiautomator dump and skips zero-area nodes", () => {
  const xml = `<?xml version="1.0"?><hierarchy rotation="0">
    <node index="0" text="FitBud" class="android.widget.TextView" package="com.android.systemui" content-desc="" bounds="[0,0][0,0]" />
    <node index="1" text="" class="android.widget.FrameLayout" package="com.android.systemui" content-desc="FitBud notification: Daily summary" bounds="[40,900][1040,1100]" />
  </hierarchy>`;
  const el = findElement(parseUiautomator(xml), { match: "fitbud" });
  assert.deepEqual(centre(el), { x: 540, y: 1000 });
  assert.equal(el.package, "com.android.systemui");
});

// ---------- collect-shots ----------

test("screenshots named after a v3 screen ID get the gate's name; others go under flows/", () => {
  const ids = new Set(["TR-26e", "W-03b", "TM-01a"]);
  assert.equal(targetFor("/x/TR-26e.png", { ids, theme: "dark", platform: "ios" }).name, "TR-26e-dark-ios.png");
  assert.equal(targetFor("/x/TR-26e-custom-food.png", { ids, theme: "light", platform: "android" }).name, "TR-26e-light-android.png");
  assert.equal(targetFor("/x/today__card.png", { ids, theme: "light", platform: "ios" }).name, "flows/today__card-light-ios.png");
  assert.equal(targetFor("/x/TR-99z.png", { ids, theme: "light", platform: "ios" }).kind, "other");
  const from = tmp();
  const to = tmp();
  write(path.join(from, "a/TM-01a.png"), "png");
  write(path.join(from, "screenshot-❌-flow.png"), "png");
  const s = collect({ from, to, theme: "light", platform: "ios", ids });
  assert.deepEqual(s.screens, ["TM-01a-light-ios.png"]);
  assert.ok(fs.existsSync(path.join(to, "TM-01a-light-ios.png")));
  assert.equal(s.other.length, 1);
  assert.match(s.other[0], /^flows\/screenshot-.*flow-light-ios\.png$/);
});

// ---------- gate-summary ----------

const JUNIT_PASS = `<?xml version="1.0"?><testsuites><testsuite name="s" tests="2" failures="0">
<testcase id="a" name="Trainee Today" time="10"/><testcase id="b" name="Trainer Clients" time="9"/></testsuite></testsuites>`;
const JUNIT_FAIL = `<?xml version="1.0"?><testsuites><testsuite name="s" tests="2" failures="1">
<testcase id="a" name="Trainee Today" time="10"/><testcase id="b" name="Sign in with a code" time="9"><failure message="Assertion is false: Today's workout is visible"/></testcase></testsuite></testsuites>`;

function gateDir({ junit = { light: JUNIT_PASS, dark: JUNIT_PASS }, exit = { light: 0, dark: 0 }, scan = { status: "pass", counts: {}, findings: [], allowed: [] } } = {}) {
  const dir = tmp();
  for (const t of Object.keys(exit)) {
    if (junit[t]) write(path.join(dir, t, "junit.xml"), junit[t]);
    write(path.join(dir, t, "maestro-exit"), `${exit[t]}\n`);
  }
  if (scan) write(path.join(dir, "scan.json"), JSON.stringify(scan));
  write(path.join(dir, "flows.txt"), "/r/apps/mobile/.maestro/flows/trainee/today.yaml\n");
  write(path.join(dir, "extras/push.json"), JSON.stringify({ method: "simctl-push", note: "n" }));
  return dir;
}

test("the gate passes only when every theme's flows pass and the log is clean", () => {
  const s = buildGateSummary({ dir: gateDir(), platform: "ios" });
  assert.equal(s.status, "pass");
  assert.deepEqual(s.flows, ["flows/trainee/today.yaml"]);
  assert.match(toMarkdown(s), /Device gate · ios · PASS/);
  assert.match(toMarkdown(s), /push: simctl-push/);
});

test("a failed flow, a missing report, a non-zero exit or a dirty log fails the gate", () => {
  const failed = buildGateSummary({ dir: gateDir({ junit: { light: JUNIT_PASS, dark: JUNIT_FAIL }, exit: { light: 0, dark: 1 } }), platform: "android" });
  assert.equal(failed.status, "fail");
  assert.deepEqual(failed.reasons, ["dark: 1 of 2 flows failed"]);
  assert.match(toMarkdown(failed), /Sign in with a code: Assertion is false/);

  const missing = buildGateSummary({ dir: gateDir({ junit: { light: JUNIT_PASS }, exit: { light: 0, dark: 1 } }), platform: "android" });
  assert.match(missing.reasons.join(";"), /dark: no JUnit report/);

  const exited = buildGateSummary({ dir: gateDir({ exit: { light: 0, dark: 2 } }), platform: "android" });
  assert.deepEqual(exited.reasons, ["dark: Maestro exited 2"]);

  const dirty = buildGateSummary({
    dir: gateDir({ scan: { status: "fail", counts: { "js-warn": 3 }, findings: [{ kind: "js-warn", file: "f", line: 1, text: "w" }], allowed: [] } }),
    platform: "ios",
  });
  assert.deepEqual(dirty.reasons, ["device log: js-warn 3"]);

  const noScan = buildGateSummary({ dir: gateDir({ scan: null }), platform: "ios" });
  assert.deepEqual(noScan.reasons, ["no device-log scan"]);
});

test("flows run one at a time write one report each; a missing report fails the theme", () => {
  const dir = gateDir({ junit: {}, exit: { light: 0 } });
  write(path.join(dir, "flows.txt"), "a.yaml\nb.yaml\nc.yaml\n");
  write(path.join(dir, "light/junit-01.xml"), JUNIT_PASS);
  write(path.join(dir, "light/junit-02.xml"), JUNIT_FAIL);
  const s = buildGateSummary({ dir, platform: "android" });
  assert.equal(s.themes[0].total, 4);
  assert.equal(s.themes[0].failed, 1);
  assert.deepEqual(s.reasons, ["light: 1 of 3 flows wrote no JUnit report", "light: 1 of 4 flows failed"]);
});

test("run-gate runs device-offline flows one at a time, offline, and the Z12-33 check is tagged for it", () => {
  const gate = fs.readFileSync(path.join(here, "run-gate.sh"), "utf8");
  assert.match(gate, /is_offline_flow "\$flow"/);
  assert.match(gate, /network\.sh" "\$PLATFORM" offline/);
  assert.match(gate, /network\.sh" "\$PLATFORM" online/);
  const dirZ = path.join(repo, "apps/mobile/.maestro/device/z12-33");
  const files = fs.readdirSync(dirZ).sort();
  assert.deepEqual(files, ["1-two-trainers.yaml", "2-offline-priya.yaml", "3-rahul-again.yaml", "4-offline-rahul.yaml"]);
  const offline = files.filter((f) => flowTags(fs.readFileSync(path.join(dirZ, f), "utf8")).includes("device-offline"));
  assert.deepEqual(offline, ["2-offline-priya.yaml", "4-offline-rahul.yaml"]);
  const sel = selectFlows({ flows: "z12-33" }).map((f) => path.basename(f));
  assert.deepEqual(sel, files);
  // Only the first file starts from a clean install; the rest continue its state.
  for (const f of files.slice(1)) {
    assert.match(fs.readFileSync(path.join(dirZ, f), "utf8"), /- launchApp:\n {4}stopApp: false\n/, f);
  }
});

// ---------- push-payload ----------

const contractsBuilt = fs.existsSync(path.join(repo, "packages/contracts/dist/index.js"));

test("pushes carry the routing payload in Expo's envelope on both platforms", async () => {
  const built = await buildRouting({ type: "workout_reminder", now: new Date("2026-11-14T03:30:00.000Z") });
  assert.deepEqual(Object.keys(built.routing).sort(), ["createdAt", "domainEntityId", "domainEntityType", "notificationId", "notificationType"]);
  assert.equal(built.routing.domainEntityType, "workout_assignment");
  assert.equal(built.routing.createdAt, "2026-11-14T03:30:00.000Z");
  const ios = iosPayload(built);
  assert.equal(ios["Simulator Target Bundle"], "com.thefitbud.mobile.staging");
  assert.equal(ios.aps.alert.title, "FitBud");
  assert.deepEqual(ios.body, built.routing);
  const android = androidData(built);
  assert.deepEqual(JSON.parse(android.body), built.routing);
  assert.ok(Object.values(android).every((v) => typeof v === "string"), "FCM data values are strings");
});

test("push payloads are validated against the real contract", { skip: !contractsBuilt && "packages not built" }, async () => {
  const built = await buildRouting({ type: "daily_summary" });
  assert.equal(built.contract, "pushPayloadSchema");
  assert.equal(built.body, "Daily summary");
  await assert.rejects(buildRouting({ type: "not_a_type" }), /not a valid push payload: notificationType/);
});

// ---------- select-flows ----------

test("flow tags are read from block and inline headers", () => {
  assert.deepEqual(flowTags("appId: x\ntags:\n  - trainer\n  - smoke # PR runs\n---\n- launchApp\n"), ["trainer", "smoke"]);
  assert.deepEqual(flowTags("appId: x\ntags: [device, \"trainee\"]\n---\n"), ["device", "trainee"]);
  assert.deepEqual(flowTags("appId: x\n---\n- tags:\n  - nope\n"), []);
});

test("flows resolve by tag or glob, roles narrow them, and common/ is never selected", () => {
  const root = tmp();
  write(path.join(root, "config.yaml"), "flows:\n  - flows/**\n");
  write(path.join(root, "common/assert-no-crash.yaml"), "appId: x\n---\n");
  write(path.join(root, "flows/auth/a.yaml"), "appId: x\ntags:\n  - auth\n  - smoke\n  - trainee\n---\n");
  write(path.join(root, "flows/trainer/b.yaml"), "appId: x\ntags:\n  - trainer\n  - smoke\n---\n");
  write(path.join(root, "flows/v3/F08-custom-food.yaml"), "appId: x\ntags:\n  - device\n  - trainee\n---\n");
  const rel = (files) => files.map((f) => path.relative(root, f));
  assert.deepEqual(rel(selectFlows({ flows: "smoke", root })), ["flows/auth/a.yaml", "flows/trainer/b.yaml"]);
  assert.deepEqual(rel(selectFlows({ flows: "smoke", roles: "trainer", root })), ["flows/trainer/b.yaml"]);
  assert.deepEqual(rel(selectFlows({ flows: "flows/v3/F0*.yaml", root })), ["flows/v3/F08-custom-food.yaml"]);
  assert.deepEqual(rel(selectFlows({ flows: "**/*.yaml", root })), ["flows/auth/a.yaml", "flows/trainer/b.yaml", "flows/v3/F08-custom-food.yaml"]);
  assert.deepEqual(selectFlows({ flows: "nope", root }), []);
  assert.deepEqual(rel(selectFlows({ flows: "trainer, device", root })), ["flows/trainer/b.yaml", "flows/v3/F08-custom-food.yaml"], "a tag list is the union");
  assert.ok(globToRegExp("flows/*.yaml").test("flows/a.yaml"));
  assert.ok(!globToRegExp("flows/*.yaml").test("flows/x/a.yaml"));
});

test("the real smoke selection is the four smoke flows", () => {
  const files = selectFlows({ flows: "smoke" }).map((f) => path.relative(path.join(repo, "apps/mobile/.maestro"), f));
  assert.deepEqual(files, ["flows/auth/sign-in-code.yaml", "flows/auth/sign-in-password.yaml", "flows/trainee/today.yaml", "flows/trainer/clients.yaml"]);
});

// ---------- patch-native ----------

const APP_DELEGATE = `#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"main";
  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}
@end
`;

function patchNative(platform, dir, env = {}) {
  return spawnSync("bash", [path.join(here, "patch-native.sh"), platform, dir], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME, DEVICE_RESULTS: tmp(), ...env },
  });
}

test("patch-native (android) allows cleartext to the emulator's host only, idempotently", () => {
  const dir = tmp();
  const manifest = path.join(dir, "app/src/main/AndroidManifest.xml");
  write(manifest, '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n  <application android:name=".MainApplication">\n  </application>\n</manifest>\n');
  const r = patchNative("android", dir);
  assert.equal(r.status, 0, r.stderr);
  const once = fs.readFileSync(manifest, "utf8");
  assert.match(once, /<application android:networkSecurityConfig="@xml\/fitbud_device_gate_network" android:name/);
  const config = fs.readFileSync(path.join(dir, "app/src/main/res/xml/fitbud_device_gate_network.xml"), "utf8");
  assert.match(config, /<domain includeSubdomains="false">10\.0\.2\.2<\/domain>/);
  assert.doesNotMatch(config, /base-config/, "cleartext stays off for every other host");
  assert.equal(patchNative("android", dir).status, 0);
  assert.equal(fs.readFileSync(manifest, "utf8"), once, "a second run changes nothing");
});

test("patch-native (android) switches a light-only AppTheme parent to DayNight, and leaves DayNight alone", () => {
  const dir = tmp();
  write(path.join(dir, "app/src/main/AndroidManifest.xml"), "<manifest>\n  <application android:name=\".A\">\n  </application>\n</manifest>\n");
  const styles = path.join(dir, "app/src/main/res/values/styles.xml");
  write(styles, '<resources>\n  <style name="AppTheme" parent="Theme.AppCompat.Light.NoActionBar">\n  </style>\n</resources>\n');
  assert.equal(patchNative("android", dir).status, 0);
  assert.match(fs.readFileSync(styles, "utf8"), /parent="Theme\.AppCompat\.DayNight\.NoActionBar"/);
  write(styles, '<resources>\n  <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">\n  </style>\n</resources>\n');
  const before = fs.readFileSync(styles, "utf8");
  assert.equal(patchNative("android", dir).status, 0);
  assert.equal(fs.readFileSync(styles, "utf8"), before);
});

function png(width, height, rgba) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  // Filter 2 (Up) on every row after the first, to exercise unfiltering.
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(width * 4);
    for (let x = 0; x < width; x++) row.set(rgba, x * 4);
    rows.push(Buffer.concat([Buffer.from([y === 0 ? 0 : 2]), y === 0 ? row : Buffer.alloc(width * 4)]));
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("shot-luma tells a light screenshot from a dark one", () => {
  assert.ok(Math.abs(pngLuma(png(20, 20, [255, 255, 255, 255]), 1) - 1) < 1e-9);
  assert.ok(pngLuma(png(20, 20, [10, 10, 10, 255]), 1) < 0.05);
  assert.equal(pngLuma(Buffer.from("not a png")), null);
  const dir = tmp();
  write(path.join(dir, "TR-06a-light-ios.png"), png(8, 8, [250, 250, 250, 255]));
  write(path.join(dir, "TR-06a-dark-ios.png"), png(8, 8, [20, 20, 20, 255]));
  const s = summarise([path.join(dir, "TR-06a-light-ios.png"), path.join(dir, "TR-06a-dark-ios.png")]);
  assert.ok(s.light > 0.9 && s.dark < 0.1);
});

test("patch-native (android) refuses to overwrite an existing network security config", () => {
  const dir = tmp();
  write(path.join(dir, "app/src/main/AndroidManifest.xml"), '<manifest>\n  <application android:networkSecurityConfig="@xml/other">\n  </application>\n</manifest>\n');
  const r = patchNative("android", dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /already has a networkSecurityConfig/);
});

test("patch-native (ios) sets ATS local networking and adds the level-marking log function once", () => {
  const dir = tmp();
  write(path.join(dir, "FitBudStaging.xcodeproj/project.pbxproj"), "");
  write(path.join(dir, "FitBudStaging/Info.plist"), "");
  write(path.join(dir, "FitBudStaging/AppDelegate.mm"), APP_DELEGATE);
  const calls = path.join(dir, "plistbuddy-calls");
  const fake = path.join(dir, "PlistBuddy");
  write(fake, `#!/bin/sh\necho "$2" >> ${JSON.stringify(calls)}\ncase "$2" in Print*) echo true ;; esac\nexit 0\n`);
  fs.chmodSync(fake, 0o755);
  const r = patchNative("ios", dir, { PLISTBUDDY: fake });
  assert.equal(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(calls, "utf8"), /Add :NSAppTransportSecurity:NSAllowsLocalNetworking bool true/);
  assert.match(fs.readFileSync(calls, "utf8"), /Set :UIUserInterfaceStyle Automatic/, "the app follows the system theme");
  const src = fs.readFileSync(path.join(dir, "FitBudStaging/AppDelegate.mm"), "utf8");
  assert.match(src, /#import "AppDelegate\.h"\n#import <React\/RCTLog\.h>\n/);
  assert.match(src, /\{\n {2}\/\/ FitBud device gate \(Z12-35\)[\s\S]*RCTSetLogThreshold\(RCTLogLevelInfo\);[\s\S]*NSLog\(@"\[fitbud-gate\] %@\.%@ %@", origin, kind, message\);\n {2}\}\);\n {2}self\.moduleName = @"main";/);
  assert.equal(patchNative("ios", dir, { PLISTBUDDY: fake }).status, 0);
  assert.equal(fs.readFileSync(path.join(dir, "FitBudStaging/AppDelegate.mm"), "utf8"), src, "a second run changes nothing");
});

// ---------- the shared build scripts' hooks ----------

for (const [script, platform] of [["build-ios-sim.sh", "ios"], ["build-android-apk.sh", "android"]]) {
  test(`${script}: QA_API_BASE_URL overrides the URL before it is exported; the hook runs after prebuild`, () => {
    const src = fs.readFileSync(path.join(repo, "scripts/qa", script), "utf8");
    const read = src.indexOf('EXPO_PUBLIC_API_BASE_URL="$(read_env_var EXPO_PUBLIC_API_BASE_URL)"');
    const override = src.indexOf('EXPO_PUBLIC_API_BASE_URL="$QA_API_BASE_URL"');
    const exported = src.indexOf("export APP_VARIANT EXPO_PUBLIC_API_BASE_URL");
    assert.ok(read > 0 && override > read && exported > override);
    assert.match(src, /if \[ -n "\$\{QA_API_BASE_URL:-\}" \]; then/, "unset keeps eas.json's value");
    const prebuild = src.indexOf('pnpm exec expo "${prebuild_args[@]}"');
    const hook = src.indexOf(`"$QA_POST_PREBUILD_HOOK" ${platform} `);
    const build = platform === "ios" ? src.indexOf("pod_install_with_retry) ||") : src.indexOf('./gradlew "$GRADLE_TASK"');
    assert.ok(prebuild > 0 && hook > prebuild && build > hook, "prebuild, then the hook, then the native build");
  });
}

// ---------- static checks on the harness ----------

const shellScripts = fs.readdirSync(here).filter((f) => f.endsWith(".sh"));

for (const name of shellScripts) {
  const file = path.join(here, name);
  const src = fs.readFileSync(file, "utf8");
  test(`${name}: parses, runs on macOS bash 3.2, and avoids the known shell traps`, () => {
    const r = spawnSync("bash", ["-n", file], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    if (name !== "lib.sh") {
      assert.match(src, /^set -(e)?uo pipefail$/m, "strict mode");
      assert.ok(fs.statSync(file).mode & 0o111, "executable");
    }
    const code = logicalLines(src).map((l) => l.text).join("\n");
    assert.doesNotMatch(code, /\b(mapfile|readarray)\b|declare -A|\$\{[A-Za-z_]+,,\}/, "bash 3.2 has none of these");
    assert.deepEqual(findHeadPipes(src), []);
    assert.deepEqual(literalGrepsWithoutF(src), []);
    assert.doesNotMatch(src, /api-staging|--remote|secrets\./, "no staging, no remote D1, no secrets");
  });
}

test("device.yml: dispatch plus harness-only pull_request paths, never cancels, no secrets, standard runners", () => {
  const yml = fs.readFileSync(path.join(repo, ".github/workflows/device.yml"), "utf8");
  const on = /^on:\n([\s\S]*?)\n(?=\S)/m.exec(yml)[1].trimEnd();
  assert.match(on, /^ {2}workflow_dispatch:/m);
  assert.ok(
    on.endsWith(
      '  pull_request:\n    paths:\n      - "scripts/qa/device/**"\n      - ".github/workflows/device.yml"\n      - "apps/mobile/.maestro/common/**"\n      - "apps/mobile/.maestro/device/**"',
    ),
    "pull_request runs only for the harness's own paths",
  );
  assert.doesNotMatch(on, /push:|schedule:|pull_request_target:/);
  for (const input of ["ref", "platforms", "themes", "flows", "roles"]) assert.match(yml, new RegExp(`^ {6}${input}:$`, "m"));
  assert.match(yml, /DEVICE_FLOWS: \$\{\{ inputs\.flows \|\| \(github\.event_name == 'pull_request' && 'smoke,z12-33'\) \|\| 'smoke' \}\}/);
  assert.equal((yml.match(/ref: \$\{\{ inputs\.ref \|\| '' \}\}/g) ?? []).length, 2, "both device jobs build the requested ref");
  assert.equal((yml.match(/git checkout "\$HARNESS_SHA" -- scripts\/qa /g) ?? []).length, 2, "and overlay the harness from the workflow's commit");
  assert.doesNotMatch(yml, /secrets\./, "no secret is read");
  assert.doesNotMatch(yml, /api-staging|--remote|wrangler deploy|eas (build|submit)/);
  assert.doesNotMatch(yml, /^\s*concurrency:|cancel-in-progress/m, "no run is ever cancelled");
  assert.match(yml, /^permissions:\n {2}contents: read$/m);
  const runners = [...yml.matchAll(/runs-on: (\S+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(runners)].sort(), ["macos-15", "ubuntu-latest"]);
  assert.match(yml, /run: scripts\/qa\/device\/run-gate\.sh ios/);
  assert.match(yml, /script: scripts\/qa\/device\/run-gate\.sh android/);
});

test("qa.yml is untouched by the harness: it never calls the device scripts", () => {
  const qa = fs.readFileSync(path.join(repo, ".github/workflows/qa.yml"), "utf8");
  assert.doesNotMatch(qa, /scripts\/qa\/device\/|QA_API_BASE_URL|QA_POST_PREBUILD_HOOK/);
});

test("assert-no-crash.yaml fails on the five React Native warnings the W12 gate names", () => {
  const flow = fs.readFileSync(path.join(repo, "apps/mobile/.maestro/common/assert-no-crash.yaml"), "utf8");
  for (const text of [
    "Requiring unknown module",
    "Encountered two children",
    "Each child in a list",
    "VirtualizedLists should never be nested",
    "Possible unhandled promise",
  ]) {
    assert.ok(flow.includes(`- assertNotVisible: ".*${text}.*"`), text);
  }
});
