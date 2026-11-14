#!/usr/bin/env node
// Fingerprint of everything that goes into the NATIVE part of the gate's app build
// (Z12-35 native-build cache). Same fingerprint = the cached .app / APK is the same
// native binary this commit would build, so only the JS bundle needs rebuilding.
//
//   node scripts/qa/device/native-fingerprint.mjs --platform ios|android [--extra <text>]... [--manifest <out.json>]
//
// Prints a cache key, `device-native-<platform>-<hash>`. Inputs:
//   * apps/mobile app.json, app.config.js, eas.json, package.json (the variant, plugins,
//     native config and the dependency list);
//   * apps/mobile/plugins/**, targets/** and modules/** minus their JS/TS (config
//     plugins, the Live Activity target, the local native module);
//   * every external package in apps/mobile's installed dependency closure, as
//     name@version (native modules, config plugins, fonts; a JS-only bump is a miss too,
//     which is the safe direction). Workspace packages (packages/*) are JS and are not
//     listed, so a change to their source still hits the cache;
//   * every image and font file under apps/mobile and packages/* (Android compiles
//     bundled images into resources, which a JS-bundle swap cannot add);
//   * the build and patch scripts (scripts/qa/build-*.sh, ios-build-helpers.sh,
//     sign-ios-simulator-app.sh, simulator-keychain-entitlements.mjs,
//     device/patch-native.sh, device/swap-bundle.sh) and this file;
//   * --extra values: the workflow passes the Xcode version (iOS), the Java version
//     (Android) and the runner image.
// What is deliberately NOT an input: JS/TS source and EXPO_PUBLIC_* values (both live in
// the JS bundle, which is rebuilt on a hit), and app.config.js's computed bundleCommit
// (the dev-only commit badge; stale on a hit, never shown in a Release build).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, "../../..");
const ASSET_RE = /\.(png|jpe?g|gif|webp|ttf|otf)$/i;
const JS_RE = /\.(m?[jt]sx?|d\.ts)$/;
const SKIP_DIRS = new Set(["node_modules", "ios", "android", ".expo", "dist", ".turbo", "coverage"]);

function sha(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function walk(dir, { skipJs = false, onlyAssets = false, skipNative = true } = {}) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      if (name.startsWith(".") || (skipNative ? SKIP_DIRS.has(name) : name === "node_modules")) continue;
      out.push(...walk(p, { skipJs, onlyAssets, skipNative }));
    } else if (onlyAssets ? ASSET_RE.test(name) : !(skipJs && JS_RE.test(name))) {
      out.push(p);
    }
  }
  return out;
}

/** Finds `<dep>/package.json` the way Node does, from a package's real directory. */
function locate(dep, fromDir) {
  for (let d = fromDir; ; d = path.dirname(d)) {
    const candidate = path.join(d, "node_modules", dep, "package.json");
    if (fs.existsSync(candidate)) return candidate;
    if (path.dirname(d) === d) return null;
  }
}

/** External packages in the installed closure of `pkgDir`, as sorted name@version. */
export function dependencyClosure(pkgDir) {
  const seen = new Set();
  const external = new Set();
  const queue = [fs.realpathSync(pkgDir)];
  while (queue.length) {
    const dir = queue.shift();
    if (seen.has(dir)) continue;
    seen.add(dir);
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.optionalDependencies };
    for (const dep of Object.keys(deps).sort()) {
      const found = locate(dep, dir);
      if (!found) continue;
      const real = fs.realpathSync(path.dirname(found));
      if (real.split(path.sep).includes("node_modules")) {
        const depPkg = JSON.parse(fs.readFileSync(path.join(real, "package.json"), "utf8"));
        external.add(`${depPkg.name ?? dep}@${depPkg.version ?? "0.0.0"}`);
      }
      queue.push(real);
    }
  }
  return [...external].sort();
}

export function fingerprint({ platform, extras = [], repo = REPO }) {
  const mobile = path.join(repo, "apps/mobile");
  const rel = (p) => path.relative(repo, p).split(path.sep).join("/");
  const files = [
    ...["app.json", "app.config.js", "eas.json", "package.json"].map((f) => path.join(mobile, f)),
    ...walk(path.join(mobile, "plugins"), { skipNative: false }),
    ...walk(path.join(mobile, "targets"), { skipNative: false }),
    ...walk(path.join(mobile, "modules"), { skipJs: true, skipNative: false }),
    ...walk(mobile, { onlyAssets: true }),
    ...walk(path.join(repo, "packages"), { onlyAssets: true }),
    ...[
      "scripts/qa/build-ios-sim.sh",
      "scripts/qa/build-android-apk.sh",
      "scripts/qa/ios-build-helpers.sh",
      "scripts/qa/sign-ios-simulator-app.sh",
      "scripts/qa/simulator-keychain-entitlements.mjs",
      "scripts/qa/device/patch-native.sh",
      "scripts/qa/device/swap-bundle.sh",
      "scripts/qa/device/native-fingerprint.mjs",
    ].map((f) => path.join(repo, f)),
  ].filter((f) => fs.existsSync(f));
  const unique = [...new Set(files)].sort();
  const fileHashes = unique.map((f) => `${rel(f)} ${sha(fs.readFileSync(f))}`);
  const closure = dependencyClosure(mobile);
  const manifest = { platform, extras, files: fileHashes, packages: closure };
  const hash = sha(JSON.stringify(manifest)).slice(0, 40);
  return { key: `device-native-${platform}-${hash}`, manifest };
}

export function main(argv) {
  const args = { extras: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--platform") args.platform = argv[++i];
    else if (a === "--extra") args.extras.push(argv[++i] ?? "");
    else if (a === "--manifest") args.manifest = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  if (!["ios", "android"].includes(args.platform)) throw new Error("--platform must be ios or android");
  const { key, manifest } = fingerprint({ platform: args.platform, extras: args.extras });
  if (args.manifest) {
    fs.mkdirSync(path.dirname(args.manifest), { recursive: true });
    fs.writeFileSync(args.manifest, `${JSON.stringify({ key, ...manifest }, null, 2)}\n`);
  }
  console.error(`native-fingerprint: ${manifest.files.length} files, ${manifest.packages.length} packages -> ${key}`);
  process.stdout.write(`${key}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`native-fingerprint: ${err.message}`);
    process.exitCode = 2;
  }
}
