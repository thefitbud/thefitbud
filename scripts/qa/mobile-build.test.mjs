// Z5-5. Run with: node --test scripts/qa/mobile-build.test.mjs
//
// QA ios has been red since #226: @sentry/react-native's Xcode phases could not
// resolve @sentry/cli under pnpm and failed the Release build, and `pod install`
// sometimes died with "pathname contains null byte". QA android once failed
// because the emulator system image arrived corrupt. Diagnosis: #241.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const helpers = path.join(here, "ios-build-helpers.sh");
const buildIos = path.join(here, "build-ios-sim.sh");
const systemImage = path.join(here, "android-system-image.sh");
const qaYml = path.join(repo, ".github/workflows/qa.yml");

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "z5-5-"));
}

function write(file, body, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, { mode });
}

function bash(script, { cwd, env = {} } = {}) {
  return spawnSync("bash", ["-c", script], {
    cwd,
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
  });
}

// A pnpm-style tree: apps/mobile links @sentry/react-native, whose real directory
// under .pnpm has @sentry/cli as a sibling. @sentry/cli is NOT resolvable from
// apps/mobile itself, which is exactly the CI layout.
function pnpmTree({ withCli = true } = {}) {
  const root = tmp();
  const store = path.join(root, "node_modules/.pnpm");
  const rnReal = path.join(store, "@sentry+react-native@6.10.0/node_modules/@sentry/react-native");
  write(path.join(rnReal, "package.json"), JSON.stringify({ name: "@sentry/react-native", version: "6.10.0" }));
  if (withCli) {
    const cliReal = path.join(store, "@sentry+cli@2.42.4/node_modules/@sentry/cli");
    write(path.join(cliReal, "package.json"), JSON.stringify({ name: "@sentry/cli", version: "2.42.4" }));
    write(path.join(cliReal, "bin/sentry-cli"), "#!/usr/bin/env node\n", 0o755);
    fs.symlinkSync(cliReal, path.join(store, "@sentry+react-native@6.10.0/node_modules/@sentry/cli"));
  }
  const mobile = path.join(root, "apps/mobile");
  fs.mkdirSync(path.join(mobile, "node_modules/@sentry"), { recursive: true });
  fs.symlinkSync(rnReal, path.join(mobile, "node_modules/@sentry/react-native"));
  return { root, mobile };
}

test("the pnpm-style fixture really hides @sentry/cli from apps/mobile", () => {
  const { mobile } = pnpmTree();
  const r = spawnSync("node", ["--print", "require.resolve('@sentry/cli/package.json')"], {
    cwd: mobile,
    encoding: "utf8",
  });
  assert.notEqual(r.status, 0, "plain resolve must fail here, as it does in the Xcode phase");
});

test("resolve_sentry_cli finds sentry-cli through @sentry/react-native's real path", () => {
  const { mobile } = pnpmTree();
  const r = bash(`source ${JSON.stringify(helpers)}; resolve_sentry_cli ${JSON.stringify(mobile)}`);
  assert.equal(r.status, 0, r.stderr);
  const cli = r.stdout.trim();
  assert.match(cli, /@sentry\+cli@2\.42\.4\/node_modules\/@sentry\/cli\/bin\/sentry-cli$/);
  assert.ok(fs.statSync(cli).mode & 0o111, "the resolved path is executable");
});

test("resolve_sentry_cli fails when @sentry/react-native has no @sentry/cli", () => {
  const { mobile } = pnpmTree({ withCli: false });
  const r = bash(`source ${JSON.stringify(helpers)}; resolve_sentry_cli ${JSON.stringify(mobile)}`);
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout.trim(), "");
  assert.match(r.stderr, /not resolvable/);
});

function fakePod(dir, outcomes) {
  // outcomes: one entry per call, [exitCode, output]
  const counter = path.join(dir, "pod-calls");
  const cases = outcomes
    .map(([code, out], i) => `  ${i + 1}) echo ${JSON.stringify(out)}; exit ${code} ;;`)
    .join("\n");
  write(
    path.join(dir, "bin/pod"),
    `#!/bin/bash
n=$(( $(cat ${JSON.stringify(counter)} 2>/dev/null || echo 0) + 1 ))
echo "$n" > ${JSON.stringify(counter)}
case "$n" in
${cases}
  *) echo "unexpected pod call $n"; exit 99 ;;
esac
`,
    0o755,
  );
  return {
    env: { PATH: `${path.join(dir, "bin")}:${process.env.PATH}` },
    calls: () => Number(fs.readFileSync(counter, "utf8").trim()),
  };
}

function podInstall(dir, pod) {
  return bash(`set -euo pipefail; source ${JSON.stringify(helpers)}; pod_install_with_retry`, {
    cwd: dir,
    env: pod.env,
  });
}

test("pod install is retried once after the null-byte crash and then passes", () => {
  const dir = tmp();
  const pod = fakePod(dir, [
    [1, "ArgumentError - pathname contains null byte"],
    [0, "Pod installation complete!"],
  ]);
  const r = podInstall(dir, pod);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(pod.calls(), 2);
  assert.match(r.stdout, /retrying once/);
});

test("any other pod install failure is not retried", () => {
  const dir = tmp();
  const pod = fakePod(dir, [[1, "[!] Unable to find a specification for `Foo`"]]);
  const r = podInstall(dir, pod);
  assert.equal(r.status, 1);
  assert.equal(pod.calls(), 1);
});

test("a second null-byte crash fails; there is only one retry", () => {
  const dir = tmp();
  const pod = fakePod(dir, [
    [1, "ArgumentError - pathname contains null byte"],
    [1, "ArgumentError - pathname contains null byte"],
  ]);
  const r = podInstall(dir, pod);
  assert.equal(r.status, 1);
  assert.equal(pod.calls(), 2);
});

test("build-ios-sim exports SENTRY_CLI_EXECUTABLE before xcodebuild and retries pod install", () => {
  const src = fs.readFileSync(buildIos, "utf8");
  const exportAt = src.indexOf("export SENTRY_CLI_EXECUTABLE");
  const resolveAt = src.indexOf('SENTRY_CLI_EXECUTABLE="$(resolve_sentry_cli "$MOBILE")"');
  const xcodebuildAt = src.indexOf("\nxcodebuild \\");
  assert.ok(resolveAt > 0, "SENTRY_CLI_EXECUTABLE comes from resolve_sentry_cli");
  assert.ok(exportAt > resolveAt, "and is exported");
  assert.ok(xcodebuildAt > exportAt, "before xcodebuild runs the Sentry phases");
  assert.doesNotMatch(src, /^\s*export SENTRY_DISABLE_AUTO_UPLOAD=false/m, "the upload is never turned on");
  assert.match(src, /\(cd "\$IOS_DIR" && pod_install_with_retry\)/);
  assert.doesNotMatch(src, /&& pod install\)/, "no bare pod install is left");
});

function fakeSdk(dir, outcomes) {
  // outcomes: one entry per --install call, [exitCode, writesPackageXml]
  const sdk = path.join(dir, "sdk");
  const counter = path.join(dir, "install-calls");
  const xml = path.join(sdk, "system-images/android-34/google_apis/x86_64/package.xml");
  const cases = outcomes
    .map(
      ([code, writes], i) =>
        `  ${i + 1}) ${writes ? `mkdir -p ${JSON.stringify(path.dirname(xml))}; touch ${JSON.stringify(xml)};` : ""} exit ${code} ;;`,
    )
    .join("\n");
  write(
    path.join(sdk, "cmdline-tools/latest/bin/sdkmanager"),
    `#!/bin/bash
if [ "$1" = "--licenses" ]; then exit 0; fi
[ "$1" = "--install" ] && [ "$2" = "system-images;android-34;google_apis;x86_64" ] || { echo "unexpected: $*"; exit 98; }
n=$(( $(cat ${JSON.stringify(counter)} 2>/dev/null || echo 0) + 1 ))
echo "$n" > ${JSON.stringify(counter)}
case "$n" in
${cases}
  *) exit 99 ;;
esac
`,
    0o755,
  );
  return {
    env: { ANDROID_HOME: sdk, QA_SDKMANAGER_RETRY_DELAY: "0" },
    calls: () => Number(fs.readFileSync(counter, "utf8").trim()),
  };
}

function installImage(sdk) {
  return spawnSync("bash", [systemImage], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...sdk.env },
  });
}

test("a corrupt system image download is retried until the package is installed", () => {
  const sdk = fakeSdk(tmp(), [
    [1, false],
    [0, true],
  ]);
  const r = installImage(sdk);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(sdk.calls(), 2);
  assert.match(r.stdout, /is installed/);
});

test("sdkmanager exit 0 without package.xml is not an install", () => {
  const sdk = fakeSdk(tmp(), [
    [0, false],
    [0, false],
    [0, false],
  ]);
  const r = installImage(sdk);
  assert.equal(r.status, 1);
  assert.equal(sdk.calls(), 3);
  assert.match(r.stderr, /after 3 attempts/);
});

test("qa.yml installs the system image before either emulator-runner step", () => {
  const src = fs.readFileSync(qaYml, "utf8");
  const install = src.indexOf("run: scripts/qa/android-system-image.sh");
  const snapshot = src.indexOf("- name: Create the AVD snapshot");
  const suite = src.indexOf("script: scripts/qa/run-maestro.sh");
  assert.ok(install > 0, "the install step exists");
  assert.ok(install < snapshot && install < suite);
});

test("the changes filter counts the Maestro build and run scripts as mobile", () => {
  const src = fs.readFileSync(qaYml, "utf8");
  const line = src.split("\n").find((l) => l.includes("mobile=$(echo \"$files\" | grep -Ec"));
  assert.ok(line, "the mobile filter line exists");
  const pattern = line.match(/grep -Ec '([^']+)'/)[1];
  const matches = (file) => spawnSync("grep", ["-Ec", pattern], { input: `${file}\n`, encoding: "utf8" }).stdout.trim() === "1";
  for (const file of [
    "apps/mobile/src/App.tsx",
    "packages/ui-mobile/src/Button.tsx",
    "apps/mobile/.maestro/flows/x.yaml",
    "scripts/qa/build-ios-sim.sh",
    "scripts/qa/ios-build-helpers.sh",
    "scripts/qa/build-android-apk.sh",
    "scripts/qa/android-system-image.sh",
    "scripts/qa/run-maestro.sh",
    "scripts/qa/run-maestro-ios.sh",
  ]) {
    assert.ok(matches(file), `${file} should run the Maestro jobs`);
  }
  for (const file of ["scripts/qa/summarize.mjs", "scripts/qa/summarize.test.mjs", "apps/api/src/index.ts", "docs/qa/README.md"]) {
    assert.ok(!matches(file), `${file} should not run the Maestro jobs`);
  }
});

test("run-maestro enlarges the logcat buffers before it clears them and runs the suite", () => {
  const dir = tmp();
  const calls = path.join(dir, "calls.log");
  write(
    path.join(dir, "bin/adb"),
    `#!/bin/bash
echo "adb $*" >> ${JSON.stringify(calls)}
case "$*" in
  "logcat -d") echo '11-05 05:41:02.113  4121  4121 I ReactNativeJS: Running "main"'; exit 0 ;;
  "logcat -g") echo "main: ring buffer is 16 MiB"; exit 0 ;;
  "shell settings get global hide_error_dialogs") printf '1'; exit 0 ;;
  *) exit 0 ;;
esac
`,
    0o755,
  );
  write(
    path.join(dir, "bin/maestro"),
    `#!/bin/bash
echo "maestro test" >> ${JSON.stringify(calls)}
printf '%s\\n' '<testsuite></testsuite>' > junit.xml
exit 0
`,
    0o755,
  );
  const r = spawnSync("bash", [path.join(here, "run-maestro.sh")], {
    cwd: repo,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${path.join(dir, "bin")}:${process.env.PATH}`,
      QA_TEST_OTP_CODE: "000000",
      FITBUD_QA_PASSWORD: "not-a-real-password",
      QA_MAESTRO_SKIP_INSTALL: "1",
      QA_RESULTS_DIR: path.join(dir, "qa-results"),
      QA_MAESTRO_TAG: "smoke",
    },
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const log = fs.readFileSync(calls, "utf8").split("\n");
  const grow = log.indexOf("adb logcat -G 16M");
  const clear = log.indexOf("adb logcat -c");
  const suite = log.indexOf("maestro test");
  assert.ok(grow >= 0, "the buffers are resized");
  assert.ok(grow < clear && clear < suite, "resize, then clear, then the suite");
  assert.match(r.stdout, /logcat buffers: main: ring buffer is 16 MiB/);
  assert.match(r.stdout, /logcat\.log has 1 lines, 1 from ReactNativeJS/);
});

// Z5-5 cause 7: Maestro's hideKeyboard cannot dismiss the iOS keyboard on the
// auth screens (job 127139263977). The smoke-path auth flows tap inert text
// inside the keyboardShouldPersistTaps="handled" ScrollView instead.
test("the smoke-path auth flows dismiss the keyboard with a tap, not hideKeyboard", () => {
  const maestro = path.join(repo, "apps/mobile/.maestro");
  const files = {
    "common/sign-in-password.yaml": /- inputText: \$\{QA_PASSWORD\}\n(?:#.*\n)*- tapOn: "Your coach's plan for today is waiting\\\\\."/,
    "common/sign-in-code-request.yaml": /- inputText: \$\{SIGN_IN_EMAIL\}\n(?:#.*\n)*- tapOn: "Your coach's plan for today is waiting\\\\\."/,
    "common/sign-in-code.yaml": /- inputText: \$\{QA_OTP_CODE\}\n- tapOn:\n\s+text: "Sent to \.\*"\n\s+optional: true/,
    "flows/auth/sign-in-code.yaml": /- inputText: \$\{QA_OTP_CODE\}\n- tapOn:\n\s+text: "Sent to \.\*"\n\s+optional: true/,
  };
  for (const [rel, dismiss] of Object.entries(files)) {
    const src = fs.readFileSync(path.join(maestro, rel), "utf8");
    assert.doesNotMatch(src, /^\s*- hideKeyboard/m, `${rel} still uses hideKeyboard`);
    assert.match(src, dismiss, `${rel} dismisses the keyboard by tapping inert text`);
  }
});

// Z5-5b. The flows below are the iOS fixes for causes 8 and 9 (job 127176024926)
// and the full-tag hideKeyboard steps #241 left behind.
const maestroDir = path.join(repo, "apps/mobile/.maestro");

function maestroFiles(dir = maestroDir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...maestroFiles(full));
    else if (entry.name.endsWith(".yaml")) out.push(full);
  }
  return out.sort();
}

// Maestro matches a text selector against the whole string (Regex.matches), so
// the YAML pattern is anchored the same way here. A YAML "\\" is one backslash.
function yamlRegex(quoted) {
  return new RegExp(`^(?:${quoted.replace(/\\\\/g, "\\")})$`);
}

// Cause 8: on iOS the "Forgot password?" Pressable is exposed only by its
// accessibilityLabel, which has no "?", so the password button's `below:`
// anchor never matched there.
test("the password button's anchor matches the Forgot password label on iOS and the text on Android", () => {
  const flow = fs.readFileSync(path.join(maestroDir, "common/sign-in-password.yaml"), "utf8");
  const step = flow.match(/- tapOn:\n\s+text: "Sign in"\n\s+below: "([^"\n]+)"/);
  assert.ok(step, "the password subflow taps the Sign in button below an anchor");
  const anchor = yamlRegex(step[1]);
  const screen = fs.readFileSync(
    path.join(repo, "apps/mobile/src/screens/auth/SignInScreen.tsx"),
    "utf8",
  );
  const link = screen.match(
    /accessibilityLabel="([^"]+)"\s+onPress=\{onForgotPassword\}[\s\S]*?<Text[^>]*>([^<]+)<\/Text>/,
  );
  assert.ok(link, "SignInScreen has the Forgot password link");
  const [, label, text] = link;
  assert.match(label, anchor, `iOS exposes the accessibilityLabel "${label}"`);
  assert.match(text, anchor, `Android also exposes the text "${text}"`);
  assert.doesNotMatch("Sign in with a code instead", anchor);
});

// Cause 9: Maestro's clearState does not clear the iOS simulator keychain, where
// SecureStore keeps the session, so a flow after a signed-in flow opened signed in.
test("every launch that clears the app state also clears the keychain", () => {
  let launches = 0;
  for (const file of maestroFiles(path.join(maestroDir, "flows"))) {
    const src = fs.readFileSync(file, "utf8");
    const blocks = src.match(/^- launchApp:\n(?:[ \t]+.*\n)+/gm) ?? [];
    for (const block of blocks) {
      if (!/^\s+clearState: true$/m.test(block)) continue;
      launches += 1;
      assert.match(
        block,
        /^\s+clearKeychain: true$/m,
        `${path.relative(repo, file)}: launchApp clears the state but not the keychain`,
      );
    }
  }
  assert.ok(launches >= 14, `expected every flow's launch, found ${launches}`);
  const manual = fs.readFileSync(path.join(maestroDir, "session-persists.yaml"), "utf8");
  const clearState = manual.indexOf("\n- clearState\n");
  const clearKeychain = manual.indexOf("\n- clearKeychain\n");
  assert.ok(
    clearKeychain > 0 && clearKeychain < clearState,
    "session-persists.yaml clears the keychain before it starts",
  );
});

// The full-tag flows #241 left on hideKeyboard. Each now taps a plain Text inside
// a keyboardShouldPersistTaps="handled" ScrollView on its screen.
test("no flow dismisses the keyboard with hideKeyboard; the full-tag flows tap inert text", () => {
  for (const file of maestroFiles()) {
    const src = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(src, /^\s*- hideKeyboard/m, `${path.relative(repo, file)} still uses hideKeyboard`);
  }
  const src = (rel) => fs.readFileSync(path.join(repo, rel), "utf8");
  const cases = [
    {
      flow: "flows/trainer/notes-more.yaml",
      after: '- inputText: "QA nightly note. Safe to delete."',
      tap: "Coach notes",
      screen: "apps/mobile/src/trainer/ClientStatusScreen.tsx",
      text: /<Text style=\{styles\.section\}>Coach notes<\/Text>/,
    },
    {
      flow: "flows/trainee/checkin.yaml",
      after: '- inputText: "Solid week, one session missed."',
      tap: "Weekly check-in",
      screen: "apps/mobile/src/trainee/CheckinScreen.tsx",
      text: /<Text style=\{styles\.topTitle\}>Weekly check-in<\/Text>/,
    },
    {
      flow: "flows/trainee/meal-log.yaml",
      after: '- inputText: "dal"',
      tap: "Results",
      screen: "apps/mobile/src/trainee/FoodSearchScreen.tsx",
      text: /keyboardShouldPersistTaps="handled"[\s\S]*<Text style=\{styles\.sml\}>Results<\/Text>/,
    },
  ];
  assert.match(
    src("apps/mobile/src/components/Screen.tsx"),
    /<ScrollView[\s\S]*?keyboardShouldPersistTaps="handled"/,
  );
  for (const c of cases) {
    const flow = fs.readFileSync(path.join(maestroDir, c.flow), "utf8");
    const at = flow.indexOf(`${c.after}\n`);
    assert.ok(at >= 0, `${c.flow} types into the field`);
    const next = flow
      .slice(at + c.after.length + 1)
      .split("\n")
      .find((line) => !line.startsWith("#"));
    assert.equal(next, `- tapOn: "${c.tap}"`, `${c.flow} dismisses the keyboard with a tap on "${c.tap}"`);
    const screen = src(c.screen);
    assert.match(screen, c.text, `"${c.tap}" is a plain Text on ${c.screen}`);
    assert.match(screen, /<Screen\b/, `${c.screen} renders inside Screen's handled ScrollView`);
  }
});
