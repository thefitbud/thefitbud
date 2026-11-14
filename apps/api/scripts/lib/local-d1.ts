/** Helpers shared by the local reset and seed scripts (Z12-34). */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/** The one port db:reset probes for a running API: FITBUD_API_PORT, else the default 8787. */
export function apiPortToProbe(env: NodeJS.ProcessEnv): number {
  const port = Number(env.FITBUD_API_PORT);
  return Number.isInteger(port) && port > 0 ? port : 8787;
}

/**
 * The local D1 SQLite file under `<apiRoot>/.wrangler/state/v3/d1/miniflare-D1DatabaseObject`.
 * Throws when there is none, or more than one (for example after a local `--env staging` run):
 * writing to a guessed database would be worse than stopping.
 */
export function localD1File(apiRoot: string): string {
  const dir = path.join(apiRoot, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  const files = existsSync(dir)
    ? readdirSync(dir).filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
    : [];
  if (files.length === 0) {
    throw new Error("Local D1 database not found. Run pnpm db:reset first (migrations + library + demo).");
  }
  if (files.length > 1) {
    throw new Error(
      `Found ${files.length} local D1 databases in ${dir} (${files.join(", ")}). Not guessing which one to write to: ` +
        "run pnpm db:reset (it recreates the local state), or delete the extra file.",
    );
  }
  return path.join(dir, files[0]!);
}
