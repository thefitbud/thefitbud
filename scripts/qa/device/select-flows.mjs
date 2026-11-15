#!/usr/bin/env node
// Resolves the workflow's `flows` and `roles` inputs into the Maestro flow files to run
// (Z12-35). Prints one absolute path per line, in path order.
//
//   node scripts/qa/device/select-flows.mjs --flows <tag-or-glob[,tag-or-glob...]> [--roles trainee,trainer,dual]
//
//   flows  a comma-separated list; each item is a Maestro tag or a path glob, mixed freely
//          (e.g. launch,flows/v3/F29*.yaml): the union, in path order, each flow once.
//          A tag (letters, digits, - and _ only, e.g. smoke, full, device, z12-33) selects every
//          flow under apps/mobile/.maestro/flows/ or device/ whose `tags:` include it (device/
//          holds task-specific gate flows the nightly suite never collects). Any other item is
//          a path glob relative to apps/mobile/.maestro (`*` stays inside a directory, `**`
//          crosses them), e.g. flows/trainee/today.yaml or flows/v3/F0*.yaml. A tag or glob
//          that matches no flow is an error (exit 2); nothing is silently dropped.
//   roles  optional; keeps only the flows tagged with at least one of these roles.
//
// Only flow files are ever selected: common/ subflows (no tags, called by flows) and
// config.yaml are never run on their own. Exit 2 when nothing matches, so a typo in the
// workflow input fails loudly instead of running zero flows and passing.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MAESTRO_DIR = path.resolve(here, "../../../apps/mobile/.maestro");

/** Tags from a flow's config header (the part before `---`). */
export function flowTags(text) {
  const header = text.split(/^---\s*$/m)[0] ?? "";
  const inline = /^tags:\s*\[([^\]]*)\]/m.exec(header);
  if (inline) return inline[1].split(",").map((t) => t.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  const block = /^tags:\s*\n((?:[ \t]+-[^\n]*\n?)+)/m.exec(header);
  if (!block) return [];
  return [...block[1].matchAll(/^[ \t]+-\s*["']?([^"'\n#]+?)["']?\s*(?:#.*)?$/gm)].map((m) => m[1].trim());
}

/** `*` = within one directory, `**` = across directories, `?` = one character. */
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      re += ".*";
      i++;
      if (glob[i + 1] === "/") i++;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.ya?ml$/.test(name)) out.push(p);
  }
  return out;
}

export function selectFlows({ flows, roles = "", root = MAESTRO_DIR }) {
  const spec = String(flows ?? "").trim();
  if (!spec) throw new Error("--flows is empty");
  const roleList = String(roles).split(",").map((r) => r.trim()).filter(Boolean);
  const all = walk(root)
    .filter((f) => path.basename(f) !== "config.yaml")
    .map((f) => ({ file: f, rel: path.relative(root, f).split(path.sep).join("/") }))
    .filter((f) => !f.rel.startsWith("common/"))
    .map((f) => ({ ...f, tags: flowTags(fs.readFileSync(f.file, "utf8")) }));
  // Each comma-separated item is a tag (letters, digits, - and _ only) or a path glob (anything
  // else, e.g. it holds a / or a *). A list may mix both; the result is the union, in path
  // order, each flow once. An item that matches no flow is an error, never silently dropped.
  const items = spec.split(",").map((i) => i.trim()).filter(Boolean);
  const candidates = all.filter((f) => f.rel.startsWith("flows/") || f.rel.startsWith("device/"));
  const chosen = new Set();
  for (const item of items) {
    let hits;
    if (/^[A-Za-z0-9_-]+$/.test(item)) {
      hits = candidates.filter((f) => f.tags.includes(item));
      if (hits.length === 0) throw new Error(`tag "${item}" matches no flow`);
    } else {
      const re = globToRegExp(item);
      hits = all.filter((f) => re.test(f.rel));
      if (hits.length === 0) throw new Error(`glob "${item}" matches no flow`);
    }
    for (const h of hits) chosen.add(h.file);
  }
  let picked = all.filter((f) => chosen.has(f.file));
  if (roleList.length) picked = picked.filter((f) => f.tags.some((t) => roleList.includes(t)));
  return picked.map((f) => f.file);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--flows" || a === "--roles" || a === "--root") args[a.slice(2)] = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  return args;
}

export function main(argv) {
  const args = parseArgs(argv);
  const files = selectFlows({ flows: args.flows, roles: args.roles, root: args.root ? path.resolve(args.root) : MAESTRO_DIR });
  if (files.length === 0) {
    console.error(`select-flows: no flow matches flows="${args.flows}"${args.roles ? ` roles="${args.roles}"` : ""}`);
    return 2;
  }
  process.stdout.write(`${files.join("\n")}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`select-flows: ${err.message}`);
    process.exitCode = 2;
  }
}
