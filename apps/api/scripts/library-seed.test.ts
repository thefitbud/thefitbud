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
  const filesRun = () => run.mock.calls.map(([, args]) => sourceOf(args[args.indexOf("--file") + 1]!));

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

  it("targets fitbud-prod for production", () => {
    expect(seed(["--remote", "--yes", "--env=production", "--print"])).toBe(0);
    expect(run).not.toHaveBeenCalled();
    const commands = logs.filter((line) => line.startsWith("pnpm "));
    expect(commands.length).toBeGreaterThan(0);
    for (const line of commands) expect(line).toContain("wrangler d1 execute fitbud-prod --env production --remote --file ");
  });
});
