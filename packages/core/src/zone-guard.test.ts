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

/** Scanned trees, relative to the repo root. */
const TREES = ["packages/core/src", "apps/mobile/src"];

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
 * A direct Intl construction or `toLocale*String` call carrying a `timeZone`
 * option. Matched over the whole file text so a multi-line options object is
 * caught too; the window is bounded so an unrelated later `timeZone:` cannot
 * be blamed on an earlier formatter.
 */
const DIRECT_INTL_WITH_ZONE =
  /(?:new\s+Intl\.DateTimeFormat|Intl\.DateTimeFormat|\.toLocale(?:Date|Time|)String)\s*\([^)]{0,600}?\btimeZone\s*:/s;

describe("Intl timeZone bypass guard (D-W3b-12)", () => {
  const files = TREES.flatMap(sourceFiles);

  it("scans a non-empty set of source files", () => {
    // If the trees move, the guard must fail loudly rather than pass vacuously.
    expect(files.length).toBeGreaterThan(100);
  });

  it("finds no direct Intl timeZone call outside the resolver", () => {
    const offenders = files
      .filter((file) => DIRECT_INTL_WITH_ZONE.test(readFileSync(file, "utf8")))
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

  it("would catch a bypass: the pattern matches the shapes it is meant to stop", () => {
    const bypasses = [
      'new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata" })',
      'new Intl.DateTimeFormat("en-GB", {\n  hour: "2-digit",\n  timeZone,\n  timeZone: tz,\n})',
      'Intl.DateTimeFormat("en-US", { timeZone: zone, hour12: false })',
      'd.toLocaleDateString("en-IN", { timeZone: "UTC" })',
      'd.toLocaleTimeString("en-IN", { timeZone: tz })',
      'd.toLocaleString("en-IN", { timeZone: tz })',
    ];
    for (const sample of bypasses) {
      expect(DIRECT_INTL_WITH_ZONE.test(sample), sample).toBe(true);
    }
  });

  it("does not fire on a formatter that takes no zone", () => {
    const allowed = [
      'new Intl.DateTimeFormat("en-IN", { weekday: "short" })',
      'new Intl.NumberFormat("en-IN").format(n)',
      'Intl.DateTimeFormat().resolvedOptions().timeZone',
      'zonedDateTimeFormat("en-IN", { timeZone: tz })',
      'const timeZone: string = me?.timezone ?? "UTC";',
    ];
    for (const sample of allowed) {
      expect(DIRECT_INTL_WITH_ZONE.test(sample), sample).toBe(false);
    }
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
