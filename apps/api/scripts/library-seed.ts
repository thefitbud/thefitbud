#!/usr/bin/env node
/**
 * Load the FitBud library into D1.
 *
 * Local (default): local D1 in .wrangler/state, with the dev-only wipe (00) and redirects (07).
 * Remote: `--remote --env staging|production --yes` loads the same release into that env's D1
 * and skips 00/07. Add `--print` to list the planned wrangler commands and run nothing.
 * Files over 5 MB are split between statements into chunks before `wrangler d1 execute`.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runCommandSync } from "./lib/run-command.js";
import { chunkSqlStatements, MAX_CHUNK_BYTES } from "./lib/sql-chunk.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const seedDir = path.join(apiRoot, "seed", "library");

/** Release files in load order; FTS is rebuilt again at the end. */
export const RELEASE_FILES = [
  "sql/01_lookups.sql",
  "sql/02_foods.sql",
  "sql/02b_food_extras.sql",
  "sql/03_exercises.sql",
  "sql/03b_exercise_base.sql",
  "sql/04_templates.sql",
  "sql/05_search.sql",
  "sql/06_seed_version.sql",
];

export const LOCAL_FILES = [
  "00_wipe_legacy_dev.sql",
  ...RELEASE_FILES,
  "07_post_wipe_dev.sql",
  "sql/08_post_seed.sql",
  "sql/05_search.sql",
];

/** 00 and 07 rewrite legacy dev rows; they never run against staging or production. */
export const REMOTE_FILES = [...RELEASE_FILES, "sql/08_post_seed.sql", "sql/05_search.sql"];

export const REMOTE_DATABASES = { staging: "fitbud-staging", production: "fitbud-prod" } as const;
export type RemoteEnv = keyof typeof REMOTE_DATABASES;

export type SeedOptions =
  | { mode: "local"; print: boolean }
  | { mode: "remote"; env: RemoteEnv; print: boolean };

/** Parses argv (after the script path). Returns an error message instead of options when invalid. */
export function parseSeedArgs(argv: string[]): SeedOptions | { error: string } {
  const remote = argv.includes("--remote");
  const print = argv.includes("--print");
  let env: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--env") env = argv[i + 1];
    else if (arg.startsWith("--env=")) env = arg.slice("--env=".length);
  }
  if (!remote) {
    if (env !== undefined) return { error: "--env is only used with --remote." };
    return { mode: "local", print };
  }
  if (env !== "staging" && env !== "production") {
    return { error: "--remote needs --env staging or --env production." };
  }
  if (!argv.includes("--yes")) {
    return { error: `--remote writes to the ${env} D1 (${REMOTE_DATABASES[env]}); add --yes to confirm.` };
  }
  return { mode: "remote", env, print };
}

/** One step of a run: a wrangler call on a file or chunk, or a skipped comment-only file. */
export type SeedStep =
  | { file: string; skip: true }
  | { file: string; skip: false; chunk: string | null; args: string[] };

function wranglerArgs(options: SeedOptions, file: string): string[] {
  if (options.mode === "local") {
    return ["exec", "wrangler", "d1", "execute", "fitbud", "--local", "--persist-to", ".wrangler/state", "--file", file];
  }
  return ["exec", "wrangler", "d1", "execute", REMOTE_DATABASES[options.env], "--env", options.env, "--remote", "--file", file];
}

/** False when a file holds comments only (02b until an extra lands); wrangler rejects those. */
export function hasStatements(sql: string): boolean {
  return sql.replace(/^\s*--.*$/gm, "").trim().length > 0;
}

/**
 * The steps of a run, in load order. Files over 5 MB are written as chunks into the
 * directory `chunkDir()` returns (called once, on first need); smaller files run as they are.
 */
export function planSeed(
  options: SeedOptions,
  deps: { seedDir?: string; chunkDir?: () => string } = {},
): SeedStep[] {
  const dir = deps.seedDir ?? seedDir;
  let chunkDir: string | undefined;
  const steps: SeedStep[] = [];
  for (const rel of options.mode === "local" ? LOCAL_FILES : REMOTE_FILES) {
    const file = path.join(dir, rel);
    if (!existsSync(file)) throw new Error(`Missing seed file: ${file}`);
    const sql = readFileSync(file, "utf8");
    if (!hasStatements(sql)) {
      steps.push({ file: rel, skip: true });
      continue;
    }
    if (Buffer.byteLength(sql, "utf8") <= MAX_CHUNK_BYTES) {
      steps.push({ file: rel, skip: false, chunk: null, args: wranglerArgs(options, file) });
      continue;
    }
    chunkDir ??= (deps.chunkDir ?? (() => mkdtempSync(path.join(tmpdir(), "fitbud-library-seed-"))))();
    const chunks = chunkSqlStatements(sql);
    const base = path.basename(rel, ".sql");
    chunks.forEach((chunk, i) => {
      const chunkFile = path.join(chunkDir!, `${base}.part${i + 1}of${chunks.length}.sql`);
      writeFileSync(chunkFile, chunk);
      steps.push({ file: rel, skip: false, chunk: chunkFile, args: wranglerArgs(options, chunkFile) });
    });
  }
  return steps;
}

type Deps = {
  run: (command: string, args: string[], options: { cwd: string }) => void;
  log: (line: string) => void;
  error: (line: string) => void;
  seedDir?: string;
  chunkDir?: () => string;
};

/** Runs (or prints) the seed and returns the exit code. Bad flags exit before any wrangler call. */
export function runLibrarySeed(argv: string[], deps: Deps): number {
  const options = parseSeedArgs(argv);
  if ("error" in options) {
    deps.error(`library-seed: ${options.error}`);
    return 1;
  }
  const target =
    options.mode === "local" ? "local D1" : `${options.env} D1 ${REMOTE_DATABASES[options.env]} (remote)`;
  let chunkDir: string | undefined;
  const steps = planSeed(options, {
    seedDir: deps.seedDir,
    chunkDir: () => (chunkDir = (deps.chunkDir ?? (() => mkdtempSync(path.join(tmpdir(), "fitbud-library-seed-"))))()),
  });
  if (options.print) {
    deps.log(`Planned library seed into ${target}. Nothing is run.`);
    for (const step of steps) {
      deps.log(step.skip ? `# ${step.file}: no statements, skipped` : `pnpm ${step.args.join(" ")}`);
    }
    if (chunkDir) deps.log(`# chunk files kept in ${chunkDir}`);
    return 0;
  }
  deps.log(`Seeding FitBud library into ${target}…`);
  try {
    for (const step of steps) {
      if (step.skip) {
        deps.log(`→ ${step.file} (no statements, skipped)`);
        continue;
      }
      deps.log(step.chunk ? `→ ${step.file} (${path.basename(step.chunk)})` : `→ ${step.file}`);
      deps.run("pnpm", step.args, { cwd: apiRoot });
    }
  } finally {
    if (chunkDir && !deps.chunkDir) rmSync(chunkDir, { recursive: true, force: true });
  }
  deps.log("Library seed complete.");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(
    runLibrarySeed(process.argv.slice(2), {
      run: runCommandSync,
      log: (line) => console.log(line),
      error: (line) => console.error(line),
    }),
  );
}
