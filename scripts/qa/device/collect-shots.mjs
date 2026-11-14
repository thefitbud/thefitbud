#!/usr/bin/env node
// Renames Maestro's screenshots to the gate's naming, <screen ID>-<theme>-<platform>.png
// (Z12-35, prompt §2 Z12-35 step 5).
//
//   node scripts/qa/device/collect-shots.mjs --from <maestro output dir> --to <shots dir> --theme light|dark --platform ios|android
//
// A flow names a screenshot after the v3 screen it shows (`takeScreenshot: TR-26e`, or
// `TR-26e-custom-food`); the screen ID is the file-name prefix listed in
// docs/design/v3/screen-profile.md. Those land as <to>/TR-26e-light-ios.png, which is
// the path the parity matrix and docs/qa/W12/shots/ use. Any other screenshot (the
// older flows' `today__card`, Maestro's failure screenshots) lands under <to>/flows/
// with the theme and platform appended, so nothing is lost and nothing is mistaken for
// a screen. Prints a JSON summary.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseProfile, screenIdOf } from "./parity-gen.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, "../../..");

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.toLowerCase().endsWith(".png")) out.push(p);
  }
  return out;
}

function safe(name) {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "shot";
}

/** Where one screenshot goes. `ids` is the set of known v3 screen IDs. */
export function targetFor(file, { ids, theme, platform }) {
  const base = path.basename(file).replace(/\.png$/i, "");
  const id = screenIdOf(base);
  if (id && ids.has(id)) return { kind: "screen", id, name: `${id}-${theme}-${platform}.png` };
  return { kind: "other", name: path.posix.join("flows", `${safe(base)}-${theme}-${platform}.png`) };
}

export function collect({ from, to, theme, platform, ids }) {
  const summary = { screens: [], other: [], overwritten: [] };
  for (const file of walk(from)) {
    const t = targetFor(file, { ids, theme, platform });
    const dest = path.join(to, t.name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (t.kind === "screen" && summary.screens.includes(t.name)) summary.overwritten.push(t.name);
    fs.copyFileSync(file, dest);
    (t.kind === "screen" ? summary.screens : summary.other).push(t.name);
  }
  return summary;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (["--from", "--to", "--theme", "--platform", "--profile"].includes(a)) args[a.slice(2)] = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  for (const k of ["from", "to", "theme", "platform"]) if (!args[k]) throw new Error(`--${k} is required`);
  return args;
}

export function main(argv) {
  const args = parseArgs(argv);
  const profile = path.resolve(REPO, args.profile ?? "docs/design/v3/screen-profile.md");
  const ids = new Set(parseProfile(fs.readFileSync(profile, "utf8")).map((s) => s.id));
  const summary = collect({ from: args.from, to: args.to, theme: args.theme, platform: args.platform, ids });
  for (const o of summary.overwritten) console.error(`collect-shots: ${o} was taken twice in this run; the later one is kept`);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`collect-shots: ${err.message}`);
    process.exitCode = 2;
  }
}
