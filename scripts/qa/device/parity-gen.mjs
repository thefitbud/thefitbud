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
// Idempotent and non-destructive. The generator owns no row that exists:
//   * every table whose header has a screen-ID and a theme column is read (the
//     committed matrix has two, Trainee and Trainer, with different columns);
//   * an existing row is never rewritten, `—` placeholders included;
//   * a missing screen x theme row is appended to its own section's table (the table
//     that already holds rows with the same ID prefix: TM- rows go to Trainer), built
//     from that table's columns, `—` for anything not known yet;
//   * a row the profile no longer lists stays where it is and is named on stderr;
//   * text outside the tables is kept byte for byte.
// On the committed docs/qa/W12/parity.md it changes nothing and `--check` exits 0.
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


/** A cell nobody has filled: empty or the matrix's `—` placeholder. */
export function isPlaceholder(cell) {
  const v = String(cell ?? "").trim();
  return v === "" || v === "—" || v === "-";
}

/**
 * Every parity table in the file: each table whose header maps both an id and a theme
 * column (the committed matrix has two, Trainee and Trainer, with different columns).
 */
export function findTables(lines) {
  const tables = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!isTableLine(lines[i]) || !isSeparator(lines[i + 1])) continue;
    const header = splitRow(lines[i]);
    const keys = header.map(columnKey);
    let end = i + 2;
    while (end < lines.length && isTableLine(lines[end])) end++;
    if (keys.includes("id") && keys.includes("theme")) tables.push({ start: i, end, header, keys });
    i = end - 1;
  }
  return tables;
}

/** The first parity table, for callers that only need one. */
export function findTable(lines) {
  return findTables(lines)[0] ?? null;
}

function prefixOf(id) {
  return id.split("-")[0];
}

/**
 * Merges the generated rows into `existing` (the current parity.md text, or "").
 *
 * Existing rows are never rewritten: the generator only appends the screen x theme rows
 * that are missing, each to the table of its own section (the table already holding rows
 * with the same ID prefix, e.g. TM- rows to the Trainer table), built from that table's
 * own columns. Text outside the tables is kept byte for byte. A row the profile no longer
 * lists stays where it is and is reported. Returns { text, added, kept, orphans }.
 */
export function mergeParity(existing, screens, options = {}) {
  if (!existing) {
    const header = COLUMNS.map((c) => c.title);
    const rows = [];
    for (const screen of screens) {
      for (const theme of THEMES) {
        const g = defaultRow(screen, theme, options);
        rows.push(formatRow(COLUMNS.map((c) => (isPlaceholder(g[c.key]) ? "—" : g[c.key]))));
      }
    }
    const sep = `|${COLUMNS.map(() => "---").join("|")}|`;
    return { text: `${PREAMBLE}${[formatRow(header), sep, ...rows].join("\n")}\n`, added: rows.length, kept: 0, orphans: [] };
  }

  const lines = existing.split("\n");
  let tables = findTables(lines);
  if (tables.length === 0) {
    // A file with prose but no table: add one at the end, then merge into it.
    const header = COLUMNS.map((c) => c.title);
    lines.push(...(lines.at(-1) === "" ? [] : [""]), formatRow(header), `|${COLUMNS.map(() => "---").join("|")}|`);
    tables = findTables(lines);
  }

  const present = new Map(); // "ID theme" -> table index
  const prefixes = tables.map(() => new Set());
  tables.forEach((t, ti) => {
    const idCol = t.keys.indexOf("id");
    const themeCol = t.keys.indexOf("theme");
    for (const line of lines.slice(t.start + 2, t.end)) {
      const cells = splitRow(line);
      const id = cells[idCol]?.replace(/`/g, "").trim();
      const theme = cells[themeCol]?.trim().toLowerCase();
      if (!id || !theme) continue;
      const k = `${id} ${theme}`;
      if (present.has(k)) throw new Error(`parity tables have two rows for ${id} ${theme}`);
      present.set(k, ti);
      prefixes[ti].add(prefixOf(id));
    }
  });

  const additions = tables.map(() => []);
  const wanted = new Set();
  let added = 0;
  for (const screen of screens) {
    for (const theme of THEMES) {
      const k = `${screen.id} ${theme}`;
      wanted.add(k);
      if (present.has(k)) continue;
      let ti = prefixes.findIndex((p) => p.has(prefixOf(screen.id)));
      if (ti < 0) ti = 0;
      const g = defaultRow(screen, theme, options);
      const t = tables[ti];
      const cells = t.keys.map((key) => {
        const v = key ? g[key] : "";
        if (isPlaceholder(v)) return "—";
        return key === "mock" ? `\`${v}\`` : v;
      });
      additions[ti].push(formatRow(cells));
      added++;
    }
  }

  // Insert from the last table up, so earlier indices stay valid.
  for (let ti = tables.length - 1; ti >= 0; ti--) {
    if (additions[ti].length) lines.splice(tables[ti].end, 0, ...additions[ti]);
  }
  const orphans = [...present.keys()].filter((k) => !wanted.has(k));
  return { text: lines.join("\n"), added, kept: present.size - orphans.length, orphans };
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
