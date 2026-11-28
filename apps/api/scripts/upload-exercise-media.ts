#!/usr/bin/env node
/**
 * Load the exercise drawings (Z14-48) from the repo into the R2 media bucket.
 *
 *   pnpm --filter @fitbud/api media:upload-exercises -- --target local|staging|production [--dry-run] [--yes]
 *
 * The 919 CC BY-SA drawings live under
 * seed/library/incoming/exercise-base-2026.10.21-v3/media/. Each one is stored under the
 * `storage_key` that sql/03b_exercise_base.sql gives it (`exercises/<slug>/<n>.<ext>`,
 * computed by the same `mediaStorageKey` as the emit script), so D1 and the bucket agree.
 *
 * - `local` writes to the local wrangler R2 state (`.wrangler/state`, as `pnpm db:reset`
 *   and `pnpm dev` use), bucket `fitbud-media-preview`, and skips objects that already exist with
 *   the same size. The local bucket is `fitbud-media-preview`, the one `wrangler dev` reads. `pnpm db:reset` wipes D1 only, so run this once per checkout.
 * - `staging` and `production` only PRINT the exact `wrangler r2 object put ... --remote`
 *   commands. They run them only with `--yes`, and only Firoz does that. Staging keys carry
 *   the `staging/` prefix of the shared non-prod bucket (MEDIA_PREFIX in wrangler.toml).
 *   Puts overwrite, so a re-run is idempotent (the remote bucket is not listed first).
 * - `--dry-run` lists counts and missing files and touches nothing.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mediaStorageKey } from "./emit-exercise-base.js";
import { formatCommand, runCommandSync } from "./lib/run-command.js";

export const TARGETS = ["local", "staging", "production"] as const;
export type UploadTarget = (typeof TARGETS)[number];

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BASE_DIR = path.join(
  apiRoot,
  "seed/library/incoming/exercise-base-2026.10.21-v3",
);

/** Bucket and key prefix per target (apps/api/wrangler.toml). */
export const BUCKETS: Record<UploadTarget, { bucket: string; prefix: string }> = {
  // `wrangler dev` (pnpm dev) reads preview_bucket_name from wrangler.toml for local R2.
  local: { bucket: "fitbud-media-preview", prefix: "" },
  staging: { bucket: "fitbud-media-nonprod", prefix: "staging/" },
  production: { bucket: "fitbud-media-prod", prefix: "" },
};

export type UploadArgs = { target: UploadTarget; dryRun: boolean; yes: boolean };

export function parseUploadArgs(argv: string[]): UploadArgs {
  let target: string | undefined;
  let dryRun = false;
  let yes = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue; // pnpm forwards the separator
    if (arg === "--target" || arg?.startsWith("--target=")) {
      if (target !== undefined) throw new Error("--target given more than once.");
      target = arg === "--target" ? argv[i + 1] : arg.slice("--target=".length);
      if (arg === "--target") i += 1;
      if (!target || target.startsWith("--")) {
        throw new Error("--target needs a value: local, staging or production.");
      }
    } else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--yes") yes = true;
    else throw new Error(`Unknown argument "${arg ?? ""}".`);
  }
  if (!TARGETS.includes(target as UploadTarget)) {
    throw new Error(`Unknown target "${target ?? ""}". Use one of: ${TARGETS.join(", ")}.`);
  }
  return { target: target as UploadTarget, dryRun, yes };
}

export type MediaFile = {
  /** `exercises/<slug>/<n>.<ext>`, as stored in D1. */
  key: string;
  absolutePath: string;
  contentType: string;
  /** Null when the file is missing from the repo. */
  size: number | null;
};

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
};

export function contentTypeFor(key: string): string {
  const ext = path.extname(key).slice(1).toLowerCase();
  const type = CONTENT_TYPES[ext];
  if (!type) throw new Error(`No content type for ".${ext}".`);
  return type;
}

type BaseExercise = { slug: string; media?: Array<{ file: string }> };

/** Every drawing of the exercise base mapped to its storage key, in file order. */
export function planMediaFiles(baseDir: string = BASE_DIR): MediaFile[] {
  const base = JSON.parse(readFileSync(path.join(baseDir, "exercises.json"), "utf8")) as {
    exercises: BaseExercise[];
  };
  const files: MediaFile[] = [];
  for (const exercise of base.exercises) {
    (exercise.media ?? []).forEach((media, index) => {
      const key = mediaStorageKey(exercise.slug, index + 1, media.file);
      const absolutePath = path.join(baseDir, media.file);
      files.push({
        key,
        absolutePath,
        contentType: contentTypeFor(key),
        size: existsSync(absolutePath) ? statSync(absolutePath).size : null,
      });
    });
  }
  return files;
}

/** The slice of an R2 bucket binding the upload needs. */
export type MediaSink = {
  head(key: string): Promise<{ size: number } | null>;
  put(
    key: string,
    value: Uint8Array,
    options: { httpMetadata: { contentType: string } },
  ): Promise<unknown>;
};

export type UploadSummary = {
  total: number;
  missing: string[];
  uploaded: number;
  skipped: number;
};

/** Writes the files to a bucket, skipping objects that already exist with the same size. */
export async function uploadToSink(
  files: MediaFile[],
  sink: MediaSink,
  log: (line: string) => void = () => {},
): Promise<UploadSummary> {
  const summary: UploadSummary = { total: files.length, missing: [], uploaded: 0, skipped: 0 };
  for (const file of files) {
    if (file.size === null) {
      summary.missing.push(file.absolutePath);
      continue;
    }
    const existing = await sink.head(file.key);
    if (existing && existing.size === file.size) {
      summary.skipped += 1;
      continue;
    }
    await sink.put(file.key, new Uint8Array(readFileSync(file.absolutePath)), {
      httpMetadata: { contentType: file.contentType },
    });
    summary.uploaded += 1;
    if (summary.uploaded % 100 === 0) log(`  ${summary.uploaded} uploaded...`);
  }
  return summary;
}

/** `pnpm exec wrangler r2 object put ...` argv (after `pnpm`) for one file on a remote target. */
export function remotePutArgs(target: Exclude<UploadTarget, "local">, file: MediaFile): string[] {
  const { bucket, prefix } = BUCKETS[target];
  return [
    "exec",
    "wrangler",
    "r2",
    "object",
    "put",
    `${bucket}/${prefix}${file.key}`,
    "--file",
    path.relative(apiRoot, file.absolutePath).split(path.sep).join("/"),
    "--content-type",
    file.contentType,
    "--remote",
  ];
}

/**
 * Opens the local wrangler R2 state as a bucket binding. A throwaway config pins the
 * bucket name so the script never loads the Worker's own config (queues, Durable Objects).
 */
async function openLocalSink(): Promise<{ sink: MediaSink; close: () => Promise<void> }> {
  const { getPlatformProxy } = await import("wrangler");
  const dir = mkdtempSync(path.join(tmpdir(), "fitbud-r2-upload-"));
  const configPath = path.join(dir, "wrangler.json");
  writeFileSync(
    configPath,
    JSON.stringify({
      name: "fitbud-exercise-media-upload",
      compatibility_date: "2025-01-01",
      r2_buckets: [
        { binding: "MEDIA", bucket_name: BUCKETS.local.bucket, preview_bucket_name: BUCKETS.local.bucket },
      ],
    }),
  );
  const proxy = await getPlatformProxy<{ MEDIA: R2Bucket }>({
    configPath,
    persist: { path: path.join(apiRoot, ".wrangler", "state", "v3") },
  });
  return {
    sink: proxy.env.MEDIA as unknown as MediaSink,
    close: async () => {
      await proxy.dispose();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export type UploadDeps = {
  openLocalSink: typeof openLocalSink;
  runRemote: (args: string[]) => void;
  out: (line: string) => void;
  err: (line: string) => void;
};

const defaultDeps: UploadDeps = {
  openLocalSink,
  runRemote: (args) => runCommandSync("pnpm", args, { cwd: apiRoot }),
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

/** Runs the upload; returns the process exit code. */
export async function runUpload(
  argv: string[],
  files: MediaFile[] = planMediaFiles(),
  deps: UploadDeps = defaultDeps,
): Promise<number> {
  let args: UploadArgs;
  try {
    args = parseUploadArgs(argv);
  } catch (error) {
    deps.err((error as Error).message);
    return 1;
  }

  const missing = files.filter((f) => f.size === null);
  const present = files.filter((f) => f.size !== null);
  deps.out(
    `${files.length} drawings, ${present.length} present in the repo, ${missing.length} missing. Target: ${args.target} (bucket ${BUCKETS[args.target].bucket}).`,
  );
  for (const file of missing) deps.err(`  missing: ${file.absolutePath}`);

  if (args.dryRun) {
    deps.out("Dry run: nothing written.");
    return missing.length > 0 ? 1 : 0;
  }

  if (args.target === "local") {
    const { sink, close } = await deps.openLocalSink();
    try {
      const summary = await uploadToSink(files, sink, deps.out);
      deps.out(`Local R2: ${summary.uploaded} uploaded, ${summary.skipped} already there.`);
    } finally {
      await close();
    }
    return missing.length > 0 ? 1 : 0;
  }

  const commands = present.map((file) => remotePutArgs(args.target as Exclude<UploadTarget, "local">, file));
  if (!args.yes) {
    deps.out(`Not running anything against ${args.target} without --yes. Commands (run from apps/api):`);
    for (const command of commands) deps.out(`  ${formatCommand("pnpm", command)}`);
    deps.out(
      `Re-run with --yes to run them: pnpm --filter @fitbud/api media:upload-exercises -- --target ${args.target} --yes`,
    );
    return missing.length > 0 ? 1 : 0;
  }
  commands.forEach((command, index) => {
    deps.out(`[${index + 1}/${commands.length}] ${formatCommand("pnpm", command)}`);
    // runCommandSync exits the process on failure.
    deps.runRemote(command);
  });
  deps.out(`Uploaded ${commands.length} drawings to ${BUCKETS[args.target].bucket}.`);
  return missing.length > 0 ? 1 : 0;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.exit(await runUpload(process.argv.slice(2)));
}
