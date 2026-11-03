import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * CU17 / D-W3b-12: nothing may pass a `timeZone` option to `Intl` directly.
 *
 * Hermes on iOS rejects canonical IANA names that Apple's
 * `NSTimeZone.knownTimeZoneNames` omits, so a direct call red-boxes the app
 * for an `Asia/Kolkata` user. `zonedDateTimeFormat` (packages/core/src/zone.ts)
 * is the only place allowed to build a zoned formatter.
 *
 * A vitest scan rather than an eslint rule: one check covers both
 * `packages/core/src` and `apps/mobile/src`, which lint separately under their
 * own configs, and it can say precisely what to do instead.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");

/**
 * Scanned trees, relative to the repo root, each with the floor its file count
 * must stay above. Per-tree floors, not one global number: with a single
 * global threshold, dropping `packages/core/src` (33 files) from this list
 * still left 161 and passed silently — blinding the guard to the very package
 * the resolver lives in.
 */
const TREES: readonly { tree: string; minFiles: number }[] = [
  { tree: "packages/core/src", minFiles: 25 },
  { tree: "apps/mobile/src", minFiles: 100 },
];

/** The resolver itself, which must construct the real formatter. */
const EXEMPT = ["packages/core/src/zone.ts"];

const SOURCE_EXTENSIONS = [".ts", ".tsx"];

function isTestFile(path: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(path) || /(^|\/)(test|__tests__)\//.test(path);
}

function sourceFiles(tree: string): string[] {
  const root = join(REPO_ROOT, tree);
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) continue;
      const rel = relative(REPO_ROOT, full).split("\\").join("/");
      if (isTestFile(rel) || EXEMPT.includes(rel)) continue;
      out.push(full);
    }
  };
  walk(root);
  return out;
}

/**
 * Detection reads the formatter's actual argument list, not a fixed window of
 * characters around the call.
 *
 * An earlier version matched `timeZone\s*:` inside `[^)]{0,600}` of the call
 * site, and that window could be walked straight out of: `{ timeZone }`
 * property shorthand (the idiomatic shape, in a codebase that names the
 * variable `timeZone` throughout), a quoted `"timeZone"` key, a spread such
 * as `{ ...baseOpts(), timeZone: tz }` whose inner `)` ended the window
 * early, a key beyond 600 characters, and
 * `Date.prototype.toLocaleDateString.call(...)`. Any fixed window has such a
 * hole.
 *
 * Widening it to the whole file was tried and rejected: `timeZone` is a
 * parameter name throughout `apps/mobile`, so a file-level match flags
 * `trainee/ProgressTab.tsx:143` — `new Intl.DateTimeFormat("en-IN", { month:
 * "short" })`, a no-zone formatter the spec itself lists as unaffected. A
 * guard that cries wolf on correct code gets switched off.
 *
 * So: find each direct formatter call, walk its arguments to the matching
 * close paren with bracket balancing (skipping string and template
 * literals), and look for `timeZone` as an option key or shorthand *in those
 * arguments*. No length limit, nesting-safe, and an options object passed by
 * name is followed to its declaration.
 */

/** `timeZone` as an object key or ES6 shorthand, quoted or not. */
const ZONE_AS_OPTION = /(?:["']timeZone["']|\btimeZone)\s*[:,}]/;

/**
 * The start of a directly built formatter, including `.call` / `.apply`
 * indirection. `Intl.DateTimeFormat` with **empty** arguments is handled by
 * the argument scan rather than excluded here: `...().resolvedOptions()
 * .timeZone` is how you read the device's own zone, which passes no option
 * and is legitimate.
 */
const CALL_START =
  /(?:\bIntl\s*\.\s*DateTimeFormat|\.toLocale(?:Date|Time|)String)(?:\s*\.\s*(?:call|apply))?\s*\(/g;

/** Text between `(` at `open` and its matching `)`, or null if unbalanced. */
function argumentsAt(text: string, open: number): string | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return null;
}

/** An options object passed by name: `const opts = { … timeZone … }`. */
function namedOptionsCarryZone(text: string, args: string): boolean {
  const byName = args.split(",").map((part) => part.trim());
  return byName.some((part) => {
    if (!/^[A-Za-z_$][\w$]*$/.test(part)) return false;
    const declaration = new RegExp(
      `\\b(?:const|let|var)\\s+${part}\\s*(?::[^=]*)?=\\s*\\{`,
    ).exec(text);
    if (!declaration) return false;
    const brace = text.indexOf("{", declaration.index);
    const body = argumentsAt(text, brace);
    // argumentsAt strips the closing brace, so restore it: a trailing
    // shorthand (`{ hour: "2-digit", timeZone }`) needs it to match.
    return body !== null && ZONE_AS_OPTION.test(`${body}}`);
  });
}

/** Does this source text build a zoned formatter without the resolver? */
function bypasses(text: string): boolean {
  CALL_START.lastIndex = 0;
  for (let m = CALL_START.exec(text); m !== null; m = CALL_START.exec(text)) {
    const open = m.index + m[0].length - 1;
    const args = argumentsAt(text, open);
    if (args === null) continue;
    if (ZONE_AS_OPTION.test(args)) return true;
    if (namedOptionsCarryZone(text, args)) return true;
  }
  return false;
}

describe("Intl timeZone bypass guard (D-W3b-12)", () => {
  const files = TREES.flatMap(({ tree }) => sourceFiles(tree));

  it.each(TREES)(
    "still scans $tree (at least $minFiles files)",
    ({ tree, minFiles }) => {
      // If a tree is renamed or dropped, the guard must fail loudly rather
      // than keep passing on whatever is left.
      expect(sourceFiles(tree).length).toBeGreaterThan(minFiles);
    },
  );

  it("finds no direct Intl timeZone call outside the resolver", () => {
    const offenders = files
      .filter((file) => bypasses(readFileSync(file, "utf8")))
      .map((file) => relative(REPO_ROOT, file).split("\\").join("/"));

    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `These files pass a timeZone option to Intl directly, which throws on ` +
          `Hermes/iOS for zones Apple does not list (CU17). Use ` +
          `zonedDateTimeFormat from @fitbud/core instead:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  /**
   * One sample per shape, each carrying exactly the feature it is named for.
   * The previous shorthand sample also contained `timeZone: tz`, so it passed
   * on the colon form alone — the suite looked like it proved shorthand
   * coverage while proving nothing about it. That is the self-concealing check
   * this batch has logged repeatedly, and it has no business in the guard
   * built to stop regressions.
   */
  it.each([
    ["colon form", 'new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata" })'],
    [
      "property shorthand, and nothing else",
      'new Intl.DateTimeFormat("en-GB", {\n  hour: "2-digit",\n  timeZone,\n})',
    ],
    ["shorthand as the only option", 'new Intl.DateTimeFormat("en-GB", { timeZone })'],
    ["quoted key", 'new Intl.DateTimeFormat("en-GB", { "timeZone": tz })'],
    [
      "spread before the key",
      'new Intl.DateTimeFormat("en-GB", { ...baseOpts(), timeZone: tz })',
    ],
    [
      "options object built separately",
      'const opts = { hour: "2-digit", timeZone };\nnew Intl.DateTimeFormat("en-GB", opts)',
    ],
    [
      "key far beyond any fixed window",
      'new Intl.DateTimeFormat("en-GB", {\n' + "  // pad\n".repeat(120) + "  timeZone,\n})",
    ],
    ["computed locale", "new Intl.DateTimeFormat(locale(), { timeZone: tz })"],
    ["no new keyword", 'Intl.DateTimeFormat("en-US", { timeZone: zone, hour12: false })'],
    ["toLocaleDateString", 'd.toLocaleDateString("en-IN", { timeZone: "UTC" })'],
    ["toLocaleDateString shorthand", 'd.toLocaleDateString(locale, { timeZone })'],
    ["toLocaleTimeString", 'd.toLocaleTimeString("en-IN", { timeZone: tz })'],
    ["toLocaleString", 'd.toLocaleString("en-IN", { timeZone: tz })'],
    [
      "Date.prototype .call",
      'Date.prototype.toLocaleDateString.call(d, "en-IN", { timeZone: tz })',
    ],
  ])("would catch a bypass: %s", (_shape, sample) => {
    expect(bypasses(sample)).toBe(true);
  });

  it.each([
    ["a formatter with no zone", 'new Intl.DateTimeFormat("en-IN", { weekday: "short" })'],
    ["a number formatter", 'new Intl.NumberFormat("en-IN").format(n)'],
    [
      "reading the device's own zone",
      "const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;",
    ],
    ["the resolver's own helper", 'zonedDateTimeFormat("en-IN", { timeZone: tz })'],
    ["a variable merely named timeZone", 'const timeZone: string = me?.timezone ?? "UTC";'],
    [
      "the device zone read beside a resolver call",
      "const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;\n" +
        'zonedDateTimeFormat("en-IN", { timeZone: tz });',
    ],
  ])("does not fire on %s", (_shape, sample) => {
    expect(bypasses(sample)).toBe(false);
  });
});

/**
 * CU17 also moved the trainer screens off a hardcoded `Asia/Kolkata` onto the
 * trainer's own stored zone. CU6's render harness has not merged, so this is a
 * source assertion rather than a render test: it pins the regression that
 * actually shipped (a constant nobody noticed) without pretending to exercise
 * the component.
 */
describe("trainer screens take their zone from the profile (D-W3b-11 (a))", () => {
  const TRAINER_SCREENS = [
    "apps/mobile/src/trainer/AttentionTab.tsx",
    "apps/mobile/src/trainer/ClientsTab.tsx",
    "apps/mobile/src/trainer/CheckinReviewScreen.tsx",
  ];

  it.each(TRAINER_SCREENS)("%s hardcodes no time zone", (rel) => {
    const text = readFileSync(join(REPO_ROOT, rel), "utf8");
    expect(text).not.toContain("Asia/Kolkata");
    expect(text).not.toContain("Asia/Calcutta");
    expect(text).not.toContain("TRAINER_ZONE");
  });

  it.each(TRAINER_SCREENS)("%s reads me.timezone", (rel) => {
    const text = readFileSync(join(REPO_ROOT, rel), "utf8");
    expect(text).toMatch(/me\?\.timezone\s*\?\?\s*"UTC"/);
  });
});
