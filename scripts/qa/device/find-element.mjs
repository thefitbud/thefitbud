#!/usr/bin/env node
// Finds an on-screen element outside the app, for the lock-screen taps Maestro cannot
// make (Z12-35). Reads a screen dump and prints the centre of the first match as "x y".
//
//   node scripts/qa/device/find-element.mjs --format idb         --match <regex> [--type <AX type>] <dump.json>
//   node scripts/qa/device/find-element.mjs --format uiautomator --match <regex> [--package <pkg>] <dump.xml>
//
//   idb          `idb ui describe-all --json` (iOS simulator, springboard included):
//                elements with AXLabel / AXValue / title, `type` and a `frame` in points,
//                which is what `idb ui tap` takes.
//   uiautomator  `adb shell uiautomator dump` XML: <node text= content-desc= package=
//                bounds="[x1,y1][x2,y2]">, in pixels, which is what `input tap` takes.
//
// The match is a case-insensitive regex over the element's visible text (label, value,
// title / text, content-desc). Elements with no area are skipped. Exit 0 and print
// "x y" on a match, exit 1 and print nothing when there is none, 2 on bad input.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Elements from `idb ui describe-all --json` (an array, or JSON lines). */
export function parseIdb(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  let items;
  try {
    items = JSON.parse(trimmed);
  } catch {
    items = trimmed.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  }
  if (!Array.isArray(items)) items = [items];
  return items.map((e) => {
    const f = e.frame ?? {};
    return {
      text: [e.AXLabel, e.AXValue, e.title].filter((v) => typeof v === "string" && v).join(" "),
      type: e.type ?? e.role ?? "",
      package: "",
      x: Number(f.x ?? 0),
      y: Number(f.y ?? 0),
      width: Number(f.width ?? 0),
      height: Number(f.height ?? 0),
    };
  });
}

function attr(node, name) {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(node);
  return m ? m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : "";
}

/** Elements from an `adb shell uiautomator dump` XML file. */
export function parseUiautomator(xml) {
  const out = [];
  for (const m of xml.matchAll(/<node\b[^>]*>/g)) {
    const node = m[0];
    const b = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(attr(node, "bounds"));
    if (!b) continue;
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    out.push({
      text: [attr(node, "text"), attr(node, "content-desc")].filter(Boolean).join(" "),
      type: attr(node, "class"),
      package: attr(node, "package"),
      x: x1,
      y: y1,
      width: x2 - x1,
      height: y2 - y1,
    });
  }
  return out;
}

/** First element whose text matches; optional type / package filters. */
export function findElement(elements, { match, type, pkg }) {
  const re = new RegExp(match, "i");
  return (
    elements.find(
      (e) =>
        e.width > 0 &&
        e.height > 0 &&
        re.test(e.text) &&
        (!type || e.type === type) &&
        (!pkg || e.package === pkg),
    ) ?? null
  );
}

export function centre(e) {
  return { x: Math.round(e.x + e.width / 2), y: Math.round(e.y + e.height / 2) };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (["--format", "--match", "--type", "--package"].includes(a)) args[a.slice(2)] = argv[++i];
    else if (a.startsWith("--")) throw new Error(`unknown argument ${a}`);
    else args.file = a;
  }
  if (!["idb", "uiautomator"].includes(args.format)) throw new Error("--format must be idb or uiautomator");
  if (!args.match) throw new Error("--match is required");
  if (!args.file) throw new Error("a dump file is required");
  return args;
}

export function main(argv) {
  const args = parseArgs(argv);
  const text = fs.readFileSync(args.file, "utf8");
  const elements = args.format === "idb" ? parseIdb(text) : parseUiautomator(text);
  const hit = findElement(elements, { match: args.match, type: args.type, pkg: args.package });
  if (!hit) {
    console.error(`find-element: nothing matches /${args.match}/i among ${elements.length} elements`);
    return 1;
  }
  const { x, y } = centre(hit);
  console.error(`find-element: "${hit.text.slice(0, 80)}" (${hit.type}) at ${x},${y}`);
  process.stdout.write(`${x} ${y}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`find-element: ${err.message}`);
    process.exitCode = 2;
  }
}
