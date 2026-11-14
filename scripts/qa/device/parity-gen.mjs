#!/usr/bin/env node
// Generates the rows of docs/qa/W12/parity.md from docs/design/v3/screen-profile.md
// (Z12-35; the matrix itself is prompt §2 Z12-58 and §3).
//
//   node scripts/qa/device/parity-gen.mjs                 # update docs/qa/W12/parity.md in place
//   node scripts/qa/device/parity-gen.mjs --check         # exit 1 if rows are missing; writes nothing
//   node scripts/qa/device/parity-gen.mjs --stdout        # print the result instead of writing
//   node scripts/qa/device/parity-gen.mjs --profile <md> --out <md> --repo <dir>
//
// One row per screen ID x theme (light, dark), in screen-profile order. The screen
// ID is the file-name prefix: `TR-26e-custom-food` -> `TR-26e`, `W-03b-active-end-of-list`
// -> `W-03b`.
//
// Idempotent and non-destructive. The generator owns no cell that a person or an
// agent has filled in:
//   * an existing table is found by its header and its columns are matched by name,
//     so the column order and wording of the committed file win;
//   * an existing row (same screen ID and theme) keeps every non-empty cell; only an
//     empty cell is filled, and only the screenshot and mock columns have defaults;
//   * a row the profile no longer lists is kept, after the generated rows, and named
//     on stderr;
//   * text before and after the table is kept byte for byte.
// Running it twice gives the same file.
//
// Node built-ins only, like the rest of scripts/qa, so the qa-scripts job runs its
// test without `pnpm install`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, "../../..");

export const THEMES = ["light", "dark"];

/** Canonical columns, in the order of the prompt's row template (§3). */
export const COLUMNS = [
  { key: "id", title: "Screen ID" },
  { key: "theme", title: "Theme" },
  { key: "reachable", title: "Reachable (how)" },
  { key: "ios", title: "iOS" },
  { key: "android", title: "Android" },
  { key: "shots", title: "App screenshots" },
  { key: "mock", title: "Mock" },
  { key: "remaining", title: "Remaining differences" },
];

/** Maps one header cell to a canonical key, or null for a column we do not know. */
export function columnKey(header) {
  const h = header.toLowerCase().replace(/\s+/g, " ").trim();
  if (/screenshot|\bshots?\b|app shot/.test(h)) return "shots";
  if (/\bmock/.test(h)) return "mock";
  if (/screen|^id$/.test(h)) return "id";
  if (/theme/.test(h)) return "theme";
  if (/reach/.test(h)) return "reachable";
  if (/android/.test(h)) return "android";
  if (/\bios\b/.test(h)) return "ios";
  if (/remain|difference|notes?\b|gap reason/.test(h)) return "remaining";
  return null;
}

/** Splits a Markdown table line into cells, honouring `\|` escapes. */
export function splitRow(line) {
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "\\" && body[i + 1] === "|") {
      cur += "\\|";
      i++;
    } else if (ch === "|") {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function isTableLine(line) {
  return /^\s*\|/.test(line);
}

function isSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
}

/** Screen ID from a slug: the first two hyphen-separated parts. */
export function screenIdOf(slug) {
  const m = /^([A-Z]+)-([0-9][0-9a-z]*)(?:-|$)/.exec(slug);
  return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * Reads screen-profile.md. Every table row whose first cell is a backticked slug
 * with a PNG cell becomes one screen, in file order.
 */
export function parseProfile(text) {
  const screens = [];
  const seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!isTableLine(line) || isSeparator(line)) continue;
    const cells = splitRow(line);
    const slug = /^`([^`]+)`$/.exec(cells[0] ?? "")?.[1];
    const png = /`([^`]+\.png)`/.exec(cells[2] ?? "")?.[1];
    if (!slug || !png) continue;
    const id = screenIdOf(slug);
    if (!id) continue;
    if (seen.has(id)) throw new Error(`screen-profile lists ${id} twice`);
    seen.add(id);
    screens.push({ id, slug, png, purpose: cells[3] ?? "" });
  }
  return screens;
}

/** Default cells for one generated row. `repo` is used to check the dark mock exists. */
export function defaultRow(screen, theme, { repo = REPO, profileDir = "docs/design/v3" } = {}) {
  const light = path.posix.join(profileDir, screen.png);
  const dark = light.replace(/\/png\//, "/png-dark/");
  let mock = theme === "light" ? light : dark;
  if (theme === "dark" && !fs.existsSync(path.join(repo, dark))) {
    mock = `${dark} (missing)`;
  }
  return {
    id: screen.id,
    theme,
    reachable: "",
    ios: "",
    android: "",
    shots: `shots/${screen.id}-${theme}-ios.png, shots/${screen.id}-${theme}-android.png`,
    mock,
    remaining: "",
  };
}

const PREAMBLE = `# W12 parity matrix

One row per v3 screen ID and theme (prompt §2 Z12-58, §3). Verdicts are MATCH, CLOSE or
GAP; never claim a pixel match. Every "no" or GAP needs a reason and a fix PR or a listed
follow-up. Rows are generated by \`node scripts/qa/device/parity-gen.mjs\` from
\`docs/design/v3/screen-profile.md\`; re-running it keeps every filled cell.

`;

function escapeCell(value) {
  return String(value ?? "").replace(/\n/g, " ").replace(/(?<!\\)\|/g, "\\|");
}

function formatRow(cells) {
  return `| ${cells.map(escapeCell).join(" | ")} |`;
}

/**
 * Finds the parity table: the first table whose header maps both an id and a theme
 * column. Returns null when there is none.
 */
export function findTable(lines) {
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!isTableLine(lines[i]) || !isSeparator(lines[i + 1])) continue;
    const keys = splitRow(lines[i]).map(columnKey);
    if (!keys.includes("id") || !keys.includes("theme")) continue;
    let end = i + 2;
    while (end < lines.length && isTableLine(lines[end])) end++;
    return { start: i, end, header: splitRow(lines[i]), separator: lines[i + 1], keys };
  }
  return null;
}

/**
 * Merges the generated rows into `existing` (the current parity.md text, or "").
 * Returns { text, added, kept, orphans }.
 */
export function mergeParity(existing, screens, options = {}) {
  const lines = existing ? existing.split("\n") : [];
  const table = lines.length ? findTable(lines) : null;

  const header = table ? table.header : COLUMNS.map((c) => c.title);
  const keys = table ? table.keys : COLUMNS.map((c) => c.key);
  const separator = table ? table.separator : `|${COLUMNS.map(() => "---").join("|")}|`;

  // Existing rows, keyed by "ID theme". A row with a key we cannot read is kept as-is.
  const existingRows = new Map();
  const unreadable = [];
  if (table) {
    for (const line of lines.slice(table.start + 2, table.end)) {
      const cells = splitRow(line);
      const id = cells[keys.indexOf("id")]?.replace(/`/g, "").trim();
      const theme = cells[keys.indexOf("theme")]?.trim().toLowerCase();
      if (!id || !theme) {
        unreadable.push(line);
        continue;
      }
      const k = `${id} ${theme}`;
      if (existingRows.has(k)) throw new Error(`parity table has two rows for ${id} ${theme}`);
      existingRows.set(k, cells);
    }
  }

  const out = [];
  let added = 0;
  let kept = 0;
  const used = new Set();
  for (const screen of screens) {
    for (const theme of THEMES) {
      const k = `${screen.id} ${theme}`;
      const generated = defaultRow(screen, theme, options);
      const prior = existingRows.get(k);
      if (prior) {
        kept++;
        used.add(k);
      } else {
        added++;
      }
      const cells = header.map((_, col) => {
        const current = prior?.[col] ?? "";
        if (current !== "") return current;
        const key = keys[col];
        return key ? escapeCell(generated[key]) : "";
      });
      out.push(`| ${cells.join(" | ")} |`);
    }
  }
  const orphans = [];
  for (const [k, cells] of existingRows) {
    if (used.has(k)) continue;
    orphans.push(k);
    out.push(`| ${cells.join(" | ")} |`);
  }
  out.push(...unreadable);

  const tableLines = [table ? lines[table.start] : formatRow(header), separator, ...out];
  let text;
  if (table) {
    text = [...lines.slice(0, table.start), ...tableLines, ...lines.slice(table.end)].join("\n");
  } else if (existing) {
    text = `${existing.replace(/\n*$/, "\n\n")}${tableLines.join("\n")}\n`;
  } else {
    text = `${PREAMBLE}${tableLines.join("\n")}\n`;
  }
  return { text, added, kept, orphans };
}

function parseArgs(argv) {
  const args = { check: false, stdout: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") args.check = true;
    else if (a === "--stdout") args.stdout = true;
    else if (a === "--profile" || a === "--out" || a === "--repo") args[a.slice(2)] = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  return args;
}

export function main(argv) {
  const args = parseArgs(argv);
  const repo = path.resolve(args.repo ?? REPO);
  const profile = path.resolve(repo, args.profile ?? "docs/design/v3/screen-profile.md");
  const out = path.resolve(repo, args.out ?? "docs/qa/W12/parity.md");
  const screens = parseProfile(fs.readFileSync(profile, "utf8"));
  if (screens.length === 0) throw new Error(`no screens found in ${profile}`);
  const existing = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  const profileDir = path.relative(repo, path.dirname(profile)).split(path.sep).join("/");
  const result = mergeParity(existing, screens, { repo, profileDir });
  for (const o of result.orphans) console.error(`parity-gen: kept a row the profile no longer lists: ${o}`);
  console.error(
    `parity-gen: ${screens.length} screens, ${screens.length * THEMES.length} rows (${result.added} added, ${result.kept} kept)`,
  );
  if (args.check) {
    if (result.added > 0) {
      console.error(`parity-gen: ${result.added} rows are missing from ${path.relative(repo, out)}`);
      return 1;
    }
    return 0;
  }
  if (args.stdout) {
    process.stdout.write(result.text);
    return 0;
  }
  if (result.text !== existing) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, result.text);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`parity-gen: ${err.message}`);
    process.exitCode = 2;
  }
}
