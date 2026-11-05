#!/usr/bin/env node
/**
 * Deploy the API or apply D1 migrations to a remote env (staging/production).
 *
 *   tsx scripts/deploy-env.ts <deploy|migrate> --env staging|production [--yes] [--dry-run]
 *
 * Without --yes it prints the exact Wrangler command and exits 1. --dry-run
 * runs `wrangler deploy --dry-run` (no upload, no --yes needed); migrations
 * have no dry run, so `migrate --dry-run` prints the command and exits 0.
 * Only the owner runs these for real.
 *
 * A deploy also passes `--var SENTRY_RELEASE:<commit sha>` so the Worker's Sentry
 * events carry the release (`sentryRelease` in src/lib/sentry.ts reads that var).
 * No SHA (not a checkout, or the VCS binary missing) means no var, with a warning.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatCommand, runCommandSync } from "./lib/run-command.js";

export const ENVS = ["staging", "production"] as const;
export type DeployEnv = (typeof ENVS)[number];
export type DeployAction = "deploy" | "migrate";

/** D1 database names per env (apps/api/wrangler.toml, task I4a). */
const D1_DATABASE: Record<DeployEnv, string> = {
  staging: "fitbud-staging",
  production: "fitbud-prod",
};

export type DeployArgs = {
  action: DeployAction;
  env: DeployEnv;
  yes: boolean;
  dryRun: boolean;
};

export function parseDeployArgs(argv: string[]): DeployArgs {
  const [action, ...rest] = argv;
  if (action !== "deploy" && action !== "migrate") {
    throw new Error(
      `Unknown action "${action ?? ""}". Use: deploy-env.ts <deploy|migrate> --env staging|production [--yes] [--dry-run]`,
    );
  }
  let env: string | undefined;
  let yes = false;
  let dryRun = false;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--") {
      // pnpm forwards the separator in `pnpm deploy:staging -- --dry-run`.
      continue;
    } else if (arg === "--env" || arg?.startsWith("--env=")) {
      // A second --env must not retarget a script such as deploy:staging.
      if (env !== undefined) {
        throw new Error("--env given more than once.");
      }
      if (arg === "--env") {
        env = rest[i + 1];
        i += 1;
      } else {
        env = arg.slice("--env=".length);
      }
      if (!env || env.startsWith("--")) {
        throw new Error("--env needs a value: staging or production.");
      }
    } else if (arg === "--yes") {
      yes = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else {
      throw new Error(`Unknown argument "${arg ?? ""}".`);
    }
  }
  if (!ENVS.includes(env as DeployEnv)) {
    throw new Error(`Unknown env "${env ?? ""}". Use one of: ${ENVS.join(", ")}.`);
  }
  return { action, env: env as DeployEnv, yes, dryRun };
}

const COMMIT_SHA_RE = /^[0-9a-f]{40}$/u;

/** The checked-out commit, or null when it cannot be read (never throws). */
export function readCommitSha(cwd: string): string | null {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  const sha = String(result.stdout).trim();
  return COMMIT_SHA_RE.test(sha) ? sha : null;
}

/**
 * Wrangler argv (after `pnpm exec`) for the requested action. `release`, when given,
 * is passed to a deploy as the `SENTRY_RELEASE` var; migrations ignore it.
 */
export function wranglerArgs(args: DeployArgs, release?: string | null): string[] {
  if (args.action === "deploy") {
    const base = args.dryRun
      ? ["wrangler", "deploy", "--dry-run", "--env", args.env]
      : ["wrangler", "deploy", "--env", args.env];
    return release ? [...base, "--var", `SENTRY_RELEASE:${release}`] : base;
  }
  return [
    "wrangler",
    "d1",
    "migrations",
    "apply",
    D1_DATABASE[args.env],
    "--env",
    args.env,
    "--remote",
  ];
}

/** Runs the action; returns the process exit code. */
export function runDeployEnv(
  argv: string[],
  cwd: string,
  readRelease: (cwd: string) => string | null = readCommitSha,
): number {
  let args: DeployArgs;
  try {
    args = parseDeployArgs(argv);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
  const release = args.action === "deploy" ? readRelease(cwd) : null;
  if (args.action === "deploy" && !release) {
    console.warn("No commit found: deploying without SENTRY_RELEASE.");
  }
  const command = ["exec", ...wranglerArgs(args, release)];
  const printed = formatCommand("pnpm", command);

  if (args.action === "deploy" && args.dryRun) {
    runCommandSync("pnpm", command, { cwd });
    return 0;
  }
  if (args.action === "migrate" && args.dryRun) {
    console.log(`Migrations have no dry run. Would run: ${printed}`);
    return 0;
  }
  if (!args.yes) {
    console.error(`Refusing to run against ${args.env} without --yes. Command:`);
    console.error(`  ${printed}`);
    return 1;
  }
  console.log(`→ ${printed}`);
  runCommandSync("pnpm", command, { cwd });
  return 0;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  process.exit(runDeployEnv(process.argv.slice(2), apiRoot));
}
