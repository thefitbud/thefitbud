// CU25. Run with: node --test scripts/qa/maestro-launch.test.mjs
//
// The auth screen is reached only when two suite guards hold:
// the simulator app is ad-hoc signed with a keychain entitlement, and the
// Android emulator has hide_error_dialogs set to 1 before Maestro starts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { keychainEntitlementsPlist } from "./simulator-keychain-entitlements.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE_ID = "com.thefitbud.mobile.staging";

function read(name) {
  return fs.readFileSync(path.join(here, name), "utf8");
}

test("the entitlements plist names this app as the keychain access group", () => {
  const xml = keychainEntitlementsPlist(BUNDLE_ID);
  assert.match(
    xml,
    /<key>application-identifier<\/key>\s*<string>com\.thefitbud\.mobile\.staging<\/string>/,
  );
  assert.match(
    xml,
    /<key>keychain-access-groups<\/key>\s*<array>\s*<string>com\.thefitbud\.mobile\.staging<\/string>\s*<\/array>/,
  );
});

test("a bundle id that could break the plist is rejected", () => {
  for (const bad of ["", "has space", "../etc", "<string>", "com.app/id", ".leading"]) {
    assert.throws(() => keychainEntitlementsPlist(bad), /reverse-DNS/);
  }
});

test("the entitlements CLI writes the same plist and refuses a bad id", () => {
  const ok = spawnSync(process.execPath, [path.join(here, "simulator-keychain-entitlements.mjs"), BUNDLE_ID], {
    encoding: "utf8",
  });
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout, keychainEntitlementsPlist(BUNDLE_ID));
  const bad = spawnSync(process.execPath, [path.join(here, "simulator-keychain-entitlements.mjs"), "not an id"], {
    encoding: "utf8",
  });
  assert.notEqual(bad.status, 0);
  assert.equal(bad.stdout, "");
});

function fakeCodesign(dir, mode) {
  const log = path.join(dir, "codesign.log");
  const dump = path.join(dir, "dump.plist");
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  const script = `#!/bin/bash
printf '%s\\n' "$*" >> ${JSON.stringify(log)}
if [ "\$1" = "-d" ]; then
  cat ${JSON.stringify(dump)}
  exit 0
fi
prev=""
for a in "\$@"; do
  if [ "\$prev" = "--entitlements" ]; then
    if [ ${JSON.stringify(mode)} = "drop-keychain" ]; then
      printf '%s\\n' '<plist><dict><key>application-identifier</key><string>${BUNDLE_ID}</string></dict></plist>' > ${JSON.stringify(dump)}
    else
      cp "\$a" ${JSON.stringify(dump)}
    fi
  fi
  prev="\$a"
done
exit 0
`;
  fs.writeFileSync(path.join(bin, "codesign"), script, { mode: 0o755 });
  return { bin, log };
}

function fixtureApp(dir) {
  const app = path.join(dir, "FitBudStaging.app");
  fs.mkdirSync(path.join(app, "Frameworks", "Inner.framework"), { recursive: true });
  fs.mkdirSync(path.join(app, "PlugIns", "Widget.appex"), { recursive: true });
  return app;
}

function sign(app, env) {
  return spawnSync(
    "bash",
    [
      "-c",
      'set -euo pipefail; source "$SIGN"; sign_ios_simulator_app "$APP" "$BUNDLE"',
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        SIGN: path.join(here, "sign-ios-simulator-app.sh"),
        APP: app,
        BUNDLE: BUNDLE_ID,
        PATH: `${env.bin}:${process.env.PATH}`,
      },
    },
  );
}

test("ad-hoc signing embeds the keychain entitlement and signs nested bundles first", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cu25-sign-"));
  const { bin, log } = fakeCodesign(dir, "record");
  const result = sign(fixtureApp(dir), { bin });
  assert.equal(result.status, 0, result.stderr);
  const lines = fs.readFileSync(log, "utf8").trim().split("\n");
  const nested = lines.filter((line) => !line.startsWith("-d"));
  const outerAt = nested.findIndex((line) => line.includes("--entitlements"));
  const innerAt = nested.findIndex((line) => line.includes("Inner.framework"));
  const widgetAt = nested.findIndex((line) => line.includes("Widget.appex"));
  assert.ok(outerAt > innerAt && innerAt >= 0, nested.join("\n"));
  assert.ok(outerAt > widgetAt && widgetAt >= 0, nested.join("\n"));
  const outer = nested[outerAt];
  assert.ok(outer.includes("--generate-entitlement-der"));
  assert.ok(outer.includes("FitBudStaging.app"));
  assert.ok(lines.at(-1).startsWith("-d "), lines.join("\n"));
  assert.match(result.stdout, /ad-hoc signed FitBudStaging\.app as com\.thefitbud\.mobile\.staging/);
});

test("signing refuses a signature that dropped the keychain entitlement", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cu25-sign-"));
  const { bin } = fakeCodesign(dir, "drop-keychain");
  const result = sign(fixtureApp(dir), { bin });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no keychain-access-groups entitlement/);
});

test("the simulator build signs after xcodebuild and before it reports the app written", () => {
  const src = read("build-ios-sim.sh");
  const unsigned = src.indexOf("CODE_SIGNING_ALLOWED=NO");
  const sign = src.indexOf('sign_ios_simulator_app "$APP_OUT" "$BUILT_ID"');
  const wrote = src.indexOf('echo "build-ios-sim: wrote');
  assert.ok(unsigned > 0);
  assert.ok(sign > unsigned);
  assert.ok(wrote > sign);
});

test("the iOS runner refuses to install an app with no keychain entitlement", () => {
  const src = read("run-maestro-ios.sh");
  const guard = src.indexOf("<key>keychain-access-groups</key>");
  const install = src.indexOf("simctl install");
  const maestro = src.indexOf("maestro --device");
  assert.ok(guard > 0);
  assert.ok(install > guard);
  assert.ok(maestro > guard);
});

function fakeAdb(dir, reply) {
  const log = path.join(dir, "adb.log");
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  // reply "store" means get returns whatever put wrote. Anything else is a fixed get.
  const script = `#!/bin/bash
printf '%s\\n' "$*" >> ${JSON.stringify(log)}
if [ "\$1" != "shell" ]; then
  echo "unexpected adb: \$*" >&2
  exit 1
fi
shift
cmd="\$*"
case "\$cmd" in
  "settings put global hide_error_dialogs "*)
    printf '%s' "\${cmd##* }" > ${JSON.stringify(path.join(dir, "value"))}
    exit 0
    ;;
  "settings get global hide_error_dialogs")
    if [ ${JSON.stringify(reply)} = "store" ]; then
      cat ${JSON.stringify(path.join(dir, "value"))}
    else
      printf '%s' ${JSON.stringify(reply)}
    fi
    exit 0
    ;;
esac
echo "unexpected adb shell: \$cmd" >&2
exit 1
`;
  fs.writeFileSync(path.join(bin, "adb"), script, { mode: 0o755 });
  return { bin, log };
}

function suppress(bin) {
  return spawnSync(
    "bash",
    [
      "-c",
      'set -euo pipefail; source "$PREP"; suppress_emulator_error_dialogs',
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PREP: path.join(here, "android-emulator-prep.sh"),
        PATH: `${bin}:${process.env.PATH}`,
      },
    },
  );
}

test("the emulator prep sets hide_error_dialogs to 1 and reads it back", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cu25-adb-"));
  const { bin, log } = fakeAdb(dir, "store");
  const result = suppress(bin);
  assert.equal(result.status, 0, result.stderr);
  const lines = fs.readFileSync(log, "utf8").trim().split("\n");
  assert.deepEqual(lines, [
    "shell settings put global hide_error_dialogs 1",
    "shell settings get global hide_error_dialogs",
  ]);
  assert.match(result.stdout, /hide_error_dialogs=1/);
});

test("the emulator prep stops when the setting does not stick", () => {
  for (const reply of ["0", "null", ""]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cu25-adb-"));
    const { bin } = fakeAdb(dir, reply);
    const result = suppress(bin);
    assert.notEqual(result.status, 0, `reply ${JSON.stringify(reply)} should fail`);
    assert.match(result.stderr, /hide_error_dialogs is/);
  }
});

test("run-maestro hides the dialog before maestro test", () => {
  const src = read("run-maestro.sh");
  const prep = src.indexOf("suppress_emulator_error_dialogs || die");
  const maestro = src.indexOf('cd "$MOBILE_RESULTS" && maestro test');
  assert.ok(prep > 0);
  assert.ok(maestro > prep);
});
