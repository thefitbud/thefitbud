import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/run-command.js", () => ({ runCommandSync: vi.fn() }));

const { runCommandSync } = await import("./lib/run-command.js");
const { LOCAL_FILES, REMOTE_FILES, runLibrarySeed } = await import("./library-seed.js");
const { MAX_CHUNK_BYTES } = await import("./lib/sql-chunk.js");

const run = vi.mocked(runCommandSync);

describe("library-seed (I2d)", () => {
  let chunkDir: string;
  let logs: string[];
  let errors: string[];
  const seed = (argv: string[]) =>
    runLibrarySeed(argv, {
      run,
      log: (line) => logs.push(line),
      error: (line) => errors.push(line),
      chunkDir: () => chunkDir,
    });
  /** Seed file (relative) behind each wrangler call, chunk files mapped back to their source. */
  const sourceOf = (file: string) => {
    const chunk = /^(.+)\.part\d+of\d+\.sql$/.exec(path.basename(file));
    return chunk ? `sql/${chunk[1]}.sql` : path.relative(path.resolve(__dirname, "../seed/library"), file);
  };
  const filesRun = () => run.mock.calls.map(([, args]) => sourceOf(args![args!.indexOf("--file") + 1]!));

  beforeEach(() => {
    run.mockReset();
    logs = [];
    errors = [];
    chunkDir = mkdtempSync(path.join(tmpdir(), "fitbud-library-seed-test-"));
  });
  afterEach(() => {
    rmSync(chunkDir, { recursive: true, force: true });
  });

  it("lists the local and remote orders the spec fixes", () => {
    expect(LOCAL_FILES).toEqual([
      "00_wipe_legacy_dev.sql",
      "sql/01_lookups.sql",
      "sql/02_foods.sql",
      "sql/02b_food_extras.sql",
      "sql/03_exercises.sql",
      "sql/03b_exercise_base.sql",
      "sql/04_templates.sql",
      "sql/05_search.sql",
      "sql/06_seed_version.sql",
      "07_post_wipe_dev.sql",
      "sql/08_post_seed.sql",
      "sql/05_search.sql",
    ]);
    expect(REMOTE_FILES).toEqual(LOCAL_FILES.filter((f) => f !== "00_wipe_legacy_dev.sql" && f !== "07_post_wipe_dev.sql"));
  });

  it("runs the local order against local D1, skipping only the comment-only 02b", () => {
    expect(seed([])).toBe(0);
    // Consecutive chunks of one file collapse to that file.
    const files = filesRun().filter((f, i, all) => f !== all[i - 1]);
    expect(files).toEqual(LOCAL_FILES.filter((f) => f !== "sql/02b_food_extras.sql"));
    expect(filesRun().filter((f) => f === "sql/02_foods.sql").length).toBeGreaterThan(1);
    for (const [command, args] of run.mock.calls) {
      expect(command).toBe("pnpm");
      expect(args).toEqual(expect.arrayContaining(["d1", "execute", "fitbud", "--local"]));
      expect(args).not.toContain("--remote");
    }
    expect(logs).toContain("→ sql/02b_food_extras.sql (no statements, skipped)");
  });

  it.each([
    [["--remote"], /--env staging or --env production/],
    [["--remote", "--yes"], /--env staging or --env production/],
    [["--remote", "--yes", "--env", "dev"], /--env staging or --env production/],
    [["--remote", "--env", "staging"], /add --yes/],
    [["--remote", "--env=production", "--print"], /add --yes/],
    [["--env", "staging", "--yes"], /only used with --remote/],
    [["--remote", "--yes", "--env", "staging", "--prnt"], /unknown argument "--prnt"/],
    [["--remote", "--yes", "--env", "staging", "--dry-run"], /unknown argument "--dry-run"/],
    [["--remote", "--yes", "--env", "staging", "--env", "production"], /more than once/],
  ])("exits 1 before any wrangler call for %j", (argv, message) => {
    expect(seed(argv)).toBe(1);
    expect(run).not.toHaveBeenCalled();
    expect(errors.join("\n")).toMatch(message);
  });

  it("prints the staging plan without 00/07, in list order, chunks ≤ 5 MB, and runs nothing", () => {
    expect(seed(["--remote", "--yes", "--env", "staging", "--print"])).toBe(0);
    expect(run).not.toHaveBeenCalled();
    const commands = logs.filter((line) => line.startsWith("pnpm "));
    for (const line of commands) {
      expect(line).toContain("wrangler d1 execute fitbud-staging --env staging --remote --file ");
      expect(line).not.toMatch(/00_wipe_legacy_dev|07_post_wipe_dev/);
    }
    const files = commands.map((line) => line.slice(line.indexOf("--file ") + "--file ".length));
    const sources = files.map(sourceOf);
    const collapsed = sources.filter((f, i) => f !== sources[i - 1]);
    expect(collapsed).toEqual(REMOTE_FILES.filter((f) => f !== "sql/02b_food_extras.sql"));
    for (const file of files) expect(statSync(file).size).toBeLessThanOrEqual(MAX_CHUNK_BYTES);
    expect(sources.filter((f) => f === "sql/02_foods.sql").length).toBeGreaterThan(1);
    expect(sources.filter((f) => f === "sql/03b_exercise_base.sql").length).toBeGreaterThan(1);
    expect(logs).toContain("# sql/02b_food_extras.sql: no statements, skipped");
  });

  it("exits 1 with a message, not a stack trace, when a seed file is missing", () => {
    const code = runLibrarySeed([], {
      run,
      log: (line) => logs.push(line),
      error: (line) => errors.push(line),
      chunkDir: () => chunkDir,
      seedDir: chunkDir,
    });
    expect(code).toBe(1);
    expect(run).not.toHaveBeenCalled();
    expect(errors.join("\n")).toMatch(/Missing seed file: .*00_wipe_legacy_dev\.sql/);
  });

  it("targets fitbud-prod for production", () => {
    expect(seed(["--remote", "--yes", "--env=production", "--print"])).toBe(0);
    expect(run).not.toHaveBeenCalled();
    const commands = logs.filter((line) => line.startsWith("pnpm "));
    expect(commands.length).toBeGreaterThan(0);
    for (const line of commands) expect(line).toContain("wrangler d1 execute fitbud-prod --env production --remote --file ");
  });
});

describe("library-seed remote chunks load into D1 (I2d)", () => {
  it("applies the staging plan chunk by chunk, one transaction each, twice, with foreign keys on", async () => {
    const { planSeed } = await import("./library-seed.js");
    const { createMemoryDb } = await import("../src/test-support/memory-db.js");
    const { foreignKeyViolations } = await import("../src/test-support/foreign-key-check.js");
    const { readFileSync } = await import("node:fs");
    const dir = mkdtempSync(path.join(tmpdir(), "fitbud-library-seed-load-"));
    const handle = await createMemoryDb({ foreignKeys: true });
    try {
      const steps = planSeed({ mode: "remote", env: "staging", print: false }, { chunkDir: () => dir });
      const one = (sql: string) => Number(handle.sqlite.exec(sql)[0]?.values[0]?.[0] ?? 0);
      for (let pass = 0; pass < 2; pass += 1) {
        for (const step of steps) {
          if (step.skip) continue;
          const file = step.args[step.args.indexOf("--file") + 1]!;
          handle.sqlite.exec("BEGIN");
          handle.sqlite.exec(readFileSync(file, "utf8"));
          handle.sqlite.exec("COMMIT");
        }
        expect(one("SELECT count(*) FROM food_library_items WHERE ownership = 'global' AND seed_version = '2026.10.9'")).toBe(1243);
        expect(one("SELECT count(*) FROM exercise_library_items WHERE ownership = 'global' AND status = 'active'")).toBe(1362);
        expect(one("SELECT count(*) FROM exercise_library_media")).toBe(919);
        expect(one("SELECT count(*) FROM exercise_library_instructions")).toBe(14037);
        expect(foreignKeyViolations(handle.sqlite)).toEqual([]);
      }
    } finally {
      handle.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 240_000);
});
