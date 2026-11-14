// Z12-35 native-build cache. Run with: node --test scripts/qa/device/native-cache.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dependencyClosure, fingerprint } from "./native-fingerprint.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "z12-35-cache-"));
}

function write(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

function fakeRepo() {
  const root = tmp();
  const mobile = path.join(root, "apps/mobile");
  write(
    path.join(mobile, "package.json"),
    JSON.stringify({ name: "@fitbud/mobile", dependencies: { "native-lib": "1.0.0", "@fitbud/ui": "workspace:*" } }),
  );
  write(path.join(mobile, "app.json"), "{}");
  write(path.join(mobile, "app.config.js"), "module.exports = () => ({})");
  write(path.join(mobile, "eas.json"), "{}");
  write(path.join(mobile, "src/App.tsx"), "export const a = 1;");
  write(path.join(mobile, "assets/icon.png"), "png-1");
  write(path.join(mobile, "modules/live/index.ts"), "export {}");
  write(path.join(mobile, "modules/live/ios/Live.swift"), "// v1");
  // An external package (in a pnpm-style store) and a workspace package (symlinked from packages/).
  const store = path.join(root, "node_modules/.pnpm/native-lib@1.0.0/node_modules/native-lib");
  write(path.join(store, "package.json"), JSON.stringify({ name: "native-lib", version: "1.0.0" }));
  write(path.join(root, "packages/ui/package.json"), JSON.stringify({ name: "@fitbud/ui", version: "0.0.0" }));
  write(path.join(root, "packages/ui/src/index.ts"), "export const b = 1;");
  fs.mkdirSync(path.join(mobile, "node_modules/@fitbud"), { recursive: true });
  fs.symlinkSync(store, path.join(mobile, "node_modules/native-lib"));
  fs.symlinkSync(path.join(root, "packages/ui"), path.join(mobile, "node_modules/@fitbud/ui"));
  return root;
}

test("the native fingerprint ignores JS, and changes with native code, assets, packages and the toolchain", () => {
  const repo = fakeRepo();
  const key = (extras = ["xcode=16.4"], platform = "ios") => fingerprint({ platform, extras, repo }).key;
  const base = key();
  assert.match(base, /^device-native-ios-[0-9a-f]{40}$/);
  assert.deepEqual(dependencyClosure(path.join(repo, "apps/mobile")), ["native-lib@1.0.0"], "workspace packages are not listed");

  write(path.join(repo, "apps/mobile/src/App.tsx"), "export const a = 2;");
  write(path.join(repo, "packages/ui/src/index.ts"), "export const b = 2;");
  write(path.join(repo, "apps/mobile/modules/live/index.ts"), "export const changed = true;");
  assert.equal(key(), base, "JS/TS changes keep the cache");

  write(path.join(repo, "apps/mobile/modules/live/ios/Live.swift"), "// v2");
  const native = key();
  assert.notEqual(native, base, "a native source change misses");

  write(path.join(repo, "apps/mobile/assets/icon.png"), "png-2");
  const asset = key();
  assert.notEqual(asset, native, "an image change misses (Android compiles images into resources)");

  write(
    path.join(repo, "node_modules/.pnpm/native-lib@1.0.0/node_modules/native-lib/package.json"),
    JSON.stringify({ name: "native-lib", version: "1.0.1" }),
  );
  const pkg = key();
  assert.notEqual(pkg, asset, "a package version change misses");
  assert.notEqual(key(["xcode=16.5"]), pkg, "a toolchain change misses");
  assert.match(key(["xcode=16.4"], "android"), /^device-native-android-/, "platforms never share a key");
});

test("the real repository fingerprints, with the build scripts as inputs and no app source", () => {
  const { key, manifest } = fingerprint({ platform: "android", extras: [] });
  assert.match(key, /^device-native-android-/);
  const files = manifest.files.map((l) => l.split(" ")[0]);
  for (const f of [
    "apps/mobile/app.json",
    "apps/mobile/app.config.js",
    "scripts/qa/build-android-apk.sh",
    "scripts/qa/device/patch-native.sh",
    "scripts/qa/device/swap-bundle.sh",
  ]) {
    assert.ok(files.includes(f), f);
  }
  assert.ok(!files.some((f) => /^apps\/mobile\/src\/.*\.tsx?$/.test(f)), "no app source is an input");
  assert.ok(manifest.packages.some((p) => p.startsWith("react-native@")), "react-native's version (so its Hermes) is an input");
});

test("swap-bundle guards the Hermes bytecode version and re-signs what it changed", () => {
  const src = fs.readFileSync(path.join(here, "swap-bundle.sh"), "utf8");
  assert.match(src, /hbc_version\(\) \{\n {2}od -An -t u4 -j 8 -N 4/);
  assert.match(src, /\[ "\$old" = "\$new" \] \|\| device_die "Hermes bytecode version/);
  assert.match(src, /sign_ios_simulator_app "\$APP" "\$BUNDLE_ID"/);
  assert.match(src, /zipalign" -f -p 4/);
  assert.match(src, /apksigner" verify/);
  assert.match(src, /--entry-file "\$MOBILE\/index\.js"/);
});

test("device.yml restores the native build by fingerprint and saves it only on a miss", () => {
  const yml = fs.readFileSync(path.join(repoRoot, ".github/workflows/device.yml"), "utf8");
  for (const platform of ["ios", "android"]) {
    assert.ok(yml.includes(`native-fingerprint.mjs --platform ${platform}`), platform);
    assert.ok(yml.includes(`path: qa-results/device-native-cache/${platform}`), platform);
  }
  assert.equal((yml.match(/uses: actions\/cache\/restore@v6/g) ?? []).length, 2);
  assert.equal((yml.match(/uses: actions\/cache\/save@v6/g) ?? []).length, 2);
  assert.equal((yml.match(/if: \$\{\{ steps\.native-cache\.outputs\.cache-hit != 'true' \}\}/g) ?? []).length, 2);
});

test("build-app.sh swaps the bundle only on a reported hit with a cached app, and records the mode", () => {
  const src = fs.readFileSync(path.join(here, "build-app.sh"), "utf8");
  assert.match(src, /if \[ "\$\{DEVICE_NATIVE_CACHE:-miss\}" = "hit" \] && \[ -n "\$cached" \]; then/);
  assert.match(src, /"\$DEVICE_LIB_DIR\/swap-bundle\.sh" "\$PLATFORM" "\$app"/);
  assert.match(src, /cp -R "\$app" "\$CACHE_DIR\/"/);
  assert.match(src, /build-\$PLATFORM\.json/);
});
